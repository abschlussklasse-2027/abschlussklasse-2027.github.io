/* Sprache festlegen, bevor die Seite gezeichnet wird (kleines blockierendes Skript im Kopf).
   Vorrang: ?lang=xx in der Adresse, dann die Seite selbst (/en/ usw.), auf der Startseite zuletzt die gemerkte Sprache.
   Gemerkt wird im Browser (localStorage), sonst nichts, nichts geht an Dritte. */
(function () {
  var L = ["de", "en", "fr", "it", "es", "tr", "pl", "uk"], KEY = "abschlussparty-sprache";
  var h = document.documentElement, root = h.getAttribute("data-root") || "", cur = h.lang || "de";
  var m = /[?&]lang=([a-z]{2})(?:&|$)/.exec(location.search), p = m && L.indexOf(m[1]) > -1 ? m[1] : null;
  var gem = null;
  try { gem = localStorage.getItem(KEY); } catch (e) {}
  if (L.indexOf(gem) < 0) gem = null;
  var ziel = p || (root === "" && cur === "de" ? gem : null);
  try { if (p || root !== "") localStorage.setItem(KEY, p || cur); } catch (e) {}
  if (ziel && ziel !== cur) {
    window.SPRACHE_UMLEITUNG = true;   /* die Messung zählt diese Seite dann nicht */
    location.replace(root + (ziel === "de" ? "" : ziel + "/") + location.hash);
  }
})();
