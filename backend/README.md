# Sammelpunkt Klassen-Umfrage (Cloudflare Worker + D1 + R2)

Phase A: nur lokal, nicht deployt, keine Zugangsdaten, nur Testdaten.

## Architektur
- **D1 ist die Wahrheit, nur anhängen.** `ereignisse` (id, zeit, typ, klasse, schema_version, nutzlast JSON, hash): Trigger verbieten UPDATE und DELETE.
- `entscheidungen`: was mit den Daten geschehen soll. Statuswechsel (offen, beschlossen, umgesetzt, verworfen) ist eine neue Zeile mit `folgt_auf`; der Verlauf bleibt. `aktuell` = Zeile ohne Nachfolger.
- `verarbeitung` (ereignis_id, schritt, zeit, ergebnis, entscheidung_id): Primärschlüssel (ereignis, schritt), `INSERT OR IGNORE`, darum wiederholbar und inkrementell.
- `POST /api/stimmen` (ohne Login): Schema aus `../fragen.js` (`npm run fragen`), nur A–J, nur erlaubte Werte, `D_anderes` max. 100 Zeichen, max. 20 KB, Honeypot-Feld `website`, Rate Limit je Tag und gehashter IP (Salt `RATE_SALT` + Tag, IP wird nie gespeichert), CORS nur `https://abschlussklasse-2027.github.io`. Antwort `{ok:true,id}`.
- Admin (Bearer `ADMIN_TOKEN`): `GET /api/export` (NDJSON; `?nach=<id>`, `?typ=`, `?offen_fuer=<schritt>`), `GET /api/auswertung` (Zählung je Frage, Freitexte nur als Anzahl), `GET|POST /api/entscheidungen`, `POST /api/verarbeitung`.
- Cron 05:00 UTC: Sammelmeldung per Mail mit NDJSON-Anhang, nur Ereignisse ohne Schritt `mail_sammelmeldung`; markiert erst nach erfolgreichem Senden. Cron 02:30 UTC: NDJSON-Export nach R2 (`export/ereignisse-<tag>.ndjson`).
- Mail-Adapter in `src/mail.js` (`konsole` für lokal/Test, `resend` als Beispiel); neuer Anbieter = eine Funktion mehr.

## Befehle
```
npm install
npm run fragen      # src/fragen.json aus ../fragen.js neu erzeugen
npm test            # Vitest + Miniflare
npm run migrate     # lokale D1 anlegen
npm run dev         # wrangler dev (lokal, Port 8787, Secrets aus .dev.vars)
```
Beispiel: `curl -X POST localhost:8787/api/stimmen -d '{"A":["Louisa allein"]}'`, dann `curl -H 'Authorization: Bearer lokal-test-token' localhost:8787/api/export`. Cron lokal: `wrangler dev --test-scheduled`, dann `/__scheduled?cron=0+5+*+*+*`.

## Mail-Anbieter (Phase B), abgerufen am 23.11.2026
| Anbieter | Gratis-Limit | Voraussetzung |
|---|---|---|
| Cloudflare Email Service (`send_email`) | Senden nur mit Workers Paid (3000/Monat inklusive, danach 0,35 $ je 1000); an verifizierte Zieladressen kostenlos | Domain bei Cloudflare, Paid-Plan für beliebige Empfänger (Quelle: developers.cloudflare.com/email-service/platform/pricing) |
| Resend | 100/Tag, 3000/Monat, 3 Domains | eigene Domain mit DKIM/SPF (Quelle: resend.com/pricing) |
| Brevo | 300/Tag, Brevo-Logo in Mails | Absender/Domain verifizieren, API-Key (Quelle: brevo.com, Drittberichte; Preisseite lieferte keine Zahlen) |
Für eine Mail pro Tag reichen Resend und Brevo; Empfehlung zuerst Resend (kleinste Einrichtung, API passt zum vorhandenen Adapter).

## Phase B (braucht den Nutzer)
1. Cloudflare-Konto (getrennt von brauckmann.ch), D1 und R2 anlegen, `database_id` in `wrangler.toml` eintragen, `wrangler d1 migrations apply DB --remote`.
2. Mail-Anbieter und Absender wählen; `MAIL_ADAPTER`, `MAIL_AN`, `MAIL_VON` setzen.
3. Secrets: `wrangler secret put ADMIN_TOKEN`, `MAIL_KEY`, `RATE_SALT`.
4. Deploy, dann die Worker-Adresse als `SAMMELPUNKT` in `../senden.js` eintragen (Sache des Seiten-Auftrags). Das Formular kann das Honeypot-Feld `website` mitsenden (leer).
Hinweis: Mail ist mindestens einmal-Zustellung. Schlägt das Markieren nach dem Senden fehl, kommt dieselbe Meldung nochmal. Freitext `D_anderes` kann Namen enthalten; Löschung läuft nicht hier.

## Wie man später darauf aufbaut
```
T='Authorization: Bearer $ADMIN_TOKEN'
# Entscheidung festhalten
curl -H "$T" -X POST $URL/api/entscheidungen -d '{"thema":"Auswertung","frage":"Wie gewichten wir Frage A?","entscheidung":"Mehrheit zählt","von":"Louisa"}'
# Status ändern = neue Zeile
curl -H "$T" -X POST $URL/api/entscheidungen -d '{"folgt_auf":"d_...","status":"beschlossen","von":"Gremium"}'
# Neue Ereignisse für einen Schritt holen, verarbeiten, dann markieren
curl -H "$T" "$URL/api/export?offen_fuer=auswertung_1" > neu.ndjson
curl -H "$T" -X POST $URL/api/verarbeitung -d '{"schritt":"auswertung_1","ereignis_ids":["e_..."],"ergebnis":"ok","entscheidung_id":"d_..."}'
```
Neue Ereignistypen (z. B. `steckbrief`) mit eigener `schema_version` anhängen; ältere Zeilen bleiben unverändert lesbar.
