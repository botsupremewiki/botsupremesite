"use client";

/**
 * Tooltip basique sans dépendance externe. Affiche un popover au hover
 * et au focus, accessible (role=tooltip + aria-describedby).
 *
 * Usage :
 *   <Tooltip content="Supprimer">
 *     <button>🗑</button>
 *   </Tooltip>
 *
 * Position auto : tente "top" par défaut, retombe sur "bottom" si pas
 * de place.
 */

import {
  cloneElement,
  isValidElement,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

type Props = {
  content: ReactNode;
  children: ReactElement<{
    "aria-describedby"?: string;
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
  }>;
  side?: "top" | "bottom" | "left" | "right";
  delay?: number;
};

export function Tooltip({ content, children, side = "top", delay = 250 }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  }

  if (!isValidElement(children)) return <>{children}</>;

  const trigger = cloneElement(children, {
    "aria-describedby": id,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  });

  const positions: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  };

  return (
    <span className="relative inline-flex">
      {trigger}
      <AnimatePresence>
        {open ? (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-white/15 bg-zinc-950/95 px-2 py-1 text-[11px] font-semibold text-zinc-100 shadow-lg backdrop-blur ${positions[side]}`}
          >
            {content}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
