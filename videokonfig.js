/* Videos je Sprache. Deutsch: immer das deutsche Video.
   Alle anderen Sprachen: das englische Video mit englischen Untertiteln, sobald EN_VIDEO_BEREIT true ist.
   Solange false, zeigen die Seiten das deutsche Video mit dem Hinweis "English video follows shortly".
   Pfade sind relativ zur Startseite. kapitel = Startzeiten in Sekunden der 11 Kapitel des Hauptvideos
   (gleiche Reihenfolge wie die Kapitelliste), abschnitte = Startzeiten der 9 Abschnitte des Lehrer-Videos.
   Sind sie null, bleiben die deutschen Zeiten (dann zuerst eintragen!). */
window.VIDEO_KONFIG = {
  EN_VIDEO_BEREIT: false,
  en: {
    haupt: {
      mp4: "video/en/abschlussparty-en.mp4",
      vtt: "video/en/abschlussparty-en.vtt",
      poster: "video/en/abschlussparty-en-poster.jpg",
      kapitel: null
    },
    lehrer: {
      mp4: "video/en/spielregeln-teachers-en.mp4",
      vtt: "video/en/spielregeln-teachers-en.vtt",
      poster: "video/en/spielregeln-teachers-en-poster.jpg",
      abschnitte: null
    }
  },
  version: "r4"
};
