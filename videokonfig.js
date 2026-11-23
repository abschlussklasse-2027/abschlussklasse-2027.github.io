/* Videos je Sprache. Deutsch: immer das deutsche Video.
   Alle anderen Sprachen: das englische Video mit englischen Untertiteln, sobald EN_VIDEO_BEREIT true ist.
   Solange false, zeigen die Seiten das deutsche Video mit dem Hinweis "English video follows shortly". (abschnitte: 8 Werte für die 8 Panel-Abschnitte Plan, Kinder, Ablauf, Blockiert, Prüfung, Datenschutz, KI-Rolle, Schluss)
   Pfade sind relativ zur Startseite. kapitel = Startzeiten in Sekunden der 11 Kapitel des Hauptvideos
   (gleiche Reihenfolge wie die Kapitelliste), abschnitte = Startzeiten der 8 Abschnitte des Lehrer-Panels.
   Sind sie null, bleiben die deutschen Zeiten (dann zuerst eintragen!). */
window.VIDEO_KONFIG = {
  EN_VIDEO_BEREIT: true,
  en: {
    haupt: {
      mp4: "video/en/abschlussparty-en.mp4",
      vtt: "video/en/abschlussparty-en.vtt",
      poster: "video/en/abschlussparty-en-poster.jpg",
      kapitel: [0, 11.8, 24.7, 45.7, 54.6, 73.2, 112.1, 118.3, 125.9, 175.7, 188.6]
    },
    lehrer: {
      mp4: "video/en/spielregeln-teachers-en.mp4",
      vtt: "video/en/spielregeln-teachers-en.vtt",
      poster: "video/en/spielregeln-teachers-en-poster.jpg",
      abschnitte: [0, 14.9, 28.1, 70.8, 88.5, 113.6, 127.2, 164.1]
    }
  },
  version: "en2"
};
