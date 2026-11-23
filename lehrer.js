(function () {
  /* Direktlink #lehrer klappt den Bereich auf */
  function auf() { if (location.hash === "#lehrer") { var d = document.getElementById("lehrer-details"); if (d) d.open = true; } }
  auf(); window.addEventListener("hashchange", auf);
})();
