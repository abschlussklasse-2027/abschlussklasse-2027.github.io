import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../src/index.js";
import { mailSammelmeldung, gesendet } from "../src/mail.js";
import { r2Sicherung } from "../src/sicherung.js";
import FRAGEN from "../src/fragen.json";

const ORIGIN = "https://abschlussklasse-2027.github.io";
const A = { Authorization: "Bearer test-token" };
const stimmeBody = (extra = {}) => ({ A: [FRAGEN[0].optionen[0]], D: [FRAGEN.find((f) => f.id === "D").optionen[0], "Etwas anderes"], D_anderes: "Fotobox", ...extra });
const post = (body, headers = {}, ip = "1.1.1.1") => SELF.fetch("https://x/api/stimmen", {
  method: "POST", headers: { "cf-connecting-ip": ip, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const get = (pfad, h = A) => SELF.fetch("https://x" + pfad, { headers: h });
const postAdmin = (pfad, b) => SELF.fetch("https://x" + pfad, { method: "POST", headers: A, body: JSON.stringify(b) });
let n = 0;
const frischeIp = () => "10.0.0." + ++n;

describe("Stimmen", () => {
  it("speichert eine gueltige Stimme mit Hash, ohne IP", async () => {
    const r = await post(stimmeBody(), {}, frischeIp());
    const j = await r.json();
    expect(r.status).toBe(200); expect(j.ok).toBe(true);
    const z = await env.DB.prepare("SELECT * FROM ereignisse WHERE id = ?").bind(j.id).first();
    expect(z.typ).toBe("stimme"); expect(z.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(z)).not.toContain("10.0.0.");
  });
  it("lehnt Ungueltiges ab", async () => {
    for (const b of [{ A: ["erfunden"] }, { Z: ["x"] }, { A: [] }, {}, { D_anderes: "x" }, stimmeBody({ D_anderes: "x".repeat(101) }),
      { A: [FRAGEN[0].optionen[0], FRAGEN[0].optionen[1]] }, "kein json", []]) {
      const r = await post(b, {}, frischeIp()); expect(r.status).toBe(400);
    }
  });
  it("lehnt zu grosse Bodies ab (20 KB)", async () => {
    const r = await post(JSON.stringify({ A: ["x".repeat(25000)] }), {}, frischeIp());
    expect(r.status).toBe(413);
  });
  it("Honeypot: stillschweigend verworfen, nichts gespeichert", async () => {
    const vorher = (await env.DB.prepare("SELECT COUNT(*) c FROM ereignisse").first()).c;
    const r = await post(stimmeBody({ website: "http://spam" }), {}, frischeIp());
    expect((await r.json()).ok).toBe(true);
    expect((await env.DB.prepare("SELECT COUNT(*) c FROM ereignisse").first()).c).toBe(vorher);
    const ok = await post(stimmeBody({ website: "" }), {}, frischeIp());
    expect(ok.status).toBe(200);
  });
  it("Rate Limit je Tag und IP", async () => {
    const ip = frischeIp();
    for (let i = 0; i < 3; i++) expect((await post(stimmeBody(), {}, ip)).status).toBe(200);
    expect((await post(stimmeBody(), {}, ip)).status).toBe(429);
    expect((await post(stimmeBody(), {}, frischeIp())).status).toBe(200);
    const z = await env.DB.prepare("SELECT ip_hash FROM ratenzaehler").all();
    expect(z.results.every((r) => !r.ip_hash.includes("10.0.0."))).toBe(true);
  });
  it("CORS nur fuer die Klassenseite", async () => {
    const ok = await post(stimmeBody(), { origin: ORIGIN }, frischeIp());
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const fremd = await post(stimmeBody(), { origin: "https://boese.example" }, frischeIp());
    expect(fremd.status).toBe(403); expect(fremd.headers.get("access-control-allow-origin")).toBeNull();
    const pre = await SELF.fetch("https://x/api/stimmen", { method: "OPTIONS", headers: { origin: ORIGIN } });
    expect(pre.status).toBe(204); expect(pre.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const preFremd = await SELF.fetch("https://x/api/stimmen", { method: "OPTIONS", headers: { origin: "https://boese.example" } });
    expect(preFremd.status).toBe(403);
  });
  it("Ereignisse sind nur anhaengbar (Trigger)", async () => {
    const id = (await (await post(stimmeBody(), {}, frischeIp())).json()).id;
    await expect(env.DB.prepare("UPDATE ereignisse SET klasse='x' WHERE id=?").bind(id).run()).rejects.toThrow();
    await expect(env.DB.prepare("DELETE FROM ereignisse WHERE id=?").bind(id).run()).rejects.toThrow();
  });
});

describe("Admin", () => {
  it("Export, Auswertung, Entscheidungen nur mit Token", async () => {
    for (const p of ["/api/export", "/api/auswertung", "/api/entscheidungen"]) {
      expect((await get(p, {})).status).toBe(401);
      expect((await get(p, { Authorization: "Bearer falsch" })).status).toBe(401);
      expect((await get(p)).status).toBe(200);
    }
    expect((await SELF.fetch("https://x/api/entscheidungen", { method: "POST", body: "{}" })).status).toBe(401);
  });
  it("Export liefert NDJSON mit Freitext, Auswertung ohne Rohtexte und mit richtigen Zahlen", async () => {
    const a0 = FRAGEN[0].optionen[0], a1 = FRAGEN[0].optionen[1];
    await post({ A: [a0], D_anderes: undefined }, {}, frischeIp());
    await post({ A: [a0] }, {}, frischeIp());
    await post({ A: [a1], D: ["Etwas anderes"], D_anderes: "Geheimtext-Fotobox" }, {}, frischeIp());
    const ex = await (await get("/api/export")).text();
    const zeilen = ex.trim().split("\n").map((z) => JSON.parse(z));
    expect(zeilen).toHaveLength(3); expect(ex).toContain("Geheimtext-Fotobox");
    const raw = await (await get("/api/auswertung")).text();
    expect(raw).not.toContain("Geheimtext-Fotobox");
    const au = JSON.parse(raw);
    expect(au.n).toBe(3); expect(au.fragen.A[a0]).toBe(2); expect(au.fragen.A[a1]).toBe(1);
    expect(au.fragen.D["Etwas anderes"]).toBe(1); expect(au.freitexte_anzahl.D_anderes).toBe(1);
    const nach = await (await get("/api/export?nach=" + zeilen[1].id)).text();
    expect(nach.trim().split("\n")).toHaveLength(1);
  });
});

describe("Entscheidungen und Verarbeitung", () => {
  it("anlegen, Status als neue Zeile, Verlauf bleibt", async () => {
    const r1 = await postAdmin("/api/entscheidungen", { thema: "Fotos", frage: "Wer prueft?", entscheidung: "Team aus drei", begruendung: "Mehrheit", von: "Louisa" });
    expect(r1.status).toBe(201);
    const id1 = (await r1.json()).id;
    const r2 = await postAdmin("/api/entscheidungen", { folgt_auf: id1, status: "beschlossen", von: "Gremium" });
    const id2 = (await r2.json()).id;
    const r3 = await postAdmin("/api/entscheidungen", { folgt_auf: id2, status: "umgesetzt", von: "Andreas" });
    expect(r3.status).toBe(201);
    expect((await postAdmin("/api/entscheidungen", { folgt_auf: id1, status: "verworfen", von: "x" })).status).toBe(409);
    expect((await postAdmin("/api/entscheidungen", { thema: "t", frage: "f", entscheidung: "e", von: "v", status: "kaputt" })).status).toBe(400);
    const l = (await (await get("/api/entscheidungen?thema=Fotos")).json());
    expect(l.map((x) => x.status)).toEqual(["offen", "beschlossen", "umgesetzt"]);
    expect(l.map((x) => x.aktuell)).toEqual([false, false, true]);
    expect(l[2].frage).toBe("Wer prueft?"); expect(l[2].folgt_auf).toBe(id2);
    await expect(env.DB.prepare("UPDATE entscheidungen SET status='offen' WHERE id=?").bind(id1).run()).rejects.toThrow();
  });
  it("Verarbeitung ist idempotent und steuert den inkrementellen Export", async () => {
    const id = (await (await post(stimmeBody(), {}, frischeIp())).json()).id;
    const offen = async () => (await (await get("/api/export?offen_fuer=auswertung_1")).text()).trim().split("\n").filter(Boolean).map((z) => JSON.parse(z).id);
    expect(await offen()).toContain(id);
    const d = (await (await postAdmin("/api/entscheidungen", { thema: "Auswertung", frage: "f", entscheidung: "e", von: "v" })).json()).id;
    const m1 = await (await postAdmin("/api/verarbeitung", { ereignis_ids: [id], schritt: "auswertung_1", ergebnis: "ok", entscheidung_id: d })).json();
    const m2 = await (await postAdmin("/api/verarbeitung", { ereignis_ids: [id, "e_gibtesnicht"], schritt: "auswertung_1" })).json();
    expect(m1.neu).toBe(1); expect(m2.neu).toBe(0);
    expect(await offen()).not.toContain(id);
    const c = await env.DB.prepare("SELECT COUNT(*) c FROM verarbeitung WHERE ereignis_id=? AND schritt='auswertung_1'").bind(id).first();
    expect(c.c).toBe(1);
  });
});

describe("Mail und R2", () => {
  beforeEach(() => { gesendet.length = 0; });
  it("Sammelmeldung nur mit neuen Ereignissen, nicht doppelt", async () => {
    const e = { ...env, MAIL_AN: "test@example.invalid", MAIL_ADAPTER: "konsole" };
    await mailSammelmeldung(e); // alles Bisherige wegsenden
    gesendet.length = 0;
    expect((await mailSammelmeldung(e)).gesendet).toBe(false);
    expect(gesendet).toHaveLength(0);
    const i1 = (await (await post(stimmeBody({ D_anderes: "NeuText1" }), {}, frischeIp())).json()).id;
    const i2 = (await (await post(stimmeBody(), {}, frischeIp())).json()).id;
    const r = await mailSammelmeldung(e);
    expect(r).toEqual({ gesendet: true, anzahl: 2 });
    expect(gesendet).toHaveLength(1);
    const m = gesendet[0];
    const ids = m.anhang.inhalt.trim().split("\n").map((z) => JSON.parse(z).id);
    expect(ids).toEqual([i1, i2]);
    expect(m.text).not.toContain("NeuText1"); expect(m.anhang.inhalt).toContain("NeuText1");
    expect((await mailSammelmeldung(e)).gesendet).toBe(false);
    expect(gesendet).toHaveLength(1);
    const i3 = (await (await post(stimmeBody(), {}, frischeIp())).json()).id;
    await mailSammelmeldung(e);
    expect(gesendet).toHaveLength(2);
    expect(gesendet[1].anhang.inhalt.trim().split("\n").map((z) => JSON.parse(z).id)).toEqual([i3]);
  });
  it("Senden schlaegt fehl: nichts markiert, naechster Lauf sendet", async () => {
    const e = { ...env, MAIL_AN: "test@example.invalid", MAIL_ADAPTER: "resend", MAIL_KEY: "x" };
    await post(stimmeBody(), {}, frischeIp());
    const orig = globalThis.fetch; globalThis.fetch = async () => new Response("no", { status: 500 });
    try { await expect(mailSammelmeldung(e)).rejects.toThrow(); } finally { globalThis.fetch = orig; }
    const ok = await mailSammelmeldung({ ...e, MAIL_ADAPTER: "konsole" });
    expect(ok.gesendet).toBe(true);
  });
  it("R2-Sicherung schreibt NDJSON aller Ereignisse", async () => {
    await post(stimmeBody(), {}, frischeIp());
    const r = await r2Sicherung(env);
    const o = await env.SICHERUNG.get(r.key);
    const text = await o.text();
    expect(text.trim().split("\n")).toHaveLength(r.anzahl);
    expect(r.anzahl).toBeGreaterThan(0);
    await r2Sicherung(env); // wiederholbar
  });
  it("scheduled-Handler laeuft", async () => {
    await worker.scheduled({ cron: "30 2 * * *" }, env);
    await worker.scheduled({ cron: "0 5 * * *" }, { ...env, MAIL_AN: "" });
  });
});
