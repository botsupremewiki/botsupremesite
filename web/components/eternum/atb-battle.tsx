"use client";

// Composant ATB réutilisable pour les combats manuels d'Eternum.
// Reçoit deux équipes + un résultat forcé du serveur, joue le combat
// interactivement, et appelle onComplete quand le combat est résolu.

import { useEffect, useRef, useState } from "react";
import {
  ETERNUM_CLASSES,
  ETERNUM_ELEMENTS,
} from "@shared/types";
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

export type AtbBattleRewards = {
  os?: number;
  xp?: number;
  resources?: string[];
  custom?: string;
};

export type AtbBattleProps = {
  teamA: CombatUnit[];
  teamB: CombatUnit[];
  /** Résultat imposé par le serveur (qui a déjà décidé via power gate). */
  forcedWinner?: "A" | "B";
  /** Titre affiché en haut (ex: "Cave aux rats", "Étage 17"). */
  title?: string;
  /** Récompenses à afficher en fin de combat (si victoire). */
  rewards?: AtbBattleRewards;
  /** Appelé quand le combat est terminé. */
  onComplete: (result: { winner: "A" | "B" | "draw"; turns: number }) => void;
  /** Texte du bouton à afficher quand le combat est fini. */
  closeLabel?: string;
};

export function AtbBattle({
  teamA,
  teamB,
  forcedWinner,
  title,
  rewards,
  onComplete,
  closeLabel = "Continuer →",
}: AtbBattleProps) {
  const [state, setState] = useState<AtbState>(() =>
    initAtbState(teamA, teamB, { forcedWinner }),
  );
  const [autoAll, setAutoAll] = useState(false);
  const [selectedAction, setSelectedAction] = useState<AtbActionKind | null>(null);
  const [picking, setPicking] = useState(false);
  const completedRef = useRef(false);

  // Tick loop : avance l'état toutes les TICK_MS quand running et pas en attente.
  useEffect(() => {
    if (state.status !== "running") return;
    if (state.awaitingAction !== null) return; // attend joueur
    const t = setTimeout(() => {
      setState((s) => tickAtb(s));
    }, TICK_MS);
    return () => clearTimeout(t);
  }, [state]);

  // Si auto-all activé, chaque fois qu'on attend une action, l'IA joue à la place.
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

    // Skill1 et skill2 ciblent un ennemi → mode picking
    if (aliveEnemies(state, actor).length > 1) {
      setSelectedAction(kind);
      setPicking(true);
      return;
    }
    // Une seule cible → execute direct
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
    <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border-2 border-amber-400/40 bg-zinc-950">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-base font-bold text-amber-200">
            {title ?? "Combat ATB"}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            Ticks {state.ticks} · {state.units.filter((u) => u.alive).length} unités vivantes
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
        <div className="shrink-0 border-b border-white/5 bg-black/40 px-4 py-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            Ordre prévu
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {upcoming.map((u, i) => (
              <div
                key={`${u.id}-${i}`}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
                  u.team === "A"
                    ? "bg-emerald-500/10 text-emerald-200"
                    : "bg-rose-500/10 text-rose-200"
                }`}
              >
                <span className="text-base leading-none">
                  {ETERNUM_CLASSES[u.classId].glyph}
                </span>
                <span className="truncate max-w-[5rem]">{u.name}</span>
              </div>
            ))}
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
          pickingTargetForKind={null}
          onToggleAuto={toggleUnitAuto}
          onPickTarget={() => {}}
        />
        <TeamColumn
          label="Ennemis"
          units={teamBUnits}
          accent="rose"
          activeId={state.awaitingAction}
          pickingTargetForKind={picking ? selectedAction : null}
          onToggleAuto={() => {}}
          onPickTarget={pickTarget}
        />
      </div>

      {/* Action panel */}
      {!ended && awaiting && !autoAll && (
        <div className="shrink-0 border-t border-amber-400/30 bg-amber-400/[0.03] p-3">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-base">
              {ETERNUM_CLASSES[awaiting.classId].glyph}
            </span>
            <div className="text-sm font-bold text-amber-200">
              Tour de {awaiting.name}
            </div>
            {picking && (
              <span className="ml-auto rounded bg-amber-400/20 px-2 py-0.5 text-[10px] uppercase tracking-widest text-amber-300">
                Choisis une cible →
              </span>
            )}
          </div>
          {!picking && (
            <div className="grid grid-cols-3 gap-2">
              <ActionBtn actor={awaiting} kind="skill1" onClick={chooseAction} />
              <ActionBtn actor={awaiting} kind="skill2" onClick={chooseAction} />
              <ActionBtn actor={awaiting} kind="ultimate" onClick={chooseAction} />
            </div>
          )}
          {picking && (
            <button
              onClick={() => {
                setSelectedAction(null);
                setPicking(false);
              }}
              className="mt-1 text-[11px] text-zinc-400 hover:text-zinc-200"
            >
              ← Annuler
            </button>
          )}
        </div>
      )}

      {/* Log */}
      <div className="max-h-32 shrink-0 overflow-y-auto border-t border-white/5 bg-black/60 px-4 py-2 text-[11px] text-zinc-300">
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
        <div className="shrink-0 border-t border-white/10 bg-black/80 p-4">
          <div className="text-center">
            <div
              className={`text-2xl font-bold ${
                winner === "A"
                  ? "text-emerald-300"
                  : winner === "B"
                    ? "text-rose-300"
                    : "text-zinc-300"
              }`}
            >
              {winner === "A"
                ? "🏆 Victoire !"
                : winner === "B"
                  ? "💀 Défaite"
                  : "🤝 Égalité"}
            </div>
            {rewards && (
              <div className="mx-auto mt-3 max-w-md rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
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

/**
 * Wrapper modal pour <AtbBattle>. Affiche le combat en plein écran avec
 * un overlay sombre. Le parent contrôle l'ouverture via `open` + le contenu
 * via les props transmises.
 */
export function AtbBattleModal(props: AtbBattleProps & { open: boolean }) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <AtbBattle {...props} />
    </div>
  );
}

function TeamColumn({
  label,
  units,
  accent,
  activeId,
  pickingTargetForKind,
  onToggleAuto,
  onPickTarget,
}: {
  label: string;
  units: AtbUnit[];
  accent: "emerald" | "rose";
  activeId: string | null;
  pickingTargetForKind: AtbActionKind | null;
  onToggleAuto: (id: string) => void;
  onPickTarget: (id: string) => void;
}) {
  const accentTxt = accent === "emerald" ? "text-emerald-300" : "text-rose-300";
  const accentBorder =
    accent === "emerald" ? "border-emerald-400/30" : "border-rose-400/30";
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className={`text-[10px] uppercase tracking-widest ${accentTxt}`}>
        {label}
      </div>
      <div className="flex flex-col gap-2">
        {units.map((u) => (
          <UnitCard
            key={u.id}
            unit={u}
            isActive={u.id === activeId}
            isTargetable={pickingTargetForKind !== null && u.alive}
            accentBorder={accentBorder}
            onToggleAuto={onToggleAuto}
            onPickTarget={onPickTarget}
          />
        ))}
      </div>
    </div>
  );
}

function UnitCard({
  unit,
  isActive,
  isTargetable,
  accentBorder,
  onToggleAuto,
  onPickTarget,
}: {
  unit: AtbUnit;
  isActive: boolean;
  isTargetable: boolean;
  accentBorder: string;
  onToggleAuto: (id: string) => void;
  onPickTarget: (id: string) => void;
}) {
  const cls = ETERNUM_CLASSES[unit.classId];
  const elt = ETERNUM_ELEMENTS[unit.element];
  const hpPct = (unit.hp / unit.hpMax) * 100;
  const atbPct = (unit.atbGauge / 1000) * 100;

  const cardClass = unit.alive
    ? `relative rounded-md border bg-black/40 p-2 transition-all ${accentBorder} ${
        isActive ? "ring-2 ring-amber-400 shadow-lg shadow-amber-400/20" : ""
      } ${isTargetable ? "cursor-pointer hover:border-amber-400/60 hover:bg-amber-400/[0.06]" : ""}`
    : "rounded-md border border-white/5 bg-black/20 p-2 opacity-40";

  return (
    <div
      className={cardClass}
      onClick={() => isTargetable && onPickTarget(unit.id)}
    >
      <div className="flex items-center gap-2">
        <span className="text-2xl">
          {cls.glyph}
          {elt.glyph}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-1">
            <div className="truncate text-xs font-semibold text-zinc-100">
              {unit.name}
            </div>
            <div className="text-[10px] tabular-nums text-zinc-500">
              {unit.hp}/{unit.hpMax}
            </div>
          </div>
          {/* HP bar */}
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/60">
            <div
              className={`h-1.5 transition-all duration-200 ${
                hpPct > 50
                  ? "bg-emerald-400"
                  : hpPct > 20
                    ? "bg-amber-400"
                    : "bg-rose-500"
              }`}
              style={{ width: `${hpPct}%` }}
            />
          </div>
          {/* ATB bar */}
          {unit.alive && (
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/60">
              <div
                className={`h-1 transition-all ${
                  atbPct >= 100 ? "bg-amber-300" : "bg-sky-400/60"
                }`}
                style={{
                  width: `${atbPct}%`,
                  transitionDuration: "100ms",
                }}
              />
            </div>
          )}
          <div className="mt-1 flex items-center justify-between text-[9px] text-zinc-500">
            <span>SPD {unit.spd} · ATK {unit.atk} · DEF {unit.def}</span>
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
                {unit.isAuto ? "🤖 auto" : "🎯 manuel"}
              </button>
            )}
          </div>
        </div>
      </div>
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
  const colors: Record<AtbActionKind, string> = {
    skill1:
      "bg-zinc-800 border-zinc-600 text-zinc-100 hover:bg-zinc-700",
    skill2:
      "bg-sky-500/20 border-sky-400/50 text-sky-100 hover:bg-sky-500/30",
    ultimate:
      "bg-amber-500/30 border-amber-400/60 text-amber-100 hover:bg-amber-500/40",
  };
  const labels: Record<AtbActionKind, string> = {
    skill1: "Skill 1",
    skill2: "Skill 2",
    ultimate: "ULTIME",
  };

  return (
    <button
      onClick={() => info.available && onClick(kind)}
      disabled={!info.available}
      className={`flex flex-col items-start gap-0.5 rounded-md border p-2 text-left transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${colors[kind]}`}
    >
      <div className="text-[9px] uppercase tracking-widest opacity-70">
        {labels[kind]}
        {info.cdMax > 0 &&
          (info.cdLeft > 0 ? (
            <span className="ml-1 text-rose-300">CD {info.cdLeft}</span>
          ) : (
            <span className="ml-1 text-emerald-300">prêt</span>
          ))}
      </div>
      <div className="text-xs font-semibold leading-tight">{info.name}</div>
      <div className="text-[9px] opacity-60">×{info.multiplier} dmg</div>
    </button>
  );
}
