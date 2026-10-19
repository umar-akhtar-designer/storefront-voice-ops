# Voice Ops API kit — for a PHP + MySQL custom website

The connection point is just **one PHP file**: `voice-ops-api.php`.

What it does: your website exposes 7 private JSON endpoints so the voice/browser
operator app can see orders and stock, and (after a spoken "yes") ship, cancel
and restock. Nothing public on your website changes.

## Install on Hostinger (10 minutes)

1. **Upload the file** — Hostinger panel → File Manager → open `public_html`
   → create folder `voice-api` → upload `voice-ops-api.php` into it.
2. **Database config** — open the file in the editor and fill the `DATABASE
CONFIG` block at the top:
   - `DB_NAME`, `DB_USER`, `DB_PASS` — copy the same values your site already
     uses (they are in your site's existing config file, e.g. `config.php` /
     `db.php`, or in Hostinger → Databases list).
3. **API key** — invent a long random secret, e.g.
   `voiceops_a7f3b91c44e2d806f5a1b2c3d4e5f607`, and paste it into `API_KEY`.
   This is the only permission the API has — never use your site admin password.
4. **Table names** — your DB may name tables differently (`orders` vs
   `ws_orders`, `tbl_orders`, …). Fill the `$T` array with the real names, or:
   - upload with guessed names first, open in the browser with your key:
     `https://your-domain.com/voice-api/voice-ops-api.php/tables`
   - it prints the real columns of each configured table (or NOT FOUND if the
     name is wrong) — use it to fix the `$T` block.
5. **Tell the operator two things:**
   - API URL: `https://your-domain.com/voice-api/voice-ops-api.php`
   - API key (send by a private channel, never in a screenshot)

## What the app will call

| Call                                                                   | Effect                              |
| ---------------------------------------------------------------------- | ----------------------------------- |
| `GET  .../orders?status=pending&limit=20`                              | latest pending orders               |
| `GET  .../orders/1002`                                                 | one order by number                 |
| `GET  .../products?lowStockBelow=10`                                   | products at/below a stock level     |
| `POST .../orders/1002/fulfill` `{"tracking":"TCS-77","carrier":"TCS"}` | mark shipped                        |
| `POST .../orders/1002/cancel` `{"reason":"Customer changed mind"}`     | cancel                              |
| `POST .../products/SKU/restock` `{"quantity":20,"mode":"set"}`         | set/add stock                       |
| `GET  .../sales/today`                                                 | today's revenue (briefing power-up) |
| `GET  .../tables`                                                      | setup diagnostic (key-protected)    |

Every call needs the header `x-api-key: <your key>`; sends/receives JSON.
**Browser testing shortcut:** GET requests can instead put the key in the URL,
e.g. `.../voice-ops-api.php/tables?key=YOUR-KEY` — same security, easier for a
one-off check. (POST calls still need the header.)

## Notes

- Requires PHP 7.4+ with `pdo_mysql` (standard on Hostinger).
- All SQL uses prepared statements — no injection risk from order ids/SKUs.
- Only the 3 status words are written by the app: `shipped`, `cancelled`
  (plus a tracking number / cancel reason). It never touches prices,
  customers, or anything else.
- If your orders/products are in different table shapes than assumed, ONLY the
  `$T` block and the two `map_*` functions need editing — the routes stay.
- Currency assumes PKR (`CURRENCY_CODE` in the file — change if needed).
- Add `write_orders`-equivalent ease later if the store wants the voice app to
  actually modify the store — for a demo, the POST side can be tested against
  one sample order first.
