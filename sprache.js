/* Sprachschalter (Dropdown mit Suche) und "Seite vorlesen" mit der Sprachausgabe des Browsers (Web Speech API).
   Keine externen Dienste: die Stimme kommt vom Gerät, es wird nichts übertragen. */
(function () {
  var sp = window.SPRACHE || "de", T = window.T || function (k, fb) { return fb; };
  function $(id) { return document.getElementById(id); }

  /* ---------- Sprachschalter ---------- */
  var knopf = $("sw-knopf"), panel = $("sw-panel"), suche = $("sw-suche"), liste = $("sw-liste"), leer = $("sw-leer");
  if (knopf && panel && liste) {
    var eintraege = Array.prototype.slice.call(liste.querySelectorAll("a"));
    var code = $("sw-code"); if (code) code.textContent = sp.toUpperCase();
    eintraege.forEach(function (a) {
      var c = a.getAttribute("data-code");
      if (c === sp) { a.setAttribute("aria-current", "true"); }
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

    /* ---------- Hinweis auf den Schalter: Neon-Auftritt (einmal je Sitzung) und Sprechblase (einmal je Browser) ---------- */
    var reduziert = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var SK = "abschlussparty-sw-intro", TK = "abschlussparty-sw-tipp", tipp = $("sw-tipp"), tt = $("sw-tipp-t");
    function lese(st, k) { try { return window[st].getItem(k); } catch (e) { return null; } }
    function schreibe(st, k) { try { window[st].setItem(k, "1"); } catch (e) {} }
    if (!reduziert && !lese("sessionStorage", SK)) {
      schreibe("sessionStorage", SK);
      knopf.classList.add("sw-intro");
      knopf.addEventListener("animationend", function (e) { if (e.animationName === "sw-puls") knopf.classList.remove("sw-intro"); });
    }
    if (tipp && tt && !lese("localStorage", TK)) {
      var wort = (tt.getAttribute("data-wechsel") || "").split("|").filter(Boolean), wi = 0, wt = null, zt = null, aus = null;
      var verstecken = function () {
        clearInterval(wt); clearTimeout(zt); clearTimeout(aus);
        tipp.classList.remove("zeigen"); setTimeout(function () { tipp.hidden = true; }, 450);
      };
      zt = setTimeout(function () {
        if (offen) return;
        schreibe("localStorage", TK);
        tipp.hidden = false; void tipp.offsetWidth; tipp.classList.add("zeigen");
        if (!reduziert && wort.length > 1) {
          wt = setInterval(function () {
            tt.classList.add("aus");
            setTimeout(function () { wi = (wi + 1) % wort.length; tt.textContent = wort[wi]; tt.classList.remove("aus"); }, 260);
          }, 1300);
        }
        aus = setTimeout(verstecken, 6000);
      }, reduziert ? 400 : 1200);
      knopf.addEventListener("click", function () { schreibe("localStorage", TK); verstecken(); });
      tipp.addEventListener("click", verstecken);
    }
  }

  /* ---------- Seite vorlesen ---------- */
  var box = $("vorlesen"), play = $("vl-play"), stop = $("vl-stop"), info = $("vl-info"), txt = $("vl-text"), ico = $("vl-ico");
  var ss = window.speechSynthesis;
  if (!box || !play || !ss || typeof window.SpeechSynthesisUtterance !== "function") return;
  var TAG = { de: "de", en: "en", fr: "fr", it: "it", es: "es", tr: "tr", pl: "pl", uk: "uk" }[sp] || sp;
  var stimme = null;
  function waehle() {
    var vs = ss.getVoices() || [];
    var pass = vs.filter(function (v) { return (v.lang || "").toLowerCase().replace("_", "-").split("-")[0] === TAG; });
    if (!pass.length) return null;
    pass.sort(function (a, b) { return (b.localService ? 1 : 0) - (a.localService ? 1 : 0) || (b.default ? 1 : 0) - (a.default ? 1 : 0); });
    return pass[0];
  }

  /* Haupttext einsammeln: Überschriften, Absätze, Listen. Nicht: Navigation, Fußzeile, Video, Formular, Kapitelliste. */
  var AUS = "nav, footer, svg, script, style, video, form, #formular, #kapitel, .kapitel, .vorlesen, .sprachwahl, .vl-aus, .nachweis, table, [hidden], [aria-hidden='true']";
  function blocke() {
    var out = [], haupt = document.querySelector("main"); if (!haupt) return out;
    var els = haupt.querySelectorAll("h1, h2, h3, h4, p, li, dt, dd, figcaption, summary");
    Array.prototype.forEach.call(els, function (e) {
      if (e.closest(AUS)) return;
      if (e.querySelector("p, li, h2, h3, h4")) return;   /* nur die innersten Blöcke */
      if (e.closest(".ls-sprung")) return;
      var t = (e.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length > 1) out.push(t);
    });
    var kopf = document.querySelector("header h1");
    if (kopf) out.unshift((kopf.textContent || "").replace(/\s+/g, " ").trim());
    return out;
  }
  function stuecke(texte) {
    var r = [];
    texte.forEach(function (t) {
      if (t.length <= 220) { r.push(t); return; }
      var teile = t.match(/[^.!?…。]+[.!?…]*\s*/g) || [t], cur = "";
      teile.forEach(function (x) { if ((cur + x).length > 220 && cur) { r.push(cur.trim()); cur = x; } else cur += x; });
      if (cur.trim()) r.push(cur.trim());
    });
    return r;
  }
  var teile = [], pos = 0, lauf = false, pausiert = false, gen = 0;

  function minuten() {
    var w = 0; blocke().forEach(function (t) { w += t.split(/\s+/).length; });
    return Math.max(1, Math.round(w / 140));
  }
  function infoSetzen() {
    info.textContent = T("vl.info", "Dauer: etwa {n} Min. · Stimme: {v}", { n: minuten(), v: stimme ? stimme.name : "" });
  }
  function ui() {
    var spielt = lauf && !pausiert;
    txt.textContent = spielt ? T("vl.pause", "Pause") : (lauf ? T("vl.weiter", "Weiter") : T("vl.start", "Seite vorlesen"));
    ico.setAttribute("d", spielt ? "M7 5v14M17 5v14" : "M8 5l11 7-11 7z");
    if (spielt) { ico.setAttribute("fill", "none"); ico.setAttribute("stroke", "currentColor"); ico.setAttribute("stroke-width", "3"); ico.setAttribute("stroke-linecap", "round"); }
    else { ico.setAttribute("fill", "currentColor"); ico.removeAttribute("stroke"); }
    stop.hidden = !lauf;
  }
  function sprich() {
    if (!lauf || pausiert) return;
    if (pos >= teile.length) { lauf = false; pausiert = false; pos = 0; ui(); return; }
    var mein = gen, u = new window.SpeechSynthesisUtterance(teile[pos]);
    u.lang = stimme ? stimme.lang : TAG; if (stimme) u.voice = stimme; u.rate = 1;
    u.onend = function () { if (mein !== gen) return; pos++; sprich(); };
    u.onerror = function (e) { if (mein !== gen) return; if (e && (e.error === "canceled" || e.error === "interrupted")) return; lauf = false; ui(); };
    ss.speak(u);
  }
  function starten() { gen++; ss.cancel(); teile = stuecke(blocke()); pos = 0; lauf = true; pausiert = false; ui(); sprich(); }
  function pausieren() { gen++; pausiert = true; ss.cancel(); ui(); }   /* abbrechen und beim Weiter an dieser Stelle fortsetzen (zuverlässiger als pause()) */
  function weiter() { gen++; pausiert = false; ui(); sprich(); }
  function beenden() { gen++; ss.cancel(); lauf = false; pausiert = false; pos = 0; ui(); }
  play.addEventListener("click", function () { if (!lauf) starten(); else if (pausiert) weiter(); else pausieren(); });
  stop.addEventListener("click", beenden);
  window.addEventListener("pagehide", function () { try { ss.cancel(); } catch (e) {} });

  /* Kasten nur zeigen, wenn es eine passende Stimme gibt (Stimmen laden manchmal verzögert). */
  function pruefen() {
    var s = waehle();
    if (s && !stimme) { stimme = s; infoSetzen(); box.hidden = false; ui(); }
    else if (s) stimme = s;
  }
  pruefen();
  if (ss.addEventListener) ss.addEventListener("voiceschanged", pruefen);
  else ss.onvoiceschanged = pruefen;
  var versuche = 0, iv = setInterval(function () { pruefen(); if (stimme || ++versuche > 10) clearInterval(iv); }, 400);
  window.__vorlesen = { blocke: blocke, stuecke: stuecke };
})();
