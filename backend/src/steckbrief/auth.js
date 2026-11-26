// Magic-Link-Anmeldung: HMAC-signierte, kurzlebige Einmal-Tokens. Sitzungstoken: HMAC, 2 Stunden, zustandslos.
import { enc, sha256Hex } from "../util.js";

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export const LOGIN_MIN = 15;
export const SITZUNG_MIN = 120;
export const ELTERN_TAGE = 7;

export const zufallsId = (prefix) => prefix + [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");

function geheimnis(env) {
  const s = env.STECKBRIEF_SECRET;
  if (!s || s.length < 16) throw new Error("STECKBRIEF_SECRET fehlt");
  return s;
}

async function hmac(env, daten) {
  const k = await crypto.subtle.importKey("raw", enc.encode(geheimnis(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return { k, sign: (d) => crypto.subtle.sign("HMAC", k, enc.encode(d)) };
}

export async function emailHash(env, email) {
  const h = await hmac(env, "");
  return [...new Uint8Array(await h.sign("email|" + String(email).trim().toLowerCase()))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function tokenErzeugen(env, nutzlast, minuten) {
  const p = { ...nutzlast, exp: Date.now() + minuten * 60000 };
  const teil = b64(enc.encode(JSON.stringify(p)));
  const h = await hmac(env, "");
  return teil + "." + b64(await h.sign(teil));
}

/** Pruefen: Signatur (zeitkonstant ueber verify), Ablauf, Typ. Gibt Nutzlast oder null. */
export async function tokenPruefen(env, token, typ) {
  if (typeof token !== "string" || token.length > 800) return null;
  const [teil, sig] = token.split(".");
  if (!teil || !sig) return null;
  let ok = false;
  try { const h = await hmac(env, ""); ok = await crypto.subtle.verify("HMAC", h.k, unb64(sig), enc.encode(teil)); } catch { return null; }
  if (!ok) return null;
  let p;
  try { p = JSON.parse(new TextDecoder().decode(unb64(teil))); } catch { return null; }
  if (!p || p.typ !== typ || !(p.exp > Date.now())) return null;
  return p;
}

/** Einmal-Token anlegen: Kennung (jti) in D1, Token selbst nie. */
export async function einmalTokenAusstellen(env, { typ, personId, beschreibungId, minuten }) {
  const jti = zufallsId("j_");
  const ablauf = new Date(Date.now() + minuten * 60000).toISOString();
  await env.DB.prepare("INSERT INTO sb_tokens (jti, typ, person_id, beschreibung_id, ablauf) VALUES (?,?,?,?,?)").bind(jti, typ, personId ?? null, beschreibungId ?? null, ablauf).run();
  return tokenErzeugen(env, { typ, jti, pid: personId ?? null, bid: beschreibungId ?? null }, minuten);
}

/** Verbraucht den Token genau einmal (atomar). Gibt Nutzlast oder null. */
export async function einmalTokenEinloesen(env, token, typ) {
  const p = await tokenPruefen(env, token, typ);
  if (!p) return null;
  const z = await env.DB.prepare("UPDATE sb_tokens SET benutzt = 1 WHERE jti = ? AND typ = ? AND benutzt = 0 AND ablauf > ? RETURNING jti")
    .bind(p.jti, typ, new Date().toISOString()).first();
  return z ? p : null;
}

/** Nur pruefen, ob der Token noch gilt (Eltern-Ansicht), ohne zu verbrauchen. */
export async function einmalTokenGueltig(env, token, typ) {
  const p = await tokenPruefen(env, token, typ);
  if (!p) return null;
  const z = await env.DB.prepare("SELECT jti FROM sb_tokens WHERE jti = ? AND typ = ? AND benutzt = 0 AND ablauf > ?").bind(p.jti, typ, new Date().toISOString()).first();
  return z ? p : null;
}

export const sitzungAusstellen = (env, person) => tokenErzeugen(env, { typ: "sitzung", pid: person.id, kid: person.klasse_id }, SITZUNG_MIN);

/** Sitzung aus dem Authorization-Header; Person frisch aus D1 (Sperre, Rolle, Klasse gelten sofort). */
export async function sitzungLesen(env, req) {
  const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") || "");
  if (!m) return null;
  const p = await tokenPruefen(env, m[1], "sitzung");
  if (!p) return null;
  const person = await env.DB.prepare("SELECT id, klasse_id, kuerzel, rolle, unter16, gesperrt FROM sb_personen WHERE id = ? AND klasse_id = ?").bind(p.pid, p.kid).first();
  return person && !person.gesperrt ? person : null;
}

export const kurzHash = async (text) => (await sha256Hex(text)).slice(0, 32);
