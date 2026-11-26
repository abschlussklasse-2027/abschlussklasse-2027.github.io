import { pruefeStimme, MAX_BYTES, MAX_BYTES_ADMIN, SCHEMA_VERSION } from "./validierung.js";
import { ereignisAnhaengen, alleEreignisse, offenFuerSchritt, verarbeitungMarkieren } from "./ereignisse.js";
import { auswertung } from "./auswertung.js";
import { entscheidungAnlegen, entscheidungenLesen } from "./entscheidungen.js";
import { json, ndjson, gleich, sha256Hex, tag, zaehlerErhoehen } from "./util.js";
import { pruefeMessung, messungSpeichern, messungLesen, MAX_BYTES_MESSUNG } from "./messung.js";
import { pruefeFreigabe } from "./freigabe.js";
import { steckbrief, steckbriefAufraeumen } from "./steckbrief/routen.js";

const RATE_MAX_STANDARD = 20;     // Antworten je Tag und Absender-Hash (Schulnetz teilt oft eine IP)
const TAGESMAX_STANDARD = 3000;   // gespeicherte Stimmen je Tag insgesamt
const MESSUNG_IP_STANDARD = 600;       // Messereignisse je Tag und Absender-Hash
const MESSUNG_TAGESMAX_STANDARD = 20000; // Messereignisse je Tag insgesamt
const FREIGABE_RATE_STANDARD = 5;      // Rueckmeldungen je Tag und Absender-Hash
const FREIGABE_TAGESMAX_STANDARD = 200; // Rueckmeldungen je Tag insgesamt
const GESAMT = "*gesamt*";        // Zaehlerzeile fuer alle Absender zusammen (kein IP-Hash, 32 Hex sind es nie)

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

/** Gemeinsamer Anfang der oeffentlichen POST-Endpunkte: Origin, Preflight, Methode, Groesse. Gibt { h } oder { antwort }. */
function oeffentlich(req, env, max) {
  const origin = req.headers.get("origin");
  const h = origin ? cors(env, origin) : {};
  if (origin && origin !== env.ERLAUBTER_ORIGIN) return { antwort: json({ ok: false, fehler: "origin" }, 403) };
  if (req.method === "OPTIONS") return { antwort: new Response(null, { status: 204, headers: h }) };
  if (req.method !== "POST") return { antwort: json({ ok: false }, 405, h) };
  if (Number(req.headers.get("content-length") || 0) > max) return { antwort: json({ ok: false, fehler: "zu gross" }, 413, h) };
  return { h };
}

/** Absender-Hash je Tag (Salt wechselt taeglich), je Zweck getrennt. Die IP selbst wird nie gespeichert. */
async function absenderHash(req, env, t, zweck) {
  const ip = req.headers.get("cf-connecting-ip") || "lokal";
  return zweck + "|" + (await sha256Hex(`${env.RATE_SALT || "dev"}|${t}|${zweck}|${ip}`)).slice(0, 28);
}

// Anonyme Nutzungsmessung: POST /m mit { e: [[ereignis, merkmal], ...] }. Nur Zaehler hochzaehlen, keine Besucherzeilen.
async function messung(req, env) {
  const o = oeffentlich(req, env, MAX_BYTES_MESSUNG); if (o.antwort) return o.antwort; const h = o.h;
  const g = await lesen(req, MAX_BYTES_MESSUNG);
  if (g.fehler) return json({ ok: false, fehler: g.fehler }, g.status, h);
  const p = pruefeMessung(g.wert);
  if (!p.ok) return json({ ok: false, fehler: p.fehler }, 400, h);
  const t = tag();
  // Kostenschutz: Grenzen zaehlen Ereignisse (nicht Anfragen); ueber dem Limit wird nichts mehr geschrieben.
  if (!(await zaehlerErhoehen(env, t, await absenderHash(req, env, t, "m"), Number(env.MESSUNG_IP_MAX || MESSUNG_IP_STANDARD), p.anzahl)))
    return json({ ok: false, fehler: "limit" }, 429, h);
  if (!(await zaehlerErhoehen(env, t, "*messung*", Number(env.MESSUNG_TAGESMAX || MESSUNG_TAGESMAX_STANDARD), p.anzahl)))
    return json({ ok: false, fehler: "limit" }, 429, h);
  await messungSpeichern(env, p.paare, t);
  return json({ ok: true }, 200, h);
}

// Rueckmeldung der Schule: POST /api/freigabe. Append-only als Ereignis "schulfreigabe", keine Veroeffentlichung.
async function freigabe(req, env) {
  const o = oeffentlich(req, env, MAX_BYTES); if (o.antwort) return o.antwort; const h = o.h;
  const t = tag();
  if (!(await zaehlerErhoehen(env, t, await absenderHash(req, env, t, "f"), Number(env.FREIGABE_RATE_MAX || FREIGABE_RATE_STANDARD))))
    return json({ ok: false, fehler: "Von diesem Anschluss kamen heute schon mehrere Rueckmeldungen. Bitte morgen wieder." }, 429, h);
  const g = await lesen(req, MAX_BYTES);
  if (g.fehler) return json({ ok: false, fehler: g.fehler }, g.status, h);
  const body = g.wert;
  if (body && typeof body === "object" && HONEYPOT in body) {
    if (String(body[HONEYPOT] ?? "") !== "") return json({ ok: true, id: "e_" + "0".repeat(18) }, 200, h);
    delete body[HONEYPOT];
  }
  const p = pruefeFreigabe(body);
  if (!p.ok) return json({ ok: false, fehler: p.fehler }, 400, h);
  if (!(await zaehlerErhoehen(env, t, "*freigabe*", Number(env.FREIGABE_TAGESMAX || FREIGABE_TAGESMAX_STANDARD))))
    return json({ ok: false, fehler: "Heute werden keine weiteren Rueckmeldungen angenommen. Bitte morgen noch einmal versuchen." }, 429, h);
  const id = await ereignisAnhaengen(env, { typ: "schulfreigabe", klasse: env.KLASSE, schema_version: SCHEMA_VERSION, nutzlast: p.wert });
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
      entscheidungen: await entscheidungenLesen(env), verarbeitung, messung: (await messungLesen(env)).tage });
  }
  if (p === "/admin/messung" && req.method === "GET") {
    const d = (k) => (/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get(k) || "") ? url.searchParams.get(k) : undefined);
    return json(await messungLesen(env, { von: d("von"), bis: d("bis") }));
  }
  if (p === "/admin/freigaben" && req.method === "GET") return json({ erzeugt: new Date().toISOString(), freigaben: await alleEreignisse(env, { typ: "schulfreigabe" }) });
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
    if (url.pathname === "/api/freigabe") return freigabe(req, env);
    if (url.pathname === "/m") return messung(req, env);
    if (url.pathname.startsWith("/steckbrief/")) return steckbrief(req, env, url);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin/")) {
      if (!istAdmin(req, env)) return json({ fehler: "kein zugang" }, 401);
      return admin(req, env, url);
    }
    return json({ fehler: "nicht gefunden" }, 404);
  },
  async scheduled(event, env) {
    // Taeglich: alte Zaehler aufraeumen. Der Worker sendet keine Mails; Sammelmeldung und Sicherung holt scripts/sammelmeldung.py ab.
    await env.DB.prepare("DELETE FROM ratenzaehler WHERE tag < ?").bind(tag(new Date(Date.now() - 2 * 864e5))).run();
    await steckbriefAufraeumen(env);
  },
};
