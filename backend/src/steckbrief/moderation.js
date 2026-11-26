// Stufe 1: Wortlisten und Muster. Faengt Schreibvarianten (Leetspeak, Leerzeichen/Trennzeichen, Wiederholungen,
// Homoglyphen, unsichtbare Zeichen) und Angriffe ohne Schimpfwort. Gibt nie den Treffer oder den Text zurueck, nur Codes.

const kollabiere = (s) => s.replace(/(.)\1+/gu, "$1");

const HOMOGLYPHEN = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "і": "i", "ѕ": "s", "ј": "j", "ɡ": "g" };

/** Grundform: klein, ohne Akzente/Umlaut-Punkte (ä->a), ß->ss, ohne unsichtbare Zeichen, Homoglyphen ersetzt. */
export function falte(text) {
  let s = String(text).normalize("NFKD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/[­​-‏⁠﻿‪-‮]/g, "");
  s = s.toLowerCase().replace(/ß/g, "ss").replace(/[а-яіѕјɡ]/g, (c) => HOMOGLYPHEN[c] || c);
  return s;
}

function leet(s, eins) {
  const m = { "0": "o", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i", "|": "i", "€": "e", "1": eins };
  return s.replace(/[034577@$!|€1]/g, (c) => m[c] ?? c);
}

/** Einzelbuchstaben-Folgen ("w i c h s e r", "d.u.m.m") zu einem Wort zusammenziehen; Trennzeichen mitten im Wort entfernen. */
function ziehe(s) {
  s = s.replace(/(?<=\p{L})[.\-_*+~'`|·,:;/\\](?=\p{L})/gu, "");
  const t = s.split(/\s+/);
  const out = [];
  let lauf = "";
  for (const w of t) {
    if (/^\p{L}$/u.test(w)) { lauf += w; continue; }
    if (lauf) { out.push(lauf); lauf = ""; }
    out.push(w);
  }
  if (lauf) out.push(lauf);
  return out.join(" ");
}

// Wortlisten (gefaltete Form, ohne Umlaute). Ende "*" = Wortanfang (Praefix), sonst ganzes Wort.
const L = {
  beleidigung: ["scheis*", "arsch*", "wichs*", "wixx*", "wix*", "hurens*", "hure", "huren", "fotz*", "schlamp*", "nutte*", "idiot*", "depp*", "dep", "trottel*", "volltrottel*",
    "spast*", "mongo*", "opfer", "missgeburt*", "penner*", "bastard*", "dummkopf*", "dumm*", "doof*", "blod*", "bescheuert*", "behindert*", "krueppel*", "kruppel*", "loser*", "versager*",
    "schwuchtel*", "tunte*", "fick*", "verpiss*", "kacke*", "kack*", "pisser*", "lappen", "noob*", "vollpfosten*", "pfosten", "hohlkopf*", "schwachkopf*", "dreckig*", "ekel*", "eklig*", "bloedmann", "bldmann",
    "zecke*", "assi", "assis", "hasslich*", "hasl*", "fettsack*", "fett", "fette", "fetter", "fettes", "dick", "dicke", "dicker", "dickes", "stinkt", "stinkig*", "stinker*", "streber*", "petze*", "heuchler*", "luegner*", "lugner*", "angeber*", "dummerchen",
    "neger*", "nazi*", "hitler*", "scheiss", "kotz*", "ekelhaft*", "schleimer*", "arrogant*", "psycho*", "verrueckt*", "verruckt*", "freak*", "weirdo*", "cringe*", "peinlich*", "laecherlich*", "lacherlich*", "nervig*", "nervt", "nerven",
    "langweilig*", "uncool*", "unbeliebt*", "einsam*", "ungepflegt*", "faulpelz*", "versagt*", "schwach*"],
  mundart: ["tubel*", "tubeli*", "loli*", "lolli*", "souhund*", "souch*", "sauhund*", "saucheib*", "cheib*", "gopf*", "gopferdamm*", "schiis*", "schiiss*", "huere*", "huerä*", "hueresohn*", "glunggi*", "glungg*", "dubel*", "totsch*", "totschi*", "gruusig*", "grusig*", "schnurri*", "gstort*", "gschtort*", "gschtoert*", "pfupf*", "lappi*", "hornochs*", "tschugger", "stinkt*", "chuchi", "suuf*", "suff*", "saufe*", "chaibe*"],
  jugend: ["hs", "hdgdl", "ehrenlos*", "wallah*", "lappen", "bratan*", "hurensohn*", "yarak*", "kek*", "bastard*", "sus", "simp", "simps", "cuck*", "incel*", "noob*", "bot", "npc", "toxic*", "cringe*", "fail", "epic fail", "kuh", "kuhh", "bitch*", "biatch*", "slut*", "whore*", "asshole*", "fuck*", "shit*", "dick*", "retard*", "faggot*", "nigg*", "gay"],
  sexuell: ["sex*", "porn*", "nackt*", "titt*", "busen", "penis*", "vagina*", "fotze*", "geil*", "erotik*", "kuss*", "kussen", "knutsch*", "freundin", "freund", "verliebt*", "datet", "dating", "flirt*", "bh", "hoden", "pimmel*", "schwanz*", "muschi*", "orgasmus*"],
  gewalt: ["tot*", "toten", "toeten*", "umbringen*", "erschlag*", "erschiess*", "abstech*", "mord*", "messer*", "waffe*", "pistole*", "pruegel*", "prugel*", "verpruegel*", "verprugel*", "schlaegerei*", "schlagerei*", "hauen", "haut", "kloppen", "mobb*", "mobbt", "quaelen*", "qualen*", "bedroh*", "drohen*", "droht", "erpress*", "terror*", "krieg*", "blut*", "schlagen", "schlage", "schlagst", "schlagt", "geschlagen", "schlug", "schlaegt", "treten", "trete"],
  drogen: ["drog*", "kiff*", "weed*", "gras", "joint*", "koks*", "kokain*", "heroin*", "lsd", "ecstasy", "pillen", "alkohol*", "bier*", "wein*", "wodka*", "vodka*", "whisky*", "schnaps*", "betrunken*", "besoffen*", "saufen", "sauf*", "rausch*", "zigarett*", "rauch*", "tabak*", "nikotin*", "vape*", "vapen", "shisha*", "snus", "energy drink", "kater"],
  heikel: ["krank*", "krankheit*", "depress*", "diagnose*", "therapie*", "therapeut*", "medikament*", "tablette*", "allergi*", "uebergewicht*", "ubergewicht*", "magersucht*", "essstoerung*", "adipos*", "autis*", "adhs", "legasthen*", "dyskalk*", "stotter*", "pickel*", "akne", "brille*", "glatze*", "zahnspange*", "hautfarbe*", "aussehen*", "figur", "gewicht*", "abnehm*", "zugenomm*", "abgenomm*", "zunehm*", "moppel*", "pummel*", "huebsch*", "hubsch*", "gutaussehend*", "schoenheit*", "klein", "kleiner", "kleine", "gross", "duenn*", "dunn*", "hautig*", "haare",
    "auslaend*", "auslaender*", "auslander*", "migrant*", "fluechtling*", "fluchtling*", "herkunft*", "tuerk*", "turk*", "albaner*", "serbe*", "kosovo*", "secondo*", "secondas", "balkan*", "asyl*", "papiere", "passport",
    "muslim*", "islam*", "christ*", "jude", "juden", "judisch*", "juedisch*", "kirche*", "gott", "religi*", "kopftuch*", "beten", "allah", "atheist*",
    "mutter", "vater", "mama", "papa", "mami", "papi", "eltern*", "bruder", "schwester*", "geschwister*", "scheidung*", "geschieden*", "familie*", "oma", "opa", "stiefvater", "stiefmutter", "reich*", "arm*", "armut", "geld*", "schulden*"],
};
// "gay"/"sus" etc. sind Beleidigungs-Chiffren in Jugendsprache; Praefix-Eintraege mit zu kurzer Wurzel werden unten ausgefiltert.

const PRAEFIX_MIN = 3;
const eintraege = [];
for (const [kat, liste] of Object.entries(L)) {
  for (const roh of liste) {
    const praefix = roh.endsWith("*");
    const w = kollabiere(falte(roh.replace(/\*$/, "")).replace(/ä/g, "a"));
    if (!w) continue;
    if (praefix && w.length < PRAEFIX_MIN) continue;
    eintraege.push({ kat, w, praefix });
  }
}
const woerterSet = new Map(eintraege.filter((e) => !e.praefix).map((e) => [e.w, e.kat]));
const praefixe = eintraege.filter((e) => e.praefix);
// Harte Staemme: lang genug, um auch im zusammengezogenen Text (ohne Leerzeichen) zu suchen, ohne Zufallstreffer.
const HART = ["hurenson", "arschloch", "wichser", "wixxer", "scheis", "missgeburt", "schlampe", "vollidiot", "behindert", "spast", "fotze", "kokain", "hitler", "nazi", "neger", "fickdich", "verpiss", "dummkopf", "bescheuert", "bloedmann", "schwuchtel", "tuebel"]
  .map((s) => kollabiere(falte(s))).filter((s) => s.length >= 4);
const HART_LANG = HART.filter((s) => s.length >= 6);
const HART_KURZ = HART.filter((s) => s.length < 6);

// Muster fuer Angriffe ohne Schimpfwort. Gegen den gefalteten Text (ohne Umlaute).
const MUSTER = [
  ["angriff", /\b(niemand|keiner|keine|kein mensch|alle|jeder)\s+(\w+\s+)?(mag|mogen|moechte|mochte|hasst|hassen|will|wollen|leiden|ertragt|ertragen|redet|spricht|spielt)\b/],
  ["angriff", /\b(ist|bist|sind|wirkt|wirken|war|waren|wird)\s+(\w+\s+){0,2}(immer|oft|meistens)\s+(allein|alleine|einsam|zu spat|spat|muede|mude)\b/],
  ["angriff", /\b(hat|haben)\s+(\w+\s+)?(keine|keinen|kein)\s+(freund|freunde|freundin|plan|ahnung|talent|stil|humor|niveau)/],
  ["verneint_lob", /\b(nicht|kaum|wenig|selten|nie|nie mehr|nicht mehr)\s+(so\s+|sehr\s+|besonders\s+|wirklich\s+)?(schlau|klug|gut|nett|lustig|sportlich|beliebt|schon|intelligent|freundlich|hilfsbereit|ehrlich|pünktlich|puenktlich|zuverlassig|zuverlaessig|talentiert|begabt)/],
  ["verneint_lob", /\b(kann|konnte|koennte|kannst)\s+(\w+\s+)?(gar\s+|überhaupt\s+|uberhaupt\s+|nie\s+)?(nicht|nichts|nix|kein|keine|keinen)\b/],
  ["verneint_lob", /\b(null|kein|keine|keinen)\s+(ahnung|plan|talent|stil|humor|niveau|freunde|bock|ahnung)\b/],
  ["bosheit_verpackt", /\b(schon wieder|mal wieder|wie immer|ehrlich gesagt|ehrlich gesagt|nichts gegen|nur spass|nur ein spass|nur spaas|spass beiseite|ohne spass|kein witz|sorry aber|bei aller liebe|im gegensatz zu|zum gluck nicht|wenigstens|immerhin|trotz allem|obwohl (er|sie|es)|versucht (er|sie) es|fuer (sein|ihr) alter|fur (sein|ihr) alter|eigentlich (ganz |ziemlich |eher )?(nett|lieb|okay|ok|sympathisch)|ganz nett aber|nett aber|lieb aber|gut aber|aber leider|leider)\b/],
  ["bosheit_verpackt", /\b(nett|lieb|okay|ok|sympathisch|lustig|cool)\b[^.!?]{0,40}\b(aber|jedoch|nur|allerdings)\b/],
  ["vergleich", /\b(besser|schlechter|klueger|kluger|schoener|schoner|cooler|lustiger|netter|sportlicher|schneller)\s+als\s+(alle|die anderen|andere|der rest|der klassenrest|jeder|jede|wir)\b/],
  ["vergleich", /\b(im vergleich|verglichen) (zu|mit)\b/],
  ["geruecht", /\b(man munkelt|gerucht|geruechte|angeblich|hab(e)? gehort|habe gehort|jeder weiss|alle wissen|heimlich|geheim|geheimnis|soll (\w+ ){0,4}(haben|gemacht|gesagt|getan)|erzahlt man|sagt man|es heisst|petzt|verraten|verraet|verrat)\b/],
  ["bloss", /\b(peinlich|blamier|blossgestellt|bloss ?gestell|ausgelacht|auslachen|lach(en|t)? (uber|ueber) (ihn|sie|ihm|ihr)|lustig machen|veralbern|verarschen|verarsch|aufziehen|hanseln|hansel)\w*/],
  ["aussehen", /\b(sieht|siehst|sehen|sah|sahen)\b[^.!?]{0,30}\baus\b/],
  ["kontakt", /(https?:|www\.|\.(ch|com|de|net|org|io)\b|@|\bt\.me\b)/],
  ["kontakt", /\d[\d\s().+\/-]{6,}\d/],
  ["kontakt", /\b(instagram|insta|snapchat|snap|tiktok|whatsapp|telegram|discord|signal|facebook|youtube|handynummer|telefonnummer|nummer|adresse|wohnt in|wohnort|strasse)\b/],
  ["anweisung", /\b(ignorier\w*|vergiss|missachte|uberschreib\w*|ueberschreib\w*)\s+(alle[ns]?\s+|die\s+|deine\s+|vorherige\w*\s+|obige\w*\s+)?(regeln|anweisung\w*|instruktion\w*|vorgaben|alles|befehle|pruefung|prufung|moderation)\b/],
  ["anweisung", /\b(system ?prompt|jailbreak|ignore (all|previous|the above)|du bist jetzt|you are now|gib (den text )?frei|gebe frei|schalte frei|als ki|prompt injection|<\/?daten>)\b/],
];

/**
 * Prueft einen Text. Gibt { ok: true } oder { ok: false, codes: ["wort:beleidigung", ...] } zurueck (nie den Treffer selbst).
 */
export function wortlistenPruefung(text) {
  const codes = new Set();
  const roh = falte(text);
  // Muster auf dem gefalteten Text (mit Leerzeichen, ohne Leet), damit Phrasen stimmen. Dazu auch auf der gezogenen Fassung.
  const gezogen = ziehe(roh);
  for (const basis of new Set([roh, gezogen])) {
    for (const [name, re] of MUSTER) if (re.test(basis)) codes.add("muster:" + name);
  }
  for (const eins of ["i", "l"]) {
    const fassung = ziehe(leet(roh, eins));
    const kollab = kollabiere(fassung);
    // Wortvergleich je Token
    for (const t of kollab.split(/[^\p{L}]+/u).filter(Boolean)) {
      const k = woerterSet.get(t);
      if (k) codes.add("wort:" + k);
      for (const p of praefixe) if (t.startsWith(p.w)) codes.add("wort:" + p.kat);
    }
    // Zusammengezogen (ohne Trennzeichen): lange Staemme ueberall, kurze nur am Wortanfang eines Tokens
    const kompakt = kollab.replace(/[^\p{L}]+/gu, "");
    for (const s of HART_LANG) if (kompakt.includes(s)) codes.add("hart:" + s.slice(0, 3));
    for (const t of kollab.split(/[^\p{L}]+/u)) for (const s of HART_KURZ) if (t.startsWith(s)) codes.add("hart:" + s.slice(0, 3));
  }
  return codes.size ? { ok: false, codes: [...codes].sort() } : { ok: true };
}
