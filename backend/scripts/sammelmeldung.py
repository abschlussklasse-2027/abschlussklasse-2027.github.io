#!/usr/bin/env python3
"""Taegliche Sammelmeldung und Sicherung der Klassen-Umfrage (laeuft auf x1pro, nicht im Worker).

Holt GET <WORKER_URL>/admin/export (Bearer ADMIN_TOKEN), legt den kompletten Export lokal ab
(~/entwuerfe/abschlussklasse-export/export-<Tag>.json, 0600) und schickt neue Ereignisse und
Entscheidungen seit der letzten Meldung als Mail (JSON-Anhaenge) an abschluss.klasse.2027@gmx.de.
Empfaenger steht im Feld An (keine Blindkopie). Zustand: status.json im Ablageordner; er wird erst
nach erfolgreichem Senden fortgeschrieben (Fehler: naechster Lauf sendet erneut, Mail kommt mindestens einmal).

Zugang: ~/.klassen-zugang.env (WORKER_URL, ADMIN_TOKEN; deploy.sh traegt beide ein). Ohne diese Datei beendet
sich das Skript still mit Exit 0 (vor dem Deploy). SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) aus
~/TradingAgents/.env; Werte werden nie ausgegeben.
Optionen: --trocken (Mail nur anzeigen, nicht senden, Zustand nicht aendern), --nur-export (keine Mail).
"""
import argparse, json, os, smtplib, ssl, sys, urllib.request
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

HOME = Path.home()
AN = "abschluss.klasse.2027@gmx.de"
ABLAGE = HOME / "entwuerfe" / "abschlussklasse-export"
TEIL = 1000  # Ereignisse je Anhang (eine Stimme ist unter 2 KB)


def env_datei(p):
    d = {}
    if p.exists():
        for z in p.read_text().splitlines():
            z = z.strip()
            if z.startswith("export "):
                z = z[7:]
            if z and not z.startswith("#") and "=" in z:
                k, v = z.split("=", 1)
                d[k.strip()] = v.strip().strip("'\"")
    return d


def holen(url, token):
    req = urllib.request.Request(url.rstrip("/") + "/admin/export",
                                 headers={"authorization": "Bearer " + token, "user-agent": "klassen-sammelmeldung/1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def schreiben(pfad, roh, ueberschreiben=True):
    fd = os.open(pfad, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(roh if isinstance(roh, bytes) else roh.encode())


def zaehlung(neue):
    # Nur Anzahlen je Antwort, keine Freitexte im Mailtext (die stehen im Anhang).
    z = {}
    for e in neue:
        if e.get("typ") != "stimme":
            continue
        for frage, werte in e["nutzlast"].items():
            if frage == "D_anderes":
                continue
            for w in werte:
                z.setdefault(frage, {}).setdefault(w, 0)
                z[frage][w] += 1
    return [f"{f}: " + "; ".join(f"{n}x {t[:40]}" for t, n in sorted(o.items(), key=lambda x: -x[1])) for f, o in sorted(z.items())]


def senden(msg, smtp):
    host, port = smtp["SMTP_HOST"], int(smtp.get("SMTP_PORT") or 587)
    if port == 465:
        s = smtplib.SMTP_SSL(host, port, timeout=30, context=ssl.create_default_context())
    else:
        s = smtplib.SMTP(host, port, timeout=30)
        s.starttls(context=ssl.create_default_context())
    with s:
        s.login(smtp["SMTP_USER"], smtp["SMTP_PASS"])
        s.send_message(msg)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trocken", action="store_true")
    ap.add_argument("--nur-export", action="store_true")
    ap.add_argument("--url"); ap.add_argument("--token")
    a = ap.parse_args()
    e = env_datei(HOME / ".klassen-zugang.env")
    url = a.url or os.environ.get("WORKER_URL") or e.get("WORKER_URL", "")
    token = a.token or os.environ.get("ADMIN_TOKEN") or e.get("ADMIN_TOKEN", "")
    if not url or not token:
        print("noch nicht eingerichtet (WORKER_URL/ADMIN_TOKEN fehlen); nichts zu tun")
        return 0
    roh = holen(url, token)
    daten = json.loads(roh)
    ABLAGE.mkdir(parents=True, exist_ok=True)
    jetzt = datetime.now(timezone.utc)
    if not a.trocken:
        schreiben(ABLAGE / f"export-{jetzt:%Y-%m-%d}.json", roh)
    if a.nur_export:
        print(f"Export: {len(daten['ereignisse'])} Ereignisse, {len(daten['entscheidungen'])} Entscheidungen")
        return 0

    status_datei = ABLAGE / "status.json"
    st = json.loads(status_datei.read_text()) if status_datei.exists() else {"letzte_ereignis_id": "", "gemeldete_entscheidungen": []}
    neue = [x for x in daten["ereignisse"] if x["id"] > st["letzte_ereignis_id"]]
    gemeldet = set(st["gemeldete_entscheidungen"])
    neue_ent = [d for d in daten["entscheidungen"] if d["id"] not in gemeldet]
    if not neue and not neue_ent:
        print("nichts Neues")
        return 0

    smtp = {k: v for k, v in {**env_datei(HOME / "TradingAgents" / ".env"), **os.environ}.items() if k.startswith("SMTP_")}
    fehlt = [k for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASS") if not smtp.get(k)]
    if fehlt and not a.trocken:
        print("SMTP unvollstaendig, fehlt: " + ", ".join(fehlt), file=sys.stderr)
        return 1

    stimmen = sum(1 for x in neue if x["typ"] == "stimme")
    zeilen = zaehlung(neue)
    msg = EmailMessage()
    msg["From"] = smtp.get("SMTP_FROM") or smtp.get("SMTP_USER", "")
    msg["To"] = AN  # sichtbar im Feld An, keine Blindkopie
    msg["Subject"] = f"Klassen-Umfrage: {stimmen} neue Stimmen, {len(neue_ent)} neue Entscheidungen"
    msg.set_content(
        f"{len(neue)} neue Ereignisse ({stimmen} Stimmen) und {len(neue_ent)} neue Entscheidungszeilen seit der letzten Meldung.\n\n"
        + "\n".join(zeilen) + "\n\nFreitexte stehen nur in den JSON-Anhaengen. Der komplette Export liegt lokal in "
        + "~/entwuerfe/abschlussklasse-export/ auf x1pro; diese Mail ist eine zweite Sicherung.\n")
    for i in range(0, max(len(neue), 1), TEIL):
        teil = neue[i:i + TEIL]
        if teil:
            msg.add_attachment(json.dumps(teil, ensure_ascii=False, indent=1).encode(), maintype="application", subtype="json",
                               filename=f"neue-ereignisse-{jetzt:%Y-%m-%d}-{i // TEIL + 1}.json")
    if neue_ent:
        msg.add_attachment(json.dumps(neue_ent, ensure_ascii=False, indent=1).encode(), maintype="application", subtype="json",
                           filename=f"neue-entscheidungen-{jetzt:%Y-%m-%d}.json")
    if a.trocken:
        print(f"[trocken] An: {msg['To']}  Betreff: {msg['Subject']}\n{msg.get_body().get_content()}")
        print("Anhaenge:", [p.get_filename() for p in msg.iter_attachments()])
        return 0
    senden(msg, smtp)
    st["letzte_ereignis_id"] = max([st["letzte_ereignis_id"]] + [x["id"] for x in neue])
    st["gemeldete_entscheidungen"] = sorted(gemeldet | {d["id"] for d in neue_ent})
    schreiben(status_datei, json.dumps(st, indent=1))
    print(f"gesendet: {len(neue)} Ereignisse, {len(neue_ent)} Entscheidungen")
    return 0


if __name__ == "__main__":
    sys.exit(main())
