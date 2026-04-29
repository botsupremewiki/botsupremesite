// Lit scripts/runeterra-set1-fr.json (récupéré par runeterra-fetch.mjs)
// et produit shared/tcg-runeterra-base.ts au format RuneterraCardData.
//
// Usage : node scripts/runeterra-json-to-ts.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const INPUT = path.join(ROOT, "scripts", "runeterra-set1-fr.json");
const OUTPUT = path.join(ROOT, "shared", "tcg-runeterra-base.ts");

// Régions Set 1 = 6 régions de base. Les autres (Bilgewater, Targon,
// Shurima, Bandle, Runeterra, etc.) arrivent dans les sets ultérieurs.
const REGION_ORDER = [
  "Demacia",
  "Freljord",
  "Ionia",
  "Noxus",
  "PiltoverZaun",
  "ShadowIsles",
];

// FR localisé → ref anglais stable pour le moteur.
const TYPE_MAP = {
  "Unité": "Unit",
  "Sort": "Spell",
  "Site": "Landmark",
  "Capacité": "Ability",
  "Compétence": "Ability",
  "Équipement": "Equipment",
  "Piège": "Trap",
};

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

// http://dd.b.pvp.net/7_4_0/... → https://dd.b.pvp.net/latest/...
// "latest" est plus stable et évite que le TS embarque la version courante.
function normalizeImageUrl(url) {
  if (!url) return undefined;
  return url.replace(
    /^http:\/\/dd\.b\.pvp\.net\/[^/]+\//,
    "https://dd.b.pvp.net/latest/",
  );
}

function buildCard(c) {
  const typeRef = TYPE_MAP[c.type] ?? c.type;
  const supertype = c.supertype === "Champion" ? "Champion" : "None";

  const obj = {
    cardCode: c.cardCode,
    name: c.name,
    description: c.description ?? "",
    descriptionRaw: c.descriptionRaw ?? "",
  };
  if (c.levelupDescriptionRaw) {
    obj.levelupDescription = c.levelupDescription;
    obj.levelupDescriptionRaw = c.levelupDescriptionRaw;
  }
  if (c.flavorText) obj.flavorText = c.flavorText;
  if (c.artistName) obj.artistName = c.artistName;
  obj.cost = c.cost ?? 0;
  // Pour les unités on garde toujours attack/health (même si 0). Pour le
  // reste (sorts, sites…), on les omet sauf si non-zéro pour économiser
  // de la place dans le TS généré.
  if (typeRef === "Unit" || (typeof c.attack === "number" && c.attack > 0)) {
    obj.attack = c.attack ?? 0;
  }
  if (typeRef === "Unit" || (typeof c.health === "number" && c.health > 0)) {
    obj.health = c.health ?? 0;
  }
  obj.type = typeRef;
  obj.supertype = supertype;
  obj.rarity = c.rarityRef ?? "None";
  if (c.spellSpeedRef) obj.spellSpeed = c.spellSpeedRef;
  obj.regions = c.regionRefs ?? [];
  if (c.keywords && c.keywords.length > 0) obj.keywords = c.keywords;
  if (c.keywordRefs && c.keywordRefs.length > 0) obj.keywordRefs = c.keywordRefs;
  if (c.subtypes && c.subtypes.length > 0) obj.subtypes = c.subtypes;
  if (c.associatedCardRefs && c.associatedCardRefs.length > 0) {
    obj.associatedCardRefs = c.associatedCardRefs;
  }
  obj.collectible = !!c.collectible;
  obj.set = c.set;
  // gameAbsolutePath = carte avec cadre + texte (standard pour deck builder
  // / collection). fullAbsolutePath = illustration sans cadre, gardée à part
  // pour les zooms/splash.
  const img = normalizeImageUrl(c.assets?.[0]?.gameAbsolutePath);
  if (img) obj.image = img;
  const fullArt = normalizeImageUrl(c.assets?.[0]?.fullAbsolutePath);
  if (fullArt && fullArt !== img) obj.fullArt = fullArt;
  return obj;
}

async function main() {
  const raw = await fs.readFile(INPUT, "utf8");
  const data = JSON.parse(raw);
  console.log(`Loaded ${data.length} entrées depuis ${path.basename(INPUT)}`);

  // Filtrer : seulement Set 1.
  const set1 = data.filter((c) => c.set === "Set1");
  const collectible = set1.filter((c) => c.collectible).length;
  console.log(`  Set 1 strict : ${set1.length} cartes (${collectible} collectibles, ${set1.length - collectible} tokens/niveaux/summons)`);

  // Audit des types/régions/raretés inattendus.
  const types = new Set(set1.map((c) => c.type));
  const unmapped = [...types].filter((t) => !(t in TYPE_MAP));
  if (unmapped.length > 0) {
    console.warn(`  ⚠ Types inconnus (passés tels quels) : ${unmapped.join(", ")}`);
  }
  const regionsSeen = new Set(set1.flatMap((c) => c.regionRefs ?? []));
  const offSetRegions = [...regionsSeen].filter(
    (r) => !REGION_ORDER.includes(r),
  );
  if (offSetRegions.length > 0) {
    // Cas attendu : Riot a rétroactivement migré certaines cartes (Yordle
    // etc.) vers des régions ajoutées dans les sets ultérieurs (notamment
    // BandleCity). Ces cartes restent dual-région avec leur région Set 1
    // d'origine — pas besoin d'agir.
    console.log(
      `  ℹ Régions hors Set 1 (cartes dual-région migrées rétroactivement) : ${offSetRegions.join(", ")}`,
    );
  }
  console.log(`  Types : ${[...types].join(", ")}`);
  console.log(`  Régions : ${[...regionsSeen].sort().join(", ")}`);

  // Région "primaire" pour le tri/sectionnage : on choisit la première
  // région du card qui figure dans REGION_ORDER (les régions hors Set 1
  // sont ignorées). Pour Teemo dual-région PiltoverZaun+BandleCity, on
  // veut le voir trié sous PiltoverZaun.
  function primaryRegion(c) {
    const refs = c.regionRefs ?? [];
    for (const r of refs) {
      if (REGION_ORDER.includes(r)) return r;
    }
    return refs[0] ?? "ZZZ";
  }

  // Tri : collectibles d'abord (regroupés par région dans l'ordre canonique),
  // puis non-collectibles. Au sein d'une région : champions d'abord, puis
  // par coût, puis par cardCode.
  set1.sort((a, b) => {
    if (a.collectible !== b.collectible) return a.collectible ? -1 : 1;
    const aReg = primaryRegion(a);
    const bReg = primaryRegion(b);
    const aIdx = REGION_ORDER.indexOf(aReg);
    const bIdx = REGION_ORDER.indexOf(bReg);
    const aRank = aIdx === -1 ? 999 : aIdx;
    const bRank = bIdx === -1 ? 999 : bIdx;
    if (aRank !== bRank) return aRank - bRank;
    const aChamp = a.supertype === "Champion" ? 0 : 1;
    const bChamp = b.supertype === "Champion" ? 0 : 1;
    if (aChamp !== bChamp) return aChamp - bChamp;
    if ((a.cost ?? 0) !== (b.cost ?? 0)) return (a.cost ?? 0) - (b.cost ?? 0);
    return a.cardCode.localeCompare(b.cardCode);
  });

  const lines = [];
  lines.push(`// Legends of Runeterra — Set 1 « Fondations » (Foundations).`);
  lines.push(`// Cartes en français depuis le data feed officiel Riot (dd.b.pvp.net).`);
  lines.push(`// Généré par scripts/runeterra-json-to-ts.mjs — ne pas éditer à la main.`);
  lines.push("");
  lines.push('import type { RuneterraCardData } from "./types";');
  lines.push("");
  lines.push("const RUNETERRA_SET1: RuneterraCardData[] = [");

  let lastSection = null;
  for (const c of set1) {
    const refs = c.regionRefs ?? [];
    const region = refs.find((r) => REGION_ORDER.includes(r)) ?? refs[0] ?? "Inconnu";
    const section = c.collectible
      ? `Collectibles — ${region}`
      : "Non-collectibles (tokens, niveaux, invocations)";
    if (section !== lastSection) {
      if (lastSection !== null) lines.push("");
      lines.push(`  // ─── ${section} ───`);
      lastSection = section;
    }
    lines.push(`  ${tsValue(buildCard(c))},`);
  }

  lines.push("];");
  lines.push("");
  lines.push("export const RUNETERRA_BASE_SET: RuneterraCardData[] = RUNETERRA_SET1;");
  lines.push("");
  lines.push(
    "export const RUNETERRA_BASE_SET_BY_CODE: Map<string, RuneterraCardData> = new Map(",
  );
  lines.push("  RUNETERRA_SET1.map((c) => [c.cardCode, c]),");
  lines.push(");");
  lines.push("");

  await fs.writeFile(OUTPUT, lines.join("\n"), "utf8");
  console.log(
    `\n✓ ${path.relative(ROOT, OUTPUT)} écrit (${set1.length} cartes).`,
  );
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
