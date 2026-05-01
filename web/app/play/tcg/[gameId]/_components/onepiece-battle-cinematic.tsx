"use client";

// Composants cinematics du combat One Piece TCG :
// - LeaderShowdown : présentation des 2 Leaders en début de match (mulligan)
// - VictoryScreen : écran de victoire plein écran avec Joly Roger flottant
// - DefeatScreen : écran de défaite assombri

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { ONEPIECE_BASE_SET_BY_ID } from "@shared/tcg-onepiece-base";

export function LeaderShowdown({
  selfLeaderId,
  oppLeaderId,
  selfName,
  oppName,
  show,
  onDone,
}: {
  selfLeaderId: string | null;
  oppLeaderId: string | null;
  selfName: string;
  oppName: string;
  show: boolean;
  onDone: () => void;
}) {
  // Auto-dismiss après 3.5s.
  useEffect(() => {
    if (!show) return;
    const timeout = setTimeout(onDone, 3500);
    return () => clearTimeout(timeout);
  }, [show, onDone]);

  if (!selfLeaderId || !oppLeaderId) return null;
  const selfMeta = ONEPIECE_BASE_SET_BY_ID.get(selfLeaderId);
  const oppMeta = ONEPIECE_BASE_SET_BY_ID.get(oppLeaderId);
  if (!selfMeta || !oppMeta) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={onDone}
        >
          {/* Background motif vague rouge/or */}
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                "radial-gradient(ellipse_at_center, rgba(220,38,38,0.4) 0%, transparent 60%)",
            }}
          />

          <div className="relative flex w-full max-w-5xl items-center justify-around gap-4 px-4">
            {/* Adversaire — entre par la gauche */}
            <motion.div
              initial={{ x: -100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-col items-center gap-2"
            >
              <div className="text-xs uppercase tracking-widest text-zinc-400">
                Adversaire
              </div>
              <div className="rounded-2xl border-4 border-rose-500/80 shadow-[0_0_60px_rgba(244,63,94,0.5)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={oppMeta.image}
                  alt={oppMeta.name}
                  className="h-72 w-52 rounded-xl object-contain sm:h-96 sm:w-64"
                />
              </div>
              <div className="rounded-lg border-2 border-rose-400/60 bg-rose-950/80 px-3 py-1 text-base font-bold text-rose-200">
                {oppMeta.name}
              </div>
              <div className="text-xs text-zinc-400">{oppName}</div>
            </motion.div>

            {/* Versus central animé */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: [0, 1.5, 1], rotate: 0 }}
              transition={{ duration: 0.7, delay: 0.6 }}
              className="flex flex-col items-center gap-2 text-center"
            >
              <div className="font-pirate text-7xl tracking-widest text-amber-300 drop-shadow-[0_0_24px_rgba(251,191,36,0.5)] sm:text-9xl">
                VS
              </div>
              <div className="font-pirate text-xl uppercase tracking-widest text-amber-200">
                À l'abordage !
              </div>
            </motion.div>

            {/* Soi — entre par la droite */}
            <motion.div
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex flex-col items-center gap-2"
            >
              <div className="text-xs uppercase tracking-widest text-zinc-400">
                Toi
              </div>
              <div className="rounded-2xl border-4 border-emerald-500/80 shadow-[0_0_60px_rgba(52,211,153,0.5)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selfMeta.image}
                  alt={selfMeta.name}
                  className="h-72 w-52 rounded-xl object-contain sm:h-96 sm:w-64"
                />
              </div>
              <div className="rounded-lg border-2 border-emerald-400/60 bg-emerald-950/80 px-3 py-1 text-base font-bold text-emerald-200">
                {selfMeta.name}
              </div>
              <div className="text-xs text-zinc-400">{selfName}</div>
            </motion.div>
          </div>

          {/* Hint pour passer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 text-xs text-zinc-400"
          >
            (clique pour passer)
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function VictoryScreen({
  show,
  onClose,
  reason,
}: {
  show: boolean;
  onClose: () => void;
  reason?: string;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
        >
          {/* Background animé : étoiles dorées qui tombent */}
          <FloatingStars />

          <div className="relative flex flex-col items-center gap-6 px-4 text-center">
            {/* Joly Roger flottant */}
            <motion.div
              initial={{ y: 30, scale: 0, rotate: -15 }}
              animate={{
                y: [30, -10, 0],
                scale: [0, 1.3, 1],
                rotate: [-15, 5, 0],
              }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="text-9xl"
            >
              🏴‍☠️
            </motion.div>
            {/* Texte VICTOIRE géant */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.4, 1], opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="font-pirate bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 bg-clip-text text-7xl tracking-widest text-transparent drop-shadow-[0_0_30px_rgba(251,191,36,0.6)] sm:text-9xl"
            >
              VICTOIRE
            </motion.div>
            {reason && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 }}
                className="max-w-md text-sm text-amber-200/90"
              >
                {reason}
              </motion.div>
            )}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5 }}
              onClick={onClose}
              className="rounded-full border-2 border-amber-300/80 bg-amber-500/20 px-8 py-2.5 text-lg font-bold text-amber-100 backdrop-blur transition-colors hover:bg-amber-500/40"
            >
              Continuer
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function DefeatScreen({
  show,
  onClose,
  reason,
}: {
  show: boolean;
  onClose: () => void;
  reason?: string;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md"
        >
          <div className="relative flex flex-col items-center gap-6 px-4 text-center">
            <motion.div
              initial={{ scale: 1.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.8 }}
              transition={{ duration: 0.8 }}
              className="text-9xl grayscale"
            >
              ☠️
            </motion.div>
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="font-pirate text-7xl tracking-widest text-zinc-300 drop-shadow-md sm:text-8xl"
            >
              DÉFAITE
            </motion.div>
            {reason && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="max-w-md text-sm text-zinc-400"
              >
                {reason}
              </motion.div>
            )}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.3 }}
              onClick={onClose}
              className="rounded-full border-2 border-zinc-400/40 bg-zinc-700/40 px-8 py-2.5 text-lg font-bold text-zinc-200 backdrop-blur transition-colors hover:bg-zinc-700/60"
            >
              Continuer
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FloatingStars() {
  // 12 étoiles aléatoires qui tombent.
  const [stars] = useState(() =>
    Array.from({ length: 14 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 3 + Math.random() * 2,
      size: 0.5 + Math.random() * 1,
    })),
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((s) => (
        <motion.div
          key={s.id}
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: ["0vh", "100vh"], opacity: [0, 1, 0.5, 0] }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute"
          style={{
            left: `${s.left}%`,
            fontSize: `${s.size}rem`,
          }}
        >
          ⭐
        </motion.div>
      ))}
    </div>
  );
}
