/* Sprachschalter (Dropdown mit Suche), Neon-Hinweis. */
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
})();
