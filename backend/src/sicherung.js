import { alleEreignisse, verarbeitungMarkieren } from "./ereignisse.js";
import { ndjson, tag } from "./util.js";

export const SCHRITT_R2 = "r2_sicherung";

/** Naechtlich: vollstaendiger NDJSON-Export nach R2 (Schluessel je Tag, wiederholbar). */
export async function r2Sicherung(env) {
  const alle = await alleEreignisse(env);
  const key = `export/ereignisse-${tag()}.ndjson`;
  await env.SICHERUNG.put(key, ndjson(alle), { httpMetadata: { contentType: "application/x-ndjson" } });
  await verarbeitungMarkieren(env, { ereignis_ids: alle.map((e) => e.id), schritt: SCHRITT_R2, ergebnis: key });
  return { key, anzahl: alle.length };
}
