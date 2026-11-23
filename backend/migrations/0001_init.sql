-- Sammelpunkt Klassen-Umfrage. D1 ist die Wahrheit, nur anhaengen.
CREATE TABLE ereignisse (
  id TEXT PRIMARY KEY,            -- zeitlich sortierbar: e_<ms hex><zufall>
  zeit TEXT NOT NULL,             -- ISO 8601 UTC
  typ TEXT NOT NULL,              -- z. B. stimme
  klasse TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  nutzlast TEXT NOT NULL,         -- JSON
  hash TEXT NOT NULL              -- sha256 ueber zeit|typ|klasse|schema_version|nutzlast
);
CREATE INDEX ereignisse_typ ON ereignisse(typ, id);

CREATE TRIGGER ereignisse_kein_update BEFORE UPDATE ON ereignisse
BEGIN SELECT RAISE(ABORT, 'ereignisse sind nur anhaengbar'); END;
CREATE TRIGGER ereignisse_kein_delete BEFORE DELETE ON ereignisse
BEGIN SELECT RAISE(ABORT, 'ereignisse sind nur anhaengbar'); END;

-- Was mit den Daten geschehen soll. Statuswechsel = neue Zeile (folgt_auf), nie ueberschreiben.
CREATE TABLE entscheidungen (
  id TEXT PRIMARY KEY,
  zeit TEXT NOT NULL,
  thema TEXT NOT NULL,
  frage TEXT NOT NULL,
  entscheidung TEXT NOT NULL,
  begruendung TEXT NOT NULL DEFAULT '',
  von TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('offen','beschlossen','umgesetzt','verworfen')),
  bezug_ereignis TEXT,
  folgt_auf TEXT
);
CREATE INDEX entscheidungen_thema ON entscheidungen(thema, id);
CREATE TRIGGER entscheidungen_kein_update BEFORE UPDATE ON entscheidungen
BEGIN SELECT RAISE(ABORT, 'entscheidungen sind nur anhaengbar'); END;
CREATE TRIGGER entscheidungen_kein_delete BEFORE DELETE ON entscheidungen
BEGIN SELECT RAISE(ABORT, 'entscheidungen sind nur anhaengbar'); END;

-- Welcher Schritt hat welches Ereignis schon verarbeitet (idempotent: ein Paar nur einmal).
CREATE TABLE verarbeitung (
  ereignis_id TEXT NOT NULL,
  schritt TEXT NOT NULL,
  zeit TEXT NOT NULL,
  ergebnis TEXT NOT NULL DEFAULT '',
  entscheidung_id TEXT,
  PRIMARY KEY (ereignis_id, schritt)
);
CREATE TRIGGER verarbeitung_kein_update BEFORE UPDATE ON verarbeitung
BEGIN SELECT RAISE(ABORT, 'verarbeitung ist nur anhaengbar'); END;
CREATE TRIGGER verarbeitung_kein_delete BEFORE DELETE ON verarbeitung
BEGIN SELECT RAISE(ABORT, 'verarbeitung ist nur anhaengbar'); END;

-- Betriebszaehler (keine Antworten): je Tag und gehashter IP. Alte Tage werden im Cron entfernt.
CREATE TABLE ratenzaehler (
  tag TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (tag, ip_hash)
);
