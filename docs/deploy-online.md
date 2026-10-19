# Put the app online for everyone (Render, free tier)

> **IMPORTANT — public = demo data only.** The app is single-operator (no user accounts): anyone
> opening the public URL is treated as the store owner. So on any public instance, connect **only
> the Practice store (pretend data) — never your real Bazaar Box / Kapraa credentials**, or every
> visitor could read your real orders and stock. Your real stores stay on YOUR laptop (which has
> no public URL) and in the demo video; judges who want to verify real connections run `npm run dev`
> locally with their own `.env`.

Judges don't need a public link — the Devpost submission works with the video + the GitHub repo
(anyone can run `npm install && npm run dev` locally). But if you also want a public "try it now"
link, this takes ~10 minutes on Render's free plan.

## 1. Push the repo (already done) and sign up at https://render.com

Use "Sign in with GitHub" so Render can see `storefront-voice-ops`.

## 2. Create the service

Dashboard → **New → Web Service** → pick the `storefront-voice-ops` repo:

| Setting       | Value                          |
| ------------- | ------------------------------ |
| Runtime       | Node                           |
| Build command | `npm install && npm run build` |
| Start command | `npm start`                    |
| Instance type | Free                           |

## 3. Persistent disk (keeps the demo store between restarts)

Service → **Disks → Add**:

- Name: `voice-data`
- Mount path: `/var/data`

## 4. Environment variables (Service → Environment)

For a **public try-it-now link**, set only these — real stores stay off it:

| Key            | Value                                          |
| -------------- | ---------------------------------------------- |
| `NODE_VERSION` | `22`                                           |
| `DB_PATH`      | `/var/data/storefront.sqlite`                  |
| `DEMO_MODE`    | `true` — gives a one-click "Reset demo" button |

The Practice store is seeded automatically; visitors talk to pretend data. Do **not** add the
`SHOPIFY_*` / `CUSTOM_*` variables on the public instance.

If you instead want a private instance on a paid plan, the same table also works with the real
store credentials added (`SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_CLIENT_ID`,
`SHOPIFY_CLIENT_SECRET`, `CUSTOM_BASE_URL`, `CUSTOM_API_KEY`, `CUSTOM_CURRENCY` = `PKR`) — but
never on a publicly shared URL.
