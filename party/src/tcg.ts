import type * as Party from "partykit/server";
import type {
  PokemonCardData,
  PokemonPackTypeId,
  TcgCardOwned,
  TcgClientMessage,
  TcgGameId,
  TcgPackResult,
  TcgRarity,
  TcgServerMessage,
} from "../../shared/types";
import { POKEMON_PACK_TYPES, TCG_GAMES } from "../../shared/types";
import { POKEMON_BASE_SET } from "../../shared/tcg-pokemon-base";
import {
  addTcgCards,
  consumeTcgFreePack,
  fetchProfile,
  fetchTcgCollection,
  patchProfileGold,
} from "./lib/supabase";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ConnInfo = {
  authId: string | null;
  name: string;
  gold: number;
  isAdmin: boolean;
  collection: Map<string, number>; // card_id → count
  freePacks: number; // boosters offerts non encore consommés
};

// Per-(game, pack-type) card pools. New sets plug a new entry here.
function getPool(
  gameId: TcgGameId,
  packTypeId: string,
): PokemonCardData[] | null {
  if (gameId !== "pokemon") return null;
  switch (packTypeId as PokemonPackTypeId) {
    case "base-set":
      return POKEMON_BASE_SET;
    case "jungle":
    case "fossil":
    case "team-rocket":
      return null; // pas encore peuplé
    default:
      return null;
  }
}

// Pack rarity slots: 4 "regular" + 1 "rare" slot.
const REGULAR_SLOT_WEIGHTS: Record<TcgRarity, number> = {
  common: 60,
  energy: 18, // basic energies always available
  uncommon: 17,
  rare: 4,
  "holo-rare": 1,
};

const RARE_SLOT_WEIGHTS: Record<TcgRarity, number> = {
  uncommon: 55,
  rare: 30,
  "holo-rare": 15,
  // Rare slot never rolls common or energy.
  common: 0,
  energy: 0,
};

export default class TcgServer implements Party.Server {
  private connInfo = new Map<string, ConnInfo>();
  private gameId: TcgGameId;

  constructor(readonly room: Party.Room) {
    const id = room.id as TcgGameId;
    this.gameId = id in TCG_GAMES ? id : "pokemon";
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const game = TCG_GAMES[this.gameId];
    if (!game.active) {
      this.sendTo(conn, {
        type: "tcg-error",
        message: `${game.name} arrive bientôt.`,
      });
      conn.close();
      return;
    }
    const url = new URL(ctx.request.url);
    const rawAuthId = url.searchParams.get("authId");
    const authId =
      typeof rawAuthId === "string" && UUID_RE.test(rawAuthId)
        ? rawAuthId
        : null;
    const providedName = sanitizeName(url.searchParams.get("name"));
    const goldParam = url.searchParams.get("gold");
    const parsedGold = goldParam ? parseInt(goldParam, 10) : NaN;
    const queryGold = Number.isFinite(parsedGold)
      ? Math.max(0, Math.min(10_000_000, parsedGold))
      : null;

    let gold: number;
    let isAdmin = false;
    let freePacks = 0;
    let collection: Map<string, number> = new Map();
    if (authId) {
      const [profile, rows] = await Promise.all([
        fetchProfile(this.room, authId),
        fetchTcgCollection(this.room, authId, this.gameId),
      ]);
      if (profile && Number.isFinite(profile.gold)) {
        gold = profile.gold;
        isAdmin = !!profile.is_admin;
        const raw = profile.tcg_free_packs?.[this.gameId];
        if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
          freePacks = Math.floor(raw);
        }
      } else if (queryGold !== null) {
        gold = queryGold;
      } else {
        gold = 0;
      }
      for (const r of rows) collection.set(r.card_id, r.count);
    } else {
      gold = queryGold ?? 0;
    }

    this.connInfo.set(conn.id, {
      authId,
      name: providedName ?? `Invité-${conn.id.slice(0, 4)}`,
      gold,
      isAdmin,
      collection,
      freePacks,
    });

    this.sendTo(conn, {
      type: "tcg-welcome",
      selfId: conn.id,
      gold,
      collection: Array.from(collection.entries()).map(([cardId, count]) => ({
        cardId,
        count,
      })),
      gameId: this.gameId,
      freePacks,
    });
  }

  async onMessage(raw: string, sender: Party.Connection) {
    const info = this.connInfo.get(sender.id);
    if (!info) return;
    let data: TcgClientMessage;
    try {
      data = JSON.parse(raw) as TcgClientMessage;
    } catch {
      return;
    }
    if (data.type === "tcg-buy-pack") {
      await this.handleBuyPack(sender, info, data.packTypeId);
    }
  }

  onClose(conn: Party.Connection) {
    this.connInfo.delete(conn.id);
  }

  private async handleBuyPack(
    conn: Party.Connection,
    info: ConnInfo,
    packTypeId: string,
  ) {
    const game = TCG_GAMES[this.gameId];
    if (!info.authId) {
      this.sendError(conn, "Connecte-toi avec Discord pour acheter un pack.");
      return;
    }

    // Validate pack type belongs to this game and is active with cards.
    if (this.gameId === "pokemon") {
      const packType =
        POKEMON_PACK_TYPES[packTypeId as PokemonPackTypeId];
      if (!packType) {
        this.sendError(conn, "Type de booster inconnu.");
        return;
      }
      if (!packType.active) {
        this.sendError(conn, `${packType.name} arrive bientôt.`);
        return;
      }
    }
    const pool = getPool(this.gameId, packTypeId);
    if (!pool || pool.length === 0) {
      this.sendError(conn, "Ce booster n'a pas encore de cartes.");
      return;
    }

    // Try a free pack first; otherwise charge OS.
    let usedFreePack = false;
    if (info.freePacks > 0) {
      const ok = await consumeTcgFreePack(this.room, info.authId, this.gameId);
      if (ok) {
        info.freePacks = Math.max(0, info.freePacks - 1);
        usedFreePack = true;
      }
    }
    if (!usedFreePack) {
      if (info.gold < game.packPrice) {
        this.sendError(conn, "Or Suprême insuffisant pour ce pack.");
        return;
      }
      info.gold -= game.packPrice;
      await patchProfileGold(this.room, info.authId, info.gold);
      this.sendTo(conn, { type: "gold-update", gold: info.gold });
    }
    const cards: PokemonCardData[] = [];
    // Slots 1..size-1 are regular, last slot is the guaranteed rare slot.
    for (let i = 0; i < game.packSize; i++) {
      const isRareSlot = i === game.packSize - 1;
      cards.push(this.drawCard(pool, isRareSlot));
    }

    // Update local + persist.
    const counts: Map<string, number> = new Map();
    for (const card of cards) {
      counts.set(card.id, (counts.get(card.id) ?? 0) + 1);
    }
    for (const [cardId, addCount] of counts) {
      info.collection.set(
        cardId,
        (info.collection.get(cardId) ?? 0) + addCount,
      );
    }
    await addTcgCards(
      this.room,
      info.authId,
      this.gameId,
      Array.from(counts.entries()).map(([card_id, count]) => ({
        card_id,
        count,
      })),
    );

    const pack: TcgPackResult = {
      id: crypto.randomUUID(),
      cards: cards.map((c) => c.id),
      cost: game.packPrice,
      timestamp: Date.now(),
    };
    const newCounts: TcgCardOwned[] = Array.from(counts.keys()).map(
      (cardId) => ({
        cardId,
        count: info.collection.get(cardId) ?? 0,
      }),
    );
    this.sendTo(conn, {
      type: "tcg-pack-opened",
      pack,
      newCounts,
      freePacks: info.freePacks,
      usedFreePack,
    });
  }

  private drawCard(
    pool: PokemonCardData[],
    isRareSlot: boolean,
  ): PokemonCardData {
    const weights = isRareSlot ? RARE_SLOT_WEIGHTS : REGULAR_SLOT_WEIGHTS;
    // Pick a rarity tier first.
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    let chosen: TcgRarity = "common";
    for (const [tier, w] of Object.entries(weights) as [
      TcgRarity,
      number,
    ][]) {
      if (r < w) {
        chosen = tier;
        break;
      }
      r -= w;
    }
    // Filter pool by chosen rarity. If empty (e.g. no rare slots in pool),
    // fall back through tiers.
    const fallbackOrder: TcgRarity[] =
      chosen === "holo-rare"
        ? ["holo-rare", "rare", "uncommon", "common", "energy"]
        : chosen === "rare"
          ? ["rare", "uncommon", "holo-rare", "common", "energy"]
          : chosen === "uncommon"
            ? ["uncommon", "common", "energy", "rare", "holo-rare"]
            : chosen === "energy"
              ? ["energy", "common", "uncommon", "rare", "holo-rare"]
              : ["common", "energy", "uncommon", "rare", "holo-rare"];
    for (const tier of fallbackOrder) {
      const subset = pool.filter((c) => c.rarity === tier);
      if (subset.length > 0) {
        return subset[Math.floor(Math.random() * subset.length)];
      }
    }
    // Should be unreachable as long as the pool isn't empty.
    return pool[0];
  }

  private sendError(conn: Party.Connection, message: string) {
    this.sendTo(conn, { type: "tcg-error", message });
  }

  private sendTo(conn: Party.Connection, msg: TcgServerMessage) {
    conn.send(JSON.stringify(msg));
  }
}

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 20);
  return trimmed.length >= 2 ? trimmed : null;
}
