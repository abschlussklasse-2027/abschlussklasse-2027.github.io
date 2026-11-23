#!/usr/bin/env python3
"""Lesbare Tagesuebersicht der anonymen Nutzungsmessung (Markdown), liest GET <WORKER_URL>/admin/messung (Bearer ADMIN_TOKEN).

Schreibt ~/entwuerfe/abschlussklasse-export/messung-<Tag>.md (0600). Zugang wie sammelmeldung.py aus ~/.klassen-zugang.env.
Es gibt nur aggregierte Zaehler (keine Besucherzeilen); ohne Zugang oder ohne Daten beendet sich das Skript ohne Fehler.
Optionen: --von/--bis YYYY-MM-DD, --url, --token, --stdout (nur anzeigen). Forschungsfrage: Klicken Besucher sofort weg, wenn sie einen Avatar sehen?
"""
import argparse, json, os, sys, urllib.request
from datetime import datetime, timezone
from pathlib import Path

HOME = Path.home()
ABLAGE = HOME / "entwuerfe" / "abschlussklasse-export"
DAUER = ["<5s", "5-15s", "15-60s", "1-3min", ">3min"]
VZEIT = ["<3s", "3-10s", "10-30s", "30-60s", "60-120s", ">120s"]


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


def holen(url, token, von, bis):
    q = "&".join(x for x in (f"von={von}" if von else "", f"bis={bis}" if bis else "") if x)
    req = urllib.request.Request(url.rstrip("/") + "/admin/messung" + ("?" + q if q else ""),
                                 headers={"authorization": "Bearer " + token, "user-agent": "klassen-messung/1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def pct(a, b):
    return f"{100 * a / b:.0f} %" if b else "-"


def tabelle(kopf, zeilen):
    z = ["| " + " | ".join(kopf) + " |", "|" + "|".join("---" for _ in kopf) + "|"]
    z += ["| " + " | ".join(str(c) for c in r) + " |" for r in zeilen]
    return "\n".join(z) + "\n"


def verteilung(d, ereignis, klassen, titel, einheit="Anzahl"):
    e = d.get(ereignis, {})
    gesamt = sum(e.values())
    return f"**{titel}**\n\n" + tabelle(["Klasse", einheit, "Anteil"], [[k, e.get(k, 0), pct(e.get(k, 0), gesamt)] for k in klassen]) + "\n"


def nach_video(d, ereignis):
    """{(video, sprache): {rest: n}} aus Merkmalen 'video|sprache|rest'."""
    r = {}
    for m, n in d.get(ereignis, {}).items():
        t = m.split("|")
        if len(t) == 3:
            r.setdefault((t[0], t[1]), {})[t[2]] = n
    return r


def abschnitt(d, titel):
    """Markdown fuer einen Satz Zaehler d = {ereignis: {merkmal: n}} (ein Tag oder die Summe)."""
    seiten = d.get("seite", {})
    n_seiten = sum(seiten.values())
    o = [f"### {titel}\n"]
    o.append(f"**Seitenaufrufe: {n_seiten}**\n")
    if seiten:
        o.append(tabelle(["Sprache / Geraet", "Aufrufe", "Anteil"], [[m.replace("|", " / "), n, pct(n, n_seiten)] for m, n in sorted(seiten.items(), key=lambda x: -x[1])]) + "\n")
    o.append(verteilung(d, "dauer", DAUER, "Besuchsdauer beim Verlassen"))
    sd = d.get("dauer", {})
    if sd:
        o.append(f"Sofort weg (unter 5 s): **{pct(sd.get('<5s', 0), sum(sd.values()))}** der gemessenen Besuche.\n")
    sc = d.get("scroll", {})
    o.append("**Scrolltiefe** (Besuche, die die Marke erreichten)\n\n" + tabelle(["Marke", "Besuche", "Anteil der Aufrufe"], [[f"{k} %", sc.get(k, 0), pct(sc.get(k, 0), n_seiten)] for k in ("25", "50", "75", "100")]) + "\n")
    starts, zeit, mile, abbr, kap = (nach_video(d, x) for x in ("video_start", "video_zeit", "video_meilenstein", "video_abbruch", "video_kapitel"))
    for (v, s) in sorted(starts):
        gesamt = starts[(v, s)]
        o.append(f"#### Video {v} ({s}): {gesamt} Starts ({pct(gesamt, n_seiten)} der Aufrufe)\n")
        z = zeit.get((v, s), {})
        o.append(tabelle(["Abspielzeit", "Besuche", "Anteil der Starts"], [[k, z.get(k, 0), pct(z.get(k, 0), gesamt)] for k in VZEIT]))
        sofort = z.get("<3s", 0)
        o.append(f"\nSofort weg (unter 3 s Abspielzeit): **{pct(sofort, gesamt)}** der Starts.\n")
        m = mile.get((v, s), {})
        o.append(tabelle(["Meilenstein", "Besuche", "Anteil der Starts"], [[f"{k} %", m.get(k, 0), pct(m.get(k, 0), gesamt)] for k in ("25", "50", "75", "100")]))
        a = abbr.get((v, s), {})
        if a:
            o.append("\nAbbruch-Zeitpunkt (Video nicht zu Ende gesehen, 10-s-Klassen)\n\n" + tabelle(["Position", "Abbrueche"], [[f"{int(k[1:]) * 10}-{int(k[1:]) * 10 + 9} s" if k != "t30" else "ab 300 s", n] for k, n in sorted(a.items(), key=lambda x: int(x[0][1:]))]))
        k_ = kap.get((v, s), {})
        if k_:
            o.append("\nZuletzt gesehenes Kapitel/Abschnitt (Index, 0 = erstes)\n\n" + tabelle(["Index", "Besuche"], [[k[1:], n] for k, n in sorted(k_.items(), key=lambda x: int(x[0][1:]))]))
        o.append("")
    kk = {}
    for m, n in d.get("kapitelklick", {}).items():
        kk[m] = n
    if kk:
        o.append("**Klicks auf die Kapitelliste**\n\n" + tabelle(["Video / Kapitel", "Klicks"], [[m.replace("|", " / "), n] for m, n in sorted(kk.items())]) + "\n")
    rest = []
    for e, titel_ in (("sprachschalter", "Sprachschalter genutzt (von>nach)"), ("vorlesen", "Vorlesen gestartet (Sprache)"), ("lehrer", "Lehrer-Bereich (sichtbar|geoeffnet, Sprache)"),
                      ("fragen_abgesendet", "Fragen abgesendet (ohne Inhalt, Sprache)"), ("freigabe_abgesendet", "Rueckmeldung der Schule abgesendet (ohne Inhalt, Sprache)")):
        if d.get(e):
            rest.append(f"**{titel_}**\n\n" + tabelle(["Merkmal", "Anzahl"], [[m, n] for m, n in sorted(d[e].items())]) + "\n")
    o += rest
    return "\n".join(o)


def bauen(daten):
    tage = daten.get("tage", {})
    o = [f"# Nutzungsmessung Abschlussklasse 2027\n\nErzeugt {daten.get('erzeugt', '')}. Anonym und aggregiert: keine Cookies, keine IDs, keine Besucherzeilen. "
         "Seitenaufruf = geladene Seite (Sprachwechsel zaehlt als neuer Aufruf); Besuchsdauer = sichtbare Zeit bis zum ersten Verlassen; "
         "Videozahlen nur fuer Besuche, die das Video gestartet haben. Wer Do-Not-Track/Global Privacy Control aktiv hat, wird nicht gezaehlt.\n"]
    if not tage:
        o.append("Noch keine Zaehler vorhanden.\n")
        return "\n".join(o)
    o.append(abschnitt(daten["summen"], f"Summe ueber alle Tage ({min(tage)} bis {max(tage)})"))
    if len(tage) > 1:
        o.append("## Je Tag\n")
        for t in sorted(tage, reverse=True):
            o.append(abschnitt(tage[t], t))
    return "\n".join(o)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--von"); ap.add_argument("--bis"); ap.add_argument("--url"); ap.add_argument("--token")
    ap.add_argument("--stdout", action="store_true")
    a = ap.parse_args()
    e = env_datei(HOME / ".klassen-zugang.env")
    url = a.url or os.environ.get("WORKER_URL") or e.get("WORKER_URL", "")
    token = a.token or os.environ.get("ADMIN_TOKEN") or e.get("ADMIN_TOKEN", "")
    if not url or not token:
        print("noch nicht eingerichtet (WORKER_URL/ADMIN_TOKEN fehlen); nichts zu tun")
        return 0
    md = bauen(holen(url, token, a.von, a.bis))
    if a.stdout:
        print(md)
        return 0
    ABLAGE.mkdir(parents=True, exist_ok=True)
    ziel = ABLAGE / f"messung-{datetime.now(timezone.utc):%Y-%m-%d}.md"
    fd = os.open(ziel, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(md)
    print("geschrieben:", ziel)
    return 0


if __name__ == "__main__":
    sys.exit(main())
