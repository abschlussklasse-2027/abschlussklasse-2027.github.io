/* Die Ankreuzfragen aus dem Konzept. Frage E entfaellt (Gratis-Adresse ist entschieden). */
window.FRAGEN = [
  { id: "A", art: "ein", titel: "Wer gibt Änderungen frei, bevor sie online gehen?", optionen: [
    "Louisa allein", "Ein Team aus drei Personen (zwei müssen zustimmen)", "Eine Lehrperson oder ein Elternteil", "Niemand, Änderungen gehen sofort online (nicht empfohlen)"] },
  { id: "B", art: "ein", titel: "Wie gehen wir mit Fotos um?", optionen: [
    "Öffentlich, aber nur Fotos mit Einverständnis aller Abgebildeten",
    "Öffentlich nur Fotos ohne erkennbare Gesichter (Deko, Location, Gruppenbild von hinten); alle anderen Fotos in einem geschlossenen Album außerhalb der Seite",
    "Gar keine Fotos von Personen auf der Seite"] },
  { id: "C", art: "ein", titel: "Wer prüft eingeschickte Fotos, bevor sie erscheinen?", optionen: [
    "Dieselben Personen wie bei A", "Ein eigenes Foto-Team", "Niemand, Fotos erscheinen sofort (nicht empfohlen)"] },
  { id: "D", art: "mehr", titel: "Welche Seiten wollen wir?", optionen: [
    "Startseite mit Datum, Ort und Countdown", "Programm des Abends", "Fotogalerie", "Sponsoren mit Bannern",
    "Unterschriften und Grüße der Klasse", "Steckbriefe (nur Vorname und Spruch)", "Musikwünsche"], anderes: true },
  { id: "F", art: "ein", titel: "Wer darf dem KI-Helfer Wünsche schicken?", optionen: [
    "Alle in der Klasse (über das Formular mit Klassen-Passwort)", "Nur das Team aus A"] },
  { id: "G", art: "ein", titel: "Was passiert nach der Party?", optionen: [
    "Die Seite bleibt als Erinnerung stehen, eine Person übernimmt das Konto",
    "Die Seite wird nach einem Jahr gelöscht", "Die Seite wird direkt nach dem Schuljahr gelöscht"] },
  { id: "H", art: "mehr", titel: "Wer darf auf die Seite, und wer ist das Gremium?", hinweis: "Hier darfst du mehrere ankreuzen.", optionen: [
    "Alle melden sich mit ihrer E-Mail-Adresse an und bekommen einen Anmeldelink. Jede Anfrage landet zuerst in einem Klick-Portal, das Gremium gibt sie frei oder lehnt sie ab.",
    "Nur Namen aus der Klassenliste kommen rein, Fremde werden abgewiesen.",
    "Das Gremium besteht aus drei Personen, zwei müssen zustimmen.",
    "Das Gremium besteht aus fünf Personen, drei müssen zustimmen.",
    "Die ganze Klasse ist das Gremium, die Mehrheit entscheidet.",
    "Louisa und eine Lehrperson haben zusätzlich ein Vetorecht."] },
  { id: "I", art: "ein", titel: "Wie wollen wir bauen?", optionen: [
    "Per Sprache: «Mach die Seite grün», «bau mir eine Sponsorenseite» (läuft auf dem iPad direkt im Browser).",
    "Per Finger: Bausteine auf dem iPad herumschieben, Texte und Bilder einsetzen.",
    "Beides, damit alle lernen, dass beide Wege gehen."] },
  { id: "J", art: "ein", titel: "Wie holen wir die Zustimmung ein?",
    hinweis: "Wir sind alle unter 16. Fotos und Namen kommen nur auf die Seite, wenn die Person selbst und ihre Eltern ausdrücklich zugestimmt haben. Wer nicht möchte, bleibt draußen, und jedes Foto kann jederzeit gelöscht werden.",
    optionen: [
    "Ankreuzfeld bei der Anmeldung: «Ich habe die Zustimmung meiner Eltern.» Ohne Haken kommt kein Anmeldelink (einfach, aber als Nachweis schwach).",
    "Zustimmungszettel für die Eltern: Louisa verteilt ihn in der Klasse, eine Lehrperson sammelt ihn ein. Erst danach wird die Person freigeschaltet.",
    "Beides: Haken bei der Anmeldung und Zettel für alle, die Fotos hochladen.",
    "Die Schule fragen, welche Form sie verlangt."] }
];
