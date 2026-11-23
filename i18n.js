/* Übersetzungen für die Teile, die per Skript entstehen (Fragen, Meldungen).
   Die festen Texte stehen schon fertig übersetzt im HTML jeder Sprachseite (siehe i18n/bauen.py).
   Fehlt ein Schlüssel, gilt der mitgegebene deutsche Text. */
(function () {
  window.SPRACHE = document.documentElement.lang || "de";
  window.WURZEL = document.documentElement.getAttribute("data-root") || "";
  window.T = function (k, fb, v) {
    var d = window.I18N || {}, s = d[k] !== undefined ? d[k] : (fb !== undefined ? fb : k);
    if (v) for (var n in v) s = s.split("{" + n + "}").join(v[n]);
    return s;
  };
})();
