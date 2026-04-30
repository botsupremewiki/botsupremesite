// Génération de decks bot variés One Piece TCG.
//
// Au lieu de toujours mirror le deck humain, le bot peut piocher un
// Leader + 50 cartes random parmi celles dispos en respectant les
// contraintes officielles :
//   • 1 Leader (parmi tous les Leaders du base set)
//   • 50 cartes (Persos / Évents / Lieux)
//   • Toutes les cartes partagent ≥1 couleur avec le Leader
//   • Max 4 copies par cardNumber

import { ONEPIECE_BASE_SET } from "../../../shared/tcg-onepiece-base";
import type { OnePieceCardData } from "../../../shared/types";

export type BotDeckResult = {
  leaderId: string;
  cards: { card_id: string; count: number }[];
};

/** Renvoie tous les Leaders disponibles dans le base set (incluant
 *  variants alt-art). */
function listLeaders(): OnePieceCardData[] {
  return ONEPIECE_BASE_SET.filter((c) => c.kind === "leader");
}

/** Tire un Leader random parmi ceux du base set. */
export function pickRandomLeader(): OnePieceCardData {
  const leaders = listLeaders();
  return leaders[Math.floor(Math.random() * leaders.length)];
}

/** Génère un deck bot de 50 cartes valides pour un Leader donné.
 *  Stratégie : pioche 50 cartes random matchant ≥1 couleur du Leader,
 *  en respectant max 4 copies par cardNumber, en garantissant au moins
 *  des Persos jouables (fallback : remplit avec n'importe quoi si pas
 *  assez de pool). */
export function generateBotDeck(leader: OnePieceCardData): BotDeckResult {
  if (leader.kind !== "leader") {
    throw new Error(`Pas un leader : ${leader.id}`);
  }
  const leaderColors = new Set(leader.color);
  // Pool : toutes les cartes non-leader qui partagent ≥1 couleur, et qui
  // ne sont pas des DON (pas dans le deck principal).
  const pool = ONEPIECE_BASE_SET.filter((c) => {
    if (c.kind === "leader" || c.kind === "don") return false;
    return c.color.some((color) => leaderColors.has(color));
  });
  // Si pool insuffisante (rare), on étend à toutes les cartes non-leader.
  const finalPool =
    pool.length >= 15
      ? pool
      : ONEPIECE_BASE_SET.filter(
          (c) => c.kind !== "leader" && c.kind !== "don",
        );

  // Compteurs de doublons par cardNumber.
  const counts = new Map<string, number>();
  const result: { card_id: string; count: number }[] = [];

  let attempts = 0;
  while (result.length < 50 && attempts < 5000) {
    attempts++;
    const c = finalPool[Math.floor(Math.random() * finalPool.length)];
    const cur = counts.get(c.cardNumber) ?? 0;
    if (cur >= 4) continue;
    // Cherche si la cardId est déjà dans le deck pour incrémenter le count.
    const existing = result.find((r) => r.card_id === c.id);
    if (existing) {
      // On ne pousse pas le count au-delà de la limite cardNumber globale.
      if (cur < 4) {
        existing.count++;
        counts.set(c.cardNumber, cur + 1);
      }
    } else {
      result.push({ card_id: c.id, count: 1 });
      counts.set(c.cardNumber, cur + 1);
    }
  }

  // Sanity : si on n'a pas atteint 50 (pool très étroit), on rembourse
  // avec des doublons jusqu'à hitter 50.
  let total = result.reduce((n, r) => n + r.count, 0);
  let safety = 0;
  while (total < 50 && safety++ < 100) {
    for (const r of result) {
      const meta = ONEPIECE_BASE_SET.find((c) => c.id === r.card_id);
      if (!meta) continue;
      const cur = counts.get(meta.cardNumber) ?? 0;
      if (cur < 4) {
        r.count++;
        counts.set(meta.cardNumber, cur + 1);
        total++;
        if (total >= 50) break;
      }
    }
  }

  return { leaderId: leader.id, cards: result };
}

/** Helper : tire un Leader random ET génère un deck pour lui. */
export function generateRandomBotDeck(): BotDeckResult {
  const leader = pickRandomLeader();
  return generateBotDeck(leader);
}
