// Système d'aventure idle Eternum — composition d'ennemis par stage.
// Stage max = 200, en 24 paliers de 10 niveaux + 1 stage final prismatique.
// Niveau ennemi = min(stage, 100) — au-delà du stage 100 la difficulté
// monte via la rareté des ennemis, pas leur niveau.

import type { EternumRarity } from "./types";

export type AdventureEnemy = {
  rarity: EternumRarity;
  level: number;
};

export type StagePhase =
  | "warmup"      // 1-49 : team se remplit en communs
  | "common"      // 40-49 : 5 communs
  | "rare"        // 50-99 : promotion progressive en rares
  | "epic"        // 100-149 : promotion progressive en épiques
  | "legendary"   // 150-199 : promotion progressive en légendaires
  | "prismatic";  // 200 : finale 5 prismatiques

export type StageComposition = {
  stage: number;
  enemies: AdventureEnemy[];
  phase: StagePhase;
  /** Description courte affichée dans l'UI. */
  label: string;
};

export const ADVENTURE_MAX_STAGE = 200;
export const ADVENTURE_TICK_SECONDS = 600; // 10 min
export const ADVENTURE_CAP_HOURS = 8;
export const ADVENTURE_CAP_TICKS =
  (ADVENTURE_CAP_HOURS * 3600) / ADVENTURE_TICK_SECONDS; // 48
/** Cap journalier OS idle = stage × 30. */
export const ADVENTURE_DAILY_OS_PER_STAGE = 30;

/**
 * Renvoie la composition exacte d'ennemis pour un stage donné.
 * 5 ennemis max, escalade par paliers de 10 niveaux.
 */
export function getStageComposition(stage: number): StageComposition {
  const s = Math.max(1, Math.min(ADVENTURE_MAX_STAGE, stage));
  const level = Math.min(s, 100);

  // Stage 200 — finale absolue
  if (s >= 200) {
    return {
      stage: 200,
      enemies: Array.from({ length: 5 }, () => ({
        rarity: "prismatic",
        level: 100,
      })),
      phase: "prismatic",
      label: "5 prismatiques · finale",
    };
  }

  // Phase A : stages 1-49 — remplissage de la team ennemie en communs
  if (s < 50) {
    const count = Math.min(5, Math.floor(s / 10) + 1);
    return {
      stage: s,
      enemies: Array.from({ length: count }, () => ({
        rarity: "common",
        level,
      })),
      phase: count < 5 ? "warmup" : "common",
      label: `${count} commun${count > 1 ? "s" : ""}`,
    };
  }

  // Phase B : stages 50-99 — promotion vers rares
  if (s < 100) {
    const rares = Math.floor((s - 50) / 10) + 1;
    const commons = 5 - rares;
    const parts: string[] = [];
    if (commons > 0) parts.push(`${commons} commun${commons > 1 ? "s" : ""}`);
    if (rares > 0) parts.push(`${rares} rare${rares > 1 ? "s" : ""}`);
    return {
      stage: s,
      enemies: [
        ...Array.from({ length: commons }, () => ({
          rarity: "common" as EternumRarity,
          level,
        })),
        ...Array.from({ length: rares }, () => ({
          rarity: "rare" as EternumRarity,
          level,
        })),
      ],
      phase: "rare",
      label: parts.join(" + "),
    };
  }

  // Phase C : stages 100-149 — promotion vers épiques
  if (s < 150) {
    const epics = Math.floor((s - 100) / 10) + 1;
    const rares = 5 - epics;
    const parts: string[] = [];
    if (rares > 0) parts.push(`${rares} rare${rares > 1 ? "s" : ""}`);
    if (epics > 0) parts.push(`${epics} épique${epics > 1 ? "s" : ""}`);
    return {
      stage: s,
      enemies: [
        ...Array.from({ length: rares }, () => ({
          rarity: "rare" as EternumRarity,
          level,
        })),
        ...Array.from({ length: epics }, () => ({
          rarity: "epic" as EternumRarity,
          level,
        })),
      ],
      phase: "epic",
      label: parts.join(" + "),
    };
  }

  // Phase D : stages 150-199 — promotion vers légendaires
  const legends = Math.floor((s - 150) / 10) + 1;
  const epics = 5 - legends;
  const parts: string[] = [];
  if (epics > 0) parts.push(`${epics} épique${epics > 1 ? "s" : ""}`);
  if (legends > 0) parts.push(`${legends} légendaire${legends > 1 ? "s" : ""}`);
  return {
    stage: s,
    enemies: [
      ...Array.from({ length: epics }, () => ({
        rarity: "epic" as EternumRarity,
        level,
      })),
      ...Array.from({ length: legends }, () => ({
        rarity: "legendary" as EternumRarity,
        level,
      })),
    ],
    phase: "legendary",
    label: parts.join(" + "),
  };
}

/** Composition du stage suivant (null si on est au max). */
export function nextStageComposition(stage: number): StageComposition | null {
  if (stage >= ADVENTURE_MAX_STAGE) return null;
  return getStageComposition(stage + 1);
}

/** Cap journalier OS idle pour un stage donné. */
export function dailyIdleOsCap(stage: number): number {
  return Math.max(1, stage) * ADVENTURE_DAILY_OS_PER_STAGE;
}

/** Label de phase pour l'UI. */
export const STAGE_PHASE_LABEL: Record<StagePhase, string> = {
  warmup: "Échauffement",
  common: "Communs",
  rare: "Rares",
  epic: "Épiques",
  legendary: "Légendaires",
  prismatic: "Prismatique — Finale",
};

/** Couleur d'accent pour l'UI selon la phase. */
export const STAGE_PHASE_ACCENT: Record<StagePhase, string> = {
  warmup: "text-zinc-300 border-zinc-500/40",
  common: "text-zinc-200 border-zinc-400/50",
  rare: "text-emerald-200 border-emerald-400/50",
  epic: "text-sky-200 border-sky-400/60",
  legendary: "text-amber-200 border-amber-400/60",
  prismatic:
    "text-fuchsia-200 border-fuchsia-400/70 shadow-[0_0_20px_rgba(232,121,249,0.4)]",
};
