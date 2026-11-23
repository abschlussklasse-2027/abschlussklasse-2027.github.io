/* E-Mail-Links werden erst beim Anklicken gebaut, damit Adress-Sammler sie nicht im Seitentext finden. */
(function () {
  function rev(s) { return s.split("").reverse().join(""); }
  function adresse(a) { return rev(a.getAttribute("data-l")) + "@" + rev(a.getAttribute("data-d")); }
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a.adr") : null;
    if (!a) return;
    e.preventDefault();
    window.location.href = "mailto:" + adresse(a);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var a = document.activeElement;
    if (a && a.classList && a.classList.contains("adr")) { e.preventDefault(); window.location.href = "mailto:" + adresse(a); }
  });
})();
