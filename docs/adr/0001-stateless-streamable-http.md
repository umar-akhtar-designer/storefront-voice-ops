# ADR 0001 — Stateless Streamable HTTP for the MCP endpoint

- Status: Accepted (revisit after a real Alexa+ add-on test)
- Date: 2026-10-17

## Context

The provided scaffold exposes `/mcp` over Streamable HTTP using the MCP SDK's stateless pattern:
a new `McpServer` and `StreamableHTTPServerTransport` (with `sessionIdGenerator: undefined`) are
created per request. Alexa+ supports MCP spec `2025-11-25` and Streamable HTTP.

## Decision

Keep the **stateless** pattern for now: no `Mcp-Session-Id` is issued, and every request is
self-contained.

## Consequences

- Simple horizontal scaling and no sticky sessions.
- The confirmation state machine cannot rely on transport sessions, so it will key pending actions
  by an explicit `session_id` supplied by the caller (or derived from the auth subject).
- We must confirm with the MCP Inspector and, if possible, a real Alexa+ add-on that stateless mode
  works. If Alexa+ requires session continuity, switch to session mode and record a new ADR.
