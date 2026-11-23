/* Anonyme Nutzungsmessung (Forschung: Klicken Besucher sofort weg, wenn sie einen Avatar sehen?).
   Datensparsam: KEINE Cookies, KEIN localStorage/sessionStorage, KEINE Geräte- oder Personen-IDs, kein Fingerprinting.
   Zähler leben nur flüchtig im Arbeitsspeicher dieser Seite. Gesendet werden Ereignisse ohne Personenbezug (Name + grobes Merkmal)
   an den Sammelpunkt (POST /m), der nur aggregierte Tageszähler hochzählt. Do-Not-Track / Global Privacy Control: dann wird nichts gesendet.
   Fehlertolerant: ist der Sammelpunkt nicht erreichbar, passiert nichts (keine Fehlermeldung, die Seite läuft normal). */
(function () {
  window.messen = function () {};            /* Platzhalter, damit andere Skripte gefahrlos aufrufen können */
  var nav = navigator;
  if (nav.doNotTrack === "1" || window.doNotTrack === "1" || nav.msDoNotTrack === "1" || nav.globalPrivacyControl === true) return;
  if (window.SPRACHE_UMLEITUNG) return;       /* Seite leitet gleich in die gemerkte Sprache weiter: nicht doppelt zählen */
  var basis = window.sammelpunktUrl && window.sammelpunktUrl();
  if (!basis || !window.fetch) return;
  var sp = window.SPRACHE || "de";
  var warteschlange = [], timer = null, gesendetEnde = false;

  function senden(liste) {
    if (!liste.length) return;
    try {
      /* text/plain: einfache Anfrage ohne Preflight; credentials omit: keine Cookies; keepalive: übersteht das Schließen der Seite */
      fetch(basis + "/m", { method: "POST", body: JSON.stringify({ e: liste }), keepalive: true, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" })
        .then(function () {}, function () {});
    } catch (e) {}
  }
  function leeren() {
    clearTimeout(timer); timer = null;
    while (warteschlange.length) senden(warteschlange.splice(0, 25));
  }
  function ereignis(name, merkmal) {
    warteschlange.push([name, String(merkmal)]);
    if (warteschlange.length >= 20) leeren();
    else if (!timer) timer = setTimeout(leeren, 5000);
  }
  window.messen = ereignis;

  var mobil = false;
  try { mobil = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) <= 1024); } catch (e) {}
  ereignis("seite", sp + "|" + (mobil ? "mobil" : "desktop"));
  leeren();                                   /* Seitenaufruf sofort */

  /* ---- Besuchsdauer (sichtbare Zeit bis zum ersten Verlassen) ---- */
  var sichtbarSeit = document.visibilityState === "hidden" ? 0 : Date.now(), summe = 0;
  function dauerKlasse(s) { return s < 5 ? "<5s" : s < 15 ? "5-15s" : s < 60 ? "15-60s" : s < 180 ? "1-3min" : ">3min"; }

  /* ---- Scrolltiefe ---- */
  var scrollGesehen = {}, scrollWarte = false;
  function scrollPruefen() {
    scrollWarte = false;
    var d = document.documentElement, hoehe = Math.max(d.scrollHeight, document.body ? document.body.scrollHeight : 0);
    if (!hoehe) return;
    var p = ((window.pageYOffset || d.scrollTop || 0) + (window.innerHeight || d.clientHeight)) / hoehe * 100;
    [25, 50, 75, 100].forEach(function (s) {
      if (!scrollGesehen[s] && p >= (s === 100 ? 98 : s)) { scrollGesehen[s] = true; ereignis("scroll", s); }
    });
  }
  window.addEventListener("scroll", function () { if (!scrollWarte) { scrollWarte = true; setTimeout(scrollPruefen, 250); } }, { passive: true });

  /* ---- Video (haupt / lehrer) ---- */
  function zeitKlasse(s) { return s < 3 ? "<3s" : s < 10 ? "3-10s" : s < 30 ? "10-30s" : s < 60 ? "30-60s" : s < 120 ? "60-120s" : ">120s"; }
  var videos = [];
  function videoVerfolgen(v, art, startzeiten) {
    if (!v) return;
    var z = { v: v, art: art, spielt: 0, letzte: null, max: 0, gestartet: false, ende: false, meilen: {}, zeiten: startzeiten };
    videos.push(z);
    v.addEventListener("playing", function () {
      z.letzte = v.currentTime;
      if (!z.gestartet) { z.gestartet = true; ereignis("video_start", art + "|" + sp); }
    });
    v.addEventListener("timeupdate", function () {
      if (v.paused || v.seeking || z.letzte === null) { z.letzte = v.currentTime; return; }
      var d = v.currentTime - z.letzte;
      if (d > 0 && d < 1.5) z.spielt += d;        /* nur echte Abspielzeit, Sprünge zählen nicht */
      z.letzte = v.currentTime;
      if (v.currentTime > z.max) z.max = v.currentTime;
      if (v.duration > 0 && isFinite(v.duration)) {
        var p = v.currentTime / v.duration * 100;
        [25, 50, 75, 100].forEach(function (s) {
          if (!z.meilen[s] && p >= (s === 100 ? 97 : s)) { z.meilen[s] = true; ereignis("video_meilenstein", art + "|" + sp + "|" + s); }
        });
      }
    });
    v.addEventListener("ended", function () { z.ende = true; });
    v.addEventListener("seeked", function () { z.letzte = v.currentTime; });
  }
  function kapitelIndex(z) {
    var zeiten = z.zeiten(), t = z.v.currentTime, r = 0;
    for (var i = 0; i < zeiten.length; i++) if (t + 0.25 >= zeiten[i]) r = i;
    return Math.min(r, 15);
  }
  function zeitenAus(sel, attr) {
    return function () { return Array.prototype.map.call(document.querySelectorAll(sel), function (n) { return parseFloat(n.getAttribute(attr)) || 0; }); };
  }
  videoVerfolgen(document.getElementById("video"), "haupt", zeitenAus("#kapitel button", "data-t"));
  videoVerfolgen(document.getElementById("lehrer-video"), "lehrer", zeitenAus("#ls-liste .ls-abschnitt[data-t]", "data-t"));

  /* Klick auf Kapitelliste (Hauptvideo) bzw. Abschnittsliste (Lehrer-Video) */
  var kap = document.getElementById("kapitel");
  if (kap) {
    var kb = Array.prototype.slice.call(kap.querySelectorAll("button"));
    kap.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("button"), i = kb.indexOf(b); if (i > -1) ereignis("kapitelklick", "haupt|k" + Math.min(i, 15)); });
  }
  var lsl = document.getElementById("ls-liste");
  if (lsl) lsl.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".ls-sprung"); if (!b) return;
    var a = b.closest(".ls-abschnitt"), i = Array.prototype.indexOf.call(lsl.querySelectorAll(".ls-abschnitt[data-t]"), a);
    if (i > -1) ereignis("kapitelklick", "lehrer|k" + Math.min(i, 15));
  });

  /* Sprachschalter: Klick auf eine andere Sprache (Name der Quelle und des Ziels, sonst nichts) */
  var sl = document.getElementById("sw-liste");
  if (sl) sl.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a"), c = a && a.getAttribute("data-code");
    if (c && c !== sp) ereignis("sprachschalter", sp + ">" + c);
  });

  /* Lehrer-Bereich: aufgeklappt (Klick auf die Zeile oder Direktlink) und sichtbar im Bild */
  var ld = document.getElementById("lehrer-details");
  if (ld) {
    var sm = ld.querySelector("summary");
    if (sm) sm.addEventListener("click", function () { setTimeout(function () { if (ld.open) ereignis("lehrer", "geoeffnet|" + sp); }, 0); });
    window.addEventListener("hashchange", function () { if (location.hash === "#lehrer") ereignis("lehrer", "geoeffnet|" + sp); });
  }
  var lb = document.getElementById("lehrer");
  if (lb && window.IntersectionObserver) {
    var io = new IntersectionObserver(function (l) {
      if (l.some(function (x) { return x.isIntersecting; })) { ereignis("lehrer", "sichtbar|" + sp); io.disconnect(); }
    }, { rootMargin: "-150px 0px -150px 0px", threshold: 0 });
    io.observe(lb);
  }

  /* ---- Verlassen: Dauer, Video-Zusammenfassung, dann alles senden (einmal je Seitenaufruf) ---- */
  function abschluss() {
    if (gesendetEnde) return;
    gesendetEnde = true;
    if (sichtbarSeit) summe += (Date.now() - sichtbarSeit) / 1000;
    ereignis("dauer", dauerKlasse(summe));
    videos.forEach(function (z) {
      if (!z.gestartet) return;
      ereignis("video_zeit", z.art + "|" + sp + "|" + zeitKlasse(z.spielt));
      if (!z.ende) ereignis("video_abbruch", z.art + "|" + sp + "|t" + Math.min(30, Math.floor(z.v.currentTime / 10)));
      ereignis("video_kapitel", z.art + "|" + sp + "|k" + kapitelIndex(z));
    });
    leeren();
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { if (sichtbarSeit) { summe += (Date.now() - sichtbarSeit) / 1000; sichtbarSeit = 0; } abschluss(); }
    else if (!sichtbarSeit) sichtbarSeit = Date.now();
  });
  window.addEventListener("pagehide", abschluss);
})();
