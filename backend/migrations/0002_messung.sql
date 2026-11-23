-- Anonyme Nutzungsmessung: nur Zaehler je Tag, Ereignis und Merkmal (keine Besucherzeilen, keine Zeit unter Tagesgenauigkeit).
CREATE TABLE messung (
  tag TEXT NOT NULL,        -- YYYY-MM-DD (UTC)
  ereignis TEXT NOT NULL,   -- aus der Erlaubnisliste in src/messung.js
  merkmal TEXT NOT NULL,    -- z. B. "de|mobil"
  n INTEGER NOT NULL,
  PRIMARY KEY (tag, ereignis, merkmal)
);
