"use client";

// Procedural visuals for cosmetics : card backs (sleeves), coins,
// playmats. 100% SVG/CSS, pas d'assets externes — règle design du site.
// Utilisé dans la shop ET en combat pour avoir une preview cohérente.

import type { ReactNode } from "react";

// ─── Helpers SVG ──────────────────────────────────────────────────────

/** Poké Ball classique : moitié haute rouge, moitié basse blanche, ligne
 *  noire au centre + bouton blanc-noir. Param `colorTop` pour customiser
 *  (Master Ball = violet, Hyper Ball = noir, etc.). */
function PokeBallIcon({
  size = 64,
  colorTop = "#dc2626",
  colorBottom = "#ffffff",
  rim = "#0f172a",
  letter,
}: {
  size?: number;
  colorTop?: string;
  colorBottom?: string;
  rim?: string;
  /** Optional letter inside the top half (M for Masterball, H for Hyperball). */
  letter?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={`top-${letter ?? colorTop}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lighten(colorTop, 0.3)} />
          <stop offset="100%" stopColor={colorTop} />
        </linearGradient>
        <linearGradient id={`bottom-${letter ?? colorBottom}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colorBottom} />
          <stop offset="100%" stopColor={darken(colorBottom, 0.15)} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill={colorBottom} stroke={rim} strokeWidth="3" />
      <path
        d="M 4 50 a 46 46 0 0 1 92 0 z"
        fill={`url(#top-${letter ?? colorTop})`}
        stroke={rim}
        strokeWidth="3"
      />
      <path
        d="M 4 50 a 46 46 0 0 0 92 0"
        fill={`url(#bottom-${letter ?? colorBottom})`}
      />
      <line x1="4" y1="50" x2="96" y2="50" stroke={rim} strokeWidth="4" />
      <circle cx="50" cy="50" r="13" fill="#f3f4f6" stroke={rim} strokeWidth="3" />
      <circle cx="50" cy="50" r="6" fill="#f3f4f6" stroke={rim} strokeWidth="2" />
      {/* Specular highlight pour la 3D feel */}
      <ellipse cx="35" cy="22" rx="10" ry="5" fill="rgba(255,255,255,0.55)" />
      {letter && (
        <text
          x="50"
          y="32"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui"
          fontSize="14"
          fontWeight="900"
          fill="#fff"
        >
          {letter}
        </text>
      )}
    </svg>
  );
}

/** Variante Master Ball : motif "M" + gros points roses caractéristiques. */
function MasterBallIcon({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
      <defs>
        <linearGradient id="master-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#6b21a8" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="#f8fafc" stroke="#0f172a" strokeWidth="3" />
      <path
        d="M 4 50 a 46 46 0 0 1 92 0 z"
        fill="url(#master-top)"
        stroke="#0f172a"
        strokeWidth="3"
      />
      <line x1="4" y1="50" x2="96" y2="50" stroke="#0f172a" strokeWidth="4" />
      {/* Le "M" caractéristique */}
      <text
        x="50"
        y="35"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui"
        fontSize="18"
        fontWeight="900"
        fill="#fff"
      >
        M
      </text>
      {/* Les 2 points roses */}
      <circle cx="32" cy="30" r="4" fill="#ec4899" stroke="#fff" strokeWidth="1" />
      <circle cx="68" cy="30" r="4" fill="#ec4899" stroke="#fff" strokeWidth="1" />
      {/* Bouton central */}
      <circle cx="50" cy="50" r="13" fill="#f3f4f6" stroke="#0f172a" strokeWidth="3" />
      <circle cx="50" cy="50" r="6" fill="#f3f4f6" stroke="#0f172a" strokeWidth="2" />
      {/* Specular */}
      <ellipse cx="35" cy="22" rx="10" ry="5" fill="rgba(255,255,255,0.55)" />
    </svg>
  );
}

/** Éclair stylisé (pour Pikachu / type Élec). */
function LightningIcon({ size = 64, color = "#fbbf24", stroke = "#7c2d12" }: {
  size?: number;
  color?: string;
  stroke?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
      <path
        d="M 55 8 L 22 52 L 42 52 L 35 92 L 75 42 L 55 42 Z"
        fill={color}
        stroke={stroke}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Symbole de type Pokémon — utilisé pour les sleeves typés. */
function TypeSymbol({ type, size = 64 }: { type: string; size?: number }) {
  switch (type) {
    case "fire":
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
          <path
            d="M 50 10 C 45 25 30 35 30 55 C 30 75 40 90 50 90 C 60 90 70 75 70 55 C 70 50 65 45 60 50 C 60 35 55 25 50 10 Z"
            fill="#f97316"
            stroke="#7c2d12"
            strokeWidth="3"
          />
          <path
            d="M 50 35 C 47 45 42 50 42 60 C 42 72 46 80 50 80 C 54 80 58 72 58 60 C 58 55 54 50 50 50 Z"
            fill="#fde68a"
          />
        </svg>
      );
    case "water":
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
          <path
            d="M 50 8 C 35 32 22 50 22 65 C 22 80 35 92 50 92 C 65 92 78 80 78 65 C 78 50 65 32 50 8 Z"
            fill="#0ea5e9"
            stroke="#0c4a6e"
            strokeWidth="3"
          />
          <ellipse cx="40" cy="55" rx="6" ry="10" fill="rgba(255,255,255,0.6)" />
        </svg>
      );
    case "grass":
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
          <ellipse cx="50" cy="50" rx="25" ry="40" fill="#16a34a" stroke="#14532d" strokeWidth="3" transform="rotate(-25 50 50)" />
          <ellipse cx="50" cy="50" rx="25" ry="40" fill="#22c55e" stroke="#14532d" strokeWidth="3" transform="rotate(25 50 50)" />
          <line x1="50" y1="50" x2="50" y2="92" stroke="#14532d" strokeWidth="3" />
        </svg>
      );
    case "lightning":
      return <LightningIcon size={size} />;
    case "psychic":
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
          <circle cx="50" cy="50" r="30" fill="#a855f7" stroke="#581c87" strokeWidth="3" />
          <circle cx="50" cy="35" r="6" fill="#fff" />
          <circle cx="50" cy="35" r="3" fill="#000" />
          <ellipse cx="50" cy="65" rx="15" ry="8" fill="rgba(255,255,255,0.4)" />
        </svg>
      );
    case "darkness":
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
          <circle cx="50" cy="50" r="35" fill="#18181b" stroke="#52525b" strokeWidth="3" />
          <path d="M 50 22 L 55 42 L 75 50 L 55 58 L 50 78 L 45 58 L 25 50 L 45 42 Z" fill="#a855f7" opacity="0.6" />
        </svg>
      );
    default:
      return <PokeBallIcon size={size} />;
  }
}

// ─── 1. CardBack (sleeve preview) ─────────────────────────────────────

const SLEEVE_BUILDERS: Record<
  string,
  (size: number) => { gradient: string; icon: ReactNode; ringColor: string }
> = {
  default: (s) => ({
    gradient: "from-rose-600 via-rose-500 to-rose-700",
    icon: <PokeBallIcon size={s} />,
    ringColor: "ring-amber-300/60",
  }),
  "sleeve-fire": (s) => ({
    gradient: "from-orange-600 via-red-700 to-orange-900",
    icon: <TypeSymbol type="fire" size={s} />,
    ringColor: "ring-orange-300/70",
  }),
  "sleeve-water": (s) => ({
    gradient: "from-sky-600 via-blue-700 to-blue-900",
    icon: <TypeSymbol type="water" size={s} />,
    ringColor: "ring-sky-300/70",
  }),
  "sleeve-grass": (s) => ({
    gradient: "from-emerald-600 via-green-700 to-emerald-900",
    icon: <TypeSymbol type="grass" size={s} />,
    ringColor: "ring-emerald-300/70",
  }),
  "sleeve-lightning": (s) => ({
    gradient: "from-yellow-400 via-amber-500 to-yellow-700",
    icon: <TypeSymbol type="lightning" size={s} />,
    ringColor: "ring-yellow-300/80",
  }),
  "sleeve-psychic": (s) => ({
    gradient: "from-violet-600 via-purple-700 to-violet-900",
    icon: <TypeSymbol type="psychic" size={s} />,
    ringColor: "ring-fuchsia-300/70",
  }),
  "sleeve-darkness": (s) => ({
    gradient: "from-zinc-700 via-slate-800 to-black",
    icon: <TypeSymbol type="darkness" size={s} />,
    ringColor: "ring-zinc-400/40",
  }),
  "sleeve-pokeball": (s) => ({
    gradient: "from-rose-500 via-zinc-100 to-rose-600",
    icon: <PokeBallIcon size={s} />,
    ringColor: "ring-rose-300/70",
  }),
  "sleeve-master-ball": (s) => ({
    gradient: "from-fuchsia-600 via-purple-700 to-violet-900",
    icon: <MasterBallIcon size={s} />,
    ringColor: "ring-fuchsia-300/80",
  }),
  "sleeve-shiny-charizard": (s) => ({
    gradient: "from-zinc-900 via-amber-800 to-zinc-950",
    icon: (
      <svg width={s} height={s} viewBox="0 0 100 100" style={{ display: "block" }}>
        {/* Silhouette de Dracaufeu stylisée + flammes en arrière-plan */}
        <path
          d="M 30 80 Q 25 65 30 50 Q 35 35 50 30 Q 65 35 70 50 Q 75 65 70 80"
          fill="#fbbf24"
          stroke="#0f172a"
          strokeWidth="2"
        />
        <path d="M 50 30 L 45 22 L 55 22 Z" fill="#92400e" stroke="#0f172a" strokeWidth="1" />
        <path d="M 30 80 L 20 92 L 35 88 Z" fill="#92400e" />
        <path d="M 70 80 L 80 92 L 65 88 Z" fill="#92400e" />
        {/* Flamme queue */}
        <path d="M 70 75 Q 88 72 90 60 Q 87 70 78 75" fill="#f97316" />
        <circle cx="42" cy="50" r="3" fill="#0f172a" />
        <circle cx="58" cy="50" r="3" fill="#0f172a" />
      </svg>
    ),
    ringColor: "ring-amber-400/80",
  }),
  "sleeve-mewtwo-ex": (s) => ({
    gradient: "from-purple-700 via-fuchsia-800 to-indigo-950",
    icon: (
      <svg width={s} height={s} viewBox="0 0 100 100" style={{ display: "block" }}>
        {/* ADN double hélice */}
        <path
          d="M 30 15 Q 50 30 70 45 Q 50 60 30 75"
          fill="none"
          stroke="#fde047"
          strokeWidth="3"
        />
        <path
          d="M 70 15 Q 50 30 30 45 Q 50 60 70 75"
          fill="none"
          stroke="#fde047"
          strokeWidth="3"
        />
        {/* Liens */}
        {[20, 35, 50, 65, 80].map((y, i) => (
          <line key={i} x1="30" y1={y} x2="70" y2={y} stroke="#a855f7" strokeWidth="1.5" />
        ))}
        {/* Atomes */}
        {[
          [50, 30],
          [50, 60],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill="#fbcfe8" />
        ))}
      </svg>
    ),
    ringColor: "ring-fuchsia-300/80",
  }),
  "sleeve-rainbow": (s) => ({
    gradient: "from-rose-500 via-amber-400 to-violet-600",
    icon: (
      <svg width={s} height={s} viewBox="0 0 100 100" style={{ display: "block" }}>
        {/* Arc-en-ciel */}
        {[
          { r: 38, color: "#dc2626" },
          { r: 32, color: "#f97316" },
          { r: 26, color: "#fbbf24" },
          { r: 20, color: "#16a34a" },
          { r: 14, color: "#0ea5e9" },
          { r: 8, color: "#a855f7" },
        ].map(({ r, color }, i) => (
          <path
            key={i}
            d={`M ${50 - r} 80 a ${r} ${r} 0 0 1 ${r * 2} 0`}
            fill="none"
            stroke={color}
            strokeWidth="6"
          />
        ))}
        {/* Étoiles */}
        <text x="20" y="30" fontSize="14" fill="#fde047">✦</text>
        <text x="75" y="35" fontSize="12" fill="#fde047">✦</text>
        <text x="50" y="20" fontSize="10" fill="#fde047">✦</text>
      </svg>
    ),
    ringColor: "ring-fuchsia-300/80",
  }),
};

/** Carte verso d'une carte Pokémon — utilisé pour le shop ET pour la
 *  main de l'adversaire en combat. Procédural : gradient + icône SVG
 *  centrée + bordure dorée + texture. */
export function CardBack({
  sleeveId,
  size = "md",
}: {
  sleeveId: string;
  size?: "sm" | "md" | "lg";
}) {
  const builder = SLEEVE_BUILDERS[sleeveId] ?? SLEEVE_BUILDERS.default;
  const dim =
    size === "sm"
      ? { w: "w-12", h: "h-16", icon: 32 }
      : size === "lg"
        ? { w: "w-32", h: "h-44", icon: 88 }
        : { w: "w-20", h: "h-28", icon: 56 };
  const { gradient, icon, ringColor } = builder(dim.icon);
  return (
    <div
      className={`relative ${dim.w} ${dim.h} overflow-hidden rounded-[10%] bg-gradient-to-br ${gradient} shadow-[inset_0_2px_8px_rgba(0,0,0,0.4),inset_0_-2px_6px_rgba(255,255,255,0.1)]`}
    >
      {/* Bordure dorée intérieure */}
      <div
        className={`absolute inset-1 rounded-[8%] border-2 border-amber-300/60 ring-1 ${ringColor}`}
      />
      {/* Pattern subtil : losanges */}
      <svg
        className="absolute inset-0 h-full w-full opacity-15"
        viewBox="0 0 80 100"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id={`pat-${sleeveId}`} x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
            <path d="M 7 0 L 14 7 L 7 14 L 0 7 Z" fill="none" stroke="#fff" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="80" height="100" fill={`url(#pat-${sleeveId})`} />
      </svg>
      {/* Icône centrale */}
      <div className="absolute inset-0 flex items-center justify-center drop-shadow-md">
        {icon}
      </div>
      {/* Reflets d'angle */}
      <div className="pointer-events-none absolute -left-4 -top-4 h-12 w-12 rotate-45 bg-white/10 blur-md" />
    </div>
  );
}

// ─── 2. CoinFace (heads / tails) ──────────────────────────────────────

type CoinDesign = {
  rim: string; // CSS class outer ring
  bodyTop: string; // gradient front face
  bodyBottom: string; // gradient back face
  iconHeads: ReactNode; // icon for heads side
  iconTails: ReactNode; // icon for tails side
};

const COIN_DESIGNS: Record<string, (iconSize: number) => CoinDesign> = {
  default: (s) => ({
    rim: "ring-amber-200",
    bodyTop: "from-amber-300 via-amber-400 to-amber-600",
    bodyBottom: "from-zinc-200 via-zinc-300 to-zinc-500",
    iconHeads: <PokeBallIcon size={s} colorTop="#dc2626" />,
    iconTails: (
      <span className="text-3xl font-black text-zinc-800">★</span>
    ),
  }),
  superball: (s) => ({
    rim: "ring-sky-300",
    bodyTop: "from-sky-300 via-blue-500 to-blue-700",
    bodyBottom: "from-zinc-100 via-zinc-300 to-zinc-500",
    iconHeads: <PokeBallIcon size={s} colorTop="#0ea5e9" />,
    iconTails: <span className="text-3xl font-black text-blue-700">S</span>,
  }),
  hyperball: (s) => ({
    rim: "ring-yellow-300",
    bodyTop: "from-yellow-400 via-amber-500 to-zinc-900",
    bodyBottom: "from-zinc-700 via-zinc-800 to-black",
    iconHeads: (
      <PokeBallIcon size={s} colorTop="#0f0f0f" colorBottom="#fbbf24" letter="H" />
    ),
    iconTails: <span className="text-3xl font-black text-yellow-300">H</span>,
  }),
  "master-ball": (s) => ({
    rim: "ring-fuchsia-300",
    bodyTop: "from-fuchsia-400 via-purple-600 to-violet-900",
    bodyBottom: "from-amber-200 via-amber-400 to-amber-700",
    iconHeads: <MasterBallIcon size={s} />,
    iconTails: <span className="text-4xl font-black text-amber-200">M</span>,
  }),
  pikachu: (s) => ({
    rim: "ring-yellow-300",
    bodyTop: "from-yellow-300 via-amber-400 to-yellow-600",
    bodyBottom: "from-amber-100 via-yellow-200 to-amber-400",
    iconHeads: <LightningIcon size={s} />,
    iconTails: <PokeBallIcon size={s} colorTop="#fbbf24" />,
  }),
  charizard: (s) => ({
    rim: "ring-orange-300",
    bodyTop: "from-orange-500 via-red-600 to-orange-800",
    bodyBottom: "from-amber-300 via-orange-400 to-red-500",
    iconHeads: <TypeSymbol type="fire" size={s} />,
    iconTails: <span className="text-3xl">🐉</span>,
  }),
  mewtwo: (s) => ({
    rim: "ring-fuchsia-300",
    bodyTop: "from-violet-400 via-purple-600 to-violet-900",
    bodyBottom: "from-fuchsia-300 via-purple-400 to-violet-700",
    iconHeads: <TypeSymbol type="psychic" size={s} />,
    iconTails: <span className="text-3xl font-black text-fuchsia-100">M2</span>,
  }),
  mew: (s) => ({
    rim: "ring-pink-300",
    bodyTop: "from-pink-300 via-pink-400 to-rose-600",
    bodyBottom: "from-rose-200 via-pink-300 to-pink-500",
    iconHeads: (
      <svg width={s} height={s} viewBox="0 0 100 100" style={{ display: "block" }}>
        {/* Mew silhouette stylisée — corps + queue ondulante */}
        <ellipse cx="50" cy="55" rx="22" ry="18" fill="#fbcfe8" stroke="#831843" strokeWidth="2" />
        <ellipse cx="42" cy="50" rx="3" ry="4" fill="#831843" />
        <ellipse cx="58" cy="50" rx="3" ry="4" fill="#831843" />
        <path d="M 48 60 Q 50 64 52 60" fill="none" stroke="#831843" strokeWidth="1.5" />
        {/* Oreilles pointues */}
        <polygon points="35,38 38,28 42,38" fill="#fbcfe8" stroke="#831843" strokeWidth="1.5" />
        <polygon points="65,38 62,28 58,38" fill="#fbcfe8" stroke="#831843" strokeWidth="1.5" />
        {/* Queue */}
        <path d="M 70 60 Q 85 60 85 75 Q 85 88 75 85" fill="none" stroke="#831843" strokeWidth="2.5" />
      </svg>
    ),
    iconTails: <span className="text-3xl">✨</span>,
  }),
  "shiny-gold": (s) => ({
    rim: "ring-amber-200",
    bodyTop: "from-yellow-200 via-amber-400 to-amber-700",
    bodyBottom: "from-amber-100 via-yellow-300 to-yellow-600",
    iconHeads: (
      <svg width={s} height={s} viewBox="0 0 100 100" style={{ display: "block" }}>
        {/* Diamant facetté or */}
        <polygon
          points="50,15 75,40 50,90 25,40"
          fill="url(#diamond-grad)"
          stroke="#92400e"
          strokeWidth="2"
        />
        <defs>
          <linearGradient id="diamond-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#92400e" />
          </linearGradient>
        </defs>
        {/* Facettes */}
        <polygon points="50,15 38,40 50,40" fill="rgba(255,255,255,0.4)" />
        <polygon points="50,15 62,40 50,40" fill="rgba(255,255,255,0.2)" />
        <line x1="25" y1="40" x2="75" y2="40" stroke="#92400e" strokeWidth="1.5" />
      </svg>
    ),
    iconTails: <span className="text-4xl font-black text-amber-900">$</span>,
  }),
};

/** Pièce de pile-ou-face — utilisée dans le shop (preview heads+tails)
 *  et dans le CoinFlipOverlay du combat. Procédural : disque circulaire
 *  avec dégradé métallique, gravure centrale, reflets. */
export function CoinFace({
  coinId,
  side = "heads",
  size = "md",
}: {
  coinId: string;
  side?: "heads" | "tails";
  size?: "sm" | "md" | "lg";
}) {
  const design =
    (COIN_DESIGNS[coinId] ?? COIN_DESIGNS.default)(
      size === "sm" ? 24 : size === "lg" ? 80 : 48,
    );
  const dim =
    size === "sm"
      ? "h-12 w-12"
      : size === "lg"
        ? "h-32 w-32"
        : "h-20 w-20";
  const gradient = side === "heads" ? design.bodyTop : design.bodyBottom;
  const icon = side === "heads" ? design.iconHeads : design.iconTails;
  return (
    <div
      className={`relative ${dim} rounded-full bg-gradient-to-br ${gradient} shadow-[0_4px_12px_rgba(0,0,0,0.4)] ring-4 ${design.rim}/80`}
    >
      {/* Outer rim relief */}
      <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-inset ring-amber-100/40" />
      {/* Inner edge ridge */}
      <div className="pointer-events-none absolute inset-2 rounded-full border border-black/20 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_-1px_2px_rgba(255,255,255,0.4)]" />
      {/* Specular highlight */}
      <div className="pointer-events-none absolute left-2 top-2 h-1/3 w-1/3 rounded-full bg-white/30 blur-md" />
      {/* Engraved icon */}
      <div className="absolute inset-0 flex items-center justify-center drop-shadow-[0_2px_2px_rgba(0,0,0,0.4)]">
        {icon}
      </div>
    </div>
  );
}

// ─── 3. PlaymatPreview (mini scenic preview) ──────────────────────────

const PLAYMAT_DESIGNS: Record<string, () => ReactNode> = {
  default: () => (
    // Bourg Palette : ciel bleu, herbe verte, maison
    <svg viewBox="0 0 200 100" className="h-full w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sky-default" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#bae6fd" />
        </linearGradient>
        <linearGradient id="grass-default" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="200" height="60" fill="url(#sky-default)" />
      <rect x="0" y="60" width="200" height="40" fill="url(#grass-default)" />
      <circle cx="40" cy="22" r="10" fill="#fef3c7" />
      {/* Maison */}
      <rect x="80" y="50" width="40" height="22" fill="#dc2626" />
      <polygon points="80,50 100,35 120,50" fill="#7f1d1d" />
      <rect x="92" y="58" width="8" height="14" fill="#451a03" />
      <rect x="105" y="55" width="8" height="6" fill="#7dd3fc" />
      {/* Arbres */}
      <circle cx="170" cy="55" r="10" fill="#16a34a" />
      <rect x="168" y="60" width="4" height="10" fill="#78350f" />
    </svg>
  ),
  "foret-jade": () => (
    <svg viewBox="0 0 200 100" className="h-full w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sky-foret" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#365314" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="200" height="100" fill="url(#sky-foret)" />
      {/* Plusieurs arbres */}
      {[20, 50, 90, 130, 175].map((x, i) => (
        <g key={i}>
          <polygon
            points={`${x - 12},85 ${x + 12},85 ${x},20`}
            fill="#14532d"
            opacity="0.85"
          />
          <rect x={x - 2} y="80" width="4" height="15" fill="#451a03" />
        </g>
      ))}
      {/* Lucioles */}
      <circle cx="60" cy="30" r="2" fill="#fde047" opacity="0.7" />
      <circle cx="120" cy="50" r="1.5" fill="#fde047" opacity="0.7" />
      <circle cx="160" cy="35" r="2" fill="#fde047" opacity="0.7" />
    </svg>
  ),
  "mont-selenite": () => (
    <svg viewBox="0 0 200 100" className="h-full w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sky-mont" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#312e81" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="200" height="100" fill="url(#sky-mont)" />
      {/* Lune */}
      <circle cx="160" cy="25" r="14" fill="#fde68a" />
      <circle cx="156" cy="22" r="3" fill="#92400e" opacity="0.4" />
      <circle cx="165" cy="28" r="2.5" fill="#92400e" opacity="0.4" />
      {/* Étoiles */}
      {[
        [25, 15], [50, 30], [75, 18], [100, 35], [120, 12], [180, 50],
      ].map(([x, y], i) => (
        <text
          key={i}
          x={x}
          y={y}
          fill="#fef3c7"
          fontSize="6"
          textAnchor="middle"
        >
          ✦
        </text>
      ))}
      {/* Montagnes */}
      <polygon points="0,100 50,55 100,75 150,45 200,80 200,100" fill="#0f172a" />
    </svg>
  ),
  stade: () => (
    <svg viewBox="0 0 200 100" className="h-full w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sky-stade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0c4a6e" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="200" height="100" fill="url(#sky-stade)" />
      {/* Arène ellipse */}
      <ellipse cx="100" cy="60" rx="80" ry="25" fill="#3f6212" stroke="#fff" strokeWidth="2" />
      {/* Lignes terrain */}
      <line x1="100" y1="35" x2="100" y2="85" stroke="#fff" strokeWidth="1" />
      <ellipse cx="100" cy="60" rx="15" ry="6" fill="none" stroke="#fff" strokeWidth="1" />
      {/* Spotlights */}
      {[40, 100, 160].map((x, i) => (
        <g key={i}>
          <line x1={x} y1="0" x2={x - 15} y2="35" stroke="#fef3c7" strokeWidth="3" opacity="0.5" />
          <circle cx={x} cy="5" r="3" fill="#fde68a" />
        </g>
      ))}
    </svg>
  ),
  cinabre: () => (
    <svg viewBox="0 0 200 100" className="h-full w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sky-cinabre" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7f1d1d" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
        <linearGradient id="lava" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="200" height="100" fill="url(#sky-cinabre)" />
      {/* Volcan */}
      <polygon points="50,100 100,30 150,100" fill="#171717" />
      <polygon points="85,55 100,30 115,55 100,40" fill="url(#lava)" />
      {/* Coulées de lave */}
      <path d="M 100 35 L 95 55 L 90 75 L 100 100" stroke="#f97316" strokeWidth="2" fill="none" />
      <path d="M 105 45 L 110 65 L 108 100" stroke="#fbbf24" strokeWidth="1.5" fill="none" />
      {/* Particules */}
      {[60, 120, 140].map((x, i) => (
        <circle key={i} cx={x} cy={20 + i * 10} r="1.5" fill="#fbbf24" opacity="0.8" />
      ))}
    </svg>
  ),
  "spiral-mewtwo": () => (
    <svg viewBox="0 0 200 100" className="h-full w-full" preserveAspectRatio="none">
      <defs>
        <radialGradient id="psy-bg" cx="0.5" cy="0.5" r="0.7">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="200" height="100" fill="url(#psy-bg)" />
      {/* Spirale */}
      <path
        d="M 100 50 m -30 0 a 30 30 0 1 0 60 0 a 30 30 0 1 0 -60 0 m 5 0 a 25 25 0 1 1 50 0 m -5 0 a 20 20 0 1 0 -40 0 m 5 0 a 15 15 0 1 1 30 0 m -5 0 a 10 10 0 1 0 -20 0"
        fill="none"
        stroke="#fde047"
        strokeWidth="2"
        opacity="0.9"
      />
      {/* Particules ADN */}
      {[30, 60, 140, 170].map((x, i) => (
        <circle
          key={i}
          cx={x}
          cy={50 + Math.sin(i) * 15}
          r="2"
          fill="#fbcfe8"
          opacity="0.6"
        />
      ))}
    </svg>
  ),
};

/** Mini-aperçu d'un playmat — petit paysage SVG procédural. Utilisé
 *  uniquement dans le shop pour preview ; en combat le playmat est un
 *  background gradient plein écran. */
export function PlaymatPreview({
  playmatId,
  className = "",
}: {
  playmatId: string;
  className?: string;
}) {
  const builder = PLAYMAT_DESIGNS[playmatId] ?? PLAYMAT_DESIGNS.default;
  return (
    <div
      className={`overflow-hidden rounded-md border border-white/10 ${className}`}
    >
      {builder()}
    </div>
  );
}

// ─── Color helpers ────────────────────────────────────────────────────

function lighten(hex: string, amount: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  return rgbToHex(
    Math.min(255, c.r + Math.round((255 - c.r) * amount)),
    Math.min(255, c.g + Math.round((255 - c.g) * amount)),
    Math.min(255, c.b + Math.round((255 - c.b) * amount)),
  );
}
function darken(hex: string, amount: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  return rgbToHex(
    Math.max(0, c.r - Math.round(c.r * amount)),
    Math.max(0, c.g - Math.round(c.g * amount)),
    Math.max(0, c.b - Math.round(c.b * amount)),
  );
}
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
