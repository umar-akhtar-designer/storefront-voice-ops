# Put the app online for everyone (Render, free tier)

Judges don't need this — the Devpost submission works with the video + the GitHub repo (anyone can
run `npm install && npm run dev` locally). But if you also want a public link that anyone can open,
this takes ~10 minutes on Render's free plan.

## 1. Push the repo (already done) and sign up at https://render.com

Use "Sign in with GitHub" so Render can see `storefront-voice-ops`.

## 2. Create the service

Dashboard → **New → Web Service** → pick the `storefront-voice-ops` repo:

| Setting       | Value                      |
| ------------- | -------------------------- |
| Runtime       | Node                       |
| Build command | `npm install && npm run build` |
| Start command | `npm start`                |
| Instance type | Free                       |

## 3. Persistent disk (keeps the demo store between restarts)

Service → **Disks → Add**:

- Name: `voice-data`
- Mount path: `/var/data`

## 4. Environment variables (Service → Environment)

| Key                        | Value                                                             |
| -------------------------- | ----------------------------------------------------------------- |
| `NODE_VERSION`             | `22`                                                              |
| `DB_PATH`                  | `/var/data/storefront.sqlite`                                      |
| `DEMO_MODE`                | `true` — gives judges a one-click "Reset demo" button               |
| `SHOPIFY_STORE_DOMAIN`     | `s0ddgv-1d.myshopify.com`                                          |
| `SHOPIFY_ADMIN_TOKEN`      | *(the current token from your local `.env`)*                        |
| `SHOPIFY_CURRENCY`         | `PKR`                                                             |
| `SHOPIFY_CLIENT_ID`        | `09b3a941000a77a4d0bc99617e383b1a`                                 |
| `SHOPIFY_CLIENT_SECRET`    | *(from the Shopify dev dashboard)*                                 |
| `CUSTOM_BASE_URL`          | `https://kapraa.pk/voice-api/voice-ops-api.php`                     |
| `CUSTOM_API_KEY`           | *(the kapraa key from your local `.env` / PHP file)*                |
| `CUSTOM_CURRENCY`          | `PKR`                                                             |

Render gives the service a public URL like `https://storefront-voice-ops.onrender.com` —
that link works for anyone, anywhere. The store picker switches between Bazaar Box, Kapraa.pk
and the Practice store exactly like on the laptop.

Notes:

- The free plan sleeps after 15 min idle; the first visit then takes ~40s to wake — click before
  a judging call, or upgrade ($7/mo) for always-on.
- Secrets stay inside Render's environment variables; they are never in the GitHub repo.
- Kapraa's PHP file already answers over HTTPS, and Render covers CORS for the browser.

## 5. One more judge-friendly flag (optional)

In `.env` or Render's variables, `DEMO_MODE=true` also enables `/api/demo/reset`, so a judge can
set the demo back to the opening state between sessions (the Practice-store data only).
