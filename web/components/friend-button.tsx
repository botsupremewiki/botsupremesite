"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type FriendState =
  | { kind: "none" }
  | { kind: "outgoing" }
  | { kind: "incoming" }
  | { kind: "friends" };

export function FriendButton({
  targetId,
  initialState,
}: {
  targetId: string;
  initialState: FriendState;
}) {
  const router = useRouter();
  const [state, setState] = useState<FriendState>(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rpc(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    if (!supabase) {
      setBusy(false);
      return false;
    }
    const { error: rpcErr } = await supabase.rpc(fn, args);
    setBusy(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return false;
    }
    router.refresh();
    return true;
  }

  if (state.kind === "none") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (await rpc("friend_request", { p_target: targetId })) {
            setState({ kind: "outgoing" });
          }
        }}
        className="rounded-md border border-cyan-300/40 bg-cyan-300/10 px-2.5 py-1 text-[11px] font-bold text-cyan-200 transition-colors hover:bg-cyan-300/20 disabled:opacity-50"
      >
        🤝 Ajouter en ami
        {error ? ` · ${error}` : ""}
      </button>
    );
  }
  if (state.kind === "outgoing") {
    return (
      <span className="rounded-md border border-zinc-400/30 bg-zinc-400/10 px-2.5 py-1 text-[11px] text-zinc-300">
        ⏳ Demande envoyée
      </span>
    );
  }
  if (state.kind === "incoming") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (await rpc("friend_accept", { p_requester: targetId })) {
            setState({ kind: "friends" });
          }
        }}
        className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
      >
        ✅ Accepter la demande
      </button>
    );
  }
  // friends
  return (
    <span className="rounded-md border border-emerald-300/40 bg-emerald-300/10 px-2.5 py-1 text-[11px] font-bold text-emerald-200">
      🤝 Amis
    </span>
  );
}
