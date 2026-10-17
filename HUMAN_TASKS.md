# Human tasks

Items that need a person with credentials, accounts, or authority that an automated agent does not
have. Everything here is a **blocker for the stage noted**, but not for the code that already works
against the mock provider. Check items off as they are done.

## Accounts and access

- [x] ~~Create the public GitHub repo~~ — done 2026-10-17: **https://github.com/umar-akhtar-designer/storefront-voice-ops** (public, main pushed, `.env` ignored).
      Until this is done the "Open Source" mini-challenge and the public judge link have no URL.
      _(Owner: Lead)_
- [ ] **AWS account + billing alarm**, then **enable Bedrock model access** for the chosen models
      (Claude 3.x / Amazon Nova) in the deployment region. Needed for Stage 3 (real Bedrock) and
      Stage 6 (deploy). _(Owner: AWS owner)_
- [ ] **Shopify development store** with at least 15 products and 20 orders, plus a custom-app Admin
      API access token (scopes: `read_orders`, `write_orders`, `read_products`, `write_products`,
      `read_customers`). Needed for Stage 4. _(Owner: Backend)_
- [ ] **WooCommerce test site** with REST API keys (read/write). Connector is code-complete
      (contract-tested); it will need the `ck_/cs_` keys from any WordPress admin to go live.
      The connection hand-out is `docs/store-connection-guide.md`.
- [ ] **Rotate secrets shared in chat** (good hygiene, not blocking): the kapraa.pk MySQL
      password and the Shopify tokens were discussed with the store owner. After the demo
      window: rotate the Hostinger DB password (update `config.php` + `voice-ops-api.php`),
      re-mint the Shopify client-credentials token (24h expiry anyway), and update the local
      `.env`. The custom API key (`voiceops_a7f3…`) can be rotated by editing one line in the
      uploaded `voice-ops-api.php`.
- [ ] **Alexa developer account** login for the `alexa-ai` console, to test the MCP add-on and record
      the demo. Needed for Stage 6 + Stage 8. _(Owner: Lead)_

## Decide / provide

- [ ] **Verify the container build** (`docker compose up --build`) on a machine with the Docker
      daemon running. The agent environment had no running daemon, so the Dockerfile and
      `.dockerignore` are written but were only validated by `npm run build`, not by an actual
      image build. _(Owner: any dev with Docker)_
- [ ] **Domain for the public demo** (or confirm we deploy to an AWS-provided URL). Sets
      `MCP_CANONICAL_URI`, which must be `https` for Alexa+ account linking. _(Owner: Lead)_
- [ ] **FAQ answers to confirm** (recorded in `docs/alexa-plus-notes.md`): hackathon Alexa+ test
      access; whether the Resources page lists extra Alexa+ requirements; the Devpost form fields and
      limits. _(Owner: Lead, ask in the hackathon Discord)_

## Submission (Stage 8)

- [ ] **Record the demo video** (≈3 min) following `docs/demo-script.md` (works fully offline with
      `DEMO_MODE=1`; Act 5 needs Bedrock model access).
- [ ] **Fill in the Devpost submission** from the ready-made copy in `docs/devpost-submission.md`
      (paste each section; fill the `<placeholder>` links) and **submit** before 24 Oct 2026,
      12:00 am GMT+5. _(Owner: Lead)_
- [ ] **Paste the AWS/Bedrock product feedback** from `docs/aws-usage.md` into the required form if
      the challenge asks for it on the submission page. _(Owner: Lead)_

## Notes

- The server runs fully in `demo` mode on the mock provider with no external accounts, so judges can
  always use it even while the items above are outstanding.
- When any item is completed, note it here and in `STATUS.md`.
