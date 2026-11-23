# Einrichtung Sammelpunkt (für den Nutzer)

Ein Schritt, dann läuft alles. Der Sammelpunkt läuft im **bestehenden** Cloudflare-Konto von brauckmann.ch, als eigener Worker `abschlussklasse-2027` mit eigener Datenbank `abschlussklasse-2027`, erreichbar unter **https://klasse.keys4it.com** (Keys4IT tritt nach außen auf; Fallback `workers.dev`). Die zwei vorhandenen Worker werden nicht angefasst. Kein neues Konto, kein Resend, kein R2.

## Dein Schritt: neuen API-Token anlegen
1. Cloudflare-Dashboard, oben rechts Profil, **My Profile → API Tokens → Create Token → Create Custom Token**.
2. Name: `abschlussklasse-2027`. Berechtigungen:
   - **Account → Workers Scripts → Edit**
   - **Account → D1 → Edit**
   - **Zone → Workers Routes → Edit**
   - **Zone → DNS → Edit**
3. Account Resources: **Include → nur das brauckmann.ch-Konto** (das Konto, in dem auch keys4it.com liegt). Zone Resources: **Include → Specific zone → keys4it.com**; brauckmann.ch und alle anderen Zonen ausgenommen. Keine weiteren Rechte. Create Token, Token kopieren (wird nur einmal angezeigt).
4. Auf x1pro im Terminal:
   ```
   nano ~/.klassen-zugang.env
   ```
   Eine Zeile einfügen, speichern (Strg+O, Enter, Strg+X):
   ```
   CLOUDFLARE_API_TOKEN=hier-den-token-einfügen
   ```
   ```
   chmod 600 ~/.klassen-zugang.env
   ```
Fertig. Die Konto-ID liest das Deploy-Skript selbst per API. Es legt die Custom Domain `klasse.keys4it.com` per API an, aber nur, wenn dieser Hostname in Workers und DNS noch frei ist (nichts Bestehendes wird überschrieben, sonst bleibt es bei `workers.dev`), und legt in keiner Zone einen anderen Eintrag an. Dann kann `backend/scripts/deploy.sh` laufen; es erzeugt `ADMIN_TOKEN` und `RATE_SALT` selbst, trägt sie mit `WORKER_URL` in dieselbe Datei ein und gibt die Worker-URL aus.

Den vorhandenen Token aus `~/www.brauckmann.ch/.env` bitte nicht verwenden (er kann kein D1).

## Plan prüfen (30 Sekunden)
Dashboard → **Workers & Pages → Plans**. Steht dort **Free**, kann es nicht teurer werden: Cloudflare rechnet nicht ab, bei Überschreitung gibt es nur Fehler. Bei **Workers Paid** (5 $/Monat Grundgebühr, hängt am bestehenden Konto) wäre eine Überschreitung der Inklusivmengen Cents wert; durch die Tagesgrenze im Worker praktisch ausgeschlossen. Die Custom Domain kostet nichts extra.

## Was es kostet
| Posten | Inklusive (Free) | Unsere Obergrenze | Bei Überschreitung |
|---|---|---|---|
| Worker-Anfragen | 100 000 pro Tag | Tagesgrenze 3000 gespeicherte Stimmen, 20 je Absender | Free: Fehler. Paid: erst nach 10 Mio. im Monat Cents |
| D1 Schreibzeilen | 100 000 pro Tag | 3000 Stimmen × rund 5 Zeilen = rund 15 000 | Free: Fehler. Paid: erst nach 50 Mio. im Monat |
| D1 Lesezeilen | 5 Mio. pro Tag | Export liest alles, Tagesabruf klein | Free: Fehler |
| D1 Speicher | 5 GB | eine Stimme unter 2 KB, wenige MB insgesamt | Free: Schreiben wird abgelehnt |
| Mail | kein Dienst nötig | Versand läuft über das vorhandene SMTP des Nutzers auf x1pro | keine Zusatzkosten |

**Kosten: 0 CHF** im Free-Plan, kein zusätzliches Zahlungsmittel nötig. Im bestehenden Konto hängt die Karte, daher ist der Plan-Check oben die einzige Absicherung nach außen; Anfragen über der Tagesgrenze bekommen eine freundliche 429-Meldung, ohne dass noch etwas geschrieben wird.

## Betrieb
- Täglich 06:15 (systemd-Timer `klassen-sammelmeldung`, bereits aktiv): `scripts/sammelmeldung.py` holt `/admin/export`, legt `~/entwuerfe/abschlussklasse-export/export-<Tag>.json` ab und mailt Neues an abschluss.klasse.2027@gmx.de (Empfänger sichtbar im Feld An). Vor dem Deploy tut es nichts.
- Zusätzlich hat D1 Time Travel (30 Tage Rückschau).

## Abbau im Juni 2027
1. `backend/scripts/sammelmeldung.py --nur-export` ausführen und `~/entwuerfe/abschlussklasse-export/` sichern (Archiv, bei Bedarf Freitexte vorher löschen).
2. Timer abschalten: `systemctl --user disable --now klassen-sammelmeldung.timer`.
3. Custom Domain `klasse.keys4it.com` im Dashboard (Worker → Settings → Domains) entfernen; der DNS-Eintrag verschwindet dabei mit.
4. Worker und Datenbank löschen (nur diese zwei, im Dashboard unter Workers & Pages bzw. Storage & Databases → D1) oder: `cd backend && npx wrangler delete abschlussklasse-2027 && npx wrangler d1 delete abschlussklasse-2027`.
5. API-Token `abschlussklasse-2027` im Dashboard widerrufen, `~/.klassen-zugang.env` löschen.
