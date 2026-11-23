/* Lehrer-Video: Panel läuft synchron mit. Startzeiten stehen als data-t (Sekunden) an den Abschnitten in index.html. */
(function () {
  var video = document.getElementById("lehrer-video");
  var wurzel = document.getElementById("lehrer-sync");
  var liste = document.getElementById("ls-liste");
  if (!video || !wurzel || !liste) return;
  var abschn = Array.prototype.slice.call(liste.querySelectorAll(".ls-abschnitt[data-t]"));
  if (!abschn.length) return;
  var kopf = document.getElementById("ls-kopf"), jetzt = document.getElementById("ls-jetzt"), kap = document.getElementById("ls-kap"), panel = document.getElementById("ls-panel");
  var leise = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var zeiten = abschn.map(function (a) { return parseFloat(a.getAttribute("data-t")) || 0; });
  var aktiv = -1, pausiertBis = 0;

  function fmt(t) { var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ":" + (s < 10 ? "0" : "") + s; }
  function springe(i) {
    try { video.currentTime = zeiten[i]; } catch (e) {}
    pausiertBis = 0; setze(i, true);
  }

  /* Panel-Struktur nur mit JS: Kopf + Liste in eine Hülle, Überschriften zu Sprung-Knöpfen */
  var huelle = document.createElement("div"); huelle.className = "ls-panel-in";
  while (panel.firstChild) huelle.appendChild(panel.firstChild);
  panel.appendChild(huelle);
  kopf.hidden = false;
  var chips = abschn.map(function (a, i) {
    var h = a.querySelector("h4"), b = document.createElement("button");
    b.type = "button"; b.className = "ls-sprung";
    var z = document.createElement("span"); z.className = "ls-zeit"; z.textContent = fmt(zeiten[i]);
    z.setAttribute("aria-hidden", "true");
    while (h.firstChild) b.appendChild(h.firstChild);
    b.appendChild(z); b.setAttribute("aria-label", "Im Video zu «" + h.textContent.trim() + "» springen, ab " + fmt(zeiten[i]));
    h.appendChild(b);
    b.addEventListener("click", function (e) { e.stopPropagation(); springe(i); });
    a.addEventListener("click", function (e) { if (e.target.closest("a,button,table")) return; springe(i); });
    var c = document.createElement("button");
    c.type = "button"; c.textContent = a.getAttribute("data-kurz") || h.textContent.trim();
    c.setAttribute("aria-label", "Kapitel " + (i + 1) + ": " + c.textContent + ", ab " + fmt(zeiten[i]));
    c.addEventListener("click", function () { springe(i); });
    kap.appendChild(c); return c;
  });
  wurzel.classList.add("sync-aktiv");

  function imBlick(a) {
    var sc = window.innerWidth > 819 ? liste : liste; /* beide Layouts: Liste ist die Scrollfläche */
    if (sc.scrollHeight <= sc.clientHeight + 2) return;
    var r = a.getBoundingClientRect(), s = sc.getBoundingClientRect();
    var ziel = sc.scrollTop + (r.top - s.top) - 8;
    if (typeof sc.scrollTo === "function") sc.scrollTo({ top: ziel, behavior: leise ? "auto" : "smooth" }); else sc.scrollTop = ziel;
  }
  function setze(i, erzwingen) {
    if (i === aktiv && !erzwingen) return;
    var neu = i !== aktiv; aktiv = i;
    abschn.forEach(function (a, k) {
      a.classList.toggle("aktiv", k === i);
      if (k === i) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      chips[k].setAttribute("aria-current", k === i ? "true" : "false");
      chips[k].classList.toggle("gesehen", k < i);
    });
    var h = abschn[i].querySelector("h4");
    jetzt.textContent = "Jetzt: " + h.textContent.replace(/\s*\d+:\d\d\s*$/, "").trim();
    if (neu || erzwingen) { if (Date.now() >= pausiertBis) imBlick(abschn[i]); }
  }
  function index(t) { var r = 0; for (var k = 0; k < zeiten.length; k++) if (t + 0.25 >= zeiten[k]) r = k; return r; }
  function tick() { setze(index(video.currentTime || 0)); }

  /* Wer selbst im Panel scrollt, wird 6 s lang nicht zurückgeholt */
  ["wheel", "touchstart"].forEach(function (ev) { liste.addEventListener(ev, function () { pausiertBis = Date.now() + 6000; }, { passive: true }); });
  ["timeupdate", "seeked", "seeking", "play", "loadedmetadata"].forEach(function (ev) { video.addEventListener(ev, tick); });
  setInterval(tick, 300); /* fängt currentTime-Sprünge ohne Ereignis ab (Video nicht geladen) */
  setze(0, true);
})();
