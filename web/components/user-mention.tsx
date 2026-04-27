"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Pseudo cliquable utilisé partout (chat, leaderboards, sièges casino…).
 *
 * Au clic, ouvre un petit popup avec les actions communes :
 *   • Voir le profil  →  /u/[username]
 *   • Envoyer un MP   →  ouvre l'onglet « DMs » du chat global
 *   • Ajouter en ami  →  RPC `friend_request`
 *
 * Quand `isSelf` est vrai, on rend simplement un span non-cliquable —
 * pas de popup contextuel sur soi-même.
 */
export function UserMention({
  name,
  isSelf = false,
  className,
  isAdmin = false,
}: {
  name: string;
  isSelf?: boolean;
  className?: string;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Lookup the userId by username when the popup opens. Cached after the
  // first lookup for the lifetime of the component.
  useEffect(() => {
    if (!open || !supabase || userId !== null) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", name)
        .maybeSingle();
      if (!cancelled && data?.id) setUserId(data.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supabase, name, userId]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const baseSpanClass =
    className ??
    `font-semibold ${isAdmin ? "text-rose-400" : "text-indigo-300"}`;

  if (isSelf) {
    return <span className={baseSpanClass}>{name}</span>;
  }

  async function sendFriendRequest() {
    if (!userId || !supabase || busy) return;
    setBusy(true);
    setActionFeedback(null);
    const { error } = await supabase.rpc("friend_request", {
      p_target: userId,
    });
    setBusy(false);
    setActionFeedback(error ? error.message : "Demande envoyée ✓");
    if (!error) {
      window.setTimeout(() => setOpen(false), 1100);
    }
  }

  function openDm() {
    if (!userId) return;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("open-dm-with", name);
    }
    // Best-effort : si on est sur une page avec ChatPanel, on switche
    // l'onglet DMs en programmatique. Le DmView peut lire le sessionStorage
    // au mount pour pré-remplir la recherche.
    const tab = document.querySelector('[data-chat-tab="dms"]');
    if (tab instanceof HTMLElement) {
      tab.click();
    } else {
      setActionFeedback("Va dans l'onglet DMs du chat pour démarrer.");
      return;
    }
    setOpen(false);
  }

  return (
    <span ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${baseSpanClass} cursor-pointer rounded px-0.5 transition-colors hover:bg-white/5 hover:underline`}
      >
        {name}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[200] mt-1 w-48 overflow-hidden rounded-lg border border-white/10 bg-zinc-900/95 shadow-xl backdrop-blur-md">
          <div className="border-b border-white/5 px-3 py-2 text-[11px] font-semibold text-zinc-300">
            {name}
          </div>
          <a
            href={`/u/${encodeURIComponent(name)}`}
            className="block px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-white/5"
          >
            👤 Voir le profil
          </a>
          <button
            type="button"
            onClick={openDm}
            disabled={!userId || busy}
            className="block w-full px-3 py-1.5 text-left text-xs text-zinc-200 transition-colors hover:bg-white/5 disabled:opacity-40"
          >
            💬 Envoyer un MP
          </button>
          <button
            type="button"
            onClick={sendFriendRequest}
            disabled={!userId || busy}
            className="block w-full px-3 py-1.5 text-left text-xs text-zinc-200 transition-colors hover:bg-white/5 disabled:opacity-40"
          >
            🤝 Ajouter en ami
          </button>
          {actionFeedback && (
            <div className="border-t border-white/5 bg-black/20 px-3 py-1.5 text-[10px] text-zinc-400">
              {actionFeedback}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
