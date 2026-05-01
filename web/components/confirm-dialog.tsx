"use client";

/**
 * ConfirmDialog : modal de confirmation pour les actions destructives.
 *
 * Usage :
 *   const [askDelete, confirmDelete] = useConfirm()
 *   ...
 *   <button onClick={async () => {
 *     if (await askDelete({ title: "Supprimer ce deck ?", danger: true })) {
 *       await doDelete()
 *     }
 *   }}>Supprimer</button>
 *
 *   {confirmDelete}  // dans le JSX (rendu de la modal)
 *
 * Accessible : role=alertdialog, focus trap, escape pour fermer,
 * focus initial sur le bouton "Annuler" (safe par défaut).
 */

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFocusTrap } from "@/lib/a11y";

type ConfirmOpts = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmState = ConfirmOpts & {
  resolve: (v: boolean) => void;
};

export function useConfirm(): [
  (opts: ConfirmOpts) => Promise<boolean>,
  React.ReactElement,
] {
  const [state, setState] = useState<ConfirmState | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(state !== null);

  const ask = useCallback((opts: ConfirmOpts) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  function close(value: boolean) {
    state?.resolve(value);
    setState(null);
  }

  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const node = (
    <AnimatePresence>
      {state ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
          onClick={() => close(false)}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby={state.description ? "confirm-desc" : undefined}
        >
          <motion.div
            ref={trapRef}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-white/10 bg-zinc-950 p-5 shadow-2xl"
          >
            <h3
              id="confirm-title"
              className={`text-base font-bold ${state.danger ? "text-rose-200" : "text-zinc-100"}`}
            >
              {state.title}
            </h3>
            {state.description ? (
              <p id="confirm-desc" className="mt-2 text-sm text-zinc-400">
                {state.description}
              </p>
            ) : null}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-white/10"
              >
                {state.cancelLabel ?? "Annuler"}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={`rounded-md border px-3 py-1.5 text-xs font-bold transition-colors ${
                  state.danger
                    ? "border-rose-400/50 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
                    : "border-amber-400/50 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"
                }`}
              >
                {state.confirmLabel ?? "Confirmer"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return [ask, node];
}
