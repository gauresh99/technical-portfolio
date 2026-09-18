# Warret

Warret is a warranty vault built with Expo, React Native, and Supabase. The app
stores product warranties, organizes them by expiry, supports groups and backups,
and can extract warranty details from uploaded documents through a Supabase Edge
Function with a local parser fallback.

## What this project demonstrates

- Product and warranty data model with a soonest-expiring-first timeline.
- Supabase Auth, row-level-security migrations, and realtime group sync.
- Secure client/server split for document extraction: model keys stay in Edge
  Function secrets, not in the Expo client.
- Local fallback parsing for signed-out or offline document extraction.
- Account deletion, backup/export, email import, and grouped shared warranties.

## Run

```bash
npm install
npm run web
```

Copy `.env.example` to `.env` and fill only public Expo values. Backend-only keys
belong in Supabase secrets.

## Useful docs

- `docs/FEATURE_AUDIT.md` lists implemented and remaining features.
- `docs/SUPABASE_SETUP.md` explains database setup.
- `docs/DOCUMENT_EXTRACTION.md` describes the extraction pipeline.
- `docs/SECURITY_SCALE_PLAN.md` records the security model and scaling notes.

## Honest scope note

This is a personal app built with AI coding assistance. The core claim I make
from it is product architecture and defensible data-structure/backend decisions,
not that every UI line was hand-authored.

