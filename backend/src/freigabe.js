// Rueckmeldung der Schule (kein Rechtsakt, nur eine Rueckmeldung an das Projekt). Gespeichert als Ereignis vom Typ "schulfreigabe".
export const FUNKTIONEN = ["schulleitung", "lehrkraft", "it", "schulaufsicht", "schultraeger", "datenschutz", "eltern"];
export const ANTWORTEN = ["ja", "ja_bedingt", "nein", "rueckfragen"];
export const LIMITS = { name: 100, stelle: 150, text: 1000, kontakt: 150 };
const SPRACHEN = ["de", "en", "fr", "it", "es", "tr", "pl", "uk"];

const sauber = (v) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : null);

/** Prueft die Rueckmeldung. Gibt { ok, wert } oder { ok:false, fehler }. */
export function pruefeFreigabe(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { ok: false, fehler: "objekt erwartet" };
  const erlaubt = new Set(["funktion", "name", "stelle", "antwort", "text", "kontakt", "befugt", "sprache"]);
  for (const k of Object.keys(b)) if (!erlaubt.has(k)) return { ok: false, fehler: "unbekanntes feld: " + k.slice(0, 20) };
  if (!FUNKTIONEN.includes(b.funktion)) return { ok: false, fehler: "funktion ungueltig" };
  if (!ANTWORTEN.includes(b.antwort)) return { ok: false, fehler: "antwort ungueltig" };
  if (b.befugt !== true) return { ok: false, fehler: "befugt muss bestaetigt sein" };
  const w = { funktion: b.funktion, antwort: b.antwort, befugt: true };
  for (const k of ["name", "stelle"]) {
    const s = sauber(b[k]);
    if (!s) return { ok: false, fehler: k + " fehlt" };
    if (s.length > LIMITS[k]) return { ok: false, fehler: k + " zu lang" };
    w[k] = s;
  }
  for (const k of ["text", "kontakt"]) {
    if (b[k] === undefined || b[k] === null || b[k] === "") { w[k] = ""; continue; }
    const s = sauber(b[k]);
    if (s === null) return { ok: false, fehler: k + ": text erwartet" };
    if (s.length > LIMITS[k]) return { ok: false, fehler: k + " zu lang" };
    w[k] = s;
  }
  if ((b.antwort === "ja_bedingt" || b.antwort === "rueckfragen") && !w.text) return { ok: false, fehler: "text fehlt (Bedingungen oder Fragen)" };
  w.sprache = SPRACHEN.includes(b.sprache) ? b.sprache : "de";
  return { ok: true, wert: w };
}
