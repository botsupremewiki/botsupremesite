// Génère le dataset Pokémon TCG Pocket en français depuis tcgdex.net.
// Set par défaut : A1 (Puissance Génétique) — 226 cartes officielles.
//
// Sortie : scripts/pocket-cards-fr.json (consommé ensuite par
// scripts/pocket-json-to-ts.mjs pour produire shared/tcg-pokemon-base.ts).
//
// Usage :
//   node scripts/generate-pocket-cards-fr.mjs           → set A1 complet
//   node scripts/generate-pocket-cards-fr.mjs --set=A1a → autre set

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const setArg = args.find((a) => a.startsWith("--set="));
// Sets chargés par défaut : A1 (booster principal) + P-A (Promo, contient
// les utility trainers Potion / Poké Ball / Pokédex / etc.). Les cartes
// P-A sans booster Pocket sont assignées aux 3 boosters principaux pour
// rester droppables sur notre site.
const SETS_TO_LOAD = setArg ? [setArg.slice("--set=".length)] : ["A1", "P-A"];

// FR → notre PokemonEnergyType.
const TYPE_MAP = {
  Plante: "grass",
  Feu: "fire",
  Eau: "water",
  Électrique: "lightning",
  Psy: "psychic",
  Combat: "fighting",
  Obscurité: "darkness",
  Métal: "metal",
  Dragon: "dragon",
  Fée: "fairy",
  Incolore: "colorless",
};

const STAGE_MAP = {
  "De base": "basic",
  "Niveau 1": "stage1",
  "Niveau 2": "stage2",
};

// Raretés Pocket FR → identifiants stables côté code.
//   diamond-1 : ◆        (commune)
//   diamond-2 : ◆◆       (peu commune)
//   diamond-3 : ◆◆◆      (rare)
//   diamond-4 : ◆◆◆◆     (rare ex / "Quatre Diamants")
//   star-1    : ★        (full art)
//   star-2    : ★★       (full art spécial / "alt art")
//   star-3    : ★★★      (immersive art)
//   crown     : 👑       (couronne brillante)
//   promo     : Sans Rareté / variations
const RARITY_MAP = {
  "Un Diamant": "diamond-1",
  "Deux Diamants": "diamond-2",
  "Trois Diamants": "diamond-3",
  "Quatre Diamants": "diamond-4",
  "Une Étoile": "star-1",
  "Deux Étoiles": "star-2",
  "Trois Étoiles": "star-3",
  Couronne: "crown",
  "Couronne Brillante": "crown",
  "Sans Rareté": "promo",
};

// Boosters thématiques Pocket A1 (id tcgdex → notre id court).
const BOOSTER_ID_MAP = {
  "boo_A1-mewtwo": "mewtwo",
  "boo_A1-charizard": "charizard",
  "boo_A1-pikachu": "pikachu",
  "boo_A1a-mew": "mew",
  "boo_A2-dialga": "dialga",
  "boo_A2-palkia": "palkia",
};

// Cartes du set P-A (Promo) sans booster Pocket assigné. Sur notre site
// on les rend droppables dans les 3 boosters principaux (multi-pack).
const PROMO_FALLBACK_BOOSTERS = ["mewtwo", "charizard", "pikachu"];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "site-ultime-tcg-pocket-fr/1.0" },
      });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          await sleep(1000 * (i + 1));
          continue;
        }
        throw new Error(`${url} → HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(500 * (i + 1));
    }
  }
}

function mapType(frType) {
  return TYPE_MAP[frType] ?? "colorless";
}

function mapStage(frStage) {
  return STAGE_MAP[frStage] ?? "basic";
}

function mapRarity(frRarity) {
  return RARITY_MAP[frRarity] ?? "promo";
}

function mapBoosters(boosters) {
  if (!boosters || boosters.length === 0) return [];
  return boosters
    .map((b) => BOOSTER_ID_MAP[b.id] ?? null)
    .filter((b) => b !== null);
}

function mapAttack(att) {
  return {
    name: att.name,
    cost: (att.cost ?? []).map((c) => mapType(c)),
    damage: parseDamage(att.damage),
    damageSuffix: parseDamageSuffix(att.damage),
    text: att.effect ?? null,
  };
}

function parseDamage(raw) {
  if (raw == null || raw === "") return undefined;
  const s = String(raw).trim();
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseDamageSuffix(raw) {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (s.endsWith("+")) return "+";
  if (s.endsWith("×") || s.endsWith("x")) return "x";
  if (s.endsWith("-")) return "-";
  return undefined;
}

// Cache des chaînes d'évolution PokéAPI : pokedexId → pokedexId du préevolveur (ou null).
const PRE_EVO_CACHE = new Map();
async function getPreEvolutionDexId(dexId) {
  if (PRE_EVO_CACHE.has(dexId)) return PRE_EVO_CACHE.get(dexId);
  try {
    const sp = await fetchJson(
      `https://pokeapi.co/api/v2/pokemon-species/${dexId}`,
    );
    const url = sp.evolves_from_species?.url;
    if (!url) {
      PRE_EVO_CACHE.set(dexId, null);
      return null;
    }
    const m = url.match(/\/pokemon-species\/(\d+)\/?$/);
    const preDex = m ? Number(m[1]) : null;
    PRE_EVO_CACHE.set(dexId, preDex);
    return preDex;
  } catch {
    PRE_EVO_CACHE.set(dexId, null);
    return null;
  }
}

// FR → en pour les types de Dresseurs.
const TRAINER_TYPE_MAP = {
  Supporter: "supporter",
  Objet: "item",
  "Outil Pokémon": "tool",
  Stade: "stadium",
};

async function transformCard(c) {
  if (c.category === "Pokémon") {
    return {
      kind: "pokemon",
      id: c.id, // "A1-006"
      localId: parseInt(c.localId, 10) || 0,
      name: c.name, // "Chrysacier" (FR)
      pokedexId: Array.isArray(c.dexId) ? c.dexId[0] : null,
      type: mapType((c.types ?? [])[0]),
      typeFr: (c.types ?? [])[0] ?? "Incolore",
      stage: mapStage(c.stage),
      stageFr: c.stage ?? "De base",
      hp: c.hp ?? 50,
      weakness: c.weaknesses?.[0]
        ? mapType(c.weaknesses[0].type)
        : null,
      weaknessFr: c.weaknesses?.[0]?.type ?? null,
      weaknessValue: c.weaknesses?.[0]?.value ?? null,
      retreatCost: c.retreat ?? 0,
      attacks: (c.attacks ?? []).map(mapAttack),
      rarity: mapRarity(c.rarity),
      rarityFr: c.rarity ?? "Sans Rareté",
      image: `${c.image}/high.webp`,
      illustrator: c.illustrator ?? null,
      description: c.description ?? null,
      boosters: mapBoosters(c.boosters),
      isEx: c.name.endsWith("-ex") || c.name.endsWith("-EX"),
    };
  }

  if (c.category === "Dresseur") {
    let boosters = mapBoosters(c.boosters);
    // Cartes Dresseur du set P-A (Promo, Wonder Pick dans le vrai Pocket)
    // : tcgdex ne leur attribue aucun booster jouable. Sur notre site on
    // les rend droppables dans les 3 boosters principaux pour qu'elles
    // soient effectivement obtenables (sinon utility trainers inaccessibles).
    if (boosters.length === 0) {
      boosters = [...PROMO_FALLBACK_BOOSTERS];
    }
    return {
      kind: "trainer",
      id: c.id,
      localId: parseInt(c.localId, 10) || 0,
      name: c.name,
      rarity: mapRarity(c.rarity),
      rarityFr: c.rarity ?? "Sans Rareté",
      image: `${c.image}/high.webp`,
      illustrator: c.illustrator ?? null,
      effect: c.effect ?? null,
      trainerType: TRAINER_TYPE_MAP[c.trainerType] ?? "supporter",
      trainerTypeFr: c.trainerType ?? "Supporter",
      boosters,
    };
  }

  // Catégorie inconnue (ex Énergie spéciale → tcgdex utilise "Énergie")
  // → on skip pour le MVP.
  return null;
}

async function main() {
  const start = Date.now();
  console.log(`Mode : sets [${SETS_TO_LOAD.join(", ")}]`);

  const setMeta = [];
  const results = [];
  let skipped = 0;

  for (const setId of SETS_TO_LOAD) {
    const set = await fetchJson(
      `https://api.tcgdex.net/v2/fr/sets/${setId}`,
    );
    console.log(`\nSet ${setId} : ${set.name} (${set.cards?.length ?? 0} cartes)`);
    setMeta.push({ id: set.id, name: set.name });

    for (const ref of set.cards ?? []) {
      try {
        const card = await fetchJson(
          `https://api.tcgdex.net/v2/fr/cards/${ref.id}`,
        );
        // Skip les Pokémon promo P-A (sinon trop de doublons par nom avec A1
        // — les cartes P-A pour les Pokémon sont des promos d'event/login
        // qu'on n'a pas besoin sur notre site). On garde uniquement les
        // Dresseurs P-A (Potion, Poké Ball, etc.).
        if (setId === "P-A" && card.category === "Pokémon") {
          skipped++;
          continue;
        }
        const transformed = await transformCard(card);
        if (!transformed) {
          skipped++;
          continue;
        }
        results.push(transformed);
        if (results.length % 25 === 0) {
          console.log(`  ✓ ${results.length} cartes traitées…`);
        }
        await sleep(50); // courtoisie
      } catch (err) {
        console.error(`  ✗ ${ref.id} échec : ${err.message}`);
        skipped++;
      }
    }
  }

  console.log(`\n${results.length} Pokémon récupérés. Calcul des évolutions…`);

  // Post-traitement : injecter evolveFromName (FR) pour les stage1/stage2.
  // Skip les trainers (pas d'évolution).
  const pokemonOnly = results.filter((c) => c.kind === "pokemon");
  const byDex = new Map();
  for (const c of pokemonOnly) {
    if (c.pokedexId == null || c.isEx) continue;
    const existing = byDex.get(c.pokedexId);
    if (!existing || c.rarity === "diamond-1") {
      byDex.set(c.pokedexId, c);
    }
  }

  for (const c of pokemonOnly) {
    if (c.stage === "basic" || c.pokedexId == null) {
      c.evolveFromName = null;
      continue;
    }
    const preDex = await getPreEvolutionDexId(c.pokedexId);
    const pre = preDex ? byDex.get(preDex) : null;
    c.evolveFromName = pre?.name ?? null;
    await sleep(50);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const trainers = results.filter((c) => c.kind === "trainer").length;
  const evosResolved = pokemonOnly.filter(
    (c) => c.stage !== "basic" && c.evolveFromName,
  ).length;
  const evosTotal = pokemonOnly.filter((c) => c.stage !== "basic").length;
  console.log(
    `Terminé en ${elapsed}s — ${results.length} cartes (${pokemonOnly.length} Pokémon, ${trainers} Dresseurs, ${skipped} skippés), ${evosResolved}/${evosTotal} évolutions résolues.`,
  );

  // Export JSON brut.
  const out = path.join(ROOT, "scripts", "pocket-cards-fr.json");
  await fs.writeFile(
    out,
    JSON.stringify(
      {
        sets: setMeta,
        // Boosters principaux Pocket A1.
        boosters: [
          { id: "mewtwo", name: "Mewtwo" },
          { id: "charizard", name: "Dracaufeu" },
          { id: "pikachu", name: "Pikachu" },
        ],
        cards: results,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\nÉcrit dans ${path.relative(ROOT, out)}`);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
