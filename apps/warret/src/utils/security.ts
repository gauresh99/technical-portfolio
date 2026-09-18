export function randomToken(bytes = 16): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef?.getRandomValues) {
    const values = new Uint8Array(bytes);
    cryptoRef.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
  }
  return Array.from({ length: bytes }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
}

export function createEntityId(prefix: string): string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  return `${prefix}_${randomUUID ? randomUUID() : randomToken(18)}`;
}

export function sanitizeFileName(fileName: string, fallback = 'document'): string {
  const clean = fileName
    .trim()
    .replace(/[\\/:\0]/g, '-')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  return clean || fallback;
}

export function isAllowedDocumentType(mimeType = ''): boolean {
  return mimeType === 'application/pdf' || mimeType.startsWith('image/');
}

export function validateDocumentUpload(asset: { mimeType?: string; size?: number; fileSize?: number; name?: string; fileName?: string }) {
  const mimeType = asset.mimeType || '';
  const size = asset.size ?? asset.fileSize ?? 0;
  const fileName = sanitizeFileName(asset.name || asset.fileName || 'document');
  const maxBytes = 15 * 1024 * 1024;

  if (!isAllowedDocumentType(mimeType)) {
    return { ok: false as const, reason: 'Upload a PDF or image document.' };
  }
  if (size > maxBytes) {
    return { ok: false as const, reason: 'Document is too large. Upload files under 15 MB.' };
  }
  return { ok: true as const, fileName, mimeType };
}
