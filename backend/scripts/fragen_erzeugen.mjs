// Erzeugt src/fragen.json aus ../fragen.js (Quelle der Wahrheit bleibt die Seite).
import fs from "node:fs"; import vm from "node:vm"; import path from "node:path";
const dir = path.dirname(new URL(import.meta.url).pathname);
const w = {}; vm.runInNewContext(fs.readFileSync(path.join(dir, "../../fragen.js"), "utf8"), { window: w });
const out = w.FRAGEN.map(f => ({ id: f.id, art: f.art, optionen: f.optionen, anderes: !!f.anderes }));
fs.writeFileSync(path.join(dir, "../src/fragen.json"), JSON.stringify(out, null, 1) + "\n");
console.log(out.map(f => f.id).join(","));
