import type * as Party from "partykit/server";
import type {
  PokemonCardData,
  PokemonPackTypeId,
  TcgCardOwned,
  TcgClientMessage,
  TcgDeck,
  TcgGameId,
  TcgPackResult,
  TcgRarity,
  TcgServerMessage,
} from "../../shared/types";
import { BATTLE_CONFIG, POKEMON_PACK_TYPES, TCG_GAMES } from "../../shared/types";
import { POKEMON_BASE_SET, POKEMON_BASE_SET_BY_ID } from "../../shared/tcg-pokemon-base";
import {
  addTcgCards,
  consumeTcgFreePack,
  deleteTcgDeck,
  fetchProfile,
  fetchTcgCollection,
  fetchTcgDecks,
  patchProfileGold,
  saveTcgDeck,
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

// Thematic pool = toutes les cartes du booster (pack principal ou
// extraPacks) Pocket. "Pack Dracaufeu" tire dans toutes les cartes
// disponibles dans ce booster.
function getThemedPool(
  gameId: TcgGameId,
  packTypeId: string,
): PokemonCardData[] | null {
  if (gameId !== "pokemon") return null;
  if (!(packTypeId in POKEMON_PACK_TYPES)) return null;
  const target = packTypeId as PokemonPackTypeId;
  const pool: PokemonCardData[] = [];
  for (const card of POKEMON_BASE_SET) {
    if (card.kind !== "pokemon") continue;
    if (card.pack === target || card.extraPacks?.includes(target)) {
      pool.push(card);
    }
  }
  return pool.length > 0 ? pool : null;
}

type SlotKind = "regular-low" | "regular-high" | "rare";

// Pack rarity slots : 5 cartes/pack, 3 niveaux de distribution.
// Inspiré de Pokémon TCG Pocket mais plus généreux (les ★/👑 restent rares
// mais plus accessibles, et les 2 derniers slots tirent du ◆◆◆ minimum).
//
//   • REGULAR_LOW  → slots 1, 2, 3 (90/9/1)
//   • REGULAR_HIGH → slot 4         (76% ◆◆◆ + 20% ◆◆◆◆ + chance d'étoiles)
//   • RARE_SLOT    → slot 5         (70% ◆◆◆ + 23.5% ◆◆◆◆ + plus d'étoiles
//                                    + plus de couronnes)
const REGULAR_LOW_WEIGHTS: Record<TcgRarity, number> = {
  "diamond-1": 90,
  "diamond-2": 9,
  "diamond-3": 1,
  "diamond-4": 0,
  "star-1": 0,
  "star-2": 0,
  "star-3": 0,
  crown: 0,
  promo: 0,
};

const REGULAR_HIGH_WEIGHTS: Record<TcgRarity, number> = {
  "diamond-1": 0,
  "diamond-2": 0,
  "diamond-3": 76.66,
  "diamond-4": 20,
  "star-1": 2.572,
  "star-2": 0.5,
  "star-3": 0.222,
  crown: 0.04,
  promo: 0,
};

const RARE_SLOT_WEIGHTS: Record<TcgRarity, number> = {
  "diamond-1": 0,
  "diamond-2": 0,
  "diamond-3": 70,
  "diamond-4": 23.5,
  "star-1": 4,
  "star-2": 2,
  "star-3": 1,
  crown: 0.5,
  promo: 0,
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
    let decks: TcgDeck[] = [];
    if (authId) {
      const [profile, rows, deckRows] = await Promise.all([
        fetchProfile(this.room, authId),
        fetchTcgCollection(this.room, authId, this.gameId),
        fetchTcgDecks(this.room, authId, this.gameId),
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
      decks = deckRows.map((d) => ({
        id: d.id,
        name: d.name,
        cards: (d.cards ?? []).map((c) => ({
          cardId: c.card_id,
          count: c.count,
        })),
        updatedAt: Date.parse(d.updated_at) || Date.now(),
      }));
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
      decks,
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
    } else if (data.type === "tcg-save-deck") {
      await this.handleSaveDeck(sender, info, data.deckId, data.name, data.cards);
    } else if (data.type === "tcg-delete-deck") {
      await this.handleDeleteDeck(sender, info, data.deckId);
    } else if (data.type === "tcg-refresh") {
      await this.refreshConn(sender);
    } else if (data.type === "tcg-notify-tx") {
      await this.notifyTransaction(data.userIds);
    }
  }

  /** Re-fetch profile + collection + decks pour cette connexion et lui
   *  renvoie un tcg-welcome frais (le client réutilise le même handler). */
  private async refreshConn(conn: Party.Connection) {
    const info = this.connInfo.get(conn.id);
    if (!info?.authId) return;
    const [profile, rows, deckRows] = await Promise.all([
      fetchProfile(this.room, info.authId),
      fetchTcgCollection(this.room, info.authId, this.gameId),
      fetchTcgDecks(this.room, info.authId, this.gameId),
    ]);
    if (profile && Number.isFinite(profile.gold)) {
      info.gold = profile.gold;
      const raw = profile.tcg_free_packs?.[this.gameId];
      info.freePacks =
        typeof raw === "number" && Number.isFinite(raw) && raw > 0
          ? Math.floor(raw)
          : 0;
    }
    info.collection = new Map();
    for (const r of rows) info.collection.set(r.card_id, r.count);
    const decks: TcgDeck[] = deckRows.map((d) => ({
      id: d.id,
      name: d.name,
      cards: (d.cards ?? []).map((c) => ({
        cardId: c.card_id,
        count: c.count,
      })),
      updatedAt: Date.parse(d.updated_at) || Date.now(),
    }));
    this.sendTo(conn, {
      type: "tcg-welcome",
      selfId: conn.id,
      gold: info.gold,
      collection: Array.from(info.collection.entries()).map(
        ([cardId, count]) => ({ cardId, count }),
      ),
      gameId: this.gameId,
      freePacks: info.freePacks,
      decks,
    });
  }

  /** Pour chaque userId impacté par une transaction marché, refresh
   *  toutes ses connexions ouvertes sur cette room. */
  private async notifyTransaction(userIds: string[]) {
    if (!Array.isArray(userIds)) return;
    const targets = new Set(userIds.filter((u) => typeof u === "string"));
    if (targets.size === 0) return;
    const tasks: Promise<void>[] = [];
    for (const conn of this.room.getConnections()) {
      const info = this.connInfo.get(conn.id);
      if (info?.authId && targets.has(info.authId)) {
        tasks.push(this.refreshConn(conn));
      }
    }
    await Promise.all(tasks);
  }

  private async handleSaveDeck(
    conn: Party.Connection,
    info: ConnInfo,
    deckId: string | null,
    name: string,
    cards: { cardId: string; count: number }[],
  ) {
    if (!info.authId) {
      this.sendError(conn, "Connecte-toi pour sauvegarder un deck.");
      return;
    }
    if (!Array.isArray(cards) || cards.length === 0) {
      this.sendError(conn, "Deck vide.");
      return;
    }
    // Pocket : deck = 20 cartes exactement, max 2 copies par NOM de carte
    // (toutes raretés confondues — Pikachu-ex ◆◆◆◆ et Pikachu-ex ★ comptent
    // ensemble), pas de cartes énergie (énergies générées auto en combat).
    const total = cards.reduce((s, c) => s + c.count, 0);
    if (total !== BATTLE_CONFIG.deckSize) {
      this.sendError(
        conn,
        `Le deck doit contenir exactement ${BATTLE_CONFIG.deckSize} cartes (actuellement ${total}).`,
      );
      return;
    }
    // Agrège par nom pour vérifier la limite Pocket "max 2 par nom",
    // et compte les Pokémon de Base (au moins 1 requis sinon mulligan
    // infini au démarrage du combat).
    const byName = new Map<string, number>();
    let basicCount = 0;
    for (const entry of cards) {
      const owned = info.collection.get(entry.cardId) ?? 0;
      if (entry.count > owned) {
        this.sendError(
          conn,
          `Tu n'as que ${owned} ${entry.cardId} en collection.`,
        );
        return;
      }
      const meta = POKEMON_BASE_SET_BY_ID.get(entry.cardId);
      const cardName = meta?.name ?? entry.cardId;
      byName.set(cardName, (byName.get(cardName) ?? 0) + entry.count);
      if (meta?.kind === "pokemon" && meta.stage === "basic") {
        basicCount += entry.count;
      }
    }
    for (const [cardName, count] of byName) {
      if (count > BATTLE_CONFIG.maxCopies) {
        this.sendError(
          conn,
          `Max ${BATTLE_CONFIG.maxCopies} cartes "${cardName}" (toutes raretés confondues), tu en as ${count}.`,
        );
        return;
      }
    }
    if (basicCount === 0) {
      this.sendError(
        conn,
        "Au moins 1 Pokémon de Base est requis pour pouvoir démarrer un combat.",
      );
      return;
    }
    const result = await saveTcgDeck(
      this.room,
      info.authId,
      this.gameId,
      deckId,
      name,
      cards.map((c) => ({ card_id: c.cardId, count: c.count })),
    );
    if (!result.ok) {
      this.sendError(conn, result.error);
      return;
    }
    // Re-fetch the canonical deck list and broadcast it back.
    const rows = await fetchTcgDecks(this.room, info.authId, this.gameId);
    const decks: TcgDeck[] = rows.map((d) => ({
      id: d.id,
      name: d.name,
      cards: (d.cards ?? []).map((c) => ({
        cardId: c.card_id,
        count: c.count,
      })),
      updatedAt: Date.parse(d.updated_at) || Date.now(),
    }));
    this.sendTo(conn, { type: "tcg-decks", decks });
  }

  private async handleDeleteDeck(
    conn: Party.Connection,
    info: ConnInfo,
    deckId: string,
  ) {
    if (!info.authId) {
      this.sendError(conn, "Connecte-toi pour gérer tes decks.");
      return;
    }
    const ok = await deleteTcgDeck(this.room, info.authId, deckId);
    if (!ok) {
      this.sendError(conn, "Suppression échouée.");
      return;
    }
    const rows = await fetchTcgDecks(this.room, info.authId, this.gameId);
    const decks: TcgDeck[] = rows.map((d) => ({
      id: d.id,
      name: d.name,
      cards: (d.cards ?? []).map((c) => ({
        cardId: c.card_id,
        count: c.count,
      })),
      updatedAt: Date.parse(d.updated_at) || Date.now(),
    }));
    this.sendTo(conn, { type: "tcg-decks", decks });
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
    // Booster composition Pocket-style : les 5 cartes viennent toutes du
    // booster choisi (themed pool). Distribution croissante de rareté :
    //   slots 0-2 : REGULAR_LOW   (~90% ◆, ~9% ◆◆, ~1% ◆◆◆)
    //   slot 3    : REGULAR_HIGH  (~76% ◆◆◆, ~20% ◆◆◆◆, étoiles rares)
    //   slot 4    : RARE_SLOT     (~70% ◆◆◆, ~23.5% ◆◆◆◆, plus d'étoiles)
    // Le fullPool n'est plus utilisé pour les boosters Pokémon afin de
    // matcher Pocket : un Pack Mewtwo ne donne que des cartes Mewtwo, etc.
    const cards: PokemonCardData[] = [];
    for (let i = 0; i < game.packSize; i++) {
      const slotKind: SlotKind =
        i === game.packSize - 1
          ? "rare"
          : i === game.packSize - 2
            ? "regular-high"
            : "regular-low";
      const pool = this.gameId === "pokemon" ? themedPool : fullPool;
      cards.push(this.drawCard(pool, slotKind));
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
    slotKind: SlotKind,
  ): PokemonCardData {
    const weights =
      slotKind === "rare"
        ? RARE_SLOT_WEIGHTS
        : slotKind === "regular-high"
          ? REGULAR_HIGH_WEIGHTS
          : REGULAR_LOW_WEIGHTS;
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    let chosen: TcgRarity = "diamond-1";
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
    // Fallback : si la rareté tirée n'a pas de carte dans le pool, descendre
    // vers les tiers proches (du plus rare au plus commun).
    const fullOrder: TcgRarity[] = [
      "crown",
      "star-3",
      "star-2",
      "star-1",
      "diamond-4",
      "diamond-3",
      "diamond-2",
      "diamond-1",
      "promo",
    ];
    const startIdx = fullOrder.indexOf(chosen);
    const order = [
      ...fullOrder.slice(startIdx),
      ...fullOrder.slice(0, startIdx),
    ];
    for (const tier of order) {
      const subset = pool.filter((c) => c.rarity === tier);
      if (subset.length > 0) {
        return subset[Math.floor(Math.random() * subset.length)];
      }
    }
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
