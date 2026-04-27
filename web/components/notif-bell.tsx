"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Notif = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const KIND_ICON: Record<string, string> = {
  friend_request: "👤",
  friend_accept: "🤝",
  quest_complete: "📜",
  achievement_unlocked: "🏆",
  guild_invite: "🏰",
  pvp_attacked: "⚔️",
  system: "🔔",
};

export function NotifBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  const unread = items.filter((n) => !n.read_at).length;

  // Fetch + realtime poll every 30s.
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    async function load() {
      if (!supabase) return;
      setLoading(true);
      const { data } = await supabase
        .from("notifications")
        .select("id,kind,title,body,link,read_at,created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (!cancelled) {
        setItems((data ?? []) as Notif[]);
        setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [supabase]);

  // Click outside to close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  async function markRead(id: string) {
    if (!supabase) return;
    await supabase.rpc("notifications_mark_read", { p_ids: [id] });
    setItems((arr) =>
      arr.map((n) =>
        n.id === id && !n.read_at
          ? { ...n, read_at: new Date().toISOString() }
          : n,
      ),
    );
  }
  async function markAll() {
    if (!supabase) return;
    await supabase.rpc("notifications_mark_all_read");
    setItems((arr) =>
      arr.map((n) =>
        n.read_at ? n : { ...n, read_at: new Date().toISOString() },
      ),
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base text-zinc-100 transition-colors hover:bg-white/10"
        aria-label="Notifications"
        title="Notifications"
      >
        <span>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 shadow-xl shadow-black/40 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
            <div className="text-xs font-semibold text-zinc-200">
              Notifications
            </div>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="text-[10px] uppercase tracking-widest text-emerald-300 hover:text-emerald-200"
              >
                Tout marquer lu
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-500">
                Chargement…
              </div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500">
                Pas de notifications.
              </div>
            ) : (
              items.map((n) => {
                const icon = KIND_ICON[n.kind] ?? "🔔";
                const inner = (
                  <div
                    className={`flex gap-2 border-b border-white/5 px-3 py-2 text-xs transition-colors hover:bg-white/[0.04] ${
                      n.read_at ? "opacity-60" : ""
                    }`}
                  >
                    <div className="text-base leading-none">{icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-zinc-100">
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="truncate text-[11px] text-zinc-400">
                          {n.body}
                        </div>
                      )}
                      <div className="text-[10px] text-zinc-500">
                        {timeAgo(n.created_at)}
                      </div>
                    </div>
                    {!n.read_at && (
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400"
                        aria-label="Non lu"
                      />
                    )}
                  </div>
                );
                if (n.link) {
                  return (
                    <Link
                      key={n.id}
                      href={n.link}
                      onClick={() => {
                        markRead(n.id);
                        setOpen(false);
                      }}
                      className="block"
                    >
                      {inner}
                    </Link>
                  );
                }
                return (
                  <button
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className="block w-full text-left"
                  >
                    {inner}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}
