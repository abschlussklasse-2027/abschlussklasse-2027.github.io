(function () {
  var wurzel = document.getElementById("helfer");
  if (!wurzel) return;
  var folien = wurzel.querySelectorAll(".folie"), punkte = wurzel.querySelectorAll(".punkt");
  var box = document.getElementById("folien"), n = folien.length, i = 0, timer = null, pausiert = false;
  var ruhig = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function zeige(k) {
    i = (k + n) % n;
    Array.prototype.forEach.call(folien, function (f, j) {
      f.classList.toggle("aktiv", j === i);
      if (j === i) f.removeAttribute("aria-hidden"); else f.setAttribute("aria-hidden", "true");
    });
    Array.prototype.forEach.call(punkte, function (p, j) {
      p.classList.toggle("aktiv", j === i);
      if (j === i) p.setAttribute("aria-current", "true"); else p.removeAttribute("aria-current");
    });
  }
  function stopp() { if (timer) { clearInterval(timer); timer = null; } }
  function los() { stopp(); if (!ruhig && !pausiert) timer = setInterval(function () { zeige(i + 1); }, 6000); }
  function nutzer(k) { zeige(k); pausiert = true; stopp(); }
  document.getElementById("weiter").addEventListener("click", function () { nutzer(i + 1); });
  document.getElementById("zurueck").addEventListener("click", function () { nutzer(i - 1); });
  Array.prototype.forEach.call(punkte, function (p) { p.addEventListener("click", function () { nutzer(parseInt(p.getAttribute("data-i"), 10)); }); });
  wurzel.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { nutzer(i + 1); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { nutzer(i - 1); e.preventDefault(); }
  });
  wurzel.addEventListener("focusin", function () { stopp(); });
  wurzel.addEventListener("focusout", function () { if (!pausiert) los(); });
  wurzel.addEventListener("pointerdown", function () { stopp(); });
  var x0 = null;
  box.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; stopp(); }, { passive: true });
  box.addEventListener("touchend", function (e) {
    if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) nutzer(dx < 0 ? i + 1 : i - 1);
  }, { passive: true });
  zeige(0); los();
})();
