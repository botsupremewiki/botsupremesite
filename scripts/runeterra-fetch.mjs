// Récupère les cartes de Legends of Runeterra (Set 1 — Foundations) en
// français depuis le data feed officiel Riot, destiné aux outils
// communautaires (deck trackers, etc.).
//
// Sources:
//   - Globals (régions, mots-clés, spell speeds) :
//       https://dd.b.pvp.net/latest/core/fr_fr/data/globals-fr_fr.json
//   - Set 1 (Foundations) :
//       https://dd.b.pvp.net/latest/set1/fr_fr/data/set1-fr_fr.json
//
// Sorties :
//   - scripts/runeterra-globals-fr.json
//   - scripts/runeterra-set1-fr.json
//
// Usage : node scripts/runeterra-fetch.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "scripts");

const LOCALE = "fr_fr";
const SOURCES = [
  {
    name: "globals",
    url: `https://dd.b.pvp.net/latest/core/${LOCALE}/data/globals-${LOCALE}.json`,
    out: path.join(OUT_DIR, `runeterra-globals-${LOCALE.split("_")[0]}.json`),
  },
  {
    name: "set1",
    url: `https://dd.b.pvp.net/latest/set1/${LOCALE}/data/set1-${LOCALE}.json`,
    out: path.join(OUT_DIR, `runeterra-set1-${LOCALE.split("_")[0]}.json`),
  },
];

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} sur ${url}`);
  }
  return res.json();
}

async function main() {
  for (const src of SOURCES) {
    process.stdout.write(`Fetching ${src.name} (${src.url}) … `);
    const data = await fetchJson(src.url);
    await fs.writeFile(src.out, JSON.stringify(data, null, 2), "utf8");
    const rel = path.relative(ROOT, src.out);
    if (Array.isArray(data)) {
      console.log(`OK (${data.length} entrées) → ${rel}`);
    } else {
      const keys = Object.keys(data);
      console.log(`OK (${keys.length} clés : ${keys.slice(0, 5).join(", ")}${keys.length > 5 ? "…" : ""}) → ${rel}`);
    }
  }
  console.log("\n✓ Fetch terminé.");
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
