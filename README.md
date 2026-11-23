# github.io
Webseite zur Abschlussparty der Klasse 2027

## Sprachen

Deutsch ist Standard (Startseite `index.html`, zugleich die Vorlage). Weitere Sprachen liegen als statische Seiten unter `/en/`, `/fr/` usw.
Alle Texte stehen in `i18n/<sprache>.json` (Schlüssel wie in `i18n/de.json`). `python3 i18n/bauen.py` prüft die Dateien, schreibt `<sprache>/index.html`,
`i18n/<sprache>.js` (Texte für Fragen, Meldungen, Vorlesen), den Hinweis über den Rechtsseiten (`recht/hinweis.js`) und passt Sprachschalter und hreflang an.
Nach jeder Textänderung in `index.html` oder den JSON-Dateien neu bauen und die erzeugten Dateien mitcommitten.
Sprache merkt sich der Browser (localStorage), `?lang=xx` geht auch. Die Rechtsseiten bleiben deutsch (verbindlich); von anderen Sprachseiten aus zeigen sie oben einen Hinweis.

Videos: `videokonfig.js`. Solange `EN_VIDEO_BEREIT: false` ist, zeigen alle Nicht-DE-Seiten das deutsche Video mit dem Hinweis, dass das englische folgt.
Mit `true` laufen auf allen Nicht-DE-Seiten die englischen Dateien (`video/en/abschlussparty-en.mp4` + `.vtt` + Poster, `video/en/spielregeln-teachers-en.mp4` + `.vtt` + Poster)
mit englischen Untertiteln. Vorher die Kapitelzeiten `kapitel` (11 Werte) und `abschnitte` (9 Werte) in Sekunden eintragen, sonst gelten die deutschen Zeiten.
