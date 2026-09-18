# Warret Feature Audit

Last updated: 2026-07-06

## Live Locally / In App

- Email/password auth, Google OAuth session handling, password reset, resend verification and per-account settings.
- Product add/edit/delete, CSV import, product categories and demo empty-state product.
- Product detail pages with documents, coverage, support, extended warranty, share, PDF export and reminders.
- Document upload to private Supabase Storage when signed in, with local fallback when signed out.
- Document view/download/share via resolved file URI or short-lived Supabase signed URL.
- Product import links, verify links and document links.
- Group creation, group products, members, roles, activities, settings and join links backed by Supabase.
- Supabase cloud backup, backup file export and validated restore.
- Settings search, themes, profile settings, storage/cache actions and rating fallback.
- Device test notifications on native.

## Partially Live

- **Email inbox import:** code supports Gmail and Outlook OAuth + read-only inbox scan, but it needs provider OAuth client IDs before users can connect accounts.
- **AI document extraction:** client calls a Supabase Edge Function when deployed and falls back locally when unavailable. It needs backend-only model keys set as Supabase secrets.
- **Scheduled exports:** UI/config exists and manual exports work. Automatic scheduled delivery needs backend cron and an email provider.
- **Cloud drive backup providers:** Supabase cloud backup and manual file backup work. Direct iCloud/Google Drive/Dropbox sync needs native/provider SDK work if we want first-class branded sync.
- **Store rating:** native in-app review can work in production builds. Direct store links need final Apple App ID and Android package listing.
- **Pro:** benefits/waitlist UI exists. Charging users needs a billing provider and legal/pricing setup.

## Security Fixes Applied During This Pass

- Replaced unsafe raw back navigation with explicit safe route fallbacks.
- Moved `EditGuardProvider` around the root navigator so public/deep-link pages do not crash when navigating into app routes.
- Added `/join` to Android app link handling and setup docs.
- Hardened document signed URL generation so a stored Supabase URI must match the current signed-in user's `{userId}/{productId}/{fileName}` path.
- Hardened backup restore by rejecting unsafe IDs and stripping stored document URI pointers from untrusted JSON.
- Updated security/setup docs to match the current Supabase-backed architecture.

## Smoke Tests Run

- `npx tsc --noEmit` passes.
- `app.json` parses successfully.
- Browser route smoke test passed with no console errors:
  - `/settings`
  - `/import?product=bad`
  - `/document?u=http://bad.test/file.pdf`
  - `/verify?product=bad`
  - `/join?token=fake`
- Direct `/terms` back arrow returns to `/settings` without the unhandled `GO_BACK` warning.

## Needed From Gauresh

- Supabase Edge Function deploy and secrets for AI extraction.
- Gmail / Outlook OAuth client IDs and provider redirect URL setup.
- A decision on billing provider for Pro.
- Store identifiers for rating links and universal link association files.
- Email provider choice for scheduled exports and email reminders.
