import type * as Party from "partykit/server";
import type {
  OnePieceCardData,
  OnePiecePackTypeId,
  OnePieceRarity,
  PokemonCardData,
  PokemonEnergyType,
  PokemonPackTypeId,
  RuneterraCardData,
  RuneterraPackTypeId,
  RuneterraRarity,
  TcgCardOwned,
  TcgClientMessage,
  TcgDeck,
  TcgGameId,
  TcgPackResult,
  TcgRarity,
  TcgServerMessage,
} from "../../shared/types";
import {
  BATTLE_CONFIG,
  ONEPIECE_PACK_TYPES,
  POKEMON_PACK_TYPES,
  RUNETERRA_PACK_TYPES,
  TCG_GAMES,
} from "../../shared/types";
import { POKEMON_BASE_SET, POKEMON_BASE_SET_BY_ID } from "../../shared/tcg-pokemon-base";
import { ONEPIECE_BASE_SET } from "../../shared/tcg-onepiece-base";
import {
  RUNETERRA_BASE_SET,
  RUNETERRA_BASE_SET_BY_CODE,
} from "../../shared/tcg-runeterra-base";
import {
  addTcgCards,
  addToWonderPickPool,
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
// disponibles dans ce booster. Les cartes "starter" (Potion, Poké Ball,
// Pokédex…) sont exclues — elles sont données au premier login.
function getThemedPool(
  gameId: TcgGameId,
  packTypeId: string,
): PokemonCardData[] | null {
  if (gameId !== "pokemon") return null;
  if (!(packTypeId in POKEMON_PACK_TYPES)) return null;
  const target = packTypeId as PokemonPackTypeId;
  const pool: PokemonCardData[] = [];
  for (const card of POKEMON_BASE_SET) {
    if (card.kind === "trainer" && card.starter) continue;
    if (card.pack === target || card.extraPacks?.includes(target)) {
      pool.push(card);
    }
  }
  return pool.length > 0 ? pool : null;
}

// Thematic pool One Piece = cartes assignées au booster (couleur principale
// OU couleur en extraPacks pour les multi-couleurs). Le pack "Rouge" inclut
// donc aussi les bi-Rouge/X.
function getOnePieceThemedPool(
  gameId: TcgGameId,
  packTypeId: string,
): OnePieceCardData[] | null {
  if (gameId !== "onepiece") return null;
  if (!(packTypeId in ONEPIECE_PACK_TYPES)) return null;
  const target = packTypeId as OnePiecePackTypeId;
  const pool: OnePieceCardData[] = [];
  for (const card of ONEPIECE_BASE_SET) {
    if (card.pack === target || card.extraPacks?.includes(target)) {
      pool.push(card);
    }
  }
  return pool.length > 0 ? pool : null;
}

// Thematic pool Runeterra = cartes collectibles dont la liste de régions
// contient la région du pack. Pour les cartes dual-région (ex Teemo
// PiltoverZaun + BandleCity), elles apparaissent dans le pack PiltoverZaun.
function getRuneterraThemedPool(
  gameId: TcgGameId,
  packTypeId: string,
): RuneterraCardData[] | null {
  if (gameId !== "lol") return null;
  if (!(packTypeId in RUNETERRA_PACK_TYPES)) return null;
  const target = packTypeId as RuneterraPackTypeId;
  const region = RUNETERRA_PACK_TYPES[target].region;
  const pool = RUNETERRA_BASE_SET.filter(
    (c) => c.collectible && c.regions.includes(region),
  );
  return pool.length > 0 ? pool : null;
}

// Liste des cardId starter à donner au premier login : on prend 1 cardId
// par nom unique (le plus basique = le premier rencontré dans le set).
const STARTER_CARD_IDS: string[] = (() => {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const c of POKEMON_BASE_SET) {
    if (c.kind !== "trainer" || !c.starter) continue;
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    ids.push(c.id);
  }
  return ids;
})();
const STARTER_COPIES = 2;

type SlotKind =
  | "regular-core"
  | "regular-mid"
  | "regular-upper"
  | "regular-high"
  | "rare";

// Pack rarity slots : 10 cartes/pack, 5 niveaux de distribution.
// Inspiré de Pokémon TCG papier (escalation des slots) :
//
//   • REGULAR_CORE  → slots 1-4 : ◆ pur (commune garantie, drama d'ouverture)
//   • REGULAR_MID   → slots 5-7 : ◆ dominant + chance ◆◆ + petite chance ◆◆◆
//   • REGULAR_UPPER → slot 8    : ◆◆ dominant + chance ◆◆◆ + petite chance ◆◆◆◆
//   • REGULAR_HIGH  → slot 9    : ◆◆ + ◆◆◆ + chance d'étoiles
//   • RARE_SLOT     → slot 10   : ◆◆◆ garanti + ◆◆◆◆ + plus d'étoiles + couronne
const REGULAR_CORE_WEIGHTS: Record<TcgRarity, number> = {
  "diamond-1": 100,
  "diamond-2": 0,
  "diamond-3": 0,
  "diamond-4": 0,
  "star-1": 0,
  "star-2": 0,
  "star-3": 0,
  crown: 0,
  promo: 0,
};

const REGULAR_MID_WEIGHTS: Record<TcgRarity, number> = {
  "diamond-1": 70,
  "diamond-2": 28,
  "diamond-3": 2,
  "diamond-4": 0,
  "star-1": 0,
  "star-2": 0,
  "star-3": 0,
  crown: 0,
  promo: 0,
};

const REGULAR_UPPER_WEIGHTS: Record<TcgRarity, number> = {
  "diamond-1": 0,
  "diamond-2": 80,
  "diamond-3": 18,
  "diamond-4": 2,
  "star-1": 0,
  "star-2": 0,
  "star-3": 0,
  crown: 0,
  promo: 0,
};

const REGULAR_HIGH_WEIGHTS: Record<TcgRarity, number> = {
  "diamond-1": 0,
  "diamond-2": 60,
  "diamond-3": 24,
  "diamond-4": 12.5,
  "star-1": 2.7,
  "star-2": 0.5,
  "star-3": 0.25,
  crown: 0.05,
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

// ─── Weights One Piece TCG ─────────────────────────────────────────────────
// Distribution par slot (10 cartes/pack — packSize=10). Raretés Bandai :
//   c=Common, uc=Uncommon, r=Rare, sr=Super Rare, sec=Secret Rare,
//   l=Leader, sp=Special/Alt-Art, tr=Treasure Rare, p=Promo, don=DON!!.
//
//   • OP_REGULAR_CORE  → slots 1-4 : C pur
//   • OP_REGULAR_MID   → slots 5-7 : C dominant + chance UC + petit % R
//   • OP_REGULAR_UPPER → slot 8   : UC dominant + chance R + petit % SR
//   • OP_REGULAR_HIGH  → slot 9   : UC + R + chance SR/SEC/L/SP
//   • OP_RARE_SLOT     → slot 10  : R + SR + chance SEC/SP/L/TR
const OP_REGULAR_CORE_WEIGHTS: Record<OnePieceRarity, number> = {
  c: 100,
  uc: 0,
  r: 0,
  sr: 0,
  sec: 0,
  l: 0,
  p: 0,
  tr: 0,
  sp: 0,
  don: 0,
};

const OP_REGULAR_MID_WEIGHTS: Record<OnePieceRarity, number> = {
  c: 65,
  uc: 33,
  r: 2,
  sr: 0,
  sec: 0,
  l: 0,
  p: 0,
  tr: 0,
  sp: 0,
  don: 0,
};

const OP_REGULAR_UPPER_WEIGHTS: Record<OnePieceRarity, number> = {
  c: 0,
  uc: 75,
  r: 23,
  sr: 2,
  sec: 0,
  l: 0,
  p: 0,
  tr: 0,
  sp: 0,
  don: 0,
};

const OP_REGULAR_HIGH_WEIGHTS: Record<OnePieceRarity, number> = {
  c: 0,
  uc: 55,
  r: 27,
  sr: 9,
  sec: 1.5,
  l: 2, // Leader boost +1.5 (était 0.5)
  p: 0,
  tr: 0,
  sp: 1,
  don: 0,
};

const OP_RARE_SLOT_WEIGHTS: Record<OnePieceRarity, number> = {
  c: 0,
  uc: 0,
  r: 50,
  sr: 24,
  sec: 5,
  l: 14, // Leader boost +10 (était 4) — pour qu'avec 10 packs gratuits
         // le joueur ait ~80% de chance d'avoir au moins 1 Leader.
  p: 1,
  tr: 0.5,
  sp: 5.5,
  don: 0,
};

// ─── Weights Legends of Runeterra ──────────────────────────────────────────
// Distribution par slot (15 cartes/pack — packSize=15, plus généreux que
// Pokemon/OnePiece pour aligner le ratio de complétion sur un set ~20% plus
// grand). Raretés Riot : Common, Rare, Epic, Champion. None est exclu
// (tokens non-collectibles). Variantes Holographic/Prismatic ultra-rares.
//
//   • LOR_REGULAR_CORE  → slots 1-7  : Common pur
//   • LOR_REGULAR_MID   → slots 8-11 : Common dominant + chance Rare + petit % Epic
//   • LOR_REGULAR_UPPER → slots 12-13: Rare dominant + chance Common + chance Epic
//   • LOR_REGULAR_HIGH  → slot 14    : Rare dominant + ~8% Champion + 2% Holo
//   • LOR_RARE_SLOT     → slot 15    : Rare+ garanti + ~18% Champion + 12% ultra-rare
//
// Taux global Champion par pack ≈ 25%.
const LOR_REGULAR_CORE_WEIGHTS: Record<RuneterraRarity, number> = {
  Common: 100,
  Rare: 0,
  Epic: 0,
  Champion: 0,
  Holographic: 0,
  Prismatic: 0,
  None: 0,
};

const LOR_REGULAR_MID_WEIGHTS: Record<RuneterraRarity, number> = {
  Common: 70,
  Rare: 28,
  Epic: 2,
  Champion: 0,
  Holographic: 0,
  Prismatic: 0,
  None: 0,
};

const LOR_REGULAR_UPPER_WEIGHTS: Record<RuneterraRarity, number> = {
  Common: 30,
  Rare: 65,
  Epic: 5,
  Champion: 0,
  Holographic: 0,
  Prismatic: 0,
  None: 0,
};

const LOR_REGULAR_HIGH_WEIGHTS: Record<RuneterraRarity, number> = {
  Common: 0,
  Rare: 65,
  Epic: 25,
  Champion: 8,
  Holographic: 2,
  Prismatic: 0,
  None: 0,
};

const LOR_RARE_SLOT_WEIGHTS: Record<RuneterraRarity, number> = {
  Common: 0,
  Rare: 40,
  Epic: 30,
  Champion: 18,
  Holographic: 10,
  Prismatic: 2,
  None: 0,
};

// ─── Layout des slots par jeu ──────────────────────────────────────────────
// Combien de slots core/mid/upper avant les 2 slots fixes (high + rare).
//   • core  : tier 1 (commune pure, "drama d'ouverture")
//   • mid   : tier 2 (commune dominante + chance d'uncommon)
//   • upper : tier 3 (uncommon dominant + chance de rare)
// Les 2 derniers slots sont toujours regular-high puis rare.
//
// Total = core + mid + upper + 2 (high + rare) = packSize.
const PACK_LAYOUT: Record<
  TcgGameId,
  { core: number; mid: number; upper: number }
> = {
  pokemon: { core: 4, mid: 3, upper: 1 }, // 4+3+1+1+1 = 10
  onepiece: { core: 4, mid: 3, upper: 1 }, // 4+3+1+1+1 = 10
  lol: { core: 7, mid: 4, upper: 2 }, // 7+4+2+1+1 = 15
};

function getSlotKind(
  gameId: TcgGameId,
  slotIndex: number,
  packSize: number,
): SlotKind {
  if (slotIndex === packSize - 1) return "rare";
  if (slotIndex === packSize - 2) return "regular-high";
  const layout = PACK_LAYOUT[gameId];
  if (slotIndex < layout.core) return "regular-core";
  if (slotIndex < layout.core + layout.mid) return "regular-mid";
  return "regular-upper";
}

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

      // Starter pack Pokémon : si le joueur n'a aucune des cartes starter
      // (Potion, Poké Ball, Pokédex, Vitesse +, Scrute Main, Carton Rouge,
      // Recherches Professorales) en collection, on les lui donne en
      // STARTER_COPIES exemplaires chacune (= 14 cartes) une seule fois.
      if (
        this.gameId === "pokemon" &&
        STARTER_CARD_IDS.length > 0 &&
        !STARTER_CARD_IDS.some((id) => (collection.get(id) ?? 0) > 0)
      ) {
        const starterCards = STARTER_CARD_IDS.map((card_id) => ({
          card_id,
          count: STARTER_COPIES,
        }));
        await addTcgCards(this.room, authId, this.gameId, starterCards);
        for (const { card_id, count } of starterCards) {
          collection.set(card_id, (collection.get(card_id) ?? 0) + count);
        }
        console.log(
          `[tcg] Starter pack donné à ${authId} (${starterCards.length} cartes × ${STARTER_COPIES})`,
        );
      }

      decks = deckRows.map((d) => ({
        id: d.id,
        name: d.name,
        cards: (d.cards ?? []).map((c) => ({
          cardId: c.card_id,
          count: c.count,
        })),
        energyTypes: (d.energy_types ?? []) as PokemonEnergyType[],
        leaderId: d.leader_id ?? null,
        regions: (d.regions ?? []) as string[],
        isPublic: d.is_public ?? false,
        shareCode: d.share_code ?? null,
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
      await this.handleSaveDeck(
        sender,
        info,
        data.deckId,
        data.name,
        data.cards,
        data.energyTypes,
        data.leaderId,
        data.regions ?? [],
      );
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
      energyTypes: (d.energy_types ?? []) as PokemonEnergyType[],
      leaderId: d.leader_id ?? null,
      regions: (d.regions ?? []) as string[],
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
    energyTypes: string[],
    leaderId: string | null,
    regions: string[],
  ) {
    if (!info.authId) {
      this.sendError(conn, "Connecte-toi pour sauvegarder un deck.");
      return;
    }
    if (!Array.isArray(cards) || cards.length === 0) {
      this.sendError(conn, "Deck vide.");
      return;
    }

    // Validation par jeu : Pokémon Pocket (20/2/énergies), One Piece TCG
    // (50/4/Leader+couleur), Runeterra (40/3/1-2 régions, 6 champions max).
    if (this.gameId === "pokemon") {
      const ok = this.validatePokemonDeck(conn, info, cards, energyTypes);
      if (!ok) return;
    } else if (this.gameId === "onepiece") {
      const ok = this.validateOnePieceDeck(conn, info, cards, leaderId);
      if (!ok) return;
    } else if (this.gameId === "lol") {
      const ok = this.validateRuneterraDeck(conn, info, cards, regions);
      if (!ok) return;
    } else {
      this.sendError(conn, "Sauvegarde de deck non supportée pour ce jeu.");
      return;
    }

    const result = await saveTcgDeck(
      this.room,
      info.authId,
      this.gameId,
      deckId,
      name,
      cards.map((c) => ({ card_id: c.cardId, count: c.count })),
      energyTypes,
      leaderId,
      regions,
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
      energyTypes: (d.energy_types ?? []) as PokemonEnergyType[],
      leaderId: d.leader_id ?? null,
      regions: (d.regions ?? []) as string[],
      updatedAt: Date.parse(d.updated_at) || Date.now(),
    }));
    this.sendTo(conn, { type: "tcg-decks", decks });
  }

  /** Validations Pokémon Pocket : 20 cartes, max 2 par NOM, 1-3 énergies,
   *  au moins 1 Pokémon de Base. Retourne false et envoie l'erreur si KO. */
  private validatePokemonDeck(
    conn: Party.Connection,
    info: ConnInfo,
    cards: { cardId: string; count: number }[],
    energyTypes: string[],
  ): boolean {
    const total = cards.reduce((s, c) => s + c.count, 0);
    if (total !== BATTLE_CONFIG.deckSize) {
      this.sendError(
        conn,
        `Le deck doit contenir exactement ${BATTLE_CONFIG.deckSize} cartes (actuellement ${total}).`,
      );
      return false;
    }
    const byName = new Map<string, number>();
    let basicCount = 0;
    for (const entry of cards) {
      const owned = info.collection.get(entry.cardId) ?? 0;
      if (entry.count > owned) {
        this.sendError(
          conn,
          `Tu n'as que ${owned} ${entry.cardId} en collection.`,
        );
        return false;
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
        return false;
      }
    }
    if (basicCount === 0) {
      this.sendError(
        conn,
        "Au moins 1 Pokémon de Base est requis pour pouvoir démarrer un combat.",
      );
      return false;
    }
    const VALID_TYPES = new Set([
      "fire", "water", "grass", "lightning", "psychic", "fighting",
      "darkness", "metal", "dragon", "fairy", "colorless",
    ]);
    if (
      !Array.isArray(energyTypes) ||
      energyTypes.length < 1 ||
      energyTypes.length > 3 ||
      energyTypes.some((t) => !VALID_TYPES.has(t))
    ) {
      this.sendError(
        conn,
        "Sélectionne entre 1 et 3 types d'énergie pour ton deck.",
      );
      return false;
    }
    return true;
  }

  /** Validations Runeterra (Set 1) : 40 cartes, max 3 copies par cardCode,
   *  1-2 régions choisies, max 6 champions, toutes les cartes partagent au
   *  moins une région avec celles choisies. */
  private validateRuneterraDeck(
    conn: Party.Connection,
    info: ConnInfo,
    cards: { cardId: string; count: number }[],
    regions: string[],
  ): boolean {
    const VALID_REGIONS = new Set([
      "Demacia",
      "Noxus",
      "Ionia",
      "Freljord",
      "PiltoverZaun",
      "ShadowIsles",
    ]);
    if (
      !Array.isArray(regions) ||
      regions.length < 1 ||
      regions.length > 2 ||
      regions.some((r) => !VALID_REGIONS.has(r))
    ) {
      this.sendError(
        conn,
        `Sélectionne 1 ou 2 régions valides (actuellement ${regions?.length ?? 0}).`,
      );
      return false;
    }
    const allowed = new Set(regions);
    const total = cards.reduce((s, c) => s + c.count, 0);
    if (total !== 40) {
      this.sendError(
        conn,
        `Le deck Runeterra doit contenir exactement 40 cartes (actuellement ${total}).`,
      );
      return false;
    }
    const byCode = new Map<string, number>();
    let championCount = 0;
    for (const entry of cards) {
      const owned = info.collection.get(entry.cardId) ?? 0;
      if (entry.count > owned) {
        this.sendError(
          conn,
          `Tu n'as que ${owned} ${entry.cardId} en collection.`,
        );
        return false;
      }
      const meta = RUNETERRA_BASE_SET_BY_CODE.get(entry.cardId);
      if (!meta) {
        this.sendError(conn, `Carte inconnue : ${entry.cardId}.`);
        return false;
      }
      if (!meta.collectible) {
        this.sendError(
          conn,
          `${meta.name} n'est pas une carte collectible.`,
        );
        return false;
      }
      const sharesRegion = meta.regions.some((r) => allowed.has(r));
      if (!sharesRegion) {
        this.sendError(
          conn,
          `${meta.name} (${meta.regions.join("/")}) ne partage aucune région avec celles choisies (${regions.join("/")}).`,
        );
        return false;
      }
      if (meta.supertype === "Champion") championCount += entry.count;
      byCode.set(
        entry.cardId,
        (byCode.get(entry.cardId) ?? 0) + entry.count,
      );
    }
    for (const [code, count] of byCode) {
      if (count > 3) {
        this.sendError(
          conn,
          `Max 3 copies par carte. ${code} : ${count}.`,
        );
        return false;
      }
    }
    if (championCount > 6) {
      this.sendError(
        conn,
        `Max 6 champions par deck (actuellement ${championCount}).`,
      );
      return false;
    }
    return true;
  }

  /** Validations One Piece TCG : 1 Leader (hors deck), 50 cartes, max 4
   *  copies par cardNumber (alt-arts comptent ensemble), toutes les cartes
   *  partagent au moins une couleur avec le Leader. */
  private validateOnePieceDeck(
    conn: Party.Connection,
    info: ConnInfo,
    cards: { cardId: string; count: number }[],
    leaderId: string | null,
  ): boolean {
    if (!leaderId) {
      this.sendError(conn, "Sélectionne un Leader pour ton deck.");
      return false;
    }
    const leader = ONEPIECE_BASE_SET.find((c) => c.id === leaderId);
    if (!leader || leader.kind !== "leader") {
      this.sendError(conn, "Leader invalide.");
      return false;
    }
    const ownedLeader = info.collection.get(leaderId) ?? 0;
    if (ownedLeader < 1) {
      this.sendError(
        conn,
        `Tu ne possèdes pas le Leader ${leader.name}.`,
      );
      return false;
    }
    const total = cards.reduce((s, c) => s + c.count, 0);
    if (total !== 50) {
      this.sendError(
        conn,
        `Le deck One Piece doit contenir exactement 50 cartes (actuellement ${total}).`,
      );
      return false;
    }

    const byCardNumber = new Map<string, number>();
    const allowedColors = new Set(leader.color);
    for (const entry of cards) {
      const owned = info.collection.get(entry.cardId) ?? 0;
      if (entry.count > owned) {
        this.sendError(
          conn,
          `Tu n'as que ${owned} ${entry.cardId} en collection.`,
        );
        return false;
      }
      const meta = ONEPIECE_BASE_SET.find((c) => c.id === entry.cardId);
      if (!meta) {
        this.sendError(conn, `Carte inconnue : ${entry.cardId}.`);
        return false;
      }
      if (meta.kind === "leader") {
        this.sendError(
          conn,
          "Les Leaders ne peuvent pas être dans le deck principal.",
        );
        return false;
      }
      if (meta.kind === "don") {
        this.sendError(
          conn,
          "Les cartes DON!! sont gérées séparément, pas dans le deck principal.",
        );
        return false;
      }
      // Contrainte de couleur : au moins une couleur partagée avec le Leader.
      const cardColors = "color" in meta ? meta.color : [];
      const sharesColor = cardColors.some((c) => allowedColors.has(c));
      if (!sharesColor) {
        this.sendError(
          conn,
          `${meta.name} (${cardColors.join("/")}) ne partage aucune couleur avec ton Leader ${leader.name} (${leader.color.join("/")}).`,
        );
        return false;
      }
      byCardNumber.set(
        meta.cardNumber,
        (byCardNumber.get(meta.cardNumber) ?? 0) + entry.count,
      );
    }
    for (const [cardNumber, count] of byCardNumber) {
      if (count > 4) {
        this.sendError(
          conn,
          `Max 4 copies par carte (alt-arts inclus). ${cardNumber} : ${count}.`,
        );
        return false;
      }
    }
    return true;
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
      energyTypes: (d.energy_types ?? []) as PokemonEnergyType[],
      leaderId: d.leader_id ?? null,
      regions: (d.regions ?? []) as string[],
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
      const packType = POKEMON_PACK_TYPES[packTypeId as PokemonPackTypeId];
      if (!packType) {
        this.sendError(conn, "Type de booster inconnu.");
        return;
      }
      if (!packType.active) {
        this.sendError(conn, `${packType.name} arrive bientôt.`);
        return;
      }
    } else if (this.gameId === "onepiece") {
      const packType = ONEPIECE_PACK_TYPES[packTypeId as OnePiecePackTypeId];
      if (!packType) {
        this.sendError(conn, "Type de booster inconnu.");
        return;
      }
      if (!packType.active) {
        this.sendError(conn, `${packType.name} arrive bientôt.`);
        return;
      }
    } else if (this.gameId === "lol") {
      const packType = RUNETERRA_PACK_TYPES[packTypeId as RuneterraPackTypeId];
      if (!packType) {
        this.sendError(conn, "Type de booster inconnu.");
        return;
      }
      if (!packType.active) {
        this.sendError(conn, `${packType.name} arrive bientôt.`);
        return;
      }
    }

    // Resolve pool selon le jeu. On garde des branches strictes pour ne
    // pas mélanger les types Pokémon/OnePiece/Runeterra dans le drawCard.
    const pokemonThemed =
      this.gameId === "pokemon" ? getThemedPool(this.gameId, packTypeId) : null;
    const pokemonFull =
      this.gameId === "pokemon" ? getFullPool(this.gameId) : null;
    const onePieceThemed =
      this.gameId === "onepiece"
        ? getOnePieceThemedPool(this.gameId, packTypeId)
        : null;
    const lorThemed =
      this.gameId === "lol"
        ? getRuneterraThemedPool(this.gameId, packTypeId)
        : null;
    if (
      this.gameId === "pokemon" &&
      (!pokemonThemed ||
        pokemonThemed.length === 0 ||
        !pokemonFull ||
        pokemonFull.length === 0)
    ) {
      this.sendError(conn, "Ce booster n'a pas encore de cartes.");
      return;
    }
    if (
      this.gameId === "onepiece" &&
      (!onePieceThemed || onePieceThemed.length === 0)
    ) {
      this.sendError(conn, "Ce booster n'a pas encore de cartes.");
      return;
    }
    if (this.gameId === "lol" && (!lorThemed || lorThemed.length === 0)) {
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

    // Distribution des slots en 5 tiers (core/mid/upper/high/rare) — voir
    // PACK_LAYOUT et getSlotKind() ci-dessus pour la répartition exacte par jeu.
    // Le pack escalade en intérêt : core (commune pure) → mid → upper → high → rare.
    const cardIds: string[] = [];
    for (let i = 0; i < game.packSize; i++) {
      const slotKind: SlotKind = getSlotKind(this.gameId, i, game.packSize);
      if (this.gameId === "pokemon") {
        cardIds.push(this.drawCard(pokemonThemed!, slotKind).id);
      } else if (this.gameId === "onepiece") {
        cardIds.push(this.drawOnePieceCard(onePieceThemed!, slotKind).id);
      } else if (this.gameId === "lol") {
        cardIds.push(this.drawRuneterraCard(lorThemed!, slotKind).cardCode);
      }
    }
    // Stub typé pour le reste du flow : on travaille uniquement avec les ids.
    const cards = cardIds.map((id) => ({ id }));

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

    // Wonder Pick : ajout du pack au pool global (best effort, async).
    if (info.authId) {
      void addToWonderPickPool(this.room, {
        gameId: this.gameId,
        openerId: info.authId,
        openerUsername: info.name,
        packType: packTypeId ?? null,
        cards: cardIds,
      }).catch(() => {});
    }
  }

  private drawOnePieceCard(
    pool: OnePieceCardData[],
    slotKind: SlotKind,
  ): OnePieceCardData {
    const weights =
      slotKind === "rare"
        ? OP_RARE_SLOT_WEIGHTS
        : slotKind === "regular-high"
          ? OP_REGULAR_HIGH_WEIGHTS
          : slotKind === "regular-upper"
            ? OP_REGULAR_UPPER_WEIGHTS
            : slotKind === "regular-mid"
              ? OP_REGULAR_MID_WEIGHTS
              : OP_REGULAR_CORE_WEIGHTS;
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    let chosen: OnePieceRarity = "c";
    for (const [tier, w] of Object.entries(weights) as [
      OnePieceRarity,
      number,
    ][]) {
      if (r < w) {
        chosen = tier;
        break;
      }
      r -= w;
    }
    // Fallback : du plus rare au plus commun.
    const fullOrder: OnePieceRarity[] = [
      "tr",
      "sec",
      "sp",
      "l",
      "sr",
      "r",
      "uc",
      "c",
      "p",
      "don",
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

  private drawRuneterraCard(
    pool: RuneterraCardData[],
    slotKind: SlotKind,
  ): RuneterraCardData {
    const weights =
      slotKind === "rare"
        ? LOR_RARE_SLOT_WEIGHTS
        : slotKind === "regular-high"
          ? LOR_REGULAR_HIGH_WEIGHTS
          : slotKind === "regular-upper"
            ? LOR_REGULAR_UPPER_WEIGHTS
            : slotKind === "regular-mid"
              ? LOR_REGULAR_MID_WEIGHTS
              : LOR_REGULAR_CORE_WEIGHTS;
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    let chosen: RuneterraRarity = "Common";
    for (const [tier, w] of Object.entries(weights) as [
      RuneterraRarity,
      number,
    ][]) {
      if (r < w) {
        chosen = tier;
        break;
      }
      r -= w;
    }
    // Fallback : du plus rare au plus commun.
    const fullOrder: RuneterraRarity[] = [
      "Champion",
      "Epic",
      "Rare",
      "Common",
      "None",
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

  private drawCard(
    pool: PokemonCardData[],
    slotKind: SlotKind,
  ): PokemonCardData {
    const weights =
      slotKind === "rare"
        ? RARE_SLOT_WEIGHTS
        : slotKind === "regular-high"
          ? REGULAR_HIGH_WEIGHTS
          : slotKind === "regular-upper"
            ? REGULAR_UPPER_WEIGHTS
            : slotKind === "regular-mid"
              ? REGULAR_MID_WEIGHTS
              : REGULAR_CORE_WEIGHTS;
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
