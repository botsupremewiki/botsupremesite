import { PLAZA_CONFIG } from "@shared/types";
import type { Landmark, PortalStyle, SceneConfig } from "./scene";

const W = PLAZA_CONFIG.width;
const H = PLAZA_CONFIG.height;

// Distribute N positions evenly on an ellipse around (cx, cy). Index 0
// sits at the top, then clockwise.
function ringPositions(
  count: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    out.push({
      x: Math.round(cx + rx * Math.cos(angle)),
      y: Math.round(cy + ry * Math.sin(angle)),
    });
  }
  return out;
}

// ─── Plaza ─────────────────────────────────────────────────────────────────
// Player spawns at the center; the 5 portals form a ring around them.

const PLAZA_PORTALS: {
  id: string;
  color: number;
  label: string;
  href: string;
  style: PortalStyle;
}[] = [
  {
    id: "casino",
    color: 0xef4444,
    label: "Casino",
    href: "/play/casino",
    style: "casino",
  },
  {
    id: "tcg",
    color: 0x22c55e,
    label: "TCG",
    href: "/play/tcg",
    style: "tcg",
  },
  {
    id: "rpg",
    color: 0xf59e0b,
    label: "Eternum",
    href: "/play/rpg",
    style: "rpg",
  },
  {
    id: "medieval",
    color: 0x6366f1,
    label: "Imperium",
    href: "/play/imperium",
    style: "imperium",
  },
  {
    id: "tycoon",
    color: 0xec4899,
    label: "Skyline",
    href: "/play/skyline",
    style: "skyline",
  },
];
const PLAZA_RING = ringPositions(
  PLAZA_PORTALS.length,
  W / 2,
  H / 2,
  W * 0.36,
  H * 0.34,
);

export const PLAZA_SCENE: SceneConfig = {
  width: W,
  height: H,
  backgroundColor: 0x0b0b14,
  floorColor: 0x12121c,
  floorAccentColor: 0xffffff,
  floorAccentAlpha: 0.018,
  ambiance: "plaza",
  landmarks: PLAZA_PORTALS.map<Landmark>((p, i) => ({
    kind: "portal",
    id: p.id,
    x: PLAZA_RING[i].x,
    y: PLAZA_RING[i].y,
    color: p.color,
    label: p.label,
    href: p.href,
    style: p.style,
  })),
};

// ─── Casino ────────────────────────────────────────────────────────────────
// Back portal sits at the centre (player spawns on top of it). All
// playable tables ring the player so they're visible at a glance.

type CasinoTable = {
  id: string;
  label: string;
  feltColor: number;
  accentColor: number;
  width: number;
  height: number;
  seats: number;
  href?: string;
};

const CASINO_RING_TABLES: CasinoTable[] = [
  // Index 0 sits at the top of the ring, then clockwise.
  {
    id: "blackjack-1",
    label: "Blackjack",
    feltColor: 0x065f3e,
    accentColor: 0xeab308,
    width: 150,
    height: 100,
    seats: 5,
    href: "/play/casino/blackjack/t1",
  },
  {
    id: "hilo-1",
    label: "Hi-Lo",
    feltColor: 0x7c2d12,
    accentColor: 0xfbbf24,
    width: 110,
    height: 80,
    seats: 1,
    href: "/play/casino/hilo",
  },
  {
    id: "roulette-1",
    label: "Roulette",
    feltColor: 0x064e3b,
    accentColor: 0xef4444,
    width: 130,
    height: 95,
    seats: 6,
    href: "/play/casino/roulette/r1",
  },
  {
    id: "mines-1",
    label: "Mines",
    feltColor: 0x1e293b,
    accentColor: 0x10b981,
    width: 110,
    height: 80,
    seats: 1,
    href: "/play/casino/mines",
  },
  {
    id: "poker-1",
    label: "Poker",
    feltColor: 0x0c4a6e,
    accentColor: 0xf59e0b,
    width: 130,
    height: 95,
    seats: 6,
    href: "/play/casino/poker",
  },
  {
    id: "slots-inferno-galactique",
    label: "Inferno Galactique",
    feltColor: 0x3b0764,
    accentColor: 0xe879f9,
    width: 110,
    height: 80,
    seats: 1,
    href: "/play/casino/slots/inferno-galactique",
  },
  {
    id: "slots-foret-enchantee",
    label: "Forêt Enchantée",
    feltColor: 0x064e3b,
    accentColor: 0x34d399,
    width: 110,
    height: 80,
    seats: 1,
    href: "/play/casino/slots/foret-enchantee",
  },
  {
    id: "slots-pharaon-mystique",
    label: "Pharaon Mystique",
    feltColor: 0x44403c,
    accentColor: 0xeab308,
    width: 110,
    height: 80,
    seats: 1,
    href: "/play/casino/slots/pharaon-mystique",
  },
  {
    id: "slots-tresor-pirates",
    label: "Trésor des Pirates",
    feltColor: 0x431407,
    accentColor: 0xfb923c,
    width: 110,
    height: 80,
    seats: 1,
    href: "/play/casino/slots/tresor-pirates",
  },
  {
    id: "slots-verger-dore",
    label: "Verger Doré",
    feltColor: 0x422006,
    accentColor: 0xfbbf24,
    width: 110,
    height: 80,
    seats: 1,
    href: "/play/casino/slots/verger-dore",
  },
];

const CASINO_RING = ringPositions(
  CASINO_RING_TABLES.length,
  W / 2,
  H / 2,
  W * 0.38,
  H * 0.4,
);

export const CASINO_SCENE: SceneConfig = {
  width: W,
  height: H,
  backgroundColor: 0x150606,
  floorColor: 0x1f0a0a,
  floorAccentColor: 0xef4444,
  floorAccentAlpha: 0.05,
  ambiance: "casino",
  landmarks: [
    {
      kind: "portal",
      id: "back-to-plaza",
      x: W / 2,
      y: H / 2,
      color: 0x6366f1,
      label: "← Plaza",
      href: "/play",
      style: "back",
    },
    ...CASINO_RING_TABLES.map<Landmark>((t, i) => ({
      kind: "table",
      id: t.id,
      x: CASINO_RING[i].x,
      y: CASINO_RING[i].y,
      width: t.width,
      height: t.height,
      feltColor: t.feltColor,
      accentColor: t.accentColor,
      label: t.label,
      seats: t.seats,
      href: t.href,
    })),
  ],
};

const BJ_SEAT_Y = 480;
const BJ_SEAT_XS = [224, 368, 512, 656, 800];

export const BLACKJACK_SCENE: SceneConfig = {
  width: W,
  height: H,
  backgroundColor: 0x0a1410,
  floorColor: 0x0d1e15,
  floorAccentColor: 0x10b981,
  floorAccentAlpha: 0.04,
  ambiance: "casino",
  landmarks: [
    {
      kind: "portal",
      id: "back-to-casino",
      x: 80,
      y: 80,
      color: 0xef4444,
      label: "← Casino",
      href: "/play/casino",
      style: "back",
    },
    {
      kind: "table",
      id: "blackjack-felt",
      x: W / 2,
      y: 260,
      width: 640,
      height: 180,
      feltColor: 0x065f3e,
      accentColor: 0xeab308,
      label: "Blackjack · Dealer tire sur 16, reste sur 17",
      seats: 5,
    },
    ...BJ_SEAT_XS.map<Landmark>((x, i) => ({
      kind: "seat",
      id: `seat-${i}`,
      seatIndex: i,
      x,
      y: BJ_SEAT_Y,
    })),
  ],
};

