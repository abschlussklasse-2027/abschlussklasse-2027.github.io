#!/usr/bin/env python3
"""Baut aus der deutschen Startseite (index.html, Vorlage mit data-i18n-Schlüsseln) die Sprachseiten.

Quelle der Wahrheit:  index.html (Deutsch) und i18n/<sprache>.json (Schlüssel -> Text, de.json ist die Vorlage).
Erzeugt:              <sprache>/index.html   statische Sprachseite (EN unter /en/ usw.), fertig übersetzt, ohne Skript lesbar
                      i18n/<sprache>.js      dieselben Texte für die Teile, die per Skript entstehen (Fragen, Meldungen, Vorlesen)
                      recht/hinweis.js       Satz über den Rechtsseiten (nur Deutsch) je Sprache
Außerdem passt es die Sprachliste im Schalter und die hreflang-Zeilen der Startseite an die vorhandenen Sprachen an.
Aufruf:               python3 i18n/bauen.py        (im Repo-Hauptordner; danach committen)
Neue Sprache:         i18n/xx.json anlegen (alle Schlüssel wie de.json), in SPRACHEN unten eintragen, bauen."""
import json, re, sys, html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASIS = "https://abschlussklasse-2027.github.io/"
SPRACHEN = [  # code, Eigenname, Suchwörter, og:locale
    ("de", "Deutsch", "deutsch german allemand", "de_DE"),
    ("en", "English", "english englisch anglais", "en_US"),
    ("fr", "Français", "français francais french französisch", "fr_FR"),
    ("it", "Italiano", "italiano italian italienisch", "it_IT"),
    ("es", "Español", "español espanol spanish spanisch", "es_ES"),
    ("tr", "Türkçe", "türkçe turkce turkish türkisch", "tr_TR"),
    ("pl", "Polski", "polski polish polnisch", "pl_PL"),
    ("uk", "Українська", "українська ukrainska ukrainian ukrainisch", "uk_UA"),
]

def laden(code):
    f = ROOT / "i18n" / (code + ".json")
    return json.load(open(f, encoding="utf-8")) if f.exists() else None

def pruefen(code, de, t):
    fehler = []
    for k, a in de.items():
        b = t.get(k)
        if not isinstance(b, str) or not b.strip():
            fehler.append("fehlt/leer: " + k); continue
        if sorted(re.findall(r"\{\w\}", a)) != sorted(re.findall(r"\{\w\}", b)): fehler.append("Platzhalter: " + k)
        if sorted(re.findall(r"</?(?:b|strong|a)\b", a)) != sorted(re.findall(r"</?(?:b|strong|a)\b", b)): fehler.append("Tags: " + k)
        if sorted(re.findall(r'href="[^"]*"', a)) != sorted(re.findall(r'href="[^"]*"', b)): fehler.append("href: " + k)
    fehler += ["überzählig: " + k for k in t if k not in de]
    return fehler

def esc_attr(v):
    return html.escape(v, quote=True)

def uebersetzen(master, t, code, tief):
    s = master
    # 1. Innentexte
    def inner(m):
        tag, vor, key, nach = m.group(1), m.group(2), m.group(3), m.group(4)
        return "<%s%s data-i18n=\"%s\"%s>%s</%s>" % (tag, vor, key, nach, t[key], tag)
    s = re.sub(r'<(\w+)((?:[^>"\']|"[^"]*"|\'[^\']*\')*?) data-i18n="([^"]+)"((?:[^>"\']|"[^"]*"|\'[^\']*\')*)>(.*?)</\1>', lambda m: inner(m), s, flags=re.S)
    # 2. Attribute
    def attrs(m):
        tag = m.group(0)
        spec = re.search(r'data-i18n-a="([^"]+)"', tag).group(1)
        for paar in spec.split(";"):
            a, key = paar.split(":", 1)
            tag = re.sub(r'(\s%s=)"[^"]*"' % re.escape(a), lambda mm: '%s"%s"' % (mm.group(1), esc_attr(html.unescape(t[key]))), tag, count=1)
        return tag
    s = re.sub(r'<\w+(?:[^>"\']|"[^"]*"|\'[^\']*\')*? data-i18n-a="[^"]+"(?:[^>"\']|"[^"]*"|\'[^\']*\')*>', attrs, s)
    # 3. Meta
    def meta(m):
        tag = m.group(0); key = re.search(r'data-i18n-meta="([^"]+)"', tag).group(1)
        return re.sub(r'(content=)"[^"]*"', lambda mm: '%s"%s"' % (mm.group(1), esc_attr(html.unescape(t[key]))), tag, count=1)
    s = re.sub(r'<meta [^>]*data-i18n-meta="[^"]+"[^>]*>', meta, s)
    loc = {c: l for c, _, _, l in SPRACHEN}[code]
    s = s.replace('<html lang="de" data-root="">', '<html lang="%s" data-root="%s">' % (code, tief))
    s = s.replace('content="de_DE"', 'content="%s"' % loc)
    s = s.replace('property="og:url" content="%s"' % BASIS, 'property="og:url" content="%s%s/"' % (BASIS, code))
    # 3b. Rückmeldung der Schule gibt es nur auf Deutsch und Englisch; die anderen Sprachseiten zeigen Englisch (Sprache am Block kennzeichnen)
    if code not in ("de", "en"):
        s = s.replace('<div class="freigabe" id="schulfreigabe"', '<div class="freigabe" id="schulfreigabe" lang="en"', 1)
    # 4. Rechtsseiten: mit ?lang=xx, damit dort der Hinweis erscheint
    s = re.sub(r'href="(recht/[^"?#]+)"', lambda m: 'href="%s?lang=%s"' % (m.group(1), code), s)
    # 5. Pfade eine Ebene tiefer
    def pfad(m):
        a, v = m.group(1), m.group(2)
        if re.match(r"(https?:|mailto:|tel:|data:|#|/|\.\./)", v) or v == "": return m.group(0)
        return '%s="%s%s"' % (a, tief, v)
    s = re.sub(r'\b(href|src|poster)="([^"]*)"', pfad, s)
    s = s.replace('i18n/de.js', 'i18n/%s.js' % code).replace('"%si18n/de.js"' % tief, '"%si18n/%s.js"' % (tief, code))
    return s

def liste_und_hreflang(master, codes):
    s = master
    lis = "\n".join('      <li><a href="%s" lang="%s" hreflang="%s" data-code="%s" data-suche="%s">%s<span>%s</span></a></li>'
                    % ("?lang=de" if c == "de" else c + "/", c, c, c, su, n, c.upper()) for c, n, su, _ in SPRACHEN if c in codes)
    s = re.sub(r'(<ul class="sw-liste" id="sw-liste">\n).*?(\n    </ul>)', lambda m: m.group(1) + lis + m.group(2), s, flags=re.S)
    alts = "".join('<link rel="alternate" hreflang="%s" href="%s%s">\n' % (c, BASIS, "" if c == "de" else c + "/") for c in [x[0] for x in SPRACHEN if x[0] in codes])
    alts += '<link rel="alternate" hreflang="x-default" href="%s">\n' % BASIS
    s = re.sub(r'(?:<link rel="alternate" hreflang="[^"]+" href="[^"]+">\n)+', lambda m: alts, s, count=1)
    return s

def main():
    de = laden("de")
    fertig, meldung = ["de"], []
    sprachen = {"de": de}
    for c, *_ in SPRACHEN[1:]:
        t = laden(c)
        if t is None: continue
        f = pruefen(c, de, t)
        if f:
            meldung.append("%s: %d Fehler, übersprungen (%s ...)" % (c, len(f), "; ".join(f[:4]))); continue
        sprachen[c] = t; fertig.append(c)
    master = (ROOT / "index.html").read_text(encoding="utf-8")
    master2 = liste_und_hreflang(master, fertig)
    if master2 != master:
        (ROOT / "index.html").write_text(master2, encoding="utf-8"); master = master2
    for c, t in sprachen.items():
        (ROOT / "i18n" / (c + ".js")).write_text("/* erzeugt von i18n/bauen.py aus %s.json, nicht von Hand ändern */\nwindow.I18N = %s;\n" % (c, json.dumps(t, ensure_ascii=False, indent=1)), encoding="utf-8")
        if c == "de": continue
        d = ROOT / c; d.mkdir(exist_ok=True)
        (d / "index.html").write_text(uebersetzen(master, t, c, "../"), encoding="utf-8")
    # Hinweis über den Rechtsseiten
    tab = {c: {"h": t["recht.hinweis"], "z": t["recht.zurueck"]} for c, t in sprachen.items() if c != "de"}
    (ROOT / "recht" / "hinweis.js").write_text(
        "/* erzeugt von i18n/bauen.py. Zeigt über den Rechtsseiten einen Satz in der Sprache, aus der man kommt (?lang=xx).\n   Die Rechtstexte selbst bleiben unverändert Deutsch und verbindlich. */\n"
        "(function () {\n  var T = %s;\n"
        "  var m = /[?&]lang=([a-z]{2})(?:&|$)/.exec(location.search), l = m && T[m[1]] ? m[1] : null;\n"
        "  if (!l) return;\n"
        "  var haupt = document.getElementById('inhalt'); if (!haupt) return;\n"
        "  var p = document.createElement('p'); p.className = 'stand'; p.lang = l; p.setAttribute('role', 'note'); p.textContent = T[l].h;\n"
        "  haupt.insertBefore(p, haupt.firstChild);\n"
        "  Array.prototype.forEach.call(document.querySelectorAll('a[href=\"../index.html\"]'), function (a) {\n"
        "    a.setAttribute('href', '../' + l + '/'); if (a.className === 'zurueck' || /^\\u2190/.test(a.textContent)) { a.textContent = T[l].z; a.lang = l; }\n"
        "  });\n})();\n" % json.dumps(tab, ensure_ascii=False), encoding="utf-8")
    print("Sprachen gebaut:", ", ".join(fertig))
    for m in meldung: print("WARNUNG", m)
    return 1 if meldung else 0

if __name__ == "__main__":
    sys.exit(main())
