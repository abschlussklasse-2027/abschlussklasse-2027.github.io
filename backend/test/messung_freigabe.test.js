import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";

const ORIGIN = "https://abschlussklasse-2027.github.io";
const A = { Authorization: "Bearer test-token" };
let n = 0;
const frischeIp = () => "10.1.0." + ++n;
const m = (ereignisse, ip = frischeIp(), headers = {}) => SELF.fetch("https://x/m", {
  method: "POST", headers: { "cf-connecting-ip": ip, ...headers }, body: JSON.stringify({ e: ereignisse }) });
const get = (p, h = A) => SELF.fetch("https://x" + p, { headers: h });
const tabelle = async () => (await env.DB.prepare("SELECT ereignis, merkmal, n FROM messung ORDER BY ereignis, merkmal").all()).results;

describe("Messung /m", () => {
  it("zaehlt nur auf, Upsert ueber mehrere Anfragen, keine Besucherzeilen", async () => {
    const vorher = (await env.DB.prepare("SELECT COUNT(*) c FROM messung").first()).c;
    expect((await m([["seite", "de|mobil"], ["dauer", "5-15s"]])).status).toBe(200);
    expect((await m([["seite", "de|mobil"]])).status).toBe(200);
    expect((await m([["seite", "de|mobil"], ["seite", "de|mobil"]])).status).toBe(200);
    const z = (await tabelle()).find((r) => r.ereignis === "seite" && r.merkmal === "de|mobil");
    expect(z.n).toBe(4);
    expect((await env.DB.prepare("SELECT COUNT(*) c FROM messung").first()).c).toBe(vorher + 2);
    const sp = await env.DB.prepare("SELECT name FROM pragma_table_info('messung')").all();
    expect(sp.results.map((r) => r.name)).toEqual(["tag", "ereignis", "merkmal", "n"]);
    const rz = await env.DB.prepare("SELECT tag FROM messung LIMIT 1").first();
    expect(rz.tag).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("speichert keine IP (weder in messung noch im Zaehler im Klartext)", async () => {
    const ip = "203.0.113.77";
    await m([["vorlesen", "en"]], ip);
    expect(JSON.stringify(await tabelle())).not.toContain("203.0.113");
    const rz = await env.DB.prepare("SELECT ip_hash FROM ratenzaehler").all();
    expect(JSON.stringify(rz.results)).not.toContain("203.0.113");
  });
  it("lehnt Unbekanntes und Ungueltiges ab", async () => {
    for (const e of [[["unbekannt", "x"]], [["seite", "xx|mobil"]], [["seite", "de|tablet"]], [["dauer", "7s"]], [["scroll", "10"]],
      [["video_abbruch", "haupt|de|t31"]], [["video_kapitel", "haupt|de|k16"]], [["__proto__", "x"]], [["constructor", "x"]], [["seite"]], [], "x",
      [["seite", "de|mobil", "extra"]], [["seite", "de|mobil\nDROP"]], [["seite", "x".repeat(500)]]]) {
      expect((await m(e)).status).toBe(400);
    }
    expect((await SELF.fetch("https://x/m", { method: "POST", headers: { "cf-connecting-ip": frischeIp() }, body: "kein json" })).status).toBe(400);
    const viele = Array.from({ length: 31 }, () => ["seite", "de|mobil"]);
    expect((await m(viele)).status).toBe(400);
  });
  it("lehnt zu grosse Bodies ab (2 KB)", async () => {
    const r = await SELF.fetch("https://x/m", { method: "POST", headers: { "cf-connecting-ip": frischeIp() }, body: JSON.stringify({ e: [["seite", "x".repeat(3000)]] }) });
    expect(r.status).toBe(413);
  });
  it("alle Ereignisarten der Seite werden akzeptiert", async () => {
    const ok = [["seite", "uk|desktop"], ["dauer", ">3min"], ["scroll", "100"], ["video_start", "lehrer|fr"], ["video_zeit", "haupt|de|60-120s"],
      ["video_meilenstein", "haupt|en|75"], ["video_abbruch", "haupt|de|t12"], ["video_kapitel", "lehrer|de|k7"], ["kapitelklick", "haupt|k10"],
      ["sprachschalter", "de>en"], ["vorlesen", "de"], ["lehrer", "sichtbar|de"], ["lehrer", "geoeffnet|tr"], ["fragen_abgesendet", "pl"], ["freigabe_abgesendet", "es"]];
    expect((await m(ok)).status).toBe(200);
  });
  it("CORS nur fuer die Klassenseite, OPTIONS und Methode", async () => {
    const ok = await m([["seite", "de|mobil"]], frischeIp(), { origin: ORIGIN });
    expect(ok.status).toBe(200); expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect((await m([["seite", "de|mobil"]], frischeIp(), { origin: "https://boese.example" })).status).toBe(403);
    expect((await SELF.fetch("https://x/m", { method: "OPTIONS", headers: { origin: ORIGIN } })).status).toBe(204);
    expect((await SELF.fetch("https://x/m")).status).toBe(405);
  });
  it("setzt keine Cookies", async () => {
    const r = await m([["seite", "de|mobil"]]);
    expect(r.headers.get("set-cookie")).toBeNull();
  });
  it("Absender-Grenze zaehlt Ereignisse und schreibt ueber dem Limit nicht weiter", async () => {
    const ip = frischeIp();
    const e = { ...env, MESSUNG_IP_MAX: "3" };
    const send = (n_) => worker.fetch(new Request("https://x/m", { method: "POST", headers: { "cf-connecting-ip": ip }, body: JSON.stringify({ e: Array.from({ length: n_ }, () => ["scroll", "25"]) }) }), e);
    const vorher = (await tabelle()).find((r) => r.ereignis === "scroll" && r.merkmal === "25")?.n ?? 0;
    expect((await send(2)).status).toBe(200);
    expect((await send(2)).status).toBe(429);
    expect((await send(1)).status).toBe(200);
    expect((await send(1)).status).toBe(429);
    expect((await tabelle()).find((r) => r.ereignis === "scroll" && r.merkmal === "25").n).toBe(vorher + 3);
  });
  it("Tagesgrenze insgesamt: danach 429, nichts mehr gezaehlt", async () => {
    const t = new Date().toISOString().slice(0, 10);
    const stand = async () => (await env.DB.prepare("SELECT n FROM ratenzaehler WHERE tag = ? AND ip_hash = '*messung*'").bind(t).first())?.n ?? 0;
    const grenze = (await stand()) + 2;
    const e = { ...env, MESSUNG_TAGESMAX: String(grenze) };
    const send = () => worker.fetch(new Request("https://x/m", { method: "POST", headers: { "cf-connecting-ip": frischeIp() }, body: JSON.stringify({ e: [["scroll", "50"]] }) }), e);
    const v = (await tabelle()).find((r) => r.ereignis === "scroll" && r.merkmal === "50")?.n ?? 0;
    expect((await send()).status).toBe(200); expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
    expect((await tabelle()).find((r) => r.ereignis === "scroll" && r.merkmal === "50").n).toBe(v + 2);
    expect(await stand()).toBe(grenze);
  });
  it("ungueltige Anfragen verbrauchen keine Grenze", async () => {
    const t = new Date().toISOString().slice(0, 10);
    const stand = async () => (await env.DB.prepare("SELECT n FROM ratenzaehler WHERE tag = ? AND ip_hash = '*messung*'").bind(t).first())?.n ?? 0;
    const v = await stand();
    for (let i = 0; i < 3; i++) await m([["unbekannt", "x"]]);
    expect(await stand()).toBe(v);
  });
  it("/admin/messung nur mit Token, liefert Zaehler je Tag und Summen, Zeitraum filterbar", async () => {
    await m([["seite", "fr|desktop"]]);
    expect((await get("/admin/messung", {})).status).toBe(401);
    expect((await get("/admin/messung", { Authorization: "Bearer falsch" })).status).toBe(401);
    const j = await (await get("/admin/messung")).json();
    const t = new Date().toISOString().slice(0, 10);
    expect(j.tage[t].seite["fr|desktop"]).toBeGreaterThan(0);
    expect(j.summen.seite["fr|desktop"]).toBeGreaterThan(0);
    const leer = await (await get("/admin/messung?von=2000-01-01&bis=2000-01-02")).json();
    expect(leer.tage).toEqual({});
  });
  it("Export enthaelt die Messung, scheduled raeumt sie nicht weg", async () => {
    await m([["seite", "it|mobil"]]);
    const x = await (await get("/admin/export")).json();
    expect(Object.keys(x.messung).length).toBeGreaterThan(0);
    await worker.scheduled({ cron: "0 5 * * *" }, env);
    expect((await env.DB.prepare("SELECT COUNT(*) c FROM messung").first()).c).toBeGreaterThan(0);
  });
});

const gueltig = (extra = {}) => ({ funktion: "schulleitung", name: "Erika Muster", stelle: "Grundschule Beispiel", antwort: "ja", text: "", kontakt: "", befugt: true, sprache: "de", ...extra });
const f = (body, ip = frischeIp(), headers = {}) => SELF.fetch("https://x/api/freigabe", {
  method: "POST", headers: { "cf-connecting-ip": ip, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("Rueckmeldung der Schule /api/freigabe", () => {
  it("speichert als Ereignis schulfreigabe mit Zeitstempel und Hash, ohne IP", async () => {
    const r = await f(gueltig({ antwort: "ja_bedingt", text: "Nur ohne Fotos.", kontakt: "it@schule.example" }), "198.51.100.9");
    const j = await r.json(); expect(r.status).toBe(200); expect(j.ok).toBe(true);
    const z = await env.DB.prepare("SELECT * FROM ereignisse WHERE id = ?").bind(j.id).first();
    expect(z.typ).toBe("schulfreigabe"); expect(z.hash).toMatch(/^[0-9a-f]{64}$/); expect(z.zeit).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const np = JSON.parse(z.nutzlast);
    expect(np).toMatchObject({ funktion: "schulleitung", antwort: "ja_bedingt", text: "Nur ohne Fotos.", befugt: true });
    expect(JSON.stringify(z)).not.toContain("198.51.100");
    await expect(env.DB.prepare("DELETE FROM ereignisse WHERE id=?").bind(j.id).run()).rejects.toThrow();
  });
  it("lehnt Ungueltiges ab", async () => {
    for (const b of [gueltig({ funktion: "kind" }), gueltig({ antwort: "vielleicht" }), gueltig({ befugt: false }), gueltig({ befugt: "true" }), gueltig({ name: "" }),
      gueltig({ name: "x".repeat(101) }), gueltig({ stelle: "  " }), gueltig({ stelle: "x".repeat(151) }), gueltig({ text: "x".repeat(1001) }), gueltig({ kontakt: "x".repeat(151) }),
      gueltig({ antwort: "ja_bedingt", text: "" }), gueltig({ antwort: "rueckfragen", text: "   " }), gueltig({ extra: 1 }), gueltig({ name: 5 }), [], "kein json"]) {
      expect((await f(b)).status).toBe(400);
    }
    const r = await f(gueltig({ befugt: undefined })); expect(r.status).toBe(400);
  });
  it("reinigt Steuerzeichen, Sprache faellt auf de zurueck", async () => {
    const j = await (await f(gueltig({ name: "Erika\u0000\nMuster", sprache: "xx" }))).json();
    const z = JSON.parse((await env.DB.prepare("SELECT nutzlast FROM ereignisse WHERE id = ?").bind(j.id).first()).nutzlast);
    expect(z.name).toBe("Erika Muster"); expect(z.sprache).toBe("de");
  });
  it("Honeypot: stillschweigend verworfen, nichts gespeichert", async () => {
    const vorher = (await env.DB.prepare("SELECT COUNT(*) c FROM ereignisse").first()).c;
    const r = await f({ ...gueltig(), website: "http://spam" });
    expect((await r.json()).ok).toBe(true);
    expect((await env.DB.prepare("SELECT COUNT(*) c FROM ereignisse").first()).c).toBe(vorher);
    expect((await f({ ...gueltig(), website: "" })).status).toBe(200);
  });
  it("lehnt zu grosse Bodies ab (8 KB)", async () => {
    expect((await f(JSON.stringify({ ...gueltig(), text: "x".repeat(9000) }))).status).toBe(413);
  });
  it("Rate Limit je Tag und Absender (5), danach 429 ohne Speicherung", async () => {
    const ip = frischeIp();
    for (let i = 0; i < 5; i++) expect((await f(gueltig(), ip)).status).toBe(200);
    const vorher = (await env.DB.prepare("SELECT COUNT(*) c FROM ereignisse").first()).c;
    expect((await f(gueltig(), ip)).status).toBe(429);
    expect((await env.DB.prepare("SELECT COUNT(*) c FROM ereignisse").first()).c).toBe(vorher);
    expect((await f(gueltig(), frischeIp())).status).toBe(200);
  });
  it("Tagesgrenze insgesamt", async () => {
    const t = new Date().toISOString().slice(0, 10);
    const stand = async () => (await env.DB.prepare("SELECT n FROM ratenzaehler WHERE tag = ? AND ip_hash = '*freigabe*'").bind(t).first())?.n ?? 0;
    const grenze = (await stand()) + 1;
    const e = { ...env, FREIGABE_TAGESMAX: String(grenze) };
    const send = () => worker.fetch(new Request("https://x/api/freigabe", { method: "POST", headers: { "cf-connecting-ip": frischeIp() }, body: JSON.stringify(gueltig()) }), e);
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
  });
  it("CORS nur fuer die Klassenseite", async () => {
    const ok = await f(gueltig(), frischeIp(), { origin: ORIGIN });
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect((await f(gueltig(), frischeIp(), { origin: "https://boese.example" })).status).toBe(403);
    expect((await SELF.fetch("https://x/api/freigabe", { method: "OPTIONS", headers: { origin: ORIGIN } })).status).toBe(204);
    expect((await SELF.fetch("https://x/api/freigabe")).status).toBe(405);
  });
  it("/admin/freigaben nur mit Token, nur Typ schulfreigabe; Stimmen und Auswertung bleiben unberuehrt", async () => {
    await f(gueltig({ funktion: "it", antwort: "nein" }));
    expect((await get("/admin/freigaben", {})).status).toBe(401);
    const j = await (await get("/admin/freigaben")).json();
    expect(j.freigaben.length).toBeGreaterThan(0);
    expect(j.freigaben.every((x) => x.typ === "schulfreigabe")).toBe(true);
    const au = await (await get("/api/auswertung")).json();
    expect(au.n).toBe(0);
  });
  it("oeffentlich ist nichts lesbar: /api/export und /admin/freigaben ohne Token 401", async () => {
    expect((await get("/api/export?typ=schulfreigabe", {})).status).toBe(401);
    expect((await get("/admin/export", {})).status).toBe(401);
  });
});
