# Deploying Storefront Voice Ops

The whole app is **one container**: an Express server that serves the MCP endpoint, the health
checks, the simulator UI, and the demo controls. Deployment is therefore simple, and the public
demo runs the **mock provider** so no real store is ever touched.

> **Status:** the deployment files here are ready, but the actual deploy is **waiting on an AWS
> account, Bedrock model access, and a domain** (see [`HUMAN_TASKS.md`](../HUMAN_TASKS.md)). Nothing
> in this folder has been run against a real account yet, and nothing here claims otherwise.

## What you need

- An AWS account in one region (this repo assumes `us-east-1`).
- The container image in Amazon ECR.
- A place to run it. Two supported shapes:
  - **ECS Fargate** (recommended): a service + task definition, with an EFS volume for the SQLite
    file so confirmation state survives restarts. Template: [`aws/ecs-task-definition.json`](aws/ecs-task-definition.json).
  - **App Runner**: simplest, but its local storage is ephemeral, so pending confirmations are lost
    on every deploy. Fine for a demo, not for a live store.
- A public `https` URL. It becomes `MCP_CANONICAL_URI` and must be `https` for Alexa+ account linking.

## Steps (ECS Fargate)

1. **Create the ECR repository**

   ```bash
   aws ecr create-repository --repository-name storefront-voice-ops
   ```

2. **Create the log group**

   ```bash
   aws logs create-log-group --log-group-name /ecs/storefront-voice-ops
   ```

3. **Create an EFS file system** (mount target in your VPC), then put its id into
   `ecs-task-definition.json` (`EFS_FILE_SYSTEM_ID`) and replace `ACCOUNT_ID` everywhere.

4. **Create the IAM roles** referenced by the task definition:
   - `storefront-voice-ops-execution` — the ECS task execution role (pull image, write logs).
   - `storefront-voice-ops-task` — the task role (only needed if you enable Bedrock; add
     `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` then).

5. **Create the cluster and service**

   ```bash
   aws ecs create-cluster --cluster-name storefront-voice-ops
   aws ecs register-task-definition --cli-input-json file://deploy/aws/ecs-task-definition.json
   aws ecs create-service --cluster storefront-voice-ops \
     --service-name storefront-voice-ops --task-definition storefront-voice-ops \
     --desired-count 1 --launch-type FARGATE \
     --network-configuration 'awsvpcConfiguration={subnets=[...],securityGroups=[...],assignPublicIp=ENABLED}'
   ```

6. **Put it behind an ALB** with an ACM certificate for your `https` domain. Point the ALB listener
   at the service's port `3000`. Set `MCP_CANONICAL_URI=https://<domain>/mcp`.

## Continuous deployment

`.github/workflows/deploy.yml` builds and pushes the image and rolls the ECS service. It is gated on
the repository variable `AWS_DEPLOY == 'true'`, so it is a no-op until you configure:

- **Variables:** `AWS_DEPLOY=true`, `AWS_REGION`, `ECR_REPOSITORY`, `ECS_CLUSTER`, `ECS_SERVICE`.
- **Secret:** `AWS_DEPLOY_ROLE_ARN` — an IAM role GitHub Actions assumes via OIDC
  (`id-token: write` is already set). The role needs ECR push and `ecs:UpdateService` /
  `ecs:RegisterTaskDefinition` / `iam:PassRole`.

## Environment for the public demo

```env
NODE_ENV=production
HOST=0.0.0.0
AUTH_MODE=demo
DEMO_MODE=1
ALLOWED_ORIGINS=*
STORE_PROVIDER=mock
DB_PATH=/app/data/storefront.sqlite
USE_BEDROCK=0
```

`DEMO_MODE=1` exposes `POST /api/demo/reset`, which reseeds the mock store and clears pending
actions and the audit log. **Never** enable `DEMO_MODE` on a real store.

## Local container check

```bash
docker compose up --build
curl -s localhost:3000/healthz
curl -s -X POST localhost:3000/api/demo/reset
```
