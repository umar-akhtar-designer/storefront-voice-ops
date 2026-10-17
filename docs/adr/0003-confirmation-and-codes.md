# ADR-0003: Confirmation gate and spoken codes for write actions

- Status: Accepted
- Date: 2026-10-17
- Stage: 2

## Context

A voice assistant that can ship orders, cancel orders, and change stock is dangerous: speech is
lossy, misheard words are common, and a wrong interpretation must never silently change the shop.
The hackathon brief requires a confirmation step for anything that writes, an audit trail, and a
stronger second check for destructive actions.

## Decision

1. **Two-phase writes.** A write tool never mutates data on its own. It persists a _pending action_
   (tool, target, input, spoken summary, TTL) and returns `confirmationRequired: true` with an
   `actionId`. Execution happens only through `confirm_action`.

2. **One pending action per session + target.** Creating a new pending action for the same
   session/tool/target cancels the older one, so a repeated request supersedes rather than stacks.

3. **Per-session isolation.** Confirmation is keyed by the MCP session id, so a "yes" in one session
   can never execute an action raised in another.

4. **TTL.** Pending actions expire (`CONFIRM_TTL_SECONDS`, default 120s). Expired actions cannot run
   and are recorded as expired.

5. **Idempotent confirmation.** Once an action is `confirmed`, a second `confirm_action` returns an
   "already done" result and does not execute again.

6. **Tiered strength.** Ordinary writes need a plain confirmation. Destructive or large-impact
   actions additionally require a **spoken code**:
   - `cancel_order`: always requires a code.
   - `adjust_inventory`: requires a code when `|delta| >= 50`.

7. **Audit everything.** `confirmation_created`, `confirmed`, `cancelled`, `expired`, `executed`, and
   `failed` are all written to `audit_log` with the actor, session, tool, input, and a summary.

## Consequences

- The model cannot change the store in a single tool call; every change is a deliberate, spoken yes.
- The simulator and Alexa+ both see the same confirm/cancel tools, so the UX is identical.
- The spoken code adds friction only where mistakes are expensive.
- `get_audit_log` gives the shop owner a plain-language history of what was changed and by whom.
