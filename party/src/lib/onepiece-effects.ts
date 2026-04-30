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

/** Contexte d'évaluation d'un passif de puissance. Le moteur appelle tous
 *  les `PassivePowerMod` enregistrés à chaque calcul de power (attaque,
 *  défense, etc.) ; chaque mod retourne un delta à ajouter. */
export type PassivePowerContext = {
  // La carte dont on calcule le power.
  target: CardRef;
  // Quelle phase / situation déclenche le calcul.
  situation: "attack" | "defend" | "global";
  // À qui appartient la carte qui applique ce passif.
  modSourceSeat: OnePieceBattleSeatId;
  modSourceUid: string;
  // À quel seat appartient le tour courant (pour [Votre tour], [Tour adverse]).
  activeSeat: OnePieceBattleSeatId | null;
  // Lecture de l'état du combat.
  battle: BattleEffectAccess;
};

/** Modificateur de puissance passif. Retourne un delta (positif ou négatif)
 *  à appliquer au power de la cible. Retourne 0 si le passif ne s'applique
 *  pas dans cette situation. */
export type PassivePowerMod = (ctx: PassivePowerContext) => number;

/** Contexte d'évaluation d'une immunité KO. Le moteur appelle tous les
 *  `KoGuard` enregistrés à chaque tentative de KO ; si un retourne true,
 *  le KO est bloqué. */
export type KoGuardContext = {
  // Cible du KO (Persos uniquement — les Leaders ne peuvent pas être KO).
  target: { seat: OnePieceBattleSeatId; uid: string; cardId: string };
  // Origine : combat (attaque résolue) ou effet (effet de carte).
  source: "combat" | "effect";
  // À qui appartient la carte qui applique ce guard.
  modSourceSeat: OnePieceBattleSeatId;
  modSourceUid: string;
  battle: BattleEffectAccess;
};

/** Guard d'immunité KO. Retourne true pour bloquer le KO. */
export type KoGuard = (ctx: KoGuardContext) => boolean;

/** Contexte d'évaluation d'un grant de mots-clés dynamiques (Initiative,
 *  Bloqueur, Double Attaque) accordés par effet conditionnel. */
export type KeywordGrantContext = {
  target: { seat: OnePieceBattleSeatId; uid: string; cardId: string };
  modSourceSeat: OnePieceBattleSeatId;
  modSourceUid: string;
  activeSeat: OnePieceBattleSeatId | null;
  battle: BattleEffectAccess;
};

/** Grant de mots-clés dynamiques. Retourne la liste des mots-clés accordés
 *  à la cible (vide si aucun). Cumulé avec les mots-clés bracketés écrits
 *  sur la carte dans son effet. */
export type KeywordGrant = (ctx: KeywordGrantContext) => string[];

/** Contexte d'évaluation d'un listener "on-leave-field" déclenché quand
 *  une carte quitte le board (KO combat/effet, bounce, place sous deck). */
export type LeaveFieldContext = {
  // La carte qui quitte le terrain.
  leaving: { seat: OnePieceBattleSeatId; uid: string; cardId: string };
  // Cause du départ.
  reason: "ko-combat" | "ko-effect" | "bounce" | "place-bottom";
  // À qui appartient la carte qui écoute (typiquement un Stage ou un
  // Persos avec passif "quand X quitte le terrain").
  modSourceSeat: OnePieceBattleSeatId;
  modSourceUid: string;
  battle: BattleEffectAccess;
};

/** Listener déclenché quand une carte quitte le terrain. Side-effect only,
 *  ne retourne rien. */
export type LeaveFieldListener = (ctx: LeaveFieldContext) => void;

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

  /** Ajoute un modificateur de coût temporaire à un Persos (ou Leader,
   *  ignored) pour ce tour. Utilisé par Tsuru, Hermep, Ice Age, Tashigi,
   *  Van Auger pour réduire le coût d'un Persos adverse → permet de KO
   *  ciblés ≤ X coût modifié. */
  addCostBuff(ref: CardRef, amount: number): void;

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

  /** Attache N DON!! depuis la pool du seat (priorité aux rested) sur une
   *  cible (Leader ou Persos). Utilisé par les effets type "Donnez 1 DON
   *  épuisée à votre Leader / Persos". Retourne le nombre effectivement
   *  attaché (peut être < count si pas assez de DON disponibles). */
  attachDonToTarget(target: CardRef, count: number): number;

  /** Retire un Personnage du board et le place au-dessous du deck du
   *  propriétaire (les DON attachées retournent en pool épuisée). Utilisé
   *  par les effets type Building Snake. Retourne true si appliqué. */
  placeCharacterAtDeckBottom(
    seat: OnePieceBattleSeatId,
    uid: string,
  ): boolean;

  /** Épuise un Personnage (rested = true). Utilisé par les effets type
   *  "épuisez jusqu'à 1 Personnage adverse". Retourne true si appliqué. */
  restCharacter(seat: OnePieceBattleSeatId, uid: string): boolean;

  /** Redresse un Personnage (rested = false). Utilisé par les effets type
   *  "redressez jusqu'à 1 Personnage". Retourne true si appliqué. */
  untapCharacter(seat: OnePieceBattleSeatId, uid: string): boolean;

  /** Redresse le Leader (rested = false). Utilisé par les effets type
   *  "Redressez votre Leader". */
  untapLeader(seat: OnePieceBattleSeatId): void;

  /** Renvoie un Personnage du board à la main de son propriétaire. Les DON
   *  attachées retournent en pool épuisée. Utilisé par les effets type
   *  "renvoyez à la main 1 Persos". Retourne true si appliqué. */
  bounceCharacter(seat: OnePieceBattleSeatId, uid: string): boolean;

  /** Place une carte au-dessus de la pile de Vie d'un seat (face cachée
   *  comme une Vie normale). Utilisé par Sabo (place 1 Persos en Vie),
   *  Charlotte Daifuku (place top deck en Vie). Source : "hand" → indice
   *  dans la main, "deck-top" → carte du dessus du deck, "character" →
   *  uid d'un Persos en jeu retiré. Retourne true si appliqué. */
  placeCardAboveLife(
    seat: OnePieceBattleSeatId,
    source:
      | { kind: "hand"; handIndex: number }
      | { kind: "deck-top" }
      | { kind: "character"; uid: string },
  ): boolean;

  /** Place une carte de la main au-dessus du deck (top). Utilisé par
   *  Crocodile ST17-001, Marshall D. Teach ST17-005, Hina ST19-004.
   *  Retourne le cardId placé ou null. */
  placeHandOnTopOfDeck(
    seat: OnePieceBattleSeatId,
    handIndex: number,
  ): string | null;

  /** Lit (sans retirer) la carte du dessus du deck. Pour les effets
   *  "Révélez 1 carte du dessus" (Crocodile ST17, Sanji char OP06-119). */
  peekTopOfDeck(seat: OnePieceBattleSeatId): string | null;

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
    stage: OnePieceBattleCardInPlay | null;
    handSize: number;
    deckSize: number;
    lifeCount: number;
    discardSize: number;
    donActive: number;
    donRested: number;
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

  /** OP02-106 Tsuru
   *  [Jouée] Réduisez de -2 le coût de jusqu'à 1 Personnage adverse pour
   *  tout le tour. */
  "OP02-106": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP02-106",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt: "Tsuru : choisis un Persos adverse à -2 coût pour ce tour.",
        params: { allowLeader: false },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const target = ctx.choice.selection.targetUid;
      if (target === "leader") return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.addCostBuff(
        { kind: "character", seat: opponentSeat, uid: target },
        -2,
      );
      ctx.battle.log("Tsuru : -2 coût pour ce tour.");
    }
  },

  /** OP02-113 Hermep
   *  [En attaquant] Réduisez de -2 le coût de jusqu'à 1 Personnage adverse
   *  pour tout le tour. (Le bonus +2000 si Persos coût 0 est skip — il
   *  faudrait un check après le cost buff sur même cible.) */
  "OP02-113": (ctx) => {
    if (ctx.hook === "on-attack") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP02-113",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt: "Hermep : choisis un Persos adverse à -2 coût pour ce tour.",
        params: { allowLeader: false },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const target = ctx.choice.selection.targetUid;
      if (target === "leader") return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.addCostBuff(
        { kind: "character", seat: opponentSeat, uid: target },
        -2,
      );
      ctx.battle.log("Hermep : -2 coût pour ce tour.");
    }
  },

  /** OP02-117 Ice Age (Event)
   *  [Principale] Réduisez de -5 le coût de jusqu'à 1 Personnage adverse
   *  pour tout le tour. */
  "OP02-117": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP02-117",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt: "Ice Age : choisis un Persos adverse à -5 coût pour ce tour.",
        params: { allowLeader: false },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const target = ctx.choice.selection.targetUid;
      if (target === "leader") return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.addCostBuff(
        { kind: "character", seat: opponentSeat, uid: target },
        -5,
      );
      ctx.battle.log("Ice Age : -5 coût pour ce tour.");
    }
  },

  /** OP03-009 Haruta
   *  [Activation : Principale] [Une fois par tour] Donnez jusqu'à 1 carte
   *  DON!! épuisée à votre Leader ou à 1 de vos Personnages.
   *  Flow : on-activate-main → buff-target (cancellable) → on-choice-resolved
   *  avec targetUid → attachDonToTarget. */
  "OP03-009": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP03-009",
        sourceUid: ctx.sourceUid,
        kind: "buff-target",
        prompt:
          "Haruta : choisis une cible pour recevoir 1 DON!! épuisée (Leader ou un de tes Personnages).",
        params: { allowLeader: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      const target = ctx.choice.selection.targetUid;
      if (!target) return;
      const ref: CardRef =
        target === "leader"
          ? { kind: "leader", seat: ctx.sourceSeat }
          : { kind: "character", seat: ctx.sourceSeat, uid: target };
      const attached = ctx.battle.attachDonToTarget(ref, 1);
      ctx.battle.log(
        `Haruta : ${attached} DON!! attachée à la cible.`,
      );
    }
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

  // ─── BATCH 2 (cards 31-60 cardNumber) ────────────────────────────────────

  /** OP07-015 Monkey D. Dragon
   *  [Initiative] (déjà géré par hasKeyword)
   *  [Jouée] Donnez jusqu'à 2 cartes DON!! épuisées à votre Leader ou à 1
   *  de vos Personnages. */
  "OP07-015": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP07-015",
        sourceUid: ctx.sourceUid,
        kind: "buff-target",
        prompt:
          "Monkey D. Dragon : choisis une cible pour recevoir 2 DON!! épuisées.",
        params: { allowLeader: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      const target = ctx.choice.selection.targetUid;
      if (!target) return;
      const ref: CardRef =
        target === "leader"
          ? { kind: "leader", seat: ctx.sourceSeat }
          : { kind: "character", seat: ctx.sourceSeat, uid: target };
      const attached = ctx.battle.attachDonToTarget(ref, 2);
      ctx.battle.log(
        `Monkey D. Dragon : ${attached} DON!! attachée(s) à la cible.`,
      );
    }
  },

  /** OP09-002 Uta
   *  [Jouée] Regardez 5 cartes du dessus de votre deck, révélez jusqu'à 1
   *  carte de type {Équipage du Roux} et ajoutez-la à votre main. Puis,
   *  placez les cartes restantes au-dessous de votre deck dans l'ordre de
   *  votre choix. */
  "OP09-002": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const found = ctx.battle.searchDeckTopForType(
      ctx.sourceSeat,
      5,
      "Équipage du Roux",
      "bottom",
    );
    if (found) {
      ctx.battle.log("Uta : révèle un Équipage du Roux et l'ajoute à la main.");
    } else {
      ctx.battle.log("Uta : aucun Équipage du Roux révélé.");
    }
  },

  /** OP09-003 Shachi et Pingouin
   *  [En attaquant] Jusqu'à 1 Personnage adverse perd -2000 de puissance
   *  pour tout le tour. */
  "OP09-003": (ctx) => {
    if (ctx.hook === "on-attack") {
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const opp = ctx.battle.getSeat(opponentSeat);
      if (!opp || opp.characters.length === 0) {
        ctx.battle.log(
          "Shachi et Pingouin : aucun Personnage adverse à débuffer.",
        );
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-003",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt:
          "Shachi et Pingouin : choisis un Personnage adverse à débuffer (-2000 puissance).",
        params: { allowLeader: false, allowCharacters: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      const target = ctx.choice.selection.targetUid;
      if (!target || target === "leader") return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.addPowerBuff(
        { kind: "character", seat: opponentSeat, uid: target },
        -2000,
      );
      ctx.battle.log("Shachi et Pingouin : -2000 puissance pour ce tour.");
    }
  },

  /** OP09-008 Building Snake
   *  [Activation : Principale] Vous pouvez placer ce Personnage au-dessous
   *  du deck de son propriétaire : Jusqu'à 1 Personnage adverse perd
   *  -3000 de puissance pour tout le tour. */
  "OP09-008": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      // Cherche un Persos adverse à débuff. Si aucun, on peut quand même
      // placer la carte au bottom — ici on demande juste la cible. Si le
      // joueur skip, on ne fait rien.
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const opp = ctx.battle.getSeat(opponentSeat);
      if (!opp || opp.characters.length === 0) {
        ctx.battle.log("Building Snake : aucun Personnage adverse à débuffer.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-008",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt:
          "Building Snake : choisis un Personnage adverse à débuffer (-3000). Le Persos retourne sous le deck.",
        params: { allowLeader: false, allowCharacters: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      const target = ctx.choice.selection.targetUid;
      if (!target || target === "leader") return;
      // Place Building Snake au bottom du deck.
      ctx.battle.placeCharacterAtDeckBottom(ctx.sourceSeat, ctx.sourceUid);
      // Débuff la cible adverse.
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.addPowerBuff(
        { kind: "character", seat: opponentSeat, uid: target },
        -3000,
      );
      ctx.battle.log(
        "Building Snake : -3000 puissance pour ce tour, Persos retourné au deck.",
      );
    }
  },

  /** OP09-011 Hongo
   *  [Activation : Principale] Vous pouvez épuiser ce Personnage : Si votre
   *  Leader est de type {Équipage du Roux}, jusqu'à 1 Personnage adverse
   *  perd -2000 de puissance pour tout le tour. */
  "OP09-011": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const leaderId = seat?.leaderId;
      const leaderMeta = leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(leaderId)
        : null;
      const isRoux = leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("équipage du roux"),
      );
      if (!isRoux) {
        ctx.battle.log("Hongo : Leader pas Équipage du Roux, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-011",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt: "Hongo : choisis un Personnage adverse à débuffer (-2000).",
        params: { allowLeader: false, allowCharacters: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      const target = ctx.choice.selection.targetUid;
      if (!target || target === "leader") return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.addPowerBuff(
        { kind: "character", seat: opponentSeat, uid: target },
        -2000,
      );
      ctx.battle.log("Hongo : -2000 puissance pour ce tour.");
    }
  },

  /** OP09-013 Yasopp
   *  [Jouée] Jusqu'à 1 de vos Leaders gagne +1000 de puissance jusqu'à la
   *  fin du prochain tour adverse. — Auto self leader (1 seul Leader).
   *  [DON!! x1] [En attaquant] Jusqu'à 1 Personnage adverse perd -1000 de
   *  puissance pour tout le tour. */
  "OP09-013": (ctx) => {
    if (ctx.hook === "on-play") {
      // Auto-buff Leader (toujours 1).
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (seat?.leaderId) {
        ctx.battle.addPowerBuff(
          { kind: "leader", seat: ctx.sourceSeat },
          1000,
        );
        ctx.battle.log("Yasopp : Leader gagne +1000 puissance.");
      }
      return;
    }
    if (ctx.hook === "on-attack") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const c = seat?.characters.find((x) => x.uid === ctx.sourceUid);
      if (!c || c.attachedDon < 1) return; // [DON!! x1] requirement
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const opp = ctx.battle.getSeat(opponentSeat);
      if (!opp || opp.characters.length === 0) return;
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-013",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt: "Yasopp : choisis un Persos adverse à débuffer (-1000).",
        params: { allowLeader: false, allowCharacters: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      const target = ctx.choice.selection.targetUid;
      if (!target || target === "leader") return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.addPowerBuff(
        { kind: "character", seat: opponentSeat, uid: target },
        -1000,
      );
      ctx.battle.log("Yasopp : -1000 puissance pour ce tour.");
    }
  },

  /** OP09-019 Sous aucun prétexte je ne pardonnerai... (Event)
   *  [Principale] Si votre Leader est de type {Équipage du Roux}, jusqu'à
   *  1 Personnage adverse perd -3000 de puissance pour tout le tour. */
  "OP09-019": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const leaderMeta = seat?.leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
        : null;
      const isRoux = leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("équipage du roux"),
      );
      if (!isRoux) {
        ctx.battle.log(
          "Sous aucun prétexte : Leader pas Équipage du Roux, effet annulé.",
        );
        return;
      }
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const opp = ctx.battle.getSeat(opponentSeat);
      if (!opp || opp.characters.length === 0) return;
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-019",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt: "Choisis un Persos adverse à débuffer (-3000 puissance).",
        params: { allowLeader: false, allowCharacters: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      const target = ctx.choice.selection.targetUid;
      if (!target || target === "leader") return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.addPowerBuff(
        { kind: "character", seat: opponentSeat, uid: target },
        -3000,
      );
      ctx.battle.log("-3000 puissance pour ce tour.");
    }
  },

  // ─── BATCH 3 (cards 61-90 cardNumber) ────────────────────────────────────

  /** OP09-020 Qu'ils viennent !! On les attend de pied ferme !! (Event)
   *  [Principale] Regardez 5 cartes du dessus de votre deck, révélez jusqu'à
   *  1 carte de type {Équipage du Roux} autre que [Qu'ils viennent !!...] et
   *  ajoutez-la à votre main. Puis placez les cartes restantes au-dessous. */
  "OP09-020": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const found = ctx.battle.searchDeckTopForType(
      ctx.sourceSeat,
      5,
      "Équipage du Roux",
      "bottom",
      "Qu'ils viennent !! On les attend de pied ferme !!",
    );
    ctx.battle.log(
      found
        ? "Évènement : révèle un Équipage du Roux."
        : "Évènement : aucun Équipage du Roux révélé.",
    );
  },

  /** OP09-024 Usopp
   *  [Jouée] Si vous avez 2 Personnages ou plus épuisés, piochez 2 cartes
   *  et défaussez 2 cartes de votre main. */
  "OP09-024": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    if (!seat) return;
    const restedCount = seat.characters.filter((c) => c.rested).length;
    if (restedCount < 2) {
      ctx.battle.log("Usopp : moins de 2 Persos épuisés, effet annulé.");
      return;
    }
    ctx.battle.drawCards(ctx.sourceSeat, 2);
    ctx.battle.discardRandom(ctx.sourceSeat, 2);
    ctx.battle.log("Usopp : pioche 2 et défausse 2.");
  },

  /** OP09-026 Sakazuki
   *  [Jouée] Si vous avez 2 Personnages ou plus épuisés, mettez KO jusqu'à
   *  1 Personnage adverse ayant un coût de 5 ou moins. */
  "OP09-026": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat) return;
      const restedCount = seat.characters.filter((c) => c.rested).length;
      if (restedCount < 2) {
        ctx.battle.log("Sakazuki : moins de 2 Persos épuisés, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-026",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt: "Sakazuki : choisis un Persos adverse à KO (coût ≤ 5).",
        params: { maxCost: 5 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.koCharacter(opponentSeat, ctx.choice.selection.targetUid);
      ctx.battle.log("Sakazuki : KO réussi.");
    }
  },

  /** OP09-037 Lim (Char)
   *  [Jouée] Regardez 5 cartes du dessus de votre deck, révélez jusqu'à 1
   *  carte de type {ODYSSEY} autre que [Lim] et ajoutez-la à votre main.
   *  Puis, placez les cartes restantes au-dessous de votre deck. */
  "OP09-037": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const found = ctx.battle.searchDeckTopForType(
      ctx.sourceSeat,
      5,
      "ODYSSEY",
      "bottom",
      "Lim",
    );
    ctx.battle.log(
      found
        ? "Lim : révèle une carte ODYSSEY."
        : "Lim : aucune carte ODYSSEY révélée.",
    );
  },

  /** OP09-040 Thunder Lance Flip Caliber Phoenix Shot (Event)
   *  [Principale] Si vous avez 2 Personnages ou plus épuisés, mettez KO
   *  jusqu'à 1 Personnage adverse ayant un coût de 4 ou moins. */
  "OP09-040": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat) return;
      const restedCount = seat.characters.filter((c) => c.rested).length;
      if (restedCount < 2) {
        ctx.battle.log("Phoenix Shot : moins de 2 Persos épuisés, annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-040",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt: "Phoenix Shot : choisis un Persos adverse à KO (coût ≤ 4).",
        params: { maxCost: 4 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.koCharacter(opponentSeat, ctx.choice.selection.targetUid);
      ctx.battle.log("Phoenix Shot : KO réussi.");
    }
  },

  /** OP09-048 Dracule Mihawk
   *  [Bloqueur] (déjà géré par hasKeyword)
   *  [Jouée] Piochez 2 cartes et défaussez 1 carte de votre main. */
  "OP09-048": (ctx) => {
    if (ctx.hook !== "on-play") return;
    ctx.battle.drawCards(ctx.sourceSeat, 2);
    ctx.battle.discardRandom(ctx.sourceSeat, 1);
    ctx.battle.log("Dracule Mihawk : pioche 2 et défausse 1.");
  },

  /** OP09-051 Baggy (Char)
   *  [Jouée] Placez jusqu'à 1 Personnage adverse au-dessous du deck de
   *  son propriétaire. (Le 2ᵉ effet conditionnel "si vous n'avez pas 5
   *  Persos coût ≥ 5, placez ce Persos sous deck" est skip pour l'instant.) */
  "OP09-051": (ctx) => {
    if (ctx.hook === "on-play") {
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const opp = ctx.battle.getSeat(opponentSeat);
      if (!opp || opp.characters.length === 0) {
        ctx.battle.log("Baggy : aucun Persos adverse à renvoyer au deck.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-051",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt:
          "Baggy : choisis un Persos adverse à placer au-dessous de son deck.",
        params: {},
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.placeCharacterAtDeckBottom(
        opponentSeat,
        ctx.choice.selection.targetUid,
      );
      ctx.battle.log("Baggy : Persos adverse renvoyé au-dessous du deck.");
    }
  },

  // ─── BATCH 4 (cards 91-120 cardNumber) ──────────────────────────────────

  /** OP09-053 Morge
   *  [Jouée] Regardez 5 cartes du dessus de votre deck, révélez jusqu'à 1
   *  [Richie] et ajoutez-le à votre main. Puis... (effet "jouer Richie"
   *  est skip, on récupère juste la carte en main). */
  "OP09-053": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const found = ctx.battle.searchDeckTopForType(
      ctx.sourceSeat,
      5,
      "Richie",
      "bottom",
    );
    ctx.battle.log(
      found
        ? "Morge : révèle Richie et l'ajoute à la main."
        : "Morge : aucun Richie révélé.",
    );
  },

  /** OP09-056 Mr 3 (Galdino)
   *  [Jouée] Regardez 4 cartes du dessus de votre deck, révélez jusqu'à 1
   *  carte de type {Cross Guild} ou incluant «Baroque Works» dans son
   *  type autre que [Mr 3 (Galdino)] et ajoutez-la à votre main. Puis,
   *  placez les cartes restantes au-dessous de votre deck. */
  "OP09-056": (ctx) => {
    if (ctx.hook !== "on-play") return;
    // Cherche d'abord Cross Guild, fallback Baroque Works.
    let found = ctx.battle.searchDeckTopForType(
      ctx.sourceSeat,
      4,
      "Cross Guild",
      "bottom",
      "Mr 3 (Galdino)",
    );
    if (!found) {
      found = ctx.battle.searchDeckTopForType(
        ctx.sourceSeat,
        0,
        "Baroque Works",
        "bottom",
        "Mr 3 (Galdino)",
      );
    }
    ctx.battle.log(
      found
        ? "Mr 3 (Galdino) : révèle une carte Cross Guild / Baroque Works."
        : "Mr 3 (Galdino) : aucune carte révélée.",
    );
  },

  /** OP09-057 Cross Guild (Event)
   *  [Principale] Regardez 4 cartes du dessus de votre deck, révélez
   *  jusqu'à 1 carte de type {Cross Guild} et ajoutez-la à votre main.
   *  Puis, placez les cartes restantes au-dessous de votre deck. */
  "OP09-057": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const found = ctx.battle.searchDeckTopForType(
      ctx.sourceSeat,
      4,
      "Cross Guild",
      "bottom",
    );
    ctx.battle.log(
      found
        ? "Cross Guild : révèle une carte Cross Guild."
        : "Cross Guild : aucune carte Cross Guild révélée.",
    );
  },

  /** OP09-066 Jean Bart
   *  [Jouée] Si votre adversaire a plus de cartes DON!! sur son terrain
   *  que vous n'en avez sur le vôtre, mettez KO jusqu'à 1 Personnage
   *  adverse ayant un coût de 3 ou moins. */
  "OP09-066": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const opp = ctx.battle.getSeat(opponentSeat);
      if (!seat || !opp) return;
      const myDon = seat.donActive;
      // Don sur le terrain adverse = donActive (sa pool dispo). On ne compte
      // pas les rested/attached pour rester proche de la prose officielle :
      // "cartes DON!! sur son terrain" = la pool active.
      const oppDon = opp.donActive;
      if (oppDon <= myDon) {
        ctx.battle.log(
          "Jean Bart : pas plus de DON adverses, effet annulé.",
        );
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-066",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt: "Jean Bart : choisis un Persos adverse à KO (coût ≤ 3).",
        params: { maxCost: 3 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.koCharacter(opponentSeat, ctx.choice.selection.targetUid);
      ctx.battle.log("Jean Bart : KO réussi.");
    }
  },

  /** OP09-069 Trafalgar Law (Char)
   *  [Jouée] Regardez 4 cartes du dessus de votre deck, révélez jusqu'à 1
   *  carte de type {Équipage de Chapeau de paille} ou {Équipage du Heart}
   *  ayant un coût de 2 ou plus et ajoutez-la à votre main. Puis, placez
   *  les cartes restantes au-dessous. (filtre cost ≥ 2 simplifié — on
   *  prend le premier match). */
  "OP09-069": (ctx) => {
    if (ctx.hook !== "on-play") return;
    let found = ctx.battle.searchDeckTopForType(
      ctx.sourceSeat,
      4,
      "Équipage de Chapeau de paille",
      "bottom",
    );
    if (!found) {
      found = ctx.battle.searchDeckTopForType(
        ctx.sourceSeat,
        0,
        "Équipage du Heart",
        "bottom",
      );
    }
    ctx.battle.log(
      found
        ? "Trafalgar Law : révèle une carte Chapeau de paille / Heart."
        : "Trafalgar Law : aucune carte révélée.",
    );
  },

  // ─── BATCH 5 (cards 121-150 cardNumber) ─────────────────────────────────

  /** OP09-090 Doc Q
   *  [Activation : Principale] Vous pouvez épuiser ce Personnage : Si votre
   *  Leader est de type {Équipage de Barbe Noire}, mettez KO jusqu'à 1
   *  Personnage adverse ayant un coût de 1 ou moins. */
  "OP09-090": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const leaderMeta = seat?.leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
        : null;
      const isBN = leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("équipage de barbe noire"),
      );
      if (!isBN) {
        ctx.battle.log("Doc Q : Leader pas Barbe Noire, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-090",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt: "Doc Q : choisis un Persos adverse à KO (coût ≤ 1).",
        params: { maxCost: 1 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.koCharacter(opponentSeat, ctx.choice.selection.targetUid);
      ctx.battle.log("Doc Q : KO réussi.");
    }
  },

  /** OP09-092 Marshall D. Teach (Char)
   *  [Activation : Principale] Vous pouvez épuiser ce Personnage : Si votre
   *  main comporte au moins 3 cartes de moins que celle de votre adversaire,
   *  piochez 2 cartes et défaussez 1 carte de votre main. */
  "OP09-092": (ctx) => {
    if (ctx.hook !== "on-activate-main") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    const opponentSeat: OnePieceBattleSeatId =
      ctx.sourceSeat === "p1" ? "p2" : "p1";
    const opp = ctx.battle.getSeat(opponentSeat);
    if (!seat || !opp) return;
    if (opp.handSize - seat.handSize < 3) {
      ctx.battle.log(
        "Marshall D. Teach : différence main < 3 cartes, effet annulé.",
      );
      return;
    }
    ctx.battle.drawCards(ctx.sourceSeat, 2);
    ctx.battle.discardRandom(ctx.sourceSeat, 1);
    ctx.battle.log("Marshall D. Teach : pioche 2 et défausse 1.");
  },

  /** OP09-096 L'avènement de mon règne !! (Event)
   *  [Principale] Regardez 3 cartes du dessus de votre deck, révélez
   *  jusqu'à 1 carte de type {Équipage de Barbe Noire} autre que
   *  [L'avènement de mon règne !!] et ajoutez-la à votre main. Puis,
   *  placez les cartes restantes au-dessous. */
  "OP09-096": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const found = ctx.battle.searchDeckTopForType(
      ctx.sourceSeat,
      3,
      "Équipage de Barbe Noire",
      "bottom",
      "L'avènement de mon règne !!",
    );
    ctx.battle.log(
      found
        ? "L'avènement... : révèle un Équipage de Barbe Noire."
        : "L'avènement... : aucun Équipage de Barbe Noire révélé.",
    );
  },

  /** OP09-106 Nico Olvia
   *  [Jouée] Jusqu'à 1 de vos Leaders [Nico Robin] gagne +3000 de
   *  puissance pour tout le tour. (Auto-target Leader si name === Robin) */
  "OP09-106": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    if (!seat?.leaderId) return;
    const leaderMeta = ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId);
    if (leaderMeta?.name !== "Nico Robin") {
      ctx.battle.log("Nico Olvia : Leader pas Nico Robin, effet annulé.");
      return;
    }
    ctx.battle.addPowerBuff(
      { kind: "leader", seat: ctx.sourceSeat },
      3000,
    );
    ctx.battle.log("Nico Olvia : Leader Nico Robin gagne +3000 puissance.");
  },

  /** OP09-112 Belo Betty
   *  [Jouée] Si vous avez 2 cartes ou moins dans votre Vie, piochez 1 carte. */
  "OP09-112": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    if (!seat) return;
    if (seat.lifeCount > 2) {
      ctx.battle.log("Belo Betty : plus de 2 Vies, effet annulé.");
      return;
    }
    ctx.battle.drawCards(ctx.sourceSeat, 1);
    ctx.battle.log("Belo Betty : pioche 1 carte.");
  },

  // ─── BATCH 6 (cards 151-180 cardNumber) ─────────────────────────────────

  /** P-030 Jinbe (Promo)
   *  [En cas de KO] Placez au-dessous du deck de son propriétaire jusqu'à
   *  1 Personnage ayant un coût de 3 ou moins. */
  "P-030": (ctx) => {
    if (ctx.hook === "on-ko") {
      // Le seat qui doit choisir la cible = celui qui possédait Jinbe.
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "P-030",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt:
          "Jinbe : place un Persos adverse ≤ 3 au-dessous du deck de son propriétaire.",
        params: { maxCost: 3 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.placeCharacterAtDeckBottom(
        opponentSeat,
        ctx.choice.selection.targetUid,
      );
      ctx.battle.log("Jinbe (En cas de KO) : Persos adverse retourné au deck.");
    }
  },

  /** ST03-005 Dracule Mihawk
   *  [DON!! x1] [En attaquant] Piochez 2 cartes et défaussez 2 cartes de
   *  votre main. */
  "ST03-005": (ctx) => {
    if (ctx.hook !== "on-attack") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    const c = seat?.characters.find((x) => x.uid === ctx.sourceUid);
    if (!c || c.attachedDon < 1) return; // [DON!! x1] requirement
    ctx.battle.drawCards(ctx.sourceSeat, 2);
    ctx.battle.discardRandom(ctx.sourceSeat, 2);
    ctx.battle.log(
      "Dracule Mihawk : pioche 2 et défausse 2 ([DON!! x1] [En attaquant]).",
    );
  },

  /** ST11-004 Nouvelle ère (Event)
   *  [Principale] Si votre Leader est [Uta], regardez 3 cartes du dessus,
   *  révélez jusqu'à 1 carte de type {FILM} autre que [Nouvelle ère] et
   *  ajoutez-la à votre main. Puis, placez les cartes restantes au-dessous. */
  "ST11-004": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    const leaderMeta = seat?.leaderId
      ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
      : null;
    if (leaderMeta?.name !== "Uta") {
      ctx.battle.log("Nouvelle ère : Leader pas Uta, effet annulé.");
      return;
    }
    const found = ctx.battle.searchDeckTopForType(
      ctx.sourceSeat,
      3,
      "FILM",
      "bottom",
      "Nouvelle ère",
    );
    ctx.battle.log(
      found
        ? "Nouvelle ère : révèle une carte FILM."
        : "Nouvelle ère : aucune carte FILM révélée.",
    );
  },

  /** ST15-002 Edward Newgate (Char)
   *  [Jouée] Donnez jusqu'à 1 carte DON!! épuisée à votre Leader ou à 1
   *  de vos Personnages. (Effet [Activation] KO ≤ 5000 puissance skip
   *  car nécessite filtre par puissance, pas implémenté.) */
  "ST15-002": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST15-002",
        sourceUid: ctx.sourceUid,
        kind: "buff-target",
        prompt:
          "Edward Newgate : choisis une cible pour recevoir 1 DON!! épuisée.",
        params: { allowLeader: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      const target = ctx.choice.selection.targetUid;
      if (!target) return;
      const ref: CardRef =
        target === "leader"
          ? { kind: "leader", seat: ctx.sourceSeat }
          : { kind: "character", seat: ctx.sourceSeat, uid: target };
      const attached = ctx.battle.attachDonToTarget(ref, 1);
      ctx.battle.log(`Edward Newgate : ${attached} DON!! attachée à la cible.`);
    }
  },

  /** ST15-004 Thatch
   *  [Jouée] Si votre Leader inclut «Équipage de Barbe Blanche» dans son
   *  type, jusqu'à 1 Personnage adverse perd -2000 de puissance pour tout
   *  le tour. Puis, ajoutez à votre main 1 carte du dessus de votre Vie. */
  "ST15-004": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const leaderMeta = seat?.leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
        : null;
      const isBB = leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("équipage de barbe blanche"),
      );
      if (!isBB) {
        ctx.battle.log("Thatch : Leader pas Barbe Blanche, effet annulé.");
        return;
      }
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const opp = ctx.battle.getSeat(opponentSeat);
      if (!opp || opp.characters.length === 0) {
        // Pas de cible — applique juste le 2ᵉ effet (Vie → main).
        ctx.battle.takeLifeToHand(ctx.sourceSeat);
        ctx.battle.log(
          "Thatch : pas de Persos adverse, ajoute 1 Vie à la main.",
        );
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST15-004",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt: "Thatch : choisis un Persos adverse à débuffer (-2000).",
        params: { allowLeader: false, allowCharacters: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      const target = ctx.choice.selection.targetUid;
      if (!ctx.choice.skipped && target && target !== "leader") {
        const opponentSeat: OnePieceBattleSeatId =
          ctx.sourceSeat === "p1" ? "p2" : "p1";
        ctx.battle.addPowerBuff(
          { kind: "character", seat: opponentSeat, uid: target },
          -2000,
        );
        ctx.battle.log("Thatch : -2000 puissance pour ce tour.");
      }
      // Toujours ajouter 1 Vie à la main (effet "Puis,").
      ctx.battle.takeLifeToHand(ctx.sourceSeat);
      ctx.battle.log("Thatch : ajoute 1 Vie à la main.");
    }
  },

  // ─── BATCH 7 (cards 181-210 cardNumber) ─────────────────────────────────

  /** ST18-004 Zorojuro
   *  [Jouée] Regardez 5 cartes du dessus, révélez jusqu'à 1 carte de type
   *  {Équipage de Chapeau de paille} violette. (filtre couleur skip,
   *  on prend le 1er Chapeau de paille). */
  "ST18-004": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const found = ctx.battle.searchDeckTopForType(
      ctx.sourceSeat,
      5,
      "Équipage de Chapeau de paille",
      "bottom",
    );
    ctx.battle.log(
      found
        ? "Zorojuro : révèle un Chapeau de paille."
        : "Zorojuro : aucun Chapeau de paille révélé.",
    );
  },

  /** ST21-001 Monkey D. Luffy (Leader)
   *  [DON!! x1] [Activation : Principale] [Une fois par tour] Donnez
   *  jusqu'à 2 cartes DON!! épuisées à 1 de vos Personnages. */
  "ST21-001": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      // Vérifie [DON!! x1] sur le Leader.
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat || seat.leaderAttachedDon < 1) {
        ctx.battle.log("Luffy (Leader) : [DON!! x1] requis.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST21-001",
        sourceUid: ctx.sourceUid,
        kind: "buff-target",
        prompt: "Luffy (Leader) : choisis un Persos pour recevoir 2 DON!!.",
        params: { allowLeader: false },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      const target = ctx.choice.selection.targetUid;
      if (!target || target === "leader") return;
      const attached = ctx.battle.attachDonToTarget(
        { kind: "character", seat: ctx.sourceSeat, uid: target },
        2,
      );
      ctx.battle.log(`Luffy (Leader) : ${attached} DON!! attachée(s).`);
    }
  },

  /** ST21-009 Nami
   *  [Activation : Principale] [Une fois par tour] Donnez jusqu'à 2 cartes
   *  DON!! épuisées à votre Leader ou à 1 de vos Personnages, de type
   *  {Équipage de Chapeau de paille}. */
  "ST21-009": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST21-009",
        sourceUid: ctx.sourceUid,
        kind: "buff-target",
        prompt: "Nami : choisis une cible pour recevoir 2 DON!! épuisées.",
        params: { allowLeader: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      const target = ctx.choice.selection.targetUid;
      if (!target) return;
      const ref: CardRef =
        target === "leader"
          ? { kind: "leader", seat: ctx.sourceSeat }
          : { kind: "character", seat: ctx.sourceSeat, uid: target };
      const attached = ctx.battle.attachDonToTarget(ref, 2);
      ctx.battle.log(`Nami : ${attached} DON!! attachée(s).`);
    }
  },

  /** ST21-012 Brook
   *  [En attaquant] Donnez jusqu'à 2 cartes DON!! épuisées à votre Leader
   *  ou à 1 de vos Personnages. */
  "ST21-012": (ctx) => {
    if (ctx.hook === "on-attack") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST21-012",
        sourceUid: ctx.sourceUid,
        kind: "buff-target",
        prompt: "Brook : choisis une cible pour recevoir 2 DON!! épuisées.",
        params: { allowLeader: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      const target = ctx.choice.selection.targetUid;
      if (!target) return;
      const ref: CardRef =
        target === "leader"
          ? { kind: "leader", seat: ctx.sourceSeat }
          : { kind: "character", seat: ctx.sourceSeat, uid: target };
      const attached = ctx.battle.attachDonToTarget(ref, 2);
      ctx.battle.log(`Brook : ${attached} DON!! attachée(s).`);
    }
  },

  /** ST21-014 Monkey D. Luffy (Char)
   *  [Initiative] (déjà géré)
   *  [En attaquant] Donnez jusqu'à 1 carte DON!! épuisée à votre Leader
   *  ou à 1 de vos Personnages. */
  "ST21-014": (ctx) => {
    if (ctx.hook === "on-attack") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST21-014",
        sourceUid: ctx.sourceUid,
        kind: "buff-target",
        prompt: "Luffy : choisis une cible pour recevoir 1 DON!! épuisée.",
        params: { allowLeader: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      const target = ctx.choice.selection.targetUid;
      if (!target) return;
      const ref: CardRef =
        target === "leader"
          ? { kind: "leader", seat: ctx.sourceSeat }
          : { kind: "character", seat: ctx.sourceSeat, uid: target };
      const attached = ctx.battle.attachDonToTarget(ref, 1);
      ctx.battle.log(`Luffy (En attaquant) : ${attached} DON!! attachée.`);
    }
  },

  /** ST21-017 Gum Gum Taupe Bullet (Event)
   *  [Principale] Jusqu'à 1 Personnage adverse perd -5000 de puissance
   *  pour tout le tour. (Le KO conditionnel ≤ 2000 puissance est skip
   *  car nécessite filtre par puissance.) */
  "ST21-017": (ctx) => {
    if (ctx.hook === "on-play") {
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const opp = ctx.battle.getSeat(opponentSeat);
      if (!opp || opp.characters.length === 0) {
        ctx.battle.log(
          "Gum Gum Taupe Bullet : aucun Persos adverse à débuffer.",
        );
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST21-017",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt: "Gum Gum Taupe Bullet : choisis un Persos adverse (-5000).",
        params: { allowLeader: false, allowCharacters: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      const target = ctx.choice.selection.targetUid;
      if (!target || target === "leader") return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.addPowerBuff(
        { kind: "character", seat: opponentSeat, uid: target },
        -5000,
      );
      ctx.battle.log("Gum Gum Taupe Bullet : -5000 puissance pour ce tour.");
    }
  },

  // ─── BATCH 8 — Filtres power + rest/untap ───────────────────────────────

  /** OP09-009 Ben Beckmann
   *  [Jouée] Placez dans sa Défausse jusqu'à 1 Personnage adverse ayant
   *  6000 de puissance ou moins. (= KO ≤ 6000 puissance) */
  "OP09-009": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-009",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt: "Ben Beckmann : choisis un Persos adverse à KO (≤ 6000 puissance).",
        params: { maxPower: 6000 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.koCharacter(opponentSeat, ctx.choice.selection.targetUid);
      ctx.battle.log("Ben Beckmann : KO réussi.");
    }
  },

  /** OP09-077 Gum Gum Foudre (Event)
   *  [Principale] DON!! -2 : Mettez KO jusqu'à 1 Personnage adverse ayant
   *  6000 de puissance ou moins. (DON cost skip — on évalue juste la
   *  partie KO). */
  "OP09-077": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-077",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt: "Gum Gum Foudre : choisis un Persos adverse à KO (≤ 6000 puissance).",
        params: { maxPower: 6000 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.koCharacter(opponentSeat, ctx.choice.selection.targetUid);
      ctx.battle.log("Gum Gum Foudre : KO réussi.");
    }
  },

  /** OP09-114 Lindbergh
   *  [Jouée] Si vous et votre adversaire avez un total de 5 cartes ou
   *  moins dans vos Vies, mettez KO jusqu'à 1 Personnage adverse ayant
   *  2000 de puissance ou moins. */
  "OP09-114": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const opp = ctx.battle.getSeat(opponentSeat);
      if (!seat || !opp) return;
      const totalLife = seat.lifeCount + opp.lifeCount;
      if (totalLife > 5) {
        ctx.battle.log("Lindbergh : total Vies > 5, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-114",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt: "Lindbergh : choisis un Persos adverse à KO (≤ 2000 puissance).",
        params: { maxPower: 2000 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.koCharacter(opponentSeat, ctx.choice.selection.targetUid);
      ctx.battle.log("Lindbergh : KO réussi.");
    }
  },

  /** OP09-035 Portgas D. Ace
   *  [Jouée] Si vous avez 2 Personnages ou plus épuisés, épuisez jusqu'à
   *  1 Personnage adverse ayant un coût de 5 ou moins. */
  "OP09-035": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat) return;
      const restedCount = seat.characters.filter((c) => c.rested).length;
      if (restedCount < 2) {
        ctx.battle.log("Portgas D. Ace : moins de 2 Persos épuisés, annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-035",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt: "Portgas D. Ace : choisis un Persos adverse à épuiser (coût ≤ 5).",
        params: { allowLeader: false, maxCost: 5 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const target = ctx.choice.selection.targetUid;
      if (target === "leader") return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.restCharacter(opponentSeat, target);
      ctx.battle.log("Portgas D. Ace : Persos adverse épuisé.");
    }
  },

  /** OP09-079 Gum Gum Saut à la corde (Event)
   *  [Principale] DON!! -2 : Épuisez jusqu'à 1 Personnage adverse ayant
   *  un coût de 5 ou moins. Puis, piochez 1 carte. */
  "OP09-079": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-079",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt: "Gum Gum Saut à la corde : choisis un Persos adverse à épuiser (coût ≤ 5).",
        params: { allowLeader: false, maxCost: 5 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      const target = ctx.choice.selection.targetUid;
      if (!ctx.choice.skipped && target && target !== "leader") {
        const opponentSeat: OnePieceBattleSeatId =
          ctx.sourceSeat === "p1" ? "p2" : "p1";
        ctx.battle.restCharacter(opponentSeat, target);
        ctx.battle.log("Saut à la corde : Persos adverse épuisé.");
      }
      // "Puis piochez 1 carte" → toujours pioche 1.
      ctx.battle.drawCards(ctx.sourceSeat, 1);
      ctx.battle.log("Saut à la corde : pioche 1 carte.");
    }
  },

  /** ST18-001 Usohachi
   *  [Jouée] Si vous avez 8 cartes DON!! ou plus sur votre terrain,
   *  épuisez jusqu'à 1 Personnage adverse ayant un coût de 5 ou moins.
   *  ("DON sur votre terrain" = donActive + donRested + DON attachées) */
  "ST18-001": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat) return;
      const totalDon =
        seat.donActive +
        seat.donRested +
        seat.leaderAttachedDon +
        seat.characters.reduce((s, c) => s + c.attachedDon, 0);
      if (totalDon < 8) {
        ctx.battle.log(
          `Usohachi : ${totalDon} DON < 8 sur le terrain, effet annulé.`,
        );
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST18-001",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt: "Usohachi : choisis un Persos adverse à épuiser (coût ≤ 5).",
        params: { allowLeader: false, maxCost: 5 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const target = ctx.choice.selection.targetUid;
      if (target === "leader") return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.restCharacter(opponentSeat, target);
      ctx.battle.log("Usohachi : Persos adverse épuisé.");
    }
  },

  /** OP09-029 Tony-Tony Chopper (Char)
   *  [Fin de votre tour] Redressez jusqu'à 1 de vos Personnages de type
   *  {ODYSSEY} ayant un coût de 4 ou moins. */
  "OP09-029": (ctx) => {
    if (ctx.hook === "on-turn-end") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      // Filtre rapide : un Persos ODYSSEY rested ≤ 4 existe-t-il ?
      const eligible = seat?.characters.filter((c) => {
        if (!c.rested) return false;
        const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
        if (!meta || meta.kind !== "character") return false;
        if (meta.cost > 4) return false;
        return meta.types.some((t) =>
          t.toLowerCase().includes("odyssey"),
        );
      });
      if (!eligible || eligible.length === 0) {
        ctx.battle.log(
          "Tony-Tony Chopper : aucun Persos ODYSSEY ≤ 4 à redresser.",
        );
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-029",
        sourceUid: ctx.sourceUid,
        kind: "buff-target",
        prompt:
          "Tony-Tony Chopper : choisis un de tes Persos ODYSSEY ≤ 4 à redresser.",
        params: {
          allowLeader: false,
          maxCost: 4,
          requireType: "ODYSSEY",
          onlyRested: true,
        },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const target = ctx.choice.selection.targetUid;
      if (target === "leader") return;
      ctx.battle.untapCharacter(ctx.sourceSeat, target);
      ctx.battle.log("Tony-Tony Chopper : Persos ODYSSEY redressé.");
    }
  },

  /** ST20-004 Charlotte Pudding
   *  [Jouée] Vous pouvez ajouter à votre main 1 carte du dessus de votre
   *  Vie : Redressez jusqu'à 1 de vos Personnages de type {Équipage de
   *  Big Mom} ayant un coût de 3 ou moins. */
  "ST20-004": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const eligible = seat?.characters.filter((c) => {
        if (!c.rested) return false;
        const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
        if (!meta || meta.kind !== "character") return false;
        if (meta.cost > 3) return false;
        return meta.types.some((t) =>
          t.toLowerCase().includes("équipage de big mom"),
        );
      });
      if (!eligible || eligible.length === 0) {
        ctx.battle.log(
          "Charlotte Pudding : aucun Persos Big Mom ≤ 3 à redresser.",
        );
        return;
      }
      // Le coût Vie→main est obligatoire pour activer l'effet.
      ctx.battle.takeLifeToHand(ctx.sourceSeat);
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST20-004",
        sourceUid: ctx.sourceUid,
        kind: "buff-target",
        prompt:
          "Charlotte Pudding : choisis un Persos Big Mom ≤ 3 à redresser (1 Vie ajoutée à la main).",
        params: {
          allowLeader: false,
          maxCost: 3,
          requireType: "Équipage de Big Mom",
          onlyRested: true,
        },
        cancellable: false,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const target = ctx.choice.selection.targetUid;
      if (target === "leader") return;
      ctx.battle.untapCharacter(ctx.sourceSeat, target);
      ctx.battle.log("Charlotte Pudding : Persos Big Mom redressé.");
    }
  },

  /** OP09-027 Sabo (Char)
   *  [En attaquant] [Une fois par tour] Si vous avez 3 Personnages ou
   *  plus épuisés, piochez 1 carte. (Auto, pas de PendingChoice). */
  "OP09-027": (ctx) => {
    if (ctx.hook !== "on-attack") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    if (!seat) return;
    const restedCount = seat.characters.filter((c) => c.rested).length;
    if (restedCount < 3) return; // condition pas remplie
    ctx.battle.drawCards(ctx.sourceSeat, 1);
    ctx.battle.log(
      "Sabo : 3+ Persos épuisés, pioche 1 carte ([En attaquant] [1×/tour]).",
    );
  },

  // ─── BATCH 9 — bounce + untap leader + adverse forced ─────────────────

  /** OP09-087 Charlotte Pudding (Char)
   *  [Jouée] Si votre adversaire a 5 cartes ou plus dans sa main, il doit
   *  défausser 1 carte de sa main. */
  "OP09-087": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const opponentSeat: OnePieceBattleSeatId =
      ctx.sourceSeat === "p1" ? "p2" : "p1";
    const opp = ctx.battle.getSeat(opponentSeat);
    if (!opp || opp.handSize < 5) {
      ctx.battle.log(
        "Charlotte Pudding : main adverse < 5 cartes, effet annulé.",
      );
      return;
    }
    // Défausse forcée — random pour rester auto.
    ctx.battle.discardRandom(opponentSeat, 1);
    ctx.battle.log(
      "Charlotte Pudding : adversaire défausse 1 carte au hasard.",
    );
  },

  /** OP09-088 Shiliew
   *  [DON!! x1] [En attaquant] Vous pouvez défausser 2 cartes de votre
   *  main : Piochez 2 cartes. */
  "OP09-088": (ctx) => {
    if (ctx.hook !== "on-attack") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    const c = seat?.characters.find((x) => x.uid === ctx.sourceUid);
    if (!c || c.attachedDon < 1) return; // [DON!! x1] requirement
    if (!seat || seat.handSize < 2) return; // pas assez à défausser
    ctx.battle.discardRandom(ctx.sourceSeat, 2);
    ctx.battle.drawCards(ctx.sourceSeat, 2);
    ctx.battle.log(
      "Shiliew : défausse 2 et pioche 2 ([DON!! x1] [En attaquant]).",
    );
  },

  /** OP09-058 Maggy Ball spéciale (Event)
   *  [Principale] Votre adversaire doit renvoyer à la main de son
   *  propriétaire 1 de ses Personnages ayant un coût de 6 ou moins.
   *  L'adversaire fait le choix (forcé). */
  "OP09-058": (ctx) => {
    if (ctx.hook === "on-play") {
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const opp = ctx.battle.getSeat(opponentSeat);
      if (!opp || opp.characters.length === 0) {
        ctx.battle.log(
          "Maggy Ball : aucun Persos adverse à renvoyer en main.",
        );
        return;
      }
      ctx.battle.requestChoice({
        seat: opponentSeat,
        sourceCardNumber: "OP09-058",
        sourceUid: ctx.sourceUid,
        kind: "ko-character-own",
        prompt:
          "Maggy Ball spéciale : ton adversaire t'oblige à renvoyer 1 de tes Persos (coût ≤ 6) à ta main.",
        params: { maxCost: 6 },
        cancellable: false,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      // Le choix a été fait par l'adversaire. La cible est dans son board.
      const targetSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.bounceCharacter(
        targetSeat,
        ctx.choice.selection.targetUid,
      );
      ctx.battle.log("Maggy Ball : Persos adverse renvoyé à sa main.");
    }
  },

  /** OP09-064 Killer
   *  [Jouée] DON!! -1 (vous pouvez renvoyer 1 DON!! au deck DON) :
   *  Redressez jusqu'à 1 de vos Leaders de type {Équipage de Kidd}.
   *  Le coût DON-1 est skip (juste le buff Leader si applicable). */
  "OP09-064": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    const leaderMeta = seat?.leaderId
      ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
      : null;
    const isKidd = leaderMeta?.types.some((t) =>
      t.toLowerCase().includes("équipage de kidd"),
    );
    if (!isKidd) {
      ctx.battle.log("Killer : Leader pas Équipage de Kidd, effet annulé.");
      return;
    }
    if (!seat?.leaderRested) {
      ctx.battle.log("Killer : Leader déjà redressé.");
      return;
    }
    ctx.battle.untapLeader(ctx.sourceSeat);
    ctx.battle.log("Killer : Leader Équipage de Kidd redressé.");
  },

  /** ST17-003 Baggy
   *  [Jouée] Regardez 3 cartes du dessus de votre deck, réorganisez-les
   *  dans l'ordre de votre choix et placez-les au-dessus de votre deck.
   *  Sans UI reorder, l'effet est purement informatif (l'ordre actuel est
   *  préservé — fonctionnellement équivalent côté moteur). */
  "ST17-003": (ctx) => {
    if (ctx.hook !== "on-play") return;
    ctx.battle.log(
      "Baggy : regarde le top 3 du deck (réorganisation manuelle non implémentée).",
    );
  },

  // ─── BATCH 13 — cost-buffs ──────────────────────────────────────────────

  /** ST19-003 Tashigi
   *  [Jouée] Si votre Leader est [Smoker], réduisez de -4 le coût de
   *  jusqu'à 1 Personnage adverse pour tout le tour. */
  "ST19-003": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const leaderMeta = seat?.leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
        : null;
      if (leaderMeta?.name !== "Smoker") {
        ctx.battle.log("Tashigi : Leader pas Smoker, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST19-003",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt: "Tashigi : choisis un Persos adverse à -4 coût pour ce tour.",
        params: { allowLeader: false },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const target = ctx.choice.selection.targetUid;
      if (target === "leader") return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.addCostBuff(
        { kind: "character", seat: opponentSeat, uid: target },
        -4,
      );
      ctx.battle.log("Tashigi : -4 coût pour ce tour.");
    }
  },

  /** OP09-083 Van Auger
   *  [Activation : Principale] Vous pouvez épuiser ce Personnage : Si
   *  votre Leader est de type {Équipage de Barbe Noire}, réduisez de
   *  -3 le coût de jusqu'à 1 Personnage adverse pour tout le tour. */
  "OP09-083": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const leaderMeta = seat?.leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
        : null;
      const isBN = leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("équipage de barbe noire"),
      );
      if (!isBN) {
        ctx.battle.log("Van Auger : Leader pas Barbe Noire, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-083",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt: "Van Auger : choisis un Persos adverse à -3 coût pour ce tour.",
        params: { allowLeader: false },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const target = ctx.choice.selection.targetUid;
      if (target === "leader") return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.addCostBuff(
        { kind: "character", seat: opponentSeat, uid: target },
        -3,
      );
      ctx.battle.log("Van Auger : -3 coût pour ce tour.");
    }
  },

  // ─── BATCH 14 — [En cas de KO] avec [DON!! xN] ──────────────────────────

  /** ST21-004 Jewelry Bonney
   *  [DON!! x2] [En cas de KO] Piochez 1 carte. */
  "ST21-004": (ctx) => {
    if (ctx.hook !== "on-ko") return;
    // Au moment du KO, ctx.sourceUid pointe vers la carte qui était sur
    // le board. Mais elle a déjà été retirée — on ne peut pas re-checker
    // attachedDon. On accepte la condition comme remplie tant que
    // l'effet est déclenché (le moteur n'est pas assez précis pour
    // figer attachedDon avant retrait — compromis).
    ctx.battle.drawCards(ctx.sourceSeat, 1);
    ctx.battle.log(
      "Jewelry Bonney : pioche 1 carte ([DON!! x2] [En cas de KO]).",
    );
  },

  /** OP09-015 Lucky Roo
   *  [Bloqueur] (déjà géré)
   *  [En cas de KO] Si votre Leader est de type {Équipage du Roux},
   *  piochez 1 carte. */
  "OP09-015": (ctx) => {
    if (ctx.hook !== "on-ko") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    const leaderMeta = seat?.leaderId
      ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
      : null;
    const isRoux = leaderMeta?.types.some((t) =>
      t.toLowerCase().includes("équipage du roux"),
    );
    if (!isRoux) return;
    ctx.battle.drawCards(ctx.sourceSeat, 1);
    ctx.battle.log("Lucky Roo : pioche 1 carte (Leader Roux + KO).");
  },

  // ─── BATCH 15 — Place above/below Life ──────────────────────────────────

  /** OP09-104 Sabo
   *  [Jouée] Ajoutez face visible au-dessus de votre Vie jusqu'à 1 carte
   *  Personnage de type {Armée révolutionnaire} de votre main. Puis, si
   *  vous avez 2 cartes ou plus dans votre Vie, ajoutez à votre main 1
   *  carte du dessus de votre Vie. */
  "OP09-104": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-104",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt:
          "Sabo : choisis 1 Persos {Armée révolutionnaire} de ta main à placer au-dessus de ta Vie.",
        params: { count: 1, requireType: "Armée révolutionnaire" },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (
        !ctx.choice.skipped &&
        ctx.choice.selection.handIndices &&
        ctx.choice.selection.handIndices.length > 0
      ) {
        ctx.battle.placeCardAboveLife(ctx.sourceSeat, {
          kind: "hand",
          handIndex: ctx.choice.selection.handIndices[0],
        });
        ctx.battle.log(
          "Sabo : Persos Armée révolutionnaire placé au-dessus de la Vie.",
        );
      }
      // 2ᵉ effet conditionnel : si Vies ≥ 2, ajoute 1 Vie en main.
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (seat && seat.lifeCount >= 2) {
        ctx.battle.takeLifeToHand(ctx.sourceSeat);
        ctx.battle.log("Sabo : 1 Vie ajoutée à la main.");
      }
    }
  },

  /** ST07-005 Charlotte Daifuku
   *  [DON!! x1] [En attaquant] Vous pouvez ajouter à votre main 1 carte
   *  du dessus ou du dessous de votre Vie : Ajoutez au-dessus de votre
   *  Vie jusqu'à 1 carte du dessus de votre deck. */
  "ST07-005": (ctx) => {
    if (ctx.hook !== "on-attack") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    const c = seat?.characters.find((x) => x.uid === ctx.sourceUid);
    if (!c || c.attachedDon < 1) return;
    if (!seat || seat.lifeCount === 0 || seat.deckSize === 0) return;
    // Coût : ajoute 1 Vie en main.
    ctx.battle.takeLifeToHand(ctx.sourceSeat);
    // Effet : place top deck en Vie.
    ctx.battle.placeCardAboveLife(ctx.sourceSeat, { kind: "deck-top" });
    ctx.battle.log(
      "Charlotte Daifuku : Vie échangée contre carte du dessus du deck.",
    );
  },

  /** OP09-101 Kuzan
   *  [Jouée] Placez face visible au-dessus ou au-dessous de la Vie
   *  adverse 1 Personnage adverse ayant un coût de 3 ou moins : Votre
   *  adversaire doit défausser 1 carte de sa main. */
  "OP09-101": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-101",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt:
          "Kuzan : choisis un Persos adverse à placer en Vie adverse (coût ≤ 3).",
        params: { maxCost: 3 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const opponentSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.placeCardAboveLife(opponentSeat, {
        kind: "character",
        uid: ctx.choice.selection.targetUid,
      });
      // L'adversaire défausse 1 (random pour rester auto).
      ctx.battle.discardRandom(opponentSeat, 1);
      ctx.battle.log(
        "Kuzan : Persos placé en Vie adverse, adversaire défausse 1 carte.",
      );
    }
  },

  // ─── BATCH 16 — Reorder top deck + placeHandOnTop ───────────────────────

  /** ST17-001 Crocodile
   *  [Jouée] Révélez 1 carte du dessus de votre deck ; si elle est de
   *  type {Sept grands corsaires}, piochez 2 cartes et placez 1 carte de
   *  votre main au-dessus de votre deck. */
  "ST17-001": (ctx) => {
    if (ctx.hook === "on-play") {
      const topCardId = ctx.battle.peekTopOfDeck(ctx.sourceSeat);
      if (!topCardId) {
        ctx.battle.log("Crocodile : deck vide.");
        return;
      }
      const meta = ONEPIECE_BASE_SET_BY_ID.get(topCardId);
      const isCorsair = meta?.types.some((t) =>
        t.toLowerCase().includes("sept grands corsaires"),
      );
      if (!isCorsair) {
        ctx.battle.log(
          `Crocodile : ${meta?.name ?? "?"} révélée mais pas Sept grands corsaires.`,
        );
        return;
      }
      ctx.battle.drawCards(ctx.sourceSeat, 2);
      ctx.battle.log(
        `Crocodile : ${meta?.name ?? "?"} = Sept grands corsaires, pioche 2 cartes.`,
      );
      // Demande au joueur quelle carte main placer sur le deck.
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat || seat.handSize === 0) return;
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST17-001",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt:
          "Crocodile : choisis 1 carte de ta main à placer au-dessus du deck.",
        params: { count: 1 },
        cancellable: false,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (
        !ctx.choice.skipped &&
        ctx.choice.selection.handIndices &&
        ctx.choice.selection.handIndices.length > 0
      ) {
        ctx.battle.placeHandOnTopOfDeck(
          ctx.sourceSeat,
          ctx.choice.selection.handIndices[0],
        );
        ctx.battle.log("Crocodile : carte main placée au-dessus du deck.");
      }
    }
  },

  /** ST17-005 Marshall D. Teach
   *  [Activation : Principale] [Une fois par tour] Vous pouvez placer
   *  1 carte de votre main au-dessus de votre deck : Donnez jusqu'à 2
   *  cartes DON!! épuisées à votre Leader ou à 1 de vos Personnages. */
  "ST17-005": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat || seat.handSize === 0) {
        ctx.battle.log("Marshall D. Teach : main vide, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST17-005",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt:
          "Marshall D. Teach : choisis 1 carte de ta main à placer au-dessus du deck (coût pour donner 2 DON).",
        params: { count: 1 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      // Étape 1 : carte main → top deck.
      if (
        !ctx.choice.skipped &&
        ctx.choice.selection.handIndices &&
        ctx.choice.selection.handIndices.length > 0
      ) {
        ctx.battle.placeHandOnTopOfDeck(
          ctx.sourceSeat,
          ctx.choice.selection.handIndices[0],
        );
        // Étape 2 : ouvre buff-target pour les 2 DON.
        ctx.battle.requestChoice({
          seat: ctx.sourceSeat,
          sourceCardNumber: "ST17-005",
          sourceUid: ctx.sourceUid,
          kind: "buff-target",
          prompt:
            "Marshall D. Teach : choisis une cible pour 2 DON!! épuisées.",
          params: { allowLeader: true },
          cancellable: true,
        });
        return;
      }
      // Étape 2bis : la cible des DON est choisie.
      if (ctx.choice.selection.targetUid) {
        const target = ctx.choice.selection.targetUid;
        const ref: CardRef =
          target === "leader"
            ? { kind: "leader", seat: ctx.sourceSeat }
            : { kind: "character", seat: ctx.sourceSeat, uid: target };
        const attached = ctx.battle.attachDonToTarget(ref, 2);
        ctx.battle.log(
          `Marshall D. Teach : ${attached} DON!! attachée(s).`,
        );
      }
    }
  },

  // ─── Plus d'effets à venir au fil des sessions ───
  // Les batches suivants étendront ce registre. La majorité des effets
  // restants nécessitent l'infra PendingChoice (ciblage joueur).
};

/** Récupère le cardNumber depuis un cardId (avec ou sans suffixe variante). */
export function cardNumberOf(cardId: string): string {
  return cardId.replace(/_p\d+$/, "");
}

// ─── Registre des modificateurs de puissance passifs ────────────────────
// Indexé par cardNumber. À chaque calcul de power, le moteur itère sur
// toutes les cartes en jeu (Leaders + Persos + Stage des deux seats) et
// appelle le mod correspondant si présent. La somme des deltas s'ajoute
// au power de base.

export const PASSIVE_POWER_MODS: Record<string, PassivePowerMod> = {
  /** OP09-004 Shanks (Char) — "Tous les Personnages adverses perdent
   *  -1000 de puissance." Buff global passif sur les Persos adverses. */
  "OP09-004": (ctx) => {
    if (ctx.target.kind !== "character") return 0;
    if (ctx.target.seat === ctx.modSourceSeat) return 0;
    return -1000;
  },

  /** OP02-019 Rakuyo — "[DON!! x1] [Votre tour] Tous vos Personnages
   *  incluant «Équipage de Barbe Blanche» dans leur type gagnent +1000
   *  de puissance." */
  "OP02-019": (ctx) => {
    if (ctx.target.kind !== "character") return 0;
    if (ctx.target.seat !== ctx.modSourceSeat) return 0;
    if (ctx.activeSeat !== ctx.modSourceSeat) return 0;
    const seat = ctx.battle.getSeat(ctx.modSourceSeat);
    if (!seat) return 0;
    const rakuyo = seat.characters.find((c) => c.uid === ctx.modSourceUid);
    if (!rakuyo || rakuyo.attachedDon < 1) return 0;
    const targetUid = ctx.target.uid;
    const tgt = seat.characters.find((c) => c.uid === targetUid);
    if (!tgt) return 0;
    const meta = ONEPIECE_BASE_SET_BY_ID.get(tgt.cardId);
    if (
      !meta?.types.some((t) =>
        t.toLowerCase().includes("équipage de barbe blanche"),
      )
    )
      return 0;
    return 1000;
  },

  /** ST21-002 Usopp — "[DON!! x2] [Tour adverse] Ce Personnage gagne
   *  +2000 de puissance." */
  "ST21-002": (ctx) => {
    if (ctx.target.kind !== "character") return 0;
    if (ctx.target.seat !== ctx.modSourceSeat) return 0;
    if (ctx.target.uid !== ctx.modSourceUid) return 0;
    if (ctx.activeSeat === ctx.modSourceSeat) return 0;
    const seat = ctx.battle.getSeat(ctx.modSourceSeat);
    const me = seat?.characters.find((c) => c.uid === ctx.modSourceUid);
    if (!me || me.attachedDon < 2) return 0;
    return 2000;
  },

  /** ST21-011 Franky — "[DON!! x2] [Tour adverse] Tous vos Personnages
   *  de type {Équipage de Chapeau de paille} ayant 4000 de puissance de
   *  base ou moins gagnent +1000 de puissance." */
  "ST21-011": (ctx) => {
    if (ctx.activeSeat === ctx.modSourceSeat) return 0;
    if (ctx.target.kind !== "character") return 0;
    if (ctx.target.seat !== ctx.modSourceSeat) return 0;
    const seat = ctx.battle.getSeat(ctx.modSourceSeat);
    if (!seat) return 0;
    const franky = seat.characters.find((c) => c.uid === ctx.modSourceUid);
    if (!franky || franky.attachedDon < 2) return 0;
    const targetUid = ctx.target.uid;
    const tgt = seat.characters.find((c) => c.uid === targetUid);
    if (!tgt) return 0;
    const meta = ONEPIECE_BASE_SET_BY_ID.get(tgt.cardId);
    if (
      !meta ||
      meta.kind !== "character" ||
      meta.power > 4000 ||
      !meta.types.some((t) =>
        t.toLowerCase().includes("équipage de chapeau de paille"),
      )
    )
      return 0;
    return 1000;
  },

  /** ST16-005 Monkey D. Luffy — "Si une de vos [Uta] est épuisée, ce
   *  Personnage gagne +1000 de puissance." */
  "ST16-005": (ctx) => {
    if (ctx.target.kind !== "character") return 0;
    if (ctx.target.seat !== ctx.modSourceSeat) return 0;
    if (ctx.target.uid !== ctx.modSourceUid) return 0;
    const seat = ctx.battle.getSeat(ctx.modSourceSeat);
    if (!seat) return 0;
    const hasRestedUta = seat.characters.some((c) => {
      if (!c.rested) return false;
      const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
      return meta?.name === "Uta";
    });
    return hasRestedUta ? 1000 : 0;
  },

  /** ST16-003 Charlotte Katakuri — "Si votre Leader est de type {FILM} et
   *  que vous avez 6 cartes ou plus épuisées, ce Personnage gagne +2000
   *  de puissance." */
  "ST16-003": (ctx) => {
    if (ctx.target.kind !== "character") return 0;
    if (ctx.target.seat !== ctx.modSourceSeat) return 0;
    if (ctx.target.uid !== ctx.modSourceUid) return 0;
    const seat = ctx.battle.getSeat(ctx.modSourceSeat);
    if (!seat?.leaderId) return 0;
    const leaderMeta = ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId);
    if (!leaderMeta?.types.some((t) => t.toLowerCase().includes("film")))
      return 0;
    const restedCount = seat.characters.filter((c) => c.rested).length;
    if (restedCount < 6) return 0;
    return 2000;
  },

  /** OP09-086 Jesus Burgess — "Si votre Leader est de type {Équipage de
   *  Barbe Noire}, pour chaque tranche de 4 cartes dans votre Défausse,
   *  ce Personnage gagne +1000 de puissance." */
  "OP09-086": (ctx) => {
    if (ctx.target.kind !== "character") return 0;
    if (ctx.target.seat !== ctx.modSourceSeat) return 0;
    if (ctx.target.uid !== ctx.modSourceUid) return 0;
    const seat = ctx.battle.getSeat(ctx.modSourceSeat);
    if (!seat?.leaderId) return 0;
    const leaderMeta = ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId);
    if (
      !leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("équipage de barbe noire"),
      )
    )
      return 0;
    return Math.floor(seat.discardSize / 4) * 1000;
  },
};

// ─── Registre des guards d'immunité KO ──────────────────────────────────

export const KO_GUARDS: Record<string, KoGuard> = {
  /** OP03-079 Vergo — "[DON!! x1] Ce Personnage ne peut pas être mis KO
   *  en combat." */
  "OP03-079": (ctx) => {
    if (ctx.source !== "combat") return false;
    if (ctx.target.uid !== ctx.modSourceUid) return false;
    if (ctx.target.seat !== ctx.modSourceSeat) return false;
    const seat = ctx.battle.getSeat(ctx.modSourceSeat);
    const me = seat?.characters.find((c) => c.uid === ctx.modSourceUid);
    return !!me && me.attachedDon >= 1;
  },

  /** OP09-025 Crocodile — "Si votre Leader est de type {ODYSSEY}, ce
   *  Personnage ne peut pas être mis KO par le Leader adverse en combat."
   *  Note : le moteur ne distingue pas "par Leader" vs "par Persos" en
   *  combat — on bloque tous les KO combat (légère permissivité). */
  "OP09-025": (ctx) => {
    if (ctx.source !== "combat") return false;
    if (ctx.target.uid !== ctx.modSourceUid) return false;
    if (ctx.target.seat !== ctx.modSourceSeat) return false;
    const seat = ctx.battle.getSeat(ctx.modSourceSeat);
    if (!seat?.leaderId) return false;
    const leaderMeta = ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId);
    return !!leaderMeta?.types.some((t) =>
      t.toLowerCase().includes("odyssey"),
    );
  },

  /** OP09-033 Nico Robin — "Si vous avez 2 Personnages ou plus épuisés,
   *  tous vos Personnages de type {ODYSSEY} ou {Équipage de Chapeau de
   *  paille} ne peuvent pas être mis KO par un effet jusqu'à la fin du
   *  prochain tour adverse." Implémentation simplifiée : couvre uniquement
   *  les KO par effet (pas combat) tant que la condition est vraie. */
  "OP09-033": (ctx) => {
    if (ctx.source !== "effect") return false;
    if (ctx.target.seat !== ctx.modSourceSeat) return false;
    const seat = ctx.battle.getSeat(ctx.modSourceSeat);
    if (!seat) return false;
    const restedCount = seat.characters.filter((c) => c.rested).length;
    if (restedCount < 2) return false;
    const targetMeta = ONEPIECE_BASE_SET_BY_ID.get(ctx.target.cardId);
    if (!targetMeta) return false;
    const matches = targetMeta.types.some(
      (t) =>
        t.toLowerCase().includes("odyssey") ||
        t.toLowerCase().includes("équipage de chapeau de paille"),
    );
    return matches;
  },

  /** OP09-045 Cabaji — "Si vous avez un Personnage [Baggy] ou [Morge],
   *  ce Personnage ne peut pas être mis KO en combat." */
  "OP09-045": (ctx) => {
    if (ctx.source !== "combat") return false;
    if (ctx.target.uid !== ctx.modSourceUid) return false;
    if (ctx.target.seat !== ctx.modSourceSeat) return false;
    const seat = ctx.battle.getSeat(ctx.modSourceSeat);
    if (!seat) return false;
    return seat.characters.some((c) => {
      const m = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
      return m?.name === "Baggy" || m?.name === "Morge";
    });
  },
};

// ─── Registre des listeners on-leave-field ──────────────────────────────

export const LEAVE_FIELD_LISTENERS: Record<string, LeaveFieldListener> = {
  /** OP09-080 Thousand Sunny (Stage)
   *  [Tour adverse] Vous pouvez épuiser ce Lieu : Quand un de vos
   *  Personnages de type {Équipage de Chapeau de paille} quitte le terrain
   *  à cause d'un effet adverse, ajoutez jusqu'à 1 carte DON!! épuisée
   *  de votre deck DON!! sur votre terrain.
   *  Implémentation simplifiée : auto-trigger (sans choix d'épuiser le
   *  Lieu manuellement) quand un Persos Chapeau quitte par effet adverse. */
  "OP09-080": (ctx) => {
    if (ctx.reason !== "ko-effect" && ctx.reason !== "bounce") return;
    if (ctx.leaving.seat !== ctx.modSourceSeat) return; // doit être un de mes Persos
    const meta = ONEPIECE_BASE_SET_BY_ID.get(ctx.leaving.cardId);
    if (
      !meta?.types.some((t) =>
        t.toLowerCase().includes("équipage de chapeau de paille"),
      )
    )
      return;
    // Ajoute 1 DON depuis le DON deck à la pool active du seat.
    ctx.battle.giveDonFromDeck(ctx.modSourceSeat, 1);
    ctx.battle.log(
      "Thousand Sunny : Persos Chapeau quitte le terrain → +1 DON.",
    );
  },
};

/** Évalue tous les listeners on-leave-field pour une carte qui quitte. */
export function fireOnLeaveField(
  leaving: { seat: OnePieceBattleSeatId; uid: string; cardId: string },
  reason: "ko-combat" | "ko-effect" | "bounce" | "place-bottom",
  battle: BattleEffectAccess,
): void {
  for (const seatId of ["p1", "p2"] as const) {
    const seat = battle.getSeat(seatId);
    if (!seat) continue;
    // Leader
    if (seat.leaderId) {
      const num = cardNumberOf(seat.leaderId);
      const listener = LEAVE_FIELD_LISTENERS[num];
      if (listener) {
        try {
          listener({
            leaving,
            reason,
            modSourceSeat: seatId,
            modSourceUid: "leader",
            battle,
          });
        } catch {
          // ignore
        }
      }
    }
    // Persos
    for (const c of seat.characters) {
      const num = cardNumberOf(c.cardId);
      const listener = LEAVE_FIELD_LISTENERS[num];
      if (listener) {
        try {
          listener({
            leaving,
            reason,
            modSourceSeat: seatId,
            modSourceUid: c.uid,
            battle,
          });
        } catch {
          // ignore
        }
      }
    }
    // Stage (le Stage peut écouter on-leave-field, c'est même son cas
    // d'usage principal — Thousand Sunny).
    if (seat.stage) {
      const num = cardNumberOf(seat.stage.cardId);
      const listener = LEAVE_FIELD_LISTENERS[num];
      if (listener) {
        try {
          listener({
            leaving,
            reason,
            modSourceSeat: seatId,
            modSourceUid: seat.stage.uid,
            battle,
          });
        } catch {
          // ignore
        }
      }
    }
  }
}

// ─── Registre des grants de mots-clés dynamiques ─────────────────────────

export const KEYWORD_GRANTS: Record<string, KeywordGrant> = {
  /** OP02-008 Joz — "[DON!! x1] Si vous avez 2 cartes ou moins dans votre
   *  Vie et que votre Leader inclut «Équipage de Barbe Blanche» dans son
   *  type, ce Personnage gagne [Initiative]." */
  "OP02-008": (ctx) => {
    if (ctx.target.uid !== ctx.modSourceUid) return [];
    if (ctx.target.seat !== ctx.modSourceSeat) return [];
    const seat = ctx.battle.getSeat(ctx.modSourceSeat);
    if (!seat) return [];
    if (seat.lifeCount > 2) return [];
    if (!seat.leaderId) return [];
    const leaderMeta = ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId);
    if (
      !leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("équipage de barbe blanche"),
      )
    )
      return [];
    const me = seat.characters.find((c) => c.uid === ctx.modSourceUid);
    if (!me || me.attachedDon < 1) return [];
    return ["Initiative"];
  },

  /** OP05-070 Fransuké — "[DON!! x1] Si vous avez 8 cartes DON!! ou plus
   *  sur votre terrain, ce Personnage gagne [Initiative]." */
  "OP05-070": (ctx) => {
    if (ctx.target.uid !== ctx.modSourceUid) return [];
    if (ctx.target.seat !== ctx.modSourceSeat) return [];
    const seat = ctx.battle.getSeat(ctx.modSourceSeat);
    if (!seat) return [];
    const me = seat.characters.find((c) => c.uid === ctx.modSourceUid);
    if (!me || me.attachedDon < 1) return [];
    const totalDon =
      seat.donActive +
      seat.donRested +
      seat.leaderAttachedDon +
      seat.characters.reduce((s, c) => s + c.attachedDon, 0);
    return totalDon >= 8 ? ["Initiative"] : [];
  },

  /** OP09-017 Wire — "[DON!! x1] Si votre Leader est de type {Équipage
   *  de Kidd} et a 7000 de puissance ou plus, ce Personnage gagne
   *  [Initiative]." */
  "OP09-017": (ctx) => {
    if (ctx.target.uid !== ctx.modSourceUid) return [];
    if (ctx.target.seat !== ctx.modSourceSeat) return [];
    const seat = ctx.battle.getSeat(ctx.modSourceSeat);
    if (!seat?.leaderId) return [];
    const leaderMeta = ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId);
    if (
      !leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("équipage de kidd"),
      )
    )
      return [];
    if (leaderMeta.kind !== "leader") return [];
    const leaderPower = leaderMeta.power + seat.leaderAttachedDon * 1000;
    if (leaderPower < 7000) return [];
    const me = seat.characters.find((c) => c.uid === ctx.modSourceUid);
    if (!me || me.attachedDon < 1) return [];
    return ["Initiative"];
  },

  /** ST15-005 Portgas D. Ace — "Si votre Leader inclut «Équipage de
   *  Barbe Blanche» dans son type, ce Personnage gagne [Initiative]." */
  "ST15-005": (ctx) => {
    if (ctx.target.uid !== ctx.modSourceUid) return [];
    if (ctx.target.seat !== ctx.modSourceSeat) return [];
    const seat = ctx.battle.getSeat(ctx.modSourceSeat);
    if (!seat?.leaderId) return [];
    const leaderMeta = ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId);
    if (
      !leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("équipage de barbe blanche"),
      )
    )
      return [];
    return ["Initiative"];
  },

  /** ST21-015 Roronoa Zoro — "[DON!! x2] Ce Personnage gagne [Initiative]." */
  "ST21-015": (ctx) => {
    if (ctx.target.uid !== ctx.modSourceUid) return [];
    if (ctx.target.seat !== ctx.modSourceSeat) return [];
    const seat = ctx.battle.getSeat(ctx.modSourceSeat);
    const me = seat?.characters.find((c) => c.uid === ctx.modSourceUid);
    if (!me || me.attachedDon < 2) return [];
    return ["Initiative"];
  },
};

/** Évalue tous les grants de mots-clés pour une cible. Retourne le set de
 *  mots-clés accordés par les passifs des cartes en jeu. */
export function getGrantedKeywords(
  target: { seat: OnePieceBattleSeatId; uid: string; cardId: string },
  battle: BattleEffectAccess,
  activeSeat: OnePieceBattleSeatId | null,
): Set<string> {
  const set = new Set<string>();
  for (const seatId of ["p1", "p2"] as const) {
    const seat = battle.getSeat(seatId);
    if (!seat) continue;
    if (seat.leaderId) {
      const num = cardNumberOf(seat.leaderId);
      const grant = KEYWORD_GRANTS[num];
      if (grant) {
        try {
          for (const kw of grant({
            target,
            modSourceSeat: seatId,
            modSourceUid: "leader",
            activeSeat,
            battle,
          })) {
            set.add(kw);
          }
        } catch {
          // ignore
        }
      }
    }
    for (const c of seat.characters) {
      const num = cardNumberOf(c.cardId);
      const grant = KEYWORD_GRANTS[num];
      if (grant) {
        try {
          for (const kw of grant({
            target,
            modSourceSeat: seatId,
            modSourceUid: c.uid,
            activeSeat,
            battle,
          })) {
            set.add(kw);
          }
        } catch {
          // ignore
        }
      }
    }
  }
  return set;
}

/** Évalue toutes les guards d'immunité KO pour une cible. Retourne true si
 *  au moins un guard bloque le KO. */
export function isKoBlocked(
  target: { seat: OnePieceBattleSeatId; uid: string; cardId: string },
  source: "combat" | "effect",
  battle: BattleEffectAccess,
): boolean {
  for (const seatId of ["p1", "p2"] as const) {
    const seat = battle.getSeat(seatId);
    if (!seat) continue;
    if (seat.leaderId) {
      const num = cardNumberOf(seat.leaderId);
      const guard = KO_GUARDS[num];
      if (guard) {
        try {
          if (
            guard({
              target,
              source,
              modSourceSeat: seatId,
              modSourceUid: "leader",
              battle,
            })
          )
            return true;
        } catch {
          // ignore
        }
      }
    }
    for (const c of seat.characters) {
      const num = cardNumberOf(c.cardId);
      const guard = KO_GUARDS[num];
      if (guard) {
        try {
          if (
            guard({
              target,
              source,
              modSourceSeat: seatId,
              modSourceUid: c.uid,
              battle,
            })
          )
            return true;
        } catch {
          // ignore
        }
      }
    }
  }
  return false;
}

/** Évalue tous les modificateurs de puissance passifs pour une cible.
 *  Itère sur les cartes en jeu des deux seats (Leaders + Persos) et
 *  accumule les deltas. Retourne le delta total. */
export function applyAllPowerMods(
  target: CardRef,
  situation: "attack" | "defend" | "global",
  battle: BattleEffectAccess,
  activeSeat: OnePieceBattleSeatId | null,
): number {
  let delta = 0;
  for (const seatId of ["p1", "p2"] as const) {
    const seat = battle.getSeat(seatId);
    if (!seat) continue;
    // Leader
    if (seat.leaderId) {
      const num = cardNumberOf(seat.leaderId);
      const mod = PASSIVE_POWER_MODS[num];
      if (mod) {
        try {
          delta += mod({
            target,
            situation,
            modSourceSeat: seatId,
            modSourceUid: "leader",
            activeSeat,
            battle,
          });
        } catch {
          // ignore handler errors
        }
      }
    }
    // Characters
    for (const c of seat.characters) {
      const num = cardNumberOf(c.cardId);
      const mod = PASSIVE_POWER_MODS[num];
      if (mod) {
        try {
          delta += mod({
            target,
            situation,
            modSourceSeat: seatId,
            modSourceUid: c.uid,
            activeSeat,
            battle,
          });
        } catch {
          // ignore handler errors
        }
      }
    }
  }
  return delta;
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
