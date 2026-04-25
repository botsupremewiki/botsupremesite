import type * as Party from "partykit/server";
import type {
  Card,
  ChatMessage,
  Player,
  PokerClientMessage,
  PokerPhase,
  PokerPot,
  PokerSeat,
  PokerServerMessage,
  PokerState,
  PokerTableConfig,
  PokerTableId,
} from "../../shared/types";
import { PLAZA_CONFIG, POKER_TABLES } from "../../shared/types";
import { fetchProfile, patchProfileGold } from "./lib/supabase";
import { PersistentChatHistory } from "./lib/chat-storage";
import { bestOf7, makeShuffledDeck } from "./lib/poker-eval";

const AVATAR_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TimerId = ReturnType<typeof setTimeout>;

type ConnInfo = {
  authId: string | null;
  name: string;
  color: string;
  gold: number;
  isAdmin: boolean;
  // Index of the seat this conn is sitting in, or null.
  seatIndex: number | null;
};

export default class PokerServer implements Party.Server {
  private chat: PersistentChatHistory;
  private connInfo = new Map<string, ConnInfo>();
  private colorCursor = 0;

  // Game state
  private table: PokerTableConfig;
  private seats: PokerSeat[];
  private deck: Card[] = [];
  private community: Card[] = [];
  private phase: PokerPhase = "waiting";
  private dealerSeatIndex: number | null = null;
  private activeSeatIndex: number | null = null;
  private highBet = 0;
  private minRaise = 0;
  private pots: PokerPot[] = [];
  private phaseEndsAt: number | null = null;
  private phaseTimer: TimerId | null = null;
  private lastActionLabel: string | null = null;

  constructor(readonly room: Party.Room) {
    this.chat = new PersistentChatHistory(room, PLAZA_CONFIG.chatHistorySize);
    const id = (room.id as PokerTableId) || "low";
    this.table = POKER_TABLES[id] ?? POKER_TABLES.low;
    this.seats = makeEmptySeats(this.table.seatCount);
  }

  // ──────────────────────────────── connection ─────────────────────────────────

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const authId = sanitizeAuthId(url.searchParams.get("authId"));
    const providedName = sanitizeName(url.searchParams.get("name"));
    const goldParam = url.searchParams.get("gold");
    const parsedGold = goldParam ? parseInt(goldParam, 10) : NaN;
    const queryGold = Number.isFinite(parsedGold)
      ? Math.max(0, Math.min(10_000_000, parsedGold))
      : null;

    let gold: number;
    let isAdmin = false;
    if (authId) {
      const profile = await fetchProfile(this.room, authId);
      if (profile && Number.isFinite(profile.gold)) {
        gold = profile.gold;
        isAdmin = !!profile.is_admin;
      } else if (queryGold !== null) {
        gold = queryGold;
      } else {
        gold = 0;
      }
    } else {
      gold = queryGold ?? 0;
    }

    this.connInfo.set(conn.id, {
      authId,
      name: providedName ?? `Invité-${conn.id.slice(0, 4)}`,
      color: AVATAR_COLORS[this.colorCursor++ % AVATAR_COLORS.length],
      gold,
      isAdmin,
      seatIndex: null,
    });

    const chat = await this.chat.list();
    this.sendTo(conn, {
      type: "poker-welcome",
      selfId: conn.id,
      table: this.table,
      state: this.snapshotFor(conn.id),
      gold,
      chat,
    });
  }

  async onMessage(raw: string, sender: Party.Connection) {
    const info = this.connInfo.get(sender.id);
    if (!info) return;
    let data: PokerClientMessage;
    try {
      data = JSON.parse(raw) as PokerClientMessage;
    } catch {
      return;
    }
    switch (data.type) {
      case "chat": {
        const text = sanitizeChat(data.text);
        if (!text) return;
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          playerId: sender.id,
          playerName: info.name,
          text,
          timestamp: Date.now(),
          isAdmin: info.isAdmin || undefined,
        };
        await this.chat.add(message);
        this.broadcastChat(message);
        break;
      }
      case "poker-sit":
        await this.handleSit(sender, info, data.seatIndex, data.buyin);
        break;
      case "poker-leave":
        await this.handleLeave(sender, info);
        break;
      case "poker-action":
        this.handleAction(sender, info, data.action);
        break;
      case "poker-bet":
        this.handleBetOrRaise(sender, info, data.amount);
        break;
    }
  }

  onClose(conn: Party.Connection) {
    const info = this.connInfo.get(conn.id);
    if (!info) return;
    if (info.seatIndex !== null) {
      // Force-fold their hand (if any) and free the seat at the next
      // hand boundary. Cash out their remaining chips back to gold.
      void this.handleLeave(conn, info);
    }
    this.connInfo.delete(conn.id);
  }

  // ──────────────────────────────── seating ────────────────────────────────────

  private async handleSit(
    conn: Party.Connection,
    info: ConnInfo,
    seatIndex: number,
    buyin: number,
  ) {
    if (info.seatIndex !== null) {
      this.sendError(conn, "Tu es déjà à table.");
      return;
    }
    if (
      !Number.isInteger(seatIndex) ||
      seatIndex < 0 ||
      seatIndex >= this.seats.length
    ) {
      this.sendError(conn, "Place invalide.");
      return;
    }
    const seat = this.seats[seatIndex];
    if (seat.playerId) {
      this.sendError(conn, "Place déjà prise.");
      return;
    }
    const amount = Math.floor(Number(buyin));
    if (
      !Number.isFinite(amount) ||
      amount < this.table.buyinMin ||
      amount > this.table.buyinMax
    ) {
      this.sendError(
        conn,
        `Buy-in entre ${this.table.buyinMin} et ${this.table.buyinMax} OS.`,
      );
      return;
    }
    if (info.gold < amount) {
      this.sendError(conn, "Or Suprême insuffisant.");
      return;
    }

    info.gold -= amount;
    info.seatIndex = seatIndex;
    seat.playerId = conn.id;
    seat.playerName = info.name;
    seat.playerColor = info.color;
    seat.chips = amount;
    seat.status = "sitting";
    seat.holeCards = [];
    seat.currentBet = 0;
    seat.totalCommitted = 0;
    seat.hasActed = false;

    if (info.authId) await patchProfileGold(this.room, info.authId, info.gold);
    this.sendTo(conn, { type: "gold-update", gold: info.gold });
    this.broadcastState();

    // Start a hand if we now have ≥ 2 sitting players and we're idle.
    if (this.phase === "waiting") this.tryStartHand();
  }

  private async handleLeave(conn: Party.Connection, info: ConnInfo) {
    const seatIndex = info.seatIndex;
    if (seatIndex === null) return;
    const seat = this.seats[seatIndex];

    // If the player is in an active hand, fold them. They can't reclaim
    // chips committed to the current pot — they'll get the rest back.
    if (seat.status === "playing" || seat.status === "all-in") {
      seat.status = "folded";
      this.lastActionLabel = `${seat.playerName} se couche (départ)`;
      // If it was their turn, advance.
      if (this.activeSeatIndex === seatIndex) {
        this.advanceToNextActor();
      } else {
        this.broadcastState();
      }
    }

    // Refund their chip stack to gold.
    info.gold += Math.max(0, seat.chips);
    seat.chips = 0;
    seat.playerId = null;
    seat.playerName = null;
    seat.playerColor = null;
    seat.holeCards = [];
    seat.status = "empty";
    seat.currentBet = 0;
    seat.totalCommitted = 0;
    seat.hasActed = false;
    seat.showdownHand = undefined;
    info.seatIndex = null;

    if (info.authId) await patchProfileGold(this.room, info.authId, info.gold);
    this.sendTo(conn, { type: "gold-update", gold: info.gold });
    this.broadcastState();

    // If we dropped below 2 active seats, end the hand early or wait.
    this.maybeEndHandOnFolds();
  }

  // ──────────────────────────────── hand lifecycle ─────────────────────────────

  private tryStartHand() {
    if (this.phase !== "waiting" && this.phase !== "settling") return;
    const seated = this.seats.filter(
      (s) => s.playerId && s.chips > 0,
    );
    if (seated.length < 2) {
      this.phase = "waiting";
      this.broadcastState();
      return;
    }

    // Reset per-hand state.
    this.deck = makeShuffledDeck();
    this.community = [];
    this.pots = [];
    this.lastActionLabel = null;
    this.highBet = 0;
    this.minRaise = this.table.bigBlind;
    for (const seat of this.seats) {
      seat.holeCards = [];
      seat.currentBet = 0;
      seat.totalCommitted = 0;
      seat.hasActed = false;
      seat.showdownHand = undefined;
      if (seat.playerId && seat.chips > 0) {
        seat.status = "playing";
      } else if (seat.playerId) {
        seat.status = "sitout";
      } else {
        seat.status = "empty";
      }
    }

    // Move the dealer button forward to the next eligible seat.
    this.dealerSeatIndex = this.nextSeatFrom(
      this.dealerSeatIndex,
      (s) => s.status === "playing",
    );
    if (this.dealerSeatIndex === null) {
      this.phase = "waiting";
      this.broadcastState();
      return;
    }

    // Post blinds.
    const sbIndex = this.nextSeatFrom(
      this.dealerSeatIndex,
      (s) => s.status === "playing",
      true,
    );
    const bbIndex = sbIndex !== null
      ? this.nextSeatFrom(sbIndex, (s) => s.status === "playing", true)
      : null;
    if (sbIndex === null || bbIndex === null) {
      this.phase = "waiting";
      this.broadcastState();
      return;
    }
    // Heads-up special: dealer posts the small blind.
    let smallBlindSeat = sbIndex;
    let bigBlindSeat = bbIndex;
    const playingCount = this.seats.filter((s) => s.status === "playing")
      .length;
    if (playingCount === 2) {
      smallBlindSeat = this.dealerSeatIndex;
      bigBlindSeat = sbIndex;
    }

    this.placeBlind(smallBlindSeat, this.table.smallBlind);
    this.placeBlind(bigBlindSeat, this.table.bigBlind);
    this.highBet = this.table.bigBlind;
    this.minRaise = this.table.bigBlind;

    // Deal 2 hole cards each, twice around (proper poker dealing).
    for (let pass = 0; pass < 2; pass++) {
      let idx = this.nextSeatFrom(
        this.dealerSeatIndex,
        (s) => s.status === "playing",
        true,
      );
      const seen = new Set<number>();
      while (idx !== null && !seen.has(idx)) {
        seen.add(idx);
        this.seats[idx].holeCards.push(this.draw());
        idx = this.nextSeatFrom(
          idx,
          (s) => s.status === "playing",
          true,
        );
      }
    }

    // Action starts left of the big blind preflop.
    const firstActor = this.nextSeatFrom(
      bigBlindSeat,
      (s) => s.status === "playing",
      true,
    );
    this.phase = "preflop";
    this.activeSeatIndex = firstActor;
    if (firstActor !== null) {
      this.armTurnTimer();
    }
    this.broadcastState();
  }

  private placeBlind(seatIndex: number, amount: number) {
    const seat = this.seats[seatIndex];
    const actual = Math.min(amount, seat.chips);
    seat.chips -= actual;
    seat.currentBet = actual;
    seat.totalCommitted = actual;
    if (seat.chips === 0) {
      seat.status = "all-in";
    }
  }

  private draw(): Card {
    if (this.deck.length === 0) this.deck = makeShuffledDeck();
    return this.deck.pop()!;
  }

  // ──────────────────────────────── betting actions ────────────────────────────

  private handleAction(
    conn: Party.Connection,
    info: ConnInfo,
    action: "fold" | "check" | "call" | "all-in",
  ) {
    if (info.seatIndex === null) return;
    if (info.seatIndex !== this.activeSeatIndex) return;
    const seat = this.seats[info.seatIndex];
    if (seat.status !== "playing") return;

    if (action === "fold") {
      seat.status = "folded";
      seat.hasActed = true;
      this.lastActionLabel = `${seat.playerName} se couche`;
      this.advanceToNextActor();
      return;
    }

    if (action === "check") {
      if (seat.currentBet < this.highBet) {
        this.sendError(conn, "Tu ne peux pas check : il y a une mise.");
        return;
      }
      seat.hasActed = true;
      this.lastActionLabel = `${seat.playerName} check`;
      this.advanceToNextActor();
      return;
    }

    if (action === "call") {
      const toCall = this.highBet - seat.currentBet;
      if (toCall <= 0) {
        // Same as check.
        seat.hasActed = true;
        this.lastActionLabel = `${seat.playerName} check`;
        this.advanceToNextActor();
        return;
      }
      const actual = Math.min(toCall, seat.chips);
      seat.chips -= actual;
      seat.currentBet += actual;
      seat.totalCommitted += actual;
      seat.hasActed = true;
      if (seat.chips === 0) seat.status = "all-in";
      this.lastActionLabel =
        actual < toCall
          ? `${seat.playerName} all-in (${actual})`
          : `${seat.playerName} suit ${actual}`;
      this.advanceToNextActor();
      return;
    }

    if (action === "all-in") {
      const allIn = seat.chips;
      if (allIn <= 0) return;
      const newBet = seat.currentBet + allIn;
      seat.chips = 0;
      seat.currentBet = newBet;
      seat.totalCommitted += allIn;
      seat.status = "all-in";
      seat.hasActed = true;
      if (newBet > this.highBet) {
        const raiseAmount = newBet - this.highBet;
        if (raiseAmount >= this.minRaise) {
          // Full raise: re-opens action.
          this.minRaise = raiseAmount;
          for (const s of this.seats) {
            if (s.status === "playing" && s.seatIndex !== seat.seatIndex)
              s.hasActed = false;
          }
        }
        this.highBet = newBet;
      }
      this.lastActionLabel = `${seat.playerName} all-in (${allIn})`;
      this.advanceToNextActor();
      return;
    }
  }

  private handleBetOrRaise(
    conn: Party.Connection,
    info: ConnInfo,
    rawAmount: number,
  ) {
    if (info.seatIndex === null) return;
    if (info.seatIndex !== this.activeSeatIndex) return;
    const seat = this.seats[info.seatIndex];
    if (seat.status !== "playing") return;
    const target = Math.floor(Number(rawAmount));
    if (!Number.isFinite(target)) return;
    // `target` is the total amount the seat will have committed in the
    // current round after this action.
    if (target <= seat.currentBet) {
      this.sendError(conn, "Mise inférieure à ta mise actuelle.");
      return;
    }
    const additional = target - seat.currentBet;
    if (additional > seat.chips) {
      this.sendError(conn, "Pas assez de jetons.");
      return;
    }
    if (this.highBet === 0) {
      // Opening bet — must be at least the big blind.
      if (target < this.table.bigBlind && additional < seat.chips) {
        this.sendError(conn, `Mise minimale ${this.table.bigBlind}.`);
        return;
      }
    } else {
      // Raise: need at least minRaise on top of highBet (unless all-in).
      const raiseAmount = target - this.highBet;
      if (raiseAmount < this.minRaise && additional < seat.chips) {
        this.sendError(conn, `Relance minimale ${this.minRaise}.`);
        return;
      }
      this.minRaise = Math.max(this.minRaise, raiseAmount);
    }
    seat.chips -= additional;
    seat.currentBet = target;
    seat.totalCommitted += additional;
    seat.hasActed = true;
    if (seat.chips === 0) seat.status = "all-in";
    if (target > this.highBet) {
      this.highBet = target;
      // Reopen action for everyone else still playing.
      for (const s of this.seats) {
        if (s.status === "playing" && s.seatIndex !== seat.seatIndex)
          s.hasActed = false;
      }
    }
    this.lastActionLabel =
      this.highBet === target && this.community.length === 0
        ? `${seat.playerName} mise ${target}`
        : `${seat.playerName} relance à ${target}`;
    this.advanceToNextActor();
  }

  // ──────────────────────────────── round advancement ──────────────────────────

  private advanceToNextActor() {
    this.clearPhaseTimer();
    if (this.maybeEndHandOnFolds()) return;
    if (this.bettingRoundComplete()) {
      this.endBettingRound();
      return;
    }
    const next = this.nextSeatFrom(
      this.activeSeatIndex,
      (s) => s.status === "playing" && !s.hasActed,
      true,
    );
    if (next === null) {
      this.endBettingRound();
      return;
    }
    this.activeSeatIndex = next;
    this.armTurnTimer();
    this.broadcastState();
  }

  private bettingRoundComplete(): boolean {
    const playing = this.seats.filter((s) => s.status === "playing");
    if (playing.length === 0) return true;
    return playing.every(
      (s) => s.hasActed && s.currentBet === this.highBet,
    );
  }

  /** Returns true if the hand has ended because everyone except one
   *  player folded or is all-in such that no more action is possible. */
  private maybeEndHandOnFolds(): boolean {
    const stillIn = this.seats.filter(
      (s) => s.status === "playing" || s.status === "all-in",
    );
    if (stillIn.length <= 1) {
      this.runOutBoard();
      this.goToShowdown();
      return true;
    }
    const stillActing = this.seats.filter((s) => s.status === "playing");
    if (stillActing.length === 0) {
      // Everyone is all-in; just deal out remaining streets and go to
      // showdown.
      this.runOutBoard();
      this.goToShowdown();
      return true;
    }
    return false;
  }

  private endBettingRound() {
    // Sweep currentBet into pots.
    this.collectPots();
    for (const s of this.seats) {
      s.currentBet = 0;
      s.hasActed = false;
    }
    this.highBet = 0;
    this.minRaise = this.table.bigBlind;

    // Move to next street, or showdown.
    if (this.phase === "preflop") {
      this.dealCommunity(3);
      this.phase = "flop";
    } else if (this.phase === "flop") {
      this.dealCommunity(1);
      this.phase = "turn";
    } else if (this.phase === "turn") {
      this.dealCommunity(1);
      this.phase = "river";
    } else if (this.phase === "river") {
      this.goToShowdown();
      return;
    }

    // Action begins with first remaining player to the left of the dealer.
    const firstActor = this.nextSeatFrom(
      this.dealerSeatIndex,
      (s) => s.status === "playing",
      true,
    );
    this.activeSeatIndex = firstActor;
    if (firstActor === null) {
      // No one left to act → run out and showdown.
      this.runOutBoard();
      this.goToShowdown();
      return;
    }
    this.armTurnTimer();
    this.broadcastState();
  }

  private dealCommunity(n: number) {
    // Burn one before each street (standard).
    this.draw();
    for (let i = 0; i < n; i++) this.community.push(this.draw());
  }

  private runOutBoard() {
    while (this.community.length < 5) {
      this.draw(); // burn
      this.community.push(this.draw());
    }
  }

  // ──────────────────────────────── pots & showdown ────────────────────────────

  private collectPots() {
    // Build pots from totalCommitted across seats. We use the standard
    // "side pot" algorithm: sort seats by totalCommitted ascending, then
    // peel off layers.
    type Layer = {
      threshold: number;
      contributors: number[]; // seat indices with totalCommitted >= threshold
    };
    const seatsContrib = this.seats
      .map((s) => ({ idx: s.seatIndex, committed: s.totalCommitted }))
      .filter((s) => s.committed > 0);

    if (seatsContrib.length === 0) return;

    // Determine unique thresholds.
    const thresholds = Array.from(
      new Set(seatsContrib.map((s) => s.committed)),
    ).sort((a, b) => a - b);

    let prev = 0;
    const layers: Layer[] = [];
    for (const t of thresholds) {
      const slice = t - prev;
      const contributors = this.seats
        .filter((s) => s.totalCommitted >= t)
        .map((s) => s.seatIndex);
      const amount = slice * contributors.length;
      if (amount > 0) {
        const eligibleSeats = this.seats
          .filter((s) => s.totalCommitted >= t && s.status !== "folded")
          .map((s) => s.seatIndex);
        // Merge into the last pot if it has the same eligibility set.
        const last = this.pots[this.pots.length - 1];
        if (
          last &&
          arraysEqual(last.eligibleSeats.slice().sort(), eligibleSeats.slice().sort())
        ) {
          last.amount += amount;
        } else {
          this.pots.push({ amount, eligibleSeats });
        }
        layers.push({ threshold: t, contributors });
      }
      prev = t;
    }
  }

  private goToShowdown() {
    this.collectPots();
    this.phase = "showdown";
    this.activeSeatIndex = null;

    const contenders = this.seats.filter(
      (s) =>
        (s.status !== "folded" && s.status !== "empty" && s.playerId) ||
        false,
    );

    // Compute showdown hands for everyone still in.
    for (const seat of contenders) {
      if (seat.holeCards.length === 2 && this.community.length === 5) {
        seat.showdownHand = bestOf7([...seat.holeCards, ...this.community]);
      } else if (seat.holeCards.length === 2) {
        seat.showdownHand = bestOf7([...seat.holeCards, ...this.community]);
      }
    }

    // Award each pot to the contender(s) with the best hand among the
    // pot's eligible seats.
    const labels: string[] = [];
    for (const pot of this.pots) {
      const eligible = pot.eligibleSeats
        .map((i) => this.seats[i])
        .filter((s) => s && s.status !== "folded" && s.showdownHand);
      if (eligible.length === 0) {
        // Fall back: nobody eligible (shouldn't happen) — split among
        // anyone in the eligibleSeats list.
        const anyone = pot.eligibleSeats.map((i) => this.seats[i]);
        const each = Math.floor(pot.amount / Math.max(1, anyone.length));
        for (const s of anyone) s.chips += each;
        continue;
      }
      const bestScore = Math.max(
        ...eligible.map((s) => s.showdownHand!.score),
      );
      const winners = eligible.filter(
        (s) => s.showdownHand!.score === bestScore,
      );
      const share = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - share * winners.length;
      winners.forEach((w, i) => {
        w.chips += share + (i < remainder ? 1 : 0);
      });
      const names = winners.map((w) => w.playerName).join(" + ");
      const tier = winners[0].showdownHand!.rankName;
      labels.push(`${names} gagne ${pot.amount} (${tier})`);
    }
    this.lastActionLabel = labels.join(" · ");

    // Persist any chip changes back to gold balance is NOT done here —
    // gold only moves on sit/leave. Showdown affects the table chip
    // stack, which gets cashed out on leave.

    this.broadcastState();

    // Move to "settling" briefly, then start next hand if possible.
    this.setPhaseTimeout(this.table.showdownDurationMs, () => {
      this.phase = "settling";
      this.broadcastState();
      this.setPhaseTimeout(this.table.preBettingDurationMs, () =>
        this.tryStartHand(),
      );
    });
  }

  // ──────────────────────────────── helpers ────────────────────────────────────

  private nextSeatFrom(
    fromIndex: number | null,
    pred: (s: PokerSeat) => boolean,
    skipSelf = true,
  ): number | null {
    const start = fromIndex === null ? -1 : fromIndex;
    for (let off = skipSelf ? 1 : 0; off <= this.seats.length; off++) {
      const idx = (start + off + this.seats.length) % this.seats.length;
      if (off === 0 && skipSelf) continue;
      if (pred(this.seats[idx])) return idx;
    }
    return null;
  }

  private armTurnTimer() {
    this.setPhaseTimeout(this.table.turnDurationMs, () =>
      this.autoFoldOrCheck(),
    );
  }

  private autoFoldOrCheck() {
    if (this.activeSeatIndex === null) return;
    const seat = this.seats[this.activeSeatIndex];
    if (!seat || seat.status !== "playing") return;
    if (seat.currentBet === this.highBet) {
      seat.hasActed = true;
      this.lastActionLabel = `${seat.playerName} check (auto)`;
    } else {
      seat.status = "folded";
      seat.hasActed = true;
      this.lastActionLabel = `${seat.playerName} se couche (auto)`;
    }
    this.advanceToNextActor();
  }

  private setPhaseTimeout(ms: number, cb: () => void) {
    this.clearPhaseTimer();
    this.phaseEndsAt = Date.now() + ms;
    this.phaseTimer = setTimeout(() => {
      this.phaseEndsAt = null;
      cb();
    }, ms);
  }

  private clearPhaseTimer() {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
    this.phaseEndsAt = null;
  }

  private snapshotFor(connId: string): PokerState {
    const selfSeat = this.seats.find((s) => s.playerId === connId);
    const showdownVisible =
      this.phase === "showdown" || this.phase === "settling";
    const seats: PokerSeat[] = this.seats.map((s) => {
      const isSelf = !!selfSeat && s.seatIndex === selfSeat.seatIndex;
      const visibleHole =
        isSelf || showdownVisible ? s.holeCards : s.holeCards.length > 0 ? [] : [];
      return {
        ...s,
        // Hide hole cards from other players unless we're at showdown.
        // We still emit length info via [] vs [] (no, length is 0 for
        // both) — clients infer "has hole cards" from status==="playing".
        holeCards: visibleHole,
        showdownHand: showdownVisible ? s.showdownHand : undefined,
      };
    });
    return {
      tableId: this.table.id,
      phase: this.phase,
      seats,
      community: [...this.community],
      dealerSeatIndex: this.dealerSeatIndex,
      activeSeatIndex: this.activeSeatIndex,
      highBet: this.highBet,
      minRaise: this.minRaise,
      pots: this.pots.map((p) => ({ ...p, eligibleSeats: [...p.eligibleSeats] })),
      phaseEndsAt: this.phaseEndsAt,
      lastActionLabel: this.lastActionLabel,
    };
  }

  private broadcastState() {
    for (const conn of this.room.getConnections()) {
      this.sendTo(conn, {
        type: "poker-state",
        state: this.snapshotFor(conn.id),
      });
    }
  }

  private broadcastChat(message: ChatMessage) {
    this.broadcast({ type: "chat", message });
  }

  private sendError(conn: Party.Connection, message: string) {
    this.sendTo(conn, { type: "poker-error", message });
  }

  private sendTo(conn: Party.Connection, msg: PokerServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private broadcast(msg: PokerServerMessage, exclude: string[] = []) {
    this.room.broadcast(JSON.stringify(msg), exclude);
  }
}

function makeEmptySeats(n: number): PokerSeat[] {
  return Array.from({ length: n }, (_, i) => ({
    seatIndex: i,
    playerId: null,
    playerName: null,
    playerColor: null,
    chips: 0,
    holeCards: [],
    currentBet: 0,
    totalCommitted: 0,
    status: "empty" as const,
    hasActed: false,
  }));
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 20);
  return trimmed.length >= 2 ? trimmed : null;
}

function sanitizeChat(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 200);
  return trimmed || null;
}

function sanitizeAuthId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return UUID_RE.test(raw) ? raw : null;
}
