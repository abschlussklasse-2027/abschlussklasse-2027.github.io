#!/usr/bin/env bash
# Deploy in einem Zug ins BESTEHENDE Cloudflare-Konto: eigener Worker "abschlussklasse-2027", eigene D1-Datenbank
# "abschlussklasse-2027", erreichbar unter https://klasse.keys4it.com (Fallback workers.dev). Fasst keine anderen Worker, Datenbanken oder Zonen an. Kein R2, kein Resend.
# Anmeldung: wrangler-OAuth (`npx wrangler login`); ein CLOUDFLARE_API_TOKEN in ~/.klassen-zugang.env ist optional und hat Vorrang.
# Optional CLOUDFLARE_ACCOUNT_ID/KLASSEN_ZONE_ID; sonst wird die Konto-ID per API gelesen.
# Erzeugt ADMIN_TOKEN und RATE_SALT beim ersten Lauf selbst und traegt sie samt WORKER_URL in die Datei ein.
# Mehrfach ausfuehrbar: bestehende Secrets und D1 bleiben erhalten.
set -euo pipefail
cd "$(dirname "$0")/.."
ENVF="${KLASSEN_ZUGANG:-$HOME/.klassen-zugang.env}"
[ -f "$ENVF" ] || { : > "$ENVF"; chmod 600 "$ENVF"; }
set -a; . "$ENVF"; set +a
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  # OAuth-Token von wrangler (nur im Speicher, nie ausgeben)
  WCONF="${XDG_CONFIG_HOME:-$HOME/.config}/.wrangler/config/default.toml"
  [ -f "$WCONF" ] || WCONF="$HOME/.wrangler/config/default.toml"
  CLOUDFLARE_API_TOKEN=$(grep -oP '^oauth_token\s*=\s*"\K[^"]+' "$WCONF" 2>/dev/null || true)
  [ -n "$CLOUDFLARE_API_TOKEN" ] || { echo "Nicht angemeldet: 'npx wrangler login' ausfuehren." >&2; exit 1; }
  # wrangler soll bei OAuth bleiben (kein Token-Env, das ihn verwirrt)
  OAUTH=1
fi
API=https://api.cloudflare.com/client/v4
HOST=klasse.keys4it.com
ZONE=keys4it.com
W="npx wrangler"
wr() { if [ "${OAUTH:-0}" = 1 ]; then env -u CLOUDFLARE_API_TOKEN "$@"; else "$@"; fi; }
[ -d node_modules ] || npm ci
nachtrag() { grep -q "^$1=" "$ENVF" || { echo "$1=$2" >> "$ENVF"; chmod 600 "$ENVF"; }; }
zufall() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
api() { curl -fsS -A klassen-deploy/1.0 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$API/$1"; }

echo "== 1. Konto"
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  KONTEN=$(api accounts | python3 -c 'import json,sys; print(" ".join(a["id"] for a in json.load(sys.stdin)["result"]))')
  [ "$(wc -w <<<"$KONTEN")" = 1 ] || { echo "Konto nicht eindeutig; CLOUDFLARE_ACCOUNT_ID in $ENVF eintragen (Dashboard: Workers & Pages, rechts 'Account ID')." >&2; exit 1; }
  export CLOUDFLARE_ACCOUNT_ID=$KONTEN
fi
PLAN_HINWEIS="Plan im Dashboard pruefen: Workers & Pages -> Plans (Free = keine Rechnung moeglich)."
echo "Konto gefunden. $PLAN_HINWEIS"

echo "== 2. D1-Datenbank abschlussklasse-2027"
if grep -q '00000000-0000-0000-0000-000000000000' wrangler.toml; then
  wr $W d1 create abschlussklasse-2027 >/dev/null 2>&1 || true   # existiert sie schon, ist das in Ordnung
  ID=$(api "accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database?name=abschlussklasse-2027" | python3 -c 'import json,sys; r=[x for x in json.load(sys.stdin)["result"] if x["name"]=="abschlussklasse-2027"]; print(r[0]["uuid"] if r else "")')
  [ -n "$ID" ] || { echo "D1 abschlussklasse-2027 nicht gefunden/angelegt" >&2; exit 1; }
  sed -i "s/00000000-0000-0000-0000-000000000000/$ID/" wrangler.toml
  echo "database_id in wrangler.toml eingetragen (bitte committen)"
fi
wr $W d1 migrations apply DB --remote

echo "== 3. Worker abschlussklasse-2027"
SUB=$(api "accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" | python3 -c 'import json,sys; print((json.load(sys.stdin).get("result") or {}).get("subdomain") or "")')
[ -n "$SUB" ] || { echo "Das Konto hat noch keine workers.dev-Adresse; nicht selbst anlegen, bitte melden." >&2; exit 1; }
URL="https://abschlussklasse-2027.$SUB.workers.dev"   # Fallback
wr $W deploy

echo "== 3b. Custom Domain $HOST (Zone $ZONE)"
# Legt NUR diesen einen Hostnamen an und nur, wenn er in Workers-Domains und DNS noch frei ist. Sonst bleibt es bei workers.dev.
j() { python3 -c "import json,sys; d=json.load(sys.stdin); $1"; }
DOMAIN_OK=0
ZID="${KLASSEN_ZONE_ID:-}"
[ -n "$ZID" ] || ZID=$(api "zones?name=$ZONE" 2>/dev/null | j 'r=d.get("result") or []; print(r[0]["id"] if len(r)==1 else "")' || true)
if [ -z "$ZID" ]; then
  echo "Zone $ZONE nicht lesbar (Token ohne Zonenrecht?): bleibt bei workers.dev."
else
  VORHANDEN_W=$(api "accounts/$CLOUDFLARE_ACCOUNT_ID/workers/domains?hostname=$HOST" 2>/dev/null | j 'print(" ".join(x.get("service","?") for x in d.get("result") or []))' || echo "fehler")
  VORHANDEN_D=$(api "zones/$ZID/dns_records?name=$HOST" 2>/dev/null | j 'print(len(d.get("result") or []))' || echo "fehler")
  if [ "$VORHANDEN_W" = "abschlussklasse-2027" ]; then DOMAIN_OK=1; echo "Custom Domain besteht schon fuer diesen Worker."
  elif [ -z "$VORHANDEN_W" ] && { [ "$VORHANDEN_D" = 0 ] || [ "$VORHANDEN_D" = fehler ]; }; then   # DNS nicht lesbar (OAuth ohne DNS-Scope): Cloudflare lehnt das Anlegen bei vorhandenem Eintrag selbst ab (kein override_existing_dns_record)
    curl -fsS -A klassen-deploy/1.0 -X PUT -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H 'content-type: application/json' \
      -d "{\"hostname\":\"$HOST\",\"service\":\"abschlussklasse-2027\",\"environment\":\"production\",\"zone_id\":\"$ZID\"}" \
      "$API/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/domains" >/dev/null && DOMAIN_OK=1 && echo "Custom Domain angelegt." || echo "Custom Domain nicht moeglich (Rechte/Konflikt): bleibt bei workers.dev."
  else
    echo "$HOST ist schon belegt (Worker: '${VORHANDEN_W:-keiner}', DNS-Eintraege: $VORHANDEN_D): nichts ueberschrieben, bleibt bei workers.dev."
  fi
fi
[ "$DOMAIN_OK" = 1 ] && URL="https://$HOST"

echo "== 4. Secrets (ADMIN_TOKEN, RATE_SALT)"
nachtrag ADMIN_TOKEN "$(zufall)"
nachtrag RATE_SALT "$(zufall)"
nachtrag WORKER_URL "$URL"
. "$ENVF"
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT; chmod 600 "$TMP"
printf '{"ADMIN_TOKEN":"%s","RATE_SALT":"%s"}' "$ADMIN_TOKEN" "$RATE_SALT" > "$TMP"
wr $W secret bulk "$TMP"

echo "== 5. Kurzpruefung"
sleep 3
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $ADMIN_TOKEN" "$URL/admin/export" || true)
echo "GET /admin/export -> HTTP $CODE (200 erwartet; beim ersten Deploy kann es 1-2 Minuten dauern)"
echo
echo "Worker-URL: $URL"
echo "Als SAMMELPUNKT in ../senden.js eintragen (Zielwert https://$HOST; CORS im Worker bleibt auf https://abschlussklasse-2027.github.io). Die taegliche Sammelmeldung (systemd-Timer klassen-sammelmeldung) liest WORKER_URL und ADMIN_TOKEN aus $ENVF."
