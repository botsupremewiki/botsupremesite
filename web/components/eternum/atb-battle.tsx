"use client";

// Composant ATB style Summoners War — Eternum.
// UI cosmétique : auras élément, cadres rareté, animations swing/hit,
// particules d'impact, couleurs par classe, background battlefield.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ETERNUM_CLASSES,
  ETERNUM_ELEMENTS,
  type EternumClassId,
  type EternumElementId,
} from "@shared/types";
import { elementTintFilter } from "@shared/eternum-familiers";
import {
  actionInfo,
  aliveEnemies,
  autoChooseAction,
  applyAction,
  initAtbState,
  predictNextActors,
  tickAtb,
  type AtbActionKind,
  type AtbState,
  type AtbUnit,
} from "@shared/eternum-combat-atb";
import type { CombatUnit } from "@shared/eternum-combat";

const TICK_MS = 100;

// ─────────────────────────────────────────────────────────────────────────
// HELPERS COSMÉTIQUES — auras, cadres, couleurs par classe / élément.
// ─────────────────────────────────────────────────────────────────────────

const ELEMENT_AURA: Record<EternumElementId, string> = {
  fire: "radial-gradient(circle, rgba(244,63,94,0.35) 0%, rgba(251,146,60,0.15) 40%, transparent 75%)",
  water: "radial-gradient(circle, rgba(14,165,233,0.35) 0%, rgba(56,189,248,0.15) 40%, transparent 75%)",
  wind: "radial-gradient(circle, rgba(52,211,153,0.35) 0%, rgba(163,230,53,0.15) 40%, transparent 75%)",
  earth: "radial-gradient(circle, rgba(180,83,9,0.35) 0%, rgba(120,113,108,0.15) 40%, transparent 75%)",
  light: "radial-gradient(circle, rgba(252,211,77,0.5) 0%, rgba(254,240,138,0.25) 40%, transparent 75%)",
  dark: "radial-gradient(circle, rgba(139,92,246,0.5) 0%, rgba(192,38,211,0.2) 40%, transparent 75%)",
};

const ELEMENT_PULSE_KEYFRAME: Record<EternumElementId, string> = {
  fire: "atb-aura-pulse-fire",
  water: "atb-aura-pulse-water",
  wind: "atb-aura-pulse-wind",
  earth: "atb-aura-pulse-earth",
  light: "atb-aura-pulse-light",
  dark: "atb-aura-pulse-dark",
};

type RarityKey = "common" | "rare" | "epic" | "legendary" | "prismatic";

const RARITY_FRAME: Record<RarityKey, string> = {
  common: "border border-zinc-500/40",
  rare:
    "border-2 border-emerald-400/60 shadow-[0_0_12px_rgba(52,211,153,0.25)]",
  epic:
    "border-2 border-sky-400/70 shadow-[0_0_18px_rgba(56,189,248,0.4)]",
  legendary:
    "border-2 border-amber-400/80 shadow-[0_0_24px_rgba(252,211,77,0.55)]",
  prismatic:
    "atb-prismatic-frame shadow-[0_0_28px_rgba(232,121,249,0.7)]",
};

const RARITY_BG: Record<RarityKey, string> = {
  common: "bg-zinc-900/60",
  rare: "bg-gradient-to-b from-emerald-950/60 to-zinc-900/60",
  epic: "bg-gradient-to-b from-sky-950/60 to-zinc-900/60",
  legendary: "bg-gradient-to-b from-amber-950/60 to-zinc-900/60",
  prismatic:
    "bg-gradient-to-b from-fuchsia-950/60 via-violet-950/40 to-zinc-900/60",
};

type ClassAccent = {
  glyph: string;        // glyph d'arme/symbole pour les boutons skills
  primary: string;      // classe Tailwind pour bouton ultime fond
  border: string;       // classe Tailwind pour bord
  text: string;         // classe Tailwind pour texte
};

const CLASS_ACCENT: Record<EternumClassId, ClassAccent> = {
  warrior: {
    glyph: "⚔️",
    primary: "from-rose-600/40 to-rose-800/40",
    border: "border-rose-400/60",
    text: "text-rose-200",
  },
  paladin: {
    glyph: "🛡️",
    primary: "from-amber-500/40 to-yellow-700/40",
    border: "border-amber-400/60",
    text: "text-amber-200",
  },
  assassin: {
    glyph: "🗡️",
    primary: "from-violet-700/40 to-purple-900/40",
    border: "border-violet-400/60",
    text: "text-violet-200",
  },
  mage: {
    glyph: "🔮",
    primary: "from-sky-600/40 to-indigo-800/40",
    border: "border-sky-400/60",
    text: "text-sky-200",
  },
  priest: {
    glyph: "✝️",
    primary: "from-yellow-200/40 to-amber-300/40",
    border: "border-yellow-200/60",
    text: "text-yellow-100",
  },
  vampire: {
    glyph: "🩸",
    primary: "from-red-700/40 to-zinc-900/40",
    border: "border-red-400/60",
    text: "text-red-200",
  },
};

function defaultRarityFor(unit: AtbUnit): RarityKey {
  // Heuristique sans assets : héros = légendaire, familier joueur = rare,
  // ennemi = commun. Override via prop `unitRarities`.
  if (unit.isHero) return "legendary";
  if (unit.team === "A") return "rare";
  return "common";
}

// ─────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────

export type AtbBattleRewards = {
  os?: number;
  xp?: number;
  resources?: string[];
  custom?: string;
};

export type AtbBattleProps = {
  teamA: CombatUnit[];
  teamB: CombatUnit[];
  forcedWinner?: "A" | "B";
  title?: string;
  rewards?: AtbBattleRewards;
  /** Map id → rareté pour stylet précisément les cadres. Fallback heuristique. */
  unitRarities?: Record<string, RarityKey>;
  /** Map id → glyph emoji custom (ex: glyph du familier au lieu du glyph classe).
   *  Permet d'avoir 90 sprites uniques par familier de base, tintés selon élément. */
  unitDisplayGlyphs?: Record<string, string>;
  /** Theme du décor : donjon (rouge sombre), tower (bleu cosmos),
   *  dream (violet onirique), pvp (neutre). Default neutral. */
  ambiance?: "neutral" | "dungeon" | "tower" | "dream" | "pvp" | "boss";
  onComplete: (result: { winner: "A" | "B" | "draw"; turns: number }) => void;
  closeLabel?: string;
};

const AMBIANCE_BG: Record<NonNullable<AtbBattleProps["ambiance"]>, string> = {
  neutral:
    "radial-gradient(ellipse at center, #1a1625 0%, #0a0a0f 70%)",
  dungeon:
    "radial-gradient(ellipse at center, #2a0e0e 0%, #0a0507 75%)",
  tower:
    "radial-gradient(ellipse at center, #0c1a3a 0%, #02040c 75%)",
  dream:
    "radial-gradient(ellipse at center, #1f0d3a 0%, #07020f 75%)",
  pvp:
    "radial-gradient(ellipse at center, #2a1a2a 0%, #0a050a 75%)",
  boss:
    "radial-gradient(ellipse at center, #3a0a18 0%, #0a0306 75%)",
};

// ─────────────────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────

type ImpactEvent = {
  id: number;
  actorId: string;
  targetId: string;
  isCrit: boolean;
  damage: number;
  particles: { emoji: string; dx: number; dy: number; rot: number }[];
};

export function AtbBattle({
  teamA,
  teamB,
  forcedWinner,
  title,
  rewards,
  unitRarities,
  unitDisplayGlyphs,
  ambiance = "neutral",
  onComplete,
  closeLabel = "Continuer →",
}: AtbBattleProps) {
  const [state, setState] = useState<AtbState>(() =>
    initAtbState(teamA, teamB, { forcedWinner }),
  );
  const [autoAll, setAutoAll] = useState(false);
  const [selectedAction, setSelectedAction] = useState<AtbActionKind | null>(null);
  const [picking, setPicking] = useState(false);
  const [impact, setImpact] = useState<ImpactEvent | null>(null);
  const completedRef = useRef(false);
  const lastLogIdxRef = useRef(0);

  // Tick loop
  useEffect(() => {
    if (state.status !== "running") return;
    if (state.awaitingAction !== null) return;
    const t = setTimeout(() => setState((s) => tickAtb(s)), TICK_MS);
    return () => clearTimeout(t);
  }, [state]);

  // Auto-all : IA joue à la place du joueur
  useEffect(() => {
    if (state.status !== "running") return;
    if (state.awaitingAction === null) return;
    if (!autoAll) return;
    const actor = state.units.find((u) => u.id === state.awaitingAction);
    if (!actor) return;
    const choice = autoChooseAction(state, actor);
    const t = setTimeout(() => {
      setState((s) => applyAction(s, choice));
      setSelectedAction(null);
      setPicking(false);
    }, 350);
    return () => clearTimeout(t);
  }, [state, autoAll]);

  // Détection d'attaque pour déclencher swing/hit + particules
  useEffect(() => {
    if (state.log.length === lastLogIdxRef.current) return;
    lastLogIdxRef.current = state.log.length;
    // Cherche le dernier log qui est une attaque (damage > 0).
    for (let i = state.log.length - 1; i >= 0; i--) {
      const l = state.log[i];
      if (typeof l.damage === "number" && l.damage > 0) {
        const actor = state.units.find((u) => u.name === l.actor);
        const target = state.units.find((u) => u.name === l.target);
        if (!actor || !target) break;
        const particles = Array.from({ length: l.isCrit ? 6 : 4 }, () => ({
          emoji: l.isCrit
            ? randomPick(["💥", "⚡", "✨"])
            : randomPick(["✨", "💢", "⚡", "💫"]),
          dx: -28 + Math.random() * 56,
          dy: -32 + Math.random() * 24,
          rot: -45 + Math.random() * 90,
        }));
        setImpact({
          id: Date.now() + Math.random(),
          actorId: actor.id,
          targetId: target.id,
          isCrit: !!l.isCrit,
          damage: l.damage,
          particles,
        });
        break;
      }
    }
  }, [state.log, state.units]);

  // Reset impact après animation
  useEffect(() => {
    if (!impact) return;
    const t = setTimeout(() => setImpact(null), 700);
    return () => clearTimeout(t);
  }, [impact]);

  // Notif fin de combat
  useEffect(() => {
    if (state.status === "running") return;
    if (completedRef.current) return;
    completedRef.current = true;
  }, [state]);

  function chooseAction(kind: AtbActionKind) {
    const actor = state.units.find((u) => u.id === state.awaitingAction);
    if (!actor) return;
    const info = actionInfo(actor, kind);
    if (!info.available) return;

    if (aliveEnemies(state, actor).length > 1) {
      setSelectedAction(kind);
      setPicking(true);
      return;
    }
    const enemy = aliveEnemies(state, actor)[0];
    setState((s) => applyAction(s, { kind, targetId: enemy?.id }));
    setSelectedAction(null);
    setPicking(false);
  }

  function pickTarget(targetId: string) {
    if (!selectedAction) return;
    setState((s) => applyAction(s, { kind: selectedAction, targetId }));
    setSelectedAction(null);
    setPicking(false);
  }

  function toggleUnitAuto(id: string) {
    setState((s) => ({
      ...s,
      units: s.units.map((u) =>
        u.id === id ? { ...u, isAuto: !u.isAuto } : u,
      ),
    }));
  }

  const teamAUnits = state.units.filter((u) => u.team === "A");
  const teamBUnits = state.units.filter((u) => u.team === "B");
  const awaiting = state.awaitingAction
    ? state.units.find((u) => u.id === state.awaitingAction) ?? null
    : null;
  const upcoming = predictNextActors(state, 5);

  const ended = state.status !== "running";
  const winner =
    state.status === "won-A" ? "A" : state.status === "won-B" ? "B" : "draw";

  return (
    <div
      className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border-2 border-amber-400/40 shadow-2xl shadow-amber-500/20"
      style={{ background: AMBIANCE_BG[ambiance] }}
    >
      <AtbStyles />

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-black/40 px-4 py-3 backdrop-blur-sm">
        <div>
          <div className="text-base font-bold text-amber-200">
            {title ?? "Combat ATB"}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            Tick {state.ticks} · {state.units.filter((u) => u.alive).length} unités vivantes
          </div>
        </div>
        <button
          onClick={() => setAutoAll((v) => !v)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            autoAll
              ? "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
              : "border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
          }`}
        >
          {autoAll ? "▶️ AUTO ON" : "⏸ Auto OFF"}
        </button>
      </div>

      {/* Order preview */}
      {!ended && (
        <div className="shrink-0 border-b border-white/5 bg-black/40 px-4 py-2 backdrop-blur-sm">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            Ordre prévu
          </div>
          <div className="mt-1 flex items-center gap-1.5 overflow-x-auto">
            {upcoming.map((u, i) => {
              const accent = CLASS_ACCENT[u.classId];
              const elt = ETERNUM_ELEMENTS[u.element];
              return (
                <div
                  key={`${u.id}-${i}`}
                  className={`flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
                    u.team === "A"
                      ? "bg-emerald-500/10 text-emerald-200"
                      : "bg-rose-500/10 text-rose-200"
                  }`}
                >
                  <span className="text-base leading-none">
                    {ETERNUM_CLASSES[u.classId].glyph}
                  </span>
                  <span className="text-[10px]">{elt.glyph}</span>
                  <span className="truncate max-w-[5rem]">{u.name}</span>
                  <span className={`text-[9px] ${accent.text}`}>
                    SPD {u.spd}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Battlefield */}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto p-4">
        <TeamColumn
          label="Ton équipe"
          units={teamAUnits}
          accent="emerald"
          activeId={state.awaitingAction}
          impact={impact}
          unitRarities={unitRarities}
          unitDisplayGlyphs={unitDisplayGlyphs}
          pickingTargetForKind={null}
          onToggleAuto={toggleUnitAuto}
          onPickTarget={() => {}}
        />
        <TeamColumn
          label="Ennemis"
          units={teamBUnits}
          accent="rose"
          activeId={state.awaitingAction}
          impact={impact}
          unitRarities={unitRarities}
          unitDisplayGlyphs={unitDisplayGlyphs}
          pickingTargetForKind={picking ? selectedAction : null}
          onToggleAuto={() => {}}
          onPickTarget={pickTarget}
        />
      </div>

      {/* Action panel */}
      {!ended && awaiting && !autoAll && (
        <ActionPanel
          actor={awaiting}
          picking={picking}
          onChooseAction={chooseAction}
          onCancel={() => {
            setSelectedAction(null);
            setPicking(false);
          }}
        />
      )}

      {/* Log */}
      <div className="max-h-32 shrink-0 overflow-y-auto border-t border-white/5 bg-black/70 px-4 py-2 text-[11px] text-zinc-300 backdrop-blur-sm">
        {state.log.slice(-12).map((l, i) => (
          <div key={i} className="leading-snug">
            {l.msg}
          </div>
        ))}
        {state.log.length === 0 && (
          <div className="text-zinc-500">Le combat commence…</div>
        )}
      </div>

      {/* Result */}
      {ended && (
        <div className="shrink-0 border-t border-white/10 bg-black/85 p-4 backdrop-blur-sm">
          <div className="text-center">
            <div
              className={`text-3xl font-bold drop-shadow-lg ${
                winner === "A"
                  ? "text-emerald-300"
                  : winner === "B"
                    ? "text-rose-300"
                    : "text-zinc-300"
              }`}
              style={{
                textShadow:
                  winner === "A"
                    ? "0 0 24px rgba(52,211,153,0.6)"
                    : winner === "B"
                      ? "0 0 24px rgba(244,63,94,0.6)"
                      : undefined,
              }}
            >
              {winner === "A"
                ? "🏆 Victoire !"
                : winner === "B"
                  ? "💀 Défaite"
                  : "🤝 Égalité"}
            </div>
            {rewards && (
              <div className="mx-auto mt-3 max-w-md rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 to-amber-700/5 p-3 text-sm shadow-[0_0_24px_rgba(252,211,77,0.25)]">
                <div className="font-bold text-amber-200">🎁 Récompenses</div>
                <div className="mt-1 text-amber-100">
                  {typeof rewards.os === "number" &&
                    `+${rewards.os.toLocaleString("fr-FR")} OS`}
                  {typeof rewards.xp === "number" &&
                    ` · +${rewards.xp.toLocaleString("fr-FR")} XP`}
                </div>
                {rewards.resources && rewards.resources.length > 0 && (
                  <div className="mt-1 text-xs text-amber-100/80">
                    {rewards.resources.join(" · ")}
                  </div>
                )}
                {rewards.custom && (
                  <div className="mt-1 text-xs text-amber-100/80">
                    {rewards.custom}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => onComplete({ winner, turns: state.ticks })}
              className="mt-3 rounded-md bg-amber-500 px-5 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400"
            >
              {closeLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AtbBattleModal(props: AtbBattleProps & { open: boolean }) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <AtbBattle {...props} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// COLONNE D'ÉQUIPE
// ─────────────────────────────────────────────────────────────────────────

function TeamColumn({
  label,
  units,
  accent,
  activeId,
  impact,
  unitRarities,
  unitDisplayGlyphs,
  pickingTargetForKind,
  onToggleAuto,
  onPickTarget,
}: {
  label: string;
  units: AtbUnit[];
  accent: "emerald" | "rose";
  activeId: string | null;
  impact: ImpactEvent | null;
  unitRarities?: Record<string, RarityKey>;
  unitDisplayGlyphs?: Record<string, string>;
  pickingTargetForKind: AtbActionKind | null;
  onToggleAuto: (id: string) => void;
  onPickTarget: (id: string) => void;
}) {
  const accentTxt = accent === "emerald" ? "text-emerald-300" : "text-rose-300";
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className={`text-[10px] uppercase tracking-widest ${accentTxt}`}>
        {label}
      </div>
      <div className="flex flex-col gap-2.5">
        {units.map((u) => (
          <UnitCard
            key={u.id}
            unit={u}
            isActive={u.id === activeId}
            isTargetable={pickingTargetForKind !== null && u.alive}
            rarity={unitRarities?.[u.id] ?? defaultRarityFor(u)}
            displayGlyph={unitDisplayGlyphs?.[u.id]}
            impact={impact}
            onToggleAuto={onToggleAuto}
            onPickTarget={onPickTarget}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CARTE UNITÉ — aura, cadre rareté, animations swing/hit
// ─────────────────────────────────────────────────────────────────────────

function UnitCard({
  unit,
  isActive,
  isTargetable,
  rarity,
  displayGlyph,
  impact,
  onToggleAuto,
  onPickTarget,
}: {
  unit: AtbUnit;
  isActive: boolean;
  isTargetable: boolean;
  rarity: RarityKey;
  displayGlyph?: string;
  impact: ImpactEvent | null;
  onToggleAuto: (id: string) => void;
  onPickTarget: (id: string) => void;
}) {
  const cls = ETERNUM_CLASSES[unit.classId];
  const elt = ETERNUM_ELEMENTS[unit.element];
  const accent = CLASS_ACCENT[unit.classId];
  const hpPct = (unit.hp / unit.hpMax) * 100;
  const atbPct = (unit.atbGauge / 1000) * 100;
  // Glyph affiché : familier custom si fourni, sinon glyph de classe.
  const glyph = displayGlyph ?? cls.glyph;
  // Tint CSS selon élément (transforme un emoji 🐺 gris en loup rouge feu, etc.)
  const tintFilter = elementTintFilter(unit.element);

  // Animations basées sur l'event impact
  const isAttacking = impact?.actorId === unit.id;
  const isHit = impact?.targetId === unit.id;

  const cardClass = unit.alive
    ? `relative rounded-md ${RARITY_FRAME[rarity]} ${RARITY_BG[rarity]} p-2 transition-all ${
        isActive
          ? "scale-[1.05] ring-2 ring-amber-400 shadow-[0_0_20px_rgba(252,211,77,0.5)]"
          : ""
      } ${isTargetable ? "cursor-pointer hover:ring-2 hover:ring-amber-400/60" : ""}`
    : "rounded-md border border-white/5 bg-black/30 p-2 opacity-30 grayscale";

  // Direction du swing : team A swing vers la droite (+x), team B vers la gauche (-x)
  const swingX = unit.team === "A" ? 18 : -18;

  return (
    <div
      className={cardClass}
      onClick={() => isTargetable && onPickTarget(unit.id)}
      style={{
        transform: isAttacking
          ? `translateX(${swingX}px) translateY(-4px)`
          : isHit
            ? `translateX(${unit.team === "A" ? -6 : 6}px)`
            : undefined,
        transition: "transform 200ms ease-out",
      }}
    >
      {/* Aura élément en arrière-plan */}
      {unit.alive && (
        <div
          className="pointer-events-none absolute inset-0 rounded-md opacity-70"
          style={{
            background: ELEMENT_AURA[unit.element],
            animation: `${ELEMENT_PULSE_KEYFRAME[unit.element]} 3s ease-in-out infinite`,
            filter: "blur(2px)",
          }}
        />
      )}

      {/* Hit flash overlay */}
      {isHit && (
        <div
          className="pointer-events-none absolute inset-0 rounded-md"
          style={{
            background: impact?.isCrit
              ? "radial-gradient(circle, rgba(252,211,77,0.7), transparent 70%)"
              : "radial-gradient(circle, rgba(244,63,94,0.6), transparent 70%)",
            animation: "atb-hit-flash 350ms ease-out",
          }}
        />
      )}

      {/* Particules d'impact */}
      {isHit && impact && (
        <div className="pointer-events-none absolute inset-0 overflow-visible">
          {impact.particles.map((p, i) => (
            <span
              key={`${impact.id}-${i}`}
              className="absolute left-1/2 top-1/2 text-base"
              style={{
                animation: `atb-particle 600ms ease-out forwards`,
                animationDelay: `${i * 30}ms`,
                ["--dx" as string]: `${p.dx}px`,
                ["--dy" as string]: `${p.dy}px`,
                ["--rot" as string]: `${p.rot}deg`,
              }}
            >
              {p.emoji}
            </span>
          ))}
          {/* Damage popup */}
          <span
            className={`absolute left-1/2 top-1/4 -translate-x-1/2 text-base font-bold tabular-nums drop-shadow-lg ${
              impact.isCrit ? "text-amber-300" : "text-rose-200"
            }`}
            style={{ animation: "atb-damage-float 700ms ease-out forwards" }}
          >
            {impact.isCrit && (
              <span className="mr-0.5 text-[10px] tracking-widest">CRIT</span>
            )}
            -{impact.damage}
          </span>
        </div>
      )}

      <div className="relative flex items-center gap-3">
        {/* Sprite : glyph familier en grand + tint selon élément.
            Le hue-rotate transforme un emoji 🐺 gris en loup rouge (feu),
            bleu (eau), vert (vent), etc. — exactement le pattern Summoners
            War où chaque monstre a 6 variantes-couleurs par élément. */}
        <div className="relative flex h-16 w-16 shrink-0 flex-col items-center justify-center">
          {/* Halo arrière selon élément (renforce la lecture de l'élément) */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full opacity-50 blur-md"
            style={{ background: ELEMENT_AURA[unit.element] }}
          />
          <span
            className="relative text-5xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] atb-emoji"
            style={{
              filter: `${tintFilter}${isHit ? " brightness(2)" : ""}`,
              transform: isAttacking
                ? "scale(1.18) rotate(-8deg)"
                : "scale(1)",
              transition: "transform 200ms ease-out, filter 150ms",
              lineHeight: 1,
            }}
          >
            {glyph}
          </span>
          {/* Glyph élément en overlay coin (lisibilité gameplay) */}
          <span
            className="absolute -bottom-0.5 -right-0.5 rounded-full bg-black/70 px-1 text-sm leading-none ring-1 ring-white/10 backdrop-blur-sm"
            title={elt.name}
          >
            {elt.glyph}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-1">
            <div
              className={`truncate text-xs font-semibold ${accent.text}`}
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
            >
              {unit.name}
            </div>
            <div className="text-[10px] tabular-nums text-zinc-400">
              {unit.hp}/{unit.hpMax}
            </div>
          </div>

          {/* HP bar */}
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/70">
            <div
              className={`h-1.5 transition-all duration-200 ${
                hpPct > 50
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-300"
                  : hpPct > 20
                    ? "bg-gradient-to-r from-amber-500 to-amber-300"
                    : "bg-gradient-to-r from-rose-600 to-rose-400"
              }`}
              style={{ width: `${hpPct}%` }}
            />
          </div>

          {/* ATB bar */}
          {unit.alive && (
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/70">
              <div
                className={`h-1 ${
                  atbPct >= 100
                    ? "bg-gradient-to-r from-amber-300 to-yellow-200 shadow-[0_0_8px_rgba(252,211,77,0.7)]"
                    : "bg-gradient-to-r from-sky-500 to-cyan-300/80"
                }`}
                style={{ width: `${atbPct}%`, transitionDuration: "100ms" }}
              />
            </div>
          )}

          <div className="mt-1 flex items-center justify-between text-[9px] text-zinc-400">
            <span className="tabular-nums">
              SPD {unit.spd} · ATK {unit.atk} · DEF {unit.def}
            </span>
            {unit.team === "A" && unit.alive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleAuto(unit.id);
                }}
                className={`rounded px-1 ${
                  unit.isAuto
                    ? "bg-emerald-500/30 text-emerald-200"
                    : "bg-white/5 text-zinc-400 hover:bg-white/10"
                }`}
              >
                {unit.isAuto ? "🤖" : "🎯"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PANEL D'ACTIONS
// ─────────────────────────────────────────────────────────────────────────

function ActionPanel({
  actor,
  picking,
  onChooseAction,
  onCancel,
}: {
  actor: AtbUnit;
  picking: boolean;
  onChooseAction: (kind: AtbActionKind) => void;
  onCancel: () => void;
}) {
  const cls = ETERNUM_CLASSES[actor.classId];
  const accent = CLASS_ACCENT[actor.classId];
  return (
    <div
      className={`shrink-0 border-t-2 ${accent.border} bg-gradient-to-b from-black/60 to-black/85 p-3 backdrop-blur-sm`}
    >
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-base">{cls.glyph}</span>
        <div className={`text-sm font-bold ${accent.text}`}>
          Tour de {actor.name}
        </div>
        <span className={`text-[10px] uppercase tracking-widest ${accent.text} opacity-70`}>
          · {accent.glyph} {cls.name}
        </span>
        {picking && (
          <span className="ml-auto rounded bg-amber-400/20 px-2 py-0.5 text-[10px] uppercase tracking-widest text-amber-300 animate-pulse">
            Choisis une cible →
          </span>
        )}
      </div>
      {!picking && (
        <div className="grid grid-cols-3 gap-2">
          <ActionBtn actor={actor} kind="skill1" onClick={onChooseAction} />
          <ActionBtn actor={actor} kind="skill2" onClick={onChooseAction} />
          <ActionBtn actor={actor} kind="ultimate" onClick={onChooseAction} />
        </div>
      )}
      {picking && (
        <button
          onClick={onCancel}
          className="mt-1 text-[11px] text-zinc-400 hover:text-zinc-200"
        >
          ← Annuler
        </button>
      )}
    </div>
  );
}

function ActionBtn({
  actor,
  kind,
  onClick,
}: {
  actor: AtbUnit;
  kind: AtbActionKind;
  onClick: (kind: AtbActionKind) => void;
}) {
  const info = actionInfo(actor, kind);
  const accent = CLASS_ACCENT[actor.classId];

  const labels: Record<AtbActionKind, string> = {
    skill1: "Skill 1",
    skill2: "Skill 2",
    ultimate: "ULTIME",
  };

  // Style par kind, mais teinté avec la couleur de classe pour ultimate.
  let btnClass = "";
  let glyph = "";
  if (kind === "skill1") {
    btnClass = "border-zinc-600 bg-zinc-900/80 text-zinc-100 hover:bg-zinc-800";
    glyph = "•";
  } else if (kind === "skill2") {
    btnClass = `${accent.border} bg-gradient-to-b ${accent.primary} ${accent.text} hover:brightness-125`;
    glyph = accent.glyph;
  } else {
    // ultimate : si dispo → flame anim, sinon grayscale
    btnClass = info.available
      ? `${accent.border} bg-gradient-to-b ${accent.primary} ${accent.text} hover:brightness-125 atb-ultimate-ready`
      : `border-zinc-700 bg-zinc-900/80 text-zinc-500`;
    glyph = "⚡";
  }

  return (
    <button
      onClick={() => info.available && onClick(kind)}
      disabled={!info.available}
      className={`relative flex flex-col items-start gap-0.5 rounded-md border p-2 text-left transition-all disabled:opacity-30 disabled:cursor-not-allowed ${btnClass}`}
    >
      <div className="flex w-full items-center justify-between text-[9px] uppercase tracking-widest opacity-90">
        <span className="flex items-center gap-1">
          <span className="text-sm leading-none">{glyph}</span>
          <span>{labels[kind]}</span>
        </span>
        {info.cdMax > 0 &&
          (info.cdLeft > 0 ? (
            <span className="rounded bg-rose-500/30 px-1 text-rose-200">
              CD {info.cdLeft}
            </span>
          ) : (
            <span className="rounded bg-emerald-500/30 px-1 text-emerald-200">
              prêt
            </span>
          ))}
      </div>
      <div className="text-xs font-semibold leading-tight">{info.name}</div>
      <div className="text-[9px] opacity-70">×{info.multiplier} dmg</div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// STYLES — keyframes globales injectées via balise <style>
// ─────────────────────────────────────────────────────────────────────────

function AtbStyles() {
  return (
    <style>{`
      .atb-emoji {
        font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji",
          "EmojiOne Color", sans-serif;
        font-feature-settings: normal;
      }
      @keyframes atb-hit-flash {
        0% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(1.4); }
      }
      @keyframes atb-particle {
        0% { transform: translate(-50%, -50%) scale(0.6) rotate(0deg); opacity: 1; }
        100% {
          transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1.2) rotate(var(--rot));
          opacity: 0;
        }
      }
      @keyframes atb-damage-float {
        0% { transform: translateX(-50%) translateY(0); opacity: 1; }
        100% { transform: translateX(-50%) translateY(-32px); opacity: 0; }
      }
      @keyframes atb-aura-pulse-fire {
        0%, 100% { opacity: 0.4; transform: scale(1); }
        50% { opacity: 0.85; transform: scale(1.08); }
      }
      @keyframes atb-aura-pulse-water {
        0%, 100% { opacity: 0.45; transform: scale(1) translateY(0); }
        50% { opacity: 0.8; transform: scale(1.04) translateY(-2px); }
      }
      @keyframes atb-aura-pulse-wind {
        0%, 100% { opacity: 0.4; transform: scale(1) rotate(0deg); }
        50% { opacity: 0.8; transform: scale(1.06) rotate(2deg); }
      }
      @keyframes atb-aura-pulse-earth {
        0%, 100% { opacity: 0.4; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(1.03); }
      }
      @keyframes atb-aura-pulse-light {
        0%, 100% { opacity: 0.55; transform: scale(1); filter: blur(2px); }
        50% { opacity: 1; transform: scale(1.1); filter: blur(1px); }
      }
      @keyframes atb-aura-pulse-dark {
        0%, 100% { opacity: 0.55; transform: scale(1); }
        50% { opacity: 0.95; transform: scale(1.07); }
      }
      @keyframes atb-prismatic-rotate {
        0% { background-position: 0% 50%; }
        100% { background-position: 200% 50%; }
      }
      .atb-prismatic-frame {
        border: 2px solid transparent;
        background-image:
          linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)),
          linear-gradient(90deg, #f472b6, #818cf8, #34d399, #facc15, #f472b6);
        background-origin: border-box;
        background-clip: padding-box, border-box;
        background-size: 100% 100%, 200% 100%;
        animation: atb-prismatic-rotate 3s linear infinite;
      }
      @keyframes atb-ultimate-pulse {
        0%, 100% {
          box-shadow: 0 0 0 0 rgba(252, 211, 77, 0.5),
            inset 0 0 0 0 rgba(252, 211, 77, 0.3);
        }
        50% {
          box-shadow: 0 0 16px 4px rgba(252, 211, 77, 0.55),
            inset 0 0 12px 0 rgba(252, 211, 77, 0.25);
        }
      }
      .atb-ultimate-ready {
        animation: atb-ultimate-pulse 1.4s ease-in-out infinite;
      }
    `}</style>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
