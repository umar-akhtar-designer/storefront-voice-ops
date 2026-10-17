# Contributing

Thanks for your interest in Storefront Voice Ops.

## Ground rules

- Main branch must always be deployable and green in CI.
- Small commits with clear messages. No dead code, no placeholder claims in docs.
- Every new tool or adapter ships with: a Zod schema, an LLM-oriented description, tests, a docs
  entry, and a path that is visible in the simulator trace.
- Never commit secrets. Use environment variables and keep `.env.example` current.

## Development

```bash
npm install
cp .env.example .env
npm run dev          # http://localhost:3000
npm run typecheck
npm run lint
npm test
```

## Pull requests

1. Create a branch: `git checkout -b feat/short-name`.
2. Make focused changes. Add or update tests.
3. Run `npm run typecheck && npm run lint && npm test`.
4. Open a PR describing what changed, how to verify it, and anything still open.

## Commit style

Short imperative subject lines, e.g. `feat(tools): add forecast_restock` or
`fix(auth): return 401 with WWW-Authenticate`.
