import { sha256Hex, neueId, ereignisAusZeile } from "./util.js";

export async function ereignisAnhaengen(env, { typ, klasse, schema_version, nutzlast }) {
  const id = neueId("e_");
  const zeit = new Date().toISOString();
  const text = JSON.stringify(nutzlast);
  const hash = await sha256Hex([zeit, typ, klasse, schema_version, text].join("|"));
  await env.DB.prepare("INSERT INTO ereignisse (id, zeit, typ, klasse, schema_version, nutzlast, hash) VALUES (?,?,?,?,?,?,?)")
    .bind(id, zeit, typ, klasse, schema_version, text, hash).run();
  return id;
}

/** Ereignisse, die ein Schritt noch nicht verarbeitet hat (inkrementell), aelteste zuerst. */
export async function offenFuerSchritt(env, schritt, limit = 1000) {
  const { results } = await env.DB.prepare(
    `SELECT e.* FROM ereignisse e LEFT JOIN verarbeitung v ON v.ereignis_id = e.id AND v.schritt = ?
     WHERE v.ereignis_id IS NULL ORDER BY e.id LIMIT ?`).bind(schritt, limit).all();
  return results.map(ereignisAusZeile);
}

/** Markiert Ereignisse als verarbeitet. INSERT OR IGNORE: wiederholbar, zaehlt nur echt neue Paare. */
export async function verarbeitungMarkieren(env, { ereignis_ids, schritt, ergebnis = "", entscheidung_id = null }) {
  const zeit = new Date().toISOString();
  let neu = 0;
  for (let i = 0; i < ereignis_ids.length; i += 50) {
    const stmts = ereignis_ids.slice(i, i + 50).map((id) =>
      env.DB.prepare("INSERT OR IGNORE INTO verarbeitung (ereignis_id, schritt, zeit, ergebnis, entscheidung_id) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM ereignisse WHERE id = ?)")
        .bind(id, schritt, zeit, ergebnis, entscheidung_id, id));
    for (const r of await env.DB.batch(stmts)) neu += r.meta.changes;
  }
  return { neu, schon_markiert: ereignis_ids.length - neu };
}

export async function alleEreignisse(env, { nach = "", typ = null, limit = 100000 } = {}) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM ereignisse WHERE id > ? AND (? IS NULL OR typ = ?) ORDER BY id LIMIT ?").bind(nach, typ, typ, limit).all();
  return results.map(ereignisAusZeile);
}
