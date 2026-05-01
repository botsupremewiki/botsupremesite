"use client";

import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";

/**
 * Bouton "Envoyer un message" depuis le profil public. Stocke l'intent
 * dans sessionStorage et redirige vers /play. Le DmView (chargé dans le
 * sidebar de chat global) lit cet intent au montage et ouvre la
 * conversation correspondante.
 */
export function MessageButton({
  targetId,
  targetUsername,
  targetAvatarUrl,
}: {
  targetId: string;
  targetUsername: string;
  targetAvatarUrl?: string | null;
}) {
  const router = useRouter();
  function go() {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        "dm:open-with",
        JSON.stringify({
          id: targetId,
          name: targetUsername,
          avatarUrl: targetAvatarUrl ?? null,
          ts: Date.now(),
        }),
      );
    } catch {
      // ignore storage errors
    }
    router.push("/play");
  }
  return (
    <button
      type="button"
      onClick={go}
      aria-label={`Envoyer un message privé à ${targetUsername}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-violet-300/40 bg-violet-300/10 px-2.5 py-1 text-[11px] font-bold text-violet-200 transition-colors hover:bg-violet-300/20"
    >
      <MessageCircle size={12} aria-hidden="true" />
      Message privé
    </button>
  );
}
