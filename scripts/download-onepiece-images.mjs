// Télécharge toutes les images des cartes One Piece scrapées dans
// web/public/onepiece-cards/. Les serveurs Bandai bloquent les hotlinks
// cross-origin (browser CORS error), donc on doit héberger les images
// localement et les servir depuis Vercel public/.
//
// Lit scripts/onepiece-cards-fr.json (généré par generate-onepiece-cards-fr.mjs).
// Saute les images déjà présentes (re-runnable, idempotent).
//
// Usage :
//   node scripts/download-onepiece-images.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "scripts", "onepiece-cards-fr.json");
const OUTDIR = path.join(ROOT, "web", "public", "onepiece-cards");

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function downloadOne(url, out) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; site-ultime-onepiece/1.0) AppleWebKit/537.36",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(out, buf);
  return buf.length;
}

async function main() {
  const start = Date.now();
  const raw = await fs.readFile(INPUT, "utf8");
  const data = JSON.parse(raw);
  await fs.mkdir(OUTDIR, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let totalBytes = 0;

  for (let i = 0; i < data.cards.length; i++) {
    const card = data.cards[i];
    if (!card.image) {
      failed++;
      continue;
    }
    // Nom de fichier : conserver le suffixe alt-art (_p1/_p2) et l'extension.
    const filename = `${card.id}.webp`;
    const out = path.join(OUTDIR, filename);
    try {
      await fs.access(out);
      skipped++;
      continue;
    } catch {
      // pas encore téléchargé
    }
    try {
      const bytes = await downloadOne(card.image, out);
      totalBytes += bytes;
      downloaded++;
      if (downloaded % 20 === 0) {
        console.log(
          `  [${i + 1}/${data.cards.length}] ${downloaded} téléchargées, ${skipped} déjà présentes…`,
        );
      }
      await sleep(80); // courtoisie envers le CDN Bandai
    } catch (err) {
      failed++;
      console.warn(`  ✗ ${card.id} : ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `\n✓ ${downloaded} images téléchargées (${(totalBytes / 1024 / 1024).toFixed(1)} MB) en ${elapsed}s`,
  );
  if (skipped > 0) console.log(`  ${skipped} déjà présentes (sautées)`);
  if (failed > 0) console.log(`  ⚠ ${failed} échecs`);
  console.log(`\nDossier : ${path.relative(ROOT, OUTDIR)}`);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
