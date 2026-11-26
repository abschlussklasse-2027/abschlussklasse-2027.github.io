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

## Steckbrief (Phase A)

Kern fuer «Kind beschreibt Kind» (Fachlogik: `~/auftraege/anlagen/prompt-baustein-steckbrief-portraet.md`). Additiv: Migration `0003_steckbrief.sql`, Code in `src/steckbrief/`, Routen unter `/steckbrief/*` (in `src/index.js` nur eingehaengt, Cron ruft zusaetzlich `steckbriefAufraeumen`). Tests: `test/steckbrief.test.js`. Nur lokal, nicht deployt, nur Platzhalterdaten.

- **Anmeldung:** `POST /steckbrief/login {klasse,email}` schickt einen Magic Link (HMAC-signiert, 15 Min., einmalig; Kennung in `sb_tokens`). Antwort immer gleich, verraet nicht, ob die Adresse bekannt ist. `POST /steckbrief/verify {class,token}` gibt eine Sitzung (HMAC, 2 Std.) zurueck. Mailadressen nur als gesalzener HMAC-Hash. Mail-Adapter `mail.js`: Phase A nur Konsole (Adresse maskiert) plus Postausgang im Speicher fuer Tests.
- **Fluss:** `entwurf` -> `freigabe_kind` -> (unter 16: `freigabe_eltern`, Eltern-Link 7 Tage, einmalig) -> `sichtbar`; daneben `abgelehnt`, `widerrufen`, `geloescht`. Entwurf sieht nur das beschriebene Kind (der Autor bleibt ihm verborgen). Ablehnen und Widerruf loeschen den Text sofort, ohne Freigabe nach 30 Tagen per Cron (`0 5 * * *`). Oeffentlich lesbar (`GET /steckbrief/oeffentlich?class=`) ist nur `sichtbar` und nicht gesperrt, mit Vorname, ohne Autor/Mail/Personenliste.
- **Pruefung beim Schreiben** (`moderation.js`, `ki.js`, `inhalt.js`): Stufe 1 Wortlisten und Muster (Deutsch, Mundart, Jugendsprache, heikle Themen; Leetspeak, Leerzeichen/Trennzeichen, Wiederholungen, Homoglyphen, unsichtbare Zeichen; Muster fuer Angriffe ohne Schimpfwort, verpackte Bosheit, Gerüchte, Kontaktdaten, Anweisungen an die KI). Stufe 2 KI-Adapter (`MODERATION_ANBIETER` = `openai` | `claude`, Schluessel nur als Worker-Secret `MODERATION_KEY`; ohne Anbieter nur Stufe 1; Ausfall = nicht speichern, Meldung «spaeter nochmal»). Stufe 3 Positivvorlage (feste Felder mit Laengen, Portraet max. 120 Woerter). Blockierter Text wird nicht gespeichert, nicht zurueckgegeben und nicht protokolliert; das Audit enthaelt nur Stufencodes.
- **Missbrauchsschutz:** Rate Limits (Anmeldung je Adresse/Anschluss, Schreiben je Kind, Melden, Lesen), Body max. 4 KB, CORS nur `ERLAUBTER_ORIGIN`, Klassentrennung ueber Klassen-Id in Sitzung und jeder Abfrage, Secrets nur als Worker-Secrets (`STECKBRIEF_SECRET` mind. 16 Zeichen, `ADMIN_TOKEN`, optional `MODERATION_KEY`).
- **Gremium/Lehrkraft:** `GET /steckbrief/gremium/offen`, `POST /steckbrief/gremium/sperren|entsperren/:id`; Logs und Audit tragen nur zufaellige Ids. Klassen und Personen legt `POST /steckbrief/admin/klassen|personen` an (Bearer `ADMIN_TOKEN`).
- **Grenzen:** Wortlisten fangen nie alles; deshalb erscheint nichts ohne Freigabe des Kindes (bei unter 16 plus Eltern) und Gremium kann sperren. Listen sind bewusst streng (auch Themen wie Familie, Aussehen, Herkunft werden blockiert, Fehlalarme sind moeglich). Eine Frist fuer bereits `sichtbare` Texte (nach Abschlussparty/Schuljahr) ist noch nicht eingebaut.

### Anbieter-Vergleich Moderation (Schaetzung, Stand Nov 2026, nach bestem Wissen, nicht geprueft)

| Anbieter | Kosten je Text (50-150 Zeichen) | Staerke | Datenschutz / Standort |
|---|---|---|---|
| OpenAI Moderation (`omni-moderation-latest`) | 0 $ (API kostenlos, nur Schluessel) | Hass, Gewalt, Sexuelles; erkennt «freundlich verpackte Bosheit» kaum | USA, Daten verlassen die EU; Vertrag/Auftragsverarbeitung klaeren |
| Claude Haiku (Pruefung per Prompt, Adapter `claude`) | rund 0,0001-0,0003 $ (ca. 300 Eingabe-, 30 Ausgabe-Token) | Bester Ton-/Kontext-Check, auch Angriffe ohne Schimpfwort, Regeln frei formulierbar | Anthropic, USA; Zero-Data-Retention nur nach Vereinbarung; Eingabe zwischen `<DATEN>`-Marken |
| Google Perspective / Cloud Natural Language | Perspective 0 $ (Kontingent, Dienst laut Google auslaufend, pruefen); NL Moderation rund 0,0005 $ je 1000 Zeichen | Toxizitaet, Beleidigung; schwach bei Mundart und Umgehung | USA, EU-Region bei Cloud NL waehlbar |

Empfehlung: Wortlisten (Stufe 1) immer; als Stufe 2 Claude Haiku (Kosten bei einigen hundert Texten im Rappenbereich), OpenAI Moderation optional als kostenlose Zweitmeinung. Datenschutz bei Kindertexten: nur Text ohne Namen senden (Phase A sendet nur die Feldwerte), Einwilligung der Eltern einholen.

### Offen fuer Phase B (nicht ohne Andreas)
1. Cloudflare-Konto fuer die Klasse mit API-Token fuer Workers und D1; `wrangler d1 migrations apply DB --remote` (0003).
2. Entscheid Mail-Absender (Anbieter, Absenderdomain; Mailadressen der Kinder und Eltern kommen von Elternhaus/Schule); `mail.js` um den echten Versand erweitern.
3. Schluessel fuer die gewaehlte Moderation (`MODERATION_ANBIETER`, `MODERATION_KEY`, ggf. `MODERATION_MODELL`) und Worker-Secret `STECKBRIEF_SECRET` setzen.
4. Rueckmeldung der Schule/Eltern zur Einwilligung; Datenschutz-Hinweis fuer die Seite; Frist fuer sichtbare Texte festlegen.
5. Frontend (`steckbrief.html` auf der Klassenseite, `LINK_BASIS`), Foto-Upload (R2, Bildmoderation) und echte Klassen/Personen anlegen.
