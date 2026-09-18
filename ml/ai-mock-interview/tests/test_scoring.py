import unittest

from interview_core.audio_features import VocalFeatures, score_vocal_confidence
from interview_core.debug_trace import build_trace
from interview_core.emotion import EmotionFrame, emotion_confidence
from interview_core.feedback import build_feedback
from interview_core.question_planner import QuestionPlanner
from interview_core.resume_keywords import ResumeKeywords, extract_keywords_locally
from interview_core.scoring import AnswerSignals, score_answer
from interview_core.transcript import Transcript, TranscriptSegment


class ResumeKeywordTests(unittest.TestCase):
    def test_local_extractor_prefers_repeated_terms(self):
        keywords = extract_keywords_locally("Python OpenCV Python interview confidence C")
        self.assertEqual(keywords.keywords[0], "python")

    def test_keyword_coverage(self):
        keywords = ResumeKeywords(("python", "opencv", "confidence"))
        self.assertAlmostEqual(keywords.coverage("Python confidence scoring"), 2 / 3)


class SignalScoringTests(unittest.TestCase):
    def test_vocal_score_prefers_clear_midrange(self):
        good = score_vocal_confidence(VocalFeatures(0.12, 145, 0.08))
        rushed = score_vocal_confidence(VocalFeatures(0.02, 230, 0.5))
        self.assertGreater(good, rushed)

    def test_emotion_post_processing(self):
        frame = EmotionFrame(0.0, {"neutral": 0.7, "happy": 0.3})
        self.assertGreater(emotion_confidence(frame), 0.6)

    def test_combined_answer_score(self):
        keywords = ResumeKeywords(("python", "opencv"))
        signals = AnswerSignals(
            transcript="Python and OpenCV were used for the vision layer.",
            vocal=VocalFeatures(0.12, 140, 0.1),
            emotion_frames=[EmotionFrame(0.0, {"neutral": 1.0})],
        )
        score = score_answer(
            keywords,
            signals,
        )
        self.assertGreater(score.combined, 0.7)
        self.assertEqual(build_trace(signals, score).notes[0].split()[0], "keyword_coverage")

    def test_feedback_marks_low_keyword_coverage(self):
        keywords = ResumeKeywords(("python", "opencv", "c"))
        score = score_answer(
            keywords,
            AnswerSignals(
                transcript="I worked on teamwork and communication.",
                vocal=VocalFeatures(0.12, 145, 0.1),
                emotion_frames=[EmotionFrame(0.0, {"neutral": 1.0})],
            ),
        )
        feedback = build_feedback(score)
        self.assertEqual(feedback[0].label, "resume coverage")
        self.assertEqual(feedback[0].severity, "high")

    def test_question_planner_uses_resume_keywords(self):
        questions = QuestionPlanner(ResumeKeywords(("python", "opencv", "audio"))).plan(2)
        self.assertIn("python", questions[0].prompt)
        self.assertEqual(questions[0].category, "resume-depth")

    def test_transcript_features(self):
        transcript = Transcript(
            (
                TranscriptSegment(0.0, 10.0, "Python OpenCV backend"),
                TranscriptSegment(13.0, 20.0, "C confidence buffer"),
            )
        )
        self.assertGreater(transcript.words_per_minute, 10)
        self.assertAlmostEqual(transcript.pause_ratio, 3 / 20)


if __name__ == "__main__":
    unittest.main()
