/* Sprachschalter (Dropdown mit Suche), Neon-Hinweis und Vorlese-Pille (vorab erzeugte Audiodatei audio/<sprache>.mp3, keine Browser-Stimme). */
(function () {
  var sp = window.SPRACHE || "de", T = window.T || function (k, fb) { return fb; };
  function $(id) { return document.getElementById(id); }

  /* ---------- Sprachschalter ---------- */
  var knopf = $("sw-knopf"), panel = $("sw-panel"), suche = $("sw-suche"), liste = $("sw-liste"), leer = $("sw-leer");
  if (knopf && panel && liste) {
    var eintraege = Array.prototype.slice.call(liste.querySelectorAll("a"));
    var code = $("sw-code");
    eintraege.forEach(function (a) {
      var c = a.getAttribute("data-code");
      if (c === sp) { a.setAttribute("aria-current", "true"); if (code) code.textContent = (a.firstChild.textContent || sp).trim(); }
      var h = a.getAttribute("href");
      if (window.WURZEL) a.setAttribute("href", c === "de" ? window.WURZEL + "?lang=de" : window.WURZEL + c + "/");
    });
    var offen = false;
    function zeigen(auf) {
      offen = auf; panel.hidden = !auf; knopf.setAttribute("aria-expanded", auf ? "true" : "false");
      if (auf) { suche.value = ""; filtern(); setTimeout(function () { try { suche.focus({ preventScroll: true }); } catch (e) {} }, 30); }
    }
    function filtern() {
      var q = suche.value.trim().toLowerCase(), n = 0;
      eintraege.forEach(function (a) {
        var t = (a.textContent + " " + a.getAttribute("data-suche") + " " + a.getAttribute("data-code")).toLowerCase();
        var ok = !q || t.indexOf(q) > -1; a.parentNode.hidden = !ok; if (ok) n++;
      });
      if (leer) leer.hidden = n > 0;
    }
    knopf.addEventListener("click", function () { zeigen(!offen); });
    suche.addEventListener("input", filtern);
    suche.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { var a = eintraege.filter(function (x) { return !x.parentNode.hidden; })[0]; if (a) a.click(); }
      if (e.key === "ArrowDown") { var f = eintraege.filter(function (x) { return !x.parentNode.hidden; })[0]; if (f) { e.preventDefault(); f.focus(); } }
    });
    liste.addEventListener("keydown", function (e) {
      var v = eintraege.filter(function (x) { return !x.parentNode.hidden; }), i = v.indexOf(document.activeElement);
      if (e.key === "ArrowDown" && i < v.length - 1) { e.preventDefault(); v[i + 1].focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); if (i > 0) v[i - 1].focus(); else suche.focus(); }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && offen) { zeigen(false); knopf.focus(); } });
    document.addEventListener("click", function (e) { if (offen && !$("sprachwahl").contains(e.target)) zeigen(false); });

    /* ---------- Hinweis auf den Schalter und die Pille ----------
       Bis zum ersten Klick (je Sitzung gemerkt): Sprechblase bei jedem Laden, Lichtlauf alle ~6 s (die ersten 60 s), danach alle ~20 s.
       Bei reduzierter Bewegung ersetzt das CSS den Lichtlauf durch sanftes Pulsieren im gleichen Takt. */
    var reduziert = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var tipp = $("sw-tipp"), tt = $("sw-tipp-t");
    function lese(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
    function schreibe(k) { try { window.sessionStorage.setItem(k, "1"); } catch (e) {} }
    var verstecken = function () {};
    if (tipp && tt && !lese("abschlussparty-sw-klick")) {
      var wort = (tt.getAttribute("data-wechsel") || "").split("|").filter(Boolean), wi = 0, wt = null, zt = null, aus = null;
      verstecken = function () {
        clearInterval(wt); clearTimeout(zt); clearTimeout(aus);
        tipp.classList.remove("zeigen"); setTimeout(function () { tipp.hidden = true; }, 450);
      };
      zt = setTimeout(function () {
        if (offen) return;
        tipp.hidden = false; void tipp.offsetWidth; tipp.classList.add("zeigen");
        if (!reduziert && wort.length > 1) {
          wt = setInterval(function () {
            tt.classList.add("aus");
            setTimeout(function () { wi = (wi + 1) % wort.length; tt.textContent = wort[wi]; tt.classList.remove("aus"); }, 260);
          }, 1300);
        }
        aus = setTimeout(verstecken, 6000);
      }, 1200);
      tipp.addEventListener("click", verstecken);
    }
    function hinweisLauf(el, schluessel) {
      if (!el || lese(schluessel)) return;
      var stopp = false, start = Date.now();
      function blitz() { if (stopp) return; if (!el.hidden) { el.classList.add("sw-hinweis"); setTimeout(function () { el.classList.remove("sw-hinweis"); }, 2300); } }
      function plane() {
        if (stopp) return;
        setTimeout(function () { blitz(); plane(); }, Date.now() - start < 60000 ? 6000 : 20000);
      }
      el.addEventListener("click", function () { stopp = true; schreibe(schluessel); el.classList.remove("sw-hinweis"); });
      setTimeout(function () { blitz(); plane(); }, 1500);
    }
    hinweisLauf(knopf, "abschlussparty-sw-klick");
    knopf.addEventListener("click", function () { schreibe("abschlussparty-sw-klick"); verstecken(); });
    window.__hinweisLauf = hinweisLauf;
  }

  /* ---------- Vorlese-Pille: vorab erzeugte Audiodatei, keine Browser-Stimme ---------- */
  var box = $("vorlesen"), play = $("vl-play"), info = $("vl-info"), ico = $("vl-ico"), fort = $("vl-fort");
  if (!box || !play || !window.Audio) return;
  if (sp !== "de" && sp !== "en") return;   /* Vorlesen gibt es nur auf Deutsch und Englisch; sonst bleibt die Pille ausgeblendet */
  var WURZEL = window.WURZEL || "", DATEI = WURZEL + "audio/" + sp + ".mp3";
  var KEY = "abschlussparty-vl-" + sp, KEY_T = "abschlussparty-vl-tempo";
  var TEMPI = [0.8, 0.9, 1, 1.1, 1.25, 1.5];
  function ls(op, k, v) { try { return op === "g" ? window.localStorage.getItem(k) : (op === "s" ? window.localStorage.setItem(k, v) : window.localStorage.removeItem(k)); } catch (e) { return null; } }
  var au = null, dauer = 0, tempo = parseFloat(ls("g", KEY_T)) || 1, gemessen = false, letzteSicherung = 0;
  if (TEMPI.indexOf(tempo) < 0) tempo = 1;

  function dauerAusManifest(m) {
    if (!m || typeof m !== "object") return 0;
    var e = m[sp] !== undefined ? m[sp] : (m.sprachen && m.sprachen[sp] !== undefined ? m.sprachen[sp] : (m.dauer && m.dauer[sp]));
    if (e && typeof e === "object") e = e.dauer !== undefined ? e.dauer : (e.sekunden !== undefined ? e.sekunden : (e.dauer_s !== undefined ? e.dauer_s : e.duration));
    e = parseFloat(e);
    return e > 0 ? e : 0;
  }
  function minuten(sek) { return Math.max(1, Math.round(sek / 60)); }
  function ruhe() {
    var pos = parseFloat(ls("g", KEY)) || 0;
    info.textContent = pos > 5 && dauer && pos < dauer - 5 ? T("vl.stelle", "Weiter an der letzten Stelle") : T("vl.min", "{n} Min.", { n: dauer ? minuten(dauer) : "?" });
  }
  function ui() {
    var spielt = au && !au.paused;
    ico.setAttribute("d", spielt ? "M8 5v14M16 5v14" : "M9 5l10 7-10 7z"); ico.parentNode.style.strokeWidth = spielt ? "3.5" : "1.75";
    play.setAttribute("aria-label", spielt ? T("vl.pause", "Pause") : T("vl.start", "Seite vorlesen"));
    if (spielt) info.textContent = T("vl.rest", "noch {n} Min.", { n: minuten(Math.max(0, (dauer - au.currentTime) / (au.playbackRate || 1))) }); else ruhe();
    fort.style.strokeDasharray = (dauer && au ? Math.min(100, au.currentTime / dauer * 100) : 0).toFixed(1) + " 100";
  }
  function sichern(erzwingen) {
    if (!au) return; var jetzt = Date.now();
    if (!erzwingen && jetzt - letzteSicherung < 2000) return;
    letzteSicherung = jetzt;
    if (au.ended || (dauer && au.currentTime > dauer - 3)) ls("r", KEY); else if (au.currentTime > 1) ls("s", KEY, String(Math.floor(au.currentTime)));
  }
  function bereit(d) {
    dauer = d || dauer;
    au.playbackRate = tempo;
    var pos = parseFloat(ls("g", KEY)) || 0;
    if (pos > 5 && dauer && pos < dauer - 5) { try { au.currentTime = pos; } catch (e) {} }
    box.hidden = false; ui();
    if (window.__hinweisLauf) window.__hinweisLauf(box, "abschlussparty-vl-klick");
  }
  function start(d) {
    au = new window.Audio(); au.preload = "metadata"; au.src = DATEI;
    var gezeigt = false;
    function zeigen() { if (gezeigt) return; gezeigt = true; bereit(dauer || au.duration); }
    au.addEventListener("loadedmetadata", function () { if (!dauer && isFinite(au.duration)) dauer = au.duration; zeigen(); });
    au.addEventListener("error", function () { box.hidden = true; });   /* keine Datei: Pille bleibt weg, keine Ersatzstimme */
    au.addEventListener("timeupdate", function () { ui(); sichern(false); });
    ["play", "pause", "ended"].forEach(function (ev) { au.addEventListener(ev, function () { ui(); sichern(true); }); });
    window.addEventListener("pagehide", function () { sichern(true); });
    play.addEventListener("click", function () {
      if (!au) return;
      if (au.paused) {
        if (au.ended) au.currentTime = 0;
        var p = au.play(); if (p && p.catch) p.catch(function () {});
        if (!gemessen) { gemessen = true; if (window.messen) window.messen("vorlesen", sp); }
      } else au.pause();
    });
    dauer = d || 0;
  }

  /* Zahnrad: Tempo; (c): Hinweis zur Stimme */
  var zahn = $("vl-zahn"), pop = $("vl-pop"), urh = $("vl-urh"), urhPop = $("vl-urh-pop");
  function popup(knopfEl, p, andere, andereKnopf) {
    knopfEl.addEventListener("click", function (e) {
      e.stopPropagation();
      var auf = p.hidden; p.hidden = !auf; knopfEl.setAttribute("aria-expanded", auf ? "true" : "false");
      andere.hidden = true; andereKnopf.setAttribute("aria-expanded", "false");
    });
  }
  if (zahn && pop && urh && urhPop) {
    TEMPI.forEach(function (x) {
      var b = document.createElement("button"); b.type = "button"; b.className = "vl-tempo";
      b.textContent = String(x).replace(".", T("vl.komma", ",")) + "×"; b.setAttribute("data-t", String(x));
      b.setAttribute("aria-pressed", x === tempo ? "true" : "false");
      b.addEventListener("click", function () {
        tempo = x; ls("s", KEY_T, String(x)); if (au) au.playbackRate = x;
        Array.prototype.forEach.call(pop.querySelectorAll("button"), function (n) { n.setAttribute("aria-pressed", n === b ? "true" : "false"); });
        ui();
      });
      pop.appendChild(b);
    });
    popup(zahn, pop, urhPop, urh); popup(urh, urhPop, pop, zahn);
    document.addEventListener("click", function (e) { if (!box.contains(e.target)) { pop.hidden = true; urhPop.hidden = true; zahn.setAttribute("aria-expanded", "false"); urh.setAttribute("aria-expanded", "false"); } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { pop.hidden = true; urhPop.hidden = true; zahn.setAttribute("aria-expanded", "false"); urh.setAttribute("aria-expanded", "false"); } });
  }

  /* Dauer aus audio/manifest.json (Sekunden je Sprache); fehlt sie, zählt die Länge der Datei. Ohne Datei bleibt die Pille ausgeblendet. */
  if (window.fetch) {
    fetch(WURZEL + "audio/manifest.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; }).then(function (m) { start(dauerAusManifest(m)); });
  } else start(0);
})();
