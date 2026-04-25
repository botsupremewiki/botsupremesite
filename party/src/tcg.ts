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

// Full pool = every card of the gen, all 4 packs draw from this for the
// "mixed" slots so collections stay equitable across pack choices.
function getFullPool(gameId: TcgGameId): PokemonCardData[] {
  if (gameId !== "pokemon") return [];
  return POKEMON_BASE_SET;
}

// Thematic pool = cards tagged with `pack === packTypeId` plus the basic
// energies. Used for the 1 guaranteed-themed slot per booster so every
// "Pack Dracaufeu" actually feels like a Dracaufeu pack.
function getThemedPool(
  gameId: TcgGameId,
  packTypeId: string,
): PokemonCardData[] | null {
  if (gameId !== "pokemon") return null;
  if (!(packTypeId in POKEMON_PACK_TYPES)) return null;
  const target = packTypeId as PokemonPackTypeId;
  const pool: PokemonCardData[] = [];
  for (const card of POKEMON_BASE_SET) {
    if (card.kind === "energy") pool.push(card);
    else if (card.pack === target) pool.push(card);
  }
  return pool.length > 0 ? pool : null;
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
    const themedPool = getThemedPool(this.gameId, packTypeId);
    const fullPool = getFullPool(this.gameId);
    if (!themedPool || themedPool.length === 0 || fullPool.length === 0) {
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
    // Booster composition for Pokémon (5 cartes = 3 thématiques + 2 mixés) :
    //   slots 0..2  : tirage dans le pool du mascot du pack (Dracaufeu &
    //                 ses copains thème Feu/Combat/Sol/Vol pour Pack
    //                 Dracaufeu, etc.). Donne au pack son identité.
    //   slots 3..4  : tirage dans le pool complet des 151 — n'importe
    //                 quelle carte de la Gen peut tomber, ce qui garde
    //                 les 4 packs équitables en valeur espérée.
    //   slot 4      : reste le "rare slot" (uncommon+ garanti).
    // Pour les autres jeux (à venir : One Piece / LoL) on retombe sur le
    // pool unique du jeu.
    const cards: PokemonCardData[] = [];
    const themedSlotCount = this.gameId === "pokemon" ? 3 : game.packSize;
    for (let i = 0; i < game.packSize; i++) {
      const isRareSlot = i === game.packSize - 1;
      const pool = i < themedSlotCount ? themedPool : fullPool;
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
