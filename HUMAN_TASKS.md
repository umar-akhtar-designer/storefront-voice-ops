# Human tasks

Items that need a person with credentials, accounts, or authority that an automated agent does not
have. Everything here is a **blocker for the stage noted**, but not for the code that already works
against the mock provider. Check items off as they are done.

## Accounts and access

- [ ] **Create the public GitHub repo** and push `main`. The first commit already exists locally.
      Until this is done the "Open Source" mini-challenge and the public judge link have no URL.
      _(Owner: Lead)_
- [ ] **AWS account + billing alarm**, then **enable Bedrock model access** for the chosen models
      (Claude 3.x / Amazon Nova) in the deployment region. Needed for Stage 3 (real Bedrock) and
      Stage 6 (deploy). _(Owner: AWS owner)_
- [ ] **Shopify development store** with at least 15 products and 20 orders, plus a custom-app Admin
      API access token (scopes: `read_orders`, `write_orders`, `read_products`, `write_products`,
      `read_customers`). Needed for Stage 4. _(Owner: Backend)_
- [ ] **WooCommerce test site** with REST API keys (read/write). Needed for Stage 4. _(Owner: Backend)_
- [ ] **Alexa developer account** login for the `alexa-ai` console, to test the MCP add-on and record
      the demo. Needed for Stage 6 + Stage 8. _(Owner: Lead)_

## Decide / provide

- [ ] **Domain for the public demo** (or confirm we deploy to an AWS-provided URL). Sets
      `MCP_CANONICAL_URI`, which must be `https` for Alexa+ account linking. _(Owner: Lead)_
- [ ] **FAQ answers to confirm** (recorded in `docs/alexa-plus-notes.md`): hackathon Alexa+ test
      access; whether the Resources page lists extra Alexa+ requirements; the Devpost form fields and
      limits. _(Owner: Lead, ask in the hackathon Discord)_

## Submission (Stage 8)

- [ ] **Record the demo video** (≈3 min) following `docs/demo-script.md`.
- [ ] **Fill in the Devpost submission** (description, tech list, links, feedback form) and **submit**
      before 24 Oct 2026, 12:00 am GMT+5. _(Owner: Lead)_

## Notes

- The server runs fully in `demo` mode on the mock provider with no external accounts, so judges can
  always use it even while the items above are outstanding.
- When any item is completed, note it here and in `STATUS.md`.
