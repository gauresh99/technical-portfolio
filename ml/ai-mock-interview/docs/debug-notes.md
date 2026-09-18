# Mock Interview Debug Notes

These are reconstructed notes for the platform architecture. They are not
claimed as the original project log.

## Core design constraint

Per-answer hosted model calls were too expensive for the 2023-2024 student
prototype. The platform therefore used the expensive API once, during resume
parsing, and kept live answer scoring cheap.

## Debugging the scoring pipeline

1. Resume parsing
   - Expected output is a compact keyword list.
   - If the API is unavailable, deterministic local extraction keeps the session
     runnable.

2. Speech transcript
   - Transcript text feeds keyword coverage.
   - Segment timing feeds speaking rate and pause ratio.

3. Facial-emotion layer
   - A pretrained classifier supplies emotion probabilities.
   - The project-owned layer maps those probabilities into confidence signals.
   - No fine-tuning claim is made.

4. Vocal-confidence layer
   - Volume, speaking rate, and pause behavior are interpretable.
   - The feedback should say what to improve, not expose a mysterious score.

5. C aggregation buffer
   - Frame/answer confidence values are bounded to `0..1`.
   - The ring buffer keeps constant memory and supports session-level summaries.

## Anti-overclaim checklist

- Do not call this semantic answer grading.
- Do not call this LLM answer grading.
- Do not say the facial-emotion model was fine-tuned.
- Do not name Google Speech-to-Text as the implemented provider.
- Do say the system was personalized by resume-derived expected keywords.

