// Lit scripts/pocket-cards-fr.json (généré par generate-pocket-cards-fr.mjs)
// et produit shared/tcg-pokemon-base.ts au format PokemonCardData (Pocket).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const INPUT = path.join(ROOT, "scripts", "pocket-cards-fr.json");
const OUTPUT = path.join(ROOT, "shared", "tcg-pokemon-base.ts");

function tsValue(v) {
  if (v === null || v === undefined) return "undefined";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(tsValue).join(", ")}]`;
  if (typeof v === "object") {
    const entries = Object.entries(v)
      .filter(([, val]) => val !== undefined && val !== null)
      .map(([k, val]) => `${k}: ${tsValue(val)}`);
    return `{ ${entries.join(", ")} }`;
  }
  return "undefined";
}

function buildCard(c) {
  if (c.kind === "trainer") {
    const obj = {
      kind: "trainer",
      id: c.id,
      number: c.localId,
      name: c.name,
      rarity: c.rarity,
      image: c.image,
      trainerType: c.trainerType,
    };
    if (c.illustrator) obj.illustrator = c.illustrator;
    if (c.effect) obj.effect = c.effect;
    obj.pack = c.boosters[0] ?? "mewtwo";
    if (c.boosters.length > 1) {
      obj.extraPacks = c.boosters.slice(1);
    }
    return obj;
  }
  // Pokémon
  const obj = {
    kind: "pokemon",
    id: c.id,
    number: c.localId,
    pokedexId: c.pokedexId,
    name: c.name,
    type: c.type,
    stage: c.stage,
  };
  if (c.evolveFromName) obj.evolvesFrom = c.evolveFromName;
  obj.hp = c.hp;
  if (c.weakness) obj.weakness = c.weakness;
  obj.retreatCost = c.retreatCost;
  obj.attacks = c.attacks.map((a) => {
    const out = { name: a.name, cost: a.cost };
    if (a.damage !== undefined) out.damage = a.damage;
    if (a.damageSuffix) out.damageSuffix = a.damageSuffix;
    if (a.text) out.text = a.text;
    return out;
  });
  obj.rarity = c.rarity;
  obj.image = c.image;
  if (c.description) obj.description = c.description;
  if (c.illustrator) obj.illustrator = c.illustrator;
  obj.isEx = c.isEx;
  // Booster principal = premier dans la liste. Multi-pack en extra.
  obj.pack = c.boosters[0] ?? "mewtwo";
  if (c.boosters.length > 1) {
    obj.extraPacks = c.boosters.slice(1);
  }
  return obj;
}

async function main() {
  const raw = await fs.readFile(INPUT, "utf8");
  const data = JSON.parse(raw);

  console.log(
    `Loaded ${data.cards.length} cartes (set ${data.setId} : ${data.setName})`,
  );

  const cards = data.cards.filter((c) => c.boosters.length > 0);
  const skippedNoBooster = data.cards.length - cards.length;
  if (skippedNoBooster > 0) {
    console.log(`  ⚠ ${skippedNoBooster} cartes sans booster, ignorées.`);
  }

  // Tri : par booster (mewtwo, charizard, pikachu) puis par localId.
  const order = ["mewtwo", "charizard", "pikachu"];
  cards.sort((a, b) => {
    const ai = order.indexOf(a.boosters[0]);
    const bi = order.indexOf(b.boosters[0]);
    if (ai !== bi) return ai - bi;
    return (a.localId ?? 0) - (b.localId ?? 0);
  });

  const lines = [];
  lines.push(`// Pokémon TCG Pocket — set ${data.setId} "${data.setName}".`);
  lines.push(`// Cartes en français depuis tcgdex.net (${cards.length} Pokémon).`);
  lines.push(`// Généré par scripts/pocket-json-to-ts.mjs — ne pas éditer à la main.`);
  lines.push("");
  lines.push('import type { PokemonCardData } from "./types";');
  lines.push("");
  lines.push("const POKEMON: PokemonCardData[] = [");

  let lastBooster = null;
  for (const c of cards) {
    const booster = c.boosters[0];
    if (booster !== lastBooster) {
      if (lastBooster !== null) lines.push("");
      lines.push(`  // ─── Booster ${booster.toUpperCase()} ───`);
      lastBooster = booster;
    }
    lines.push(`  ${tsValue(buildCard(c))},`);
  }

  lines.push("];");
  lines.push("");
  lines.push("export const POKEMON_BASE_SET: PokemonCardData[] = POKEMON;");
  lines.push("");
  lines.push(
    "export const POKEMON_BASE_SET_BY_ID: Map<string, PokemonCardData> = new Map(",
  );
  lines.push("  POKEMON.map((c) => [c.id, c]),");
  lines.push(");");
  lines.push("");

  await fs.writeFile(OUTPUT, lines.join("\n"), "utf8");
  console.log(`\n✓ ${path.relative(ROOT, OUTPUT)} écrit (${cards.length} cartes).`);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
