from __future__ import annotations

from dataclasses import dataclass

from .resume_keywords import ResumeKeywords


@dataclass(frozen=True)
class InterviewQuestion:
    prompt: str
    expected_keywords: tuple[str, ...]
    category: str


class QuestionPlanner:
    """Builds lightweight resume-specific questions.

    The original platform used the uploaded resume to personalize the interview.
    This planner keeps that idea concrete without claiming semantic LLM grading:
    keywords shape the questions, then answer scoring checks coverage.
    """

    def __init__(self, keywords: ResumeKeywords):
        self.keywords = keywords

    def plan(self, count: int = 5) -> list[InterviewQuestion]:
        selected = list(self.keywords.keywords[: max(1, count * 2)])
        questions: list[InterviewQuestion] = []
        for idx in range(count):
            pair = tuple(selected[idx * 2 : idx * 2 + 2])
            if not pair:
                pair = tuple(selected[:1])
            questions.append(
                InterviewQuestion(
                    prompt=self._prompt_for(idx, pair),
                    expected_keywords=pair,
                    category="resume-depth" if idx % 2 == 0 else "technical-clarity",
                )
            )
        return questions

    @staticmethod
    def _prompt_for(index: int, keywords: tuple[str, ...]) -> str:
        joined = " and ".join(keywords)
        if index % 2 == 0:
            return f"Walk me through a project where {joined} mattered."
        return f"Explain a technical tradeoff you made involving {joined}."

