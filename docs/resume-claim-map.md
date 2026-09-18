# Resume Claim Map

This file maps the public portfolio folders to the verified claims in the resume
audit. It is intentionally conservative: if a claim cannot be backed by code or
source evidence, it is marked as omitted or reconstructed.

## BLDC Motor Control Systems Intern

Resume claim:

- Characterized a commercial BLDC ceiling-fan motor for TI DRV10983/DRV10987
  sensorless drivers.
- Wrote C and assembly to set speed and configuration registers over I2C.
- Validated closed-loop speed-control behavior on hardware.
- Enabled multi-speed reverse exhaust and mapped current draw by speed.

Repository backing:

- `firmware/bldc-drv1098x/include/drv1098x.h`
- `firmware/bldc-drv1098x/src/drv1098x.c`
- `firmware/bldc-drv1098x/src/drv1098x_faults.c`
- `firmware/bldc-drv1098x/src/register_script.c`
- `firmware/bldc-drv1098x/target/cycle_wait.S`
- `firmware/bldc-drv1098x/tools/current_map.py`
- `firmware/bldc-drv1098x/docs/bringup-notes.md`
- `firmware/bldc-drv1098x/tests/test_drv1098x.c`

Boundaries:

- No six-step commutation claim. The TI driver performs sensorless sinusoidal
  commutation internally.
- No EEPROM programming claim. The code includes runtime register writes only.
- No exact current numbers, because the audit says those measured values were
  not recovered.

## Sakha Wheelchair Converter

Resume claim:

- Built a manual-to-motorized wheelchair retrofit kit.
- Used Arduino, HC-05 Bluetooth, Android, and an external motor driver.
- Gated voice commands on speaker verification, with English and Hindi speech
  command support.

Repository backing:

- `firmware/sakha-wheelchair/firmware/sakha_controller.ino`
- `firmware/sakha-wheelchair/gateway/sakha/`
- `firmware/sakha-wheelchair/android/BluetoothCommandLink.kt`
- `firmware/sakha-wheelchair/docs/debug-notes.md`
- `firmware/sakha-wheelchair/docs/protocol.md`

Boundaries:

- The code uses brushed DC motor-driver control, not BLDC.
- The specific speaker-verification API is not named because it was not
  recovered.
- Geofencing and autonomous navigation are omitted because they were researched
  future ideas, not verified build scope.

## AI Mock-Interview Platform

Resume claim:

- Built a real-time mock-interview platform scoring answers against keywords
  generated from an uploaded resume via the OpenAI API.
- Integrated a pretrained facial-emotion classifier and mapped emotion outputs
  into confidence signals.
- Built vocal scoring over volume, speaking rate, and pause behavior.
- Used C for real-time confidence aggregation.

Repository backing:

- `ml/ai-mock-interview/interview_core/openai_resume_parser.py`
- `ml/ai-mock-interview/interview_core/scoring.py`
- `ml/ai-mock-interview/interview_core/emotion.py`
- `ml/ai-mock-interview/interview_core/audio_features.py`
- `ml/ai-mock-interview/interview_core/question_planner.py`
- `ml/ai-mock-interview/interview_core/feedback.py`
- `ml/ai-mock-interview/interview_core/debug_trace.py`
- `ml/ai-mock-interview/native/confidence_buffer.c`
- `ml/ai-mock-interview/docs/debug-notes.md`

Boundaries:

- No per-answer LLM grading.
- No semantic answer evaluation claim.
- No fine-tuned emotion model claim.
- The collaborator-owned frontend is not reconstructed.

## Warret

Audit claim:

- Warranty vault app with warranties, expiry timeline, storage, and intended
  expansion into extended-warranty connections.
- The defensible technical claim is product/data-structure and backend decisions,
  not authorship of every AI-generated UI detail.

Repository backing:

- `apps/warret/src/store/products.tsx`
- `apps/warret/src/services/documentExtraction.ts`
- `apps/warret/supabase/schema.sql`
- `apps/warret/docs/FEATURE_AUDIT.md`

Boundaries:

- README labels AI coding assistance.
- Backend secrets stay out of the client and out of this repo.

## Personal Style Bot

Audit claim:

- Local personal wardrobe app that classifies clothes by practical attributes,
  recommends outfits, and exposed a product-ML failure around fit classification.
- Included as product work and local-first app exploration, not as computer
  vision research evidence.

Repository backing:

- `apps/personal-style-bot/js/recommender.js`
- `apps/personal-style-bot/js/fashion.js`
- `apps/personal-style-bot/js/cv.js`
- `apps/personal-style-bot/test/engine.test.js`

Boundaries:

- README includes a portfolio note that this is not being presented as model
  training or model-selection work.
