(function () {
  var v = document.getElementById("video"), liste = document.getElementById("kapitel");
  if (!v || !liste) return;
  var knoepfe = liste.querySelectorAll("button");
  Array.prototype.forEach.call(knoepfe, function (b) {
    b.addEventListener("click", function () {
      v.currentTime = parseFloat(b.getAttribute("data-t"));
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    });
  });
  v.addEventListener("timeupdate", function () {
    var aktiv = null;
    Array.prototype.forEach.call(knoepfe, function (b) { if (v.currentTime >= parseFloat(b.getAttribute("data-t")) - 0.2) aktiv = b; });
    Array.prototype.forEach.call(knoepfe, function (b) { b.classList.toggle("aktiv", b === aktiv); });
  });
})();
