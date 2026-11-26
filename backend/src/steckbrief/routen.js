// Routen /steckbrief/*. Fluss: entwurf -> freigabe_kind -> (unter 16: freigabe_eltern) -> sichtbar; abgelehnt/widerrufen/geloescht.
import { json, gleich, tag, zaehlerErhoehen } from "../util.js";
import { zufallsId, emailHash, einmalTokenAusstellen, einmalTokenEinloesen, einmalTokenGueltig, sitzungAusstellen, sitzungLesen, kurzHash, LOGIN_MIN, ELTERN_TAGE } from "./auth.js";
import { mailSenden } from "./mail.js";
import { formPruefen, inhaltPruefen, MELDUNG_FORM } from "./inhalt.js";

const FRIST_TAGE = 30;
const MAX_BODY = 4096;
const ID = /^[a-z]_[0-9a-f]{24}$/;
const KLASSE = /^[a-z0-9-]{3,40}$/;
const KUERZEL = /^[\p{L}][\p{L} .'-]{0,24}$/u;
const MAIL = /^[^\s@]{1,64}@[^\s@]{1,120}\.[^\s@]{2,20}$/;
const jetzt = () => new Date().toISOString();

const num = (env, k, d) => Number(env[k] || d);

function cors(env, origin) {
  return { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
    "access-control-allow-headers": "content-type, authorization", "access-control-max-age": "86400", vary: "origin" };
}

async function lesenJson(req) {
  let t = "";
  if (req.body) {
    const r = req.body.getReader(), d = new TextDecoder();
    let n = 0;
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      n += value.length;
      if (n > MAX_BODY) { await r.cancel(); return { fehler: "zu gross", status: 413 }; }
      t += d.decode(value, { stream: true });
    }
    t += d.decode();
  }
  if (!t) return { wert: {} };
  try { const w = JSON.parse(t); return w && typeof w === "object" && !Array.isArray(w) ? { wert: w } : { fehler: "kein json", status: 400 }; } catch { return { fehler: "kein json", status: 400 }; }
}

export async function audit(env, aktion, { klasse, person, beschreibung, detail } = {}) {
  await env.DB.prepare("INSERT INTO sb_audit (zeit, aktion, klasse_id, person_id, beschreibung_id, detail) VALUES (?,?,?,?,?,?)")
    .bind(jetzt(), aktion, klasse ?? null, person ?? null, beschreibung ?? null, String(detail ?? "").slice(0, 120)).run();
}

async function limit(env, schluessel, max) { return zaehlerErhoehen(env, tag(), schluessel, max); }

const ipHash = async (req, env, zweck) => "sb" + zweck + ":" + (await kurzHash(`${env.STECKBRIEF_SECRET}|${tag()}|${req.headers.get("cf-connecting-ip") || "lokal"}`)).slice(0, 24);

// ---- Anmeldung ----
async function login(req, env, h) {
  const g = await lesenJson(req); if (g.fehler) return json({ ok: false, fehler: g.fehler }, g.status, h);
  const { klasse, email } = g.wert;
  if (!KLASSE.test(String(klasse || "")) || !MAIL.test(String(email || ""))) return json({ ok: false, fehler: "angaben" }, 400, h);
  const eh = (await emailHash(env, email)).slice(0, 24);
  if (!(await limit(env, await ipHash(req, env, "li"), num(env, "SB_LOGIN_IP_MAX", 20)))
    || !(await limit(env, "sble:" + eh, num(env, "SB_LOGIN_MAIL_MAX", 5))))
    return json({ ok: false, fehler: "Zu viele Versuche. Bitte spaeter wieder." }, 429, h);
  const p = await env.DB.prepare("SELECT id, klasse_id FROM sb_personen WHERE klasse_id = ? AND email_hash = ? AND gesperrt = 0").bind(klasse, await emailHash(env, email)).first();
  if (p) {
    const token = await einmalTokenAusstellen(env, { typ: "login", personId: p.id, minuten: LOGIN_MIN });
    const basis = env.LINK_BASIS || "https://abschlussklasse-2027.github.io/steckbrief.html";
    await mailSenden(env, { an: String(email).trim(), betreff: "Dein Anmelde-Link", text: `Dein Link (einmalig, ${LOGIN_MIN} Minuten gueltig):\n${basis}?class=${encodeURIComponent(klasse)}&token=${token}` });
    await audit(env, "login_link", { klasse, person: p.id });
  }
  // Immer dieselbe Antwort: verraet nicht, ob die Adresse bekannt ist.
  return json({ ok: true, meldung: "Wenn die Adresse bekannt ist, ist ein Link unterwegs." }, 200, h);
}

async function verify(req, env, h) {
  const g = await lesenJson(req); if (g.fehler) return json({ ok: false, fehler: g.fehler }, g.status, h);
  if (!(await limit(env, await ipHash(req, env, "vf"), num(env, "SB_VERIFY_IP_MAX", 60)))) return json({ ok: false, fehler: "limit" }, 429, h);
  const p = await einmalTokenEinloesen(env, g.wert.token, "login");
  if (!p) return json({ ok: false, fehler: "Der Link gilt nicht mehr. Bitte neu anfordern." }, 401, h);
  const klasse = String(g.wert.class || g.wert.klasse || "");
  const person = await env.DB.prepare("SELECT id, klasse_id, kuerzel, rolle FROM sb_personen WHERE id = ? AND gesperrt = 0").bind(p.pid).first();
  if (!person || (klasse && klasse !== person.klasse_id)) return json({ ok: false, fehler: "Der Link gilt nicht mehr. Bitte neu anfordern." }, 401, h);
  await audit(env, "login", { klasse: person.klasse_id, person: person.id });
  return json({ ok: true, sitzung: await sitzungAusstellen(env, person), klasse: person.klasse_id, rolle: person.rolle, kuerzel: person.kuerzel }, 200, h);
}

// ---- Hilfen ----
const lesbar = (b, mitText = true) => ({ id: b.id, form: b.form, status: b.status, felder: mitText ? JSON.parse(b.felder) : undefined, erstellt: b.erstellt, frist: b.loeschen_nach || null });

async function wipe(env, id, status, extra = "") {
  return env.DB.prepare(`UPDATE sb_beschreibungen SET felder = '{}', status = ?, aktualisiert = ?, loeschen_nach = NULL ${extra} WHERE id = ?`).bind(status, jetzt(), id).run();
}

async function beschreibungSchreiben(req, env, p, h) {
  if (p.rolle !== "kind") return json({ ok: false, fehler: "nur Kinder schreiben" }, 403, h);
  if (!(await limit(env, "sbs:" + p.id, num(env, "SB_SCHREIB_MAX", 15)))) return json({ ok: false, fehler: "Heute reicht es erst einmal. Morgen geht es weiter." }, 429, h);
  const g = await lesenJson(req); if (g.fehler) return json({ ok: false, fehler: g.fehler }, g.status, h);
  const { subjekt, form, felder } = g.wert;
  if (!ID.test(String(subjekt || ""))) return json({ ok: false, fehler: MELDUNG_FORM }, 400, h);
  const ziel = await env.DB.prepare("SELECT id, rolle, gesperrt FROM sb_personen WHERE id = ? AND klasse_id = ?").bind(subjekt, p.klasse_id).first();
  if (!ziel || ziel.rolle !== "kind" || ziel.gesperrt) return json({ ok: false, fehler: "nicht gefunden" }, 404, h);
  if (ziel.id === p.id) return json({ ok: false, fehler: "Du beschreibst ein anderes Kind." }, 400, h);
  const f = formPruefen(form, felder);
  if (!f.ok) return json({ ok: false, fehler: MELDUNG_FORM }, 400, h);
  const offen = await env.DB.prepare("SELECT COUNT(*) c FROM sb_beschreibungen WHERE autor_id = ? AND subjekt_id = ? AND status IN ('entwurf','freigabe_kind','freigabe_eltern')").bind(p.id, subjekt).first();
  if (offen.c >= 2) return json({ ok: false, fehler: "Hier liegt schon etwas zur Pruefung." }, 409, h);
  const r = await inhaltPruefen(env, f.felder);
  if (!r.ok) {
    await audit(env, "blockiert", { klasse: p.klasse_id, person: p.id, detail: r.codes.join(",") }); // nur Codes, nie Text
    return json({ ok: false, meldung: r.meldung }, r.status, h);
  }
  const id = zufallsId("b_");
  const t = jetzt();
  await env.DB.prepare("INSERT INTO sb_beschreibungen (id, klasse_id, autor_id, subjekt_id, form, felder, status, erstellt, aktualisiert, loeschen_nach) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(id, p.klasse_id, p.id, subjekt, form, JSON.stringify(f.felder), "entwurf", t, t, new Date(Date.now() + FRIST_TAGE * 864e5).toISOString()).run();
  await audit(env, "entwurf", { klasse: p.klasse_id, person: p.id, beschreibung: id });
  return json({ ok: true, id, status: "entwurf" }, 201, h);
}

/** Beschreibung laden, nur wenn die Person das Subjekt (Rolle "subjekt") oder der Autor ist, gleiche Klasse. */
async function eigene(env, p, id, rolle) {
  if (!ID.test(id)) return null;
  const b = await env.DB.prepare("SELECT * FROM sb_beschreibungen WHERE id = ? AND klasse_id = ?").bind(id, p.klasse_id).first();
  if (!b) return null;
  if (rolle === "subjekt" && b.subjekt_id !== p.id) return null;
  if (rolle === "autor" && b.autor_id !== p.id) return null;
  return b;
}

const lebendig = (b) => ["entwurf", "freigabe_kind", "freigabe_eltern", "sichtbar"].includes(b.status) && !b.gesperrt;

async function verbessern(req, env, p, id, h) {
  const b = await eigene(env, p, id, "subjekt");
  if (!b || b.status !== "entwurf" || b.gesperrt) return json({ ok: false, fehler: "nicht gefunden" }, 404, h);
  const g = await lesenJson(req); if (g.fehler) return json({ ok: false, fehler: g.fehler }, g.status, h);
  const f = formPruefen(b.form, g.wert.felder);
  if (!f.ok) return json({ ok: false, fehler: MELDUNG_FORM }, 400, h);
  if (!(await limit(env, "sbs:" + p.id, num(env, "SB_SCHREIB_MAX", 15)))) return json({ ok: false, fehler: "limit" }, 429, h);
  const r = await inhaltPruefen(env, f.felder);
  if (!r.ok) { await audit(env, "blockiert", { klasse: p.klasse_id, person: p.id, beschreibung: id, detail: r.codes.join(",") }); return json({ ok: false, meldung: r.meldung }, r.status, h); }
  await env.DB.prepare("UPDATE sb_beschreibungen SET felder = ?, aktualisiert = ? WHERE id = ? AND status = 'entwurf'").bind(JSON.stringify(f.felder), jetzt(), id).run();
  await audit(env, "verbessert", { klasse: p.klasse_id, person: p.id, beschreibung: id });
  return json({ ok: true }, 200, h);
}

async function freigeben(req, env, p, id, h) {
  const b = await eigene(env, p, id, "subjekt");
  if (!b || b.gesperrt) return json({ ok: false, fehler: "nicht gefunden" }, 404, h);
  const g = await lesenJson(req); if (g.fehler) return json({ ok: false, fehler: g.fehler }, g.status, h);
  let elternMail = null;
  if (p.unter16) {
    elternMail = String(g.wert.eltern_email || "").trim();
    if (!MAIL.test(elternMail)) return json({ ok: false, fehler: "Bei unter 16 braucht es die Mailadresse der Eltern." }, 400, h);
  }
  // Atomar: nur aus entwurf in freigabe_kind. Frist bleibt bis zur endgueltigen Freigabe bestehen.
  const u = await env.DB.prepare("UPDATE sb_beschreibungen SET status = 'freigabe_kind', aktualisiert = ? WHERE id = ? AND status = 'entwurf' AND gesperrt = 0 RETURNING id").bind(jetzt(), id).first();
  if (!u) return json({ ok: false, fehler: "Das geht gerade nicht." }, 409, h);
  await env.DB.prepare("INSERT INTO sb_freigaben (id, beschreibung_id, wer, zeit) VALUES (?,?,?,?)").bind(zufallsId("f_"), id, "kind", jetzt()).run();
  await audit(env, "freigabe_kind", { klasse: p.klasse_id, person: p.id, beschreibung: id });
  if (!p.unter16) {
    await env.DB.prepare("UPDATE sb_beschreibungen SET status = 'sichtbar', loeschen_nach = NULL, aktualisiert = ? WHERE id = ? AND status = 'freigabe_kind'").bind(jetzt(), id).run();
    await audit(env, "sichtbar", { klasse: p.klasse_id, beschreibung: id });
    return json({ ok: true, status: "sichtbar" }, 200, h);
  }
  await env.DB.prepare("UPDATE sb_beschreibungen SET status = 'freigabe_eltern', aktualisiert = ? WHERE id = ? AND status = 'freigabe_kind'").bind(jetzt(), id).run();
  await env.DB.prepare("UPDATE sb_personen SET eltern_email_hash = ? WHERE id = ?").bind(await emailHash(env, elternMail), p.id).run();
  const token = await einmalTokenAusstellen(env, { typ: "eltern", personId: p.id, beschreibungId: id, minuten: ELTERN_TAGE * 1440 });
  const basis = env.LINK_BASIS || "https://abschlussklasse-2027.github.io/steckbrief.html";
  await mailSenden(env, { an: elternMail, betreff: "Bitte um Zustimmung", text: `Ihr Kind moechte, dass ein Text ueber es auf der Klassenseite erscheint. Ansehen und entscheiden (${ELTERN_TAGE} Tage gueltig):\n${basis}?eltern=${token}` });
  await audit(env, "freigabe_eltern_angefragt", { klasse: p.klasse_id, person: p.id, beschreibung: id });
  return json({ ok: true, status: "freigabe_eltern" }, 200, h);
}

async function ablehnen(env, p, id, h) {
  const b = await eigene(env, p, id, "subjekt");
  if (!b || !["entwurf", "freigabe_kind", "freigabe_eltern"].includes(b.status)) return json({ ok: false, fehler: "nicht gefunden" }, 404, h);
  await wipe(env, id, "abgelehnt");
  await audit(env, "abgelehnt", { klasse: p.klasse_id, person: p.id, beschreibung: id });
  return json({ ok: true, status: "abgelehnt" }, 200, h);
}

async function widerrufen(env, p, id, h) {
  const b = await eigene(env, p, id, "subjekt");
  if (!b || !["freigabe_kind", "freigabe_eltern", "sichtbar"].includes(b.status)) return json({ ok: false, fehler: "nicht gefunden" }, 404, h);
  await env.DB.prepare("UPDATE sb_freigaben SET widerrufen_zeit = ? WHERE beschreibung_id = ? AND widerrufen_zeit IS NULL").bind(jetzt(), id).run();
  await wipe(env, id, "widerrufen"); // Text sofort weg, nicht erst nach 30 Tagen
  await audit(env, "widerrufen", { klasse: p.klasse_id, person: p.id, beschreibung: id });
  return json({ ok: true, status: "widerrufen" }, 200, h);
}

async function melden(env, p, id, h) {
  if (!ID.test(id)) return json({ ok: false, fehler: "nicht gefunden" }, 404, h);
  const b = await env.DB.prepare("SELECT id, status FROM sb_beschreibungen WHERE id = ? AND klasse_id = ?").bind(id, p.klasse_id).first();
  if (!b || !["entwurf", "freigabe_kind", "freigabe_eltern", "sichtbar"].includes(b.status)) return json({ ok: false, fehler: "nicht gefunden" }, 404, h);
  if (!(await limit(env, "sbm:" + p.id, 10))) return json({ ok: false, fehler: "limit" }, 429, h);
  await env.DB.prepare("UPDATE sb_beschreibungen SET gemeldet = 1 WHERE id = ?").bind(id).run();
  await audit(env, "gemeldet", { klasse: p.klasse_id, person: p.id, beschreibung: id });
  return json({ ok: true }, 200, h);
}

// ---- Eltern (Token statt Sitzung) ----
async function eltern(req, env, teil, h) {
  const g = await lesenJson(req); if (g.fehler) return json({ ok: false, fehler: g.fehler }, g.status, h);
  if (!(await limit(env, await ipHash(req, env, "el"), num(env, "SB_ELTERN_IP_MAX", 60)))) return json({ ok: false, fehler: "limit" }, 429, h);
  const nein = () => json({ ok: false, fehler: "Der Link gilt nicht mehr." }, 401, h);
  if (teil === "ansehen") {
    const t = await einmalTokenGueltig(env, g.wert.token, "eltern");
    if (!t) return nein();
    const b = await env.DB.prepare("SELECT * FROM sb_beschreibungen WHERE id = ? AND status = 'freigabe_eltern' AND gesperrt = 0").bind(t.bid).first();
    return b ? json({ ok: true, form: b.form, felder: JSON.parse(b.felder) }, 200, h) : nein();
  }
  if (teil !== "freigabe" && teil !== "ablehnen") return json({ ok: false, fehler: "nicht gefunden" }, 404, h);
  const t = await einmalTokenEinloesen(env, g.wert.token, "eltern");
  if (!t) return nein();
  const b = await env.DB.prepare("SELECT * FROM sb_beschreibungen WHERE id = ?").bind(t.bid).first();
  if (!b || b.status !== "freigabe_eltern" || b.gesperrt) return nein();
  if (teil === "ablehnen") {
    await wipe(env, b.id, "abgelehnt");
    await audit(env, "eltern_abgelehnt", { klasse: b.klasse_id, beschreibung: b.id });
    return json({ ok: true, status: "abgelehnt" }, 200, h);
  }
  await env.DB.prepare("INSERT INTO sb_freigaben (id, beschreibung_id, wer, zeit) VALUES (?,?,?,?)").bind(zufallsId("f_"), b.id, "eltern", jetzt()).run();
  await env.DB.prepare("UPDATE sb_beschreibungen SET status = 'sichtbar', loeschen_nach = NULL, aktualisiert = ? WHERE id = ? AND status = 'freigabe_eltern'").bind(jetzt(), b.id).run();
  await audit(env, "sichtbar", { klasse: b.klasse_id, beschreibung: b.id, detail: "eltern" });
  return json({ ok: true, status: "sichtbar" }, 200, h);
}

// ---- Oeffentlich (nur Freigegebenes) ----
async function oeffentlichLesen(req, env, url, h) {
  if (!(await limit(env, await ipHash(req, env, "ol"), num(env, "SB_LESEN_IP_MAX", 600)))) return json({ ok: false, fehler: "limit" }, 429, h);
  const klasse = url.searchParams.get("class") || "";
  if (!KLASSE.test(klasse)) return json({ ok: false, fehler: "klasse" }, 400, h);
  // Nur freigegebene Texte. Keine Personenliste, kein Autor, keine Mail, nur der Vorname des Beschriebenen (er hat zugestimmt).
  const z = (await env.DB.prepare(`SELECT b.id, b.form, b.felder, p.kuerzel FROM sb_beschreibungen b JOIN sb_personen p ON p.id = b.subjekt_id
    WHERE b.klasse_id = ? AND b.status = 'sichtbar' AND b.gesperrt = 0 AND p.gesperrt = 0 ORDER BY b.aktualisiert DESC LIMIT 100`).bind(klasse).all()).results;
  return json({ ok: true, texte: z.map((r) => ({ id: r.id, form: r.form, vorname: r.kuerzel, felder: JSON.parse(r.felder) })) }, 200, { ...h, "cache-control": "no-store" });
}

// ---- Gremium ----
async function gremium(req, env, p, teil, id, h) {
  if (p.rolle !== "gremium" && p.rolle !== "lehrkraft") return json({ ok: false, fehler: "kein zugang" }, 403, h);
  if (teil === "offen" && req.method === "GET") {
    const z = (await env.DB.prepare(`SELECT b.id, b.form, b.status, b.gemeldet, b.gesperrt, b.felder, b.aktualisiert FROM sb_beschreibungen b
      WHERE b.klasse_id = ? AND ((b.gemeldet = 1 AND b.status NOT IN ('geloescht','abgelehnt','widerrufen')) OR (b.gesperrt = 1 AND b.status NOT IN ('geloescht','abgelehnt','widerrufen')))
      ORDER BY b.aktualisiert DESC LIMIT 200`).bind(p.klasse_id).all()).results;
    return json({ ok: true, texte: z.map((r) => ({ id: r.id, form: r.form, status: r.status, gemeldet: !!r.gemeldet, gesperrt: !!r.gesperrt, felder: JSON.parse(r.felder) })) }, 200, h);
  }
  if ((teil === "sperren" || teil === "entsperren") && req.method === "POST" && ID.test(id)) {
    const wert = teil === "sperren" ? 1 : 0;
    const u = await env.DB.prepare("UPDATE sb_beschreibungen SET gesperrt = ?, aktualisiert = ? WHERE id = ? AND klasse_id = ? AND status NOT IN ('geloescht','abgelehnt','widerrufen') RETURNING id").bind(wert, jetzt(), id, p.klasse_id).first();
    if (!u) return json({ ok: false, fehler: "nicht gefunden" }, 404, h);
    await audit(env, teil, { klasse: p.klasse_id, person: p.id, beschreibung: id });
    return json({ ok: true }, 200, h);
  }
  return json({ ok: false, fehler: "nicht gefunden" }, 404, h);
}

// ---- Verwaltung (ADMIN_TOKEN): Klassen und Personen anlegen ----
async function verwaltung(req, env, teil, h) {
  const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") || "");
  if (!(env.ADMIN_TOKEN && m && gleich(m[1], env.ADMIN_TOKEN))) return json({ ok: false, fehler: "kein zugang" }, 401, h);
  const g = await lesenJson(req); if (g.fehler) return json({ ok: false, fehler: g.fehler }, g.status, h);
  const b = g.wert;
  if (teil === "klassen" && req.method === "POST") {
    if (!KLASSE.test(String(b.id || "")) || typeof b.name !== "string" || b.name.length < 1 || b.name.length > 60) return json({ ok: false, fehler: "angaben" }, 400, h);
    await env.DB.prepare("INSERT OR IGNORE INTO sb_klassen (id, name, erstellt) VALUES (?,?,?)").bind(b.id, b.name, jetzt()).run();
    return json({ ok: true }, 201, h);
  }
  if (teil === "personen" && req.method === "POST") {
    if (!KLASSE.test(String(b.klasse || "")) || !KUERZEL.test(String(b.kuerzel || "")) || !MAIL.test(String(b.email || "")) || !["kind", "gremium", "lehrkraft"].includes(b.rolle))
      return json({ ok: false, fehler: "angaben" }, 400, h);
    const k = await env.DB.prepare("SELECT id FROM sb_klassen WHERE id = ?").bind(b.klasse).first();
    if (!k) return json({ ok: false, fehler: "klasse unbekannt" }, 404, h);
    const id = zufallsId("p_");
    try {
      await env.DB.prepare("INSERT INTO sb_personen (id, klasse_id, kuerzel, email_hash, rolle, unter16, erstellt) VALUES (?,?,?,?,?,?,?)")
        .bind(id, b.klasse, b.kuerzel.trim(), await emailHash(env, b.email), b.rolle, b.unter16 ? 1 : 0, jetzt()).run();
    } catch { return json({ ok: false, fehler: "schon vorhanden" }, 409, h); }
    await audit(env, "person_angelegt", { klasse: b.klasse, person: id });
    return json({ ok: true, id }, 201, h);
  }
  return json({ ok: false, fehler: "nicht gefunden" }, 404, h);
}

export async function steckbrief(req, env, url) {
  const origin = req.headers.get("origin");
  const h = origin ? cors(env, origin) : {};
  if (origin && origin !== env.ERLAUBTER_ORIGIN) return json({ ok: false, fehler: "origin" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return json({ ok: false, fehler: "zu gross" }, 413, h);
  if (!env.STECKBRIEF_SECRET) return json({ ok: false, fehler: "nicht eingerichtet" }, 503, h);
  const t = url.pathname.split("/").filter(Boolean).slice(1); // nach "steckbrief"
  const [a, b, c] = t;
  const post = req.method === "POST", get = req.method === "GET";

  if (a === "oeffentlich" && get) return oeffentlichLesen(req, env, url, h);
  if (a === "login" && post) return login(req, env, h);
  if (a === "verify" && post) return verify(req, env, h);
  if (a === "eltern" && post && b) return eltern(req, env, b, h);
  if (a === "admin" && b) return verwaltung(req, env, b, h);

  const p = await sitzungLesen(env, req);
  if (!p) return json({ ok: false, fehler: "Bitte neu anmelden." }, 401, h);

  if (a === "personen" && get) { // Auswahl fuer das schreibende Kind: nur Klasse, nur Kinder, nur Kuerzel + zufaellige Id
    const z = (await env.DB.prepare("SELECT id, kuerzel FROM sb_personen WHERE klasse_id = ? AND rolle = 'kind' AND gesperrt = 0 AND id != ? ORDER BY kuerzel").bind(p.klasse_id, p.id).all()).results;
    return json({ ok: true, personen: z }, 200, h);
  }
  if (a === "beschreibungen" && !b && post) return beschreibungSchreiben(req, env, p, h);
  if (a === "ueber-mich" && get) { // Entwuerfe und Stand zu mir; der Autor bleibt unsichtbar
    const z = (await env.DB.prepare("SELECT * FROM sb_beschreibungen WHERE subjekt_id = ? AND klasse_id = ? AND status IN ('entwurf','freigabe_kind','freigabe_eltern','sichtbar') AND gesperrt = 0 ORDER BY erstellt DESC").bind(p.id, p.klasse_id).all()).results;
    return json({ ok: true, texte: z.map((r) => lesbar(r)) }, 200, h);
  }
  if (a === "von-mir" && get) { // was ich geschrieben habe: nur Stand, kein Zugriff auf Freigabe
    const z = (await env.DB.prepare("SELECT * FROM sb_beschreibungen WHERE autor_id = ? AND klasse_id = ? ORDER BY erstellt DESC LIMIT 50").bind(p.id, p.klasse_id).all()).results;
    return json({ ok: true, texte: z.map((r) => lesbar(r, lebendig(r))) }, 200, h);
  }
  if (a === "beschreibungen" && b && c) {
    if (c === "freigeben" && post) return freigeben(req, env, p, b, h);
    if (c === "ablehnen" && post) return ablehnen(env, p, b, h);
    if (c === "widerruf" && post) return widerrufen(env, p, b, h);
    if (c === "melden" && post) return melden(env, p, b, h);
    if (c === "verbessern" && req.method === "PUT") return verbessern(req, env, p, b, h);
  }
  if (a === "gremium" && b) return gremium(req, env, p, b, c, h);
  return json({ ok: false, fehler: "nicht gefunden" }, 404, h);
}

/** Taeglich (Cron): Frist 30 Tage fuer nicht freigegebene Texte, alte Einmal-Tokens, alte Audit-Zeilen. */
export async function steckbriefAufraeumen(env) {
  const t = jetzt();
  const r = await env.DB.prepare("UPDATE sb_beschreibungen SET felder = '{}', status = 'geloescht', loeschen_nach = NULL, aktualisiert = ? WHERE status IN ('entwurf','freigabe_kind','freigabe_eltern') AND loeschen_nach IS NOT NULL AND loeschen_nach <= ?").bind(t, t).run();
  await env.DB.prepare("DELETE FROM sb_tokens WHERE ablauf < ?").bind(new Date(Date.now() - 864e5).toISOString()).run();
  await env.DB.prepare("DELETE FROM sb_audit WHERE zeit < ?").bind(new Date(Date.now() - 180 * 864e5).toISOString()).run();
  if (r.meta?.changes) await audit(env, "frist_geloescht", { detail: "n=" + r.meta.changes });
  return r.meta?.changes || 0;
}
