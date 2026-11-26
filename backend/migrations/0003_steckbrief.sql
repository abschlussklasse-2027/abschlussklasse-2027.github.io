-- Steckbrief/Portraet (Phase A). Additiv: beruehrt die Tabellen aus 0001/0002 nicht.
-- Keine Klartext-Mailadressen (nur gesalzener HMAC-Hash), keine Nachnamen, kein Text blockierter Eingaben.

CREATE TABLE sb_klassen (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  erstellt TEXT NOT NULL
);

CREATE TABLE sb_personen (
  id TEXT PRIMARY KEY,
  klasse_id TEXT NOT NULL REFERENCES sb_klassen(id),
  kuerzel TEXT NOT NULL,                 -- nur Vorname oder Kuerzel
  email_hash TEXT NOT NULL,              -- HMAC-SHA256, nie Klartext
  rolle TEXT NOT NULL CHECK (rolle IN ('kind','gremium','lehrkraft')),
  unter16 INTEGER NOT NULL DEFAULT 0,    -- nur das Merkmal, kein Geburtsdatum
  eltern_email_hash TEXT,
  gesperrt INTEGER NOT NULL DEFAULT 0,
  erstellt TEXT NOT NULL,
  UNIQUE (klasse_id, email_hash)
);
CREATE INDEX sb_personen_klasse ON sb_personen(klasse_id);

CREATE TABLE sb_beschreibungen (
  id TEXT PRIMARY KEY,
  klasse_id TEXT NOT NULL REFERENCES sb_klassen(id),
  autor_id TEXT NOT NULL REFERENCES sb_personen(id),
  subjekt_id TEXT NOT NULL REFERENCES sb_personen(id),
  form TEXT NOT NULL CHECK (form IN ('steckbrief','portraet')),
  felder TEXT NOT NULL,                  -- JSON; leer ('{}') nach Loeschung/Ablehnung/Widerruf
  status TEXT NOT NULL CHECK (status IN ('entwurf','freigabe_kind','freigabe_eltern','sichtbar','abgelehnt','widerrufen','geloescht')),
  gemeldet INTEGER NOT NULL DEFAULT 0,
  gesperrt INTEGER NOT NULL DEFAULT 0,
  erstellt TEXT NOT NULL,
  aktualisiert TEXT NOT NULL,
  loeschen_nach TEXT                     -- Frist fuer nicht freigegebene Texte (30 Tage)
);
CREATE INDEX sb_besch_klasse_status ON sb_beschreibungen(klasse_id, status);
CREATE INDEX sb_besch_frist ON sb_beschreibungen(loeschen_nach);

CREATE TABLE sb_freigaben (
  id TEXT PRIMARY KEY,
  beschreibung_id TEXT NOT NULL REFERENCES sb_beschreibungen(id),
  wer TEXT NOT NULL CHECK (wer IN ('kind','eltern')),
  zeit TEXT NOT NULL,
  widerrufen_zeit TEXT
);
CREATE INDEX sb_freigaben_besch ON sb_freigaben(beschreibung_id);

-- Einmal-Tokens (Magic Link Anmeldung, Eltern-Link). Nur die Kennung, nie der Token selbst.
CREATE TABLE sb_tokens (
  jti TEXT PRIMARY KEY,
  typ TEXT NOT NULL CHECK (typ IN ('login','eltern')),
  person_id TEXT,
  beschreibung_id TEXT,
  ablauf TEXT NOT NULL,
  benutzt INTEGER NOT NULL DEFAULT 0
);

-- Audit ohne Textinhalt (auch nicht von blockierten Texten) und ohne Klartextnamen.
CREATE TABLE sb_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zeit TEXT NOT NULL,
  aktion TEXT NOT NULL,
  klasse_id TEXT,
  person_id TEXT,                        -- zufaellige Id, kein Name
  beschreibung_id TEXT,
  detail TEXT NOT NULL DEFAULT ''        -- nur Codes (z. B. Pruefstufe), nie Text
);
CREATE INDEX sb_audit_zeit ON sb_audit(zeit);
