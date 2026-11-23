(function () {
  var T = window.T || function (k, fb, v) { return fb; };
  var F = window.FRAGEN, wahl = {}, anderes = "";
  var wrap = document.getElementById("fragen");
  var balken = document.getElementById("fortschritt-balken");
  var text = document.getElementById("fortschritt-text");
  var knopf = document.getElementById("abschicken");

  F.forEach(function (f) {
    wahl[f.id] = [];
    var fs = document.createElement("fieldset");
    fs.className = "frage";
    var lg = document.createElement("legend");
    lg.innerHTML = '<span class="buchstabe">' + f.id + '</span><span class="titel"></span>';
    lg.querySelector(".titel").textContent = T("f." + f.id + ".t", f.titel);
    fs.appendChild(lg);
    var hint = document.createElement("p");
    hint.className = "hinweis";
    var mehr = T("js.mehrere", "Du darfst mehrere ankreuzen.");
    hint.textContent = (f.hinweis ? T("f." + f.id + ".h", f.hinweis) + " " : "") + (f.art === "mehr" && !f.hinweis ? mehr : "");
    if (f.id === "D") hint.textContent = mehr;
    if (f.id === "H") hint.textContent = mehr;
    if (f.id === "J") hint.textContent = T("f.J.h", f.hinweis);
    if (hint.textContent.trim()) fs.appendChild(hint);
    var opts = f.optionen.slice();
    if (f.anderes) opts.push("Etwas anderes");
    opts.forEach(function (o, i) {
      var anzeige = (f.anderes && i === opts.length - 1) ? T("js.anderes", o) : T("f." + f.id + ".o" + i, o);
      var lab = document.createElement("label");
      lab.className = "karte";
      var inp = document.createElement("input");
      inp.type = f.art === "mehr" ? "checkbox" : "radio";
      inp.name = "f" + f.id;
      inp.value = o;
      var sp = document.createElement("span");
      sp.className = "kt";
      sp.textContent = anzeige;
      lab.appendChild(inp); lab.appendChild(sp);
      fs.appendChild(lab);
      inp.addEventListener("change", function () {
        if (f.art === "ein") wahl[f.id] = [o];
        else wahl[f.id] = Array.prototype.map.call(fs.querySelectorAll("input:checked"), function (x) { return x.value; });
        if (f.anderes) {
          var andereAn = wahl[f.id].indexOf("Etwas anderes") > -1;
          fs.querySelector(".anderes").hidden = !andereAn;
        }
        update();
      });
    });
    if (f.anderes) {
      var ta = document.createElement("input");
      ta.type = "text"; ta.className = "anderes"; ta.hidden = true; ta.maxLength = 100;
      ta.setAttribute("aria-label", T("js.anderes_aria", "Was möchtest du noch?"));
      ta.placeholder = T("js.anderes_ph", "Was möchtest du noch? (ohne Namen)");
      ta.addEventListener("input", function () { anderes = ta.value; });
      fs.appendChild(ta);
    }
    wrap.appendChild(fs);
  });

  function update() {
    var n = F.filter(function (f) { return wahl[f.id].length > 0; }).length;
    var p = Math.round(n / F.length * 100);
    balken.style.width = p + "%";
    balken.parentNode.setAttribute("aria-valuenow", n);
    balken.parentNode.setAttribute("aria-valuemax", F.length);
    text.textContent = T("js.fortschritt", "{n} von {m} Fragen beantwortet", { n: n, m: F.length });
    if (n > 0) document.getElementById("hinweis-leer").hidden = true;
  }
  update();

  knopf.addEventListener("click", function () {
    var n = F.filter(function (f) { return wahl[f.id].length > 0; }).length;
    if (!n) { document.getElementById("hinweis-leer").hidden = false; document.getElementById("hinweis-leer").focus(); return; }
    var a = {};
    F.forEach(function (f) { if (wahl[f.id].length) a[f.id] = wahl[f.id].slice(); });
    if (anderes.trim() && wahl.D.indexOf("Etwas anderes") > -1) a.D_anderes = anderes.trim().slice(0, 100);
    knopf.disabled = true;
    window.senden(a).then(function (r) {
      document.getElementById("formular").hidden = true;
      var d = document.getElementById("danke");
      d.hidden = false;
      d.focus();
      window.scrollTo({ top: d.offsetTop - 20, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  });

  /* Video: nur zeigen, wenn die Datei da ist */
  var v = document.getElementById("video"), ph = document.getElementById("video-platzhalter");
  if (v && window.fetch) {
    var qu = v.querySelector("source"), vurl = qu ? qu.getAttribute("src") : "video/abschlussparty.mp4";
    fetch(vurl, { method: "HEAD" }).then(function (r) {
      if (r.ok) { v.hidden = false; ph.hidden = true; v.load(); }
    }).catch(function () {});
    v.addEventListener("error", function () { v.hidden = true; ph.hidden = false; }, true);
  }
})();
