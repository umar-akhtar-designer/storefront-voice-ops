# ADR-0005: Stateful MCP sessions for confirmation continuity

- Status: Accepted
- Date: 2026-10-17
- Stage: 2
- Supersedes: the "stateless for now" note in ADR-0001

## Context

ADR-0001 chose the SDK's stateless Streamable HTTP pattern to get an endpoint running quickly. That
is fine for read-only tools, but the confirmation gate (ADR-0003) needs a stable notion of "the same
conversation" between the request that raises an action and the later "yes" that confirms it.

A stateless transport gives every request a fresh server with no session id, so the confirmation
raised in one request would be invisible to the next.

## Decision

Run the MCP endpoint in **stateful Streamable HTTP** mode:

- One `StreamableHTTPServerTransport` + `McpServer` per session, created on `initialize` and keyed by
  the `mcp-session-id` header (`sessionIdGenerator: () => randomUUID()`).
- Requests carrying a known session id are routed to that session's transport; non-initialize
  requests without a session id return `400`; unknown session ids return `404`.
- The session id is passed into the tool context and used as the confirmation key, so a pending
  action is visible across calls **within** a session and invisible **across** sessions.
- `GET`/`DELETE /mcp` are handled by the transport for the server-to-client stream and session
  termination. Unsupported methods return `405`.

Confirmation state itself lives in SQLite (`pending_actions`, `audit_log`), not in memory, so it
survives a process restart and any future multi-instance deployment that shares the database.

## Consequences

- The "ship it… yes" flow works across separate tool calls, which is the whole point of the demo.
- Session isolation is a security property we can test directly (a second session cannot confirm
  another session's action).
- The server keeps one McpServer per live session in memory; for the demo scale this is trivial.
- The simulator's own MCP client is a single long-lived connection, so its confirmations survive
  across chat turns.
