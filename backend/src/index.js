import { pruefeStimme, MAX_BYTES, MAX_BYTES_ADMIN, SCHEMA_VERSION } from "./validierung.js";
import { ereignisAnhaengen, alleEreignisse, offenFuerSchritt, verarbeitungMarkieren } from "./ereignisse.js";
import { auswertung } from "./auswertung.js";
import { entscheidungAnlegen, entscheidungenLesen } from "./entscheidungen.js";
import { json, ndjson, gleich, sha256Hex, tag } from "./util.js";

const RATE_MAX_STANDARD = 20;     // Antworten je Tag und Absender-Hash (Schulnetz teilt oft eine IP)
const TAGESMAX_STANDARD = 3000;   // gespeicherte Stimmen je Tag insgesamt
const GESAMT = "*gesamt*";        // Zaehlerzeile fuer alle Absender zusammen (kein IP-Hash, 32 Hex sind es nie)

/** Zaehlt (tag, schluessel) hoch, solange n < max. Gibt false zurueck, wenn das Limit erreicht ist (dann keine Schreibzeile). */
async function zaehlerErhoehen(env, t, schluessel, max) {
  const z = await env.DB.prepare("INSERT INTO ratenzaehler (tag, ip_hash, n) SELECT ?1, ?2, 1 WHERE ?3 > 0 ON CONFLICT(tag, ip_hash) DO UPDATE SET n = n + 1 WHERE n < ?3 RETURNING n")
    .bind(t, schluessel, max).first();
  return !!z;
}

const HONEYPOT = "website"; // im Formular unsichtbar; Bots fuellen es aus

function cors(env, origin) {
  return { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type", "access-control-max-age": "86400", vary: "origin" };
}

function istAdmin(req, env) {
  const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") || "");
  return !!(env.ADMIN_TOKEN && m && gleich(m[1], env.ADMIN_TOKEN));
}

/** Liest den Body hoechstens bis max Bytes (auch ohne Content-Length) und bricht darueber ab. */
async function lesen(req, max = MAX_BYTES_ADMIN) {
  let t = "";
  if (req.body) {
    const r = req.body.getReader(), d = new TextDecoder();
    let n = 0;
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      n += value.length;
      if (n > max) { await r.cancel(); return { fehler: "zu gross", status: 413 }; }
      t += d.decode(value, { stream: true });
    }
    t += d.decode();
  }
  try { return { wert: JSON.parse(t) }; } catch { return { fehler: "kein json", status: 400 }; }
}

async function stimme(req, env) {
  const origin = req.headers.get("origin");
  const h = origin ? cors(env, origin) : {};
  if (origin && origin !== env.ERLAUBTER_ORIGIN) return json({ ok: false, fehler: "origin" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return json({ ok: false }, 405, h);
  if (Number(req.headers.get("content-length") || 0) > MAX_BYTES) return json({ ok: false, fehler: "zu gross" }, 413, h);

  // Rate Limit: je Tag und gehashter IP, Salt wechselt taeglich. Die IP selbst wird nie gespeichert.
  const t = tag();
  const ip = req.headers.get("cf-connecting-ip") || "lokal";
  const ipHash = (await sha256Hex(`${env.RATE_SALT || "dev"}|${t}|${ip}`)).slice(0, 32);
  // Bedingtes Hochzaehlen: ueber dem Limit wird NICHT mehr geschrieben (kein Schreibzeilen-Verbrauch bei Flut).
  if (!(await zaehlerErhoehen(env, t, ipHash, Number(env.RATE_MAX || RATE_MAX_STANDARD))))
    return json({ ok: false, fehler: "Das waren heute schon ein paar Antworten von diesem Anschluss. Bitte morgen wieder." }, 429, h);

  const g = await lesen(req, MAX_BYTES);
  if (g.fehler) return json({ ok: false, fehler: g.fehler }, g.status, h);
  const body = g.wert;
  if (body && typeof body === "object" && HONEYPOT in body) {
    if (String(body[HONEYPOT] ?? "") !== "") return json({ ok: true, id: "e_" + "0".repeat(18) }, 200, h); // stillschweigend verwerfen
    delete body[HONEYPOT];
  }
  const p = pruefeStimme(body);
  if (!p.ok) return json({ ok: false, fehler: p.fehler }, 400, h);
  // Kostenschutz: harte Tagesgrenze fuer gespeicherte Ereignisse, deutlich unter den Free-Limits (D1: 100 000 Schreibzeilen/Tag).
  if (!(await zaehlerErhoehen(env, t, GESAMT, Number(env.TAGESMAX || TAGESMAX_STANDARD))))
    return json({ ok: false, fehler: "Die Umfrage nimmt heute keine weiteren Antworten mehr an. Bitte morgen noch einmal versuchen." }, 429, h);
  const id = await ereignisAnhaengen(env, { typ: "stimme", klasse: env.KLASSE, schema_version: SCHEMA_VERSION, nutzlast: p.wert });
  return json({ ok: true, id }, 200, h);
}

async function admin(req, env, url) {
  const p = url.pathname;
  if (p === "/api/export" && req.method === "GET") {
    // ?nach=<ereignis-id> | ?typ=stimme | ?offen_fuer=<schritt> (inkrementell: nur noch nicht verarbeitete)
    const schritt = url.searchParams.get("offen_fuer");
    const l = schritt ? await offenFuerSchritt(env, schritt) : await alleEreignisse(env, { nach: url.searchParams.get("nach") || "", typ: url.searchParams.get("typ") });
    return new Response(ndjson(l), { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
  }
  if (p === "/admin/export" && req.method === "GET") {
    // Komplette Sicherung als eine JSON-Datei: alle Ereignisse, alle Entscheidungen, Verarbeitungsmarken.
    const verarbeitung = (await env.DB.prepare("SELECT * FROM verarbeitung ORDER BY ereignis_id, schritt").all()).results;
    return json({ erzeugt: new Date().toISOString(), klasse: env.KLASSE, ereignisse: await alleEreignisse(env),
      entscheidungen: await entscheidungenLesen(env), verarbeitung });
  }
  if (p === "/api/auswertung" && req.method === "GET") return json(await auswertung(env));
  if (p === "/api/entscheidungen" && req.method === "GET")
    return json(await entscheidungenLesen(env, { thema: url.searchParams.get("thema"), status: url.searchParams.get("status") }));
  if (p === "/api/entscheidungen" && req.method === "POST") {
    const g = await lesen(req); if (g.fehler) return json({ fehler: g.fehler }, g.status);
    const r = await entscheidungAnlegen(env, g.wert);
    return r.fehler ? json({ fehler: r.fehler }, r.status || 400) : json({ ok: true, id: r.id }, 201);
  }
  if (p === "/api/verarbeitung" && req.method === "POST") {
    const g = await lesen(req); if (g.fehler) return json({ fehler: g.fehler }, g.status);
    const b = g.wert;
    if (!b || !Array.isArray(b.ereignis_ids) || b.ereignis_ids.length > 1000 || !/^[a-z0-9_]{1,50}$/.test(b.schritt || ""))
      return json({ fehler: "ereignis_ids (max 1000) und schritt [a-z0-9_] noetig" }, 400);
    return json({ ok: true, ...(await verarbeitungMarkieren(env, { ereignis_ids: b.ereignis_ids, schritt: b.schritt,
      ergebnis: String(b.ergebnis ?? "").slice(0, 500), entscheidung_id: b.entscheidung_id ?? null })) });
  }
  return json({ fehler: "nicht gefunden" }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/api/stimmen") return stimme(req, env);
    if (url.pathname.startsWith("/api/") || url.pathname === "/admin/export") {
      if (!istAdmin(req, env)) return json({ fehler: "kein zugang" }, 401);
      return admin(req, env, url);
    }
    return json({ fehler: "nicht gefunden" }, 404);
  },
  async scheduled(event, env) {
    // Taeglich: alte Zaehler aufraeumen. Der Worker sendet keine Mails; Sammelmeldung und Sicherung holt scripts/sammelmeldung.py ab.
    await env.DB.prepare("DELETE FROM ratenzaehler WHERE tag < ?").bind(tag(new Date(Date.now() - 2 * 864e5))).run();
  },
};
