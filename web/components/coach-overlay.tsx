"use client";

/**
 * CoachOverlay — overlay réutilisable pour les tutoriels pédagogiques.
 *
 * Highlight un élément du DOM (via data-tutorial-target ou ref) avec
 * un halo lumineux pulsant + une bulle de texte explicative à côté.
 *
 * Le reste de l'écran est obscurci (cutout autour de la cible),
 * forçant l'attention du joueur sur la zone à traiter.
 *
 * Usage :
 *   <CoachOverlay
 *     target='[data-tutorial-target="active-zone"]'
 *     title="Place ton Pokémon Actif"
 *     body="Clique sur Pikachu pour le mettre en Actif"
 *     onSkip={() => ...}
 *   />
 *
 * Le composant écoute les resize/scroll pour repositionner le halo.
 * Si la cible n'est pas trouvée → bulle centrée écran sans halo.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type CoachOverlayProps = {
  /** Sélecteur CSS de l'élément à highlight. Si null, bulle centrée. */
  target: string | null;
  /** Titre court de la step (ex. "Étape 3/30"). */
  stepLabel?: string;
  /** Titre principal de la bulle. */
  title: string;
  /** Description / instruction. */
  body: string;
  /** Texte du bouton "Suivant" (default "Suivant →"). null = pas de bouton
   *  (auto-advance via validation côté parent). */
  nextLabel?: string | null;
  /** Callback du bouton suivant. */
  onNext?: () => void;
  /** Callback skip tutoriel. */
  onSkip?: () => void;
  /** Numéro de step actuel (1-indexed) pour barre de progression. */
  currentStep?: number;
  /** Total de steps. */
  totalSteps?: number;
  /** Position de la bulle relative au highlight : auto, top, bottom, left, right. */
  bubblePosition?: "auto" | "top" | "bottom" | "left" | "right";
};

const HIGHLIGHT_PADDING = 8;

export function CoachOverlay({
  target,
  stepLabel,
  title,
  body,
  nextLabel = "Suivant →",
  onNext,
  onSkip,
  currentStep,
  totalSteps,
  bubblePosition = "auto",
}: CoachOverlayProps) {
  const [rect, setRect] = useState<TargetRect | null>(null);
  const rafIdRef = useRef<number | null>(null);

  /** Mesure la position de la cible. Retourne null si pas trouvée. */
  const measure = useCallback(() => {
    if (!target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(target);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top - HIGHLIGHT_PADDING,
      left: r.left - HIGHLIGHT_PADDING,
      width: r.width + HIGHLIGHT_PADDING * 2,
      height: r.height + HIGHLIGHT_PADDING * 2,
    });
  }, [target]);

  // Re-mesure au mount et à chaque change de target.
  useLayoutEffect(() => {
    measure();
    // 2e passe après animations (les Pokemon en arrivée animent leur
    // position, donc on re-mesure 300ms plus tard).
    const t = setTimeout(measure, 300);
    return () => clearTimeout(t);
  }, [measure]);

  // Re-mesure sur resize/scroll. RAF debounced pour éviter perfs.
  useEffect(() => {
    const onChange = () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        measure();
        rafIdRef.current = null;
      });
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    // Re-mesure périodique pour suivre les éléments qui apparaissent
    // après animations framer-motion ou state updates.
    const interval = window.setInterval(measure, 500);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
      window.clearInterval(interval);
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  }, [measure]);

  // Position de la bulle selon le rect cible (ou centre écran si pas de cible).
  const bubbleStyle = computeBubblePosition(rect, bubblePosition);

  return (
    <div className="pointer-events-none fixed inset-0 z-[150]">
      {/* Backdrop avec cutout autour de la cible (effet "spotlight").
          Implémenté via 4 rectangles autour du highlight (haut, bas,
          gauche, droite) qui obscurcissent le reste. */}
      {rect ? (
        <>
          <Backdrop top={0} left={0} right={0} height={rect.top} />
          <Backdrop
            top={rect.top}
            left={0}
            width={rect.left}
            height={rect.height}
          />
          <Backdrop
            top={rect.top}
            right={0}
            left={rect.left + rect.width}
            height={rect.height}
          />
          <Backdrop top={rect.top + rect.height} left={0} right={0} bottom={0} />

          {/* Halo pulsant autour de la cible */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
              opacity: 1,
              scale: 1,
              boxShadow: [
                "0 0 0 4px rgba(251,191,36,0.4), 0 0 32px rgba(251,191,36,0.6)",
                "0 0 0 8px rgba(251,191,36,0.2), 0 0 48px rgba(251,191,36,0.5)",
                "0 0 0 4px rgba(251,191,36,0.4), 0 0 32px rgba(251,191,36,0.6)",
              ],
            }}
            transition={{
              boxShadow: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
            }}
            style={{
              position: "fixed",
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }}
            className="rounded-xl ring-2 ring-amber-300/80"
            aria-hidden
          />
        </>
      ) : (
        // Pas de cible : backdrop plein écran semi-transparent.
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm" />
      )}

      {/* Bulle */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${title}-${currentStep ?? 0}`}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          style={bubbleStyle}
          className="pointer-events-auto absolute z-10 flex w-80 flex-col gap-2 rounded-xl border-2 border-amber-300/70 bg-gradient-to-br from-zinc-950 to-zinc-900 p-4 shadow-2xl shadow-amber-500/30"
        >
          {/* Progression + skip */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300/80">
              {stepLabel ??
                (currentStep && totalSteps
                  ? `Étape ${currentStep} / ${totalSteps}`
                  : "🎓 Coach")}
            </span>
            {onSkip && (
              <button
                onClick={onSkip}
                className="text-[10px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
              >
                Passer le tutoriel
              </button>
            )}
          </div>

          {/* Barre de progression */}
          {currentStep != null && totalSteps != null && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div
                animate={{ width: `${(currentStep / totalSteps) * 100}%` }}
                transition={{ duration: 0.3 }}
                className="h-full rounded-full bg-amber-400"
              />
            </div>
          )}

          <h3 className="text-base font-extrabold text-amber-100">{title}</h3>
          <p className="text-sm leading-relaxed text-zinc-300">{body}</p>

          {nextLabel && onNext && (
            <button
              onClick={onNext}
              className="mt-1 self-end rounded-md bg-gradient-to-br from-amber-400 to-amber-600 px-4 py-2 text-sm font-bold text-amber-950 shadow-lg transition-all hover:scale-[1.03] hover:from-amber-300 hover:to-amber-500"
            >
              {nextLabel}
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Rectangle obscurci. Position absolute pour cutout autour du highlight. */
function Backdrop({
  top,
  left,
  right,
  bottom,
  width,
  height,
}: {
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  width?: number;
  height?: number;
}) {
  return (
    <div
      className="fixed bg-black/65 backdrop-blur-[2px]"
      style={{ top, left, right, bottom, width, height }}
      aria-hidden
    />
  );
}

/** Calcule la position de la bulle selon le rect cible. Stratégie auto :
 *  préfère en bas si y'a la place, sinon à droite, sinon à gauche, sinon en haut. */
function computeBubblePosition(
  rect: TargetRect | null,
  preference: "auto" | "top" | "bottom" | "left" | "right",
): React.CSSProperties {
  // Pas de rect → bulle centrée à l'écran.
  if (!rect) {
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }
  const BUBBLE_W = 320;
  const BUBBLE_H = 200; // estimation
  const MARGIN = 16;
  const winW = typeof window !== "undefined" ? window.innerWidth : 1920;
  const winH = typeof window !== "undefined" ? window.innerHeight : 1080;

  // Espaces dispos autour du rect.
  const spaceBottom = winH - (rect.top + rect.height);
  const spaceTop = rect.top;
  const spaceRight = winW - (rect.left + rect.width);
  const spaceLeft = rect.left;

  let chosen: "top" | "bottom" | "left" | "right" = "bottom";
  if (preference !== "auto") {
    chosen = preference;
  } else {
    if (spaceBottom >= BUBBLE_H + MARGIN) chosen = "bottom";
    else if (spaceTop >= BUBBLE_H + MARGIN) chosen = "top";
    else if (spaceRight >= BUBBLE_W + MARGIN) chosen = "right";
    else if (spaceLeft >= BUBBLE_W + MARGIN) chosen = "left";
  }

  switch (chosen) {
    case "bottom":
      return {
        top: rect.top + rect.height + MARGIN,
        left: clamp(rect.left + rect.width / 2 - BUBBLE_W / 2, 8, winW - BUBBLE_W - 8),
      };
    case "top":
      return {
        top: rect.top - BUBBLE_H - MARGIN,
        left: clamp(rect.left + rect.width / 2 - BUBBLE_W / 2, 8, winW - BUBBLE_W - 8),
      };
    case "right":
      return {
        top: clamp(rect.top + rect.height / 2 - BUBBLE_H / 2, 8, winH - BUBBLE_H - 8),
        left: rect.left + rect.width + MARGIN,
      };
    case "left":
      return {
        top: clamp(rect.top + rect.height / 2 - BUBBLE_H / 2, 8, winH - BUBBLE_H - 8),
        left: rect.left - BUBBLE_W - MARGIN,
      };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
