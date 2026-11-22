(function () {
  var k = document.getElementById("lehrer-video-knopf"), box = document.getElementById("lehrer-video-box"), v = document.getElementById("lehrer-video");
  if (!k || !box || !v) return;
  k.addEventListener("click", function () {
    box.hidden = false; k.setAttribute("aria-expanded", "true");
    v.load();
    var p = v.play(); if (p && p.catch) p.catch(function () {});
    box.scrollIntoView({ block: "nearest" });
  });
  /* Direktlink #lehrer klappt den Bereich auf */
  function auf() { if (location.hash === "#lehrer") { var d = document.getElementById("lehrer-details"); if (d) d.open = true; } }
  auf(); window.addEventListener("hashchange", auf);
})();
