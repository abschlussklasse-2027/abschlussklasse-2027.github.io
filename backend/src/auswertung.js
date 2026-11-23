import { FRAGEN } from "./validierung.js";
import { alleEreignisse } from "./ereignisse.js";

/** Zaehlt Antworten je Frage und Option. Freitexte (D_anderes) nur als Anzahl, nie im Wortlaut. */
export function zaehle(stimmen) {
  const fragen = {};
  for (const f of FRAGEN) {
    fragen[f.id] = Object.fromEntries(f.optionen.concat(f.anderes ? ["Etwas anderes"] : []).map((o) => [o, 0]));
  }
  let anderes = 0;
  for (const s of stimmen) {
    for (const [k, v] of Object.entries(s)) {
      if (k === "D_anderes") { anderes++; continue; }
      if (!fragen[k]) continue;
      for (const o of v) if (o in fragen[k]) fragen[k][o]++;
    }
  }
  return { n: stimmen.length, fragen, freitexte_anzahl: { D_anderes: anderes } };
}

export async function auswertung(env) {
  const e = await alleEreignisse(env, { typ: "stimme" });
  return zaehle(e.map((x) => x.nutzlast));
}
