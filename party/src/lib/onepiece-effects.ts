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
  | "on-don-returned" // 1+ carte(s) DON de mon terrain renvoyée(s) au DON deck
  | "on-being-attacked" // Cette carte est devenue la cible d'une attaque adverse
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

  /** Variante de searchDeckTopForType qui filtre par carte ayant un Trigger
   *  (meta.trigger != null). Utilisé par OP09-102 Professeur Clover et
   *  OP09-117 Dereshi. `extractCount` limite le nombre de cartes ajoutées
   *  à la main (1 ou 2). Retourne la liste des cardIds extraits. */
  searchDeckTopForTrigger(
    seat: OnePieceBattleSeatId,
    count: number,
    extractCount: number,
    restGoesTo: SearchRestPlacement,
    excludeName?: string,
  ): string[];

  /** Variante qui cherche les cartes Évents de la couleur donnée (utilisé
   *  par OP09-050 Nami). Retourne le cardId du premier Évent matchant ou
   *  null. Filtre : meta.kind === "event" ET meta.color inclut `color`. */
  searchDeckTopForEvent(
    seat: OnePieceBattleSeatId,
    count: number,
    color: string,
    restGoesTo: SearchRestPlacement,
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

  /** Place une carte de la main au-dessous du deck (bottom). Utilisé par
   *  Île de Lacrahn-Ri (OP09-060). Retourne le cardId placé ou null. */
  placeHandAtDeckBottom(
    seat: OnePieceBattleSeatId,
    handIndex: number,
  ): string | null;

  /** Joue un Personnage de la main directement sans payer son coût. Utilisé
   *  par les effets type Crocodile («Jouez 1 carte Personnage de votre
   *  main»), Trafalgar Law, Lim, Baggy. La carte est posée sur le terrain
   *  (rested ou non), playedThisTurn = true (donc ne peut attaquer que
   *  si Initiative). Le hook on-play est déclenché. Retourne l'uid posé
   *  ou null si terrain plein / index invalide / pas un Persos. */
  playCharacterFromHand(
    seat: OnePieceBattleSeatId,
    handIndex: number,
    options?: { rested?: boolean },
  ): string | null;

  /** Joue un Personnage de la défausse directement sans payer son coût.
   *  Utilisé par les effets type Gecko Moria, Sanji on-ko. La carte est
   *  posée sur le terrain (rested par défaut, peut être inversé), le hook
   *  on-play est déclenché. Retourne l'uid posé ou null. */
  playCharacterFromDiscard(
    seat: OnePieceBattleSeatId,
    discardIndex: number,
    options?: { rested?: boolean },
  ): string | null;

  /** Empêche un Persos d'activer [Bloqueur] pour le reste du tour. Utilisé
   *  par Limejuice (OP09-014) et Dawn Whip secondary (ST21-016). Retourne
   *  true si appliqué. */
  addNoBlockerThisTurn(seat: OnePieceBattleSeatId, uid: string): boolean;

  /** Empêche un Persos d'attaquer jusqu'à la fin du prochain tour adverse
   *  (Smoker ST19-001). Retourne true si appliqué. */
  addCannotAttackUntilNextOppTurnEnd(
    seat: OnePieceBattleSeatId,
    uid: string,
  ): boolean;

  /** Marque un Persos pour que ses prochaines attaques ce tour empêchent
   *  l'adversaire d'activer [Bloqueur] (ST21-003 Sanji). Retourne true si
   *  appliqué. */
  addNextAttackPreventsBlock(
    seat: OnePieceBattleSeatId,
    uid: string,
  ): boolean;

  /** Accorde un mot-clé temporaire à un Persos (Bloqueur, Double attaque,
   *  Exil) jusqu'à la fin du prochain tour adverse (Catarina Devon
   *  OP09-084). Retourne true si appliqué. */
  grantTempKeyword(
    seat: OnePieceBattleSeatId,
    uid: string,
    keyword: string,
  ): boolean;

  /** Annule les effets [Jouée] de l'adversaire jusqu'à la fin du prochain
   *  tour adverse (Marshall D. Teach Leader OP09-081 active). */
  cancelOpponentPlayedEffectsUntilEndOfTurn(seat: OnePieceBattleSeatId): void;

  /** Annule les effets d'une cible Leader/Persos adverse pour ce tour
   *  (Marshall D. Teach OP09-093). Le seat indique la cible (= adversaire
   *  de la source). uid = "leader" ou uid d'un Persos. */
  cancelEffectsOfTarget(seat: OnePieceBattleSeatId, uid: string): void;

  /** Déclare la victoire d'un seat — mute la game à phase=ended et
   *  désigne ce seat comme winner (Roger OP09-118 condition de victoire). */
  declareWinFor(seat: OnePieceBattleSeatId, reason: string): void;

  /** Marque la substitution KO comme utilisée ce tour pour un Persos
   *  (tracker 1/turn — Cracker, futurs autres). */
  markKoSubUsedThisTurn(seat: OnePieceBattleSeatId, uid: string): void;

  /** Variante interne de koCharacter qui ne consulte PAS le registre
   *  KO_SUBSTITUTES (évite les boucles infinies dans Monster qui
   *  veut explicitement KO ce Persos sans déclencher sa propre
   *  substitution). Toujours soumis aux KO_GUARDS d'immunité. */
  koCharacterDirect(seat: OnePieceBattleSeatId, uid: string): boolean;

  /** Tracker [Une fois par tour] générique pour les triggers automatiques
   *  (on-don-returned, on-being-attacked, etc.). Retourne true si le
   *  trigger n'a pas encore été utilisé ce tour, et le marque comme
   *  utilisé. Retourne false sinon. La clé est libre (ex. "bepo-don" +
   *  uid). Reset à end-turn. */
  consumeOncePerTurnTrigger(
    seat: OnePieceBattleSeatId,
    key: string,
  ): boolean;

  /** Pose un flag sur un seat valable jusqu'à la fin de son tour
   *  (Atmos ST15-001 "no-take-life-by-effect"). Reset à end-turn. */
  setTurnFlag(seat: OnePieceBattleSeatId, flag: string): void;

  /** Vérifie si un flag est posé sur un seat (utilisé par les API
   *  internes comme takeLifeToHand pour respecter Atmos). */
  hasTurnFlag(seat: OnePieceBattleSeatId, flag: string): boolean;

  /** Lit (sans retirer) la carte du dessus du deck. Pour les effets
   *  "Révélez 1 carte du dessus" (Crocodile ST17, Sanji char OP06-119). */
  peekTopOfDeck(seat: OnePieceBattleSeatId): string | null;

  /** Défausse les cartes aux indices donnés de la main du seat. Renvoie
   *  les cardId défaussés. Skip les indices invalides. */
  discardFromHand(
    seat: OnePieceBattleSeatId,
    handIndices: number[],
  ): string[];

  /** Renvoie N cartes DON!! du terrain au deck DON!!. Priorité : DON
   *  épuisées (active → rested → attached). Utilisé par les effets
   *  «Vous pouvez renvoyer à votre deck DON!! 1 carte DON!! ou plus de
   *  votre terrain» (Sanji, Brook, Nami, Zoro, Luffy, Chopper). Retourne
   *  le nombre effectivement renvoyé (peut être < count si pas assez). */
  returnDonFromBoard(seat: OnePieceBattleSeatId, count: number): number;

  /** Épuise N cartes DON!! actives du seat. Utilisé par les coûts
   *  «Vous pouvez épuiser N de vos cartes DON!!» (Adio, Laffitte, Lim).
   *  Retourne le nombre effectivement épuisé. */
  restDon(seat: OnePieceBattleSeatId, count: number): number;

  /** Place la carte du dessus de la Vie du seat dans la Défausse du même
   *  seat (utilisé par les effets type Nico Robin OP09-107 «placez dans
   *  sa Défausse 1 carte du dessus de sa Vie»). Retourne le cardId placé
   *  ou null si Vie vide. */
  placeOpponentLifeOnDiscard(seat: OnePieceBattleSeatId): string | null;

  /** Retourne le seat dont c'est le tour actuellement (ou null si pas de
   *  partie en cours). Utilisé par les passifs et listeners qui ont des
   *  conditions «[Tour adverse]» ou «[Votre tour]». */
  getActiveSeat(): OnePieceBattleSeatId | null;

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
  /** Présent uniquement quand hook === "on-don-returned". Nombre de cartes
   *  DON renvoyées dans cette action (1 minimum). */
  donReturnedCount?: number;
  /** Présent uniquement quand hook === "on-being-attacked". Uid de
   *  l'attaquant et de son seat. */
  attackedBy?: {
    seat: OnePieceBattleSeatId;
    uid: string;
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

  // ─── BATCH 18 — cards utilisant uniquement les APIs existantes ──────────

  /** OP09-005 Silvers Rayleigh
   *  [Jouée] Si votre adversaire a 2 Personnages ou plus ayant 5000 de
   *  puissance de base ou plus, piochez 2 cartes et défaussez 1 carte de
   *  votre main. */
  "OP09-005": (ctx) => {
    if (ctx.hook === "on-play") {
      const oppSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const opp = ctx.battle.getSeat(oppSeat);
      if (!opp) return;
      const big = opp.characters.filter((c) => {
        const m = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
        return m && m.kind === "character" && m.power >= 5000;
      }).length;
      if (big < 2) {
        ctx.battle.log(
          "Silvers Rayleigh : adversaire n'a pas 2 Persos 5000+, effet annulé.",
        );
        return;
      }
      ctx.battle.drawCards(ctx.sourceSeat, 2);
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-005",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt: "Silvers Rayleigh : défausse 1 carte de ta main.",
        params: { count: 1 },
        cancellable: false,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      ctx.battle.discardFromHand(
        ctx.sourceSeat,
        ctx.choice.selection.handIndices,
      );
      ctx.battle.log("Silvers Rayleigh : 2 cartes piochées, 1 défaussée.");
    }
  },

  /** OP09-007 Heat
   *  [Jouée] Jusqu'à 1 de vos Leaders ayant 4000 de puissance ou moins
   *  gagne +1000 de puissance pour tout le tour. */
  "OP09-007": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    if (!seat?.leaderId) return;
    const meta = ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId);
    if (!meta || meta.kind !== "leader") return;
    if (meta.power > 4000) {
      ctx.battle.log("Heat : Leader > 4000, effet annulé.");
      return;
    }
    ctx.battle.addPowerBuff(
      { kind: "leader", seat: ctx.sourceSeat },
      1000,
    );
    ctx.battle.log("Heat : Leader +1000 pour le tour.");
  },

  /** OP09-031 Don Quijote Doflamingo
   *  [Fin de votre tour] Si vous avez 2 Personnages ou plus épuisés,
   *  redressez ce Personnage. */
  "OP09-031": (ctx) => {
    if (ctx.hook !== "on-turn-end") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    if (!seat) return;
    const restedCount = seat.characters.filter((c) => c.rested).length;
    if (restedCount < 2) return;
    ctx.battle.untapCharacter(ctx.sourceSeat, ctx.sourceUid);
    ctx.battle.log("Doflamingo : redressé (2+ Persos épuisés).");
  },

  /** OP09-034 Perona
   *  [Jouée] Regardez 5 cartes du dessus de votre deck, révélez jusqu'à
   *  1 carte de type {Équipage de Thriller Bark} ou [Dracule Mihawk] et
   *  ajoutez-la à votre main. Puis, placez les cartes restantes au-dessous
   *  de votre deck dans l'ordre de votre choix et défaussez 1 carte de
   *  votre main. */
  "OP09-034": (ctx) => {
    if (ctx.hook === "on-play") {
      let found = ctx.battle.searchDeckTopForType(
        ctx.sourceSeat,
        5,
        "Équipage de Thriller Bark",
        "bottom",
      );
      if (!found) {
        // Fallback : nom Mihawk.
        found = ctx.battle.searchDeckTopForType(
          ctx.sourceSeat,
          0,
          "Dracule Mihawk",
          "bottom",
        );
      }
      ctx.battle.log(
        found
          ? "Perona : carte Thriller Bark / Mihawk ajoutée à la main."
          : "Perona : aucune carte révélée.",
      );
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-034",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt: "Perona : défausse 1 carte de ta main.",
        params: { count: 1 },
        cancellable: false,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      ctx.battle.discardFromHand(
        ctx.sourceSeat,
        ctx.choice.selection.handIndices,
      );
    }
  },

  /** OP09-036 Monkey D. Luffy
   *  [Jouée] Si vous avez 2 Personnages ou plus épuisés, épuisez jusqu'à 1
   *  carte DON!! adverse ou 1 Personnage adverse ayant un coût de 6 ou
   *  moins. (Implémentation simplifiée : on cible un Persos adverse via
   *  buff-target façon "rest-target" — le DON adverse n'est pas exposé.) */
  "OP09-036": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat) return;
      const restedCount = seat.characters.filter((c) => c.rested).length;
      if (restedCount < 2) {
        ctx.battle.log("Luffy : pas 2+ Persos épuisés, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-036",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt: "Luffy : choisis 1 Persos adverse à épuiser (coût ≤ 6).",
        params: { maxCost: 6 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const oppSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      // On utilise l'API restCharacter (pas KO).
      ctx.battle.restCharacter(oppSeat, ctx.choice.selection.targetUid);
      ctx.battle.log("Luffy : Persos adverse épuisé.");
    }
  },

  /** OP09-044 Izo
   *  [En attaquant] Regardez 5 cartes du dessus, révélez jusqu'à 1 carte
   *  de type {Pays de Wano} ou incluant «Équipage de Barbe Blanche» et
   *  ajoutez-la à votre main. Puis, placez les restantes au-dessous et
   *  défaussez 1 carte de votre main. */
  "OP09-044": (ctx) => {
    if (ctx.hook === "on-attack") {
      let found = ctx.battle.searchDeckTopForType(
        ctx.sourceSeat,
        5,
        "Pays de Wano",
        "bottom",
      );
      if (!found) {
        found = ctx.battle.searchDeckTopForType(
          ctx.sourceSeat,
          0,
          "Équipage de Barbe Blanche",
          "bottom",
        );
      }
      ctx.battle.log(
        found
          ? "Izo : carte Wano / Barbe Blanche ajoutée à la main."
          : "Izo : aucune carte révélée.",
      );
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-044",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt: "Izo : défausse 1 carte de ta main.",
        params: { count: 1 },
        cancellable: false,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      ctx.battle.discardFromHand(
        ctx.sourceSeat,
        ctx.choice.selection.handIndices,
      );
    }
  },

  /** OP09-075 Eustass "Captain" Kid
   *  [Jouée] Vous pouvez ajouter à votre main 1 carte du dessus de votre
   *  Vie : Si votre Leader est de type {Équipage de Kidd}, ajoutez jusqu'à
   *  1 carte DON!! redressée de votre deck DON!!. */
  "OP09-075": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    if (!seat) return;
    if (seat.lifeCount === 0) {
      ctx.battle.log("Eustass Kid : aucune Vie à prendre, effet annulé.");
      return;
    }
    ctx.battle.takeLifeToHand(ctx.sourceSeat);
    const leaderMeta = seat.leaderId
      ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
      : null;
    const isKidd = !!leaderMeta?.types.some((t) =>
      t.toLowerCase().includes("équipage de kidd"),
    );
    if (isKidd) {
      ctx.battle.giveDonFromDeck(ctx.sourceSeat, 1);
      ctx.battle.log("Eustass Kid : +1 DON active (Leader Kidd).");
    } else {
      ctx.battle.log("Eustass Kid : Vie ajoutée à la main.");
    }
  },

  /** OP09-095 Laffitte
   *  [Activation : Principale] Vous pouvez épuiser 1 de vos cartes DON!!
   *  et ce Personnage : Regardez 5 cartes du dessus de votre deck, révélez
   *  jusqu'à 1 carte de type {Équipage de Barbe Noire} et ajoutez-la à
   *  votre main. */
  "OP09-095": (ctx) => {
    if (ctx.hook !== "on-activate-main") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    if (!seat) return;
    if (seat.donActive < 1) {
      ctx.battle.log("Laffitte : pas assez de DON active pour activer.");
      return;
    }
    // Coûts : 1 DON active → rested + ce Persos rested.
    ctx.battle.restDon(ctx.sourceSeat, 1);
    ctx.battle.restCharacter(ctx.sourceSeat, ctx.sourceUid);
    ctx.battle.log("Laffitte : 1 DON épuisée + ce Persos épuisé.");
    const found = ctx.battle.searchDeckTopForType(
      ctx.sourceSeat,
      5,
      "Équipage de Barbe Noire",
      "bottom",
    );
    ctx.battle.log(
      found
        ? "Laffitte : carte Barbe Noire ajoutée à la main."
        : "Laffitte : aucune carte révélée.",
    );
  },

  /** OP09-107 Nico Robin
   *  [Jouée] Si votre adversaire a 3 cartes ou plus dans sa Vie, placez
   *  dans sa Défausse jusqu'à 1 carte du dessus de sa Vie. */
  "OP09-107": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const oppSeat: OnePieceBattleSeatId =
      ctx.sourceSeat === "p1" ? "p2" : "p1";
    const opp = ctx.battle.getSeat(oppSeat);
    if (!opp) return;
    if (opp.lifeCount < 3) {
      ctx.battle.log(
        "Nico Robin : adversaire n'a pas 3+ Vies, effet annulé.",
      );
      return;
    }
    const cardId = ctx.battle.placeOpponentLifeOnDiscard(oppSeat);
    ctx.battle.log(
      cardId
        ? "Nico Robin : 1 Vie adverse → Défausse."
        : "Nico Robin : pas de Vie à retirer.",
    );
  },

  /** OP09-116 Les miracles n'arrivent qu'à ceux qui ont la volonté de se battre !!
   *  [Contre] Jusqu'à 1 de vos Leaders ou Personnages gagne +2000 de
   *  puissance pour tout le combat. */
  "OP09-116": (ctx) => {
    if (ctx.hook !== "on-play") return;
    // Counter Event : auto-buff +2000 sur le défenseur courant. Si pas
    // d'attaque pendante, le client filtre déjà mais on protège.
    ctx.battle.addPowerBuff(
      { kind: "leader", seat: ctx.sourceSeat },
      2000,
    );
    ctx.battle.log("Les miracles : +2000 (Counter).");
  },

  /** ST16-001 Uta
   *  [Activation : Principale] [Une fois par tour] Vous pouvez défausser
   *  1 carte de type {FILM} de votre main : Donnez jusqu'à 1 carte DON!!
   *  épuisée à votre Leader ou à 1 de vos Personnages. */
  "ST16-001": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST16-001",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt: "Uta : défausse 1 carte FILM de ta main.",
        params: { count: 1, requireType: "FILM" },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      // Étape 1 : défausse FILM faite → ouvre buff-target pour le DON.
      if (ctx.choice.selection.handIndices) {
        const discarded = ctx.battle.discardFromHand(
          ctx.sourceSeat,
          ctx.choice.selection.handIndices,
        );
        if (discarded.length === 0) {
          ctx.battle.log("Uta : pas de FILM défaussée, effet annulé.");
          return;
        }
        ctx.battle.requestChoice({
          seat: ctx.sourceSeat,
          sourceCardNumber: "ST16-001",
          sourceUid: ctx.sourceUid,
          kind: "buff-target",
          prompt: "Uta : choisis ton Leader ou un Persos pour 1 DON épuisée.",
          params: { allowLeader: true },
          cancellable: false,
        });
        return;
      }
      // Étape 2 : la cible DON a été choisie.
      if (ctx.choice.selection.targetUid) {
        const target = ctx.choice.selection.targetUid;
        const ref: CardRef =
          target === "leader"
            ? { kind: "leader", seat: ctx.sourceSeat }
            : { kind: "character", seat: ctx.sourceSeat, uid: target };
        const attached = ctx.battle.attachDonToTarget(ref, 1);
        ctx.battle.log(`Uta : ${attached} DON!! attachée(s).`);
      }
    }
  },

  /** ST16-004 Shanks
   *  [Jouée] Mettez KO jusqu'à 1 Personnage adverse épuisé. */
  "ST16-004": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST16-004",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt: "Shanks : choisis un Persos adverse épuisé à mettre KO.",
        params: { onlyRested: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const oppSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.koCharacter(oppSeat, ctx.choice.selection.targetUid);
      ctx.battle.log("Shanks : Persos adverse épuisé KO.");
    }
  },

  /** ST18-002 O-Nami
   *  [Jouée] Si vous avez 8 cartes DON!! ou plus sur votre terrain,
   *  défaussez 1 carte de votre main et piochez 2 cartes. */
  "ST18-002": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat) return;
      // "Cartes DON!! sur le terrain" = active + rested + attached (Leader
      // + Persos).
      const attached =
        seat.leaderAttachedDon +
        seat.characters.reduce((n, c) => n + c.attachedDon, 0);
      const totalDon = seat.donActive + seat.donRested + attached;
      if (totalDon < 8) {
        ctx.battle.log(`O-Nami : ${totalDon} DON < 8, effet annulé.`);
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST18-002",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt: "O-Nami : défausse 1 carte de ta main pour piocher 2.",
        params: { count: 1 },
        cancellable: false,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      ctx.battle.discardFromHand(
        ctx.sourceSeat,
        ctx.choice.selection.handIndices,
      );
      ctx.battle.drawCards(ctx.sourceSeat, 2);
      ctx.battle.log("O-Nami : 1 défaussée → 2 piochées.");
    }
  },

  /** ST18-003 Sangoro
   *  [En attaquant] [Une fois par tour] Si vous avez 8 cartes DON!! ou plus
   *  sur votre terrain, piochez 1 carte. (Le tracker 1/turn est géré côté
   *  serveur via fireCardEffect — ici on reste idempotent en se reposant
   *  sur la limite déjà appliquée par le moteur d'attaque.) */
  "ST18-003": (ctx) => {
    if (ctx.hook !== "on-attack") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    if (!seat) return;
    const attached =
      seat.leaderAttachedDon +
      seat.characters.reduce((n, c) => n + c.attachedDon, 0);
    const totalDon = seat.donActive + seat.donRested + attached;
    if (totalDon < 8) {
      ctx.battle.log(`Sangoro : ${totalDon} DON < 8, pas de pioche.`);
      return;
    }
    ctx.battle.drawCards(ctx.sourceSeat, 1);
    ctx.battle.log("Sangoro : +1 carte piochée (8+ DON).");
  },

  /** ST19-004 Hina
   *  [Activation : Principale] [Une fois par tour] Vous pouvez placer
   *  au-dessous de votre deck 1 carte de votre Défausse : Donnez jusqu'à 1
   *  carte DON!! épuisée à votre Leader ou à 1 de vos Personnages.
   *  (Simplification : on ne demande pas le choix de la carte précise dans
   *  la défausse — on prend la première et on place sous le deck.) */
  "ST19-004": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat || seat.discardSize === 0) {
        ctx.battle.log("Hina : Défausse vide, effet annulé.");
        return;
      }
      // Pas d'API pour piocher de la défausse vers le deck — on log et on
      // donne juste le DON. (Coût ignoré pour simplification.)
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST19-004",
        sourceUid: ctx.sourceUid,
        kind: "buff-target",
        prompt: "Hina : choisis ton Leader ou un Persos pour 1 DON épuisée.",
        params: { allowLeader: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const target = ctx.choice.selection.targetUid;
      const ref: CardRef =
        target === "leader"
          ? { kind: "leader", seat: ctx.sourceSeat }
          : { kind: "character", seat: ctx.sourceSeat, uid: target };
      const attached = ctx.battle.attachDonToTarget(ref, 1);
      ctx.battle.log(`Hina : ${attached} DON!! attachée(s).`);
    }
  },

  /** ST19-005 Monkey D. Garp
   *  [Activation : Principale] [Une fois par tour] Vous pouvez placer
   *  au-dessous de votre deck 1 carte de votre Défausse : Réduisez de -1
   *  le coût de jusqu'à 1 Personnage adverse pour tout le tour.
   *  (Coût Défausse→deck simplifié.) */
  "ST19-005": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat || seat.discardSize === 0) {
        ctx.battle.log("Garp : Défausse vide, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST19-005",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt: "Garp : choisis 1 Persos adverse pour -1 coût ce tour.",
        params: { allowLeader: false },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const oppSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const targetUid = ctx.choice.selection.targetUid;
      if (targetUid === "leader") return;
      ctx.battle.addCostBuff(
        { kind: "character", seat: oppSeat, uid: targetUid },
        -1,
      );
      ctx.battle.log("Garp : Persos adverse -1 coût ce tour.");
    }
  },

  /** ST21-010 Nico Robin
   *  [DON!! x2] [En attaquant] Mettez KO jusqu'à 1 Personnage adverse
   *  ayant 4000 de puissance ou moins. */
  "ST21-010": (ctx) => {
    if (ctx.hook === "on-attack") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const me = seat?.characters.find((c) => c.uid === ctx.sourceUid);
      if (!me || me.attachedDon < 2) {
        ctx.battle.log("Nico Robin : DON!! < 2, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST21-010",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt: "Nico Robin : choisis un Persos adverse à KO (≤ 4000).",
        params: { maxPower: 4000 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const oppSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.koCharacter(oppSeat, ctx.choice.selection.targetUid);
      ctx.battle.log("Nico Robin : Persos adverse ≤ 4000 KO.");
    }
  },

  /** OP09-021 Red Force (Stage)
   *  [Activation : Principale] Vous pouvez épuiser ce Lieu : Si votre
   *  Leader est de type {Équipage du Roux}, jusqu'à 1 Personnage adverse
   *  perd -1000 de puissance pour tout le tour. */
  "OP09-021": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const leaderMeta = seat?.leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
        : null;
      const isRoux = !!leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("équipage du roux"),
      );
      if (!isRoux) {
        ctx.battle.log("Red Force : Leader pas Roux, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-021",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt: "Red Force : choisis 1 Persos adverse pour -1000 ce tour.",
        params: { allowLeader: false },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const oppSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const targetUid = ctx.choice.selection.targetUid;
      if (targetUid === "leader") return;
      ctx.battle.addPowerBuff(
        { kind: "character", seat: oppSeat, uid: targetUid },
        -1000,
      );
      ctx.battle.log("Red Force : -1000 Persos adverse ce tour.");
    }
  },

  /** OP09-001 Shanks (Leader)
   *  [Une fois par tour] Peut être activé quand votre adversaire attaque.
   *  Jusqu'à 1 Leader ou Personnage adverse perd -1000 de puissance pour
   *  tout le tour.
   *  (Implémentation simplifiée : activable à tout moment via l'UI
   *  d'activation manuelle. Le timing "quand adv attaque" est laissé au
   *  joueur.) */
  "OP09-001": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-001",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt: "Shanks : choisis 1 Leader/Persos adverse pour -1000 ce tour.",
        params: { allowLeader: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const oppSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const targetUid = ctx.choice.selection.targetUid;
      const ref: CardRef =
        targetUid === "leader"
          ? { kind: "leader", seat: oppSeat }
          : { kind: "character", seat: oppSeat, uid: targetUid };
      ctx.battle.addPowerBuff(ref, -1000);
      ctx.battle.log("Shanks : -1000 cible adverse ce tour.");
    }
  },

  // ─── BATCH 19 — cartes utilisant les APIs returnDon / restDon ──────────

  /** OP09-070 Nami
   *  [Jouée] Vous pouvez renvoyer à votre deck DON!! 1 carte DON!! ou plus
   *  de votre terrain : Donnez jusqu'à 2 cartes DON!! épuisées à votre
   *  Leader ou à 1 de vos Personnages. */
  "OP09-070": (ctx) => {
    if (ctx.hook === "on-play") {
      const returned = ctx.battle.returnDonFromBoard(ctx.sourceSeat, 1);
      if (returned === 0) {
        ctx.battle.log("Nami : pas de DON à renvoyer, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-070",
        sourceUid: ctx.sourceUid,
        kind: "buff-target",
        prompt:
          "Nami : choisis ton Leader ou un Persos pour 2 DON épuisées.",
        params: { allowLeader: true },
        cancellable: false,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const target = ctx.choice.selection.targetUid;
      const ref: CardRef =
        target === "leader"
          ? { kind: "leader", seat: ctx.sourceSeat }
          : { kind: "character", seat: ctx.sourceSeat, uid: target };
      const attached = ctx.battle.attachDonToTarget(ref, 2);
      ctx.battle.log(`Nami : ${attached} DON attachée(s).`);
    }
  },

  /** OP09-073 Brook
   *  [En attaquant] Vous pouvez renvoyer à votre deck DON!! 1 carte DON!!
   *  ou plus de votre terrain : Jusqu'à 2 Personnages adverses perdent
   *  -2000 de puissance pour tout le tour. */
  "OP09-073": (ctx) => {
    if (ctx.hook === "on-attack") {
      const returned = ctx.battle.returnDonFromBoard(ctx.sourceSeat, 1);
      if (returned === 0) {
        ctx.battle.log("Brook : pas de DON à renvoyer, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-073",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt:
          "Brook : choisis 1er Persos adverse à -2000 (1 sur 2).",
        params: { allowLeader: false, brookStep: 1 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      const oppSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const targetUid = ctx.choice.selection.targetUid;
      if (!targetUid || targetUid === "leader") return;
      ctx.battle.addPowerBuff(
        { kind: "character", seat: oppSeat, uid: targetUid },
        -2000,
      );
      ctx.battle.log("Brook : -2000 sur cible ce tour.");
      // Étape 2 : 2e cible.
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-073-step2",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt:
          "Brook : choisis 2e Persos adverse à -2000 (peut être identique au premier).",
        params: { allowLeader: false },
        cancellable: true,
      });
    }
  },
  // Step 2 wrapper : reroute vers OP09-073 second buff.
  "OP09-073-step2": (ctx) => {
    if (ctx.hook !== "on-choice-resolved" || !ctx.choice) return;
    if (ctx.choice.skipped) return;
    const oppSeat: OnePieceBattleSeatId =
      ctx.sourceSeat === "p1" ? "p2" : "p1";
    const targetUid = ctx.choice.selection.targetUid;
    if (!targetUid || targetUid === "leader") return;
    ctx.battle.addPowerBuff(
      { kind: "character", seat: oppSeat, uid: targetUid },
      -2000,
    );
    ctx.battle.log("Brook : -2000 sur 2e cible ce tour.");
  },

  /** OP09-076 Roronoa Zoro
   *  [Jouée] Vous pouvez renvoyer à votre deck DON!! 1 carte DON!! ou plus
   *  de votre terrain : Ajoutez jusqu'à 1 carte DON!! redressée de votre
   *  deck DON!!. */
  "OP09-076": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const returned = ctx.battle.returnDonFromBoard(ctx.sourceSeat, 1);
    if (returned === 0) {
      ctx.battle.log("Roronoa Zoro : pas de DON à renvoyer, effet annulé.");
      return;
    }
    ctx.battle.giveDonFromDeck(ctx.sourceSeat, 1);
    ctx.battle.log("Roronoa Zoro : DON renvoyée → +1 DON redressée.");
  },

  /** OP09-119 Monkey D. Luffy (alt-art / promo)
   *  [Jouée] Vous pouvez renvoyer à votre deck DON!! 1 carte DON!! ou plus
   *  de votre terrain : Piochez 1 carte ; ce Personnage gagne [Initiative]
   *  pour tout le tour. */
  "OP09-119": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const returned = ctx.battle.returnDonFromBoard(ctx.sourceSeat, 1);
    if (returned === 0) {
      ctx.battle.log("Luffy 119 : pas de DON à renvoyer, effet annulé.");
      return;
    }
    ctx.battle.drawCards(ctx.sourceSeat, 1);
    ctx.battle.log(
      "Luffy 119 : +1 carte ; gagne [Initiative] (effet géré par texte).",
    );
  },

  /** OP09-068 Tony-Tony Chopper
   *  [Fin de votre tour] Vous pouvez renvoyer à votre deck DON!! 1 carte
   *  DON!! ou plus : Redressez ce Personnage. Puis, ce Persos gagne
   *  [Bloqueur] jusqu'à la fin du prochain tour adverse.
   *  (Le Bloqueur dynamique demanderait un grant — pour l'instant on
   *  applique juste la redressment.) */
  "OP09-068": (ctx) => {
    if (ctx.hook !== "on-turn-end") return;
    const returned = ctx.battle.returnDonFromBoard(ctx.sourceSeat, 1);
    if (returned === 0) return;
    ctx.battle.untapCharacter(ctx.sourceSeat, ctx.sourceUid);
    ctx.battle.log("Tony-Tony Chopper : redressé (DON renvoyée).");
  },

  /** OP09-065 Sanji
   *  [Jouée] Vous pouvez renvoyer à votre deck DON!! 1 carte DON!! ou plus
   *  de votre terrain : Ce Personnage gagne [Initiative] pour tout le tour.
   *  Puis, épuisez jusqu'à 1 Personnage adverse ayant un coût de 6 ou
   *  moins. */
  "OP09-065": (ctx) => {
    if (ctx.hook === "on-play") {
      const returned = ctx.battle.returnDonFromBoard(ctx.sourceSeat, 1);
      if (returned === 0) {
        ctx.battle.log("Sanji : pas de DON à renvoyer, effet annulé.");
        return;
      }
      ctx.battle.log("Sanji : gagne [Initiative] ce tour.");
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-065",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt: "Sanji : choisis 1 Persos adverse à épuiser (coût ≤ 6).",
        params: { maxCost: 6 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const oppSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.restCharacter(oppSeat, ctx.choice.selection.targetUid);
      ctx.battle.log("Sanji : Persos adverse ≤ 6 épuisé.");
    }
  },

  /** OP09-074 Bepo
   *  [Votre tour] [Une fois par tour] Quand une carte DON!! de votre
   *  terrain est renvoyée à votre deck DON!!, jusqu'à 1 de vos Leaders ou
   *  Personnages gagne +1000 de puissance pour tout le tour. */
  "OP09-074": (ctx) => {
    if (ctx.hook === "on-don-returned") {
      // Vérifie que c'est mon tour ([Votre tour]).
      if (ctx.battle.getActiveSeat() !== ctx.sourceSeat) return;
      // 1/turn tracker.
      if (
        !ctx.battle.consumeOncePerTurnTrigger(
          ctx.sourceSeat,
          `bepo-${ctx.sourceUid}`,
        )
      )
        return;
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-074",
        sourceUid: ctx.sourceUid,
        kind: "buff-target",
        prompt: "Bepo : choisis ton Leader/Persos pour +1000 ce tour.",
        params: { allowLeader: true, amount: 1000 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const target = ctx.choice.selection.targetUid;
      const ref: CardRef =
        target === "leader"
          ? { kind: "leader", seat: ctx.sourceSeat }
          : { kind: "character", seat: ctx.sourceSeat, uid: target };
      ctx.battle.addPowerBuff(ref, 1000);
      ctx.battle.log("Bepo : cible +1000 ce tour.");
    }
  },

  /** OP09-023 Adio
   *  [Jouée] Si votre Leader est de type {ODYSSEY}, redressez jusqu'à 3 de
   *  vos cartes DON!!. (Le second effet [Attaque adverse] : skip, demande
   *  un nouveau hook.) */
  "OP09-023": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    const leaderMeta = seat?.leaderId
      ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
      : null;
    const isOdyssey = !!leaderMeta?.types.some((t) =>
      t.toLowerCase().includes("odyssey"),
    );
    if (!isOdyssey) {
      ctx.battle.log("Adio : Leader pas ODYSSEY, effet annulé.");
      return;
    }
    if (!seat) return;
    // "Redresser" 1 DON = la passer de rested → active.
    const taken = Math.min(3, seat.donRested);
    if (taken > 0) {
      // On simule avec restDon en sens inverse : décrémente rested,
      // incrémente active. Pas d'API directe → log + hack via giveDon
      // (qui prend du donDeck, pas pareil). Pour rester simple ici, on
      // émule via attachDonToTarget(self, 0) — non. Plus propre : ajout
      // d'une API dédiée. Pour l'instant on log et on consume rested→active
      // par un workaround : 0 op. Pas idéal. On laisse une note claire.
      ctx.battle.log(
        `Adio : effet ODYSSEY déclenché (jusqu'à ${taken} DON à redresser — API untapDon à venir).`,
      );
    } else {
      ctx.battle.log("Adio : pas de DON épuisées à redresser.");
    }
  },

  /** OP09-072 Franky
   *  [Jouée] DON!! -2 ; vous pouvez défausser 1 carte de votre main :
   *  Piochez 2 cartes. (Le coût DON-2 est traité comme returnDonFromBoard.) */
  "OP09-072": (ctx) => {
    if (ctx.hook === "on-play") {
      const returned = ctx.battle.returnDonFromBoard(ctx.sourceSeat, 2);
      if (returned < 2) {
        ctx.battle.log(
          `Franky : seulement ${returned} DON renvoyée(s), effet annulé.`,
        );
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-072",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt: "Franky : défausse 1 carte de ta main pour piocher 2.",
        params: { count: 1 },
        cancellable: false,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      ctx.battle.discardFromHand(
        ctx.sourceSeat,
        ctx.choice.selection.handIndices,
      );
      ctx.battle.drawCards(ctx.sourceSeat, 2);
      ctx.battle.log("Franky : DON-2 + discard 1 → +2 cartes.");
    }
  },

  /** ST21-016 Gum Gum Dawn Whip (Event)
   *  [Principale] Jusqu'à 1 de vos Leaders ou Personnages gagne +1000 de
   *  puissance pour tout le tour. (Le second clause «1 char adv ne peut
   *  activer Bloqueur» nécessite un nouveau status — pour ce batch on
   *  applique seulement le buff +1000.) */
  "ST21-016": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST21-016",
        sourceUid: ctx.sourceUid,
        kind: "buff-target",
        prompt: "Gum Gum Dawn Whip : choisis Leader/Persos pour +1000.",
        params: { allowLeader: true, amount: 1000 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const target = ctx.choice.selection.targetUid;
      const ref: CardRef =
        target === "leader"
          ? { kind: "leader", seat: ctx.sourceSeat }
          : { kind: "character", seat: ctx.sourceSeat, uid: target };
      ctx.battle.addPowerBuff(ref, 1000);
      ctx.battle.log("Gum Gum Dawn Whip : +1000 ce tour.");
    }
  },

  // ─── BATCH 20 — Stages, counters et events ─────────────────────────────

  /** OP09-099 Ruche (Stage)
   *  [Activation : Principale] Vous pouvez défausser 1 carte de votre main
   *  et épuiser ce Lieu : Regardez 3 cartes du dessus de votre deck,
   *  révélez jusqu'à 1 carte de type {Équipage de Barbe Noire} et
   *  ajoutez-la à votre main. */
  "OP09-099": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-099",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt: "Ruche : défausse 1 carte de ta main pour activer.",
        params: { count: 1 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      ctx.battle.discardFromHand(
        ctx.sourceSeat,
        ctx.choice.selection.handIndices,
      );
      const found = ctx.battle.searchDeckTopForType(
        ctx.sourceSeat,
        3,
        "Équipage de Barbe Noire",
        "bottom",
      );
      ctx.battle.log(
        found
          ? "Ruche : carte Barbe Noire ajoutée à la main."
          : "Ruche : aucune carte révélée.",
      );
    }
  },

  /** OP09-060 Île de Lacrahn-Ri (Stage)
   *  [Activation : Principale] Vous pouvez placer 2 cartes de votre main
   *  au-dessous de votre deck dans l'ordre de votre choix et épuiser ce
   *  Lieu : Si votre Leader est de type {Cross Guild}, piochez 2 cartes.
   *  (Simplification : on demande 2 indices via discard-card et on les
   *  place sous le deck plutôt qu'à la défausse.) */
  "OP09-060": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const leaderMeta = seat?.leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
        : null;
      const isCG = !!leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("cross guild"),
      );
      if (!isCG) {
        ctx.battle.log("Île de Lacrahn-Ri : Leader pas Cross Guild.");
        return;
      }
      if (!seat || seat.handSize < 2) {
        ctx.battle.log(
          "Île de Lacrahn-Ri : besoin de 2 cartes en main, effet annulé.",
        );
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-060",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt:
          "Île de Lacrahn-Ri : choisis 2 cartes à placer au-dessous du deck.",
        params: { count: 2 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      // Place les cartes sous le deck dans l'ordre choisi, en partant des
      // indices décroissants pour ne pas décaler.
      const sorted = [...ctx.choice.selection.handIndices].sort(
        (a, b) => b - a,
      );
      let placed = 0;
      for (const i of sorted) {
        if (ctx.battle.placeHandAtDeckBottom(ctx.sourceSeat, i)) placed++;
      }
      if (placed >= 2) {
        ctx.battle.drawCards(ctx.sourceSeat, 2);
        ctx.battle.log(
          "Île de Lacrahn-Ri : 2 cartes placées sous le deck → +2 cartes piochées.",
        );
      } else {
        ctx.battle.log(
          `Île de Lacrahn-Ri : seulement ${placed} carte(s) placée(s), effet annulé.`,
        );
      }
    }
  },

  /** OP09-039 Gum Gum Cuatro Jet Cross Shock Bazooka (Event Counter)
   *  [Contre] Si votre Leader est de type {ODYSSEY} et que vous avez 2
   *  Personnages ou plus épuisés, jusqu'à 1 de vos Leaders ou Personnages
   *  gagne +2000 de puissance pour tout le tour. */
  "OP09-039": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const leaderMeta = seat?.leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
        : null;
      const isOdyssey = !!leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("odyssey"),
      );
      const restedCount = seat?.characters.filter((c) => c.rested).length ?? 0;
      if (!isOdyssey || restedCount < 2) {
        ctx.battle.log(
          "Gum Gum Cuatro : conditions ODYSSEY+2 non remplies, effet annulé.",
        );
        return;
      }
      // Auto-cible le Leader pour rapidité (counter event = défense
      // d'urgence). Pas de choix joueur dans ce contexte.
      ctx.battle.addPowerBuff(
        { kind: "leader", seat: ctx.sourceSeat },
        2000,
      );
      ctx.battle.log("Gum Gum Cuatro : Leader +2000 (Counter ODYSSEY).");
    }
  },

  /** OP09-041 Soul Franky Swing Arm Boxing Solid (Event Counter)
   *  [Contre] Jusqu'à 1 de vos Leaders ou Personnages gagne +2000 de
   *  puissance pour tout le combat. Puis, si votre Leader est de type
   *  {ODYSSEY} et que vous avez 2 Personnages ou plus épuisés, redressez
   *  jusqu'à 2 de vos Personnages.
   *  (Simplification : on applique seulement le buff +2000 au Leader. Le
   *  redressement de 2 Persos demande 2 choices — skip pour ce batch.) */
  "OP09-041": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.addPowerBuff(
        { kind: "leader", seat: ctx.sourceSeat },
        2000,
      );
      ctx.battle.log("Soul Franky : Leader +2000 (Counter).");
    }
  },

  /** OP09-115 Ice Block Partisan (Event)
   *  [Principale] Mettez KO jusqu'à 1 Personnage adverse ayant un coût de
   *  3 ou moins et [Déclenchement]. */
  "OP09-115": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-115",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt:
          "Ice Block Partisan : KO 1 Persos adverse ≤ 3 coût avec [Déclenchement].",
        params: { maxCost: 3, requireTrigger: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const oppSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.koCharacter(oppSeat, ctx.choice.selection.targetUid);
      ctx.battle.log("Ice Block Partisan : Persos ≤ 3 coût + trigger KO.");
    }
  },

  /** OP09-059 Tour de passe-passe brouillard (Event Counter)
   *  [Contre] Jusqu'à 1 de vos Leaders ou Personnages gagne +3000 de
   *  puissance pour tout le combat. Puis, défaussez jusqu'à 2 cartes de
   *  votre main. Placez dans votre Défausse autant de cartes du dessus
   *  de votre deck que précédemment défaussées.
   *  (Simplification : on applique le +3000. La sub-mécanique discard+mill
   *  demande des choix supplémentaires — skip pour ce batch.) */
  "OP09-059": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.addPowerBuff(
        { kind: "leader", seat: ctx.sourceSeat },
        3000,
      );
      ctx.battle.log("Tour de passe-passe brouillard : Leader +3000.");
    }
  },

  /** OP09-078 Gum Gum Gigant (Event Counter)
   *  [Contre] DON!! -2 ; vous pouvez défausser 1 carte de votre main : Si
   *  votre Leader est de type {Équipage de Chapeau de paille}, jusqu'à 1
   *  de vos Leaders ou Personnages gagne +4000 de puissance pour tout le
   *  combat. Puis, piochez 2 cartes. */
  "OP09-078": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const leaderMeta = seat?.leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
        : null;
      const isChapeau = !!leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("équipage de chapeau de paille"),
      );
      if (!isChapeau) {
        ctx.battle.log(
          "Gum Gum Gigant : Leader pas Chapeau de paille, effet réduit.",
        );
        return;
      }
      const returned = ctx.battle.returnDonFromBoard(ctx.sourceSeat, 2);
      if (returned < 2) {
        ctx.battle.log(
          `Gum Gum Gigant : seulement ${returned} DON renvoyée(s), effet annulé.`,
        );
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-078",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt:
          "Gum Gum Gigant : défausse 1 carte de ta main pour +4000 et piocher 2.",
        params: { count: 1 },
        cancellable: false,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      ctx.battle.discardFromHand(
        ctx.sourceSeat,
        ctx.choice.selection.handIndices,
      );
      ctx.battle.addPowerBuff(
        { kind: "leader", seat: ctx.sourceSeat },
        4000,
      );
      ctx.battle.drawCards(ctx.sourceSeat, 2);
      ctx.battle.log("Gum Gum Gigant : DON-2 + discard 1 → +4000 + draw 2.");
    }
  },

  // ─── BATCH 21 — Cartes utilisant play-from-hand ────────────────────────

  /** OP09-046 Crocodile
   *  [Jouée] Jouez jusqu'à 1 carte Personnage de type {Cross Guild} ou
   *  incluant «Baroque Works» dans son type se trouvant dans votre main et
   *  ayant un coût de 5 ou moins. */
  "OP09-046": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-046",
        sourceUid: ctx.sourceUid,
        kind: "play-from-hand",
        prompt:
          "Crocodile : choisis 1 Persos Cross Guild / Baroque Works ≤ 5 à jouer gratuitement.",
        params: { maxCost: 5, requireType: "Cross Guild" },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      const idx = ctx.choice.selection.handIndices[0];
      if (idx === undefined) return;
      const uid = ctx.battle.playCharacterFromHand(ctx.sourceSeat, idx);
      if (uid) ctx.battle.log("Crocodile : Persos posé gratuitement.");
    }
  },

  /** OP09-103 Koala
   *  [Jouée] Vous pouvez ajouter à votre main 1 carte du dessus ou du
   *  dessous de votre Vie : Jouez jusqu'à 1 carte Personnage de type
   *  {Armée révolutionnaire} de votre main ayant un coût de 4 ou moins.
   *  Si vous l'avez jouée, piochez 1 carte. */
  "OP09-103": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat || seat.lifeCount === 0) {
        ctx.battle.log("Koala : pas de Vie à prendre, effet annulé.");
        return;
      }
      ctx.battle.takeLifeToHand(ctx.sourceSeat);
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-103",
        sourceUid: ctx.sourceUid,
        kind: "play-from-hand",
        prompt:
          "Koala : choisis 1 Persos Armée révolutionnaire ≤ 4 à jouer gratuitement.",
        params: { maxCost: 4, requireType: "Armée révolutionnaire" },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      const idx = ctx.choice.selection.handIndices[0];
      if (idx === undefined) return;
      const uid = ctx.battle.playCharacterFromHand(ctx.sourceSeat, idx);
      if (uid) {
        ctx.battle.drawCards(ctx.sourceSeat, 1);
        ctx.battle.log("Koala : Persos joué + 1 carte piochée.");
      }
    }
  },

  /** OP09-043 Alvida
   *  [En cas de KO] Si votre Leader est de type {Cross Guild}, jouez
   *  jusqu'à 1 carte Personnage de votre main ayant un coût de 5 ou moins
   *  autre que [Alvida]. */
  "OP09-043": (ctx) => {
    if (ctx.hook === "on-ko") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const leaderMeta = seat?.leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
        : null;
      const isCG = !!leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("cross guild"),
      );
      if (!isCG) {
        ctx.battle.log("Alvida : Leader pas Cross Guild, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-043",
        sourceUid: ctx.sourceUid,
        kind: "play-from-hand",
        prompt:
          "Alvida (en KO) : choisis 1 Persos ≤ 5 (sauf Alvida) à jouer.",
        params: { maxCost: 5, excludeName: "Alvida" },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      const idx = ctx.choice.selection.handIndices[0];
      if (idx === undefined) return;
      const uid = ctx.battle.playCharacterFromHand(ctx.sourceSeat, idx);
      if (uid) ctx.battle.log("Alvida : Persos posé en réaction au KO.");
    }
  },

  /** OP09-030 Trafalgar Law
   *  [Jouée] Vous pouvez renvoyer 1 de vos Personnages à la main de son
   *  propriétaire : Jouez jusqu'à 1 carte Personnage de type {ODYSSEY} de
   *  votre main ayant un coût de 3 ou moins autre que [Trafalgar Law]. */
  "OP09-030": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat || seat.characters.length === 0) {
        ctx.battle.log(
          "Trafalgar Law : pas de Persos à renvoyer, effet annulé.",
        );
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-030",
        sourceUid: ctx.sourceUid,
        kind: "ko-character-own",
        prompt: "Trafalgar Law : choisis 1 de tes Persos à renvoyer en main.",
        params: {},
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      // Étape 1 : bounce du choisi.
      if (ctx.choice.selection.targetUid && !ctx.choice.selection.handIndices) {
        ctx.battle.bounceCharacter(
          ctx.sourceSeat,
          ctx.choice.selection.targetUid,
        );
        ctx.battle.log("Trafalgar Law : Persos renvoyé en main.");
        ctx.battle.requestChoice({
          seat: ctx.sourceSeat,
          sourceCardNumber: "OP09-030",
          sourceUid: ctx.sourceUid,
          kind: "play-from-hand",
          prompt:
            "Trafalgar Law : choisis 1 Persos ODYSSEY ≤ 3 (sauf Trafalgar Law) à jouer.",
          params: {
            maxCost: 3,
            requireType: "ODYSSEY",
            excludeName: "Trafalgar Law",
          },
          cancellable: true,
        });
        return;
      }
      // Étape 2 : play du Persos choisi.
      if (ctx.choice.selection.handIndices) {
        const idx = ctx.choice.selection.handIndices[0];
        if (idx === undefined) return;
        const uid = ctx.battle.playCharacterFromHand(ctx.sourceSeat, idx);
        if (uid) ctx.battle.log("Trafalgar Law : ODYSSEY ≤ 3 posé.");
      }
    }
  },

  /** ST17-002 Trafalgar Law
   *  [Jouée] Vous pouvez renvoyer 1 de vos Personnages à la main de son
   *  propriétaire : Si votre Leader est de type {Sept grands corsaires},
   *  renvoyez à la main de son propriétaire jusqu'à 1 Personnage ayant
   *  un coût de 4 ou moins. */
  "ST17-002": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat || seat.characters.length === 0) {
        ctx.battle.log(
          "Trafalgar Law (ST17) : pas de Persos à renvoyer, effet annulé.",
        );
        return;
      }
      const leaderMeta = seat?.leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
        : null;
      const isCorsaire = !!leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("sept grands corsaires"),
      );
      if (!isCorsaire) {
        ctx.battle.log(
          "Trafalgar Law (ST17) : Leader pas Sept Corsaires, effet annulé.",
        );
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST17-002",
        sourceUid: ctx.sourceUid,
        kind: "ko-character-own",
        prompt:
          "Trafalgar Law : choisis 1 de tes Persos à renvoyer en main.",
        params: {},
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      // Étape 1 : bounce de soi.
      ctx.battle.bounceCharacter(
        ctx.sourceSeat,
        ctx.choice.selection.targetUid,
      );
      ctx.battle.log("Trafalgar Law (ST17) : Persos propre renvoyé en main.");
      // Étape 2 : bounce opponent ≤ 4. On route via un step-2 wrapper
      // pour éviter la confusion targetUid de la 1ère vs 2ème étape.
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST17-002-step2",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt:
          "Trafalgar Law : choisis 1 Persos adverse ≤ 4 à renvoyer en main.",
        params: { maxCost: 4 },
        cancellable: true,
      });
    }
  },
  // Step 2 wrapper : bounce de l'adversaire après bounce de soi.
  "ST17-002-step2": (ctx) => {
    if (ctx.hook !== "on-choice-resolved" || !ctx.choice) return;
    if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
    const oppSeat: OnePieceBattleSeatId =
      ctx.sourceSeat === "p1" ? "p2" : "p1";
    ctx.battle.bounceCharacter(oppSeat, ctx.choice.selection.targetUid);
    ctx.battle.log("Trafalgar Law (ST17) : Persos adverse ≤ 4 renvoyé en main.");
  },

  /** OP09-022 Lim (Leader)
   *  [Activation : Principale] [Une fois par tour] Vous pouvez épuiser 3
   *  de vos cartes DON!! : Ajoutez jusqu'à 1 carte DON!! épuisée de votre
   *  deck DON!! et jouez jusqu'à 1 carte Personnage de type {ODYSSEY} de
   *  votre main ayant un coût de 5 ou moins. */
  "OP09-022": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat || seat.donActive < 3) {
        ctx.battle.log("Lim : besoin de 3 DON actives, effet annulé.");
        return;
      }
      ctx.battle.restDon(ctx.sourceSeat, 3);
      ctx.battle.giveDonFromDeck(ctx.sourceSeat, 1);
      ctx.battle.log("Lim : 3 DON épuisées + 1 DON redressée ajoutée.");
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-022",
        sourceUid: ctx.sourceUid,
        kind: "play-from-hand",
        prompt: "Lim : choisis 1 Persos ODYSSEY ≤ 5 à jouer.",
        params: { maxCost: 5, requireType: "ODYSSEY" },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      const idx = ctx.choice.selection.handIndices[0];
      if (idx === undefined) return;
      const uid = ctx.battle.playCharacterFromHand(ctx.sourceSeat, idx);
      if (uid) ctx.battle.log("Lim : ODYSSEY ≤ 5 posé.");
    }
  },

  /** OP09-042 Baggy (Leader)
   *  [Activation : Principale] Vous pouvez épuiser 5 de vos cartes DON!!
   *  et défausser 1 carte de votre main : Jouez jusqu'à 1 carte Personnage
   *  de type {Cross Guild} de votre main. */
  "OP09-042": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat || seat.donActive < 5) {
        ctx.battle.log("Baggy : besoin de 5 DON actives, effet annulé.");
        return;
      }
      ctx.battle.restDon(ctx.sourceSeat, 5);
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-042",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt: "Baggy : défausse 1 carte de ta main.",
        params: { count: 1 },
        cancellable: false,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      // Étape 1 : discard fait → ouvre play-from-hand.
      if (ctx.choice.selection.handIndices && !ctx.choice.selection.targetUid) {
        ctx.battle.discardFromHand(
          ctx.sourceSeat,
          ctx.choice.selection.handIndices,
        );
        ctx.battle.requestChoice({
          seat: ctx.sourceSeat,
          sourceCardNumber: "OP09-042-step2",
          sourceUid: ctx.sourceUid,
          kind: "play-from-hand",
          prompt: "Baggy : choisis 1 Persos Cross Guild à jouer.",
          params: { requireType: "Cross Guild" },
          cancellable: true,
        });
        return;
      }
    }
  },
  // Step 2 wrapper : route le play après le discard.
  "OP09-042-step2": (ctx) => {
    if (ctx.hook !== "on-choice-resolved" || !ctx.choice) return;
    if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
    const idx = ctx.choice.selection.handIndices[0];
    if (idx === undefined) return;
    const uid = ctx.battle.playCharacterFromHand(ctx.sourceSeat, idx);
    if (uid) ctx.battle.log("Baggy : Cross Guild posé.");
  },

  /** ST18-005 Luffytaro
   *  [Jouée] DON!! -1 (Vous pouvez renvoyer à votre deck DON!! le nombre
   *  indiqué de cartes DON!! de votre terrain.) : Jouez jusqu'à 1 carte
   *  Personnage de type {Équipage de Chapeau de paille} violette de votre
   *  main ayant un coût de 5 ou moins. (Filtre couleur violette omis — on
   *  filtre uniquement par type.) */
  "ST18-005": (ctx) => {
    if (ctx.hook === "on-play") {
      const returned = ctx.battle.returnDonFromBoard(ctx.sourceSeat, 1);
      if (returned === 0) {
        ctx.battle.log("Luffytaro : pas de DON à renvoyer, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST18-005",
        sourceUid: ctx.sourceUid,
        kind: "play-from-hand",
        prompt:
          "Luffytaro : choisis 1 Persos Chapeau de paille ≤ 5 à jouer.",
        params: {
          maxCost: 5,
          requireType: "Équipage de Chapeau de paille",
        },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      const idx = ctx.choice.selection.handIndices[0];
      if (idx === undefined) return;
      const uid = ctx.battle.playCharacterFromHand(ctx.sourceSeat, idx);
      if (uid) ctx.battle.log("Luffytaro : Chapeau ≤ 5 posé.");
    }
  },

  // ─── BATCH 22 — Cartes utilisant play-from-discard ─────────────────────

  /** OP09-085 Gecko Moria
   *  [Jouée] Jouez jusqu'à 1 carte Personnage de type {Équipage de
   *  Thriller Bark} épuisée de votre Défausse ayant un coût de 2 ou moins. */
  "OP09-085": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-085",
        sourceUid: ctx.sourceUid,
        kind: "play-from-discard",
        prompt:
          "Gecko Moria : choisis 1 Persos Thriller Bark ≤ 2 dans ta Défausse.",
        params: { maxCost: 2, requireType: "Équipage de Thriller Bark" },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      const idx = ctx.choice.selection.handIndices[0];
      if (idx === undefined) return;
      const uid = ctx.battle.playCharacterFromDiscard(ctx.sourceSeat, idx, {
        rested: true,
      });
      if (uid)
        ctx.battle.log("Gecko Moria : Persos Thriller Bark posé épuisé.");
    }
  },

  /** OP09-028 Sanji
   *  [En cas de KO] Vous pouvez ajouter à votre main 1 carte du dessus ou
   *  du dessous de votre Vie : Jouez jusqu'à 1 carte Personnage de type
   *  {ODYSSEY} ou {Équipage de Chapeau de paille} épuisée de votre
   *  Défausse ayant un coût de 4 ou moins. */
  "OP09-028": (ctx) => {
    if (ctx.hook === "on-ko") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat || seat.lifeCount === 0) {
        ctx.battle.log("Sanji on-ko : pas de Vie à prendre, effet annulé.");
        return;
      }
      ctx.battle.takeLifeToHand(ctx.sourceSeat);
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-028",
        sourceUid: ctx.sourceUid,
        kind: "play-from-discard",
        prompt:
          "Sanji (en KO) : choisis 1 Persos ODYSSEY/Chapeau ≤ 4 dans la Défausse.",
        // Note : on filtre uniquement par 1er type ; les Persos ODYSSEY ET
        // Chapeau sont rares mais le filtre OR n'est pas exposé. On ouvre
        // sur Chapeau (le plus courant) — joueur peut passer sinon.
        params: { maxCost: 4, requireType: "Équipage de Chapeau de paille" },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      const idx = ctx.choice.selection.handIndices[0];
      if (idx === undefined) return;
      const uid = ctx.battle.playCharacterFromDiscard(ctx.sourceSeat, idx, {
        rested: true,
      });
      if (uid) ctx.battle.log("Sanji on-ko : Persos posé épuisé.");
    }
  },

  /** ST17-004 Boa Hancock
   *  [Jouée] Regardez 3 cartes du dessus de votre deck, réorganisez-les
   *  dans l'ordre de votre choix et placez-les au-dessus ou au-dessous
   *  de votre deck. Puis, donnez jusqu'à 1 carte DON!! épuisée à votre
   *  Leader ou à 1 de vos Personnages, de type {Sept grands corsaires}.
   *  (Simplification : on skip la réorganisation top 3 et on donne juste
   *  le DON ciblé Sept Corsaires.) */
  "ST17-004": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat) return;
      // Vérifie qu'on a au moins une cible Sept Corsaires (Leader ou
      // Persos).
      const leaderMeta = seat.leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
        : null;
      const leaderIsCorsaire = !!leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("sept grands corsaires"),
      );
      const charsCorsaire = seat.characters.filter((c) => {
        const m = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
        return m?.types.some((t) =>
          t.toLowerCase().includes("sept grands corsaires"),
        );
      });
      if (!leaderIsCorsaire && charsCorsaire.length === 0) {
        ctx.battle.log(
          "Boa Hancock : pas de cible Sept Corsaires, effet réduit.",
        );
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST17-004",
        sourceUid: ctx.sourceUid,
        kind: "buff-target",
        prompt:
          "Boa Hancock : choisis Leader/Persos Sept Corsaires pour 1 DON épuisée.",
        params: {
          allowLeader: true,
          requireType: "Sept grands corsaires",
        },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const target = ctx.choice.selection.targetUid;
      const ref: CardRef =
        target === "leader"
          ? { kind: "leader", seat: ctx.sourceSeat }
          : { kind: "character", seat: ctx.sourceSeat, uid: target };
      const attached = ctx.battle.attachDonToTarget(ref, 1);
      ctx.battle.log(`Boa Hancock : ${attached} DON attachée(s).`);
    }
  },

  /** ST20-001 Charlotte Katakuri
   *  [Activation : Principale] [Une fois par tour] Vous pouvez retourner
   *  1 carte du dessus de votre Vie face visible : Donnez jusqu'à 1 carte
   *  DON!! épuisée à votre Leader ou à 1 de vos Personnages.
   *  (Simplification : on skip le mécanisme «face visible» — on donne
   *  juste le DON sans coût Vie.) */
  "ST20-001": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST20-001",
        sourceUid: ctx.sourceUid,
        kind: "buff-target",
        prompt:
          "Katakuri : choisis ton Leader ou un Persos pour 1 DON épuisée.",
        params: { allowLeader: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const target = ctx.choice.selection.targetUid;
      const ref: CardRef =
        target === "leader"
          ? { kind: "leader", seat: ctx.sourceSeat }
          : { kind: "character", seat: ctx.sourceSeat, uid: target };
      const attached = ctx.battle.attachDonToTarget(ref, 1);
      ctx.battle.log(`Katakuri : ${attached} DON attachée(s).`);
    }
  },

  // ─── BATCH 23 — Recherche trigger + cartes restantes ───────────────────

  /** OP09-102 Professeur Clover
   *  [Jouée] Si votre Leader est [Nico Robin], regardez 3 cartes du dessus
   *  de votre deck, révélez jusqu'à 1 carte ayant [Déclenchement] et
   *  ajoutez-la à votre main. Puis, placez les cartes restantes au-dessous
   *  de votre deck dans l'ordre de votre choix. */
  "OP09-102": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    const leaderMeta = seat?.leaderId
      ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
      : null;
    if (leaderMeta?.name !== "Nico Robin") {
      ctx.battle.log(
        "Professeur Clover : Leader pas [Nico Robin], effet annulé.",
      );
      return;
    }
    const found = ctx.battle.searchDeckTopForTrigger(
      ctx.sourceSeat,
      3,
      1,
      "bottom",
    );
    ctx.battle.log(
      found.length > 0
        ? `Professeur Clover : ${found.length} carte(s) Trigger ajoutée(s).`
        : "Professeur Clover : aucune carte Trigger révélée.",
    );
  },

  /** OP09-117 Dereshi (Event)
   *  [Principale] Regardez 5 cartes du dessus de votre deck, révélez
   *  jusqu'à 2 cartes ayant [Déclenchement] autres que [Dereshi] et
   *  ajoutez-les à votre main. */
  "OP09-117": (ctx) => {
    if (ctx.hook !== "on-play") return;
    const found = ctx.battle.searchDeckTopForTrigger(
      ctx.sourceSeat,
      5,
      2,
      "bottom",
      "Dereshi",
    );
    ctx.battle.log(
      found.length > 0
        ? `Dereshi : ${found.length} carte(s) Trigger ajoutée(s).`
        : "Dereshi : aucune carte Trigger révélée.",
    );
  },

  /** ST19-002 Sengoku
   *  [Jouée] Vous pouvez défausser 2 cartes de type {Marine} noires de
   *  votre main : Si votre Leader est de type {Marine}, piochez 3 cartes.
   *  (Filtre couleur «noire» omis — on vérifie juste le type Marine.) */
  "ST19-002": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const leaderMeta = seat?.leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
        : null;
      const isMarine = !!leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("marine"),
      );
      if (!isMarine) {
        ctx.battle.log("Sengoku : Leader pas Marine, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST19-002",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt:
          "Sengoku : défausse 2 cartes Marine de ta main pour piocher 3.",
        params: { count: 2, requireType: "Marine" },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      const discarded = ctx.battle.discardFromHand(
        ctx.sourceSeat,
        ctx.choice.selection.handIndices,
      );
      if (discarded.length < 2) {
        ctx.battle.log(
          `Sengoku : seulement ${discarded.length} carte(s) défaussée(s), effet annulé.`,
        );
        return;
      }
      ctx.battle.drawCards(ctx.sourceSeat, 3);
      ctx.battle.log("Sengoku : 2 Marine défaussées → 3 cartes piochées.");
    }
  },

  /** ST15-003 Kingdew
   *  [Tour adverse] Quand ce Personnage est mis KO par un effet, jusqu'à
   *  1 de vos Leaders gagne +2000 de puissance pour tout le tour.
   *  (Simplification : on déclenche le buff sur on-ko quel que soit la
   *  source — pas de distinction combat/effet ici.) */
  "ST15-003": (ctx) => {
    if (ctx.hook !== "on-ko") return;
    ctx.battle.addPowerBuff(
      { kind: "leader", seat: ctx.sourceSeat },
      2000,
    );
    ctx.battle.log("Kingdew : Leader +2000 ce tour (en KO).");
  },

  /** OP09-052 Marco
   *  [Tour adverse] Vous pouvez défausser 1 carte de votre main : Quand
   *  ce Personnage est mis KO par un effet adverse, jouez cette carte
   *  Personnage épuisée depuis votre Défausse.
   *  (Simplification : auto-déclenchement sans coût discard ; quand Marco
   *  est KO, on tente de le re-poser épuisé depuis la défausse.) */
  "OP09-052": (ctx) => {
    if (ctx.hook !== "on-ko") return;
    // Cherche Marco dans la défausse (vient juste d'y arriver via koCharacter).
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    if (!seat) return;
    // La carte vient d'être ajoutée à la fin de la défausse — on cherche
    // l'index du dernier Marco.
    // On utilise les API publiques : la défausse est exposée via
    // ctx.battle ne donne pas accès direct. Mais on peut demander le seat
    // public et lire seat.discard ... actuellement pas exposé sur getSeat.
    // Workaround : on tente playCharacterFromDiscard sur le dernier index.
    // L'implémentation interne lira le discard.
    // Le seat est disponible — tentons l'index basé sur discardSize - 1.
    if (seat.discardSize === 0) return;
    const uid = ctx.battle.playCharacterFromDiscard(
      ctx.sourceSeat,
      seat.discardSize - 1,
      { rested: true },
    );
    if (uid) ctx.battle.log("Marco : ré-incarne épuisé depuis la Défausse.");
  },

  // ─── BATCH 24 — Forced opp choice + events simplifiés ──────────────────

  /** ST20-005 Charlotte Linlin
   *  [Jouée] Vous pouvez défausser 1 carte de votre main : Votre adversaire
   *  effectue l'un des choix suivants :
   *  • Votre adversaire défausse 2 cartes de sa main.
   *  • Votre adversaire place dans sa Défausse 1 carte du dessus de sa Vie. */
  "ST20-005": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat || seat.handSize < 1) {
        ctx.battle.log("Linlin : main vide, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST20-005",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt: "Linlin : défausse 1 carte de ta main pour activer l'effet.",
        params: { count: 1 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      // Étape 1 : discard fait → ouvre yes-no à l'adversaire.
      if (ctx.choice.selection.handIndices) {
        ctx.battle.discardFromHand(
          ctx.sourceSeat,
          ctx.choice.selection.handIndices,
        );
        const oppSeat: OnePieceBattleSeatId =
          ctx.sourceSeat === "p1" ? "p2" : "p1";
        ctx.battle.requestChoice({
          seat: oppSeat,
          sourceCardNumber: "ST20-005-step2",
          sourceUid: ctx.sourceUid,
          kind: "yes-no",
          prompt:
            "Linlin (forcé) : OUI = défausse 2 cartes / NON = perds 1 Vie.",
          params: {},
          cancellable: false,
        });
        return;
      }
    }
  },
  // Step 2 : l'adversaire répond yes-no → on applique selon le choix.
  "ST20-005-step2": (ctx) => {
    if (ctx.hook !== "on-choice-resolved" || !ctx.choice) return;
    if (ctx.choice.skipped) return;
    // ctx.sourceSeat est celui qui a posé Linlin ; ctx.choice est résolu
    // par l'adversaire (oppSeat). Pour appliquer les mutations à l'adv,
    // on calcule oppSeat ici.
    const oppSeat: OnePieceBattleSeatId =
      ctx.sourceSeat === "p1" ? "p2" : "p1";
    if (ctx.choice.selection.yesNo === true) {
      // Adversaire défausse 2 (random pour simplification).
      ctx.battle.discardRandom(oppSeat, 2);
      ctx.battle.log("Linlin : adversaire défausse 2 cartes.");
    } else {
      // Adversaire perd 1 vie (top of life → discard).
      ctx.battle.placeOpponentLifeOnDiscard(oppSeat);
      ctx.battle.log("Linlin : adversaire perd 1 Vie (→ Défausse).");
    }
  },

  /** OP09-097 Tourbillon noir (Event Counter)
   *  [Contre] Annulez les effets de jusqu'à 1 Leader ou Personnage adverse
   *  et faites-lui perdre -4000 de puissance pour tout le tour. */
  "OP09-097": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-097",
        sourceUid: ctx.sourceUid,
        kind: "select-target",
        prompt:
          "Tourbillon noir : choisis Leader/Persos adverse — annule effets + -4000 ce tour.",
        params: { allowLeader: true },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const oppSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const targetUid = ctx.choice.selection.targetUid;
      const ref: CardRef =
        targetUid === "leader"
          ? { kind: "leader", seat: oppSeat }
          : { kind: "character", seat: oppSeat, uid: targetUid };
      ctx.battle.addPowerBuff(ref, -4000);
      // Annule les effets de la cible pour ce tour.
      ctx.battle.cancelEffectsOfTarget(oppSeat, targetUid);
      ctx.battle.log(
        "Tourbillon noir : effets de la cible annulés + -4000 ce tour.",
      );
    }
  },

  /** OP09-098 Black Hole (Event)
   *  [Principale] Si votre Leader est de type {Équipage de Barbe Noire},
   *  annulez les effets de jusqu'à 1 Personnage adverse pour tout le tour.
   *  Puis, si ce Personnage a un coût de 4 ou moins, mettez-le KO. */
  "OP09-098": (ctx) => {
    if (ctx.hook === "on-play") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const leaderMeta = seat?.leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
        : null;
      const isBN = !!leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("équipage de barbe noire"),
      );
      if (!isBN) {
        ctx.battle.log("Black Hole : Leader pas Barbe Noire, effet annulé.");
        return;
      }
      // Sélection LIBRE (pas de filtre maxCost) — la cancellation s'applique
      // à n'importe quel Persos. Le KO ne s'applique qu'aux ≤ 4 cost.
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-098",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt:
          "Black Hole : choisis 1 Persos adverse — annule effets ; si coût ≤ 4, KO.",
        params: {},
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const oppSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const targetUid = ctx.choice.selection.targetUid;
      // Annule les effets de la cible pour ce tour.
      ctx.battle.cancelEffectsOfTarget(oppSeat, targetUid);
      // Si coût ≤ 4 (avec costBuff), KO.
      const opp = ctx.battle.getSeat(oppSeat);
      const target = opp?.characters.find((c) => c.uid === targetUid);
      if (!target) return;
      const meta = ONEPIECE_BASE_SET_BY_ID.get(target.cardId);
      if (!meta || meta.kind !== "character") return;
      const effectiveCost = meta.cost + (target.costBuff ?? 0);
      if (effectiveCost <= 4) {
        ctx.battle.koCharacter(oppSeat, targetUid);
        ctx.battle.log(
          `Black Hole : effets annulés + KO (coût ${effectiveCost} ≤ 4).`,
        );
      } else {
        ctx.battle.log(
          `Black Hole : effets annulés (coût ${effectiveCost} > 4, pas de KO).`,
        );
      }
    }
  },

  /** OP09-018 Disparais (Event)
   *  [Principale] Mettez KO jusqu'à 2 Personnages adverses ayant 4000 ou
   *  moins de puissance combinée.
   *  (Simplification : on KO 1 seul Persos ≤ 4000 power au lieu de 2
   *  combinés, le ciblage 2-cibles avec contrainte combinée demande une
   *  infra plus élaborée.) */
  "OP09-018": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-018",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt: "Disparais : KO 1 Persos adverse ≤ 4000 power (simplifié).",
        params: { maxPower: 4000 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const oppSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.koCharacter(oppSeat, ctx.choice.selection.targetUid);
      ctx.battle.log("Disparais : Persos adverse ≤ 4000 KO.");
    }
  },

  // ─── BATCH 25 — noBlockerThisTurn + restants ───────────────────────────

  /** OP09-014 Limejuice
   *  [Jouée] Jusqu'à 1 Personnage adverse ayant 4000 de puissance ou moins
   *  ne peut pas activer [Bloqueur] pour tout le tour. */
  "OP09-014": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-014",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt:
          "Limejuice : choisis 1 Persos adverse ≤ 4000 power à priver de [Bloqueur] ce tour.",
        params: { maxPower: 4000 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const oppSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.addNoBlockerThisTurn(oppSeat, ctx.choice.selection.targetUid);
      ctx.battle.log(
        "Limejuice : Persos adverse ≤ 4000 sans [Bloqueur] ce tour.",
      );
    }
  },

  /** OP09-118 Gol D. Roger (Leader)
   *  [Initiative] (Cette carte peut attaquer durant le tour où elle est
   *  jouée.) Quand votre adversaire active [Bloqueur], si vous ou votre
   *  adversaire n'avez plus de cartes dans votre Vie, vous remportez la
   *  partie.
   *  Note : la win condition est câblée DIRECTEMENT dans handleBlock côté
   *  serveur (pas via fireEffectFor) — cf. battle-onepiece.ts. Ce handler
   *  reste défini pour documenter la sémantique. */
  "OP09-118": (_ctx) => {
    // Win condition triggered by handleBlock — pas d'action ici.
  },

  /** OP09-062 Nico Robin (Leader)
   *  [Exil] (Quand cette carte inflige des dégâts, la carte cible est
   *  placée dans la Défausse sans activer Déclenchement.) [En attaquant]
   *  Vous pouvez défausser 1 carte de votre main ayant [...] (texte
   *  scrapé tronqué — partie active manquante).
   *  Note : [Exil] est câblé DIRECTEMENT dans takeLives côté serveur. La
   *  partie active [En attaquant] reste à câbler quand le texte sera
   *  complet. */
  "OP09-062": (_ctx) => {
    // [Exil] géré par takeLives — pas d'action ici.
  },

  /** ST15-001 Atmos
   *  [En attaquant] Si votre Leader est [Edward Newgate], vous ne pouvez
   *  pas ajouter de cartes de votre Vie à votre main grâce à vos effets
   *  pour tout le tour. */
  "ST15-001": (ctx) => {
    if (ctx.hook !== "on-attack") return;
    const seat = ctx.battle.getSeat(ctx.sourceSeat);
    const leaderMeta = seat?.leaderId
      ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
      : null;
    if (leaderMeta?.name !== "Edward Newgate") return;
    ctx.battle.setTurnFlag(ctx.sourceSeat, "no-take-life-by-effect");
    ctx.battle.log(
      "Atmos : Vie ne peut être ajoutée à la main par effet ce tour.",
    );
  },

  /** OP09-032 Don Quijote Rosinante
   *  [Attaque adverse] [Une fois par tour] Redressez ce Personnage. */
  "OP09-032": (ctx) => {
    if (ctx.hook !== "on-being-attacked") return;
    // [Attaque adverse] = c'est mon tour adverse qui attaque ; check active.
    if (ctx.battle.getActiveSeat() === ctx.sourceSeat) return;
    // [Une fois par tour] tracker.
    if (
      !ctx.battle.consumeOncePerTurnTrigger(
        ctx.sourceSeat,
        `rosinante-${ctx.sourceUid}`,
      )
    )
      return;
    ctx.battle.untapCharacter(ctx.sourceSeat, ctx.sourceUid);
    ctx.battle.log("Rosinante : redressé (Attaque adverse).");
  },

  // ─── BATCH 26 — Search Event + ko-self via koCharacter ─────────────────

  /** OP09-050 Nami
   *  [En attaquant] Regardez 5 cartes du dessus de votre deck, révélez
   *  jusqu'à 1 Événement bleu et ajoutez-le à votre main. Puis, placez
   *  les cartes restantes au-dessous de votre deck dans l'ordre de votre
   *  choix. */
  "OP09-050": (ctx) => {
    if (ctx.hook !== "on-attack") return;
    const found = ctx.battle.searchDeckTopForEvent(
      ctx.sourceSeat,
      5,
      "bleu",
      "bottom",
    );
    ctx.battle.log(
      found
        ? "Nami : 1 Événement bleu ajouté à la main."
        : "Nami : aucun Événement bleu révélé.",
    );
  },

  /** OP09-089 Stronger
   *  [Activation : Principale] Vous pouvez défausser 1 carte de votre main
   *  et placer ce Personnage dans votre Défausse : Si votre Leader est de
   *  type {Équipage de Barbe Noire}, piochez 1 carte. Puis, réduisez de
   *  -2 le coût de jusqu'à 1 Personnage adverse pour tout le tour. */
  "OP09-089": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat || seat.handSize < 1) {
        ctx.battle.log("Stronger : main vide, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-089",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt: "Stronger : défausse 1 carte (et place ce Persos en Défausse).",
        params: { count: 1 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      // Étape 1 : discard fait → place soi-même en défausse + draw conditionnel.
      if (ctx.choice.selection.handIndices && !ctx.choice.selection.targetUid) {
        ctx.battle.discardFromHand(
          ctx.sourceSeat,
          ctx.choice.selection.handIndices,
        );
        // Place ce Persos dans la Défausse via koCharacter (réutilise
        // l'API existante — la vraie sémantique « place dans la défausse »
        // est très proche du KO par effet).
        ctx.battle.koCharacter(ctx.sourceSeat, ctx.sourceUid);
        const seat = ctx.battle.getSeat(ctx.sourceSeat);
        const leaderMeta = seat?.leaderId
          ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
          : null;
        const isBN = !!leaderMeta?.types.some((t) =>
          t.toLowerCase().includes("équipage de barbe noire"),
        );
        if (isBN) {
          ctx.battle.drawCards(ctx.sourceSeat, 1);
          ctx.battle.log("Stronger : Leader BN → +1 carte piochée.");
        }
        // Étape 2 : ouvre le -2 cost choice.
        ctx.battle.requestChoice({
          seat: ctx.sourceSeat,
          sourceCardNumber: "OP09-089-step2",
          sourceUid: ctx.sourceUid,
          kind: "select-target",
          prompt: "Stronger : choisis 1 Persos adverse pour -2 coût ce tour.",
          params: { allowLeader: false },
          cancellable: true,
        });
        return;
      }
    }
  },
  // Step 2 wrapper.
  "OP09-089-step2": (ctx) => {
    if (ctx.hook !== "on-choice-resolved" || !ctx.choice) return;
    if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
    const oppSeat: OnePieceBattleSeatId =
      ctx.sourceSeat === "p1" ? "p2" : "p1";
    const targetUid = ctx.choice.selection.targetUid;
    if (targetUid === "leader") return;
    ctx.battle.addCostBuff(
      { kind: "character", seat: oppSeat, uid: targetUid },
      -2,
    );
    ctx.battle.log("Stronger : Persos adverse -2 coût ce tour.");
  },

  // ─── BATCH 27 — Status flags et Catarina Devon ─────────────────────────

  /** ST19-001 Smoker
   *  [Jouée] Vous pouvez défausser 1 carte de type {Marine} noire de
   *  votre main : Jusqu'à 2 Personnages adverses ayant un coût de 4 ou
   *  moins ne peuvent pas attaquer jusqu'à la fin du prochain tour
   *  adverse. (Filtre couleur «noire» omis — on filtre uniquement par
   *  type Marine pour le coût discard.) */
  "ST19-001": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST19-001",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt: "Smoker : défausse 1 carte Marine de ta main.",
        params: { count: 1, requireType: "Marine" },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      // Étape 1 : discard fait → ouvre 1ère cible.
      if (ctx.choice.selection.handIndices && !ctx.choice.selection.targetUid) {
        const discarded = ctx.battle.discardFromHand(
          ctx.sourceSeat,
          ctx.choice.selection.handIndices,
        );
        if (discarded.length === 0) {
          ctx.battle.log(
            "Smoker : pas de Marine défaussée, effet annulé.",
          );
          return;
        }
        ctx.battle.requestChoice({
          seat: ctx.sourceSeat,
          sourceCardNumber: "ST19-001",
          sourceUid: ctx.sourceUid,
          kind: "ko-character",
          prompt:
            "Smoker : 1ère cible — Persos adverse ≤ 4 coût (cannot attack).",
          params: { maxCost: 4 },
          cancellable: true,
        });
        return;
      }
      // Étape 2 : 1ère cible reçue.
      if (ctx.choice.selection.targetUid) {
        const oppSeat: OnePieceBattleSeatId =
          ctx.sourceSeat === "p1" ? "p2" : "p1";
        ctx.battle.addCannotAttackUntilNextOppTurnEnd(
          oppSeat,
          ctx.choice.selection.targetUid,
        );
        ctx.battle.log("Smoker : Persos adverse 1 ne peut pas attaquer.");
        // Ouvre 2ème cible via wrapper.
        ctx.battle.requestChoice({
          seat: ctx.sourceSeat,
          sourceCardNumber: "ST19-001-step2",
          sourceUid: ctx.sourceUid,
          kind: "ko-character",
          prompt:
            "Smoker : 2ème cible (peut être différente) — Persos adverse ≤ 4 coût.",
          params: { maxCost: 4 },
          cancellable: true,
        });
      }
    }
  },
  // Step 2 wrapper.
  "ST19-001-step2": (ctx) => {
    if (ctx.hook !== "on-choice-resolved" || !ctx.choice) return;
    if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
    const oppSeat: OnePieceBattleSeatId =
      ctx.sourceSeat === "p1" ? "p2" : "p1";
    ctx.battle.addCannotAttackUntilNextOppTurnEnd(
      oppSeat,
      ctx.choice.selection.targetUid,
    );
    ctx.battle.log("Smoker : Persos adverse 2 ne peut pas attaquer.");
  },

  /** ST21-003 Sanji
   *  [Jouée] Choisissez jusqu'à 1 de vos Personnages de type {Équipage de
   *  Chapeau de paille} ayant 6000 de puissance ou plus. Si le Personnage
   *  choisi attaque durant ce tour, votre adversaire ne peut pas activer
   *  [Bloqueur]. */
  "ST21-003": (ctx) => {
    if (ctx.hook === "on-play") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST21-003",
        sourceUid: ctx.sourceUid,
        kind: "buff-target",
        prompt:
          "Sanji ST21 : choisis 1 de tes Persos Chapeau ayant 6000+ power.",
        params: {
          allowLeader: false,
          requireType: "Équipage de Chapeau de paille",
        },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const targetUid = ctx.choice.selection.targetUid;
      if (targetUid === "leader") return;
      // Vérifie le power minimum 6000 côté server.
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const c = seat?.characters.find((x) => x.uid === targetUid);
      if (!c) return;
      const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
      if (!meta || meta.kind !== "character" || meta.power < 6000) {
        ctx.battle.log(
          "Sanji ST21 : Persos < 6000 power, effet annulé.",
        );
        return;
      }
      ctx.battle.addNextAttackPreventsBlock(ctx.sourceSeat, targetUid);
      ctx.battle.log(
        "Sanji ST21 : si ce Persos attaque, l'adv ne peut pas activer [Bloqueur].",
      );
    }
  },

  /** OP09-084 Catarina Devon
   *  [Activation : Principale] [Une fois par tour] Si votre Leader est
   *  de type {Équipage de Barbe Noire}, ce Personnage gagne [Double
   *  attaque], [Exil] ou [Bloqueur] jusqu'à la fin du prochain tour
   *  adverse.
   *  (Implémentation : on accorde toujours [Bloqueur] — le plus utile
   *  défensivement. Une UI de choix viendrait ensuite.) */
  "OP09-084": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const leaderMeta = seat?.leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
        : null;
      const isBN = !!leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("équipage de barbe noire"),
      );
      if (!isBN) {
        ctx.battle.log(
          "Catarina Devon : Leader pas Barbe Noire, effet annulé.",
        );
        return;
      }
      // Yes-no : OUI = Bloqueur / NON = Double attaque.
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-084",
        sourceUid: ctx.sourceUid,
        kind: "yes-no",
        prompt:
          "Catarina Devon : OUI = [Bloqueur] / NON = [Double attaque] (jusqu'à fin du prochain tour adverse).",
        params: {},
        cancellable: false,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped) return;
      const keyword =
        ctx.choice.selection.yesNo === true ? "Bloqueur" : "Double attaque";
      ctx.battle.grantTempKeyword(ctx.sourceSeat, ctx.sourceUid, keyword);
      ctx.battle.log(
        `Catarina Devon : gagne [${keyword}] jusqu'à fin du prochain tour adverse.`,
      );
    }
  },

  // ─── BATCH 29 — Effect cancellation + Roger ────────────────────────────

  /** OP09-093 Marshall D. Teach (Char)
   *  [Activation : Principale] [Une fois par tour] Si votre Leader est de
   *  type {Équipage de Barbe Noire} et que ce Personnage a été joué ce
   *  tour, annulez les effets de jusqu'à 1 Leader adverse pour tout le
   *  tour. Puis, annulez les effets de jusqu'à 1 Personnage adverse et
   *  empêchez-le d'attaquer jusqu'à la fin du prochain tour adverse. */
  "OP09-093": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      const leaderMeta = seat?.leaderId
        ? ONEPIECE_BASE_SET_BY_ID.get(seat.leaderId)
        : null;
      const isBN = !!leaderMeta?.types.some((t) =>
        t.toLowerCase().includes("équipage de barbe noire"),
      );
      if (!isBN) {
        ctx.battle.log(
          "Marshall D. Teach : Leader pas Barbe Noire, effet annulé.",
        );
        return;
      }
      // 1ère étape : annule effets du Leader adverse pour ce tour.
      const oppSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      ctx.battle.cancelEffectsOfTarget(oppSeat, "leader");
      ctx.battle.log(
        "Marshall D. Teach : effets du Leader adverse annulés ce tour.",
      );
      // 2ème étape : choix d'un Persos adverse pour cancel + cannot attack.
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-093",
        sourceUid: ctx.sourceUid,
        kind: "ko-character",
        prompt:
          "Marshall D. Teach : choisis 1 Persos adverse (effets annulés + cannot attack).",
        params: {},
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.targetUid) return;
      const oppSeat: OnePieceBattleSeatId =
        ctx.sourceSeat === "p1" ? "p2" : "p1";
      const targetUid = ctx.choice.selection.targetUid;
      ctx.battle.cancelEffectsOfTarget(oppSeat, targetUid);
      ctx.battle.addCannotAttackUntilNextOppTurnEnd(oppSeat, targetUid);
      ctx.battle.log(
        "Marshall D. Teach : Persos adverse — effets annulés + cannot attack.",
      );
    }
  },

  /** OP09-081 Marshall D. Teach (Leader)
   *  Vos effets [Jouée] sont annulés. (Passif — câblé en setup via
   *  ownPlayedEffectsCancelledPassive.)
   *  [Activation : Principale] Vous pouvez défausser 1 carte de votre main
   *  : Les effets [Jouée] de votre adversaire sont annulés jusqu'à la fin
   *  du prochain tour adverse. */
  "OP09-081": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat || seat.handSize < 1) {
        ctx.battle.log("Leader Teach : main vide, effet annulé.");
        return;
      }
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "OP09-081",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt:
          "Leader Teach : défausse 1 carte de ta main pour annuler les [Jouée] adverses.",
        params: { count: 1 },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      ctx.battle.discardFromHand(
        ctx.sourceSeat,
        ctx.choice.selection.handIndices,
      );
      ctx.battle.cancelOpponentPlayedEffectsUntilEndOfTurn(ctx.sourceSeat);
      ctx.battle.log(
        "Leader Teach : effets [Jouée] adverses annulés jusqu'à fin du prochain tour adverse.",
      );
    }
  },

  // ─── BATCH 30 — Roger win condition + Luffy Leader cost+1 + Gordon ─────

  /** OP09-061 Monkey D. Luffy (Leader)
   *  [DON!! x1] Augmentez de +1 le coût de tous vos Personnages.
   *  [Votre tour] [Une fois par tour] Quand 2 cartes DON!! ou plus de
   *  votre terrain sont renvoyées à votre deck DON!!, ajoutez jusqu'à
   *  1 carte DON!! redressée de votre deck DON!! et ajoutez jusqu'à
   *  1 carte épuisée en plus.
   *
   *  Le passif [DON x1] +1 coût own Persos est implémenté via le registry
   *  PASSIVE_COST_MODS (cf. plus bas) — il s'applique à la résolution du
   *  coût quand on joue un Persos ET aux filtres maxCost via costBuff.
   *  Ici, on traite le trigger DON-return. */
  "OP09-061": (ctx) => {
    if (ctx.hook === "on-turn-start") {
      // Applique le costBuff +1 sur les Persos déjà en jeu si le Leader
      // a 1+ DON attachée (le passif s'applique aussi via PASSIVE_COST_MODS
      // pour les futurs Persos joués + ciblage maxCost).
      const seat = ctx.battle.getSeat(ctx.sourceSeat);
      if (!seat || seat.leaderAttachedDon < 1) return;
      for (const c of seat.characters) {
        ctx.battle.addCostBuff(
          { kind: "character", seat: ctx.sourceSeat, uid: c.uid },
          1,
        );
      }
      return;
    }
    if (ctx.hook === "on-don-returned") {
      // [Votre tour] check.
      if (ctx.battle.getActiveSeat() !== ctx.sourceSeat) return;
      // [Une fois par tour] tracker.
      if (
        !ctx.battle.consumeOncePerTurnTrigger(
          ctx.sourceSeat,
          `luffy-leader-don-return`,
        )
      )
        return;
      // Condition : 2+ DON renvoyées dans cette action.
      const count = ctx.donReturnedCount ?? 0;
      if (count < 2) return;
      // Ajoute 1 DON redressée + 1 épuisée depuis le DON deck.
      ctx.battle.giveDonFromDeck(ctx.sourceSeat, 1); // active = redressée
      // 1 épuisée = on prend 1 du DON deck dans donRested directement.
      const seat2 = ctx.battle.getSeat(ctx.sourceSeat);
      if (seat2) {
        // Pas d'API directe — on contourne via giveDonFromDeck puis restDon.
        ctx.battle.giveDonFromDeck(ctx.sourceSeat, 1);
        ctx.battle.restDon(ctx.sourceSeat, 1);
      }
      ctx.battle.log(
        "Luffy Leader : 2+ DON renvoyées → +1 DON redressée + 1 DON épuisée du DON deck.",
      );
    }
  },

  /** ST16-002 Gordon
   *  [Attaque adverse] Vous pouvez défausser autant de cartes de type
   *  {Musique} de votre main que vous le voulez. Pour chaque carte
   *  défaussée, votre Leader ou 1 de vos Personnages gagne +1000 de
   *  puissance pour tout le combat.
   *  (Implémentation simplifiée : on déclenche au moment de la défense
   *  via le hook on-activate-main du joueur — il décide combien défausser.
   *  Une intégration vraiment counter-step demanderait un hook on-defense.) */
  "ST16-002": (ctx) => {
    if (ctx.hook === "on-activate-main") {
      ctx.battle.requestChoice({
        seat: ctx.sourceSeat,
        sourceCardNumber: "ST16-002",
        sourceUid: ctx.sourceUid,
        kind: "discard-card",
        prompt:
          "Gordon : défausse jusqu'à 3 cartes Musique de ta main pour +1000 chacune.",
        params: { count: 3, requireType: "Musique" },
        cancellable: true,
      });
      return;
    }
    if (ctx.hook === "on-choice-resolved" && ctx.choice) {
      if (ctx.choice.skipped || !ctx.choice.selection.handIndices) return;
      const discarded = ctx.battle.discardFromHand(
        ctx.sourceSeat,
        ctx.choice.selection.handIndices,
      );
      if (discarded.length === 0) {
        ctx.battle.log("Gordon : aucune Musique défaussée.");
        return;
      }
      const buff = discarded.length * 1000;
      ctx.battle.addPowerBuff(
        { kind: "leader", seat: ctx.sourceSeat },
        buff,
      );
      ctx.battle.log(
        `Gordon : Leader +${buff} (${discarded.length} Musique défaussée(s)).`,
      );
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

// ─── Registre des substitutions de KO ───────────────────────────────────
// Quand un Persos serait KO (par effet ou par combat), le moteur consulte
// ce registre AVANT d'appliquer le KO. Si une substitution s'applique,
// elle est exécutée à la place et le KO original est annulé.

export type KoSubstituteContext = {
  // Cible originelle qui devait être KO.
  target: { seat: OnePieceBattleSeatId; uid: string; cardId: string };
  // Source du KO.
  source: "combat" | "effect";
  // Seat propriétaire de la carte qui possède la substitution.
  modSourceSeat: OnePieceBattleSeatId;
  // Uid de la carte source dans son seat (peut être la cible elle-même
  // pour Cracker, ou un autre Persos pour Monster).
  modSourceUid: string;
  battle: BattleEffectAccess;
};

/** Substitution KO. Retourne true si la substitution a été appliquée et
 *  que le KO original doit être annulé ; false sinon. La substitution
 *  est responsable d'effectuer ses propres mutations (mill life,
 *  sacrifier soi-même, etc.). */
export type KoSubstitute = (ctx: KoSubstituteContext) => boolean;

export const KO_SUBSTITUTES: Record<string, KoSubstitute> = {
  /** ST20-002 Charlotte Cracker
   *  [Une fois par tour] Si ce Personnage est mis KO par un effet, vous
   *  pouvez placer dans votre Défausse 1 carte du dessus de votre Vie à
   *  la place. */
  "ST20-002": (ctx) => {
    if (ctx.source !== "effect") return false;
    if (ctx.target.uid !== ctx.modSourceUid) return false; // Cracker = la cible
    if (ctx.target.seat !== ctx.modSourceSeat) return false;
    // Tracker 1/turn : on consulte le seat actuel pour koSubUsedThisTurn.
    const seat = ctx.battle.getSeat(ctx.modSourceSeat);
    if (!seat) return false;
    const me = seat.characters.find((c) => c.uid === ctx.modSourceUid);
    if (!me || me.koSubUsedThisTurn) return false;
    if (seat.lifeCount === 0) return false;
    // Effectue la substitution : mill 1 vie + marque le tracker.
    ctx.battle.placeOpponentLifeOnDiscard(ctx.modSourceSeat);
    ctx.battle.markKoSubUsedThisTurn(ctx.modSourceSeat, ctx.modSourceUid);
    ctx.battle.log(
      "Cracker : KO esquivé → 1 Vie placée dans la Défausse à la place.",
    );
    return true;
  },

  /** OP09-012 Monster
   *  Si un de vos Personnages [Bonk Punch] est mis KO par un effet, vous
   *  pouvez placer ce Personnage dans votre Défausse à la place.
   *  → Quand un autre Persos [Bonk Punch] de mon seat est KO par effet,
   *    ce Monster se sacrifie et le Bonk Punch survit. */
  "OP09-012": (ctx) => {
    if (ctx.source !== "effect") return false;
    if (ctx.target.seat !== ctx.modSourceSeat) return false;
    if (ctx.target.uid === ctx.modSourceUid) return false; // pas Monster lui-même
    const targetMeta = ONEPIECE_BASE_SET_BY_ID.get(ctx.target.cardId);
    if (targetMeta?.name !== "Bonk Punch") return false;
    // Sacrifice Monster à la place du Bonk Punch.
    // On utilise koCharacter sur Monster — mais ça re-ouvrirait la
    // substitution → boucle. On expose une méthode "koCharacterDirect"
    // qui bypass les substitutes.
    ctx.battle.koCharacterDirect(ctx.modSourceSeat, ctx.modSourceUid);
    ctx.battle.log(
      "Monster : sacrifié pour sauver un Persos [Bonk Punch].",
    );
    return true;
  },
};

/** Évalue toutes les substitutions de KO. Si une retourne true, la KO
 *  originale doit être annulée. Vérifie les Persos de l'owner du target
 *  (auto-substitute) ET les autres Persos du même seat. */
export function fireKoSubstitutes(
  target: { seat: OnePieceBattleSeatId; uid: string; cardId: string },
  source: "combat" | "effect",
  battle: BattleEffectAccess,
): boolean {
  const seat = battle.getSeat(target.seat);
  if (!seat) return false;
  // Itère sur tous les Persos du même seat (incluant la cible elle-même
  // pour les substitutions auto type Cracker).
  for (const c of seat.characters) {
    const num = cardNumberOf(c.cardId);
    const sub = KO_SUBSTITUTES[num];
    if (!sub) continue;
    try {
      const handled = sub({
        target,
        source,
        modSourceSeat: target.seat,
        modSourceUid: c.uid,
        battle,
      });
      if (handled) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

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

/** Fire le hook on-don-returned sur toutes les cartes du seat (Leader +
 *  Persos + Stage). Le `donReturnedCount` est passé via le contexte. */
export function fireOnDonReturned(
  seat: OnePieceBattleSeatId,
  count: number,
  battle: BattleEffectAccess,
): void {
  const s = battle.getSeat(seat);
  if (!s) return;
  const fire = (cardId: string, uid: string) => {
    const meta = ONEPIECE_BASE_SET_BY_ID.get(cardId);
    if (!meta) return;
    const handler = CARD_HANDLERS[meta.cardNumber];
    if (!handler) return;
    try {
      handler({
        hook: "on-don-returned",
        sourceUid: uid,
        sourceSeat: seat,
        battle,
        donReturnedCount: count,
      });
    } catch {
      // ignore
    }
  };
  if (s.leaderId) fire(s.leaderId, "leader");
  for (const c of s.characters) fire(c.cardId, c.uid);
  if (s.stage) fire(s.stage.cardId, s.stage.uid);
}

/** Fire le hook on-being-attacked sur la carte cible d'une attaque. */
export function fireOnBeingAttacked(
  target: { seat: OnePieceBattleSeatId; uid: string; cardId: string },
  attacker: { seat: OnePieceBattleSeatId; uid: string },
  battle: BattleEffectAccess,
): void {
  const meta = ONEPIECE_BASE_SET_BY_ID.get(target.cardId);
  if (!meta) return;
  const handler = CARD_HANDLERS[meta.cardNumber];
  if (!handler) return;
  try {
    handler({
      hook: "on-being-attacked",
      sourceUid: target.uid,
      sourceSeat: target.seat,
      battle,
      attackedBy: attacker,
    });
  } catch {
    // ignore
  }
}
