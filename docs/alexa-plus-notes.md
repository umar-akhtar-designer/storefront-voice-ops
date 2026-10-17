# Alexa+ / MCP integration notes

This file records **only what we have confirmed** about connecting an MCP server to Alexa+, plus
the open questions we still need to answer. Anything not confirmed here must not appear in the
README or the submission as a claim.

Last reviewed: 17 Oct 2026 (from the team brief's "verified facts" section; the primary source is
the Amazon Developer documentation for Alexa+ and MCP).

## Confirmed

- Alexa+ acts as the **MCP client**. Our server returns standard MCP responses; Alexa+ handles
  language understanding, response generation, and UI rendering.
- Alexa+ for Builders supports MCP spec **`2025-11-25`**.
- The server must support **Streamable HTTP** (the legacy HTTP+SSE transport is deprecated) and be
  reachable at a **remote public HTTPS URL**.
- We register with an **Alexa+ MCP add-on**, created and deployed with the **Alexa AI CLI**
  (`alexa-ai`):
  1. `alexa-ai configure` — log in with an Alexa developer account.
  2. `alexa-ai new mcp --name "Storefront Voice Ops" --locale en-US --mcp-server-url "https://<url>/mcp"`
     — the CLI introspects the server and scaffolds descriptions and example phrases.
  3. Review/improve the generated descriptions and example phrases (they affect request routing).
  4. `alexa-ai deploy` — redeploy after any tool or configuration change.
- Alexa+ also supports the **MCP Apps extension** (interactive UI rendered inside the conversation).
  This is a stretch goal.
- **Account linking is optional** and uses **OAuth 2.1 with PKCE (S256)**:
  - When a tool needs auth, our server returns HTTP **401 or 403**; Alexa starts linking, then sends
    the access token with each request.
  - Alexa sends a `resource` parameter equal to our MCP server's **canonical URI** in the
    authorization and token-exchange requests (not in refresh requests).
  - Alexa's redirect URIs are shown by `alexa-ai configure-account-linking`.

## Open questions (do not assume)

1. **Test access** — do hackathon participants get real Alexa+ access (device, app, or test harness)
   to run a real add-on? → Ask in the hackathon Discord; record the answer here.
2. **No-link demo** — does the add-on work **without** account linking for our public demo mode, and
   how do judges exercise it?
3. **Authorization server** — which authorization server will handle **PKCE S256 plus the `resource`
   parameter** the way Alexa needs? Candidate: Amazon Cognito (verify support before choosing),
   otherwise a small OAuth server library. Decision → `docs/adr/`.
4. **Resources page** — does the hackathon Resources page list a simulator or extra requirements for
   the Alexa+ track? → Read it logged in and transcribe anything relevant.
5. **MCP Apps** — can we use the MCP Apps extension to show the store panel inside the conversation?
   Stretch, after the core works.
6. **Devpost fields** — exact field names and character limits. → Fill the form once as a draft on
   day one and copy them into `docs/devpost-form-notes.md`.

## Current implementation stance

- The server implements **stateless Streamable HTTP** (a new `McpServer` and transport per request),
  matching the provided scaffold. We will confirm this works with a real Alexa+ add-on and the MCP
  Inspector, and switch to session mode if required. Decision recorded in `docs/adr/`.
- Until a real add-on can be tested, the **simulator** (`public/`) provides a working link for judges.
  The hackathon rules explicitly allow the simulator path.
