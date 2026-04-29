// Scrape les cartes One Piece TCG en français depuis fr.onepiece-cardgame.com.
// La page rend le HTML côté serveur, donc un simple GET + parsing regex suffit
// (pas besoin de headless browser).
//
// Sets ciblés (Phase 1) : OP-09 + ST-15 à ST-21 — le bloc disponible en
// français au lancement officiel Bandai France 2024-2025.
//
// Sortie : scripts/onepiece-cards-fr.json (consommé ensuite par
// scripts/onepiece-json-to-ts.mjs pour produire shared/tcg-onepiece-base.ts).
//
// Usage :
//   node scripts/generate-onepiece-cards-fr.mjs            → tous les sets
//   node scripts/generate-onepiece-cards-fr.mjs --set=OP-09 → un seul

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Doit rester en sync avec ONEPIECE_SETS dans shared/types.ts.
const SETS = [
  { id: "OP-09", seriesId: 622109, name: "Les Nouveaux Empereurs" },
  { id: "ST-15", seriesId: 622015, name: "Edward Newgate" },
  { id: "ST-16", seriesId: 622016, name: "Uta" },
  { id: "ST-17", seriesId: 622017, name: "Donquixote Doflamingo" },
  { id: "ST-18", seriesId: 622018, name: "Monkey D. Luffy" },
  { id: "ST-19", seriesId: 622019, name: "Smoker" },
  { id: "ST-20", seriesId: 622020, name: "Charlotte Katakuri" },
  { id: "ST-21", seriesId: 622021, name: "Gear 5th" },
];

const args = process.argv.slice(2);
const setArg = args.find((a) => a.startsWith("--set="));
const TARGET_SETS = setArg
  ? SETS.filter((s) => s.id === setArg.slice("--set=".length))
  : SETS;
if (TARGET_SETS.length === 0) {
  console.error(`Set inconnu : ${setArg}`);
  process.exit(1);
}

const BASE = "https://fr.onepiece-cardgame.com";

// ─── Mappings FR → identifiants stables ────────────────────────────────────

const COLOR_MAP = {
  Rouge: "rouge",
  Vert: "vert",
  Bleu: "bleu",
  Violet: "violet",
  Noir: "noir",
  Jaune: "jaune",
};

const ATTRIBUTE_MAP = {
  Frappe: "frappe",
  Tranche: "tranche",
  Distance: "distance",
  Spécial: "special",
  Sagesse: "sagesse",
};

const RARITY_MAP = {
  C: "c",
  UC: "uc",
  R: "r",
  SR: "sr",
  SEC: "sec",
  L: "l",
  P: "p",
  TR: "tr",
  SP: "sp",
  "DON!!": "don",
};

const CATEGORY_MAP = {
  LEADER: "leader",
  PERSONNAGE: "character",
  // Bandai FR utilise pluriel + accents pour la plupart des catégories.
  ÉVÉNEMENTS: "event",
  EVENEMENTS: "event",
  ÉVÉNEMENT: "event",
  EVENT: "event",
  LIEU: "stage", // Bandai FR utilise "LIEU" pour les cartes Stage.
  SCÈNE: "stage",
  SCENE: "stage",
  STAGE: "stage",
  "DON!!": "don",
};

// ─── Helpers ───────────────────────────────────────────────────────────────

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "site-ultime-onepiece-scraper/1.0" },
      });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          await sleep(1500 * (i + 1));
          continue;
        }
        throw new Error(`${url} → HTTP ${res.status}`);
      }
      return await res.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(800 * (i + 1));
    }
  }
}

// Décode les entités HTML les plus fréquentes (pas de DOMParser en Node).
function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

// Extrait le contenu textuel brut d'un fragment HTML : strip toutes les
// balises et compresse les whitespaces.
function stripTags(html) {
  if (!html) return "";
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

// Extrait la valeur après le `<h3>Label</h3>` dans un sous-fragment HTML.
// Ex : `<div class="cost"><h3>Coût</h3>9</div>` → "9".
function extractAfterH3(fragment) {
  const m = fragment.match(/<h3[^>]*>[\s\S]*?<\/h3>([\s\S]*?)$/);
  return stripTags(m ? m[1] : fragment);
}

// Récupère le bloc <div class="X">…</div> dans un block HTML.
// `class` peut être plusieurs, on matche le premier mot.
function findDivByClass(html, className) {
  // On supporte les classes simples uniquement (pas de regex compliquée).
  // ex : <div class="cost"> → match.
  const re = new RegExp(
    `<div[^>]*\\bclass="${className}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</div>`,
    "i",
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function findH3Label(fragment) {
  const m = fragment?.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
  return m ? stripTags(m[1]) : null;
}

// ─── Parsing d'un bloc <dl class="modalCol"> ───────────────────────────────

function parseCard(dlHtml, setId) {
  // <dl class="modalCol" id="OP02-001_p1"> ... </dl>
  const idMatch = dlHtml.match(/<dl class="modalCol"[^>]*id="([^"]+)"/);
  if (!idMatch) return null;
  const id = idMatch[1];
  const cardNumber = id.replace(/_p\d+$/, "");

  // Bloc infoCol : <span>OP02-001</span> | <span>L</span> | <span>LEADER</span>
  const infoCol = findDivByClass(dlHtml, "infoCol");
  const spans = infoCol
    ? [...infoCol.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((m) =>
        stripTags(m[1]),
      )
    : [];
  const rarityRaw = spans[1] ?? "";
  const categoryRaw = spans[2] ?? "";
  // Fallback : Bandai laisse le span de rareté vide pour les alt-arts. Les
  // variantes _p1/_p2 sont officiellement "Special" (SP).
  let rarity = RARITY_MAP[rarityRaw] ?? null;
  if (!rarity && /_p\d+$/.test(id)) rarity = "sp";
  const kind = CATEGORY_MAP[categoryRaw] ?? null;

  // Nom : <div class="cardName">…</div>
  const nameRaw = findDivByClass(dlHtml, "cardName");
  const name = stripTags(nameRaw ?? "");

  // Image : <img class="lazy" data-src="../images/cardlist/card/XXX.webp?…">
  const imgMatch = dlHtml.match(/data-src="([^"]+)"/);
  let image = imgMatch ? imgMatch[1] : "";
  // Strip ../ et cache buster ?…, puis préfixer le host absolu.
  image = image.replace(/^\.\.\//, "/").replace(/\?[^"]*$/, "");
  if (image && !image.startsWith("http")) image = BASE + image;

  // Les classes intérieures (cost/power/color/etc) sont uniques dans le <dl>
  // donc on cherche directement dans le bloc complet — détour par "backCol"
  // évité car la regex lazy s'y arrête au premier </div> imbriqué.

  // Coût ou Vie : <div class="cost"><h3>Coût</h3>9</div> ou <h3>Vie</h3>5
  const costFrag = findDivByClass(dlHtml, "cost");
  const costLabel = findH3Label(costFrag);
  const costValue = extractAfterH3(costFrag ?? "");
  const cost = costLabel === "Coût" ? toNumber(costValue) : null;
  const life = costLabel === "Vie" ? toNumber(costValue) : null;

  // Attribut : <img alt="Frappe"><i>Frappe</i>
  const attrFrag = findDivByClass(dlHtml, "attribute");
  const attrText = attrFrag
    ? stripTags((attrFrag.match(/<i[^>]*>([^<]+)<\/i>/) ?? [, ""])[1])
    : "";
  const attribute = ATTRIBUTE_MAP[attrText] ?? null;

  // Power : "9000" ou "-"
  const powerFrag = findDivByClass(dlHtml, "power");
  const power = toNumber(extractAfterH3(powerFrag ?? ""));

  // Counter : "1000" ou "2000" ou "-"
  const counterFrag = findDivByClass(dlHtml, "counter");
  const counterRaw = extractAfterH3(counterFrag ?? "");
  const counter = counterRaw === "-" || counterRaw === "" ? null : toNumber(counterRaw);

  // Couleur : "Rouge" ou "Rouge/Bleu"
  const colorFrag = findDivByClass(dlHtml, "color");
  const colorRaw = extractAfterH3(colorFrag ?? "");
  const color = colorRaw
    .split("/")
    .map((s) => s.trim())
    .map((s) => COLOR_MAP[s] ?? null)
    .filter(Boolean);

  // Bloc : "1", "2"…
  const blockFrag = findDivByClass(dlHtml, "block");
  const block = toNumber(extractAfterH3(blockFrag ?? "")) ?? 0;

  // Type/Famille : "Quatre Empereurs/Équipage de Barbe Blanche"
  const featureFrag = findDivByClass(dlHtml, "feature");
  const featureRaw = extractAfterH3(featureFrag ?? "");
  const types = featureRaw
    ? featureRaw
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  // Effet (peut contenir un Trigger en préfixe `[Trigger] …`)
  const textFrag = findDivByClass(dlHtml, "text");
  const effectRaw = extractAfterH3(textFrag ?? "");
  // Bandai inclut parfois Trigger dans `<div class="trigger">` séparé. Si
  // présent on l'extrait, sinon on le détecte comme préfixe `[Trigger] …`
  // dans l'effet.
  const triggerFrag = findDivByClass(dlHtml, "trigger");
  let trigger = triggerFrag ? extractAfterH3(triggerFrag) : null;
  let effect = effectRaw || null;
  if (!trigger && effect) {
    const tm = effect.match(/^\s*\[Trigger\]\s*([\s\S]*?)$/i);
    if (tm) {
      trigger = tm[1].trim();
      effect = null;
    }
  }
  if (effect === "-") effect = null;
  if (trigger === "-") trigger = null;

  return {
    id,
    cardNumber,
    name,
    rarity,
    kind,
    image,
    set: setId,
    block,
    cost,
    life,
    power,
    counter,
    attribute,
    color,
    types,
    effect,
    trigger,
  };
}

function toNumber(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (t === "" || t === "-") return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

// ─── Pipeline ──────────────────────────────────────────────────────────────

async function scrapeSet(set) {
  const url = `${BASE}/cardlist/?series=${set.seriesId}`;
  console.log(`[${set.id}] fetching ${url}`);
  const html = await fetchHtml(url);
  const blocks = [
    ...html.matchAll(/<dl class="modalCol"[^>]*>[\s\S]+?<\/dl>/g),
  ].map((m) => m[0]);
  console.log(`  ${blocks.length} <dl> blocks found`);

  const cards = [];
  let parseErrors = 0;
  for (const block of blocks) {
    try {
      const card = parseCard(block, set.id);
      if (!card) {
        parseErrors++;
        continue;
      }
      cards.push(card);
    } catch (err) {
      parseErrors++;
      console.warn(`  ⚠ parse error : ${err.message}`);
    }
  }
  if (parseErrors > 0) {
    console.warn(`  ⚠ ${parseErrors} blocks ignorés (parsing échoué)`);
  }
  return cards;
}

async function main() {
  const start = Date.now();
  const allCards = [];
  const setsLoaded = [];

  for (const set of TARGET_SETS) {
    const cards = await scrapeSet(set);
    setsLoaded.push({ id: set.id, name: set.name, count: cards.length });
    allCards.push(...cards);
    await sleep(500); // courtoisie
  }

  // Dédupe par id (la même carte peut apparaître dans plusieurs sets via
  // réédition). On garde la première occurrence rencontrée.
  const dedup = new Map();
  let dupes = 0;
  for (const c of allCards) {
    if (!dedup.has(c.id)) dedup.set(c.id, c);
    else dupes++;
  }
  const unique = [...dedup.values()];

  // Tri stable : par cardNumber alphabétique (regroupe par set d'origine)
  // puis suffixe variante (la version normale avant les _p1).
  unique.sort((a, b) => {
    if (a.cardNumber !== b.cardNumber)
      return a.cardNumber.localeCompare(b.cardNumber);
    return a.id.localeCompare(b.id);
  });

  // Stats par catégorie
  const byKind = unique.reduce((acc, c) => {
    acc[c.kind ?? "unknown"] = (acc[c.kind ?? "unknown"] ?? 0) + 1;
    return acc;
  }, {});

  const out = path.join(ROOT, "scripts", "onepiece-cards-fr.json");
  await fs.writeFile(
    out,
    JSON.stringify({ sets: setsLoaded, cards: unique }, null, 2),
    "utf8",
  );

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `\n✓ ${path.relative(ROOT, out)} écrit : ${unique.length} cartes uniques (${dupes} doublons mergés) en ${elapsed}s`,
  );
  console.log(`  Catégories :`, byKind);
  console.log(`  Sets :`, setsLoaded);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
