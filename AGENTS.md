# Codex repository context

Read only the context needed for the task.

1. Start with `docs/README.md` for authority and routing.
2. Read `docs/10-ai-coding/REPO_MAP.md` for ownership and dependency boundaries.
3. Run `pnpm context <query>` for an ID, feature, route, module, or folder. A
   folder query returns the complete active scope; it resolves trace-map links to
   relevant docs, tests, implementation files, and checks.
4. Read `docs/08-qa/trace-map.yml` when the change touches a traced use case or rule.
5. Treat `docs/archive/` as historical context only. It is excluded from context
   retrieval unless `--include-archive` is explicit.

Runtime, schema, contracts, and executable business rules outrank prose. Do not
read every document by default. Do not add another manually maintained module
index; update the existing routing sources when authority changes.

Use `pnpm context --json <query>` for machine-readable output. Fast validation:
`pnpm typecheck`, focused test tier, `pnpm docs:check`,
`pnpm trace:check`, and `git diff --check`. Use `pnpm verify` for the merge gate.
