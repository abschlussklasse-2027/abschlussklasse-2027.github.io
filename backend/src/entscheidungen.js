import { neueId } from "./util.js";

const STATUS = ["offen", "beschlossen", "umgesetzt", "verworfen"];
const text = (v, max) => typeof v === "string" && v.length <= max;

/** Neue Entscheidung oder Statuswechsel (folgt_auf): immer eine neue Zeile, uebernimmt Felder der Vorgaengerin. */
export async function entscheidungAnlegen(env, b) {
  if (!b || typeof b !== "object") return { fehler: "objekt erwartet" };
  let basis = {};
  if (b.folgt_auf) {
    const v = await env.DB.prepare("SELECT * FROM entscheidungen WHERE id = ?").bind(b.folgt_auf).first();
    if (!v) return { fehler: "folgt_auf unbekannt", status: 404 };
    const schon = await env.DB.prepare("SELECT id FROM entscheidungen WHERE folgt_auf = ?").bind(b.folgt_auf).first();
    if (schon) return { fehler: "folgt_auf hat schon einen Nachfolger: " + schon.id, status: 409 };
    basis = v;
  }
  const r = {
    thema: b.thema ?? basis.thema, frage: b.frage ?? basis.frage, entscheidung: b.entscheidung ?? basis.entscheidung,
    begruendung: b.begruendung ?? (b.folgt_auf ? "" : ""), von: b.von, status: b.status ?? "offen",
    bezug_ereignis: b.bezug_ereignis ?? basis.bezug_ereignis ?? null, folgt_auf: b.folgt_auf ?? null,
  };
  if (!text(r.thema, 100) || !r.thema || !text(r.frage, 1000) || !r.frage || !text(r.entscheidung, 2000) || !r.entscheidung
    || !text(r.begruendung, 2000) || !text(r.von, 100) || !r.von) return { fehler: "felder thema, frage, entscheidung, von noetig (Laengen begrenzt)" };
  if (!STATUS.includes(r.status)) return { fehler: "status: " + STATUS.join("|") };
  const id = neueId("d_");
  await env.DB.prepare("INSERT INTO entscheidungen (id, zeit, thema, frage, entscheidung, begruendung, von, status, bezug_ereignis, folgt_auf) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(id, new Date().toISOString(), r.thema, r.frage, r.entscheidung, r.begruendung, r.von, r.status, r.bezug_ereignis, r.folgt_auf).run();
  return { id };
}

/** Alle Zeilen (Verlauf bleibt) mit Markierung aktuell = kein Nachfolger. Optional nach Thema/Status der aktuellen Zeile. */
export async function entscheidungenLesen(env, { thema = null, status = null } = {}) {
  const { results } = await env.DB.prepare(
    `SELECT d.*, NOT EXISTS (SELECT 1 FROM entscheidungen n WHERE n.folgt_auf = d.id) AS aktuell
     FROM entscheidungen d WHERE (? IS NULL OR d.thema = ?) ORDER BY d.id`).bind(thema, thema).all();
  const l = results.map((r) => ({ ...r, aktuell: !!r.aktuell }));
  return status ? l.filter((r) => !r.aktuell || r.status === status) : l;
}
