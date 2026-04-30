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
      tone(ctx, now, 660, 0.08, 0.08, "triangle");
      tone(ctx, now + 0.04, 880, 0.06, 0.06, "triangle");
      break;
    case "attack":
      // Glissando descendant (swoosh).
      sweep(ctx, now, 800, 200, 0.18, 0.1, "sawtooth");
      break;
    case "ko":
      // Coup mat grave.
      sweep(ctx, now, 220, 60, 0.25, 0.18, "square");
      break;
    case "life-taken":
      tone(ctx, now, 1320, 0.06, 0.08, "sine");
      tone(ctx, now + 0.05, 1040, 0.06, 0.06, "sine");
      break;
    case "trigger-reveal":
      // Ding clair.
      tone(ctx, now, 1568, 0.1, 0.12, "sine");
      tone(ctx, now + 0.05, 2093, 0.1, 0.1, "sine");
      break;
    case "turn-end":
      tone(ctx, now, 440, 0.12, 0.08, "triangle");
      break;
    case "win":
      // Petit arpège ascendant.
      tone(ctx, now, 523, 0.15, 0.15, "triangle"); // C5
      tone(ctx, now + 0.1, 659, 0.15, 0.15, "triangle"); // E5
      tone(ctx, now + 0.2, 784, 0.15, 0.2, "triangle"); // G5
      tone(ctx, now + 0.3, 1046, 0.25, 0.3, "triangle"); // C6
      break;
    case "lose":
      sweep(ctx, now, 440, 110, 0.4, 0.25, "sawtooth");
      break;
  }
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
