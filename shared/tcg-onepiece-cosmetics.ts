// Catalogue des cosmétiques achetables pour One Piece TCG.
//
// Trois catégories :
//   • avatar  : portrait du joueur (utilise une image de Leader OnePiece)
//   • sleeve  : style des dos de carte affiché sur le terrain (couleur)
//   • playmat : background du combat
//
// Chaque cosmétique a un id, un nom FR, un prix en Or Suprême, un emoji
// d'aperçu, et éventuellement un cardId (pour les avatars Leader). Le
// cosmetic_id "default" est gratuit et toujours équipable (cf. RPC
// equip_tcg_cosmetic).

// Catalogue commun à tous les TCG. "coin" est utilisé seulement par
// Pokemon (pile/face) mais on l'inclut ici pour ne pas dupliquer le type.
export type CosmeticType = "avatar" | "sleeve" | "playmat" | "coin";

export type CosmeticItem = {
  id: string;
  type: CosmeticType;
  name: string;
  description: string;
  emoji: string;
  price: number; // Or Suprême
  // Pour les avatars : référence à un cardId Leader pour l'image.
  leaderCardId?: string;
  // Pour les sleeves : couleur de bordure dos de carte (Tailwind class).
  sleeveColor?: string;
  // Pour les playmats : id de fond appliqué au combat.
  playmatId?: string;
  // Pour les coins (Pokemon uniquement) : id de pièce affichée au coin
  // flip (cf. COIN_DESIGNS dans cosmetic-visuals.tsx).
  coinId?: string;
};

export const ONEPIECE_COSMETICS: CosmeticItem[] = [
  // ─── Sleeves (dos de carte stylés) ─────────────────────────────────
  {
    id: "default",
    type: "sleeve",
    name: "Dos classique",
    description: "Le dos noir et rose par défaut.",
    emoji: "🃏",
    price: 0,
    sleeveColor: "from-rose-900 via-rose-800 to-rose-950",
  },
  {
    id: "sleeve-jolly-roger",
    type: "sleeve",
    name: "Joly Roger",
    description: "Dos noir et or avec drapeau pirate.",
    emoji: "🏴‍☠️",
    price: 5_000,
    sleeveColor: "from-zinc-900 via-amber-900/40 to-zinc-950",
  },
  {
    id: "sleeve-grand-line",
    type: "sleeve",
    name: "Grand Line",
    description: "Dos océan profond bleu/cyan.",
    emoji: "🌊",
    price: 5_000,
    sleeveColor: "from-blue-900 via-cyan-800 to-blue-950",
  },
  {
    id: "sleeve-akagami",
    type: "sleeve",
    name: "Cheveux Roux",
    description: "Hommage à Shanks — rouge feu.",
    emoji: "🔥",
    price: 8_000,
    sleeveColor: "from-rose-700 via-red-900 to-rose-950",
  },
  {
    id: "sleeve-treasure",
    type: "sleeve",
    name: "Or de l'île au trésor",
    description: "Doré scintillant — pour les pirates accomplis.",
    emoji: "💰",
    price: 12_000,
    sleeveColor: "from-amber-500 via-yellow-700 to-amber-900",
  },

  // ─── Playmats (backgrounds du combat) ──────────────────────────────
  {
    id: "default",
    type: "playmat",
    name: "Pont du Going Merry",
    description: "Le playmat par défaut, vagues + boussole.",
    emoji: "⛵",
    price: 0,
    playmatId: "default",
  },
  {
    id: "playmat-wano",
    type: "playmat",
    name: "Pays de Wano",
    description: "Lanternes japonaises et fleurs de cerisier.",
    emoji: "🏯",
    price: 8_000,
    playmatId: "wano",
  },
  {
    id: "playmat-marineford",
    type: "playmat",
    name: "Marineford",
    description: "Bastion de la Marine, fond bleu militaire.",
    emoji: "⚓",
    price: 10_000,
    playmatId: "marineford",
  },
  {
    id: "playmat-impel-down",
    type: "playmat",
    name: "Impel Down",
    description: "Prison sous-marine — aux pirates rebelles.",
    emoji: "🔒",
    price: 10_000,
    playmatId: "impel-down",
  },
  {
    id: "playmat-raftel",
    type: "playmat",
    name: "Raftel",
    description: "L'île de la fin du voyage. Pour les Rois.",
    emoji: "👑",
    price: 25_000,
    playmatId: "raftel",
  },

  // ─── Avatars (portraits Leader) ───────────────────────────────────
  // Le default = générique zinc.
  {
    id: "default",
    type: "avatar",
    name: "Avatar par défaut",
    description: "Portrait neutre.",
    emoji: "👤",
    price: 0,
  },
  {
    id: "avatar-shanks",
    type: "avatar",
    name: "Shanks",
    description: "Le Roux, Empereur des Pirates.",
    emoji: "🦸",
    price: 5_000,
    leaderCardId: "OP09-001",
  },
  {
    id: "avatar-luffy-st21",
    type: "avatar",
    name: "Monkey D. Luffy",
    description: "Gear 5 - Capitaine de l'équipage du Chapeau de paille.",
    emoji: "🌟",
    price: 5_000,
    leaderCardId: "ST21-001",
  },
  {
    id: "avatar-newgate",
    type: "avatar",
    name: "Edward Newgate",
    description: "Barbe Blanche, l'homme le plus fort.",
    emoji: "⚪",
    price: 5_000,
    leaderCardId: "ST15-002",
  },
  {
    id: "avatar-teach",
    type: "avatar",
    name: "Marshall D. Teach",
    description: "Barbe Noire — l'Empereur des ténèbres.",
    emoji: "🌑",
    price: 5_000,
    leaderCardId: "OP09-081",
  },
  {
    id: "avatar-katakuri",
    type: "avatar",
    name: "Charlotte Katakuri",
    description: "Bras droit de Big Mom — Bloqueur ultime.",
    emoji: "🍩",
    price: 5_000,
    leaderCardId: "ST20-001",
  },
  {
    id: "avatar-trafalgar-law",
    type: "avatar",
    name: "Trafalgar Law",
    description: "Chirurgien de la Mort — Sept Corsaires.",
    emoji: "💀",
    price: 5_000,
    leaderCardId: "ST17-001",
  },
  {
    id: "avatar-roger",
    type: "avatar",
    name: "Gol D. Roger",
    description: "Le Roi des Pirates en personne.",
    emoji: "🏴‍☠️",
    price: 25_000,
    leaderCardId: "OP09-118",
  },
];

export function getCosmeticsByType(type: CosmeticType): CosmeticItem[] {
  return ONEPIECE_COSMETICS.filter((c) => c.type === type);
}

export function getCosmeticById(
  type: CosmeticType,
  id: string,
): CosmeticItem | undefined {
  return ONEPIECE_COSMETICS.find((c) => c.type === type && c.id === id);
}
