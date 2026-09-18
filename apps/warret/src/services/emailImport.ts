/**
 * EmailImportService — connect Gmail / Outlook with OAuth (PKCE, read-only
 * scopes, no client secrets) and scan the inbox for warranty/invoice emails
 * with PDF attachments, parsed locally by parseWarrantyDocument.
 *
 * OAuth design:
 * - expo-auth-session `AuthRequest` built manually (usable from a service —
 *   the useAuthRequest hook is component-only), authorization-code + PKCE.
 * - Redirect: AuthSession.makeRedirectUri({ scheme: 'warret' }) — the app
 *   scheme on native, the site origin on web.
 * - Tokens: expo-secure-store on native (Keychain/Keystore). On web tokens
 *   live IN MEMORY ONLY — SecureStore is unavailable there and localStorage
 *   is readable by any injected script (XSS), so persisting OAuth tokens in
 *   it would be a real credential-theft vector. Users reconnect per session.
 */
import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { parseWarrantyDocument, type ParsedWarranty } from './warrantyParser';

// Completes the pending web popup handshake after the OAuth redirect.
// No-op on native.
WebBrowser.maybeCompleteAuthSession();

// ─── Config (public client IDs only — never secrets) ──────────────────────────

// Platform-specific IDs win; the generic one is the fallback. process.env
// EXPO_PUBLIC_* vars are inlined by the bundler, so they must be referenced
// with full literal names.
const googleClientId =
  Platform.select({
    ios: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_IOS,
    android: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_ANDROID,
    web: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_WEB,
    default: undefined,
  }) || process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || '';

const msClientId = process.env.EXPO_PUBLIC_MS_OAUTH_CLIENT_ID || '';

export const isGmailConfigured = Boolean(googleClientId);
export const isOutlookConfigured = Boolean(msClientId);

export type EmailProvider = 'gmail' | 'outlook';

export function isProviderConfigured(provider: EmailProvider): boolean {
  return provider === 'gmail' ? isGmailConfigured : isOutlookConfigured;
}

// ─── OAuth endpoints (stable, hardcoded to avoid a discovery round-trip) ─────

const DISCOVERY: Record<EmailProvider, AuthSession.DiscoveryDocument> = {
  gmail: {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  },
  outlook: {
    authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  },
};

const SCOPES: Record<EmailProvider, string[]> = {
  gmail: ['https://www.googleapis.com/auth/gmail.readonly', 'openid', 'email'],
  outlook: ['Mail.Read', 'offline_access', 'openid', 'email'],
};

const clientIdFor = (provider: EmailProvider) => (provider === 'gmail' ? googleClientId : msClientId);

// ─── Token storage ────────────────────────────────────────────────────────────

export type StoredEmailToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  email: string;
};

const TOKEN_KEYS: Record<EmailProvider, string> = {
  gmail: 'warret.emailtok.gmail',
  outlook: 'warret.emailtok.outlook',
};

// Web fallback: memory only. See the header comment for why NOT localStorage.
const memoryTokens = new Map<string, StoredEmailToken>();
const isNative = Platform.OS !== 'web';

async function getSecureStore() {
  return import('expo-secure-store');
}

async function saveToken(provider: EmailProvider, token: StoredEmailToken): Promise<void> {
  if (!isNative) {
    memoryTokens.set(TOKEN_KEYS[provider], token);
    return;
  }
  const SecureStore = await getSecureStore();
  await SecureStore.setItemAsync(TOKEN_KEYS[provider], JSON.stringify(token));
}

async function loadToken(provider: EmailProvider): Promise<StoredEmailToken | null> {
  if (!isNative) return memoryTokens.get(TOKEN_KEYS[provider]) || null;
  try {
    const SecureStore = await getSecureStore();
    const raw = await SecureStore.getItemAsync(TOKEN_KEYS[provider]);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEmailToken;
    return typeof parsed?.accessToken === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

async function clearToken(provider: EmailProvider): Promise<void> {
  memoryTokens.delete(TOKEN_KEYS[provider]);
  if (!isNative) return;
  try {
    const SecureStore = await getSecureStore();
    await SecureStore.deleteItemAsync(TOKEN_KEYS[provider]);
  } catch {
    // best effort — nothing sensitive remains if the key was never written
  }
}

/** Thrown when the saved token is expired and cannot be refreshed. */
export class ReconnectNeededError extends Error {
  constructor(provider: EmailProvider) {
    super(provider === 'gmail' ? 'Gmail access expired — reconnect the account.' : 'Outlook access expired — reconnect the account.');
    this.name = 'ReconnectNeededError';
  }
}

async function getValidAccessToken(provider: EmailProvider): Promise<StoredEmailToken> {
  const stored = await loadToken(provider);
  if (!stored) throw new ReconnectNeededError(provider);
  if (stored.expiresAt > Date.now() + 30_000) return stored;

  if (!stored.refreshToken) throw new ReconnectNeededError(provider);
  try {
    const refreshed = await AuthSession.refreshAsync(
      { clientId: clientIdFor(provider), refreshToken: stored.refreshToken },
      DISCOVERY[provider],
    );
    const next: StoredEmailToken = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || stored.refreshToken,
      expiresAt: Date.now() + (refreshed.expiresIn ?? 3600) * 1000 - 60_000,
      email: stored.email,
    };
    await saveToken(provider, next);
    return next;
  } catch {
    throw new ReconnectNeededError(provider);
  }
}

// ─── Connect / disconnect ─────────────────────────────────────────────────────

async function fetchAccountEmail(provider: EmailProvider, accessToken: string): Promise<string> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  if (provider === 'gmail') {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers });
    if (!res.ok) throw new Error('Could not read the Gmail profile.');
    const json = await res.json();
    return typeof json?.emailAddress === 'string' ? json.emailAddress : 'Gmail account';
  }
  const res = await fetch('https://graph.microsoft.com/v1.0/me', { headers });
  if (!res.ok) throw new Error('Could not read the Outlook profile.');
  const json = await res.json();
  return (typeof json?.mail === 'string' && json.mail) || (typeof json?.userPrincipalName === 'string' && json.userPrincipalName) || 'Outlook account';
}

async function connect(provider: EmailProvider): Promise<{ email: string }> {
  const clientId = clientIdFor(provider);
  if (!clientId) throw new Error('Email import needs OAuth client IDs — see .env.example.');

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'warret' });
  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: SCOPES[provider],
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true, // code + verifier; public client, NO secret anywhere
    extraParams: provider === 'gmail'
      // Google only issues a refresh token with offline access + explicit consent.
      ? { access_type: 'offline', prompt: 'consent' }
      : {},
  });

  const result = await request.promptAsync(DISCOVERY[provider]);
  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('Connection cancelled.');
  }
  if (result.type !== 'success' || !result.params.code) {
    throw new Error('Could not connect the account. Please try again.');
  }

  const tokens = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier || '' },
    },
    DISCOVERY[provider],
  );

  const email = await fetchAccountEmail(provider, tokens.accessToken);
  await saveToken(provider, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + (tokens.expiresIn ?? 3600) * 1000 - 60_000,
    email,
  });
  return { email };
}

// ─── Inbox scanning ───────────────────────────────────────────────────────────

export type EmailCandidate = {
  subject: string;
  from: string;
  date: string;
  fileName: string;
  parsed: ParsedWarranty;
};

export type ScanProgress = (message: string) => void;

const MAX_MESSAGES = 15;
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024; // ~20 MB per scan
const EMPTY_PARSE: ParsedWarranty = { name: null, brand: null, warrantyEnd: null, warrantyStart: null };

const base64UrlToBase64 = (data: string) => {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return b64 + '='.repeat((4 - (b64.length % 4)) % 4);
};

/**
 * Parses a base64 PDF locally. Native RN cannot fetch() data: URIs, so the
 * bytes are staged as a cache file there; web uses the data URI directly.
 * Parse failures degrade to empty fields — the candidate is still shown.
 */
async function parsePdfBase64(base64: string, fileName: string): Promise<ParsedWarranty> {
  try {
    if (Platform.OS === 'web') {
      return await parseWarrantyDocument(`data:application/pdf;base64,${base64}`, 'application/pdf');
    }
    const FileSystem = await import('expo-file-system/legacy');
    const path = `${FileSystem.cacheDirectory || ''}warret-email-scan-${Date.now()}.pdf`;
    await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
    try {
      return await parseWarrantyDocument(path, 'application/pdf');
    } finally {
      FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
    }
  } catch {
    return EMPTY_PARSE;
  }
}

type GmailPart = {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; size?: number };
  parts?: GmailPart[];
};

function findPdfParts(part: GmailPart | undefined, found: GmailPart[] = []): GmailPart[] {
  if (!part) return found;
  const name = part.filename || '';
  if (part.body?.attachmentId && (part.mimeType === 'application/pdf' || name.toLowerCase().endsWith('.pdf'))) {
    found.push(part);
  }
  for (const child of part.parts || []) findPdfParts(child, found);
  return found;
}

const header = (headers: Array<{ name?: string; value?: string }> | undefined, name: string) =>
  headers?.find((h) => (h.name || '').toLowerCase() === name.toLowerCase())?.value || '';

async function scanGmail(onProgress?: ScanProgress): Promise<EmailCandidate[]> {
  const token = await getValidAccessToken('gmail');
  const headers = { Authorization: `Bearer ${token.accessToken}` };
  const base = 'https://gmail.googleapis.com/gmail/v1/users/me';

  onProgress?.('Searching your inbox…');
  const q = encodeURIComponent('(warranty OR invoice OR receipt OR guarantee) has:attachment newer_than:1y');
  const listRes = await fetch(`${base}/messages?q=${q}&maxResults=${MAX_MESSAGES}`, { headers });
  if (!listRes.ok) throw new Error('Gmail search failed. Please try again.');
  const list = await listRes.json();
  const ids: string[] = (list.messages || []).map((m: { id: string }) => m.id).filter(Boolean);

  const candidates: EmailCandidate[] = [];
  let attachmentBudget = MAX_TOTAL_ATTACHMENT_BYTES;

  for (let i = 0; i < ids.length; i++) {
    onProgress?.(`Checking email ${i + 1} of ${ids.length}…`);
    try {
      const msgRes = await fetch(`${base}/messages/${ids[i]}`, { headers });
      if (!msgRes.ok) continue;
      const msg = await msgRes.json();
      const subject = header(msg.payload?.headers, 'Subject') || '(no subject)';
      const from = header(msg.payload?.headers, 'From');
      const date = header(msg.payload?.headers, 'Date');

      const pdfPart = findPdfParts(msg.payload)[0];
      if (!pdfPart?.body?.attachmentId) continue;
      const size = pdfPart.body.size || 0;
      if (size > attachmentBudget) continue;

      const attRes = await fetch(`${base}/messages/${ids[i]}/attachments/${pdfPart.body.attachmentId}`, { headers });
      if (!attRes.ok) continue;
      const att = await attRes.json();
      if (typeof att.data !== 'string') continue;
      attachmentBudget -= att.size || size || att.data.length;

      const fileName = pdfPart.filename || 'attachment.pdf';
      onProgress?.(`Reading ${fileName}…`);
      const parsed = await parsePdfBase64(base64UrlToBase64(att.data), fileName);
      candidates.push({ subject, from, date, fileName, parsed });
    } catch {
      // one bad email must not kill the scan
    }
  }
  return candidates;
}

async function scanOutlook(onProgress?: ScanProgress): Promise<EmailCandidate[]> {
  const token = await getValidAccessToken('outlook');
  const headers = { Authorization: `Bearer ${token.accessToken}` };
  const base = 'https://graph.microsoft.com/v1.0/me';

  onProgress?.('Searching your inbox…');
  const search = encodeURIComponent('"warranty OR invoice OR receipt OR guarantee"');
  const select = '$select=id,subject,from,receivedDateTime,hasAttachments';
  const listRes = await fetch(`${base}/messages?$search=${search}&$top=${MAX_MESSAGES}&${select}`, { headers });
  if (!listRes.ok) throw new Error('Outlook search failed. Please try again.');
  const list = await listRes.json();
  const messages: any[] = Array.isArray(list.value) ? list.value : [];

  const candidates: EmailCandidate[] = [];
  let attachmentBudget = MAX_TOTAL_ATTACHMENT_BYTES;

  for (let i = 0; i < messages.length; i++) {
    onProgress?.(`Checking email ${i + 1} of ${messages.length}…`);
    try {
      const msg = messages[i];
      if (!msg?.id || msg.hasAttachments === false) continue;
      const subject = msg.subject || '(no subject)';
      const from = msg.from?.emailAddress?.address || '';
      const date = msg.receivedDateTime || '';

      const attRes = await fetch(`${base}/messages/${msg.id}/attachments`, { headers });
      if (!attRes.ok) continue;
      const atts = await attRes.json();
      const pdf = (Array.isArray(atts.value) ? atts.value : []).find(
        (a: any) =>
          a?.['@odata.type'] === '#microsoft.graph.fileAttachment' &&
          typeof a.contentBytes === 'string' &&
          (a.contentType === 'application/pdf' || String(a.name || '').toLowerCase().endsWith('.pdf')),
      );
      if (!pdf) continue;
      const size = pdf.size || pdf.contentBytes.length;
      if (size > attachmentBudget) continue;
      attachmentBudget -= size;

      const fileName = pdf.name || 'attachment.pdf';
      onProgress?.(`Reading ${fileName}…`);
      const parsed = await parsePdfBase64(pdf.contentBytes, fileName);
      candidates.push({ subject, from, date, fileName, parsed });
    } catch {
      // one bad email must not kill the scan
    }
  }
  return candidates;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const EmailImportService = {
  connectGmail: () => connect('gmail'),
  connectOutlook: () => connect('outlook'),

  /** Removes stored tokens and best-effort revokes access at the provider. */
  async disconnect(provider: EmailProvider): Promise<void> {
    const stored = await loadToken(provider);
    if (stored && provider === 'gmail') {
      // Google supports simple token revocation; Microsoft has no public
      // client revoke endpoint — the token simply expires (Mail.Read only).
      const revoke = (t?: string) =>
        t
          ? fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: 'POST' }).catch(() => {})
          : Promise.resolve();
      await Promise.all([revoke(stored.accessToken), revoke(stored.refreshToken)]);
    }
    await clearToken(provider);
  },

  /** Scans the connected inbox for warranty-like PDFs. Throws
   *  ReconnectNeededError when the saved token cannot be refreshed. */
  scanInbox(provider: EmailProvider, onProgress?: ScanProgress): Promise<EmailCandidate[]> {
    return provider === 'gmail' ? scanGmail(onProgress) : scanOutlook(onProgress);
  },
};
