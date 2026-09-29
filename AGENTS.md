# AGENTS.md

Guidance for OpenAI Codex (and any other agent that reads `AGENTS.md`) working in this repository.
`CLAUDE.md` is the single source of truth for how work is done here; read it first, then this file's
short list. It is not duplicated here so the two cannot drift.

1. Read `CLAUDE.md` (principles, where things live, commands, how work lands, working rules).
2. Read `docs/STATUS.md` (what every Step, Opp and PR label means, what is done and what is next), then the
   top of `docs/HANDOVER.md` (what shipped, most recent first).
3. Follow the PR order in `docs/consolidation/PLAN.md` § 3 and check its decisions table (§ 8) before
   choosing any number or wording.

Commands you will use most (all from the repo root):

```bash
npm run dev                                  # http://localhost:8080
npm run verify                               # lint + typecheck + Vitest + build: the bar for every PR
npx vitest run path/to/file.test.ts          # one unit test file
CHROMIUM_PATH=/path/to/chrome npm run test:e2e   # Playwright at 390 and 1024 px
```

The repo is public: keep secrets, keys and deployment URLs out of code, tests, fixtures and PR text.
