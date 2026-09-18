# Warret Supabase Setup

This project is now structured so Supabase owns auth, product data, groups, reminders metadata, categories and private document storage.

## What the app code does

- Uses one shared Supabase client in `src/lib/supabase.ts`.
- Uses Supabase Auth for signup, login, persistent sessions and profile loading.
- Stores products in `public.products` and renders the app from those rows.
- Stores product categories in `public.product_categories`.
- Stores group data in `public.groups`, `public.group_members`, `public.group_products` and `public.group_activities`.
- Uploads product documents to the private `warranty-documents` Storage bucket at:

```text
{auth_user_id}/{product_id}/{safe_file_name}
```

The app stores only the Supabase storage pointer in product document metadata. When a user views, shares or downloads a document, the app asks Supabase for a short-lived signed URL.

## Your Supabase workflow

1. Create a Supabase project.
2. Go to `Project Settings -> API`.
3. Copy the Project URL and public anon key.
4. Create or update `.env` in this project:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```

5. Go to `SQL Editor -> New query`.
6. Paste the full contents of `supabase/schema.sql`.
7. Run it once. This creates tables, RLS policies, helper functions and the private Storage bucket.
8. Go to `Authentication -> Providers -> Email` and keep email/password enabled.
9. Add app redirect URLs in Supabase Auth settings:

```text
http://localhost:8081
http://localhost:8081/auth
http://localhost:8081/import
http://localhost:8081/document
http://localhost:8081/verify
http://localhost:8081/join
http://localhost:8081/reset-password
warret://
warret://auth/callback
warret://import
warret://document
warret://verify
warret://join
warret://reset-password
```

10. Restart Expo so env vars are bundled:

```bash
npm run web
```

## Deep links and app links

The app registers the custom scheme `warret://` and the production domain `https://warret.app` for:

```text
/import
/document
/verify
/join
```

Before App Store / Play Store release, replace the bundle/package values in `app.json` if needed and host the required Apple App Site Association / Android Asset Links files on `warret.app`.

## Optional email import setup

Gmail and Outlook import need public OAuth client IDs:

```bash
EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_WEB=...
EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_IOS=...
EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_ANDROID=...
EXPO_PUBLIC_MS_OAUTH_CLIENT_ID=...
```

Use read-only mail scopes only. Do not put OAuth client secrets in the Expo app. Configure redirect URLs for both the local web origin and the native `warret://` scheme in Google Cloud Console / Microsoft Entra.

## Test checklist

1. Sign up with a fresh email.
2. Confirm the email if Supabase requires confirmation.
3. Log in.
4. Add a product.
5. Upload a PDF or image document.
6. Confirm a row exists in `public.products`.
7. Confirm the file exists in `Storage -> warranty-documents -> {user_id}`.
8. Open the product page and test document download/share.
9. Create a group and confirm rows appear in `groups`, `group_members` and `group_activities`.

## Security notes

- Never expose the Supabase service role key inside Expo or any client app.
- Keep RLS enabled on every user-owned table.
- The Storage bucket must stay private. Public document buckets would expose invoices and warranty documents.
- File uploads are limited to PDFs and images, with a 15 MB bucket limit.
- Production AI parsing should run through an Edge Function or backend service, not direct vendor API keys in the client.
