// Mail-Adapter. Phase A: nur Konsolenausgabe + Postausgang im Speicher (Tests). Echter Absender in Phase B.
// Die Adresse wird nie vollstaendig geloggt.
export const postausgang = [];

const maske = (a) => String(a).replace(/^(.).*(@.*)$/, "$1***$2");

export async function mailSenden(env, { an, betreff, text }) {
  const art = env.MAIL_ADAPTER || "konsole";
  if (art === "konsole") {
    postausgang.push({ an, betreff, text });
    if (postausgang.length > 50) postausgang.shift();
    console.log(`[mail:konsole] an ${maske(an)} | ${betreff}`);
    return true;
  }
  // Phase B: hier z. B. Resend/Mailchannels anbinden (Schluessel nur als Worker-Secret).
  throw new Error("Mail-Adapter nicht eingerichtet: " + art);
}
