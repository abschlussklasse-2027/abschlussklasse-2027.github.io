import { offenFuerSchritt, verarbeitungMarkieren } from "./ereignisse.js";
import { zaehle } from "./auswertung.js";
import { ndjson, tag } from "./util.js";

export const SCHRITT_MAIL = "mail_sammelmeldung";

/* Adapter-Vertrag: async senden({ an, von, betreff, text, anhang: { name, inhalt } }) und wirft bei Fehler.
   Neuer Anbieter = neue Funktion in ADAPTER, MAIL_ADAPTER umstellen. */
export const gesendet = []; // nur fuer Tests: Ausgabe der Konsolenadapters

const ADAPTER = {
  async konsole(m) {
    gesendet.push(m);
    console.log(`[mail:konsole] an=${m.an} betreff=${m.betreff}\n${m.text}\n--- anhang ${m.anhang.name} (${m.anhang.inhalt.length} Zeichen)`);
  },
  // Resend (Phase B, ungetestet gegen die echte API): MAIL_KEY als Secret, MAIL_VON beim Anbieter verifiziert.
  async resend(m, env) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: "Bearer " + env.MAIL_KEY, "content-type": "application/json" },
      body: JSON.stringify({ from: m.von, to: [m.an], subject: m.betreff, text: m.text,
        attachments: [{ filename: m.anhang.name, content: btoa(unescape(encodeURIComponent(m.anhang.inhalt))) }] }),
    });
    if (!r.ok) throw new Error("resend " + r.status);
  },
};

/** Taeglich: eine Sammelmeldung ueber alle noch nicht gemeldeten Stimmen, JSON-Sicherung angehaengt. */
export async function mailSammelmeldung(env) {
  const neue = await offenFuerSchritt(env, SCHRITT_MAIL);
  if (neue.length === 0) return { gesendet: false, anzahl: 0 };
  if (!env.MAIL_AN) return { gesendet: false, anzahl: neue.length, grund: "MAIL_AN fehlt" };
  const adapter = ADAPTER[env.MAIL_ADAPTER || "konsole"];
  if (!adapter) throw new Error("unbekannter MAIL_ADAPTER");
  const z = zaehle(neue.filter((e) => e.typ === "stimme").map((e) => e.nutzlast));
  const zeilen = Object.entries(z.fragen).map(([f, o]) => `${f}: ` + Object.entries(o).filter(([, n]) => n).map(([t, n]) => `${n}x ${t.slice(0, 40)}`).join("; ")).filter((l) => !l.endsWith(": "));
  const text = `${neue.length} neue Ereignisse (${z.n} Stimmen) seit der letzten Meldung.\n\n${zeilen.join("\n")}\n\nFreitexte stehen nur in der angehaengten Sicherung (NDJSON).`;
  await adapter({ an: env.MAIL_AN, von: env.MAIL_VON || "", betreff: `Klassen-Umfrage: ${z.n} neue Stimmen`, text,
    anhang: { name: `neue-ereignisse-${tag()}.ndjson`, inhalt: ndjson(neue) } }, env);
  // Erst nach erfolgreichem Senden markieren: bei Fehler wird morgen erneut gesendet, nie doppelt nach Erfolg.
  await verarbeitungMarkieren(env, { ereignis_ids: neue.map((e) => e.id), schritt: SCHRITT_MAIL, ergebnis: "gesendet" });
  return { gesendet: true, anzahl: neue.length };
}
