from __future__ import annotations

import json
import os
import urllib.request

from .resume_keywords import ResumeKeywords, extract_keywords_locally


class ResumeKeywordProvider:
    """One-call resume keyword provider with a deterministic local fallback."""

    def __init__(self, api_key: str | None = None, model: str = "gpt-4o-mini"):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model

    def parse(self, resume_text: str) -> ResumeKeywords:
        if not self.api_key:
            return extract_keywords_locally(resume_text)

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Extract 12 concise technical interview keywords from the resume. "
                        "Return only JSON: {\"keywords\": [..]}."
                    ),
                },
                {"role": "user", "content": resume_text},
            ],
            "temperature": 0,
        }
        req = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                body = json.loads(response.read().decode("utf-8"))
            content = body["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            keywords = tuple(str(x).lower().strip() for x in parsed.get("keywords", []) if str(x).strip())
            return ResumeKeywords(keywords[:16]) if keywords else extract_keywords_locally(resume_text)
        except Exception:
            return extract_keywords_locally(resume_text)

