#!/usr/bin/env bash
# Mint a fresh Shopify Admin API token (client-credentials flow) and optionally swap it into .env.
# Usage:
#   scripts/refresh-shopify-token.sh            → prints the new token
#   scripts/refresh-shopify-token.sh --write    → also updates SHOPIFY_ADMIN_TOKEN in .env
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "error: run this from the project root (needs .env)" >&2
  exit 1
fi
# shellcheck disable=SC1091
set -a; source .env; set +a

: "${SHOPIFY_STORE_DOMAIN:?set SHOPIFY_STORE_DOMAIN in .env}"
: "${SHOPIFY_CLIENT_ID:?set SHOPIFY_CLIENT_ID in .env}"
: "${SHOPIFY_CLIENT_SECRET:?set SHOPIFY_CLIENT_SECRET in .env}"

response=$(curl -sS -X POST "https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/client_credentials/grant.json" \
  -H "content-type: application/json" \
  -d "{\"client_id\":\"${SHOPIFY_CLIENT_ID}\",\"client_secret\":\"${SHOPIFY_CLIENT_SECRET}\",\"scopes\":\"${SHOPIFY_SCOPES:-read_orders,write_orders,read_inventory,write_inventory}\"}")

token=$(printf '%s' "$response" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))')
if [ -z "$token" ]; then
  echo "token mint failed — Shopify answered:" >&2
  printf '%s\n' "$response" >&2
  exit 1
fi

echo "fresh token minted: ${token:0:10}…${token: -4}"

if [ "${1:-}" = "--write" ]; then
  python3 - "$token" << 'EOF'
import pathlib, re, sys
p = pathlib.Path(".env")
text = p.read_text()
new = sys.argv[1]
if re.search(r"^SHOPIFY_ADMIN_TOKEN=", text, flags=re.M):
    text = re.sub(r"^SHOPIFY_ADMIN_TOKEN=.*$", f"SHOPIFY_ADMIN_TOKEN={new}", text, flags=re.M)
else:
    text = text.rstrip() + f"\nSHOPIFY_ADMIN_TOKEN={new}\n"
p.write_text(text)
EOF
  echo ".env updated — restart the app (Ctrl+C, then npm run dev)"
fi