# Sammelpunkt Klassen-Umfrage (Cloudflare Worker + D1, kein R2, keine Mail im Worker)

Phase A: nur lokal, nicht deployt, keine Zugangsdaten, nur Testdaten.

Läuft im bestehenden Cloudflare-Konto als eigener Worker `abschlussklasse-2027` mit eigener D1 `abschlussklasse-2027` (keine Bindung an andere Worker/Datenbanken). Kein R2, kein Resend. Einrichtung für den Nutzer: `EINRICHTUNG.md`.

## Architektur
- **D1 ist die Wahrheit, nur anhängen.** `ereignisse` (id, zeit, typ, klasse, schema_version, nutzlast JSON, hash): Trigger verbieten UPDATE und DELETE.
- `entscheidungen`: was mit den Daten geschehen soll. Statuswechsel (offen, beschlossen, umgesetzt, verworfen) ist eine neue Zeile mit `folgt_auf`; der Verlauf bleibt. `aktuell` = Zeile ohne Nachfolger.
- `verarbeitung` (ereignis_id, schritt, zeit, ergebnis, entscheidung_id): Primärschlüssel (ereignis, schritt), `INSERT OR IGNORE`, darum wiederholbar und inkrementell.
- `POST /api/stimmen` (ohne Login): Schema aus `../fragen.js` (`npm run fragen`), nur A–J, nur erlaubte Werte, `D_anderes` max. 100 Zeichen, max. 8 KB (auch ohne Content-Length abgebrochen), Honeypot-Feld `website`, Rate Limit je Tag und gehashter IP (`RATE_MAX`, Standard 20; Salt `RATE_SALT` + Tag, IP wird nie gespeichert), harte Tagesgrenze insgesamt (`TAGESMAX`, Standard 3000 gespeicherte Stimmen; danach 429 mit freundlicher Meldung; ungültige Anfragen zählen nicht mit; über dem Limit wird nichts mehr geschrieben), CORS nur `https://abschlussklasse-2027.github.io`. Antwort `{ok:true,id}`.
- Admin (Bearer `ADMIN_TOKEN`): `GET /admin/export` (komplette Sicherung als eine JSON-Datei: Ereignisse, Entscheidungen, Verarbeitungsmarken), `GET /api/export` (NDJSON; `?nach=<id>`, `?typ=`, `?offen_fuer=<schritt>`), `GET /api/auswertung` (Zählung je Frage, Freitexte nur als Anzahl), `GET|POST /api/entscheidungen`, `POST /api/verarbeitung`.
- Cron 05:00 UTC (einziger Cron): alte Zähler löschen. Der Worker speichert nur und sendet keine Mails.

## Sicherung und Sammelmeldung (auf x1pro)
1. `scripts/sammelmeldung.py`, täglich 06:15 per systemd-Timer (`scripts/systemd/`, nach `~/.config/systemd/user/` kopiert): holt `GET /admin/export`, legt `~/entwuerfe/abschlussklasse-export/export-<Tag>.json` ab und mailt neue Ereignisse und Entscheidungen (JSON-Anhänge, höchstens 1000 Ereignisse je Anhang) an abschluss.klasse.2027@gmx.de, Empfänger im Feld An. SMTP aus `~/TradingAgents/.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`). Zustand `status.json` wird erst nach erfolgreichem Senden fortgeschrieben. `--trocken` zeigt die Mail nur an, `--nur-export` sichert ohne Mail.
2. **D1 Time Travel** (in jeder D1 enthalten, 30 Tage Rückschau): `wrangler d1 time-travel info DB`, Wiederherstellung mit `wrangler d1 time-travel restore DB --timestamp=<ISO-Zeit>`.

## Kostenschutz
Im Free-Plan rechnet Cloudflare nicht ab (nur Fehler); bei Paid wäre es Cents. Zusätzlich im Worker (Plan-Check: `EINRICHTUNG.md`): `TAGESMAX` 3000 Stimmen/Tag (D1 Free: 100 000 Schreibzeilen/Tag, eine Stimme braucht rund 4–6), `RATE_MAX` 20 je Absender und Tag, Nutzlast 8 KB.

## Befehle
```
npm install
npm run fragen      # src/fragen.json aus ../fragen.js neu erzeugen
npm test            # Vitest + Miniflare
npm run migrate     # lokale D1 anlegen
npm run dev         # wrangler dev (lokal, Port 8787, Secrets aus .dev.vars)
```
Beispiel: `curl -X POST localhost:8787/api/stimmen -d '{"A":["Louisa allein"]}'`, dann `curl -H 'Authorization: Bearer lokal-test-token' localhost:8787/api/export`. Cron lokal: `wrangler dev --test-scheduled`, dann `/__scheduled?cron=0+5+*+*+*`.

## Phase B (braucht den Nutzer)
Nutzer: nur `EINRICHTUNG.md` (Konten, API-Token, `~/.klassen-zugang.env`). Dann alles in einem Zug:
```
cd backend && scripts/deploy.sh
```
Das Skript macht: Konto-ID per API lesen, `wrangler d1 create abschlussklasse-2027` (ID in `wrangler.toml`, mitcommitten), `wrangler d1 migrations apply DB --remote`, `wrangler deploy`, Custom Domain `klasse.keys4it.com` per API (nur wenn Hostname in Workers/DNS frei, sonst Fallback workers.dev), Secrets `ADMIN_TOKEN` und `RATE_SALT` (selbst erzeugt) per `wrangler secret bulk`, schreibt `ADMIN_TOKEN` und `WORKER_URL` in `~/.klassen-zugang.env` und gibt die Worker-URL aus. Nichts davon braucht R2, Resend oder ein neues Konto. Danach die URL (Ziel `https://klasse.keys4it.com`) als `SAMMELPUNKT` in `../senden.js` eintragen (Sache des Seiten-Auftrags). Das Formular kann das Honeypot-Feld `website` mitsenden (leer).
Hinweis: Die Mail ist mindestens-einmal-Zustellung (Zustand erst nach erfolgreichem Senden). Freitext `D_anderes` kann Namen enthalten; Löschung läuft nicht hier.

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

## Nutzungsmessung und Rueckmeldung der Schule (23.11.2026)

- `POST /m` (oeffentlich, CORS nur Klassenseite): `{"e":[["seite","de|mobil"], ...]}`. Nur Ereignisse aus der Erlaubnisliste in `src/messung.js`; gezaehlt wird in Tabelle `messung` (Tag, Ereignis, Merkmal, n), keine Besucherzeilen, keine Zeit unter Tagesgenauigkeit, keine Cookies. Grenzen: `MESSUNG_IP_MAX` (600 Ereignisse/Tag und Absender-Hash), `MESSUNG_TAGESMAX` (20000/Tag).
- `GET /admin/messung?von=&bis=` (Bearer): Zaehler je Tag und Summen. Lesbare Uebersicht: `scripts/auswertung_messung.py` (schreibt nach `~/entwuerfe/abschlussklasse-export/messung-<Tag>.md`). Die Messung steht auch in `/admin/export`.
- `POST /api/freigabe` (oeffentlich): Rueckmeldung der Schule als Ereignis `schulfreigabe` (append-only). Grenzen: `FREIGABE_RATE_MAX` (5/Tag und Absender-Hash), `FREIGABE_TAGESMAX` (200/Tag). Lesen: `GET /admin/freigaben` (Bearer); die Sammelmeldung hebt neue Rueckmeldungen hervor. Eine Rueckmeldung ist keine rechtsverbindliche Genehmigung.
