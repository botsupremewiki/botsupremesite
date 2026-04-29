"use client";

// AdventureBattle — combat ATB auto-continu en boucle.
// Layout vertical type Summoners War : ennemis en haut, équipe en bas.
// Pas de modal — intégré dans la page aventure.
//
// Flow :
// 1. Server tells me won/lost via eternum_attempt_adventure
// 2. Lance combat ATB avec forcedWinner imposé par le serveur
// 3. Combat se déroule (5-10 sec) en cosmétique
// 4. Animation interlude 2 sec (win → advance, lost → retry, capped → stay)
// 5. Loop

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ETERNUM_CLASSES,
  ETERNUM_ELEMENTS,
  type EternumClassId,
  type EternumElementId,
  type EternumHero,
} from "@shared/types";
import {
  applyAction,
  autoChooseAction,
  initAtbState,
  predictNextActors,
  tickAtb,
  type AtbState,
  type AtbUnit,
} from "@shared/eternum-combat-atb";
import {
  buildFamilierUnit,
  buildHeroUnit,
  type CombatUnit,
} from "@shared/eternum-combat";
import {
  ETERNUM_FAMILIERS,
  ETERNUM_FAMILIERS_BY_ID,
  elementTintFilter,
  familierDisplayName,
} from "@shared/eternum-familiers";
import {
  ADVENTURE_MAX_STAGE,
  STAGE_PHASE_ACCENT,
  STAGE_PHASE_LABEL,
  getStageComposition,
} from "@shared/eternum-adventure";
import { createClient } from "@/lib/supabase/client";

const TICK_MS = 100;
const INTERLUDE_MS = 2000;
const ENEMY_LEVEL_FAKE = 100; // pour l'affichage purement cosmétique

type Phase = "loading" | "fighting" | "interlude";

type ServerResult = {
  won: boolean;
  capped: boolean;
  player_power: number;
  required_power: number;
  stage: number;
};

type AdventureTeamMember = {
  id: string;
  familier_id: string;
  element_id: string;
  level: number;
};

export function AdventureBattle({
  hero,
  team,
  initialStage,
  userId,
  onStageChange,
}: {
  hero: EternumHero;
  team: AdventureTeamMember[];
  initialStage: number;
  userId: string;
  onStageChange?: (newStage: number) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [stage, setStage] = useState(initialStage);
  const [phase, setPhase] = useState<Phase>("loading");
  const [autoOn, setAutoOn] = useState(true); // sorts auto par défaut
  const [serverResult, setServerResult] = useState<ServerResult | null>(null);
  const [atbState, setAtbState] = useState<AtbState | null>(null);
  const [interludeTick, setInterludeTick] = useState(0);
  const lockRef = useRef(false);

  const cls = ETERNUM_CLASSES[hero.classId];

  // Build teams pour le stage actuel
  const teams = useMemo(() => {
    const teamA: CombatUnit[] = [
      buildHeroUnit(
        "hero",
        cls.name + " (Toi)",
        hero.classId,
        hero.elementId,
        hero.level,
        "A",
      ),
    ];
    for (const f of team) {
      const base = ETERNUM_FAMILIERS_BY_ID.get(f.familier_id);
      if (!base) continue;
      const elt = f.element_id as EternumElementId;
      teamA.push(
        buildFamilierUnit(
          `fam-${f.id}`,
          familierDisplayName(base, elt),
          base.classId,
          elt,
          f.level,
          base.baseStats,
          "A",
        ),
      );
    }

    // Composition d'ennemis : on pioche un familier random du catalogue
    // pour chaque slot selon la rareté demandée (cosmétique pour le glyph/nom).
    const comp = getStageComposition(stage);
    const teamB: CombatUnit[] = comp.enemies.map((e, i) => {
      const candidates = ETERNUM_FAMILIERS.filter((f) => f.rarity === e.rarity);
      const base =
        candidates.length > 0
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : null;
      // Élément ennemi random parmi les 4 base (pas lumière/ombre pour rester thématique standard)
      const elements: EternumElementId[] = ["fire", "water", "wind", "earth"];
      const elt =
        elements[Math.floor(Math.random() * elements.length)];
      const stats = base?.baseStats ?? { hp: 60, atk: 12, def: 6, spd: 10 };
      return buildFamilierUnit(
        `enemy-${stage}-${i}`,
        base ? base.name : `Ennemi ${i + 1}`,
        base?.classId ?? "warrior",
        elt,
        e.level,
        stats,
        "B",
      );
    });
    return { teamA, teamB };
  }, [stage, hero, team, cls.name]);

  // Glyphs map pour l'affichage (familier glyph custom)
  const unitGlyphs = useMemo(() => {
    const m: Record<string, string> = {};
    for (const u of teams.teamA) {
      if (u.id === "hero") continue;
      const famId = u.id.replace("fam-", "");
      const owned = team.find((f) => f.id === famId);
      if (!owned) continue;
      const base = ETERNUM_FAMILIERS_BY_ID.get(owned.familier_id);
      if (base) m[u.id] = base.glyph;
    }
    return m;
  }, [teams.teamA, team]);

  // ─── Flow management ──────────────────────────────────────────────

  // Phase "loading" : appelle le serveur pour décider du résultat
  useEffect(() => {
    if (phase !== "loading") return;
    if (lockRef.current) return;
    if (!supabase) return;
    lockRef.current = true;
    (async () => {
      const { data, error } = await supabase.rpc(
        "eternum_attempt_adventure",
        { p_user_id: userId },
      );
      lockRef.current = false;
      if (error) {
        console.warn("[adventure] RPC error", error);
        // Retry après délai
        setTimeout(() => setPhase("loading"), 3000);
        return;
      }
      const r = data as ServerResult;
      setServerResult(r);
      // Lance le combat ATB avec le résultat imposé
      const forced: "A" | "B" = r.won ? "A" : "B";
      setAtbState(
        initAtbState(teams.teamA, teams.teamB, { forcedWinner: forced }),
      );
      setPhase("fighting");
    })();
  }, [phase, supabase, userId, teams]);

  // Phase "fighting" : tick l'ATB (toutes les TICK_MS)
  useEffect(() => {
    if (phase !== "fighting") return;
    if (!atbState) return;
    if (atbState.status !== "running") return;

    if (atbState.awaitingAction !== null) {
      // Une unité attend une décision. Si autoOn → IA. Sinon → on attend, mais
      // par défaut autoOn est true, donc on joue.
      if (!autoOn) return; // si user a désactivé, attendre éternellement (no-op)
      const actor = atbState.units.find(
        (u) => u.id === atbState.awaitingAction,
      );
      if (!actor) return;
      const choice = autoChooseAction(atbState, actor);
      const t = setTimeout(() => {
        setAtbState((s) => (s ? applyAction(s, choice) : s));
      }, 250);
      return () => clearTimeout(t);
    }

    const t = setTimeout(() => {
      setAtbState((s) => (s ? tickAtb(s) : s));
    }, TICK_MS);
    return () => clearTimeout(t);
  }, [phase, atbState, autoOn]);

  // Détecte fin du combat → entre en interlude
  useEffect(() => {
    if (phase !== "fighting") return;
    if (!atbState) return;
    if (atbState.status === "running") return;
    setPhase("interlude");
    setInterludeTick(0);
  }, [phase, atbState]);

  // Phase interlude : compte 2 sec puis avance/retry
  useEffect(() => {
    if (phase !== "interlude") return;
    if (!serverResult) return;

    const t = setTimeout(() => {
      if (serverResult.won && !serverResult.capped) {
        const newStage = serverResult.stage;
        setStage(newStage);
        onStageChange?.(newStage);
      }
      // Reset pour la boucle
      setAtbState(null);
      setServerResult(null);
      setPhase("loading");
    }, INTERLUDE_MS);
    return () => clearTimeout(t);
  }, [phase, serverResult, onStageChange]);

  // ─── Render ───────────────────────────────────────────────────────

  const comp = getStageComposition(stage);
  const teamAUnits = atbState?.units.filter((u) => u.team === "A") ?? teams.teamA.map(toAtbUnit);
  const teamBUnits = atbState?.units.filter((u) => u.team === "B") ?? teams.teamB.map(toAtbUnit);
  const upcoming = atbState ? predictNextActors(atbState, 5) : [];

  return (
    <div
      className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border-2 border-sky-400/30 p-3"
      style={{
        background:
          "radial-gradient(ellipse at top, #1f2a4a 0%, #0a0d1a 70%)",
        minHeight: "520px",
      }}
    >
      <AdventureStyles />

      {/* Header : stage + auto toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-sky-300">
            ⚔️ Combat automatique — Stage {stage} / {ADVENTURE_MAX_STAGE}
          </div>
          <div
            className={`mt-0.5 inline-block rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-widest ${
              STAGE_PHASE_ACCENT[comp.phase]
            }`}
          >
            {STAGE_PHASE_LABEL[comp.phase]} · {comp.label}
          </div>
        </div>
        <button
          onClick={() => setAutoOn((v) => !v)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            autoOn
              ? "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
              : "border border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"
          }`}
          title={
            autoOn
              ? "Désactiver pour reprendre la main"
              : "Activer pour laisser l'IA jouer"
          }
        >
          {autoOn ? "🤖 Sorts auto ON" : "🎯 Sorts auto OFF"}
        </button>
      </div>

      {/* Order preview */}
      {phase === "fighting" && upcoming.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto rounded bg-black/40 px-2 py-1">
          <span className="text-[9px] uppercase tracking-widest text-zinc-500 shrink-0">
            Ordre
          </span>
          {upcoming.map((u, i) => (
            <div
              key={`${u.id}-${i}`}
              className={`flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                u.team === "A"
                  ? "bg-emerald-500/15 text-emerald-200"
                  : "bg-rose-500/15 text-rose-200"
              }`}
            >
              <span className="text-sm leading-none">
                {ETERNUM_CLASSES[u.classId].glyph}
              </span>
              <span className="truncate max-w-[5rem]">{u.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Battlefield vertical SW-style */}
      <div className="relative flex flex-1 flex-col">
        {/* Top : ennemis */}
        <div className="flex flex-1 items-start justify-center">
          <UnitRow
            units={teamBUnits}
            activeId={atbState?.awaitingAction ?? null}
            isEnemy={true}
            unitGlyphs={undefined}
          />
        </div>

        {/* Milieu : ligne de séparation */}
        <div className="my-2 flex items-center gap-2">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-rose-400/40 to-transparent" />
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            VS
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
        </div>

        {/* Bottom : ton équipe */}
        <div className="flex flex-1 items-end justify-center">
          <UnitRow
            units={teamAUnits}
            activeId={atbState?.awaitingAction ?? null}
            isEnemy={false}
            unitGlyphs={unitGlyphs}
          />
        </div>
      </div>

      {/* Interlude overlay */}
      {phase === "interlude" && serverResult && (
        <InterludeOverlay result={serverResult} />
      )}

      {/* Loading overlay (très bref) */}
      {phase === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-md border border-white/10 bg-zinc-900 px-4 py-2 text-xs text-zinc-300">
            ⚔️ Préparation du combat...
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sous-composants ───────────────────────────────────────────────

function UnitRow({
  units,
  activeId,
  isEnemy,
  unitGlyphs,
}: {
  units: AtbUnit[];
  activeId: string | null;
  isEnemy: boolean;
  unitGlyphs?: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 px-2">
      {units.map((u) => (
        <UnitSprite
          key={u.id}
          unit={u}
          isActive={u.id === activeId}
          isEnemy={isEnemy}
          customGlyph={unitGlyphs?.[u.id]}
        />
      ))}
    </div>
  );
}

function UnitSprite({
  unit,
  isActive,
  isEnemy,
  customGlyph,
}: {
  unit: AtbUnit;
  isActive: boolean;
  isEnemy: boolean;
  customGlyph?: string;
}) {
  const cls = ETERNUM_CLASSES[unit.classId];
  const elt = ETERNUM_ELEMENTS[unit.element];
  const hpPct = (unit.hp / unit.hpMax) * 100;
  const atbPct = (unit.atbGauge / 1000) * 100;
  const glyph = customGlyph ?? cls.glyph;

  if (!unit.alive) {
    return (
      <div className="flex h-20 w-16 flex-col items-center justify-center opacity-25 grayscale">
        <span className="text-3xl">{glyph}</span>
        <span className="text-[8px] text-zinc-500">K.O.</span>
      </div>
    );
  }

  return (
    <div
      className={`relative flex w-16 flex-col items-center transition-transform ${
        isActive ? "scale-110" : ""
      }`}
    >
      {/* Sprite */}
      <div className="relative flex h-12 items-center justify-center">
        <span
          className="text-4xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] atb-emoji"
          style={{ filter: elementTintFilter(unit.element) }}
        >
          {glyph}
        </span>
        <span className="absolute -bottom-1 -right-1 rounded-full bg-black/70 px-1 text-[10px] leading-none ring-1 ring-white/10">
          {elt.glyph}
        </span>
        {isActive && (
          <div className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-amber-400/20 blur-md animate-pulse" />
        )}
      </div>

      {/* Nom */}
      <div
        className={`mt-1 truncate text-[9px] font-semibold ${
          isEnemy ? "text-rose-200" : "text-emerald-200"
        }`}
        style={{ maxWidth: "64px" }}
        title={unit.name}
      >
        {unit.name}
      </div>

      {/* HP bar */}
      <div className="mt-0.5 h-1 w-14 overflow-hidden rounded-full bg-black/60">
        <div
          className={`h-1 transition-all duration-200 ${
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
      <div className="mt-0.5 h-0.5 w-14 overflow-hidden rounded-full bg-black/60">
        <div
          className={`h-0.5 ${
            atbPct >= 100 ? "bg-amber-300" : "bg-sky-400/70"
          }`}
          style={{ width: `${atbPct}%`, transitionDuration: "100ms" }}
        />
      </div>
    </div>
  );
}

function InterludeOverlay({ result }: { result: ServerResult }) {
  let icon = "⚔️";
  let title = "";
  let subtitle = "";
  let color = "text-zinc-200";
  let glow = "";

  if (result.won && result.capped) {
    icon = "♾️";
    title = "Stage final maintenu";
    subtitle = `Tu domines le sommet d'Eternum (${result.player_power} vs ${result.required_power})`;
    color = "text-fuchsia-300";
    glow = "shadow-[0_0_40px_rgba(232,121,249,0.6)]";
  } else if (result.won) {
    icon = "🏆";
    title = `Stage ${result.stage - 1} battu !`;
    subtitle = `Avance vers le stage ${result.stage}`;
    color = "text-emerald-300";
    glow = "shadow-[0_0_40px_rgba(52,211,153,0.5)]";
  } else {
    icon = "💀";
    title = "Défaite";
    subtitle = `Pas assez puissant (${result.player_power} vs ${result.required_power}). Réessai...`;
    color = "text-rose-300";
    glow = "shadow-[0_0_40px_rgba(244,63,94,0.5)]";
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div
        className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-white/20 bg-zinc-950/90 px-8 py-6 ${glow} animate-interlude-pop`}
      >
        <div className="text-6xl">{icon}</div>
        <div className={`text-2xl font-bold ${color}`}>{title}</div>
        <div className="text-xs text-zinc-400">{subtitle}</div>
      </div>
    </div>
  );
}

function AdventureStyles() {
  return (
    <style>{`
      @keyframes interlude-pop {
        0% { transform: scale(0.85); opacity: 0; }
        20% { transform: scale(1.05); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      .animate-interlude-pop {
        animation: interlude-pop 350ms ease-out;
      }
    `}</style>
  );
}

// Helper : convertit un CombatUnit en AtbUnit "vide" pour rendu en attente.
function toAtbUnit(u: CombatUnit): AtbUnit {
  return {
    ...u,
    atbGauge: 0,
    cooldowns: { skill2: 0, ultimate: 0 },
    isAuto: u.team === "B",
    stunTurns: 0,
  };
}
