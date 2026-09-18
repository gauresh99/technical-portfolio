# Repository Size Snapshot

This repository is not tiny: the surviving app folders carry most of the code.
The reconstructed lost-code projects are intentionally smaller because they are
written to support verified claims without fabricating old history.

Approximate source/document lines after reconstruction:

- Total counted source and Markdown lines: more than 25,000.
- Warret: the largest codebase, mostly Expo/React Native, Supabase, and SQL.
- Personal Style Bot: local browser app with recommender, CV heuristics, local
  model, RL taste model, and tests.
- Reconstructed projects: compact but now include driver code, tests, debug
  notes, register tooling, protocol simulation, scoring traces, and feedback
  modules.

To refresh the count:

```bash
find . -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.py' -o -name '*.c' -o -name '*.h' -o -name '*.ino' -o -name '*.kt' -o -name '*.sql' -o -name '*.css' -o -name '*.html' -o -name '*.md' \) -not -path './.git/*' -not -path '*/node_modules/*' -print0 | xargs -0 wc -l
```

The goal is not maximum line count. The goal is that each visible line supports
something the resume can defend.

