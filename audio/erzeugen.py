#!/usr/bin/env python3
"""Erzeugt audio/<sprache>.mp3, audio/manifest.json und audio/TEXTE.md fuer die Vorlese-Funktion der Klassenseite.

Technik wie brauckmann.ch/blog: Azure Speech (Dragon-HD-Stimmen), REST. Der Schluessel steht NICHT hier, sondern in der
Datei, die AZURE_ENV_DATEI nennt (Standard ~/TradingAgents/.env, Zeilen AZURE_SPEECH_KEY / AZURE_SPEECH_REGION).

Ablauf:  1. Haupttext je Sprache aus der gebauten Seite (/, /en/ ...) holen, mit derselben Auswahl wie sprache.js
            (main, ohne nav/footer/form/Kapitelliste/Tabellen/aria-hidden/hidden), zusaetzlich ohne die Datenblaetter der
            KI-Helfer (Typ, Takt, Skills) und ohne Zaehler/Zeitmarken der Kapitelliste.
         2. Text saeubern (Emojis, Symbole, URLs), in Abschnitte teilen, je Abschnitt eine Synthese (SSML, Pausen).
         3. ffmpeg: 0,4 s Pause zwischen Abschnitten, -16 LUFS, mono, 96 kbit/s.
Aufruf:  python3 audio/erzeugen.py [--nur de,en] [--neu] [--trocken]
         Ohne --neu werden Sprachen uebersprungen, deren Text-Hash sich nicht geaendert hat (steht in TEXTE.md/manifest).
         Extraktion braucht Playwright (z. B. ~/TradingAgents/.venv/bin/python audio/erzeugen.py).
Kosten:  Azure 22 USD je 1 Mio. Zeichen (Dragon HD), bei rund 9000 Zeichen je Sprache etwa 0,20 USD."""
import argparse, hashlib, json, os, pathlib, re, subprocess, sys, tempfile, urllib.request, urllib.error
from datetime import date
from xml.sax.saxutils import escape

ROOT = pathlib.Path(__file__).resolve().parent.parent
AUDIO = ROOT / "audio"
STAND = date.today().isoformat()
USD_PRO_MIO = 22.0
STIMMEN = {  # code: (Locale, Stimme)  warm, freundlich, weiblich (einheitlich)
    "de": ("de-DE", "de-DE-Seraphina:DragonHDLatestNeural"),
    "en": ("en-US", "en-US-Ava:DragonHDLatestNeural"),
    "fr": ("fr-FR", "fr-FR-Vivienne:DragonHDLatestNeural"),
    "it": ("it-IT", "it-IT-Isabella:DragonHDLatestNeural"),
    "es": ("es-ES", "es-ES-Ximena:DragonHDLatestNeural"),
    "tr": ("tr-TR", "tr-TR-Seda:DragonLatestNeural"),
    "pl": ("pl-PL", "pl-PL-Agnieszka:DragonLatestNeural"),
    "uk": ("uk-UA", "uk-UA-PolinaNeural"),
}
SEITE = {c: ("index.html" if c == "de" else c + "/index.html") for c in STIMMEN}
FORMAT = "audio-24khz-96kbitrate-mono-mp3"
MAXZ = 1400  # Zeichen je Abschnitt

JS = r"""() => {
  const AUS = "nav, footer, svg, script, style, video, form, #formular, #kapitel, .kapitel, .vorlesen, .sprachwahl, .vl-aus, .nachweis, table, .steck, [hidden], [aria-hidden='true']";
  const haupt = document.querySelector("main"); if (!haupt) return [];
  const sauber = e => { const c = e.cloneNode(true);
    c.querySelectorAll("[aria-hidden='true'], .stat, .ls-nr, .ls-zeit, .ls-pfeil, svg, script, style").forEach(x => x.remove());
    return (c.textContent || "").replace(/\s+/g, " ").trim(); };
  const out = []; let dt = "";
  haupt.querySelectorAll("h1, h2, h3, h4, p, li, dt, dd, figcaption, summary").forEach(e => {
    if (e.closest(AUS)) return;
    if (e.querySelector("p, li, h2, h3, h4")) return;
    const t = sauber(e);
    if (e.tagName === "DT") { dt = t; return; }
    if (e.tagName === "DD") { out.push((dt ? dt + ": " : "") + t); dt = ""; return; }
    if (t.length > 1) out.push(t);
  });
  const kopf = document.querySelector("header h1");
  if (kopf) out.unshift(sauber(kopf));
  return out;
}"""

def holen(codes):
    from playwright.sync_api import sync_playwright
    res = {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        for c in codes:
            pg = b.new_page()
            pg.goto("file://" + str(ROOT / SEITE[c])); pg.wait_for_timeout(1000)
            res[c] = pg.evaluate(JS)
            pg.close()
        b.close()
    return res

EMOJI = re.compile("[\U0001F000-\U0001FFFF←-⇿⌀-⏿①-➿⤀-⯿️‍•■-◿]")
def saeubern(t):
    t = re.sub(r"https?://\S+|www\.\S+", "", t)
    t = EMOJI.sub(" ", t)
    t = t.replace("·", ",").replace("|", ",").replace("•", " ").replace(" ", " ")
    t = re.sub(r"\(\s*\)", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    if t and not re.search(r"[.!?…:;»“”\"')]$", t):
        t += "."
    return t

def abschnitte(bloecke):
    """Liste von Abschnitten, je Abschnitt Liste (Text, Pause_ms). Ueberschrift-artige kurze Bloecke bekommen laengere Pause."""
    chunks, cur, n = [], [], 0
    for t in bloecke:
        teile = [t]
        if len(t) > MAXZ:
            teile = re.findall(r"[^.!?…]+[.!?…]*\s*", t);
        for x in teile:
            x = x.strip()
            if not x: continue
            if cur and n + len(x) > MAXZ:
                chunks.append(cur); cur, n = [], 0
            cur.append(x); n += len(x)
    if cur: chunks.append(cur)
    return chunks

def ssml(loc, stimme, teile):
    inner = '<break time="400ms"/>'.join(escape(t) for t in teile)
    return (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{loc}">'
            f'<voice name="{stimme}">{inner}</voice></speak>')

def zugang():
    datei = pathlib.Path(os.environ.get("AZURE_ENV_DATEI", "~/TradingAgents/.env")).expanduser()
    w = {}
    for z in datei.read_text(encoding="utf-8").splitlines():
        for k in ("AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"):
            if z.startswith(k + "="): w[k] = z.split("=", 1)[1].strip().strip("\"'")
    return w["AZURE_SPEECH_KEY"], w["AZURE_SPEECH_REGION"]

def synth(x, key, region):
    for versuch in range(3):
        req = urllib.request.Request(f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1", data=x.encode(), method="POST",
            headers={"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
                     "X-Microsoft-OutputFormat": FORMAT, "User-Agent": "klassenseite-audio"})
        try:
            return urllib.request.urlopen(req, timeout=60).read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and versuch < 2:
                import time; time.sleep(3 * (versuch + 1)); continue
            raise RuntimeError(f"Azure {e.code}: {e.read()[:300]!r}")

def ff(*a):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *a], check=True)

def dauer(f):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)]).decode())

def zusammenfuegen(stuecke, ziel, tmp):
    ff("-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.4", str(tmp / "pause.wav"))
    liste = tmp / "liste.txt"; zeilen = []
    for i, s in enumerate(stuecke):
        w = tmp / f"s{i:03d}.wav"; ff("-i", str(s), "-ar", "24000", "-ac", "1", str(w))
        if i: zeilen.append(f"file '{tmp / 'pause.wav'}'")
        zeilen.append(f"file '{w}'")
    liste.write_text("\n".join(zeilen) + "\n")
    roh = tmp / "roh.wav"; ff("-f", "concat", "-safe", "0", "-i", str(liste), "-c", "copy", str(roh))
    m = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(roh), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    j = json.loads(m[m.rindex("{"):m.rindex("}") + 1])
    flt = (f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
           f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true,silenceremove=start_periods=1:start_threshold=-50dB")
    ff("-i", str(roh), "-af", flt, "-ar", "24000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", str(ziel))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nur", default="de,en")  # Nutzer 23.11.2026: nur Deutsch und Englisch
    ap.add_argument("--neu", action="store_true"); ap.add_argument("--trocken", action="store_true")
    a = ap.parse_args()
    codes = [c for c in a.nur.split(",") if c in STIMMEN]
    man_f = AUDIO / "manifest.json"; man = json.loads(man_f.read_text()) if man_f.exists() else {}
    texte = {c: [x for x in (saeubern(t) for t in b) if x] for c, b in holen(codes).items()}
    key = region = None; kosten = 0.0
    for c in codes:
        text = "\n".join(texte[c]); h = hashlib.sha256(text.encode()).hexdigest()[:16]; z = len(text)
        print(f"{c}: {len(texte[c])} Bloecke, {z} Zeichen, ca. {z*USD_PRO_MIO/1e6:.3f} USD, hash {h}")
        if a.trocken: continue
        if not a.neu and man.get(c, {}).get("hash") == h and (AUDIO / f"{c}.mp3").exists():
            print("  unveraendert, uebersprungen"); continue
        key, region = key and (key, region) or zugang()
        loc, st = STIMMEN[c]
        with tempfile.TemporaryDirectory() as td:
            tmp = pathlib.Path(td); st_files = []
            for i, ab in enumerate(abschnitte(texte[c])):
                f = tmp / f"a{i:03d}.mp3"; f.write_bytes(synth(ssml(loc, st, ab), key, region)); st_files.append(f)
            zusammenfuegen(st_files, AUDIO / f"{c}.mp3", tmp)
        sek = round(dauer(AUDIO / f"{c}.mp3"))
        man[c] = {"sekunden": sek, "stand": STAND, "stimme": st, "zeichen": z, "hash": h}
        (AUDIO / f"{c}.txt.tmp").write_text(text, encoding="utf-8")  # fuer TEXTE.md, wird unten entfernt
        kosten += z * USD_PRO_MIO / 1e6
        print(f"  {c}.mp3: {sek} s, {(AUDIO / f'{c}.mp3').stat().st_size // 1024} KB")
    if a.trocken: return
    man_f.write_text(json.dumps({k: man[k] for k in STIMMEN if k in man}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    L = ["# Gesprochene Texte", "",
         "Quelle: gebaute Seiten (`index.html`, `<sprache>/index.html`), Auswahl wie `sprache.js` (Haupttext), ohne KI-Helfer-Datenblaetter und Kapitelzaehler.",
         "Aendert sich Text oder Uebersetzung, `python3 audio/erzeugen.py` neu laufen lassen (nur geaenderte Sprachen werden neu erzeugt).", "",
         "| Sprache | Stimme | Zeichen | Text-Hash | Stand |", "|---|---|---|---|---|"]
    for c in STIMMEN:
        if c in man: L.append(f"| {c} | {man[c]['stimme']} | {man[c]['zeichen']} | `{man[c]['hash']}` | {man[c]['stand']} |")
    L += ["", "Gesamtkosten dieses Laufs (Azure): %.2f USD." % kosten, ""]
    for c in STIMMEN:
        t = AUDIO / f"{c}.txt.tmp"
        if t.exists():
            L += [f"## {c}", ""] + ["> " + x for x in t.read_text(encoding="utf-8").split("\n")] + [""]; t.unlink()
    (AUDIO / "TEXTE.md").write_text("\n".join(L), encoding="utf-8")
    print(f"Kosten dieses Laufs: {kosten:.3f} USD")

if __name__ == "__main__":
    main()
