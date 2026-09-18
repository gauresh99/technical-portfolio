from __future__ import annotations

from dataclasses import dataclass, field

from .openai_resume_parser import ResumeKeywordProvider
from .question_planner import InterviewQuestion, QuestionPlanner
from .resume_keywords import ResumeKeywords
from .scoring import AnswerScore, AnswerSignals, score_answer


@dataclass
class InterviewSession:
    resume_text: str
    provider: ResumeKeywordProvider = field(default_factory=ResumeKeywordProvider)
    keywords: ResumeKeywords = field(init=False)
    scores: list[AnswerScore] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.keywords = self.provider.parse(self.resume_text)

    def score(self, signals: AnswerSignals) -> AnswerScore:
        result = score_answer(self.keywords, signals)
        self.scores.append(result)
        return result

    def questions(self, count: int = 5) -> list[InterviewQuestion]:
        return QuestionPlanner(self.keywords).plan(count)

    def final_score(self) -> float:
        if not self.scores:
            return 0.0
        return sum(score.combined for score in self.scores) / len(self.scores)
