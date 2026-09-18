from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass


STOPWORDS = {
    "and",
    "the",
    "for",
    "with",
    "from",
    "that",
    "this",
    "into",
    "using",
    "built",
    "worked",
    "project",
    "experience",
    "education",
    "university",
}


@dataclass(frozen=True)
class ResumeKeywords:
    keywords: tuple[str, ...]

    def coverage(self, transcript: str) -> float:
        if not self.keywords:
            return 0.0
        text = transcript.lower()
        hits = sum(1 for kw in self.keywords if re.search(rf"\b{re.escape(kw)}\b", text))
        return hits / len(self.keywords)


def extract_keywords_locally(resume_text: str, limit: int = 16) -> ResumeKeywords:
    words = re.findall(r"[A-Za-z][A-Za-z0-9+#.-]{2,}", resume_text.lower())
    filtered = [w for w in words if w not in STOPWORDS and not w.isdigit()]
    counts = Counter(filtered)
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return ResumeKeywords(tuple(word for word, _count in ranked[:limit]))

