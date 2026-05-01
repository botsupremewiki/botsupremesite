"use client";

// Effets visuels plein écran pour les transitions importantes du combat
// (flash trigger, KO, attaque déclenchée). Listen sur les évènements
// d'état et affiche des overlays brefs.

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { OnePieceBattleState } from "@shared/types";

type Effect =
  | { id: number; kind: "trigger-flash"; cardName: string }
  | { id: number; kind: "ko"; targetUid: string }
  | { id: number; kind: "attack"; from: string; to: string }
  | { id: number; kind: "life-taken" };

let counter = 0;
function nextId() {
  counter++;
  return counter;
}

export function BattleEffects({ state }: { state: OnePieceBattleState | null }) {
  const [effects, setEffects] = useState<Effect[]>([]);
  const prevRef = useRef<OnePieceBattleState | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    const next = state;
    prevRef.current = next;
    if (!prev || !next) return;
    const newEffects: Effect[] = [];

    // pendingTrigger nouveau ?
    if (!prev.pendingTrigger && next.pendingTrigger) {
      const cardName = next.pendingTrigger.cardId;
      newEffects.push({ id: nextId(), kind: "trigger-flash", cardName });
    }

    // pendingAttack nouveau ?
    if (!prev.pendingAttack && next.pendingAttack) {
      newEffects.push({
        id: nextId(),
        kind: "attack",
        from: next.pendingAttack.attackerUid,
        to: next.pendingAttack.targetUid,
      });
    }

    // KO : Persos count drop dans les 2 seats
    if (
      prev.self &&
      next.self &&
      prev.self.characters.length > next.self.characters.length
    ) {
      newEffects.push({ id: nextId(), kind: "ko", targetUid: "self" });
    }
    if (
      prev.opponent &&
      next.opponent &&
      prev.opponent.characters.length > next.opponent.characters.length
    ) {
      newEffects.push({ id: nextId(), kind: "ko", targetUid: "opp" });
    }

    // Vie prise (handCount + life baisse)
    if (
      prev.self &&
      next.self &&
      prev.self.life > next.self.life
    ) {
      newEffects.push({ id: nextId(), kind: "life-taken" });
    }
    if (
      prev.opponent &&
      next.opponent &&
      prev.opponent.life > next.opponent.life
    ) {
      newEffects.push({ id: nextId(), kind: "life-taken" });
    }

    if (newEffects.length === 0) return;
    setEffects((prev) => [...prev, ...newEffects]);
    // Auto-clear chaque effet après son anim.
    for (const eff of newEffects) {
      const lifetime =
        eff.kind === "trigger-flash"
          ? 1500
          : eff.kind === "ko"
            ? 800
            : eff.kind === "attack"
              ? 600
              : 700;
      setTimeout(() => {
        setEffects((prev) => prev.filter((e) => e.id !== eff.id));
      }, lifetime);
    }
  }, [state]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <AnimatePresence>
        {effects.map((eff) => {
          if (eff.kind === "trigger-flash") {
            return (
              <motion.div
                key={eff.id}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: [0, 1, 0.8, 0], scale: [0.5, 1.2, 1, 0.95] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.4, times: [0, 0.2, 0.5, 1] }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(ellipse_at_center, rgba(251,191,36,0.4) 0%, rgba(251,191,36,0.1) 30%, transparent 60%)",
                  }}
                />
                <div className="relative rounded-2xl border-4 border-amber-300/90 bg-gradient-to-br from-amber-400/30 to-amber-700/30 px-12 py-6 text-4xl font-extrabold tracking-widest text-amber-100 shadow-2xl shadow-amber-500/50 backdrop-blur-sm">
                  ⚡ DÉCLENCHEMENT !
                </div>
              </motion.div>
            );
          }
          if (eff.kind === "ko") {
            return (
              <motion.div
                key={eff.id}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: [0, 1, 0], scale: [0.6, 1.4, 2] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7 }}
                className={`absolute ${
                  eff.targetUid === "self" ? "bottom-1/3" : "top-1/3"
                } left-1/2 -translate-x-1/2`}
              >
                <div className="rounded-full border-4 border-red-500 bg-red-600/80 px-6 py-3 text-2xl font-extrabold text-white shadow-2xl shadow-red-500/80">
                  💥 K.O.
                </div>
              </motion.div>
            );
          }
          if (eff.kind === "attack") {
            return (
              <motion.div
                key={eff.id}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: [0, 1, 0.8, 0], scale: [0.7, 1.1, 1, 0.9] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.55 }}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              >
                <div className="rounded-xl border-2 border-rose-400 bg-rose-600/30 px-6 py-2 text-xl font-extrabold tracking-widest text-rose-100 shadow-xl shadow-rose-500/50 backdrop-blur-sm">
                  ⚔️ ATTAQUE !
                </div>
              </motion.div>
            );
          }
          if (eff.kind === "life-taken") {
            return (
              <motion.div
                key={eff.id}
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: [0, 1, 0], x: [-50, 0, 50] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.65 }}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              >
                <div className="rounded-lg border-2 border-rose-300 bg-rose-500/40 px-4 py-1.5 text-lg font-bold text-rose-100 shadow-lg shadow-rose-500/40 backdrop-blur-sm">
                  ❤️‍🩹 -1 Vie
                </div>
              </motion.div>
            );
          }
          return null;
        })}
      </AnimatePresence>
    </div>
  );
}
