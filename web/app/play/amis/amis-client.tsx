"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

type Friend = {
  friend_id: string;
  username: string;
  avatar_url: string | null;
  status: "pending" | "accepted";
  is_outgoing: boolean;
  created_at: string;
};

type SearchResult = {
  id: string;
  username: string;
  avatar_url: string | null;
};

type Tab = "friends" | "requests" | "add";

export function AmisClient({ currentUserId }: { currentUserId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("friends");
  const [list, setList] = useState<Friend[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data, error: rpcError } = await supabase.rpc("friend_list");
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setList((data ?? []) as Friend[]);
  }, [supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const accepted = list.filter((f) => f.status === "accepted");
  const incoming = list.filter(
    (f) => f.status === "pending" && !f.is_outgoing,
  );
  const outgoing = list.filter(
    (f) => f.status === "pending" && f.is_outgoing,
  );

  const callRpc = useCallback(
    async (name: string, args: Record<string, unknown>, key: string) => {
      if (!supabase) return;
      setActionState((s) => ({ ...s, [key]: "pending" }));
      const { error: rpcError } = await supabase.rpc(name, args);
      if (rpcError) {
        setActionState((s) => ({ ...s, [key]: rpcError.message }));
      } else {
        setActionState((s) => {
          const next = { ...s };
          delete next[key];
          return next;
        });
        await refresh();
      }
    },
    [supabase, refresh],
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {/* Tabs ─────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-1 text-xs font-semibold uppercase tracking-widest">
        <TabButton
          active={tab === "friends"}
          onClick={() => setTab("friends")}
          label="Mes amis"
          count={accepted.length}
        />
        <TabButton
          active={tab === "requests"}
          onClick={() => setTab("requests")}
          label="Demandes"
          count={incoming.length}
          highlight={incoming.length > 0}
        />
        <TabButton
          active={tab === "add"}
          onClick={() => setTab("add")}
          label="Ajouter"
        />
      </div>

      {error && (
        <div className="rounded-md border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      )}

      {tab === "friends" && (
        <FriendList
          friends={accepted}
          actionState={actionState}
          onRemove={(id) =>
            callRpc("friend_remove", { p_other: id }, `remove-${id}`)
          }
        />
      )}

      {tab === "requests" && (
        <RequestList
          incoming={incoming}
          outgoing={outgoing}
          actionState={actionState}
          onAccept={(id) =>
            callRpc("friend_accept", { p_requester: id }, `accept-${id}`)
          }
          onDecline={(id) =>
            callRpc("friend_decline", { p_requester: id }, `decline-${id}`)
          }
          onCancel={(id) =>
            callRpc("friend_remove", { p_other: id }, `cancel-${id}`)
          }
        />
      )}

      {tab === "add" && (
        <AddFriendTab
          currentUserId={currentUserId}
          existingIds={new Set(list.map((f) => f.friend_id))}
          actionState={actionState}
          onSendRequest={(id) =>
            callRpc("friend_request", { p_target: id }, `request-${id}`)
          }
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
  highlight,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 transition-colors ${
        active
          ? "bg-white/10 text-zinc-100"
          : "text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-black ${
            highlight ? "bg-rose-500 text-white" : "bg-white/10 text-zinc-300"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function FriendList({
  friends,
  actionState,
  onRemove,
}: {
  friends: Friend[];
  actionState: Record<string, string>;
  onRemove: (id: string) => void;
}) {
  if (friends.length === 0) {
    return (
      <EmptyState
        title="Aucun ami pour le moment"
        body="Va dans l'onglet « Ajouter » pour chercher des joueurs et leur envoyer une demande."
      />
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <AnimatePresence>
        {friends.map((f) => (
          <motion.div
            key={f.friend_id}
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3"
          >
            <div className="flex items-center gap-3">
              <Avatar url={f.avatar_url} name={f.username} />
              <div>
                <div className="text-sm font-semibold text-zinc-100">
                  {f.username}
                </div>
                <div className="text-[10px] text-zinc-500">
                  Ami depuis{" "}
                  {new Date(f.created_at).toLocaleDateString("fr-FR")}
                </div>
              </div>
            </div>
            <button
              onClick={() => onRemove(f.friend_id)}
              disabled={actionState[`remove-${f.friend_id}`] === "pending"}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-40"
            >
              Retirer
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function RequestList({
  incoming,
  outgoing,
  actionState,
  onAccept,
  onDecline,
  onCancel,
}: {
  incoming: Friend[];
  outgoing: Friend[];
  actionState: Record<string, string>;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <EmptyState
        title="Aucune demande en cours"
        body="Tu n'as pas de demande d'ami en attente. Quand quelqu'un te demande en ami, ça apparaîtra ici."
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {incoming.length > 0 && (
        <section>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-rose-300">
            Demandes reçues ({incoming.length})
          </div>
          <div className="flex flex-col gap-1.5">
            {incoming.map((f) => (
              <div
                key={f.friend_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-rose-400/20 bg-rose-400/5 p-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar url={f.avatar_url} name={f.username} />
                  <div className="text-sm font-semibold text-zinc-100">
                    {f.username}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onAccept(f.friend_id)}
                    disabled={
                      actionState[`accept-${f.friend_id}`] === "pending"
                    }
                    className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-400 disabled:opacity-40"
                  >
                    Accepter
                  </button>
                  <button
                    onClick={() => onDecline(f.friend_id)}
                    disabled={
                      actionState[`decline-${f.friend_id}`] === "pending"
                    }
                    className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-40"
                  >
                    Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {outgoing.length > 0 && (
        <section>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
            Demandes envoyées ({outgoing.length})
          </div>
          <div className="flex flex-col gap-1.5">
            {outgoing.map((f) => (
              <div
                key={f.friend_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar url={f.avatar_url} name={f.username} />
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">
                      {f.username}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      En attente de réponse
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onCancel(f.friend_id)}
                  disabled={
                    actionState[`cancel-${f.friend_id}`] === "pending"
                  }
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/10 disabled:opacity-40"
                >
                  Annuler
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AddFriendTab({
  currentUserId,
  existingIds,
  actionState,
  onSendRequest,
}: {
  currentUserId: string;
  existingIds: Set<string>;
  actionState: Record<string, string>;
  onSendRequest: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .ilike("username", `%${trimmed}%`)
        .neq("id", currentUserId)
        .limit(20);
      if (!cancelled) {
        setResults((data ?? []) as SearchResult[]);
        setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, supabase, currentUserId]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        autoFocus
        placeholder="Cherche un pseudo (au moins 2 lettres)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
      {searching && (
        <div className="text-xs text-zinc-500">Recherche…</div>
      )}
      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <div className="text-xs text-zinc-500">Aucun joueur trouvé.</div>
      )}
      <div className="flex flex-col gap-1.5">
        {results.map((r) => {
          const already = existingIds.has(r.id);
          const state = actionState[`request-${r.id}`];
          return (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3"
            >
              <div className="flex items-center gap-3">
                <Avatar url={r.avatar_url} name={r.username} />
                <div className="text-sm font-semibold text-zinc-100">
                  {r.username}
                </div>
              </div>
              {already ? (
                <span className="text-[10px] text-zinc-500">
                  Déjà dans tes amis ou demande envoyée
                </span>
              ) : (
                <button
                  onClick={() => onSendRequest(r.id)}
                  disabled={state === "pending"}
                  className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
                >
                  {state === "pending" ? "…" : "Demander"}
                </button>
              )}
              {state && state !== "pending" && (
                <span className="text-[10px] text-rose-300">{state}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 text-center">
      <div className="text-sm font-semibold text-zinc-200">{title}</div>
      <div className="mt-1 text-xs text-zinc-500">{body}</div>
    </div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="h-9 w-9 rounded-full border border-white/10 object-cover"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500 text-sm font-semibold text-white">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
