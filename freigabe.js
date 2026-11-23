/* Rückmeldung der Schule (Formular im Lehrer-Bereich). Sendet an den Sammelpunkt (POST /api/freigabe).
   Es ist eine Rückmeldung an das Projekt, keine Genehmigung im Rechtssinn. Nichts wird im Browser gespeichert. */
(function () {
  var form = document.getElementById("freigabe-form");
  if (!form) return;
  var T = window.T || function (k, fb) { return fb; }, sp = window.SPRACHE || "de";
  function $(id) { return document.getElementById(id); }
  var fehler = $("fg-fehler"), knopf = $("fg-senden"), danke = $("fg-danke"), text = $("fg-text");
  function zeigFehler(msg, feld) {
    fehler.textContent = msg; fehler.hidden = false;
    if (feld && feld.focus) feld.focus(); else fehler.focus();
  }
  function antwort() { var r = form.querySelector("input[name=fg-antwort]:checked"); return r ? r.value : ""; }

  form.addEventListener("input", function () { fehler.hidden = true; });
  form.addEventListener("change", function () { fehler.hidden = true; });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    fehler.hidden = true;
    var d = { funktion: $("fg-funktion").value, name: $("fg-name").value.trim(), stelle: $("fg-stelle").value.trim(),
      antwort: antwort(), text: text.value.trim(), kontakt: $("fg-kontakt").value.trim(), befugt: $("fg-befugt").checked, sprache: sp };
    if (!d.funktion) return zeigFehler(T("freigabe.f.pflicht", "Bitte füllen Sie die Pflichtfelder aus."), $("fg-funktion"));
    if (!d.name) return zeigFehler(T("freigabe.f.pflicht", "Bitte füllen Sie die Pflichtfelder aus."), $("fg-name"));
    if (!d.stelle) return zeigFehler(T("freigabe.f.pflicht", "Bitte füllen Sie die Pflichtfelder aus."), $("fg-stelle"));
    if (!d.antwort) return zeigFehler(T("freigabe.f.antwort", "Bitte wählen Sie eine Antwort."), form.querySelector("input[name=fg-antwort]"));
    if ((d.antwort === "ja_bedingt" || d.antwort === "rueckfragen") && !d.text) return zeigFehler(T("freigabe.f.text", "Bitte nennen Sie Ihre Bedingungen oder Fragen."), text);
    if (!d.befugt) return zeigFehler(T("freigabe.f.befugt", "Bitte bestätigen Sie, dass Sie befugt sind, für Ihre Stelle zu antworten."), $("fg-befugt"));
    d.website = $("fg-website").value;            /* Köder für Bots, bleibt leer */
    knopf.disabled = true;
    window.sendeFreigabe(d).then(function (r) {
      knopf.disabled = false;
      if (r.ok) {
        form.hidden = true; danke.hidden = false; danke.focus();
        if (window.messen) window.messen("freigabe_abgesendet", sp);   /* nur der Zähler, kein Inhalt */
        return;
      }
      zeigFehler(r.status === 429 ? T("freigabe.f.limit", "Von diesem Anschluss kamen heute schon mehrere Rückmeldungen. Bitte morgen wieder.")
        : T("freigabe.f.netz", "Das Senden hat gerade nicht geklappt. Bitte später noch einmal versuchen."));
    });
  });
})();
