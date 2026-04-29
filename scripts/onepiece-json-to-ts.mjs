// Lit scripts/onepiece-cards-fr.json (généré par generate-onepiece-cards-fr.mjs)
// et produit shared/tcg-onepiece-base.ts au format OnePieceCardData[].

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const INPUT = path.join(ROOT, "scripts", "onepiece-cards-fr.json");
const OUTPUT = path.join(ROOT, "shared", "tcg-onepiece-base.ts");

// Ordre de tri stable : OP-09 en premier, puis ST-15 → ST-21.
const SET_ORDER = [
  "OP-09",
  "ST-15",
  "ST-16",
  "ST-17",
  "ST-18",
  "ST-19",
  "ST-20",
  "ST-21",
];

function tsValue(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(tsValue).join(", ")}]`;
  if (typeof v === "object") {
    const entries = Object.entries(v).map(([k, val]) => `${k}: ${tsValue(val)}`);
    return `{ ${entries.join(", ")} }`;
  }
  return "null";
}

// URLs des images : on sert depuis web/public/onepiece-cards/ via Vercel
// (le CDN Bandai bloque les hotlinks cross-origin). Les images sont
// téléchargées une fois par scripts/download-onepiece-images.mjs.
function localImageUrl(cardId) {
  return `/onepiece-cards/${cardId}.webp`;
}

// Construit l'objet typé selon le `kind` (champs spécifiques).
function buildCard(c) {
  // Pack principal = 1ère couleur. Multi-couleurs → extraPacks.
  // Les DON cards n'ont pas de couleur — fallback sur "rouge" pour
  // satisfaire le type (cas non rencontré dans le pool actuel).
  const colors = c.color ?? [];
  const pack = colors[0] ?? "rouge";
  const extraPacks = colors.slice(1);

  // Champs partagés.
  const base = {
    kind: c.kind,
    id: c.id,
    cardNumber: c.cardNumber,
    name: c.name,
    rarity: c.rarity,
    image: localImageUrl(c.id),
    set: c.set,
    block: c.block,
    effect: c.effect,
    trigger: c.trigger,
    types: c.types,
    pack,
    ...(extraPacks.length > 0 ? { extraPacks } : {}),
  };

  switch (c.kind) {
    case "leader":
      return {
        ...base,
        color: c.color,
        life: c.life ?? 0,
        power: c.power ?? 0,
        attribute: c.attribute,
      };
    case "character":
      return {
        ...base,
        color: c.color,
        cost: c.cost ?? 0,
        power: c.power ?? 0,
        counter: c.counter,
        attribute: c.attribute,
      };
    case "event":
      return {
        ...base,
        color: c.color,
        cost: c.cost ?? 0,
        counter: c.counter,
      };
    case "stage":
      return {
        ...base,
        color: c.color,
        cost: c.cost ?? 0,
        counter: c.counter,
      };
    case "don":
      return base;
    default:
      throw new Error(`Catégorie inconnue : ${c.kind} (${c.id})`);
  }
}

// Émet l'objet TS en respectant l'ordre des champs (et avec les champs
// optionnels seulement quand non-null pour rester lisible).
function emitCard(c) {
  // Ordre de propriétés stable, quel que soit le `kind`.
  const order = [
    "kind",
    "id",
    "cardNumber",
    "name",
    "rarity",
    "image",
    "set",
    "block",
    "color",
    "cost",
    "life",
    "power",
    "counter",
    "attribute",
    "types",
    "effect",
    "trigger",
    "pack",
    "extraPacks",
  ];
  const entries = order
    .filter((k) => k in c)
    .map((k) => `${k}: ${tsValue(c[k])}`);
  return `{ ${entries.join(", ")} }`;
}

async function main() {
  const raw = await fs.readFile(INPUT, "utf8");
  const data = JSON.parse(raw);
  console.log(`Loaded ${data.cards.length} cartes`);

  const cards = data.cards.map(buildCard);

  // Tri : par set (selon SET_ORDER), puis par id alphabétique.
  cards.sort((a, b) => {
    const ai = SET_ORDER.indexOf(a.set);
    const bi = SET_ORDER.indexOf(b.set);
    if (ai !== bi) return ai - bi;
    return a.id.localeCompare(b.id);
  });

  const lines = [];
  lines.push(`// One Piece TCG — sets : ${SET_ORDER.join(" + ")}.`);
  lines.push(
    `// Cartes en français scrapées depuis fr.onepiece-cardgame.com (${cards.length} cartes).`,
  );
  lines.push(`// Généré par scripts/onepiece-json-to-ts.mjs — ne pas éditer à la main.`);
  lines.push("");
  lines.push('import type { OnePieceCardData } from "./types";');
  lines.push("");
  lines.push("const ONEPIECE: OnePieceCardData[] = [");

  let lastSet = null;
  for (const c of cards) {
    if (c.set !== lastSet) {
      if (lastSet !== null) lines.push("");
      lines.push(`  // ─── ${c.set} ───`);
      lastSet = c.set;
    }
    lines.push(`  ${emitCard(c)},`);
  }

  lines.push("];");
  lines.push("");
  lines.push("export const ONEPIECE_BASE_SET: OnePieceCardData[] = ONEPIECE;");
  lines.push("");
  lines.push(
    "export const ONEPIECE_BASE_SET_BY_ID: Map<string, OnePieceCardData> = new Map(",
  );
  lines.push("  ONEPIECE.map((c) => [c.id, c]),");
  lines.push(");");
  lines.push("");

  await fs.writeFile(OUTPUT, lines.join("\n"), "utf8");
  console.log(
    `\n✓ ${path.relative(ROOT, OUTPUT)} écrit (${cards.length} cartes).`,
  );
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
