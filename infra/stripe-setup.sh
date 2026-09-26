#!/usr/bin/env bash
# Cria o webhook da Stripe apontando para o ramwisp e grava o segredo dele no server/.env.
# Pré-requisito: STRIPE_SECRET_KEY=sk_... já no server/.env. Uso: infra/stripe-setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
KEY=$(grep -E '^STRIPE_SECRET_KEY=' server/.env | cut -d= -f2-)
URL=$(grep -E '^PUBLIC_URL=' server/.env | cut -d= -f2-)/api/stripe/webhook
[ -n "$KEY" ] || { echo "falta STRIPE_SECRET_KEY no server/.env"; exit 1; }
if grep -qE '^STRIPE_WEBHOOK_SECRET=.+' server/.env; then echo "webhook já configurado"; exit 0; fi
RESP=$(curl -sS https://api.stripe.com/v1/webhook_endpoints -u "$KEY:" \
  -d url="$URL" -d "enabled_events[]=checkout.session.completed" -d "enabled_events[]=checkout.session.async_payment_succeeded" \
  -d description="ramwisp credit top-ups")
SECRET=$(printf '%s' "$RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("secret","")) if "secret" in d else sys.exit("stripe: "+d.get("error",{}).get("message","erro"))')
umask 077; echo "STRIPE_WEBHOOK_SECRET=$SECRET" >> server/.env
echo "webhook criado para $URL (modo $(case $KEY in sk_live_*) echo LIVE;; *) echo teste;; esac))"
