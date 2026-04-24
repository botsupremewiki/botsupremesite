import type * as Party from "partykit/server";
import type {
  BlackjackHand,
  BlackjackSeat,
  BlackjackState,
  Card,
  CardRank,
  CardSuit,
  ChatMessage,
  ClientMessage,
  Player,
  ServerMessage,
} from "../../shared/types";
import { BLACKJACK_CONFIG, PLAZA_CONFIG } from "../../shared/types";
import { fetchProfile } from "./lib/supabase";
import { PersistentChatHistory } from "./lib/chat-storage";

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

const INSURANCE_DURATION_MS = 10_000;
const MAX_HANDS_PER_SEAT = 4; // up to 3 splits

type TimerId = ReturnType<typeof setTimeout>;

export default class BlackjackServer implements Party.Server {
  private players = new Map<string, Player>();
  private chat: PersistentChatHistory;
  private colorCursor = 0;

  private seats: BlackjackSeat[] = makeEmptySeats();
  private phase: BlackjackState["phase"] = "idle";
  private deck: Card[] = [];
  private dealerHand: Card[] = [];
  private dealerHoleHidden = true;
  private activeSeatIndex: number | null = null;
  private phaseEndsAt: number | null = null;
  private phaseTimer: TimerId | null = null;
  private lastOutcome: string | null = null;

  private authIdToSeatIndex = new Map<string, number>();
  private connIdToSeatIndex = new Map<string, number>();
  private connIdToGold = new Map<string, number>();
  private connIdToIsAdmin = new Map<string, boolean>();

  constructor(readonly room: Party.Room) {
    this.chat = new PersistentChatHistory(room, PLAZA_CONFIG.chatHistorySize);
  }

  // ──────────────────────────────── connection handling ────────────────────────

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    if (this.players.size >= PLAZA_CONFIG.maxPlayers) {
      this.sendTo(conn, {
        type: "error",
        message: "La table est pleine (spectateurs inclus).",
      });
      conn.close();
      return;
    }

    const url = new URL(ctx.request.url);
    const authId = sanitizeAuthId(url.searchParams.get("authId"));
    const providedName = sanitizeName(url.searchParams.get("name"));
    const avatarUrl = sanitizeUrl(url.searchParams.get("avatarUrl"));
    const goldParam = url.searchParams.get("gold");
    const parsedGold = goldParam ? parseInt(goldParam, 10) : NaN;
    const queryGold = Number.isFinite(parsedGold)
      ? Math.max(0, Math.min(10_000_000, parsedGold))
      : null;

    let initialGold: number;
    let isAdmin = false;
    if (authId) {
      const profile = await fetchProfile(this.room, authId);
      if (profile && Number.isFinite(profile.gold)) {
        initialGold = profile.gold;
        isAdmin = !!profile.is_admin;
      } else if (queryGold !== null) {
        initialGold = queryGold;
      } else {
        initialGold = 0;
      }
    } else {
      initialGold = queryGold ?? 1000;
    }
    this.connIdToGold.set(conn.id, initialGold);
    this.connIdToIsAdmin.set(conn.id, isAdmin);

    const player: Player = {
      id: conn.id,
      authId: authId ?? undefined,
      name: providedName ?? `Invité-${conn.id.slice(0, 4)}`,
      avatarUrl: avatarUrl ?? undefined,
      x: PLAZA_CONFIG.width / 2 + (Math.random() - 0.5) * 80,
      y: 560,
      direction: "up",
      color: AVATAR_COLORS[this.colorCursor++ % AVATAR_COLORS.length],
    };
    this.players.set(conn.id, player);

    if (authId && this.authIdToSeatIndex.has(authId)) {
      const seatIndex = this.authIdToSeatIndex.get(authId)!;
      const seat = this.seats[seatIndex];
      if (seat && !seat.playerId) {
        seat.playerId = conn.id;
        seat.playerName = player.name;
        seat.playerColor = player.color;
        seat.gold = initialGold;
        this.connIdToSeatIndex.set(conn.id, seatIndex);
      }
    }

    const history = await this.chat.list();
    this.sendTo(conn, {
      type: "welcome",
      selfId: conn.id,
      players: Array.from(this.players.values()),
      chat: history,
      blackjack: this.snapshotState(),
      gold: initialGold,
    });
    this.broadcast({ type: "player-joined", player }, [conn.id]);
  }

  async onMessage(raw: string, sender: Party.Connection) {
    let data: ClientMessage;
    try {
      data = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }

    const player = this.players.get(sender.id);
    if (!player) return;

    switch (data.type) {
      case "move": {
        if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) return;
        const x = clamp(data.x, 0, PLAZA_CONFIG.width);
        const y = clamp(data.y, 0, PLAZA_CONFIG.height);
        player.x = x;
        player.y = y;
        player.direction = data.direction;
        this.broadcast(
          {
            type: "player-moved",
            playerId: sender.id,
            x,
            y,
            direction: data.direction,
          },
          [sender.id],
        );
        break;
      }

      case "set-name": {
        if (player.authId) return;
        const name = sanitizeName(data.name);
        if (!name) return;
        player.name = name;
        this.broadcast({
          type: "player-renamed",
          playerId: sender.id,
          name,
        });
        break;
      }

      case "chat": {
        const text = sanitizeChat(data.text);
        if (!text) return;
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          playerId: sender.id,
          playerName: player.name,
          text,
          timestamp: Date.now(),
          isAdmin: this.connIdToIsAdmin.get(sender.id) || undefined,
        };
        await this.chat.add(message);
        this.broadcast({ type: "chat", message });
        break;
      }

      case "take-seat":
        this.handleTakeSeat(sender, player, data.seatIndex);
        break;

      case "leave-seat":
        this.handleLeaveSeat(sender.id);
        break;

      case "ready":
        this.handleReady(sender.id);
        break;

      case "bet":
        this.handleBet(sender.id, data.amount);
        break;

      case "hit":
        this.handleHit(sender.id);
        break;

      case "stand":
        this.handleStand(sender.id);
        break;

      case "double":
        this.handleDouble(sender.id);
        break;

      case "split":
        this.handleSplit(sender.id);
        break;

      case "insurance":
        this.handleInsurance(sender.id, data.take);
        break;

      default:
        break;
    }
  }

  onClose(conn: Party.Connection) {
    this.connIdToIsAdmin.delete(conn.id);
    if (!this.players.delete(conn.id)) return;
    this.connIdToGold.delete(conn.id);

    const seatIndex = this.connIdToSeatIndex.get(conn.id);
    if (seatIndex !== undefined) {
      const seat = this.seats[seatIndex];
      if (this.phase === "idle") {
        this.freeSeat(seatIndex);
      } else {
        // Forfeit: detach player but keep the seat slot in the round.
        seat.playerId = null;
        seat.playerName = null;
        seat.playerColor = null;
        seat.ready = false;
        if (seat.hands.some((h) => h.bet > 0)) {
          for (const h of seat.hands) {
            if (h.status === "playing") h.status = "lost";
          }
          seat.status = "settled";
        } else {
          seat.status = "empty";
        }
        if (this.activeSeatIndex === seatIndex) {
          this.advanceToNextSeat();
        } else {
          this.broadcastState();
        }
      }
      this.connIdToSeatIndex.delete(conn.id);
      const player = this.players.get(conn.id);
      if (player?.authId) this.authIdToSeatIndex.delete(player.authId);
    }
    this.broadcast({ type: "player-left", playerId: conn.id });
  }

  // ──────────────────────────────── seating ────────────────────────────────────

  private handleTakeSeat(
    conn: Party.Connection,
    player: Player,
    seatIndexRaw: number,
  ) {
    const seatIndex = Math.floor(seatIndexRaw);
    if (
      !Number.isInteger(seatIndex) ||
      seatIndex < 0 ||
      seatIndex >= this.seats.length
    ) {
      this.sendTo(conn, { type: "error", message: "Place invalide." });
      return;
    }
    if (this.connIdToSeatIndex.has(conn.id)) {
      this.sendTo(conn, {
        type: "error",
        message: "Tu es déjà assis à une place.",
      });
      return;
    }
    const seat = this.seats[seatIndex];
    if (seat.playerId) {
      this.sendTo(conn, { type: "error", message: "Place déjà prise." });
      return;
    }
    if (this.phase !== "idle") {
      this.sendTo(conn, {
        type: "error",
        message: "Tu ne peux t'asseoir qu'entre deux manches.",
      });
      return;
    }

    const existingGold = this.connIdToGold.get(conn.id) ?? 0;

    seat.playerId = conn.id;
    seat.playerName = player.name;
    seat.playerColor = player.color;
    seat.gold = existingGold;
    seat.status = "waiting";
    seat.ready = false;
    seat.baseBet = 0;
    seat.insuranceBet = 0;
    seat.hands = [];
    seat.activeHandIndex = 0;

    this.connIdToSeatIndex.set(conn.id, seatIndex);
    if (player.authId) this.authIdToSeatIndex.set(player.authId, seatIndex);

    this.broadcastState();
  }

  private handleLeaveSeat(connId: string) {
    const seatIndex = this.connIdToSeatIndex.get(connId);
    if (seatIndex === undefined) return;
    if (this.phase !== "idle") {
      this.sendTo(this.connOf(connId), {
        type: "error",
        message: "Attends la fin de la manche pour quitter.",
      });
      return;
    }
    this.freeSeat(seatIndex);
    this.connIdToSeatIndex.delete(connId);
    const player = this.players.get(connId);
    if (player?.authId) this.authIdToSeatIndex.delete(player.authId);
  }

  private freeSeat(seatIndex: number) {
    this.seats[seatIndex] = emptySeat(seatIndex);
    this.broadcastState();
  }

  // ──────────────────────────────── ready / betting ─────────────────────────────

  private handleReady(connId: string) {
    const seatIndex = this.connIdToSeatIndex.get(connId);
    if (seatIndex === undefined) return;
    if (this.phase !== "idle") return;
    const seat = this.seats[seatIndex];
    if (!seat.playerId) return;
    seat.ready = true;
    this.broadcastState();
    this.maybeStartRound();
  }

  private maybeStartRound() {
    const active = this.seats.filter((s) => s.playerId);
    if (active.length === 0) return;
    const allReady = active.every((s) => s.ready);
    if (allReady) this.startBetting();
  }

  private startBetting() {
    this.phase = "betting";
    this.deck = makeShuffledDeck(6);
    this.dealerHand = [];
    this.dealerHoleHidden = true;
    this.lastOutcome = null;
    for (const seat of this.seats) {
      if (seat.playerId) {
        seat.baseBet = 0;
        seat.insuranceBet = 0;
        seat.hands = [];
        seat.activeHandIndex = 0;
        seat.status = "betting";
      }
    }
    this.setPhaseTimeout(BLACKJACK_CONFIG.bettingDurationMs, () =>
      this.endBetting(),
    );
    this.broadcastState();
  }

  private handleBet(connId: string, amount: number) {
    if (this.phase !== "betting") return;
    const seatIndex = this.connIdToSeatIndex.get(connId);
    if (seatIndex === undefined) return;
    const seat = this.seats[seatIndex];
    if (!seat.playerId) return;
    if (!Number.isFinite(amount)) return;
    const bet = Math.floor(amount);
    if (bet < BLACKJACK_CONFIG.minBet || bet > BLACKJACK_CONFIG.maxBet) return;
    if (bet > seat.gold) {
      this.sendTo(this.connOf(connId), {
        type: "error",
        message: "Or Suprême insuffisant.",
      });
      return;
    }
    seat.baseBet = bet;
    seat.gold -= bet; // reserve the bet
    seat.status = "ready";
    this.connIdToGold.set(connId, seat.gold);
    this.sendGoldTo(connId, seat.gold);
    this.broadcastState();
  }

  private endBetting() {
    const bettors = this.seats.filter((s) => s.playerId && s.baseBet > 0);
    if (bettors.length === 0) {
      this.returnToIdle();
      return;
    }
    this.dealInitial();

    const dealerUp = this.dealerHand[0];
    if (dealerUp.rank === "A") {
      this.beginInsurancePhase();
    } else if (cardValue(dealerUp) === 10) {
      // Peek for dealer BJ silently.
      if (scoreHand(this.dealerHand) === 21) {
        this.dealerHoleHidden = false;
        this.resolveRound();
        return;
      }
      this.startPlaying();
    } else {
      this.startPlaying();
    }
  }

  private dealInitial() {
    for (const seat of this.seats) {
      if (seat.playerId && seat.baseBet > 0) {
        const cards: Card[] = [this.draw(), this.draw()];
        const score = scoreHand(cards);
        const initialHand: BlackjackHand = {
          cards,
          score,
          bet: seat.baseBet,
          doubled: false,
          fromSplit: false,
          status: score === 21 ? "blackjack" : "playing",
        };
        seat.hands = [initialHand];
        seat.activeHandIndex = 0;
        seat.status = "playing";
      }
    }
    this.dealerHand = [this.draw(), this.draw()];
    this.dealerHoleHidden = true;
  }

  // ──────────────────────────────── insurance ───────────────────────────────────

  private beginInsurancePhase() {
    this.phase = "insurance";
    this.activeSeatIndex = null;
    this.setPhaseTimeout(INSURANCE_DURATION_MS, () => this.endInsurancePhase());
    this.broadcastState();
  }

  private handleInsurance(connId: string, takeRaw: unknown) {
    if (this.phase !== "insurance") return;
    const seatIndex = this.connIdToSeatIndex.get(connId);
    if (seatIndex === undefined) return;
    const seat = this.seats[seatIndex];
    if (!seat.playerId || seat.baseBet <= 0) return;
    if (seat.insuranceBet !== 0) return; // already chose
    const take = takeRaw === true;
    if (take) {
      const cost = Math.floor(seat.baseBet / 2);
      if (cost <= 0 || cost > seat.gold) {
        this.sendTo(this.connOf(connId), {
          type: "error",
          message: "Pas assez d'OS pour l'assurance.",
        });
        return;
      }
      seat.insuranceBet = cost;
      seat.gold -= cost;
      this.connIdToGold.set(connId, seat.gold);
      this.sendGoldTo(connId, seat.gold);
    } else {
      // -1 sentinel = "skipped insurance"; resolveRound treats anything
      // other than a positive value as no insurance. We use -1 instead of
      // staying at 0 so the UI can hide the prompt for this seat.
      seat.insuranceBet = -1;
    }
    this.broadcastState();

    // If every active seat has answered, end the phase early.
    const stillPending = this.seats.some(
      (s) => s.playerId && s.baseBet > 0 && s.insuranceBet === 0,
    );
    if (!stillPending) this.endInsurancePhase();
  }

  private endInsurancePhase() {
    this.clearPhaseTimer();
    this.dealerHoleHidden = false;
    const dealerHasBJ = scoreHand(this.dealerHand) === 21;
    if (dealerHasBJ) {
      // Dealer reveals BJ → resolve immediately. resolveRound handles the
      // insurance payout automatically.
      this.resolveRound();
    } else {
      // No BJ → re-hide the hole card and play normally. Insurance bets
      // are forfeited; resolveRound will skip them.
      this.dealerHoleHidden = true;
      this.startPlaying();
    }
  }

  // ──────────────────────────────── playing loop ────────────────────────────────

  private startPlaying() {
    this.phase = "playing";
    this.activeSeatIndex = this.findNextActiveSeatFrom(-1);
    if (this.activeSeatIndex === null) {
      this.beginDealerPhase();
      return;
    }
    this.armTurnTimer();
    this.broadcastState();
  }

  private armTurnTimer() {
    this.setPhaseTimeout(BLACKJACK_CONFIG.turnDurationMs, () =>
      this.autoStand(),
    );
  }

  private activeSeat(): BlackjackSeat | null {
    if (this.activeSeatIndex === null) return null;
    return this.seats[this.activeSeatIndex];
  }

  private activeHand(): BlackjackHand | null {
    const seat = this.activeSeat();
    if (!seat) return null;
    return seat.hands[seat.activeHandIndex] ?? null;
  }

  private isPair(hand: BlackjackHand): boolean {
    return hand.cards.length === 2 && hand.cards[0].rank === hand.cards[1].rank;
  }

  private handleHit(connId: string) {
    if (this.phase !== "playing") return;
    const seatIndex = this.connIdToSeatIndex.get(connId);
    if (seatIndex === undefined || seatIndex !== this.activeSeatIndex) return;
    const seat = this.seats[seatIndex];
    const hand = seat.hands[seat.activeHandIndex];
    if (!hand || hand.status !== "playing") return;
    if (hand.doubled) return; // doubled hands are locked

    hand.cards.push(this.draw());
    hand.score = scoreHand(hand.cards);
    if (hand.score > 21) {
      hand.status = "busted";
      this.advanceToNextHandOrSeat();
      return;
    }
    if (hand.score === 21) {
      hand.status = "stood";
      this.advanceToNextHandOrSeat();
      return;
    }
    this.armTurnTimer();
    this.broadcastState();
  }

  private handleStand(connId: string) {
    if (this.phase !== "playing") return;
    const seatIndex = this.connIdToSeatIndex.get(connId);
    if (seatIndex === undefined || seatIndex !== this.activeSeatIndex) return;
    const seat = this.seats[seatIndex];
    const hand = seat.hands[seat.activeHandIndex];
    if (!hand || hand.status !== "playing") return;
    hand.status = "stood";
    this.advanceToNextHandOrSeat();
  }

  private handleDouble(connId: string) {
    if (this.phase !== "playing") return;
    const seatIndex = this.connIdToSeatIndex.get(connId);
    if (seatIndex === undefined || seatIndex !== this.activeSeatIndex) return;
    const seat = this.seats[seatIndex];
    const hand = seat.hands[seat.activeHandIndex];
    if (!hand || hand.status !== "playing") return;
    if (hand.cards.length !== 2) return; // double only on first 2 cards
    if (hand.fromSplit && hand.cards[0].rank === "A") return; // no double on split aces
    if (seat.gold < hand.bet) {
      this.sendTo(this.connOf(connId), {
        type: "error",
        message: "Pas assez d'OS pour doubler.",
      });
      return;
    }
    seat.gold -= hand.bet;
    this.connIdToGold.set(connId, seat.gold);
    this.sendGoldTo(connId, seat.gold);
    hand.bet *= 2;
    hand.doubled = true;
    hand.cards.push(this.draw());
    hand.score = scoreHand(hand.cards);
    if (hand.score > 21) {
      hand.status = "busted";
    } else {
      hand.status = "stood";
    }
    this.advanceToNextHandOrSeat();
  }

  private handleSplit(connId: string) {
    if (this.phase !== "playing") return;
    const seatIndex = this.connIdToSeatIndex.get(connId);
    if (seatIndex === undefined || seatIndex !== this.activeSeatIndex) return;
    const seat = this.seats[seatIndex];
    const hand = seat.hands[seat.activeHandIndex];
    if (!hand || hand.status !== "playing") return;
    if (!this.isPair(hand)) return;
    if (seat.hands.length >= MAX_HANDS_PER_SEAT) return;
    if (seat.gold < hand.bet) {
      this.sendTo(this.connOf(connId), {
        type: "error",
        message: "Pas assez d'OS pour split.",
      });
      return;
    }
    seat.gold -= hand.bet;
    this.connIdToGold.set(connId, seat.gold);
    this.sendGoldTo(connId, seat.gold);

    const [a, b] = hand.cards;
    const isAces = a.rank === "A";
    const handA: BlackjackHand = {
      cards: [a, this.draw()],
      score: 0,
      bet: hand.bet,
      doubled: false,
      fromSplit: true,
      status: "playing",
    };
    handA.score = scoreHand(handA.cards);
    const handB: BlackjackHand = {
      cards: [b, this.draw()],
      score: 0,
      bet: hand.bet,
      doubled: false,
      fromSplit: true,
      status: "playing",
    };
    handB.score = scoreHand(handB.cards);

    // Split aces: each hand gets exactly one card and is auto-stood.
    if (isAces) {
      handA.status = "stood";
      handB.status = "stood";
    } else {
      // 21 right after a split is just a stood hand, not a blackjack.
      if (handA.score === 21) handA.status = "stood";
      if (handB.score === 21) handB.status = "stood";
    }

    seat.hands.splice(seat.activeHandIndex, 1, handA, handB);

    // Move to the new active hand (handA already at activeHandIndex).
    if (handA.status !== "playing") {
      this.advanceToNextHandOrSeat();
    } else {
      this.armTurnTimer();
      this.broadcastState();
    }
  }

  private autoStand() {
    if (this.phase !== "playing" || this.activeSeatIndex === null) return;
    const seat = this.seats[this.activeSeatIndex];
    const hand = seat.hands[seat.activeHandIndex];
    if (hand && hand.status === "playing") hand.status = "stood";
    this.advanceToNextHandOrSeat();
  }

  private advanceToNextHandOrSeat() {
    if (this.activeSeatIndex === null) return;
    const seat = this.seats[this.activeSeatIndex];
    // Find the next playable hand inside the current seat.
    for (let i = seat.activeHandIndex + 1; i < seat.hands.length; i++) {
      if (seat.hands[i].status === "playing") {
        seat.activeHandIndex = i;
        this.armTurnTimer();
        this.broadcastState();
        return;
      }
    }
    this.advanceToNextSeat();
  }

  private advanceToNextSeat() {
    const from = this.activeSeatIndex ?? -1;
    const next = this.findNextActiveSeatFrom(from);
    this.activeSeatIndex = next;
    if (next === null) {
      this.beginDealerPhase();
      return;
    }
    this.armTurnTimer();
    this.broadcastState();
  }

  private findNextActiveSeatFrom(fromIndex: number): number | null {
    for (let i = fromIndex + 1; i < this.seats.length; i++) {
      const seat = this.seats[i];
      if (!seat.playerId || seat.baseBet === 0) continue;
      // Find first playable hand in this seat
      const idx = seat.hands.findIndex((h) => h.status === "playing");
      if (idx >= 0) {
        seat.activeHandIndex = idx;
        return i;
      }
    }
    return null;
  }

  // ──────────────────────────────── dealer / resolve ────────────────────────────

  private beginDealerPhase() {
    this.phase = "dealer";
    this.activeSeatIndex = null;
    this.dealerHoleHidden = false;
    this.clearPhaseTimer();

    // Don't bother drawing if every player busted — nothing left to beat.
    const anyAlive = this.seats.some(
      (s) =>
        s.playerId &&
        s.hands.some(
          (h) =>
            h.status === "stood" ||
            h.status === "blackjack" ||
            h.status === "playing",
        ),
    );
    if (!anyAlive) {
      this.phaseTimer = setTimeout(() => this.resolveRound(), 500);
      this.broadcastState();
      return;
    }

    this.broadcastState();
    this.stepDealer();
  }

  private stepDealer() {
    const score = scoreHand(this.dealerHand);
    if (score < 17) {
      this.phaseTimer = setTimeout(() => {
        this.dealerHand.push(this.draw());
        this.broadcastState();
        this.stepDealer();
      }, 700);
    } else {
      this.phaseTimer = setTimeout(() => this.resolveRound(), 700);
    }
  }

  private resolveRound() {
    this.phase = "resolving";
    this.clearPhaseTimer();
    const dealerScore = scoreHand(this.dealerHand);
    const dealerBJ =
      this.dealerHand.length === 2 && dealerScore === 21;
    const dealerBusted = dealerScore > 21;

    const outcomeParts: string[] = [];
    const supabaseWrites: Promise<void>[] = [];

    for (const seat of this.seats) {
      if (!seat.playerId) continue;
      if (seat.baseBet === 0 && seat.insuranceBet <= 0) continue;

      // Insurance settles separately — pays 2:1 if dealer has BJ, else lost.
      if (seat.insuranceBet > 0) {
        if (dealerBJ) {
          // Refund insurance + pay 2x = total 3x stake back.
          const credit = seat.insuranceBet * 3;
          seat.gold += credit;
        }
        // else: insurance lost (already deducted when taken)
      }

      let totalCredit = 0;
      for (const hand of seat.hands) {
        let payoutMultiplier = 0;
        if (hand.status === "blackjack") {
          if (dealerBJ) {
            hand.status = "pushed";
            payoutMultiplier = 1;
          } else {
            hand.status = "won";
            payoutMultiplier = 2.5; // 3:2 BJ
          }
        } else if (hand.status === "busted") {
          payoutMultiplier = 0;
          hand.status = "lost";
        } else if (dealerBJ) {
          // Dealer BJ vs non-BJ hand: lose
          payoutMultiplier = 0;
          hand.status = "lost";
        } else if (dealerBusted) {
          hand.status = "won";
          payoutMultiplier = 2;
        } else if (hand.score > dealerScore) {
          hand.status = "won";
          payoutMultiplier = 2;
        } else if (hand.score < dealerScore) {
          hand.status = "lost";
          payoutMultiplier = 0;
        } else {
          hand.status = "pushed";
          payoutMultiplier = 1;
        }
        const credit = Math.floor(hand.bet * payoutMultiplier);
        totalCredit += credit;
      }
      seat.gold += totalCredit;
      seat.status = "settled";
      if (seat.playerId) this.connIdToGold.set(seat.playerId, seat.gold);

      const player = seat.playerId ? this.players.get(seat.playerId) : null;
      const wonAny = seat.hands.some((h) => h.status === "won");
      const lostAny = seat.hands.some((h) => h.status === "lost");
      const pushedAny = seat.hands.some((h) => h.status === "pushed");
      let label = "";
      const totalStake = seat.hands.reduce((s, h) => s + h.bet, 0);
      const net = totalCredit - totalStake;
      if (wonAny && !lostAny) {
        label = `${seat.playerName} gagne ${Math.max(0, net)}`;
      } else if (lostAny && !wonAny && !pushedAny) {
        label = `${seat.playerName} perd ${Math.abs(net)}`;
      } else if (pushedAny && !wonAny && !lostAny) {
        label = `${seat.playerName} égalité`;
      } else {
        // mixed split outcome
        const sign = net >= 0 ? "+" : "";
        label = `${seat.playerName} ${sign}${net}`;
      }
      outcomeParts.push(label);

      this.sendGoldTo(seat.playerId!, seat.gold);

      if (player?.authId) {
        supabaseWrites.push(
          this.persistGoldToSupabase(player.authId, seat.gold),
        );
      }
    }

    this.lastOutcome =
      outcomeParts.length > 0 ? outcomeParts.join(" · ") : "Manche terminée";

    void Promise.allSettled(supabaseWrites);
    this.broadcastState();

    this.phaseTimer = setTimeout(
      () => this.returnToIdle(),
      BLACKJACK_CONFIG.roundIntervalMs,
    );
  }

  private returnToIdle() {
    this.phase = "idle";
    this.activeSeatIndex = null;
    this.dealerHand = [];
    this.dealerHoleHidden = true;
    this.clearPhaseTimer();
    for (const seat of this.seats) {
      if (seat.playerId) {
        seat.baseBet = 0;
        seat.insuranceBet = 0;
        seat.hands = [];
        seat.activeHandIndex = 0;
        seat.status = "waiting";
        seat.ready = false;
      }
    }
    this.broadcastState();
  }

  // ──────────────────────────────── timers ──────────────────────────────────────

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

  private draw(): Card {
    if (this.deck.length === 0) this.deck = makeShuffledDeck(6);
    return this.deck.pop()!;
  }

  // ──────────────────────────────── Supabase write ─────────────────────────────

  private async persistGoldToSupabase(authId: string, gold: number) {
    const env = (this.room as unknown as { env?: Record<string, string> }).env;
    const url = env?.SUPABASE_URL ?? readProcessEnv("SUPABASE_URL");
    const key =
      env?.SUPABASE_SERVICE_ROLE_KEY ??
      readProcessEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    try {
      const resp = await fetch(`${url}/rest/v1/profiles?id=eq.${authId}`, {
        method: "PATCH",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          gold,
          updated_at: new Date().toISOString(),
        }),
      });
      if (!resp.ok) {
        console.warn(
          "[blackjack] Supabase gold update failed:",
          resp.status,
          await resp.text(),
        );
      }
    } catch (e) {
      console.warn("[blackjack] Supabase fetch threw:", e);
    }
  }

  // ──────────────────────────────── helpers ─────────────────────────────────────

  private snapshotState(): BlackjackState {
    return {
      phase: this.phase,
      seats: this.seats.map((s) => ({
        ...s,
        hands: s.hands.map((h) => ({ ...h, cards: [...h.cards] })),
      })),
      activeSeatIndex: this.activeSeatIndex,
      dealerHand: this.dealerHoleHidden
        ? this.dealerHand.slice(0, 1)
        : [...this.dealerHand],
      dealerScore: this.dealerHoleHidden
        ? scoreHand(this.dealerHand.slice(0, 1))
        : scoreHand(this.dealerHand),
      dealerHoleHidden: this.dealerHoleHidden,
      phaseEndsAt: this.phaseEndsAt,
      lastOutcome: this.lastOutcome,
    };
  }

  private broadcastState() {
    this.broadcast({ type: "blackjack-state", state: this.snapshotState() });
  }

  private sendTo(conn: Party.Connection | undefined, msg: ServerMessage) {
    if (!conn) return;
    conn.send(JSON.stringify(msg));
  }

  private sendGoldTo(connId: string, gold: number) {
    const conn = this.connOf(connId);
    if (conn) this.sendTo(conn, { type: "gold-update", gold });
  }

  private broadcast(msg: ServerMessage, exclude: string[] = []) {
    this.room.broadcast(JSON.stringify(msg), exclude);
  }

  private connOf(id: string): Party.Connection | undefined {
    for (const conn of this.room.getConnections()) {
      if (conn.id === id) return conn;
    }
    return undefined;
  }
}

function makeEmptySeats(): BlackjackSeat[] {
  return Array.from({ length: BLACKJACK_CONFIG.seatCount }, (_, i) =>
    emptySeat(i),
  );
}

function emptySeat(seatIndex: number): BlackjackSeat {
  return {
    seatIndex,
    playerId: null,
    playerName: null,
    playerColor: null,
    gold: 0,
    baseBet: 0,
    insuranceBet: 0,
    hands: [],
    activeHandIndex: 0,
    status: "empty",
    ready: false,
  };
}

const SUITS: CardSuit[] = ["S", "H", "D", "C"];
const RANKS: CardRank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

export function makeShuffledDeck(decks = 6): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push({ suit, rank });
    }
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function scoreHand(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === "A") {
      aces++;
      total += 11;
    } else if (c.rank === "J" || c.rank === "Q" || c.rank === "K") {
      total += 10;
    } else {
      total += parseInt(c.rank, 10);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function cardValue(card: Card): number {
  if (card.rank === "A") return 11;
  if (card.rank === "J" || card.rank === "Q" || card.rank === "K") return 10;
  return parseInt(card.rank, 10);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 20);
  if (trimmed.length < 2) return null;
  return trimmed;
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

function sanitizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function readProcessEnv(key: string): string | undefined {
  const globalProc = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  return globalProc?.env?.[key];
}
