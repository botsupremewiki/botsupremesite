// Moteur d'effets One Piece TCG — extensible par `cardNumber`.
//
// Architecture :
//   • Les hooks (on-play / on-attack / on-ko / etc.) sont déclenchés
//     depuis battle-onepiece.ts aux moments-clés.
//   • Pour chaque hook, on cherche un handler dans CARD_HANDLERS par
//     `cardNumber` (sans suffixe alt-art). Si présent, il est exécuté
//     et peut muter l'état du combat.
//   • Les effets restent descriptifs sur la carte tant qu'aucun handler
//     n'est ajouté — le moteur ne fait alors rien (cohérent avec l'état
//     actuel, pas de régression).
//
// Pour ajouter un effet :
//   1. Trouver la carte dans shared/tcg-onepiece-base.ts
//   2. Ajouter une entrée à CARD_HANDLERS avec son cardNumber
//   3. Le handler reçoit un EffectContext qui donne accès à l'état complet
//      du combat et aux fonctions utilitaires (drawCards, discardCard, etc.).
//
// Effets nécessitant un choix du joueur (cible KO, perso à booster…) :
//   le handler peut ouvrir un PendingChoice côté state pour bloquer la
//   résolution jusqu'à la réponse du joueur (Phase 5 — pas encore câblé,
//   les handlers actuels sont 100% auto-résolus).

import type {
  OnePieceBattleSeatId,
  OnePieceBattleCardInPlay,
} from "../../../shared/types";
import { ONEPIECE_BASE_SET_BY_ID } from "../../../shared/tcg-onepiece-base";

export type EffectHook =
  | "on-play" // Personnage / Évent / Lieu joué depuis la main
  | "on-attack" // Cette carte attaque
  | "on-ko" // Cette carte est mise KO
  | "on-trigger-revealed" // Vie révélée avec [Déclenchement]
  | "on-turn-start" // Refresh phase de son owner
  | "on-turn-end"; // End phase de son owner

/** Référence vers une carte sur le board ou en main. */
export type CardRef =
  | { kind: "leader"; seat: OnePieceBattleSeatId }
  | { kind: "character"; seat: OnePieceBattleSeatId; uid: string }
  | { kind: "stage"; seat: OnePieceBattleSeatId };

/** Accès aux mutations courantes — implémenté par le BattleServer.
 *  L'effet reçoit cet objet pour appliquer ses changements sans toucher
 *  directement aux structures internes. */
export interface BattleEffectAccess {
  /** Pioche N cartes pour le seat donné (clamp au deck restant). */
  drawCards(seat: OnePieceBattleSeatId, count: number): void;

  /** Défausse N cartes choisies aléatoirement de la main du seat (pour
   *  les effets auto sans input joueur). */
  discardRandom(seat: OnePieceBattleSeatId, count: number): void;

  /** Donne N DON!! actives au seat depuis le DON deck. */
  giveDonFromDeck(seat: OnePieceBattleSeatId, count: number): void;

  /** Ajoute un boost de puissance temporaire (jusqu'à fin de tour) à une
   *  carte sur le board (Leader ou Persos). */
  addPowerBuff(ref: CardRef, amount: number): void;

  /** Pousse une ligne dans le journal du combat. */
  log(line: string): void;

  /** Lit l'état d'un seat (read-only). */
  getSeat(seat: OnePieceBattleSeatId): {
    leaderId: string | null;
    leaderRested: boolean;
    leaderAttachedDon: number;
    characters: ReadonlyArray<OnePieceBattleCardInPlay>;
    handSize: number;
    deckSize: number;
    lifeCount: number;
    discardSize: number;
    donActive: number;
  } | null;
}

export type EffectContext = {
  hook: EffectHook;
  /** uid de la carte source ("leader" pour le Leader, sinon uid Persos). */
  sourceUid: string;
  sourceSeat: OnePieceBattleSeatId;
  /** Accès à l'état + mutations. */
  battle: BattleEffectAccess;
};

export type CardEffectHandler = (ctx: EffectContext) => void;

// ─── Registre des handlers par cardNumber ─────────────────────────────────
// Note : on indexe par `cardNumber` (sans suffixe `_p1`/`_p2`) — toutes les
// variantes alt-art d'une même carte partagent l'effet.

export const CARD_HANDLERS: Record<string, CardEffectHandler> = {
  // ─── OP-09 ───

  /** OP09-110 Pierre (Pierre Hugin/Munin)
   *  [Jouée] Piochez 2 cartes et défaussez 2 cartes de votre main. */
  "OP09-110": (ctx) => {
    if (ctx.hook !== "on-play") return;
    ctx.battle.drawCards(ctx.sourceSeat, 2);
    ctx.battle.discardRandom(ctx.sourceSeat, 2);
    ctx.battle.log("Pierre : pioche 2 et défausse 2.");
  },

  /** OP09-047 Oden Kozuki
   *  [Double attaque] (déjà géré par hasKeyword)
   *  [En cas de KO] Piochez 2 cartes et défaussez 1 carte de votre main. */
  "OP09-047": (ctx) => {
    if (ctx.hook !== "on-ko") return;
    ctx.battle.drawCards(ctx.sourceSeat, 2);
    ctx.battle.discardRandom(ctx.sourceSeat, 1);
    ctx.battle.log("Oden : pioche 2 et défausse 1 (effet KO).");
  },

  /** OP09-010 Bonk Punch
   *  [Jouée] Jouez jusqu'à 1 [Monster] (descriptif, nécessite input)
   *  [DON!! x1] [En attaquant] Ce Personnage gagne +2000 de puissance pour
   *  tout le tour. — implémenté seulement si DON >= 1 attachée. */
  "OP09-010": (ctx) => {
    if (ctx.hook !== "on-attack") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    if (!seat) return;
    const c = seat.characters.find((c) => c.uid === ctx.sourceUid);
    if (!c || c.attachedDon < 1) return;
    ctx.battle.addPowerBuff(
      { kind: "character", seat: ctx.sourceSeat, uid: ctx.sourceUid },
      2000,
    );
    ctx.battle.log("Bonk Punch : +2000 puissance ce tour ([DON!! x1]).");
  },

  // ─── ST-15 (Edward Newgate) ───

  /** ST15-002 Marco
   *  [Bloqueur] (déjà géré par hasKeyword)
   *  [Tour adverse] Si vous avez 4 cartes ou moins dans votre Vie, ce
   *  Personnage gagne +2000 de puissance. — Effet passif détecté à la
   *  vérification du power, pas exécuté ici. */
  // (placeholder pour montrer le pattern d'effet passif)

  // ─── Plus d'effets à venir au fil des sessions ───
  // Ajouter ici les handlers pour les cartes les plus jouées.
};

/** Récupère le cardNumber depuis un cardId (avec ou sans suffixe variante). */
export function cardNumberOf(cardId: string): string {
  return cardId.replace(/_p\d+$/, "");
}

/** Tente d'exécuter le handler d'effet pour une carte sur un hook donné.
 *  Retourne true si un handler a été exécuté, false sinon. */
export function fireCardEffect(
  cardId: string,
  ctx: EffectContext,
): boolean {
  const meta = ONEPIECE_BASE_SET_BY_ID.get(cardId);
  if (!meta) return false;
  const handler = CARD_HANDLERS[meta.cardNumber];
  if (!handler) return false;
  try {
    handler(ctx);
    return true;
  } catch (err) {
    console.warn(`[op-effect] handler ${meta.cardNumber} threw:`, err);
    return false;
  }
}
