import FRAGEN from "./fragen.json";

export const MAX_BYTES = 20 * 1024;
export const MAX_ANDERES = 100;
export const SCHEMA_VERSION = 1;

/** Prueft eine Stimme { A:["Text"], D:[..], D_anderes:".." }. Gibt {ok, wert} oder {ok:false, fehler}. */
export function pruefeStimme(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, fehler: "objekt erwartet" };
  const bekannt = new Map(FRAGEN.map((f) => [f.id, f]));
  const wert = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "D_anderes") continue;
    const f = bekannt.get(k);
    if (!f) return { ok: false, fehler: "unbekanntes feld: " + k.slice(0, 20) };
    if (!Array.isArray(v) || v.length < 1) return { ok: false, fehler: "liste erwartet: " + k };
    if (f.art === "ein" && v.length !== 1) return { ok: false, fehler: "genau eine antwort: " + k };
    const erlaubt = new Set(f.optionen.concat(f.anderes ? ["Etwas anderes"] : []));
    const gesehen = new Set();
    for (const o of v) {
      if (typeof o !== "string" || !erlaubt.has(o)) return { ok: false, fehler: "unerlaubter wert: " + k };
      if (gesehen.has(o)) return { ok: false, fehler: "doppelter wert: " + k };
      gesehen.add(o);
    }
    wert[k] = v;
  }
  if (Object.keys(wert).length === 0) return { ok: false, fehler: "keine antwort" };
  if ("D_anderes" in body) {
    const t = body.D_anderes;
    if (typeof t !== "string") return { ok: false, fehler: "D_anderes: text erwartet" };
    if (!wert.D || !wert.D.includes("Etwas anderes")) return { ok: false, fehler: "D_anderes ohne Etwas anderes" };
    const s = t.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    if (s.length > MAX_ANDERES) return { ok: false, fehler: "D_anderes zu lang" };
    if (s) wert.D_anderes = s;
  }
  return { ok: true, wert };
}

export { FRAGEN };
