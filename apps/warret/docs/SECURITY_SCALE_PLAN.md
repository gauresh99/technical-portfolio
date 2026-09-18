# Warret Security And Scale Plan

## Current State

Warret is now a Supabase-backed Expo app for signed-in users. Supabase owns auth, profile rows, product rows, product categories, groups, group membership/activity, backups and private document storage. The app still keeps scoped local cache in AsyncStorage so the UI stays fast and can recover gracefully, but production data should be treated as Supabase-first.

Documents are stored in the private `warranty-documents` bucket under:

```text
{auth_user_id}/{product_id}/{safe_file_name}
```

The client stores only a `supabase://warranty-documents/...` pointer and requests short-lived signed URLs when a user views, downloads or shares a document.

## Immediate Security Rules

- Never ship provider secrets in `EXPO_PUBLIC_*` variables. Public Expo variables are client-visible.
- Run AI parsing only through an authenticated backend endpoint.
- Store documents in private object storage, never public buckets.
- Generate product, group, invite, user, and document IDs with cryptographic randomness or server UUIDs.
- Validate every uploaded document by MIME type and size before parsing or storing.
- Normalize filenames before writing to device or cloud storage.
- Treat all CSV, OCR, PDF, image, and AI output as untrusted input.

## Production Backend Shape

- Auth: Supabase Auth with email verification, OAuth, password reset, and MFA-ready sessions.
- Database: Postgres with Row Level Security enabled on every user-owned/shared table.
- Storage: private Supabase Storage bucket with signed URLs, short expiry, and object paths scoped by `user_id/product_id/file_name`.
- API: Supabase Edge Functions for AI parsing and future server jobs.
- Notifications: client-side scheduling works for device reminders; production email reminders and scheduled exports need a server-side queue/cron.

## Required Database Policies

- Users can read and update only their own profile row.
- Products require `auth.uid() = user_id`.
- Documents require ownership through the parent product path before a signed URL is generated.
- Groups require membership for reads.
- Group writes require role checks: host for deletes/settings, host or adder for product additions.
- Invites should use hashed tokens with expiry and optional one-time use.
- Audit tables should append membership, product, document, and permission changes.

## Scale Plan

- Paginate product and group lists at the API/database layer.
- Index `user_id`, `group_id`, `product_id`, `warranty_end`, and normalized search fields.
- Move smart search to server-side Postgres full-text search or a dedicated search service once datasets grow.
- Debounce client writes, but use server transactions for product + document + reminder saves.
- Store parsed document metadata separately from binary files.
- Use background jobs for OCR/AI parsing so large documents do not block the UI.

## Open Production Blockers

- Billing / Pro checkout needs a provider such as RevenueCat, Stripe Checkout, or App Store / Play Billing before the Pro button can charge users.
- Direct iCloud / Google Drive / Dropbox backup sync needs provider SDK setup. Current backup works through Supabase cloud backup and manual file export/import.
- Scheduled exports by email need a backend cron plus an email provider such as Resend, SendGrid, or AWS SES.
- Email inbox import needs public Gmail / Microsoft OAuth client IDs configured in `.env` and provider consoles.
- Store rating needs the final Apple App ID and Android package publishing target.
- Production universal links need `warret.app` hosting Apple App Site Association and Android Asset Links files.
- AI extraction needs the `extract-document` Edge Function deployed and backend-only model keys set as Supabase secrets.
