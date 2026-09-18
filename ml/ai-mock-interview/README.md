# AI Mock Interview Platform

This is a reconstructed backend for the freshman-year mock-interview platform.
The original project code was lost, and the collaborator-owned frontend is not
included. The goal here is to make the technical architecture defensible and
readable rather than to pretend these are the original files.

## What the platform does

1. Parse an uploaded resume once to build a candidate-specific keyword list.
2. Run each answer through low-cost local scoring:
   - transcript keyword coverage
   - vocal confidence features
   - facial-emotion post-processing
3. Store frame-by-frame confidence values in a small C ring buffer.
4. Aggregate answer and session scores for feedback.

## What this code does not claim

- No per-answer LLM grading.
- No semantic answer scoring.
- No fine-tuned emotion classifier.
- No claim that the JavaScript frontend was my component.

## Why this architecture

In 2023-2024, per-answer hosted model calls were too expensive for a real-time
student project. The expensive model call is used once, where it matters most:
turning the resume into an expected keyword list. Everything downstream can run
with local logic and inexpensive APIs.

## Run tests

```bash
python3 -m unittest discover tests
make test-native
```

## Demo

```bash
python3 -m interview_core.cli examples/resume.txt
```

If no API key is configured, the parser falls back to a deterministic local
keyword extractor so the demo remains runnable.

