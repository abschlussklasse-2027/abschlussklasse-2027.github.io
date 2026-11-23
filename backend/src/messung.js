// Anonyme Nutzungsmessung: nur aggregierte Zaehler je Tag, Ereignis und Merkmal. Keine Zeile je Besucher, keine Zeit unter Tagesgenauigkeit.
import { tag } from "./util.js";

export const MAX_BYTES_MESSUNG = 2 * 1024;
export const MAX_EREIGNISSE = 30; // je Anfrage

const SPR = "(?:de|en|fr|it|es|tr|pl|uk)", VID = "(?:haupt|lehrer)";
// Erlaubnisliste: nur diese Ereignisse mit genau diesen Merkmalen werden gezaehlt. Damit bleibt die Tabelle klein (endlich viele Zeilen je Tag).
export const REGELN = {
  seite: new RegExp(`^${SPR}\\|(?:mobil|desktop)$`),                       // Sprache | Geraetetyp grob
  dauer: /^(?:<5s|5-15s|15-60s|1-3min|>3min)$/,                           // Besuchsdauer-Klasse beim Verlassen
  scroll: /^(?:25|50|75|100)$/,                                            // Scrolltiefe in Prozent
  video_start: new RegExp(`^${VID}\\|${SPR}$`),                            // Video | Sprache
  video_zeit: new RegExp(`^${VID}\\|${SPR}\\|(?:<3s|3-10s|10-30s|30-60s|60-120s|>120s)$`),
  video_meilenstein: new RegExp(`^${VID}\\|${SPR}\\|(?:25|50|75|100)$`),
  video_abbruch: new RegExp(`^${VID}\\|${SPR}\\|t(?:\\d|[12]\\d|30)$`),    // t0 = 0-9 s ... t30 = ab 300 s
  video_kapitel: new RegExp(`^${VID}\\|${SPR}\\|k(?:\\d|1[0-5])$`),        // zuletzt gesehenes Kapitel/Abschnitt (Index)
  kapitelklick: new RegExp(`^${VID}\\|k(?:\\d|1[0-5])$`),
  sprachschalter: new RegExp(`^${SPR}>${SPR}$`),
  vorlesen: new RegExp(`^${SPR}$`),
  lehrer: new RegExp(`^(?:sichtbar|geoeffnet)\\|${SPR}$`),
  fragen_abgesendet: new RegExp(`^${SPR}$`),                               // ohne Inhalt
  freigabe_abgesendet: new RegExp(`^${SPR}$`),                             // ohne Inhalt
};

/** Prueft { e: [[ereignis, merkmal], ...] }. Gibt { ok, paare: Map("ereignis\u0000merkmal" -> n) } oder { ok:false, fehler }. */
export function pruefeMessung(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body.e)) return { ok: false, fehler: "e erwartet" };
  if (body.e.length < 1 || body.e.length > MAX_EREIGNISSE) return { ok: false, fehler: "1 bis " + MAX_EREIGNISSE + " Ereignisse" };
  const paare = new Map();
  for (const x of body.e) {
    if (!Array.isArray(x) || x.length !== 2 || typeof x[0] !== "string" || typeof x[1] !== "string") return { ok: false, fehler: "paar erwartet" };
    const re = Object.hasOwn(REGELN, x[0]) ? REGELN[x[0]] : null;
    if (!re || x[1].length > 40 || !re.test(x[1])) return { ok: false, fehler: "unbekanntes ereignis" };
    const k = x[0] + "\u0000" + x[1];
    paare.set(k, (paare.get(k) || 0) + 1);
  }
  return { ok: true, paare, anzahl: body.e.length };
}

export async function messungSpeichern(env, paare, t = tag()) {
  const stmts = [...paare].map(([k, n]) => {
    const [e, m] = k.split("\u0000");
    return env.DB.prepare("INSERT INTO messung (tag, ereignis, merkmal, n) VALUES (?1,?2,?3,?4) ON CONFLICT(tag, ereignis, merkmal) DO UPDATE SET n = n + excluded.n").bind(t, e, m, n);
  });
  await env.DB.batch(stmts);
}

/** Zaehler je Tag und Summen ueber den Zeitraum. */
export async function messungLesen(env, { von = "0000-00-00", bis = "9999-99-99" } = {}) {
  const { results } = await env.DB.prepare("SELECT tag, ereignis, merkmal, n FROM messung WHERE tag >= ? AND tag <= ? ORDER BY tag, ereignis, merkmal").bind(von, bis).all();
  const tage = {}, summen = {};
  for (const r of results) {
    ((tage[r.tag] ??= {})[r.ereignis] ??= {})[r.merkmal] = r.n;
    const s = (summen[r.ereignis] ??= {}); s[r.merkmal] = (s[r.merkmal] || 0) + r.n;
  }
  return { erzeugt: new Date().toISOString(), tage, summen };
}
