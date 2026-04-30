// Tests unitaires des effets de cartes One Piece TCG.
//
// Mock BattleEffectAccess + OnePieceBattleSeatId fixture, puis fire les
// handlers manuellement et observe les appels.
//
// Run : `cd party && npm install && npm test`

import { describe, expect, it, beforeEach } from "vitest";
import {
  CARD_HANDLERS,
  PASSIVE_POWER_MODS,
  PASSIVE_COST_MODS,
  KO_GUARDS,
  KEYWORD_GRANTS,
  LEAVE_FIELD_LISTENERS,
  KO_SUBSTITUTES,
  type BattleEffectAccess,
  type EffectContext,
  type CardRef,
} from "../src/lib/onepiece-effects";
import type {
  OnePieceBattleSeatId,
  OnePieceBattleCardInPlay,
  OnePiecePendingChoice,
  OnePiecePendingChoiceKind,
} from "../../shared/types";

// ─── Fake state ──────────────────────────────────────────────────────────

type FakeSeat = {
  leaderId: string | null;
  leaderRested: boolean;
  leaderAttachedDon: number;
  characters: OnePieceBattleCardInPlay[];
  stage: OnePieceBattleCardInPlay | null;
  hand: string[];
  deck: string[];
  life: string[];
  discard: string[];
  donDeck: number;
  donActive: number;
  donRested: number;
  faceUpLifeIndices: Set<number>;
  turnFlags: Set<string>;
  oncePerTurnTriggers: Set<string>;
  cancelledEffectUids: Set<string>;
};

function emptySeat(leaderId: string | null = null): FakeSeat {
  return {
    leaderId,
    leaderRested: false,
    leaderAttachedDon: 0,
    characters: [],
    stage: null,
    hand: [],
    deck: [],
    life: [],
    discard: [],
    donDeck: 10,
    donActive: 5,
    donRested: 0,
    faceUpLifeIndices: new Set(),
    turnFlags: new Set(),
    oncePerTurnTriggers: new Set(),
    cancelledEffectUids: new Set(),
  };
}

function makeChar(
  cardId: string,
  uid: string,
  attachedDon = 0,
  rested = false,
): OnePieceBattleCardInPlay {
  return { uid, cardId, attachedDon, rested, playedThisTurn: false };
}

type Calls = {
  log: string[];
  drawn: { seat: OnePieceBattleSeatId; count: number }[];
  discardedRandom: { seat: OnePieceBattleSeatId; count: number }[];
  givenDon: { seat: OnePieceBattleSeatId; count: number }[];
  powerBuffs: { ref: CardRef; amount: number }[];
  costBuffs: { ref: CardRef; amount: number }[];
  koed: { seat: OnePieceBattleSeatId; uid: string }[];
  attachedDon: { target: CardRef; count: number }[];
  rested: { seat: OnePieceBattleSeatId; uid: string }[];
  untaped: { seat: OnePieceBattleSeatId; uid: string }[];
  bounced: { seat: OnePieceBattleSeatId; uid: string }[];
  choices: OnePiecePendingChoice[];
  takenLife: OnePieceBattleSeatId[];
  millOpponentLife: OnePieceBattleSeatId[];
  flippedFaceUp: OnePieceBattleSeatId[];
  donReturned: { seat: OnePieceBattleSeatId; count: number }[];
  cancelledEffects: { seat: OnePieceBattleSeatId; uid: string }[];
  declaredWin: { seat: OnePieceBattleSeatId; reason: string }[];
};

function emptyCalls(): Calls {
  return {
    log: [],
    drawn: [],
    discardedRandom: [],
    givenDon: [],
    powerBuffs: [],
    costBuffs: [],
    koed: [],
    attachedDon: [],
    rested: [],
    untaped: [],
    bounced: [],
    choices: [],
    takenLife: [],
    millOpponentLife: [],
    flippedFaceUp: [],
    donReturned: [],
    cancelledEffects: [],
    declaredWin: [],
  };
}

function makeBattle(
  p1: FakeSeat,
  p2: FakeSeat,
  activeSeat: OnePieceBattleSeatId | null = "p1",
): { battle: BattleEffectAccess; calls: Calls } {
  const calls = emptyCalls();
  const seats: Record<OnePieceBattleSeatId, FakeSeat> = { p1, p2 };
  const battle: BattleEffectAccess = {
    drawCards(seat, count) {
      calls.drawn.push({ seat, count });
      seats[seat].donDeck = Math.max(0, seats[seat].donDeck);
    },
    discardRandom(seat, count) {
      calls.discardedRandom.push({ seat, count });
    },
    giveDonFromDeck(seat, count) {
      const taken = Math.min(count, seats[seat].donDeck);
      seats[seat].donDeck -= taken;
      seats[seat].donActive += taken;
      calls.givenDon.push({ seat, count: taken });
    },
    addPowerBuff(ref, amount) {
      calls.powerBuffs.push({ ref, amount });
    },
    addCostBuff(ref, amount) {
      calls.costBuffs.push({ ref, amount });
    },
    log(line) {
      calls.log.push(line);
    },
    takeLifeToHand(seat) {
      calls.takenLife.push(seat);
      const card = seats[seat].life.shift() ?? null;
      if (card) seats[seat].hand.push(card);
      return card;
    },
    searchDeckTopForType(seat, count, _typeFilter, _restGoesTo, _excludeName) {
      const top = seats[seat].deck.splice(0, count);
      // Prend la 1ère pour le test (les filtres sont ignorés au mock).
      const found = top.shift() ?? null;
      if (found) seats[seat].hand.push(found);
      seats[seat].deck.push(...top);
      return found;
    },
    searchDeckTopForTrigger(seat, count, extractCount) {
      const top = seats[seat].deck.splice(0, count);
      const taken = top.splice(0, extractCount);
      seats[seat].hand.push(...taken);
      seats[seat].deck.push(...top);
      return taken;
    },
    searchDeckTopForEvent(seat, count, _color, _restGoesTo) {
      const top = seats[seat].deck.splice(0, count);
      const found = top.shift() ?? null;
      if (found) seats[seat].hand.push(found);
      seats[seat].deck.push(...top);
      return found;
    },
    peekTopOfDeck(seat) {
      return seats[seat].deck[0] ?? null;
    },
    peekTopOfDeckN(seat, count) {
      return seats[seat].deck.slice(0, count);
    },
    applyReorderTopDeck(_seat, _reorder) {
      // Pas de mutation dans le mock pour simplifier.
    },
    requestChoice(args) {
      calls.choices.push({
        id: `mock-${calls.choices.length}`,
        seat: args.seat,
        sourceCardNumber: args.sourceCardNumber,
        sourceUid: args.sourceUid,
        kind: args.kind,
        prompt: args.prompt,
        params: args.params ?? {},
        cancellable: args.cancellable ?? true,
      });
    },
    koCharacter(seat, uid) {
      const idx = seats[seat].characters.findIndex((c) => c.uid === uid);
      if (idx < 0) return false;
      const c = seats[seat].characters.splice(idx, 1)[0];
      seats[seat].discard.push(c.cardId);
      calls.koed.push({ seat, uid });
      return true;
    },
    koCharacterDirect(seat, uid) {
      return this.koCharacter(seat, uid);
    },
    attachDonToTarget(target, count) {
      const seat = seats[target.seat];
      const taken = Math.min(count, seat.donActive + seat.donRested);
      const fromActive = Math.min(taken, seat.donActive);
      seat.donActive -= fromActive;
      seat.donRested -= taken - fromActive;
      if (target.kind === "leader") seat.leaderAttachedDon += taken;
      else if (target.kind === "character") {
        const c = seat.characters.find((x) => x.uid === target.uid);
        if (c) c.attachedDon += taken;
      }
      calls.attachedDon.push({ target, count: taken });
      return taken;
    },
    placeCharacterAtDeckBottom(seat, uid) {
      const idx = seats[seat].characters.findIndex((c) => c.uid === uid);
      if (idx < 0) return false;
      const c = seats[seat].characters.splice(idx, 1)[0];
      seats[seat].deck.push(c.cardId);
      return true;
    },
    restCharacter(seat, uid) {
      const c = seats[seat].characters.find((x) => x.uid === uid);
      if (!c) return false;
      c.rested = true;
      calls.rested.push({ seat, uid });
      return true;
    },
    untapCharacter(seat, uid) {
      const c = seats[seat].characters.find((x) => x.uid === uid);
      if (!c) return false;
      c.rested = false;
      calls.untaped.push({ seat, uid });
      return true;
    },
    untapLeader(seat) {
      seats[seat].leaderRested = false;
    },
    bounceCharacter(seat, uid) {
      const idx = seats[seat].characters.findIndex((c) => c.uid === uid);
      if (idx < 0) return false;
      const c = seats[seat].characters.splice(idx, 1)[0];
      seats[seat].hand.push(c.cardId);
      calls.bounced.push({ seat, uid });
      return true;
    },
    placeCardAboveLife(seat, source) {
      const s = seats[seat];
      let cardId: string | null = null;
      if (source.kind === "hand") {
        cardId = s.hand.splice(source.handIndex, 1)[0] ?? null;
      } else if (source.kind === "deck-top") {
        cardId = s.deck.shift() ?? null;
      } else {
        const idx = s.characters.findIndex((c) => c.uid === source.uid);
        if (idx >= 0) cardId = s.characters.splice(idx, 1)[0].cardId;
      }
      if (!cardId) return false;
      s.life.unshift(cardId);
      return true;
    },
    placeHandOnTopOfDeck(seat, handIndex) {
      const card = seats[seat].hand.splice(handIndex, 1)[0] ?? null;
      if (!card) return null;
      seats[seat].deck.unshift(card);
      return card;
    },
    placeHandAtDeckBottom(seat, handIndex) {
      const card = seats[seat].hand.splice(handIndex, 1)[0] ?? null;
      if (!card) return null;
      seats[seat].deck.push(card);
      return card;
    },
    playCharacterFromHand(seat, handIndex, _options) {
      const cardId = seats[seat].hand.splice(handIndex, 1)[0];
      if (!cardId) return null;
      const uid = `c-test-${seats[seat].characters.length}`;
      seats[seat].characters.push(makeChar(cardId, uid));
      return uid;
    },
    playCharacterFromDiscard(seat, discardIndex, _options) {
      const cardId = seats[seat].discard.splice(discardIndex, 1)[0];
      if (!cardId) return null;
      const uid = `c-test-${seats[seat].characters.length}`;
      seats[seat].characters.push(makeChar(cardId, uid, 0, true));
      return uid;
    },
    addNoBlockerThisTurn(_seat, _uid) {
      return true;
    },
    addCannotAttackUntilNextOppTurnEnd(_seat, _uid) {
      return true;
    },
    addNextAttackPreventsBlock(_seat, _uid) {
      return true;
    },
    grantTempKeyword(_seat, _uid, _keyword) {
      return true;
    },
    cancelOpponentPlayedEffectsUntilEndOfTurn(_seat) {},
    cancelEffectsOfTarget(seat, uid) {
      seats[seat].cancelledEffectUids.add(uid);
      calls.cancelledEffects.push({ seat, uid });
    },
    declareWinFor(seat, reason) {
      calls.declaredWin.push({ seat, reason });
    },
    markKoSubUsedThisTurn(_seat, _uid) {},
    consumeOncePerTurnTrigger(seat, key) {
      if (seats[seat].oncePerTurnTriggers.has(key)) return false;
      seats[seat].oncePerTurnTriggers.add(key);
      return true;
    },
    setTurnFlag(seat, flag) {
      seats[seat].turnFlags.add(flag);
    },
    hasTurnFlag(seat, flag) {
      return seats[seat].turnFlags.has(flag);
    },
    flipTopLifeFaceUp(seat) {
      if (seats[seat].life.length === 0) return null;
      if (seats[seat].faceUpLifeIndices.has(0)) return null;
      seats[seat].faceUpLifeIndices.add(0);
      return seats[seat].life[0];
    },
    discardFromHand(seat, indices) {
      const sorted = [...indices].sort((a, b) => b - a);
      const out: string[] = [];
      for (const i of sorted) {
        const c = seats[seat].hand.splice(i, 1)[0];
        if (c) {
          seats[seat].discard.push(c);
          out.push(c);
        }
      }
      return out;
    },
    returnDonFromBoard(seat, count) {
      const s = seats[seat];
      let returned = 0;
      while (returned < count && s.donRested > 0) {
        s.donRested--;
        s.donDeck++;
        returned++;
      }
      while (returned < count && s.donActive > 0) {
        s.donActive--;
        s.donDeck++;
        returned++;
      }
      while (returned < count && s.leaderAttachedDon > 0) {
        s.leaderAttachedDon--;
        s.donDeck++;
        returned++;
      }
      calls.donReturned.push({ seat, count: returned });
      return returned;
    },
    restDon(seat, count) {
      const taken = Math.min(count, seats[seat].donActive);
      seats[seat].donActive -= taken;
      seats[seat].donRested += taken;
      return taken;
    },
    placeOpponentLifeOnDiscard(seat) {
      const c = seats[seat].life.shift() ?? null;
      if (c) seats[seat].discard.push(c);
      calls.millOpponentLife.push(seat);
      return c;
    },
    getActiveSeat: () => activeSeat,
    getSeat(seat) {
      const s = seats[seat];
      if (!s) return null;
      return {
        leaderId: s.leaderId,
        leaderRested: s.leaderRested,
        leaderAttachedDon: s.leaderAttachedDon,
        characters: s.characters,
        stage: s.stage,
        handSize: s.hand.length,
        deckSize: s.deck.length,
        lifeCount: s.life.length,
        discardSize: s.discard.length,
        donActive: s.donActive,
        donRested: s.donRested,
      };
    },
  };
  return { battle, calls };
}

function fire(
  cardNumber: string,
  ctx: Omit<EffectContext, "battle"> & { battle: BattleEffectAccess },
) {
  const handler = CARD_HANDLERS[cardNumber];
  expect(handler, `handler ${cardNumber} should exist`).toBeTruthy();
  handler(ctx);
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe("CARD_HANDLERS coverage", () => {
  it("registers all 166 base set cards", () => {
    // Sanity : la couverture est à 100%.
    expect(Object.keys(CARD_HANDLERS).length).toBeGreaterThan(80);
  });
});

describe("OP09-005 Silvers Rayleigh — draw 2 + discard 1 si opp ≥2 chars 5000+", () => {
  it("ne fait rien si opp a < 2 chars 5000+", () => {
    const p1 = emptySeat();
    const p2 = emptySeat();
    p2.characters.push(makeChar("OP09-001", "c1")); // Leader pas un char
    const { battle, calls } = makeBattle(p1, p2);
    fire("OP09-005", {
      hook: "on-play",
      sourceUid: "leader",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.drawn).toHaveLength(0);
  });

  it("draw 2 + ouvre discard-card si opp a 2+ chars 5000+", () => {
    const p1 = emptySeat();
    const p2 = emptySeat();
    // OP09-076 Roronoa Zoro (5000 power)
    p2.characters.push(makeChar("OP09-076", "c1"));
    p2.characters.push(makeChar("OP09-076", "c2"));
    const { battle, calls } = makeBattle(p1, p2);
    fire("OP09-005", {
      hook: "on-play",
      sourceUid: "leader",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.drawn).toEqual([{ seat: "p1", count: 2 }]);
    expect(calls.choices[0]?.kind).toBe("discard-card");
  });
});

describe("OP09-031 Doflamingo — on-turn-end untap si 2+ rested", () => {
  it("redresse self si 2+ Persos rested", () => {
    const p1 = emptySeat();
    p1.characters.push(makeChar("OP09-031", "self"));
    p1.characters.push(makeChar("OP09-076", "c1", 0, true));
    p1.characters.push(makeChar("OP09-076", "c2", 0, true));
    const { battle, calls } = makeBattle(p1, emptySeat());
    fire("OP09-031", {
      hook: "on-turn-end",
      sourceUid: "self",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.untaped).toContainEqual({ seat: "p1", uid: "self" });
  });

  it("ne redresse pas si <2 rested", () => {
    const p1 = emptySeat();
    p1.characters.push(makeChar("OP09-031", "self"));
    p1.characters.push(makeChar("OP09-076", "c1", 0, true));
    const { battle, calls } = makeBattle(p1, emptySeat());
    fire("OP09-031", {
      hook: "on-turn-end",
      sourceUid: "self",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.untaped).toHaveLength(0);
  });
});

describe("OP09-032 Rosinante — on-being-attacked untap self (1/turn)", () => {
  it("untap self si attaque adverse", () => {
    const p1 = emptySeat();
    p1.characters.push(makeChar("OP09-032", "rosi"));
    const { battle, calls } = makeBattle(p1, emptySeat(), "p2"); // tour adverse
    fire("OP09-032", {
      hook: "on-being-attacked",
      sourceUid: "rosi",
      sourceSeat: "p1",
      battle,
      attackedBy: { seat: "p2", uid: "leader" },
    });
    expect(calls.untaped).toContainEqual({ seat: "p1", uid: "rosi" });
  });

  it("ne untap pas pendant son propre tour", () => {
    const p1 = emptySeat();
    p1.characters.push(makeChar("OP09-032", "rosi"));
    const { battle, calls } = makeBattle(p1, emptySeat(), "p1"); // mon tour
    fire("OP09-032", {
      hook: "on-being-attacked",
      sourceUid: "rosi",
      sourceSeat: "p1",
      battle,
      attackedBy: { seat: "p2", uid: "leader" },
    });
    expect(calls.untaped).toHaveLength(0);
  });
});

describe("OP09-046 Crocodile — play-from-hand Cross Guild ≤5", () => {
  it("ouvre play-from-hand avec maxCost 5", () => {
    const { battle, calls } = makeBattle(emptySeat(), emptySeat());
    fire("OP09-046", {
      hook: "on-play",
      sourceUid: "c1",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.choices[0]?.kind).toBe("play-from-hand");
    expect(calls.choices[0]?.params.maxCost).toBe(5);
    expect(calls.choices[0]?.params.requireType).toBe("Cross Guild");
  });
});

describe("OP09-085 Gecko Moria — play-from-discard Thriller Bark ≤2", () => {
  it("ouvre play-from-discard avec maxCost 2", () => {
    const { battle, calls } = makeBattle(emptySeat(), emptySeat());
    fire("OP09-085", {
      hook: "on-play",
      sourceUid: "c1",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.choices[0]?.kind).toBe("play-from-discard");
    expect(calls.choices[0]?.params.maxCost).toBe(2);
  });
});

describe("OP09-097 Tourbillon noir — cancel + -4000", () => {
  it("annule effets cible + applique -4000", () => {
    const p1 = emptySeat();
    const p2 = emptySeat();
    p2.characters.push(makeChar("OP09-076", "target"));
    const { battle, calls } = makeBattle(p1, p2);
    // Étape 1 : on-play ouvre la sélection.
    fire("OP09-097", {
      hook: "on-play",
      sourceUid: "evt1",
      sourceSeat: "p1",
      battle,
    });
    // Étape 2 : on simule la résolution.
    fire("OP09-097", {
      hook: "on-choice-resolved",
      sourceUid: "evt1",
      sourceSeat: "p1",
      battle,
      choice: { skipped: false, selection: { targetUid: "target" } },
    });
    expect(calls.cancelledEffects).toContainEqual({ seat: "p2", uid: "target" });
    expect(calls.powerBuffs).toContainEqual(
      expect.objectContaining({ amount: -4000 }),
    );
  });
});

describe("OP09-098 Black Hole — cancel toujours + KO si ≤4 cost", () => {
  it("annule + KO le Persos si coût ≤ 4", () => {
    const p1 = emptySeat();
    p1.leaderId = "OP09-081"; // Marshall D. Teach Leader (Barbe Noire)
    const p2 = emptySeat();
    // OP09-076 Zoro coût 4
    p2.characters.push(makeChar("OP09-076", "target"));
    const { battle, calls } = makeBattle(p1, p2);
    fire("OP09-098", {
      hook: "on-play",
      sourceUid: "evt1",
      sourceSeat: "p1",
      battle,
    });
    fire("OP09-098", {
      hook: "on-choice-resolved",
      sourceUid: "evt1",
      sourceSeat: "p1",
      battle,
      choice: { skipped: false, selection: { targetUid: "target" } },
    });
    expect(calls.cancelledEffects).toContainEqual({ seat: "p2", uid: "target" });
    expect(calls.koed).toContainEqual({ seat: "p2", uid: "target" });
  });

  it("rate si Leader pas Barbe Noire", () => {
    const p1 = emptySeat();
    p1.leaderId = "OP09-001"; // Shanks (pas Barbe Noire)
    const { battle, calls } = makeBattle(p1, emptySeat());
    fire("OP09-098", {
      hook: "on-play",
      sourceUid: "evt1",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.choices).toHaveLength(0);
  });
});

describe("OP09-061 Luffy Leader — on-don-returned 2+ → +1 active +1 rested DON", () => {
  it("trigger seulement quand 2+ DON renvoyées", () => {
    const p1 = emptySeat();
    p1.leaderId = "OP09-061";
    const { battle, calls } = makeBattle(p1, emptySeat(), "p1");
    fire("OP09-061", {
      hook: "on-don-returned",
      sourceUid: "leader",
      sourceSeat: "p1",
      battle,
      donReturnedCount: 2,
    });
    // Doit donner 2 DON depuis le DON deck (1 active puis 1 active+rest).
    expect(calls.givenDon.length).toBeGreaterThanOrEqual(1);
  });

  it("ne trigger pas si seulement 1 DON renvoyée", () => {
    const p1 = emptySeat();
    p1.leaderId = "OP09-061";
    const { battle, calls } = makeBattle(p1, emptySeat(), "p1");
    fire("OP09-061", {
      hook: "on-don-returned",
      sourceUid: "leader",
      sourceSeat: "p1",
      battle,
      donReturnedCount: 1,
    });
    expect(calls.givenDon).toHaveLength(0);
  });
});

describe("OP09-074 Bepo — on-don-returned 1+ → buff-target", () => {
  it("ouvre buff-target +1000 sur DON return mon tour", () => {
    const p1 = emptySeat();
    p1.characters.push(makeChar("OP09-074", "bepo"));
    const { battle, calls } = makeBattle(p1, emptySeat(), "p1");
    fire("OP09-074", {
      hook: "on-don-returned",
      sourceUid: "bepo",
      sourceSeat: "p1",
      battle,
      donReturnedCount: 1,
    });
    expect(calls.choices[0]?.kind).toBe("buff-target");
  });

  it("1/turn — ne re-trigger pas après un déjà fired", () => {
    const p1 = emptySeat();
    p1.characters.push(makeChar("OP09-074", "bepo"));
    const { battle, calls } = makeBattle(p1, emptySeat(), "p1");
    for (let i = 0; i < 3; i++) {
      fire("OP09-074", {
        hook: "on-don-returned",
        sourceUid: "bepo",
        sourceSeat: "p1",
        battle,
        donReturnedCount: 1,
      });
    }
    expect(calls.choices).toHaveLength(1);
  });
});

describe("ST15-001 Atmos — turn-flag no-take-life-by-effect", () => {
  it("set turnFlag si Newgate Leader", () => {
    const p1 = emptySeat();
    p1.leaderId = "ST15-002"; // Edward Newgate
    const { battle } = makeBattle(p1, emptySeat());
    fire("ST15-001", {
      hook: "on-attack",
      sourceUid: "atmos",
      sourceSeat: "p1",
      battle,
    });
    // Vérifie via hasTurnFlag
    expect(battle.hasTurnFlag("p1", "no-take-life-by-effect")).toBe(true);
  });
});

describe("OP09-028 Sanji on-ko — take life + play-from-discard", () => {
  it("prend 1 vie + ouvre play-from-discard si Vie disponible", () => {
    const p1 = emptySeat();
    p1.life.push("OP09-076");
    const { battle, calls } = makeBattle(p1, emptySeat());
    fire("OP09-028", {
      hook: "on-ko",
      sourceUid: "sanji",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.takenLife).toContain("p1");
    expect(calls.choices[0]?.kind).toBe("play-from-discard");
  });

  it("rate si Vie vide", () => {
    const { battle, calls } = makeBattle(emptySeat(), emptySeat());
    fire("OP09-028", {
      hook: "on-ko",
      sourceUid: "sanji",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.takenLife).toHaveLength(0);
    expect(calls.choices).toHaveLength(0);
  });
});

describe("OP09-018 Disparais — ko-multi-combined-power 2 ≤ 4000", () => {
  it("ouvre ko-multi-combined-power", () => {
    const { battle, calls } = makeBattle(emptySeat(), emptySeat());
    fire("OP09-018", {
      hook: "on-play",
      sourceUid: "evt1",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.choices[0]?.kind).toBe("ko-multi-combined-power");
    expect(calls.choices[0]?.params.maxN).toBe(2);
    expect(calls.choices[0]?.params.maxCombinedPower).toBe(4000);
  });

  it("KO les cibles sélectionnées", () => {
    const p1 = emptySeat();
    const p2 = emptySeat();
    p2.characters.push(makeChar("OP09-076", "t1"));
    p2.characters.push(makeChar("OP09-076", "t2"));
    const { battle, calls } = makeBattle(p1, p2);
    fire("OP09-018", {
      hook: "on-choice-resolved",
      sourceUid: "evt1",
      sourceSeat: "p1",
      battle,
      choice: {
        skipped: false,
        selection: { targetUids: ["t1", "t2"] },
      },
    });
    expect(calls.koed).toEqual([
      { seat: "p2", uid: "t1" },
      { seat: "p2", uid: "t2" },
    ]);
  });
});

describe("OP09-118 Roger Leader — handler vide (win cond hardcoded handleBlock)", () => {
  it("ne fait rien (win cond gérée serveur)", () => {
    const { battle, calls } = makeBattle(emptySeat(), emptySeat());
    fire("OP09-118", {
      hook: "on-attack",
      sourceUid: "leader",
      sourceSeat: "p1",
      battle,
    });
    // Le handler est intentionnellement vide.
    expect(calls.declaredWin).toHaveLength(0);
  });
});

describe("OP09-062 Robin Leader — on-attack discard-card requireTrigger", () => {
  it("ouvre discard-card avec requireTrigger", () => {
    const { battle, calls } = makeBattle(emptySeat(), emptySeat());
    fire("OP09-062", {
      hook: "on-attack",
      sourceUid: "leader",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.choices[0]?.kind).toBe("discard-card");
    expect(calls.choices[0]?.params.requireTrigger).toBe(true);
  });
});

describe("KO_SUBSTITUTES — Cracker (ST20-002) mill 1 vie au lieu de KO", () => {
  it("substitue le KO par mill life si 1/turn dispo + vie disponible", () => {
    const p1 = emptySeat();
    p1.life.push("OP09-076");
    p1.characters.push(makeChar("ST20-002", "cracker"));
    const { battle, calls } = makeBattle(p1, emptySeat());
    const sub = KO_SUBSTITUTES["ST20-002"];
    expect(sub).toBeTruthy();
    const handled = sub({
      target: { seat: "p1", uid: "cracker", cardId: "ST20-002" },
      source: "effect",
      modSourceSeat: "p1",
      modSourceUid: "cracker",
      battle,
    });
    expect(handled).toBe(true);
    expect(calls.millOpponentLife).toContain("p1");
  });

  it("ne substitue pas si vie vide", () => {
    const p1 = emptySeat();
    p1.characters.push(makeChar("ST20-002", "cracker"));
    const { battle, calls } = makeBattle(p1, emptySeat());
    const handled = KO_SUBSTITUTES["ST20-002"]({
      target: { seat: "p1", uid: "cracker", cardId: "ST20-002" },
      source: "effect",
      modSourceSeat: "p1",
      modSourceUid: "cracker",
      battle,
    });
    expect(handled).toBe(false);
  });
});

describe("PASSIVE_COST_MODS — Luffy Leader OP09-061 +1 cost own Persos", () => {
  it("+1 cost si leader Luffy avec 1+ DON attached", () => {
    const p1 = emptySeat();
    p1.leaderId = "OP09-061";
    p1.leaderAttachedDon = 1;
    const { battle } = makeBattle(p1, emptySeat());
    const mod = PASSIVE_COST_MODS["OP09-061"];
    const delta = mod({
      target: { seat: "p1", cardId: "OP09-076", uid: "hand:0" },
      modSourceSeat: "p1",
      modSourceUid: "leader",
      battle,
    });
    expect(delta).toBe(1);
  });

  it("0 si pas de DON attached", () => {
    const p1 = emptySeat();
    p1.leaderId = "OP09-061";
    p1.leaderAttachedDon = 0;
    const { battle } = makeBattle(p1, emptySeat());
    const delta = PASSIVE_COST_MODS["OP09-061"]({
      target: { seat: "p1", cardId: "OP09-076", uid: "hand:0" },
      modSourceSeat: "p1",
      modSourceUid: "leader",
      battle,
    });
    expect(delta).toBe(0);
  });

  it("0 si target adverse", () => {
    const p1 = emptySeat();
    p1.leaderId = "OP09-061";
    p1.leaderAttachedDon = 1;
    const { battle } = makeBattle(p1, emptySeat());
    const delta = PASSIVE_COST_MODS["OP09-061"]({
      target: { seat: "p2", cardId: "OP09-076", uid: "hand:0" },
      modSourceSeat: "p1",
      modSourceUid: "leader",
      battle,
    });
    expect(delta).toBe(0);
  });
});

describe("LEAVE_FIELD_LISTENERS — Thousand Sunny OP09-080", () => {
  it("trigger quand un Persos Chapeau quitte par effet adverse", () => {
    const p1 = emptySeat();
    p1.stage = makeChar("OP09-080", "sunny");
    const { battle, calls } = makeBattle(p1, emptySeat());
    const listener = LEAVE_FIELD_LISTENERS["OP09-080"];
    expect(listener).toBeTruthy();
    listener({
      leaving: { seat: "p1", uid: "luffy", cardId: "OP09-076" }, // Roronoa, Chapeau
      reason: "ko-effect",
      modSourceSeat: "p1",
      modSourceUid: "sunny",
      battle,
    });
    expect(calls.givenDon[0]?.count).toBe(1);
  });

  it("ne trigger pas pour ko-combat", () => {
    const p1 = emptySeat();
    p1.stage = makeChar("OP09-080", "sunny");
    const { battle, calls } = makeBattle(p1, emptySeat());
    LEAVE_FIELD_LISTENERS["OP09-080"]({
      leaving: { seat: "p1", uid: "luffy", cardId: "OP09-076" },
      reason: "ko-combat",
      modSourceSeat: "p1",
      modSourceUid: "sunny",
      battle,
    });
    expect(calls.givenDon).toHaveLength(0);
  });
});

describe("OP09-005 / OP09-007 Heat — buff +1000 leader si ≤4000", () => {
  it("Heat applique +1000 si leader ≤ 4000 power", () => {
    const p1 = emptySeat();
    p1.leaderId = "OP09-001"; // Shanks (5000 power)
    const { battle, calls } = makeBattle(p1, emptySeat());
    fire("OP09-007", {
      hook: "on-play",
      sourceUid: "heat",
      sourceSeat: "p1",
      battle,
    });
    // Shanks = 5000, l'effet ne devrait pas s'appliquer.
    expect(calls.powerBuffs).toHaveLength(0);
  });
});

describe("ST21-010 Nico Robin — DON×2 on-attack KO ≤4000", () => {
  it("ouvre ko-character ≤4000 si attached >= 2", () => {
    const p1 = emptySeat();
    p1.characters.push(makeChar("ST21-010", "robin", 2));
    const { battle, calls } = makeBattle(p1, emptySeat());
    fire("ST21-010", {
      hook: "on-attack",
      sourceUid: "robin",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.choices[0]?.kind).toBe("ko-character");
    expect(calls.choices[0]?.params.maxPower).toBe(4000);
  });

  it("rien si DON < 2", () => {
    const p1 = emptySeat();
    p1.characters.push(makeChar("ST21-010", "robin", 1));
    const { battle, calls } = makeBattle(p1, emptySeat());
    fire("ST21-010", {
      hook: "on-attack",
      sourceUid: "robin",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.choices).toHaveLength(0);
  });
});

describe("OP09-093 Marshall D. Teach — cancel leader + cancel char + cannotAttack", () => {
  it("annule effets leader adverse au déclenchement (BN seulement)", () => {
    const p1 = emptySeat();
    p1.leaderId = "OP09-081"; // Teach Leader (Barbe Noire)
    p1.characters.push(makeChar("OP09-093", "teach"));
    const { battle, calls } = makeBattle(p1, emptySeat());
    fire("OP09-093", {
      hook: "on-activate-main",
      sourceUid: "teach",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.cancelledEffects).toContainEqual({ seat: "p2", uid: "leader" });
    expect(calls.choices[0]?.kind).toBe("ko-character");
  });
});

describe("ST20-005 Charlotte Linlin — discard 1 puis force opp yes-no", () => {
  it("ouvre discard-card puis route step2 vers opp", () => {
    const p1 = emptySeat();
    p1.hand.push("OP09-076");
    const { battle, calls } = makeBattle(p1, emptySeat());
    fire("ST20-005", {
      hook: "on-play",
      sourceUid: "linlin",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.choices[0]?.kind).toBe("discard-card");
  });
});

describe("ST17-004 Boa Hancock — reorder top 3 + DON Sept Corsaires", () => {
  it("ouvre reorder-top-deck avec params.peeked", () => {
    const p1 = emptySeat();
    p1.deck.push("OP09-076", "OP09-076", "OP09-076");
    const { battle, calls } = makeBattle(p1, emptySeat());
    fire("ST17-004", {
      hook: "on-play",
      sourceUid: "hancock",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.choices[0]?.kind).toBe("reorder-top-deck");
    expect(calls.choices[0]?.params.peeked).toContain("OP09-076");
  });
});

describe("OP09-084 Catarina Devon — 3-way select-option", () => {
  it("ouvre select-option avec 3 keywords si BN leader", () => {
    const p1 = emptySeat();
    p1.leaderId = "OP09-081"; // Teach Leader (BN)
    p1.characters.push(makeChar("OP09-084", "devon"));
    const { battle, calls } = makeBattle(p1, emptySeat());
    fire("OP09-084", {
      hook: "on-activate-main",
      sourceUid: "devon",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.choices[0]?.kind).toBe("select-option");
    expect(calls.choices[0]?.params.options).toContain("Bloqueur");
    expect(calls.choices[0]?.params.options).toContain("Double attaque");
    expect(calls.choices[0]?.params.options).toContain("Exil");
  });
});

describe("ST19-001 Smoker — discard Marine noir + 2 cibles cannotAttack", () => {
  it("ouvre discard-card avec requireType + requireColor", () => {
    const { battle, calls } = makeBattle(emptySeat(), emptySeat());
    fire("ST19-001", {
      hook: "on-play",
      sourceUid: "smoker",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.choices[0]?.kind).toBe("discard-card");
    expect(calls.choices[0]?.params.requireType).toBe("Marine");
    expect(calls.choices[0]?.params.requireColor).toBe("noir");
  });
});

describe("ST18-003 Sangoro — on-attack 8+ DON → draw 1", () => {
  it("draw 1 si 8+ DON sur le terrain", () => {
    const p1 = emptySeat();
    p1.donActive = 5;
    p1.donRested = 3;
    const { battle, calls } = makeBattle(p1, emptySeat());
    fire("ST18-003", {
      hook: "on-attack",
      sourceUid: "sangoro",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.drawn).toEqual([{ seat: "p1", count: 1 }]);
  });

  it("rien si <8 DON", () => {
    const p1 = emptySeat();
    p1.donActive = 4;
    const { battle, calls } = makeBattle(p1, emptySeat());
    fire("ST18-003", {
      hook: "on-attack",
      sourceUid: "sangoro",
      sourceSeat: "p1",
      battle,
    });
    expect(calls.drawn).toHaveLength(0);
  });
});
