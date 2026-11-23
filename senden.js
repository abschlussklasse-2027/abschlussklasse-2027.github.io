/* Stimmen speichern.
   SAMMELPUNKT: Adresse des gemeinsamen Sammelpunkts (Cloudflare-Worker, POST /api/stimmen, ohne Namen).
   Ist er leer oder nicht erreichbar, bleiben die Antworten nur in diesem Browser (localStorage).
   Hier niemals Schluessel, Token oder private Adressen eintragen. */
(function () {
  var SAMMELPUNKT = "https://klasse.keys4it.com";
  var KEY = "abschlussparty-stimmen-v1";

  function lesen() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
  }
  window.stimmenLesen = lesen;
  window.sammelpunktDa = function () { return !!SAMMELPUNKT; };

  /* antworten: { A: ["Text"], D: ["..","..."], D_anderes: "..." } , keine Namen */
  window.senden = function (antworten) {
    var ok = false;
    try {
      var liste = lesen();
      liste.push({ zeit: new Date().toISOString().slice(0, 10), antworten: antworten });
      localStorage.setItem(KEY, JSON.stringify(liste));
      ok = true;
    } catch (e) { ok = false; }
    if (!SAMMELPUNKT || !window.fetch) return Promise.resolve({ gespeichert: ok, gemeinsam: false });
    /* ohne eigenen Content-Type: einfache Anfrage, kein Preflight noetig */
    return fetch(SAMMELPUNKT + "/api/stimmen", { method: "POST", body: JSON.stringify(antworten) })
      .then(function (r) { return { gespeichert: ok, gemeinsam: r.ok }; })
      .catch(function () { return { gespeichert: ok, gemeinsam: false }; });
  };
})();
