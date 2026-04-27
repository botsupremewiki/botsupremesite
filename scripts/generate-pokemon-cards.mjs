// Génère les cartes Pokémon Gen 1 en combinant :
//   • PokéAPI (pokeapi.co)              → stats normalisées + noms FR + evolution chain
//   • Pokémon TCG API (pokemontcg.io)   → 3 visuels officiels par Pokémon (common / rare / very-rare)
//
// Stats sont identiques pour les 3 versions d'un même Pokémon (Option A "skins" choisie par le user).
// Visuels = vraies cartes officielles (3 différentes par Pokémon).
//
// Usage :
//   node scripts/generate-pokemon-cards.mjs --sample        → 10 Pokémon vers scripts/pokemon-sample.json
//   node scripts/generate-pokemon-cards.mjs                 → 151 Pokémon vers shared/tcg-pokemon-base.ts

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const SAMPLE = args.includes("--sample");
const idsArg = args.find((a) => a.startsWith("--ids="));
const PATCH_IDS = idsArg ? idsArg.slice("--ids=".length).split(",").map(Number) : null;

// Échantillon : 10 Pokémon variés (starters, basics, légendaires, gros HP) pour valider la qualité.
const SAMPLE_IDS = [1, 4, 6, 7, 16, 25, 130, 143, 150, 151];
const FULL_IDS = Array.from({ length: 151 }, (_, i) => i + 1);
const TARGET_IDS = PATCH_IDS ?? (SAMPLE ? SAMPLE_IDS : FULL_IDS);

// ─── Mappings ──────────────────────────────────────────────────────────────

// PokéAPI type → TCG energy type (Base Set 1999 conventions, étendues pour Gen 1).
const TYPE_MAP = {
  normal: "colorless",
  flying: "colorless",
  fire: "fire",
  water: "water",
  ice: "water",
  electric: "lightning",
  grass: "grass",
  bug: "grass",
  poison: "grass", // Gen 1 TCG : Bulbasaur etc. sont grass
  fighting: "fighting",
  ground: "fighting",
  rock: "fighting",
  psychic: "psychic",
  ghost: "psychic",
  dragon: "colorless",
};

// Faiblesses standards Base Set 1999 (déterministe par type énergie).
const WEAKNESS_MAP = {
  fire: "water",
  water: "lightning",
  grass: "fire",
  lightning: "fighting",
  psychic: "psychic",
  fighting: "psychic",
  colorless: "fighting",
};

// Tiers de rareté pokemontcg.io → notre choix (1 = "common", 2 = "rare", 3 = "very rare").
function rarityTier(officialRarity) {
  const r = (officialRarity || "").toLowerCase();
  if (!r) return 1;
  // Tier 3 (très rare) — full art moderne, ultra rares, secrets, EX/GX/V/VMAX
  if (
    r.includes("illustration rare") || // SV-era full art, parfait pour très rare
    r.includes("ultra") ||
    r.includes("secret") ||
    r.includes("rainbow") ||
    r.includes("hyper") ||
    r.includes("shiny") ||
    r.includes("vmax") ||
    r.includes("vstar") ||
    r.includes("amazing") ||
    r.includes("prime") ||
    r.includes("legend") ||
    r.includes("prism") ||
    r.includes("radiant") ||
    r === "rare holo ex" ||
    r === "rare holo gx" ||
    r === "rare holo v" ||
    r === "rare break"
  ) {
    return 3;
  }
  // Tier 2 (rare) — holo, holo standard, simple rare
  if (r.includes("rare")) return 2;
  // Tier 1 (common) — common / uncommon / promo basique
  return 1;
}

// ─── Helpers fetch avec retry ──────────────────────────────────────────────

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "site-ultime-tcg-gen/1.0" } });
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

// ─── PokéAPI ───────────────────────────────────────────────────────────────

// Légendaires Gen 1 : autorisés à dépasser le cap basique standard.
const LEGENDARIES = new Set([144, 145, 146, 150, 151]);

async function loadPokemon(id) {
  const [poke, species] = await Promise.all([
    fetchJson(`https://pokeapi.co/api/v2/pokemon/${id}`),
    fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${id}`),
  ]);

  const nameFr = species.names.find((n) => n.language.name === "fr")?.name ?? poke.name;
  const nameEn = species.names.find((n) => n.language.name === "en")?.name ?? poke.name;

  const baseHp = poke.stats.find((s) => s.stat.name === "hp")?.base_stat ?? 50;
  const baseAtk = poke.stats.find((s) => s.stat.name === "attack")?.base_stat ?? 50;
  const baseSpAtk = poke.stats.find((s) => s.stat.name === "special-attack")?.base_stat ?? 50;

  const types = poke.types.map((t) => t.type.name);
  const tcgType = TYPE_MAP[types[0]] ?? "colorless";

  // Stage : on suit la chaîne d'évolution pour déterminer basic/stage1/stage2.
  // En Gen 1 only, on ignore les pré-évolutions de gens ultérieures (Pichu, Goinfrex…).
  const evoChain = await fetchJson(species.evolution_chain.url);
  const { stage, evolvesFromUrl } = findStageInChain(evoChain.chain, poke.name, 0);
  let evolvesFromFr = null;
  if (evolvesFromUrl && stage !== "basic") {
    const parentId = speciesIdFromUrl(evolvesFromUrl);
    if (parentId && parentId <= 151) {
      const parentSp = await fetchJson(evolvesFromUrl);
      evolvesFromFr = parentSp.names.find((n) => n.language.name === "fr")?.name ?? null;
    }
  }

  // HP carte = base_hp × 2, arrondi aux 10, capé selon stage + statut légendaire
  // pour respecter l'équilibre format Pocket (3 KO pour gagner).
  //   - basic non-légendaire : max 130 (Pocket A1 : Ronflex 130, Lokhlass 130)
  //   - basic légendaire     : max 180 (entre Pocket 120 et le "vrai" Mewtwo ex)
  //   - stage1               : max 180
  //   - stage2               : max 220
  const isLeg = LEGENDARIES.has(id);
  const maxHpForStage =
    stage === "basic" ? (isLeg ? 180 : 130) : stage === "stage1" ? 180 : 220;
  let hp = Math.round((baseHp * 2) / 10) * 10;
  hp = Math.max(30, Math.min(maxHpForStage, hp));

  // Retreat cost dépend du HP final.
  const retreatCost = hp < 60 ? 1 : hp < 110 ? 2 : 3;

  return {
    pokeapiId: id,
    nameFr,
    nameEn,
    pokeapiName: poke.name,
    types,
    tcgType,
    hp,
    baseAtk,
    baseSpAtk,
    stage,
    evolvesFrom: evolvesFromFr,
    weakness: WEAKNESS_MAP[tcgType],
    retreatCost,
  };
}

// Extrait l'id PokéAPI depuis l'URL species (ex: ".../pokemon-species/172/" → 172).
function speciesIdFromUrl(url) {
  const m = url.match(/\/pokemon-species\/(\d+)\/?$/);
  return m ? Number(m[1]) : null;
}

function findStageInChain(node, targetName, depth, parentSpeciesUrl = null) {
  if (node.species.name === targetName) {
    let stage = depth === 0 ? "basic" : depth === 1 ? "stage1" : "stage2";
    let parentUrl = parentSpeciesUrl;

    // Gen 1 only : si le préevolveur est de Gen 2+ (id > 151), on traite ce
    // Pokémon comme basic. Ex : Pichu (172) → Pikachu reste basic en Gen 1.
    while (parentUrl) {
      const parentId = speciesIdFromUrl(parentUrl);
      if (parentId == null || parentId <= 151) break;
      // Le parent est hors Gen 1 — on remonte d'un cran (peut-être qu'il y a
      // un grand-parent Gen 1 valide, sinon on tombe sur basic).
      stage = depth >= 2 ? "stage1" : "basic";
      parentUrl = null;
      depth = depth - 1;
    }

    return {
      stage,
      evolvesFromUrl: parentUrl,
    };
  }
  for (const evo of node.evolves_to) {
    const res = findStageInChain(evo, targetName, depth + 1, node.species.url);
    if (res) return res;
  }
  return null;
}

const NAME_FR_CACHE = new Map();
async function getNameFr(pokeapiName) {
  if (NAME_FR_CACHE.has(pokeapiName)) return NAME_FR_CACHE.get(pokeapiName);
  try {
    const sp = await fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${pokeapiName}`);
    const fr = sp.names.find((n) => n.language.name === "fr")?.name ?? pokeapiName;
    NAME_FR_CACHE.set(pokeapiName, fr);
    return fr;
  } catch {
    return pokeapiName;
  }
}

// ─── pokemontcg.io ─────────────────────────────────────────────────────────

// Pour les noms à caractères spéciaux, pokemontcg.io indexe avec espace
// ("Nidoran ♀") ou refuse l'apostrophe ("Farfetch'd"). On essaie plusieurs
// queries — la première qui retourne des résultats gagne. Pour Nidoran ♀
// on filtre aussi pour exclure les variantes deltas / promos étranges.
// Normalise les apostrophes typographiques (U+2019) en ASCII pour matcher
// les indexes de pokemontcg.io (qui utilise ').
function normalizeQuotes(s) {
  return s.replace(/[‘’]/g, "'");
}

function buildQueries(englishName) {
  const norm = normalizeQuotes(englishName);
  const queries = [`name:"${norm}"`];
  if (norm.includes("♂")) {
    queries.push(`name:"${norm.replace("♂", " ♂")}"`);
  }
  if (norm.includes("♀")) {
    queries.push(`name:"${norm.replace("♀", " ♀")}"`);
  }
  if (norm.includes("'")) {
    // Apostrophe ASCII : essayer avec, puis sans, puis wildcard.
    queries.push(`name:${norm.replace(/'/g, "")}*`);
    queries.push(`name:"${norm.replace(/'/g, "")}"`);
  }
  return queries;
}

async function loadCards(englishName) {
  // Accumuler toutes les cartes des queries, puis filtrer strict.
  const all = new Map(); // dedupe par card id
  for (const q of buildQueries(englishName)) {
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=250`;
    const res = await fetchJson(url);
    for (const c of res.data ?? []) {
      if (!all.has(c.id)) all.set(c.id, c);
    }
    await sleep(50);
  }
  if (all.size === 0) return [];

  // Filtrer pour garder uniquement les cartes dont le nom matche celui attendu
  // (rejet de "Team Rocket's Pikachu", "Pikachu V", "Pikachu VMAX", "Nidoran ♀ δ", etc.)
  const norm = (s) => normalizeQuotes(s || "").toLowerCase().trim();
  const target = norm(englishName);
  const targetWithSpace = norm(englishName.replace(/♂/g, " ♂").replace(/♀/g, " ♀"));
  const filtered = [...all.values()].filter((c) => {
    const n = norm(c.name);
    return n === target || n === targetWithSpace;
  });
  return filtered.length > 0 ? filtered : [...all.values()];
}

// Sets "vieux" préférés pour la version "common" — chronologique pour qu'une
// carte Base Set (1999) soit choisie avant une Gym Challenge (2000).
const OLD_SETS_PRIORITY = [
  "base1", // Base Set (1999)
  "base2", // Jungle (1999)
  "base3", // Fossil (1999)
  "base4", // Base Set 2 (2000)
  "base5", // Team Rocket (2000)
  "gym1", // Gym Heroes (2000)
  "gym2", // Gym Challenge (2000)
  "neo1", // Neo Genesis (2000)
  "neo2", // Neo Discovery (2001)
  "neo3", // Neo Revelation (2001)
  "neo4", // Neo Destiny (2002)
];

function pickThreeCards(cards) {
  if (cards.length === 0) return [null, null, null];

  // Garder uniquement les cartes avec une image.
  const withImage = cards.filter((c) => c.images?.large || c.images?.small);
  if (withImage.length === 0) return [null, null, null];

  // Bucket par tier de rareté.
  const byTier = { 1: [], 2: [], 3: [] };
  for (const c of withImage) {
    byTier[rarityTier(c.rarity)].push(c);
  }

  const used = new Set();
  // tier 1 (common) : carte d'un set ancien si dispo
  const t1 = pickFromTier(byTier[1], { preferOldSet: true, used }) ?? pickFromTier(byTier[2], { used }) ?? pickFromTier(byTier[3], { used }) ?? null;
  if (t1) used.add(t1.id);

  // tier 2 (rare) : Rare Holo classique, distinct de t1
  const t2 = pickFromTier(byTier[2], { used }) ?? pickFromTier(byTier[1], { used }) ?? pickFromTier(byTier[3], { used }) ?? null;
  if (t2) used.add(t2.id);

  // tier 3 (very rare) : la plus impressionnante, distincte de t1 et t2
  const t3 = pickFromTier(byTier[3], { used }) ?? pickFromTier(byTier[2], { used }) ?? pickFromTier(byTier[1], { used }) ?? null;

  return [t1, t2, t3];
}

function pickFromTier(list, { preferOldSet = false, used = new Set() } = {}) {
  if (!list || list.length === 0) return null;
  const available = list.filter((c) => !used.has(c.id));
  if (available.length === 0) return null;

  if (preferOldSet) {
    // Cherche dans l'ordre chronologique strict.
    for (const setId of OLD_SETS_PRIORITY) {
      const found = available.find((c) => c.set?.id === setId);
      if (found) return found;
    }
  }

  // Fallback : trier par release date (plus ancien d'abord pour t1, plus récent serait pour t3 — mais c'est géré par le tier).
  const sorted = [...available].sort((a, b) => {
    const da = a.set?.releaseDate ?? "";
    const db = b.set?.releaseDate ?? "";
    return da.localeCompare(db);
  });
  return sorted[0];
}

// ─── Génération des attaques ───────────────────────────────────────────────

function deriveAttacks(p) {
  // Format Pokémon TCG Pocket : 1-2 attaques, coûts 1-3 énergies max.
  // Damages basés sur HP cible (ratios calqués sur Pocket) + ajustés par baseAtk/SpAtk
  // pour respecter la "personnalité" du Pokémon (Dracaufeu attaque > Ronflex attaque).
  const attacks = [];

  // Multiplier de force = 1.0 par défaut, ajusté par le niveau d'attaque officiel.
  // baseAtk Gen 1 va de ~5 (Métamorph) à ~134 (Mewtwo offensif). Ratio centré sur 80.
  const power = Math.max(0.7, Math.min(1.4, ((p.baseAtk + p.baseSpAtk) / 2) / 80));

  // Damages cibles en pourcentage du HP cible :
  //  - low (1 énergie)         ≈ 12-18% HP
  //  - mid (2 énergies)        ≈ 25-35% HP
  //  - high (3-4 énergies)     ≈ 45-65% HP
  const low = Math.max(10, Math.round((p.hp * 0.15 * power) / 10) * 10);
  const mid = Math.max(20, Math.round((p.hp * 0.30 * power) / 10) * 10);
  const high = Math.max(30, Math.round((p.hp * 0.55 * power) / 10) * 10);

  if (p.stage === "basic" && p.hp <= 50) {
    // Basic minuscule (Magicarpe, Caterpie, Aspicot…) : 1 attaque simple à 1 énergie
    attacks.push({ name: lowAttackName(p.tcgType), cost: ["colorless"], damage: low });
  } else if (p.stage === "basic") {
    // Basic costaud (Ronflex, Mewtwo, Lippoutou) : 2 attaques
    attacks.push({ name: lowAttackName(p.tcgType), cost: ["colorless"], damage: low });
    attacks.push({
      name: highAttackName(p.tcgType),
      cost: p.hp >= 150 ? [p.tcgType, p.tcgType, "colorless"] : [p.tcgType, "colorless"],
      damage: high,
    });
  } else if (p.stage === "stage1") {
    attacks.push({ name: midAttackName(p.tcgType), cost: ["colorless", "colorless"], damage: mid });
    attacks.push({
      name: highAttackName(p.tcgType),
      cost: [p.tcgType, "colorless", "colorless"],
      damage: high,
    });
  } else {
    // stage2 — gros Pokémon, 1-2 attaques avec un coût élevé
    attacks.push({ name: midAttackName(p.tcgType), cost: [p.tcgType, "colorless"], damage: mid });
    attacks.push({
      name: highAttackName(p.tcgType),
      cost: [p.tcgType, p.tcgType, "colorless"],
      damage: high,
    });
  }

  return attacks;
}

function lowAttackName(type) {
  return {
    fire: "Flammèche",
    water: "Pistolet à O",
    grass: "Fouet Lianes",
    lightning: "Choc Statique",
    psychic: "Confusion",
    fighting: "Coup-Poing",
    colorless: "Charge",
  }[type] ?? "Charge";
}

function midAttackName(type) {
  return {
    fire: "Lance-Flammes",
    water: "Hydrocanon",
    grass: "Tranch'Herbe",
    lightning: "Tonnerre",
    psychic: "Psyko",
    fighting: "Coup d'Karaté",
    colorless: "Coup d'Boule",
  }[type] ?? "Coup d'Boule";
}

function highAttackName(type) {
  return {
    fire: "Feu d'Enfer",
    water: "Vague Déferlante",
    grass: "Soin Mortel",
    lightning: "Tonnerre Massif",
    psychic: "Souffle Psy",
    fighting: "Frappe Tellurique",
    colorless: "Hyper-Frappe",
  }[type] ?? "Hyper-Frappe";
}

// ─── Pipeline principal ────────────────────────────────────────────────────

async function generateForPokemon(id) {
  console.log(`[${id}] fetching…`);
  const p = await loadPokemon(id);
  await sleep(100); // courtoisie envers PokéAPI
  const cards = await loadCards(p.nameEn);
  await sleep(100);
  const [c1, c2, c3] = pickThreeCards(cards);

  const attacks = deriveAttacks(p);

  const baseEntry = {
    pokeapiId: id,
    nameFr: p.nameFr,
    nameEn: p.nameEn,
    type: p.tcgType,
    stage: p.stage,
    evolvesFrom: p.evolvesFrom ?? undefined,
    hp: p.hp,
    weakness: p.weakness,
    retreatCost: p.retreatCost,
    attacks,
  };

  const versions = [
    { rarity: "common", card: c1 },
    { rarity: "rare", card: c2 },
    { rarity: "holo-rare", card: c3 },
  ].map((v) => ({
    id: `g1-${String(id).padStart(3, "0")}-${v.rarity}`,
    rarity: v.rarity,
    image: v.card?.images?.large ?? v.card?.images?.small ?? null,
    sourceCardId: v.card?.id ?? null,
    sourceSet: v.card?.set?.name ?? null,
    sourceRarity: v.card?.rarity ?? null,
    sourceArtist: v.card?.artist ?? null,
  }));

  return { ...baseEntry, versions };
}

async function main() {
  const start = Date.now();
  console.log(`Mode : ${SAMPLE ? "SAMPLE (10 Pokémon)" : "FULL (151 Pokémon)"}`);
  console.log("");

  const results = [];
  for (const id of TARGET_IDS) {
    try {
      const entry = await generateForPokemon(id);
      results.push(entry);
      console.log(`  ✓ #${id} ${entry.nameFr} (${entry.type}, HP ${entry.hp}, ${entry.stage}) — ${entry.versions.filter((v) => v.image).length}/3 visuels`);
    } catch (err) {
      console.error(`  ✗ #${id} échec : ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nTerminé en ${elapsed}s — ${results.length}/${TARGET_IDS.length} Pokémon générés.`);

  if (SAMPLE) {
    const out = path.join(ROOT, "scripts", "pokemon-sample.json");
    await fs.writeFile(out, JSON.stringify(results, null, 2), "utf8");
    console.log(`\nSample écrit dans ${path.relative(ROOT, out)}`);
  } else if (PATCH_IDS) {
    // Mode patch : merge dans pokemon-full.json existant
    const fullPath = path.join(ROOT, "scripts", "pokemon-full.json");
    const existing = JSON.parse(await fs.readFile(fullPath, "utf8"));
    const byId = new Map(existing.map((p) => [p.pokeapiId, p]));
    for (const r of results) byId.set(r.pokeapiId, r);
    const merged = [...byId.values()].sort((a, b) => a.pokeapiId - b.pokeapiId);
    await fs.writeFile(fullPath, JSON.stringify(merged, null, 2), "utf8");
    console.log(`\nPatch mergé dans ${path.relative(ROOT, fullPath)} (${results.length} Pokémon mis à jour).`);
  } else {
    const out = path.join(ROOT, "scripts", "pokemon-full.json");
    await fs.writeFile(out, JSON.stringify(results, null, 2), "utf8");
    console.log(`\nFull écrit dans ${path.relative(ROOT, out)} (le .ts sera émis dans une étape ultérieure)`);
  }
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
