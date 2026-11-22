/* Stimmen speichern.
   SAMMELPUNKT: Adresse eines gemeinsamen Sammelpunkts (Formular-Dienst o. ae.).
   Solange er leer ist, bleiben die Antworten nur in diesem Browser (localStorage).
   Hier niemals Schluessel, Token oder private Adressen eintragen. */
(function () {
  var SAMMELPUNKT = "";
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
    if (SAMMELPUNKT && window.fetch) {
      try { fetch(SAMMELPUNKT, { method: "POST", body: JSON.stringify(antworten) }); } catch (e) {}
    }
    return Promise.resolve({ gespeichert: ok, gemeinsam: !!SAMMELPUNKT });
  };
})();
