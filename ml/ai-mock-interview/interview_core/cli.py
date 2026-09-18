from __future__ import annotations

import argparse
from pathlib import Path

from .audio_features import VocalFeatures
from .emotion import EmotionFrame
from .scoring import AnswerSignals
from .session import InterviewSession


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("resume", type=Path)
    args = parser.parse_args()

    resume_text = args.resume.read_text(encoding="utf-8")
    session = InterviewSession(resume_text)
    signals = AnswerSignals(
        transcript="I built Python and OpenCV interview scoring with C data structures.",
        vocal=VocalFeatures(rms_volume=0.12, words_per_minute=142.0, pause_ratio=0.14),
        emotion_frames=[
            EmotionFrame(0.0, {"neutral": 0.7, "happy": 0.2, "fear": 0.1}),
            EmotionFrame(2.0, {"neutral": 0.6, "happy": 0.3, "sad": 0.1}),
        ],
    )
    score = session.score(signals)
    print("keywords:", ", ".join(session.keywords.keywords))
    print(f"answer score: {score.combined:.3f}")
    print(f"final score: {session.final_score():.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

