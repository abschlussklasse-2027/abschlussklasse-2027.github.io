/* Lehrer-Video: nummerierte Abschnittsliste (wie Kapitelliste des Hauptvideos), Abschnitte klappen auf.
   Startzeiten stehen als data-t (Sekunden) an den Abschnitten in index.html. Ohne JS: alles offen, normaler Text. */
(function () {
  var video = document.getElementById("lehrer-video");
  var wurzel = document.getElementById("lehrer-sync");
  var liste = document.getElementById("ls-liste");
  if (!video || !wurzel || !liste) return;
  var abschn = Array.prototype.slice.call(liste.querySelectorAll(".ls-abschnitt[data-t]"));
  if (!abschn.length) return;
  var leise = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var zeiten = abschn.map(function (a) { return parseFloat(a.getAttribute("data-t")) || 0; });
  var aktiv = -1, pausiertBis = 0;
  var offen = abschn.map(function () { return false; });
  var auto = abschn.map(function () { return false; });   /* von der Automatik geöffnet */
  var knoepfe = [], texte = [];

  function fmt(t) { var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ":" + (s < 10 ? "0" : "") + s; }
  function zeigen(i) {
    var a = abschn[i], o = offen[i];
    a.classList.toggle("offen", o);
    knoepfe[i].setAttribute("aria-expanded", o ? "true" : "false");
  }
  function pause() { pausiertBis = Date.now() + 8000; }
  function imBlick(a) {
    var sc = liste;
    if (sc.scrollHeight <= sc.clientHeight + 2) return;
    var r = a.getBoundingClientRect(), s = sc.getBoundingClientRect();
    var ziel = sc.scrollTop + (r.top - s.top) - 8;
    if (typeof sc.scrollTo === "function") sc.scrollTo({ top: ziel, behavior: leise ? "auto" : "smooth" }); else sc.scrollTop = ziel;
  }
  function springe(i) {
    try { video.currentTime = zeiten[i]; } catch (e) {}
    if (!offen[i]) { offen[i] = true; zeigen(i); }  /* Klick öffnet; auto[i] bleibt, falls Hand */
    auto[i] = false;
    pause(); setze(i, true);
  }
  function umschalten(i) {
    if (offen[i]) { offen[i] = false; auto[i] = false; zeigen(i); pause(); return; }
    springe(i);
  }

  abschn.forEach(function (a, i) {
    var h = a.querySelector("h4"), titel = h.textContent.trim();
    var inner = document.createElement("div"); inner.className = "ls-text-in";
    while (h.nextSibling) inner.appendChild(h.nextSibling);
    var box = document.createElement("div"); box.className = "ls-text"; box.id = "ls-text-" + i;
    box.setAttribute("role", "region"); box.setAttribute("aria-label", titel);
    box.appendChild(inner); a.appendChild(box);
    var b = document.createElement("button"); b.type = "button"; b.className = "ls-sprung";
    b.setAttribute("aria-controls", box.id); b.setAttribute("aria-expanded", "false");
    var n = document.createElement("span"); n.className = "ls-nr"; n.textContent = (i < 9 ? "0" : "") + (i + 1); n.setAttribute("aria-hidden", "true");
    var t = document.createElement("span"); t.className = "ls-titel"; t.textContent = titel;
    var z = document.createElement("span"); z.className = "ls-zeit"; z.textContent = fmt(zeiten[i]);
    var p = document.createElement("span"); p.className = "ls-pfeil"; p.setAttribute("aria-hidden", "true");
    b.appendChild(n); b.appendChild(t); b.appendChild(z); b.appendChild(p);
    b.setAttribute("aria-label", (i + 1) + ". " + titel + ", ab " + fmt(zeiten[i]));
    h.textContent = ""; h.appendChild(b);
    b.addEventListener("click", function () { umschalten(i); });
    knoepfe.push(b); texte.push(box);
  });
  wurzel.classList.add("sync-aktiv");

  function setze(i, erzwingen) {
    if (i === aktiv && !erzwingen) return;
    aktiv = i;
    abschn.forEach(function (a, k) {
      a.classList.toggle("aktiv", k === i);
      if (k === i) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
    if (Date.now() >= pausiertBis) {
      abschn.forEach(function (a, k) { if (k !== i && auto[k]) { offen[k] = false; auto[k] = false; zeigen(k); } });
      if (!offen[i]) { offen[i] = true; auto[i] = true; zeigen(i); }
    }
    if (Date.now() >= pausiertBis || erzwingen) imBlick(abschn[i]);
  }
  function index(t) { var r = 0; for (var k = 0; k < zeiten.length; k++) if (t + 0.25 >= zeiten[k]) r = k; return r; }
  function tick() { setze(index(video.currentTime || 0)); }

  ["wheel", "touchstart"].forEach(function (ev) { liste.addEventListener(ev, pause, { passive: true }); });
  ["timeupdate", "seeked", "seeking", "play", "loadedmetadata"].forEach(function (ev) { video.addEventListener(ev, tick); });
  setInterval(tick, 300);
  setze(0, true);
})();
