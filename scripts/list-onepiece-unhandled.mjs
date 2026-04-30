// Liste les cartes One Piece sans handler ET ayant un effet "actif" (pas juste un keyword).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const effectsSrc = readFileSync(
  join(repoRoot, "party/src/lib/onepiece-effects.ts"),
  "utf8",
);
const handledIds = new Set(
  [...effectsSrc.matchAll(/"(OP09|ST1[5-9]|ST2[01])-(\d{3})"/g)].map(
    (m) => `${m[1]}-${m[2]}`,
  ),
);

const baseSrc = readFileSync(
  join(repoRoot, "shared/tcg-onepiece-base.ts"),
  "utf8",
);
const cardRe =
  /\{\s*kind:\s*"(?<kind>[a-z]+)",\s*id:\s*"(?<id>[A-Z0-9-]+)",[^}]*?effect:\s*(?<effect>"(?:[^"\\]|\\.)*"|null)[^}]*?\}/g;
const cards = [];
for (const m of baseSrc.matchAll(cardRe)) {
  const id = m.groups.id;
  if (!/^(OP09|ST1[5-9]|ST2[01])-\d{3}$/.test(id)) continue;
  const kind = m.groups.kind;
  const rawEffect = m.groups.effect;
  let effect = null;
  if (rawEffect !== "null") {
    effect = rawEffect.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  const nameMatch = m[0].match(/name:\s*"([^"]+)"/);
  const name = nameMatch ? nameMatch[1] : "?";
  cards.push({ id, kind, name, effect });
}

// Strip les reminder texts entre parenthèses.
function strip(eff) {
  if (!eff) return "";
  // Enlève les keywords + reminder pour vérifier s'il reste un effet "actif".
  return eff
    .replace(/\[Bloqueur\]\s*\([^)]*\)/g, "")
    .replace(/\[Initiative\]\s*\([^)]*\)/g, "")
    .replace(/\[Double attaque\]\s*\([^)]*\)/g, "")
    .replace(/\[Exil\]\s*\([^)]*\)/g, "")
    .replace(/\[Bloqueur\]/g, "")
    .replace(/\[Initiative\]/g, "")
    .replace(/\[Double attaque\]/g, "")
    .replace(/\[Exil\]/g, "")
    .trim();
}

const unhandled = cards.filter(
  (c) =>
    !handledIds.has(c.id) &&
    c.effect &&
    strip(c.effect).length > 0,
);

console.log(`Cartes sans handler ET avec effet actif (au-delà des keywords) : ${unhandled.length}\n`);

const byKind = {};
for (const c of unhandled) {
  (byKind[c.kind] ??= []).push(c);
}

for (const kind of Object.keys(byKind).sort()) {
  console.log(`══ ${kind} (${byKind[kind].length}) ══`);
  for (const c of byKind[kind]) {
    console.log(`  ${c.id}  ${c.name}`);
    console.log(`    └─ ${c.effect.replace(/\n/g, " ")}`);
  }
  console.log();
}
