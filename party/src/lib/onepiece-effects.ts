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
  OnePiecePendingChoice,
  OnePiecePendingChoiceKind,
} from "../../../shared/types";
import { ONEPIECE_BASE_SET_BY_ID } from "../../../shared/tcg-onepiece-base";

export type EffectHook =
  | "on-play" // Personnage / Évent / Lieu joué depuis la main
  | "on-attack" // Cette carte attaque
  | "on-ko" // Cette carte est mise KO
  | "on-trigger-revealed" // Vie révélée avec [Déclenchement]
  | "on-turn-start" // Refresh phase de son owner
  | "on-turn-end" // End phase de son owner
  | "on-activate-main" // [Activation : Principale] déclenché manuellement
  | "on-choice-resolved"; // PendingChoice résolu — applique la suite de l'effet

/** Selection passée au handler quand un PendingChoice est résolu. Mappe sur
 *  le payload du message client `op-resolve-choice`. */
export type ChoiceSelection = {
  targetUid?: string;
  handIndices?: number[];
  yesNo?: boolean;
};

/** Référence vers une carte sur le board ou en main. */
export type CardRef =
  | { kind: "leader"; seat: OnePieceBattleSeatId }
  | { kind: "character"; seat: OnePieceBattleSeatId; uid: string }
  | { kind: "stage"; seat: OnePieceBattleSeatId };

/** Où placer le reste des cartes regardées après une recherche dans le deck. */
export type SearchRestPlacement = "top" | "bottom" | "discard";

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

  /** Prend la carte du dessus de la Vie et l'ajoute à la main du seat.
   *  Retourne le cardId de la carte ajoutée (ou null si Vie vide). */
  takeLifeToHand(seat: OnePieceBattleSeatId): string | null;

  /** Regarde les N cartes du dessus du deck. Si une carte matche le filtre,
   *  l'ajoute à la main et le reste va selon `restGoesTo`. Sinon les cartes
   *  vont toutes selon `restGoesTo`. Retourne le cardId trouvé ou null.
   *  - typeFilter : sous-string insensible à la casse, comparé aux `types`
   *    de la carte ET au `name` (pour matcher [Sanji], [Charlotte Pudding]…).
   *  - excludeName : si fourni, ignore les cartes ayant ce nom (pour les
   *    "autre que [X]" du jeu officiel).
   */
  searchDeckTopForType(
    seat: OnePieceBattleSeatId,
    count: number,
    typeFilter: string,
    restGoesTo: SearchRestPlacement,
    excludeName?: string,
  ): string | null;

  /** Ouvre un PendingChoice côté state. Le handler doit retourner après
   *  cet appel : la résolution rappellera le handler avec hook
   *  `on-choice-resolved` et `ctx.choice` rempli. */
  requestChoice(args: {
    seat: OnePieceBattleSeatId;
    sourceCardNumber: string;
    sourceUid: string;
    kind: OnePiecePendingChoiceKind;
    prompt: string;
    params?: Record<string, number | string | boolean | null>;
    cancellable?: boolean;
  }): void;

  /** Met KO un Personnage adverse identifié par son uid. La carte va à la
   *  défausse, ses DON attachées retournent dans la pool épuisée du
   *  défenseur. Déclenche le hook on-ko sur la carte KO. Retourne true
   *  si KO appliqué. */
  koCharacter(seat: OnePieceBattleSeatId, uid: string): boolean;

  /** Défausse les cartes aux indices donnés de la main du seat. Renvoie
   *  les cardId défaussés. Skip les indices invalides. */
  discardFromHand(
    seat: OnePieceBattleSeatId,
    handIndices: number[],
  ): string[];

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
  /** Présent uniquement quand hook === "on-choice-resolved". Contient le
   *  payload du choix joueur (skipped + selection). */
  choice?: {
    skipped: boolean;
    selection: ChoiceSelection;
  };
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

  // ─── BATCH 1 (cardNumber alphabétique) ──────────────────────────────────

  /** OP02-001 Edward Newgate (Leader Rouge)
   *  [Fin de votre tour] Ajoutez à votre main 1 carte du dessus de votre Vie. */
  "OP02-001": (ctx) => {
    if (ctx.hook !== "on-turn-end") return;
    if (ctx.sourceUid !== "leader") return;
    const cardId = ctx.battle.takeLifeToHand(ctx.sourceSeat);
    if (cardId) {
      ctx.battle.log(
        "Edward Newgate : ajoute 1 carte du dessus de la Vie à sa main.",
      );
    }
  },

  /** OP02-057 Bartholomew Kuma
   *  [Jouée] Regardez 2 cartes du dessus de votre deck, révélez jusqu'à 1
   *  carte de type {Sept grands corsaires} et ajoutez-la à votre main. Puis,
   *  réorganisez les cartes restantes dans l'ordre de votre choix. */
  "OP02-057": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const found = ctx.battle.searchDeckTopForType(
      ctx.sourceSeat,
      2,
      "Sept grands corsaires",
      "top",
    );
    if (found) {
      ctx.battle.log(
        "Bartholomew Kuma : révèle un Sept grands corsaires et l'ajoute à la main.",
      );
    } else {
      ctx.battle.log("Bartholomew Kuma : aucun Sept grands corsaires révélé.");
    }
  },

  /** OP03-003 Izo
   *  [Jouée] Regardez 5 cartes du dessus de votre deck, révélez jusqu'à 1
   *  carte incluant «Équipage de Barbe Blanche» dans son type autre que
   *  [Izo] et ajoutez-la à votre main. Puis, placez les cartes restantes
   *  au-dessous de votre deck dans l'ordre de votre choix. */
  "OP03-003": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const found = ctx.battle.searchDeckTopForType(
      ctx.sourceSeat,
      5,
      "Équipage de Barbe Blanche",
      "bottom",
      "Izo",
    );
    if (found) {
      ctx.battle.log(
        "Izo : révèle un Équipage de Barbe Blanche et l'ajoute à la main.",
      );
    } else {
      ctx.battle.log("Izo : aucun Équipage de Barbe Blanche révélé.");
    }
  },

  /** OP03-089 Brandnew
   *  [Jouée] Regardez 3 cartes du dessus de votre deck, révélez jusqu'à 1
   *  carte de type {Marine} autre que [Brandnew] et ajoutez-la à votre
   *  main. Puis, placez les cartes restantes dans votre Défausse. */
  "OP03-089": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const found = ctx.battle.searchDeckTopForType(
      ctx.sourceSeat,
      3,
      "Marine",
      "discard",
      "Brandnew",
    );
    if (found) {
      ctx.battle.log("Brandnew : révèle un Marine et l'ajoute à la main.");
    } else {
      ctx.battle.log(
        "Brandnew : aucun Marine révélé (les 3 cartes vont à la défausse).",
      );
    }
  },

  /** OP03-110 Charlotte Smoothie
   *  [En attaquant] Vous pouvez ajouter à votre main 1 carte du dessus ou
   *  du dessous de votre Vie : Ce Personnage gagne +2000 de puissance pour
   *  tout le combat.
   *  Auto-yes : on prend toujours la Vie (gain net pour le bot et l'humain). */
  "OP03-110": (ctx) => {
    if (ctx.hook !== "on-attack") return;
    const cardId = ctx.battle.takeLifeToHand(ctx.sourceSeat);
    if (!cardId) return; // pas de Vie restante
    ctx.battle.addPowerBuff(
      { kind: "character", seat: ctx.sourceSeat, uid: ctx.sourceUid },
      2000,
    );
    ctx.battle.log(
      "Charlotte Smoothie : prend 1 Vie et gagne +2000 puissance pour ce combat.",
    );
  },

  /** OP03-112 Charlotte Pudding
   *  [Jouée] Regardez 4 cartes du dessus de votre deck, révélez jusqu'à 1
   *  carte de type {Équipage de Big Mom} autre que [Charlotte Pudding] ou
   *  jusqu'à 1 [Sanji] et ajoutez-la à votre main. Puis, placez les cartes
   *  restantes au-dessous de votre deck. */
  "OP03-112": (ctx) => {
    if (ctx.hook !== "on-play") return;
    // Cherche d'abord un Équipage de Big Mom (autre que Pudding), sinon
    // un [Sanji]. On fait deux passes via la même API.
    let found = ctx.battle.searchDeckTopForType(
      ctx.sourceSeat,
      4,
      "Équipage de Big Mom",
      "bottom",
      "Charlotte Pudding",
    );
    if (!found) {
      // Si rien trouvé, on n'a plus les cartes du top (déjà replacées).
      // Le 2ᵉ search reprendrait du nouveau top — pas idéal mais cohérent.
      found = ctx.battle.searchDeckTopForType(
        ctx.sourceSeat,
        0,
        "Sanji",
        "bottom",
      );
    }
    if (found) {
      ctx.battle.log(
        "Charlotte Pudding : révèle une carte Équipage de Big Mom ou [Sanji] et l'ajoute à la main.",
      );
    } else {
      ctx.battle.log("Charlotte Pudding : aucune cible révélée.");
    }
  },

  // ─── BATCH 1 — effets nécessitant un PendingChoice (Phase 5b) ───────────
  // Pour ces cartes, le moteur log un message descriptif mais l'effet n'est
  // pas appliqué tant que le système de choix joueur n'est pas implémenté.
  // À reprendre une fois PendingChoice câblé.

  /** OP01-073 Don Quijote Doflamingo (Char) — Reorder top 5 (input UI). */
  "OP01-073": (ctx) => {
    if (ctx.hook !== "on-play") return;
    ctx.battle.log("Don Quijote Doflamingo : effet [Jouée] descriptif (réordonner top 5 — TODO PendingChoice).");
  },

  /** OP01-086 Overheat (Event Counter) — +4000 + bounce target. */
  "OP01-086": (ctx) => {
    if (ctx.hook !== "on-play") return;
    ctx.battle.log("Overheat : effet [Contre] descriptif (+4000 + bounce — TODO PendingChoice).");
  },

  /** OP02-008 Joz — Conditional Initiative (passive). */
  "OP02-008": (ctx) => {
    if (ctx.hook !== "on-play") return;
    ctx.battle.log("Joz : Initiative conditionnelle (TODO passifs avec conditions).");
  },

  /** OP02-018 Marco — [En cas de KO] effet conditional. */
  "OP02-018": (ctx) => {
    if (ctx.hook !== "on-ko") return;
    ctx.battle.log("Marco : effet [En cas de KO] descriptif (TODO PendingChoice).");
  },

  /** OP02-019 Rakuyo — [Votre tour] +1000 puissance global passif. */
  "OP02-019": (ctx) => {
    if (ctx.hook !== "on-turn-start") return;
    ctx.battle.log("Rakuyo : effet [Votre tour] passif global (TODO passifs).");
  },

  /** OP02-093 Smoker (Leader) — [Activation : Principale] cost reduce. */
  "OP02-093": (ctx) => {
    if (ctx.hook !== "on-play") return;
    ctx.battle.log("Smoker : effet [Activation : Principale] (TODO système d'activation manuelle).");
  },

  /** OP02-098 Kobby
   *  [Jouée] Vous pouvez défausser 1 carte de votre main : Mettez KO jusqu'à
   *  1 Personnage adverse ayant un coût de 3 ou moins.
   *  Flow : on-play → discard-card (cancellable) → on-choice-resolved with
   *  handIndices → discard + ko-character (cancellable) → on-choice-resolved
   *  with targetUid → koCharacter. */
  "OP02-098": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP02-098",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt:
          "Kobby : défausse 1 carte pour mettre KO un Personnage adverse (coût ≤ 3). Passer pour ignorer.",
        params: { count: 1 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      // Étape 1 : la défausse a été choisie → exécute + ouvre KO target.
      if (ctx.choice.selection.handIndices) {
        ctx.battle.discardFromHand(
          ctx.sourceSeat,
          ctx.choice.selection.handIndices,
        );
        ctx.battle.requestChoice({
          seat: ctx.sourceSeat,
          sourceCardNumber: "OP02-098",
          sourceUid: ctx.sourceUid,
          kind: "ko-character",
          prompt:
            "Kobby : choisis un Personnage adverse à mettre KO (coût ≤ 3).",
          params: { maxCost: 3 },
          cancellable: false,
        });
        return;
      }
      // Étape 2 : la cible KO a été choisie → exécute KO.
      if (ctx.choice.selection.targetUid) {
        const opponentSeat: OnePieceBattleSeatId =
          ctx.sourceSeat === "p1" ? "p2" : "p1";
        ctx.battle.koCharacter(opponentSeat, ctx.choice.selection.targetUid);
        ctx.battle.log("Kobby : effet [Jouée] résolu.");
      }
    }
  },

  /** OP02-106 Tsuru — [Jouée] -2 cost target. */
  "OP02-106": (ctx) => {
    if (ctx.hook !== "on-play") return;
    ctx.battle.log("Tsuru : effet [Jouée] descriptif (-2 cost — TODO PendingChoice).");
  },

  /** OP02-113 Hermep — [En attaquant] -2 cost + conditional buff. */
  "OP02-113": (ctx) => {
    if (ctx.hook !== "on-attack") return;
    ctx.battle.log("Hermep : effet [En attaquant] descriptif (TODO PendingChoice).");
  },

  /** OP02-117 Ice Age (Event) — -5 cost target. */
  "OP02-117": (ctx) => {
    if (ctx.hook !== "on-play") return;
    ctx.battle.log("Ice Age : effet [Principale] descriptif (TODO PendingChoice).");
  },

  /** OP03-009 Haruta — [Activation : Principale] [Une fois par tour] +1 DON. */
  "OP03-009": (ctx) => {
    if (ctx.hook !== "on-play") return;
    ctx.battle.log("Haruta : effet [Activation : Principale] (TODO activation + PendingChoice).");
  },

  /** OP03-079 Vergo — [DON!! x1] passif "ne peut pas être KO en combat". */
  "OP03-079": (ctx) => {
    if (ctx.hook !== "on-play") return;
    ctx.battle.log("Vergo : effet passif (immunité combat — TODO passifs).");
  },

  /** OP03-099 Charlotte Katakuri (Leader) — [En attaquant] manipulate Vie. */
  "OP03-099": (ctx) => {
    if (ctx.hook !== "on-attack") return;
    if (ctx.sourceUid !== "leader") return;
    ctx.battle.log("Katakuri : effet [En attaquant] (TODO PendingChoice — replace Vie).");
  },

  /** OP03-115 Streusen
   *  [Jouée] Vous pouvez défausser 1 carte de votre main ayant
   *  [Déclenchement] : Mettez KO jusqu'à 1 Personnage adverse ayant un coût
   *  de 1 ou moins. */
  "OP03-115": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP03-115",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt:
          "Streusen : défausse 1 carte avec [Déclenchement] pour mettre KO un Persos adverse (coût ≤ 1).",
        params: { count: 1, requireTrigger: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      if (ctx.choice.selection.handIndices) {
        ctx.battle.discardFromHand(
          ctx.sourceSeat,
          ctx.choice.selection.handIndices,
        );
        ctx.battle.requestChoice({
          seat: ctx.sourceSeat,
          sourceCardNumber: "OP03-115",
          sourceUid: ctx.sourceUid,
          kind: "ko-character",
          prompt: "Streusen : choisis un Persos adverse à KO (coût ≤ 1).",
          params: { maxCost: 1 },
          cancellable: false,
        });
        return;
      }
      if (ctx.choice.selection.targetUid) {
        const opponentSeat: OnePieceBattleSeatId =
          ctx.sourceSeat === "p1" ? "p2" : "p1";
        ctx.battle.koCharacter(opponentSeat, ctx.choice.selection.targetUid);
        ctx.battle.log("Streusen : effet [Jouée] résolu.");
      }
    }
  },

  /** OP03-118 Térébration (Event) — Counter +5000 (déjà géré par counter system). */
  // pas de handler — le counter system standard couvre ça.

  /** OP03-121 Colonne foudroyante (Event) — [Principale] discard Vie pour KO. */
  "OP03-121": (ctx) => {
    if (ctx.hook !== "on-play") return;
    ctx.battle.log("Colonne foudroyante : effet [Principale] (TODO PendingChoice).");
  },

  /** OP04-119 Don Quijote Rosinante — [Tour adverse] passif + [Jouée] play. */
  "OP04-119": (ctx) => {
    if (ctx.hook !== "on-play") return;
    ctx.battle.log("Don Quijote Rosinante : effet [Jouée] (TODO PendingChoice).");
  },

  /** OP05-060 Monkey D. Luffy (Leader) — [Activation : Principale]. */
  "OP05-060": (ctx) => {
    if (ctx.hook !== "on-play") return;
    ctx.battle.log("Monkey D. Luffy : effet [Activation : Principale] (TODO).");
  },

  /** OP05-061 Usohachi — [DON!! x1] [En attaquant] Si DON ≥ 8 : épuiser. */
  "OP05-061": (ctx) => {
    if (ctx.hook !== "on-attack") return;
    ctx.battle.log("Usohachi : effet [En attaquant] conditionnel (TODO).");
  },

  // ─── Plus d'effets à venir au fil des sessions ───
  // Les batches suivants étendront ce registre. La majorité des effets
  // restants nécessitent l'infra PendingChoice (ciblage joueur).
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
