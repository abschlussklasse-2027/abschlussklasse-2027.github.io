(function () {
  var F = window.FRAGEN, liste = window.stimmenLesen(), n = liste.length;
  document.getElementById("anzahl").textContent = n + (n === 1 ? " Abgabe" : " Abgaben") + " in diesem Browser";
  if (!window.sammelpunktDa()) document.getElementById("sammel").hidden = false;
  var out = document.getElementById("ergebnis");
  if (!n) { document.getElementById("leer").hidden = false; return; }
  F.forEach(function (f) {
    var z = {}, gesamt = 0;
    f.optionen.concat(f.anderes ? ["Etwas anderes"] : []).forEach(function (o) { z[o] = 0; });
    liste.forEach(function (s) { (s.antworten[f.id] || []).forEach(function (o) { if (o in z) { z[o]++; } }); });
    var sec = document.createElement("section"); sec.className = "frage";
    var h = document.createElement("h2"); h.textContent = f.id + ". " + f.titel; sec.appendChild(h);
    Object.keys(z).forEach(function (o) {
      var row = document.createElement("div"); row.className = "zeile";
      var l = document.createElement("div"); l.className = "etikett"; l.textContent = o;
      var b = document.createElement("div"); b.className = "bahn";
      var i = document.createElement("div"); i.className = "fuell"; i.style.width = (z[o] / n * 100) + "%";
      var w = document.createElement("span"); w.className = "zahl"; w.textContent = z[o];
      b.appendChild(i); row.appendChild(l); row.appendChild(b); row.appendChild(w); sec.appendChild(row);
    });
    out.appendChild(sec);
  });
})();
