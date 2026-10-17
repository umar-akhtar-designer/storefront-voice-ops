# ADR 0002 — StoreAdapter abstraction with shared contract tests

- Status: Accepted
- Date: 2026-10-17

## Context

The product reads live data from different store platforms (Shopify, WooCommerce) and needs a
deterministic provider for tests and the public demo. Tools must not know which platform they talk to.

## Decision

Define a single `StoreAdapter` interface (`src/adapters/types.ts`) that all tools consume. Ship:

- `MockAdapter` — deterministic seed data with a configurable clock.
- `ShopifyAdapter` and `WooCommerceAdapter` (Stage 4).
- One **shared contract test suite** (`src/adapters/contract.ts`) that every adapter must pass.

Provider errors are mapped to typed errors (`NotFoundError`, `RateLimitedError`, `UnauthorizedError`,
`UpstreamError`, `ValidationError`), and adapters retry transient upstream failures with backoff.

## Consequences

- Tools stay platform-agnostic and get strong, uniform test coverage.
- The adapter code lives in the publishable `packages/store-adapters` npm workspace package
  (`@voice-ops/store-adapters`), in line with the Open Source mini challenge; the app imports it as
  a plain dependency and the shared adapter contract ships with it so third-party integrations are
  contract-tested too.
