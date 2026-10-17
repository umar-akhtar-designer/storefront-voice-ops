# AWS usage

This page describes exactly which AWS services the project uses and how. It is also the source for
the "AWS Builder" mini-challenge answer and the product feedback on AWS services.

## Implemented (Stage 1)

- **Amazon Bedrock (Runtime, Converse API)** — `src/bedrock.ts` uses `ConverseCommand` to phrase the
  spoken daily briefing. It is **off by default** (`USE_BEDROCK=0`) and falls back to a plain
  template when disabled or when the call fails. Model is configurable via `BEDROCK_MODEL_ID`
  (default `us.amazon.nova-lite-v1:0`), region via `AWS_REGION`. There is a `BEDROCK_KILL_SWITCH`
  flag to force Bedrock off regardless of `USE_BEDROCK`.

## Planned

- **Bedrock Converse API with tool use** for the simulator agent loop (max 4 iterations, per-call
  timeout, retry with backoff, token-usage logging). Implemented in `src/server.ts` (`runChat`).
- **Bedrock Guardrails** on drafted customer messages, if available in our region.
- **AWS Secrets Manager** for store credentials and tokens.
- **AWS App Runner** (or ECS Fargate) to host the service behind HTTPS.
- **Amazon ECR** for the container image.
- **AWS IAM** role limited to Bedrock invoke + Secrets Manager read.
- **Amazon CloudWatch** for logs and basic alarms.
- **AWS Budgets** alarm and the Bedrock kill switch for cost safety.

## Deployment (Stage 6 prep)

Deployment files are in [`deploy/`](../deploy/README.md):

- **Amazon ECR** — the deploy workflow pushes `storefront-voice-ops:<sha>`.
- **Amazon ECS Fargate** — one service running the container, behind an Application Load Balancer
  with an ACM certificate for the public `https` URL.
- **Amazon EFS** — mounted at `/app/data` so the SQLite confirmation/audit state survives task
  restarts (App Runner's ephemeral storage would lose it).
- **Amazon CloudWatch Logs** — container logs via the `awslogs` driver.
- **AWS IAM + GitHub OIDC** — the deploy workflow assumes a role with ECR push and ECS deploy
  permissions; no long-lived keys are stored in GitHub.
- `DEMO_MODE=1` exposes `POST /api/demo/reset` for the public (mock) demo only.

The actual deploy is blocked on an AWS account and model access; see
[`HUMAN_TASKS.md`](../HUMAN_TASKS.md).

## Product feedback (Stage 8)

For each service: what we used it for, what worked, what needs work, onboarding experience, and
whether we would build with it again. Specific and honest beats praise.

### Amazon Bedrock (Runtime, Converse)

- **Used for**: rephrasing briefings and drafted customer replies with Nova Lite; optional
  Guardrails; a configurable kill switch so cost can never exceed a demo budget.
- **What worked**: the Converse API is the right shape for tool use — one call signature covers
  messages, tool definitions, and tool results, so our agent loop stays short. Tool-choice control
  ("auto") worked exactly as needed for briefing assembly.
- **What needs work**: the TypeScript SDK's `ToolInputSchema` rejects a plain JSON Schema object, so
  every MCP server has to cast at the SDK boundary; tool results must be sent as `user`-role
  messages, which is unintuitive when every tutorial diagram shows a `tool` role
  (see friction log FL-008). Both would save a real afternoon for MCP integrators.
- **Onboarding**: enabling model access is still a multi-page flow for a first-time account. A
  single "start of demo grant" toggle (one model, one region, a spend cap) would make hackathon-style
  usage far easier.
- **Would we build with it again**: yes — with the kill switch and offline fallback kept exactly as
  we have them.

### Bedrock Guardrails

- **Used for**: a second layer behind our own injection filter when filtering drafted customer
  messages.
- **What worked**: the concept is right — per-application policy instead of per-model behaviour.
- **What needs work**: region availability varies; wiring guardrail IDs into Converse calls differs
  from the console's default flow. An "attach guardrail to the model access grant" step would remove
  the extra plumbing.
- **Would we build with it again**: yes, as defense in depth.

### ECS Fargate + EFS

- **Used for**: hosting the MCP server as one container task with the SQLite state volume on EFS.
- **What worked**: the design fits — a stateful session + audit store needs a real volume, and
  Fargate + EFS is the standard answer.
- **What needs work**: the join between "one service" and "get a public https URL" involves ALB,
  ACM, target groups, and security groups. A "Fargate + public domain" starter that just yields a
  URL would help voice-assistant projects that need one canonical `https` address quickly.
- **Would we build with it again**: yes.

### Amazon ECR

- **Used for**: storing the app image; the deploy workflow pushes `storefront-voice-ops:<sha>`.
- **What worked**: push worked exactly as documented; lifecycle policies are easy to set.
- **Would we build with it again**: yes.

### CloudWatch Logs

- **Used for**: structured JSONL request/audit logs from the container via the `awslogs` driver.
- **What worked**: minimal setup in the task definition; querying by log group is straightforward.
- **What needs work**: the insights query syntax takes some practice; a few more canned queries for
  newline-JSON logs would help.

### AWS IAM + GitHub OIDC

- **Used for**: short-lived deploy credentials from a GitHub Actions run.
- **What worked**: the OIDC trust pattern avoided long-lived keys entirely.
- **What needs work**: the trust-policy JSON for a specific repo+ref is fiddly to get right first
  time; a sample policy linked from the console would help.

### Where we stopped (defence of scope)

Secrets Manager is intentionally absent from the first cut: the demo and tests run on the mock
provider, and the deployed demo talks to the mock store too. Real store credentials are gathered via
the link flow after account linking, at which point Secrets Manager becomes the right home; this is
noted in `docs/architecture.md` and `deploy/README.md`.
