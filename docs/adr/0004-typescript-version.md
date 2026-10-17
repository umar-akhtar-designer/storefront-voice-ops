# ADR 0004 — TypeScript pinned to 6.0.3 for tooling compatibility

- Status: Accepted
- Date: 2026-10-17

## Context

The brief requires ESLint in CI. npm's `latest` TypeScript is **7.0.2**, but the newest stable
`typescript-eslint` (**8.71.2**, and even its `canary` 8.71.3-alpha.10) declares
`peerDependencies: { typescript: ">=4.8.4 <6.1.0" }`. npm 11 fails an install that violates peer
ranges, so we cannot have both the newest TypeScript and a working lint setup.

## Decision

Pin **TypeScript to `6.0.3`** (the latest stable 6.x, inside the supported range) and keep
`typescript-eslint` at `8.71.2`. The language features we need (strict ESM, `NodeNext`, Zod) are all
available in 6.x.

## Consequences

- CI lint works today.
- When `typescript-eslint` declares support for TypeScript 7, we can bump the pin in one commit and
  re-run CI. Tracked as a follow-up, not a blocker.
- Recorded in `docs/friction-log.md` (FL-002).
