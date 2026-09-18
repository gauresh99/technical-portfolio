# Gauresh Maheshwary Technical Portfolio

This repository is a clean portfolio workspace for projects referenced by my
embedded and ML/software resumes. Some original code was lost, so the repo is
explicit about provenance: surviving projects are copied from my local folders,
and lost-code projects are reconstructed from the resume audit, reports, and
public datasheets.

## Projects

| Project | Folder | Status | What it backs |
| --- | --- | --- | --- |
| BLDC DRV1098x motor bring-up | `firmware/bldc-drv1098x` | reconstructed | I2C speed/config register work, reverse exhaust modes, telemetry reads |
| Sakha wheelchair retrofit | `firmware/sakha-wheelchair` | reconstructed | HC-05 Bluetooth, Arduino PWM motor driver control, verified voice command flow |
| AI mock-interview platform | `ml/ai-mock-interview` | reconstructed | one-time resume keyword extraction, OpenCV-style emotion post-processing, vocal confidence scoring, C aggregation buffer |
| Warret warranty vault | `apps/warret` | surviving app folder | warranty storage, expiry timeline, Supabase backend, document extraction pipeline |
| Personal style bot | `apps/personal-style-bot` | surviving app folder | local wardrobe product app, rules engine, local-first browser storage |

## Integrity notes

- ECE 385 and ECE 391 coursework code is not included because publishing it would
  create academic-integrity risk. The projects can be discussed in interviews,
  but code from those classes should remain private.
- Reconstructed projects are labeled as reconstructed. They are written to match
  the verified technical claims, not to simulate old git history.
- Proprietary internship data, exact motor parameters, and company artifacts are
  intentionally omitted.
- AI-assisted app work is labeled where relevant. The portfolio claims focus on
  decisions and components I can explain under questioning.

## Quick checks

```bash
make test
```

That runs the host-side tests for the reconstructed BLDC driver, Sakha gateway,
AI mock-interview scoring, the native confidence buffer, and the Personal Bot
logic tests.

## Resume alignment

See `docs/resume-claim-map.md` for the line-by-line mapping from public resume
claims to repository contents and omissions.

For size/context, see `docs/repo-size.md`. The app folders carry most of the
line count; reconstructed lost-code folders are deeper than stubs, but are not
padded to fake original history.
