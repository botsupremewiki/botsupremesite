// Transforme scripts/pokemon-full.json (généré par generate-pokemon-cards.mjs)
// en shared/tcg-pokemon-base.ts (TypeScript array conforme au type PokemonCardData).
//
// Chaque Pokémon donne 3 cartes (1 par rareté) avec stats identiques mais
// visuels différents. On utilise pack: "kanto" pour toutes les cartes (1 pack
// unique pour MVP — les anciens packs thématiques sont retirés).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const INPUT = path.join(ROOT, "scripts", "pokemon-full.json");
const OUTPUT = path.join(ROOT, "shared", "tcg-pokemon-base.ts");

function tsValue(v) {
  if (v === null || v === undefined) return "undefined";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(tsValue).join(", ")}]`;
  if (typeof v === "object") {
    const entries = Object.entries(v)
      .filter(([_, val]) => val !== undefined && val !== null)
      .map(([k, val]) => `${k}: ${tsValue(val)}`);
    return `{ ${entries.join(", ")} }`;
  }
  return "undefined";
}

function buildCard(pokemon, version) {
  // Une entrée TS pour une (Pokémon × rareté) donnée.
  // Stats identiques entre les 3 versions du même Pokémon (Option A skins).
  const obj = {
    kind: "pokemon",
    id: version.id,
    number: pokemon.pokeapiId,
    name: pokemon.nameFr,
    type: pokemon.type,
    stage: pokemon.stage,
  };
  if (pokemon.evolvesFrom) obj.evolvesFrom = pokemon.evolvesFrom;
  obj.hp = pokemon.hp;
  if (pokemon.weakness) obj.weakness = pokemon.weakness;
  obj.retreatCost = pokemon.retreatCost;
  obj.attacks = pokemon.attacks;
  obj.rarity = version.rarity;
  obj.art = version.image; // URL pokemontcg.io (au lieu d'emoji)
  obj.pack = "kanto";

  return obj;
}

async function main() {
  const raw = await fs.readFile(INPUT, "utf8");
  const pokemon = JSON.parse(raw);

  console.log(`Loaded ${pokemon.length} Pokémon depuis ${path.relative(ROOT, INPUT)}`);

  const cards = [];
  let missingImages = 0;
  for (const p of pokemon) {
    for (const v of p.versions) {
      if (!v.image) {
        missingImages++;
        console.warn(`  ⚠ Pas d'image pour ${p.nameFr} (${v.rarity})`);
        continue;
      }
      cards.push({ pokemon: p, version: v });
    }
  }

  console.log(`Total cartes : ${cards.length} (${missingImages} versions sans image)`);

  // Génère le code TS.
  const lines = [];
  lines.push("// Pokémon Génération 1 — 151 Pokémon × 3 raretés (common, rare, holo-rare).");
  lines.push("//");
  lines.push("// Stats identiques entre les 3 versions d'un même Pokémon (option \"skins\").");
  lines.push("// Visuels = vraies cartes officielles via pokemontcg.io.");
  lines.push("// Généré par scripts/json-to-ts.mjs — ne pas éditer à la main.");
  lines.push("");
  lines.push('import type { PokemonCardData } from "./types";');
  lines.push("");
  lines.push("const POKEMON: PokemonCardData[] = [");

  let lastPokeId = null;
  for (const { pokemon, version } of cards) {
    if (lastPokeId !== pokemon.pokeapiId) {
      if (lastPokeId !== null) lines.push("");
      lines.push(`  // #${pokemon.pokeapiId} ${pokemon.nameFr} (${pokemon.type}, HP ${pokemon.hp}, ${pokemon.stage})`);
      lastPokeId = pokemon.pokeapiId;
    }
    const card = buildCard(pokemon, version);
    lines.push(`  ${tsValue(card)},`);
  }

  lines.push("];");
  lines.push("");
  lines.push("export const POKEMON_BASE_SET: PokemonCardData[] = POKEMON;");
  lines.push("");
  lines.push("export const POKEMON_BASE_SET_BY_ID: Record<string, PokemonCardData> = Object.fromEntries(");
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
