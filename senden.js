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
  window.sammelpunktUrl = function () { return SAMMELPUNKT; };

  /* Rückmeldung der Schule (Formular im Lehrer-Bereich): nur an den Sammelpunkt, nichts im Browser gespeichert.
     Antwort: { ok, status, fehler } */
  window.sendeFreigabe = function (daten) {
    if (!SAMMELPUNKT || !window.fetch) return Promise.resolve({ ok: false, fehler: "offline" });
    return fetch(SAMMELPUNKT + "/api/freigabe", { method: "POST", body: JSON.stringify(daten) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok && j.ok === true, status: r.status, fehler: j.fehler }; }, function () { return { ok: false, status: r.status }; }); })
      .catch(function () { return { ok: false, fehler: "netz" }; });
  };

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
