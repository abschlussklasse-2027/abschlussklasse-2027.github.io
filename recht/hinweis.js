/* erzeugt von i18n/bauen.py. Zeigt über den Rechtsseiten einen Satz in der Sprache, aus der man kommt (?lang=xx).
   Die Rechtstexte selbst bleiben unverändert Deutsch und verbindlich. */
(function () {
  var T = {"en": {"h": "Note: The legal pages are only available in German. The German version is the legally binding one.", "z": "← back to the page"}};
  var m = /[?&]lang=([a-z]{2})(?:&|$)/.exec(location.search), l = m && T[m[1]] ? m[1] : null;
  if (!l) return;
  var haupt = document.getElementById('inhalt'); if (!haupt) return;
  var p = document.createElement('p'); p.className = 'stand'; p.lang = l; p.setAttribute('role', 'note'); p.textContent = T[l].h;
  haupt.insertBefore(p, haupt.firstChild);
  Array.prototype.forEach.call(document.querySelectorAll('a[href="../index.html"]'), function (a) {
    a.setAttribute('href', '../' + l + '/'); if (a.className === 'zurueck' || /^\u2190/.test(a.textContent)) { a.textContent = T[l].z; a.lang = l; }
  });
})();
