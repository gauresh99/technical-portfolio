# Warret Go-Live Workflow

This is the working checklist for turning the current app into a production app.

## Already Wired In Code

- Supabase Auth for email/password and Google OAuth sessions.
- Per-account profile/settings storage.
- Products, product categories, groups, members, activity and backups through Supabase tables.
- Private Supabase Storage for warranty documents.
- Time-limited signed document links.
- Product import, document, verify and group join routes.
- Native PDF generation with `expo-print`.
- Device test notifications with `expo-notifications`.
- Secure backup/restore validation for untrusted backup files.
- Client-side fallback document parsing when the Edge Function is unavailable.

## What I Need From You

1. **Supabase project settings**
   - Need: confirmed Project URL, anon key, Auth redirect URLs, and migrations run.
   - Why: auth, database rows, document storage, backups and group sync all depend on Supabase RLS and Storage policies.

2. **Supabase Edge Function deployment**
   - Need: Supabase CLI access or for you to run `supabase functions deploy extract-document`.
   - Why: AI document extraction must run server-side so model keys are never exposed in Expo.

3. **Backend-only AI keys**
   - Need: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set as Supabase secrets, not `EXPO_PUBLIC_*`.
   - Why: public Expo env vars are visible in the app/browser bundle.

4. **Gmail / Microsoft OAuth client IDs**
   - Need: public OAuth client IDs and allowed redirect URIs in Google Cloud / Microsoft Entra.
   - Why: inbox warranty scan cannot work until providers trust Warret's redirect URLs.

5. **App Store / Play Store identities**
   - Need: final Apple App ID, Apple Team ID, Android package signing fingerprint and hosted `warret.app` files.
   - Why: ratings and universal links require store/domain verification.

6. **Email provider for server jobs**
   - Need: Resend, SendGrid, AWS SES or similar.
   - Why: scheduled exports and email reminders need backend cron plus outbound email.

7. **Billing provider choice**
   - Need: choose RevenueCat, Stripe, App Store / Play Billing, or keep Pro as waitlist.
   - Why: the Pro page is intentionally non-charging until checkout is legally and technically connected.

## Local Verification Loop

1. Run `npx tsc --noEmit`.
2. Start Expo with `npx expo start -c` or `npm run web`.
3. Sign up and verify a test email.
4. Add a product and upload a PDF/image.
5. Confirm product row in Supabase `products`.
6. Confirm document in Storage `warranty-documents/{user_id}/{product_id}`.
7. Open product page and test document view/download/share.
8. Create a group, generate a join link, and open it in a second tab.
9. Run backup, restore, export and test notification flows.
10. Check browser console for errors after each route.

## Current External Blockers

- Direct iCloud / Google Drive / Dropbox sync is not live; manual file export/import and Supabase cloud backup are live.
- Scheduled exports by email are not live until backend cron and an email provider are configured.
- Email inbox import is not live until OAuth client IDs are configured.
- Pro checkout is not live until a billing provider is chosen.
- Universal links are not production-live until `warret.app` hosts Apple/Android association files.
