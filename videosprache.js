/* Wählt je nach Seitensprache das passende Video, die Untertitel und die Kapitelzeiten.
   Läuft vor app.js, video.js und lehrer-sync.js, damit diese schon die richtigen Werte sehen. */
(function () {
  var K = window.VIDEO_KONFIG, sp = window.SPRACHE || "de", w = window.WURZEL || "";
  if (!K || sp === "de") return;
  function el(id) { return document.getElementById(id); }
  var bereit = K.EN_VIDEO_BEREIT === true;
  var h1 = el("video-hinweis"), h2 = el("lehrer-video-hinweis");
  if (!bereit) { if (h1) h1.hidden = false; if (h2) h2.hidden = false; return; }
  if (sp !== "en") {
    [h1, h2].forEach(function (h) { if (h) { h.textContent = window.T("video.en", h.textContent); h.hidden = false; } });
  }
  function tausche(v, c, kapitelSel, zeiten) {
    if (!v || !c) return;
    var q = v.querySelector("source"), t = v.querySelector("track"), ver = "?v=" + (K.version || "1");
    if (q) q.setAttribute("src", w + c.mp4 + ver);
    if (t) { t.setAttribute("src", w + c.vtt + ver); t.setAttribute("srclang", "en"); t.setAttribute("label", "English"); }
    if (c.poster) v.setAttribute("poster", w + c.poster + ver);
    if (zeiten && zeiten.length) {
      var ziele = document.querySelectorAll(kapitelSel);
      Array.prototype.forEach.call(ziele, function (n, i) { if (zeiten[i] !== undefined) n.setAttribute(n.tagName === "BUTTON" ? "data-t" : "data-t", String(zeiten[i])); });
    }
    try { v.load(); } catch (e) {}
  }
  tausche(el("video"), K.en.haupt, "#kapitel button", K.en.haupt.kapitel);
  tausche(el("lehrer-video"), K.en.lehrer, "#ls-liste .ls-abschnitt[data-t]", K.en.lehrer.abschnitte);
})();
