// Felder, Laengen, Positivvorlage und mehrstufige Pruefung (Wortlisten -> KI).
import { wortlistenPruefung } from "./moderation.js";
import { kiPruefen } from "./ki.js";

export const FELDER = {
  lieblingsessen: { label: "Lieblingsessen", max: 60 },
  lieblingsfach: { label: "Lieblingsfach", max: 60 },
  hobby: { label: "Hobby", max: 80 },
  was_ich_mag: { label: "Was ich an ihm/ihr mag", max: 140 },
  kann_besonders_gut: { label: "Das kann er/sie besonders gut", max: 140 },
  abschlussparty: { label: "Ein Satz zur Abschlussparty", max: 140 },
};
export const MIN_FELDER = 3;
export const PORTRAET_MAX_WOERTER = 120;
export const PORTRAET_MAX_ZEICHEN = 900;
export const PORTRAET_MIN_ZEICHEN = 20;

export const MELDUNG_BLOCKIERT = "Das können wir so nicht speichern. Schreib etwas, das du auch über dich selbst gern lesen würdest.";
export const MELDUNG_FORM = "Das passt noch nicht ins Formular. Bitte prüf die Angaben und die Länge.";
export const MELDUNG_KI_AUS = "Die Prüfung ist gerade nicht erreichbar. Nichts wurde gespeichert. Bitte versuch es später noch einmal.";

/** Form und Laenge pruefen. Gibt { ok, felder } (bereinigt) oder { ok:false }. Antwort enthaelt nie den Text. */
export function formPruefen(form, eingabe) {
  if (!eingabe || typeof eingabe !== "object" || Array.isArray(eingabe)) return { ok: false };
  const sauber = (v) => String(v).normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (form === "steckbrief") {
    const out = {};
    for (const [k, v] of Object.entries(eingabe)) {
      if (!(k in FELDER) || typeof v !== "string") return { ok: false };
      const s = sauber(v);
      if (s.length > FELDER[k].max) return { ok: false };
      if (s) out[k] = s;
    }
    return Object.keys(out).length >= MIN_FELDER ? { ok: true, felder: out } : { ok: false };
  }
  if (form === "portraet") {
    if (Object.keys(eingabe).some((k) => k !== "text") || typeof eingabe.text !== "string") return { ok: false };
    const s = sauber(eingabe.text);
    const w = s.split(" ").filter(Boolean).length;
    if (s.length < PORTRAET_MIN_ZEICHEN || s.length > PORTRAET_MAX_ZEICHEN || w > PORTRAET_MAX_WOERTER) return { ok: false };
    return { ok: true, felder: { text: s } };
  }
  return { ok: false };
}

/**
 * Mehrstufige Inhaltspruefung. Gibt { ok:true } | { ok:false, status, meldung, codes }.
 * Der Text wird weder zurueckgegeben noch irgendwo protokolliert; codes sind nur Stufenkuerzel.
 */
export async function inhaltPruefen(env, felder) {
  const werte = Object.values(felder);
  const alle = [...werte, werte.join(". ")];
  const codes = new Set();
  for (const t of alle) { const r = wortlistenPruefung(t); if (!r.ok) r.codes.forEach((c) => codes.add(c)); }
  if (codes.size) return { ok: false, status: 422, meldung: MELDUNG_BLOCKIERT, codes: [...codes] };
  try {
    const k = await kiPruefen(env, werte.join("\n"));
    if (!k.ok) return { ok: false, status: 422, meldung: MELDUNG_BLOCKIERT, codes: ["ki:" + (k.grund || "x")] };
  } catch {
    return { ok: false, status: 503, meldung: MELDUNG_KI_AUS, codes: ["ki:fehler"] };
  }
  return { ok: true };
}
