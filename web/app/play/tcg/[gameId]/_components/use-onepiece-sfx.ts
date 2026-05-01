"use client";

// Hook minimal de sons synthétisés (Web Audio API) pour le combat
// One Piece TCG. Pas de fichiers audio externes — juste des tons courts
// générés par des oscillateurs.
//
// Préférence persistée dans localStorage["op-sfx-enabled"] (default true).

import { useCallback, useEffect, useRef, useState } from "react";

export type SfxKind =
  | "card-played"
  | "attack"
  | "ko"
  | "life-taken"
  | "trigger-reveal"
  | "turn-end"
  | "win"
  | "lose";

const STORAGE_KEY = "op-sfx-enabled";

export function useOnePieceSfx() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [enabled, setEnabledState] = useState(true);

  // Hydrate from localStorage côté client.
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "false") setEnabledState(false);
    } catch {
      // SSR / quota / mode incognito : on ignore.
    }
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "true" : "false");
    } catch {
      // ignore
    }
  }, []);

  const play = useCallback(
    (kind: SfxKind) => {
      if (!enabled) return;
      try {
        if (!ctxRef.current) {
          const Ctx = (
            window as unknown as {
              AudioContext?: typeof AudioContext;
              webkitAudioContext?: typeof AudioContext;
            }
          ).AudioContext ?? (
            window as unknown as { webkitAudioContext?: typeof AudioContext }
          ).webkitAudioContext;
          if (!Ctx) return;
          ctxRef.current = new Ctx();
        }
        const ctx = ctxRef.current;
        if (!ctx) return;
        // Reprend le ctx après une interaction (autoplay policy).
        if (ctx.state === "suspended") void ctx.resume();
        playSfx(ctx, kind);
      } catch {
        // ignore
      }
    },
    [enabled],
  );

  return { play, enabled, setEnabled };
}

function playSfx(ctx: AudioContext, kind: SfxKind) {
  const now = ctx.currentTime;
  switch (kind) {
    case "card-played":
      // "Pose de carte" : pluck rapide + tap percussif (noise burst).
      pluck(ctx, now, 880, 0.12, 0.08, "triangle");
      noise(ctx, now, 0.04, 0.06, 1500, 4000);
      break;
    case "attack":
      // Lame qui tranche : sweep rapide + noise filtered + impact final.
      sweep(ctx, now, 1200, 180, 0.25, 0.12, "sawtooth");
      noise(ctx, now, 0.18, 0.08, 800, 3500);
      pluck(ctx, now + 0.18, 100, 0.15, 0.18, "square");
      break;
    case "ko":
      // Coup mat profond + écho métallique + noise de débris.
      sweep(ctx, now, 200, 50, 0.35, 0.25, "sine");
      tone(ctx, now + 0.08, 90, 0.15, 0.18, "square");
      noise(ctx, now + 0.05, 0.2, 0.12, 200, 2000);
      // Petit "ding" métallique en aval pour la signature pirate.
      tone(ctx, now + 0.25, 660, 0.2, 0.08, "triangle");
      break;
    case "life-taken":
      // "Tic" rapide à la prise + petit ressort.
      tone(ctx, now, 1760, 0.05, 0.1, "sine");
      pluck(ctx, now + 0.04, 1320, 0.1, 0.08, "triangle");
      break;
    case "trigger-reveal":
      // Cloche dorée : tonique + quinte + octave (accord majeur).
      tone(ctx, now, 1046, 0.4, 0.1, "sine"); // C6
      tone(ctx, now + 0.02, 1568, 0.4, 0.07, "sine"); // G6
      tone(ctx, now + 0.04, 2093, 0.4, 0.05, "sine"); // C7
      // Shimmer aléatoire.
      noise(ctx, now + 0.15, 0.2, 0.04, 4000, 8000);
      break;
    case "turn-end":
      // Soft chime descendant.
      tone(ctx, now, 660, 0.15, 0.06, "triangle");
      tone(ctx, now + 0.08, 440, 0.18, 0.05, "triangle");
      break;
    case "win":
      // Fanfare pirate : arpège + flourish.
      pluck(ctx, now, 523, 0.18, 0.15, "triangle"); // C5
      pluck(ctx, now + 0.12, 659, 0.18, 0.15, "triangle"); // E5
      pluck(ctx, now + 0.24, 784, 0.18, 0.18, "triangle"); // G5
      pluck(ctx, now + 0.36, 1046, 0.4, 0.2, "triangle"); // C6 long
      // Cuivre triomphal en aval.
      tone(ctx, now + 0.36, 1318, 0.5, 0.08, "sawtooth");
      tone(ctx, now + 0.36, 1568, 0.5, 0.06, "sawtooth");
      // Shimmer doré.
      noise(ctx, now + 0.4, 0.5, 0.04, 3000, 7000);
      break;
    case "lose":
      // Sweep grave dramatique.
      sweep(ctx, now, 440, 80, 0.6, 0.18, "sawtooth");
      tone(ctx, now + 0.1, 200, 0.6, 0.1, "square");
      break;
  }
}

/** Plucked tone (pluck = pluck attack rapide + decay exponentiel). */
function pluck(
  ctx: AudioContext,
  startAt: number,
  freq: number,
  duration: number,
  gain: number,
  type: OscillatorType,
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Attaque très rapide (3ms) pour effet pluck.
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(gain, startAt + 0.003);
  g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

/** White noise burst filtré (passe-bande). */
function noise(
  ctx: AudioContext,
  startAt: number,
  duration: number,
  gain: number,
  filterLow: number,
  filterHigh: number,
) {
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  // Filtre passe-bande pour donner du caractère.
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = (filterLow + filterHigh) / 2;
  filter.Q.value = 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(gain, startAt + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(startAt);
  src.stop(startAt + duration + 0.05);
}

function tone(
  ctx: AudioContext,
  startAt: number,
  freq: number,
  duration: number,
  gain: number,
  type: OscillatorType,
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(gain, startAt + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

function sweep(
  ctx: AudioContext,
  startAt: number,
  fromFreq: number,
  toFreq: number,
  duration: number,
  gain: number,
  type: OscillatorType,
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(fromFreq, startAt);
  osc.frequency.exponentialRampToValueAtTime(
    Math.max(toFreq, 30),
    startAt + duration,
  );
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(gain, startAt + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}
