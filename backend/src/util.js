export const enc = new TextEncoder();

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Zeitlich sortierbare Id: Praefix + 12 Hex Millisekunden + 6 Hex Zufall. */
export function neueId(prefix) {
  const ms = Date.now().toString(16).padStart(12, "0");
  const r = [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return prefix + ms + r;
}

export function gleich(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

export function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", ...extra } });
}

export function ndjson(zeilen) {
  return zeilen.map((z) => JSON.stringify(z)).join("\n") + (zeilen.length ? "\n" : "");
}

export const tag = (d = new Date()) => d.toISOString().slice(0, 10);

/** Ereigniszeile aus D1 als Objekt mit geparster Nutzlast. */
export function ereignisAusZeile(r) {
  return { id: r.id, zeit: r.zeit, typ: r.typ, klasse: r.klasse, schema_version: r.schema_version, nutzlast: JSON.parse(r.nutzlast), hash: r.hash };
}

/** Zaehlt (tag, schluessel) um schritt hoch, solange der neue Stand <= max bleibt. Gibt false zurueck, wenn das Limit erreicht ist (dann keine Schreibzeile). */
export async function zaehlerErhoehen(env, t, schluessel, max, schritt = 1) {
  const z = await env.DB.prepare("INSERT INTO ratenzaehler (tag, ip_hash, n) SELECT ?1, ?2, ?4 WHERE ?4 <= ?3 ON CONFLICT(tag, ip_hash) DO UPDATE SET n = n + ?4 WHERE n + ?4 <= ?3 RETURNING n")
    .bind(t, schluessel, max, schritt).first();
  return !!z;
}
