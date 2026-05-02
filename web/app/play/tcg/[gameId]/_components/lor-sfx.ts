// SFX synthesized via Web Audio API pour LoR — pas besoin de fichiers
// audio externes. Sons courts, distincts par type d'événement.
//
// Utilisation côté client : import { playSfx } from "./lor-sfx" puis
// playSfx("attack") au moment opportun. Throttled pour éviter le spam.

let audioCtx: AudioContext | null = null;
let lastPlayTs: Record<string, number> = {};
const THROTTLE_MS = 80; // évite le pétage de tympan en cas de cascade

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Synthétise un bip court avec enveloppe ADSR douce. */
function beep(
  freq: number,
  durationMs: number,
  type: OscillatorType = "sine",
  volume: number = 0.15,
) {
  const ctx = getCtx();
  if (!ctx) return;
  // Si le contexte est suspendu (autoplay policy), on essaye de resume.
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  // ADSR : attack 10ms, decay 50ms, sustain 0.6, release durée totale.
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01);
  gain.gain.linearRampToValueAtTime(volume * 0.6, now + 0.06);
  gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationMs / 1000);
}

/** Glissando (sweep) entre 2 fréquences. Utile pour level-up doré. */
function sweep(
  fromFreq: number,
  toFreq: number,
  durationMs: number,
  type: OscillatorType = "triangle",
  volume: number = 0.18,
) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(fromFreq, now);
  osc.frequency.exponentialRampToValueAtTime(
    Math.max(40, toFreq),
    now + durationMs / 1000,
  );
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.02);
  gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationMs / 1000);
}

/** Couverture d'événements LoR. Throttle 80ms par event-type. */
export type SfxEvent =
  | "card-play" // jouer un sort/unité
  | "spell-cast" // sort lancé
  | "attack" // déclarer attaque
  | "damage" // dégâts à un nexus/unité
  | "heal" // heal nexus
  | "level-up" // champion L2
  | "victory" // win
  | "defeat" // loss
  | "draw" // pioche
  | "stack-resolve" // sort résout depuis pile
  | "click"; // hover/click feedback léger

export function playSfx(event: SfxEvent) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = Date.now();
  if (lastPlayTs[event] && now - lastPlayTs[event] < THROTTLE_MS) return;
  lastPlayTs[event] = now;
  switch (event) {
    case "card-play":
      beep(420, 90, "triangle", 0.12);
      break;
    case "spell-cast":
      sweep(280, 540, 180, "triangle", 0.16);
      break;
    case "attack":
      sweep(180, 90, 220, "sawtooth", 0.18);
      break;
    case "damage":
      beep(160, 120, "square", 0.14);
      break;
    case "heal":
      beep(660, 100, "sine", 0.14);
      setTimeout(() => beep(880, 80, "sine", 0.12), 60);
      break;
    case "level-up":
      // 3 notes ascendantes + sweep doré
      beep(523, 90, "triangle", 0.18); // C5
      setTimeout(() => beep(659, 90, "triangle", 0.18), 80); // E5
      setTimeout(() => beep(784, 140, "triangle", 0.2), 160); // G5
      setTimeout(() => sweep(784, 1568, 200, "sine", 0.14), 280);
      break;
    case "victory":
      beep(523, 130, "triangle", 0.2);
      setTimeout(() => beep(659, 130, "triangle", 0.2), 130);
      setTimeout(() => beep(784, 130, "triangle", 0.2), 260);
      setTimeout(() => beep(1046, 280, "triangle", 0.22), 390);
      break;
    case "defeat":
      beep(330, 200, "sawtooth", 0.18);
      setTimeout(() => beep(247, 280, "sawtooth", 0.18), 180);
      setTimeout(() => beep(165, 400, "sawtooth", 0.15), 380);
      break;
    case "draw":
      beep(660, 60, "sine", 0.1);
      break;
    case "stack-resolve":
      sweep(440, 220, 150, "triangle", 0.14);
      break;
    case "click":
      beep(880, 30, "sine", 0.05);
      break;
  }
}

/** Toggle global mute/unmute (persisté en localStorage). */
const MUTE_KEY = "lor-sfx-muted";

export function isMuted(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setMuted(muted: boolean) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

// Wrapper qui respecte le mute.
const playSfxRaw = playSfx;
export function playSfxIfEnabled(event: SfxEvent) {
  if (isMuted()) return;
  playSfxRaw(event);
}
