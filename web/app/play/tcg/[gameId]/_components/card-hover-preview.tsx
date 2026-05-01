"use client";

// Composant de hover preview agrandi pour les cartes One Piece TCG.
// Utilise position: fixed avec coordonnées calculées au runtime pour
// éviter que le preview sorte de l'écran (auto-flip droite/gauche selon
// l'espace disponible).
//
// Usage :
//   <CardPreview cardId="OP09-001" effect="..." name="Shanks">
//     <button>...</button>  (= le trigger / la carte miniature)
//   </CardPreview>

import { useState, useRef, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

const PREVIEW_WIDTH = 280; // px
const PREVIEW_HEIGHT = 460; // px max (peut shrink si effet court)
const PREVIEW_MARGIN = 12; // marge entre le trigger et le preview

export function CardPreview({
  cardId,
  imageUrl,
  name,
  effect,
  trigger,
  children,
  className,
}: {
  cardId: string;
  imageUrl: string;
  name: string;
  effect?: string | null;
  trigger?: string | null;
  children: ReactNode;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  function compute() {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Préférence : à droite du trigger, sinon à gauche, sinon centré.
    let left = rect.right + PREVIEW_MARGIN;
    if (left + PREVIEW_WIDTH > vw - 8) {
      // Pas de place à droite → on tente à gauche.
      left = rect.left - PREVIEW_WIDTH - PREVIEW_MARGIN;
      if (left < 8) {
        // Ni gauche : centre l'écran.
        left = Math.max(8, Math.min(vw - PREVIEW_WIDTH - 8, rect.left));
      }
    }
    // Aligne verticalement au centre du trigger, mais clipper aux bords.
    let top = rect.top + rect.height / 2 - PREVIEW_HEIGHT / 2;
    if (top < 8) top = 8;
    if (top + PREVIEW_HEIGHT > vh - 8) top = vh - PREVIEW_HEIGHT - 8;
    setPos({ left, top });
  }

  useEffect(() => {
    if (!hovered) return;
    compute();
    const onResize = () => compute();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [hovered]);

  return (
    <>
      <div
        ref={triggerRef}
        className={className}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {children}
      </div>
      {hovered &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100]"
            style={{
              left: pos.left,
              top: pos.top,
              width: PREVIEW_WIDTH,
              maxHeight: PREVIEW_HEIGHT,
            }}
          >
            <div className="overflow-hidden rounded-lg border-2 border-amber-400/70 bg-zinc-950 shadow-2xl shadow-black/80">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={name}
                className="w-full object-contain"
              />
              <div className="space-y-1 p-2">
                <div className="text-sm font-bold text-amber-200">{name}</div>
                <div className="text-[10px] text-zinc-500">{cardId}</div>
                {effect && (
                  <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-snug text-zinc-200">
                    {effect}
                  </div>
                )}
                {trigger && (
                  <div className="rounded border border-amber-500/30 bg-amber-500/10 p-1.5 text-xs text-amber-200">
                    <span className="font-bold">⚡ Trigger : </span>
                    {trigger}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
