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

## Product feedback (to be completed in Stage 8)

One section per service with: what we used it for, what worked, what needs work, onboarding
experience, and whether we would build with it again. Being specific and honest scores higher than
praise.
