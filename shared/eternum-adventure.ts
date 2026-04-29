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
 *
 * - Stage 1-19 : 1 OS/tick (premier palier élargi pour ne pas démarrer à 0)
 * - Stage 20-29 : 2 OS/tick
 * - Stage 30-39 : 3 OS/tick
 * - ...
 * - Stage 990-999 : 99 OS/tick
 * - Stage 1000 : 100 OS/tick → 4 800 OS / 8h
 */
export function osPerTick(stage: number): number {
  const s = Math.max(1, Math.min(ADVENTURE_MAX_STAGE, stage));
  return Math.max(1, Math.floor(s / 10));
}

/** XP par tick = OS/tick / 4. */
export function xpPerTick(stage: number): number {
  return Math.floor(osPerTick(stage) / 4);
}

// Progression exponentielle : paliers de + en + longs vers la fin.
// - Phase A (1-50) : 5 paliers de 10 stages — onboarding ultra rapide
// - Phase B (51-150) : 5 paliers de 20 stages
// - Phase C (151-300) : 5 paliers de 30 stages
// - Phase D (301-550) : 5 paliers de 50 stages
// - Phase E (551-1000) : 5 paliers de 90 stages — fin lente vers prismatiques
// - Stage 1000 : finale (label spécial, même comp que stages 911-999)
const PHASE_B_START = 51;
const PHASE_C_START = 151;
const PHASE_D_START = 301;
const PHASE_E_START = 551;

const TIER_A = 10;
const TIER_B = 20;
const TIER_C = 30;
const TIER_D = 50;
const TIER_E = 90;

/** Renvoie la composition exacte d'ennemis pour un stage donné. */
export function getStageComposition(stage: number): StageComposition {
  const s = Math.max(1, Math.min(ADVENTURE_MAX_STAGE, stage));
  const level = Math.min(s, 100);

  // Phase A : 1-50 — remplissage de la team en communs (palier 10)
  if (s < PHASE_B_START) {
    const count = Math.min(5, Math.floor((s - 1) / TIER_A) + 1);
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

  // Phase B : 51-150 — promotion vers rares (palier 20)
  if (s < PHASE_C_START) {
    const rares = Math.min(
      5,
      Math.floor((s - PHASE_B_START) / TIER_B) + 1,
    );
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

  // Phase C : 151-300 — promotion vers épiques (palier 30)
  if (s < PHASE_D_START) {
    const epics = Math.min(
      5,
      Math.floor((s - PHASE_C_START) / TIER_C) + 1,
    );
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

  // Phase D : 301-550 — promotion vers légendaires (palier 50)
  if (s < PHASE_E_START) {
    const legends = Math.min(
      5,
      Math.floor((s - PHASE_D_START) / TIER_D) + 1,
    );
    const epics = 5 - legends;
    const parts: string[] = [];
    if (epics > 0) parts.push(`${epics} épique${epics > 1 ? "s" : ""}`);
    if (legends > 0)
      parts.push(`${legends} légendaire${legends > 1 ? "s" : ""}`);
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

  // Phase E : 551-1000 — promotion vers prismatiques (palier 90)
  // Stage 1000 reçoit un label spécial "finale" (mais composition identique
  // au palier 5p qui commence au stage 911).
  const prismatics = Math.min(
    5,
    Math.floor((s - PHASE_E_START) / TIER_E) + 1,
  );
  const legends = 5 - prismatics;

  if (s === ADVENTURE_MAX_STAGE) {
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

  const parts: string[] = [];
  if (legends > 0) parts.push(`${legends} légendaire${legends > 1 ? "s" : ""}`);
  if (prismatics > 0)
    parts.push(`${prismatics} prismatique${prismatics > 1 ? "s" : ""}`);
  return {
    stage: s,
    enemies: [
      ...Array.from({ length: legends }, () => ({
        rarity: "legendary" as EternumRarity,
        level,
      })),
      ...Array.from({ length: prismatics }, () => ({
        rarity: "prismatic" as EternumRarity,
        level,
      })),
    ],
    phase: "prismatic",
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
