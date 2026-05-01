"use client";

/**
 * Sound effects synthétisés via Web Audio API.
 *
 * Pas de fichiers MP3 → pas de poids dans le bundle, pas de problème
 * d'autoplay policy une fois que l'user a interagi avec la page.
 *
 * 6 sons disponibles : click, success, error, notify, koHit, victory.
 *
 * Respect des préférences :
 *  - prefs.sounds_enabled === false → no-op (lit le cookie/localStorage)
 *  - prefers-reduced-motion respecté (silencieux)
 *
 * Usage :
 *   const sounds = useSounds()
 *   sounds.success() // joue une montée de notes
 */

import { useCallback, useEffect, useRef, useState } from "react";

type SoundName =
  | "click"
  | "success"
  | "error"
  | "notify"
  | "koHit"
  | "victory";

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (_ctx) return _ctx;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    _ctx = new Ctor();
    return _ctx;
  } catch {
    return null;
  }
}

/** Joue une note synthétisée. */
function note(
  ctx: AudioContext,
  freq: number,
  duration: number,
  gain = 0.08,
  type: OscillatorType = "sine",
  delay = 0,
) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  env.gain.value = 0;
  osc.connect(env).connect(ctx.destination);
  const start = ctx.currentTime + delay;
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(gain, start + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

const SOUND_MAP: Record<SoundName, (ctx: AudioContext) => void> = {
  click: (ctx) => {
    note(ctx, 800, 0.05, 0.05, "square");
  },
  success: (ctx) => {
    note(ctx, 587.33, 0.12, 0.07, "sine", 0); // D5
    note(ctx, 783.99, 0.18, 0.07, "sine", 0.08); // G5
    note(ctx, 1046.5, 0.25, 0.07, "sine", 0.16); // C6
  },
  error: (ctx) => {
    note(ctx, 220, 0.12, 0.08, "sawtooth", 0);
    note(ctx, 165, 0.18, 0.08, "sawtooth", 0.1);
  },
  notify: (ctx) => {
    note(ctx, 880, 0.08, 0.06, "sine", 0);
    note(ctx, 1318.5, 0.15, 0.06, "sine", 0.06);
  },
  koHit: (ctx) => {
    // White-noise-ish via square + low freq pour un thwack court.
    note(ctx, 110, 0.18, 0.12, "square");
  },
  victory: (ctx) => {
    note(ctx, 523.25, 0.18, 0.07, "sine", 0); // C5
    note(ctx, 659.25, 0.18, 0.07, "sine", 0.12); // E5
    note(ctx, 783.99, 0.25, 0.07, "sine", 0.24); // G5
    note(ctx, 1046.5, 0.4, 0.08, "sine", 0.36); // C6
  },
};

/** Lit la pref sounds_enabled depuis localStorage (cache). Default true. */
function readSoundsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = localStorage.getItem("prefs:sounds_enabled");
    return v === null ? true : v === "true";
  } catch {
    return true;
  }
}

/** Hook qui retourne les fonctions de son. Synchronisé avec
 *  prefs.sounds_enabled via localStorage cache. */
export function useSounds(): Record<SoundName, () => void> {
  const [enabled, setEnabled] = useState(false);
  const reduceMotion = useRef(false);

  useEffect(() => {
    setEnabled(readSoundsEnabled());
    if (typeof window !== "undefined") {
      reduceMotion.current = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
    }
    const handler = () => setEnabled(readSoundsEnabled());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const play = useCallback(
    (name: SoundName) => {
      if (!enabled) return;
      if (reduceMotion.current) return;
      const ctx = getCtx();
      if (!ctx) return;
      // Resume si suspend (Chrome autoplay policy).
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      try {
        SOUND_MAP[name](ctx);
      } catch {
        // ignore Web Audio errors
      }
    },
    [enabled],
  );

  return {
    click: () => play("click"),
    success: () => play("success"),
    error: () => play("error"),
    notify: () => play("notify"),
    koHit: () => play("koHit"),
    victory: () => play("victory"),
  };
}

/** Setter (en pratique appelé depuis settings-client.tsx) pour
 *  synchroniser localStorage avec la pref. */
export function setSoundsEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("prefs:sounds_enabled", String(enabled));
    // Trigger storage event sur les autres onglets.
  } catch {
    // ignore
  }
}
