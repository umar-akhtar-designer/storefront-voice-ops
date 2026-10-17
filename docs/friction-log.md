# Friction log

Real obstacles hit while building, logged **when they happened**, never invented. Format per entry:
**Task · Steps · Expected vs actual · Severity (blocker/high/medium/low) · Workaround · Suggestion.**

Up to a 10% judging bonus is available for genuine entries.

---

## FL-001 — Reading the team brief from a macOS `.textClipping`

- **Task:** Read and follow the full team brief that was shared as `Pasted 17-10-2026 at 11.17.59.textClipping`.
- **Steps:** Tried to open the file directly; the Read tool reported a binary file. Tried
  `textutil -convert txt ... -stdout`, which printed a binary `bplist00` header followed by raw HTML.
- **Expected vs actual:** Expected a plain text/markdown file. Actual: a macOS binary plist wrapping
  an HTML ("public.html") payload.
- **Severity:** low
- **Workaround:** Extracted the embedded `<!DOCTYPE ...>` HTML with a small Python snippet, stripped
  the tags, and unescaped entities to produce readable markdown.
- **Suggestion:** Share briefs as plain `.md` or `.txt` to keep them diffable and tool-friendly.

---

## FL-002 — TypeScript 7 is the npm `latest`, but typescript-eslint does not support it yet

- **Task:** Add a working ESLint setup (required by the brief: "ESLint, Prettier" and "lint in CI").
- **Steps:** `npm view typescript version` → `7.0.2` (npm `latest`). `npm view typescript-eslint version`
  → `8.71.2`; its `peerDependencies` are `typescript: ">=4.8.4 <6.1.0"`.
- **Expected vs actual:** Expected the latest linter to support the latest TypeScript. Actual: the
  newest stable `typescript-eslint` (and even its `canary` `8.71.3-alpha.10`) still declares TS `<6.1.0`,
  so an install with TypeScript 7.0.2 raises a peer-dependency conflict (npm 11 fails on peer conflicts).
- **Severity:** medium
- **Workaround:** Pinned `typescript` to the latest supported stable, `6.0.3`, and documented the
  choice in `docs/adr/0004-typescript-version.md`.
- **Suggestion:** Either ship a `typescript-eslint` release that declares support for TypeScript 7,
  or have npm surface a clearer "unsupported TypeScript major" message. A language-version support
  matrix in the TypeScript release notes would also help.

---

## FL-003 — MCP SDK version must be pinned exact for spec `2025-11-25`

- **Task:** Pin the MCP SDK to a version that lists protocol `2025-11-25`.
- **Steps:** `npm view @modelcontextprotocol/sdk version` → `1.32.1`.
- **Expected vs actual:** The scaffold used a caret range (`^1.32.1`). The brief requires an **exact**
  pin (no caret) and a committed lockfile so the protocol version cannot drift.
- **Severity:** low
- **Workaround:** Changed the dependency to the exact `1.32.1` and will commit `package-lock.json`.
- **Suggestion:** Document the supported protocol version per SDK release in the changelog so teams do
  not have to inspect the package to find it.

---

## FL-004 — Vitest 5 fails to start: rolldown native binding missing (npm optional-dependencies bug)

- **Task:** Run the test suite (`npm test`) with Vitest 5.
- **Steps:** `npm install` completed cleanly (0 vulnerabilities), then `npm test` aborted at startup
  with `Error: Cannot find native binding` / `Cannot find module '@rolldown/binding-wasm32-wasi'`.
  `node_modules/@rolldown` contained only `pluginutils`, not the `binding-darwin-arm64` package.
- **Expected vs actual:** Expected the platform-specific optional dependency to be installed on
  macOS arm64. Actual: npm skipped it (the well-known optional-dependency resolution bug,
  npm/cli#4828), so the bundler Vitest 5 depends on couldn't load its native binding.
- **Severity:** high (blocks the whole test suite)
- **Workaround:** `rm -rf node_modules package-lock.json && npm install`, which reinstalled the
  optional `@rolldown/binding-darwin-arm64`. Tests then passed (27/27).
- **Suggestion:** npm should reliably install platform optional dependencies, or Vitest should
  detect the missing binding and print the exact remediation command. Pinning the binding as a
  direct optional dependency of the tool would also help.

---

## FL-005 — TypeScript 7 / typescript-eslint (see FL-002) has a follow-on: build output layout

- **Task:** Configure `tsc` to emit a runnable `dist/` for `npm start`.
- **Steps:** Added `src/` and `test/` to `include` with `rootDir: "."`, so output lands in
  `dist/src/...` and `dist/test/...`. The non-TypeScript asset `src/db/schema.sql` is not emitted by
  `tsc`, so the compiled server could not read its schema.
- **Expected vs actual:** Expected `tsc` to copy `.sql` assets. Actual: `tsc` only emits JS/d.ts.
- **Severity:** low
- **Workaround:** Added `scripts/copy-assets.mjs` and chained it in the `build` script to copy
  `src/db/schema.sql` into `dist/src/db/schema.sql`.
- **Suggestion:** A first-class "copy these non-TS assets to outDir" option in `tsconfig` would avoid
  a bespoke build step.

---

## FL-006 — MCP Inspector requires Node ≥22.19, stricter than the "Node 22" baseline

- **Task:** Install and run the MCP Inspector (required for Stage 1 and for verifying tools over
  Streamable HTTP).
- **Steps:** Added `@modelcontextprotocol/inspector@2.11.0` and ran `npm install`. npm printed
  `EBADENGINE` for the transitive `undici@8.12.2` which requires `node >=22.19.0`; the local runtime
  is `22.14.0`.
- **Expected vs actual:** The brief specifies "Node 22" as the baseline. Actual: the Inspector's
  dependency needs a newer 22.x patch level than the machine has. Runtime still worked (Inspector
  printed its version), but the engine range is unsatisfied.
- **Severity:** low
- **Workaround:** Kept it as a dev-only dependency; the app itself runs on Node 22.14. On CI we use
  the latest Node 22.x, which satisfies `>=22.19.0`.
- **Suggestion:** Document the exact minimum Node patch version for the Inspector in its README so
  teams do not discover it via an `EBADENGINE` warning.

---

## FL-007 — Stateless MCP cannot carry a confirmation across two calls

- **Task:** Implement a confirmation gate ("ship order 1042" → owner says "yes") on MCP Streamable
  HTTP.
- **Steps:** Built the write tools to create a pending action on the first call and execute it on
  `confirm_action`. In the scaffold's **stateless** transport (`sessionIdGenerator: undefined`) every
  request built a brand-new `McpServer`, so the "yes" arrived with no session identity.
- **Expected vs actual:** Expected the SDK to offer a session id even in stateless mode, or a
  documented way to correlate two requests. Actual: stateless mode issues no `Mcp-Session-Id`, and
  there is no `session_id` on the request params to key on, so the confirmation raised in call 1 was
  invisible in call 2.
- **Severity:** blocker (for the core feature)
- **Workaround:** Switched `/mcp` to **stateful** Streamable HTTP (`sessionIdGenerator: () =>
randomUUID()`), one server+transport per session, and keyed pending actions by the session id.
  Recorded in ADR-0005 (supersedes ADR-0001). Also handled `GET`/`DELETE /mcp` and made
  non-initialize requests without a session id return `400`.
- **Suggestion:** The transport docs would help by spelling out the exact session-continuity
  contract (header name, when it is issued, and what a server should do for a missing/unknown id);
  the current guidance is spread across the spec and example servers.

---

## FL-008 — Bedrock Converse SDK types reject the MCP JSON Schema without a cast

- **Task:** Feed `tools/list` output straight into Bedrock Converse `toolConfig` for the agent loop.
- **Steps:** Mapped each MCP tool to `{ toolSpec: { name, description, inputSchema: { json:
t.inputSchema } } }`. `t.inputSchema` is a `Record<string, unknown>` JSON Schema from the MCP SDK.
- **Expected vs actual:** Expected it to assign to `ToolConfiguration`. Actual: `tsc` errored — the
  AWS SDK models these unions with a `$UnknownMember` variant and expects `ToolInputSchema.json` to
  be a specific `JsonValue`-like type, so a plain `Record<string, unknown>` matches no member and the
  assignment fails with "Property '$unknown' is missing".
- **Severity:** medium
- **Workaround:** Cast the schema at the boundary (`json: t.inputSchema as any`) and keep the rest of
  the loop typed; AWS SDK inputs are validated at runtime anyway. Also corrected the tool-result role:
  Converse expects tool results as a `user` message containing `toolResult` blocks, not a `tool` role.
- **Suggestion:** Export a public helper that converts a JSON Schema object into `ToolInputSchema`, or
  loosen `json` to `unknown` at the SDK boundary, to avoid every caller reaching for a cast.

---

## FL-009 — Playwright's headless browser is a second, separately-downloaded artifact

- **Task:** Add real browser end-to-end tests for the simulator (`npm run test:e2e`).
- **Steps:** Installed `@playwright/test` and ran `npx playwright install chromium`. The command ran
  for several minutes and was interrupted by a timeout; `~/Library/Caches/ms-playwright` then had
  `chromium-1248` but **not** `chromium_headless_shell-1248`. Running the tests failed with
  "Executable doesn't exist at .../chromium_headless_shell-1248/...".
- **Expected vs actual:** Expected `chromium` to be everything needed to run headless. Actual:
  modern Playwright runs headless via a separate **Chrome Headless Shell** download, so a partially
  finished `install chromium` leaves a half-working state with a clear-but-surprising error.
- **Severity:** medium
- **Workaround:** Re-ran `npx playwright install chromium` in the background and let it finish; the
  headless-shell artifact (99 MiB) downloaded and all three tests then passed. CI uses
  `npx playwright install --with-deps chromium`, which fetches both artifacts in one step.
- **Suggestion:** Have `install chromium` print the two artifacts it will fetch up front, and make
  the "executable doesn't exist" error say explicitly that the _headless shell_ sub-download was
  missing (it does hint at `npx playwright install`, but not why a prior install was insufficient).

---

## FL-010 — Node 22.14 vs 22.19: a second tooling package with the same `>=22.19` floor (see FL-006)

- **Task:** `npm install -D @playwright/test` on the Node 22.14.0 runtime.
- **Steps:** Install completed, but npm printed `EBADENGINE` for the transitive `undici@8.12.2`
  (`node >=22.19.0`), the same package that flagged the MCP Inspector in FL-006.
- **Expected vs actual:** Expected "Node 22" to be a single supported baseline. Actual: multiple
  common dev tools pull `undici` 8.x, which requires a newer 22.x patch, so the machine's 22.14
  sits below several tools' real floor.
- **Severity:** low
- **Workaround:** None needed — it is a warning, and both tools run. CI uses `node-version: 22`
  (latest 22.x), which satisfies the floor, so the warning does not appear there.
- **Suggestion:** Align the brief's "Node 22" with a minimum patch (22.19+) and have npm group and
  summarise repeated `EBADENGINE` warnings for the same package instead of printing one per parent.
