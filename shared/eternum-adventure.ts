// Système d'aventure idle Eternum.
//
// Stage max = 1000. Aucun cap journalier — l'énergie et le temps AFK
// suffisent comme limites naturelles.
//
// Récompenses : taux par paliers de 10 niveaux.
// - Stage 1-9 : 1 OS/tick
// - Stage 10-19 : 2 OS/tick
// - ...
// - Stage 991-1000 : 100 OS/tick (= 4 800 OS sur 8h)
// XP par tick = OS/tick ÷ 4

import type { EternumRarity } from "./types";

export type AdventureEnemy = {
  rarity: EternumRarity;
  level: number;
};

export type StagePhase =
  | "warmup" // 1-249 : team se remplit en communs
  | "common" // 200-249 : 5 communs full
  | "rare" // 250-499 : promotion en rares
  | "epic" // 500-749 : promotion en épiques
  | "legendary" // 750-999 : promotion en légendaires
  | "prismatic"; // 1000 : finale 5 prismatiques

export type StageComposition = {
  stage: number;
  enemies: AdventureEnemy[];
  phase: StagePhase;
  /** Description courte affichée dans l'UI. */
  label: string;
};

export const ADVENTURE_MAX_STAGE = 1000;
export const ADVENTURE_TICK_SECONDS = 600; // 10 min
export const ADVENTURE_CAP_HOURS = 8;
export const ADVENTURE_CAP_TICKS =
  (ADVENTURE_CAP_HOURS * 3600) / ADVENTURE_TICK_SECONDS; // 48

/**
 * Taux d'OS par tick. Augmente de 1 tous les 10 niveaux.
 * Stage 1-10 = 1 OS/tick, stage 11-20 = 2, ..., stage 991-1000 = 100.
 */
export function osPerTick(stage: number): number {
  const s = Math.max(1, Math.min(ADVENTURE_MAX_STAGE, stage));
  return Math.floor((s - 1) / 10) + 1;
}

/** XP par tick = OS/tick / 4. */
export function xpPerTick(stage: number): number {
  return Math.floor(osPerTick(stage) / 4);
}

/** Renvoie la composition exacte d'ennemis pour un stage donné. */
export function getStageComposition(stage: number): StageComposition {
  const s = Math.max(1, Math.min(ADVENTURE_MAX_STAGE, stage));
  const level = Math.min(s, 100);

  // Stage 1000 — finale absolue
  if (s >= 1000) {
    return {
      stage: 1000,
      enemies: Array.from({ length: 5 }, () => ({
        rarity: "prismatic",
        level: 100,
      })),
      phase: "prismatic",
      label: "5 prismatiques · finale",
    };
  }

  // Phase A : 1-249 — remplissage de la team en communs
  // 5 paliers de 50 stages : 1c → 2c → 3c → 4c → 5c
  if (s < 250) {
    const count = Math.min(5, Math.floor(s / 50) + 1);
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

  // Phase B : 250-499 — promotion vers rares
  // 5 paliers de 50 stages : 4c+1r → 3c+2r → 2c+3r → 1c+4r → 5r
  if (s < 500) {
    const rares = Math.floor((s - 250) / 50) + 1;
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

  // Phase C : 500-749 — promotion vers épiques
  if (s < 750) {
    const epics = Math.floor((s - 500) / 50) + 1;
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

  // Phase D : 750-999 — promotion vers légendaires
  const legends = Math.floor((s - 750) / 50) + 1;
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
