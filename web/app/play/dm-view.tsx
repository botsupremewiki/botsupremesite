"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { DmHub } from "./use-dm-hub";

export function DmView({
  hub,
  selfAuthId,
  selfIsAdmin = false,
  selfIsBooster = false,
  selfUsername,
}: {
  hub: DmHub;
  selfAuthId: string;
  selfIsAdmin?: boolean;
  selfIsBooster?: boolean;
  selfUsername?: string;
}) {
  const [activePartner, setActivePartner] = useState<{
    id: string;
    name: string;
    avatarUrl?: string;
  } | null>(null);
  const [composer, setComposer] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeMessages = activePartner
    ? (hub.threadsByPartner[activePartner.id] ?? [])
    : [];

  useEffect(() => {
    if (!activePartner) return;
    hub.loadThread(activePartner.id);
    hub.markRead(activePartner.id);
  }, [activePartner?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeMessages.length, activePartner?.id]);

  const doSearch = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      hub.lookupUser(searchTerm.trim());
    },
    [hub, searchTerm],
  );

  const startChatWith = useCallback(
    (user: { id: string; username: string; avatarUrl?: string }) => {
      if (user.id === selfAuthId) return;
      setActivePartner({
        id: user.id,
        name: user.username,
        avatarUrl: user.avatarUrl,
      });
      setShowSearch(false);
      setSearchTerm("");
    },
    [selfAuthId],
  );

  const sendComposer = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const text = composer.trim();
      if (!text || !activePartner) return;
      hub.sendDm(activePartner.id, text);
      setComposer("");
    },
    [composer, activePartner, hub],
  );

  if (hub.status === "idle") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <div className="italic text-zinc-600">
          Connecte-toi avec Discord pour utiliser les DMs.
        </div>
      </div>
    );
  }

  if (activePartner) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
          <button
            type="button"
            onClick={() => setActivePartner(null)}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-white/5"
            aria-label="Retour à la liste"
          >
            <svg viewBox="0 0 14 14" width="12" height="12" fill="none">
              <path
                d="M9 3 L4 7 L9 11"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <Avatar url={activePartner.avatarUrl} name={activePartner.name} />
          <div className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">
            {activePartner.name}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 py-2 text-sm"
        >
          {activeMessages.length === 0 ? (
            <div className="italic text-zinc-600">
              Aucun message. Écris le premier.
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {activeMessages.map((m) => {
                const mine = m.senderId === selfAuthId;
                const showAdmin = mine && selfIsAdmin;
                // ADMIN > BOOSTER : un seul badge à la fois.
                const showBooster = mine && !selfIsAdmin && selfIsBooster;
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mb-1.5 flex flex-col ${mine ? "items-end" : "items-start"}`}
                  >
                    {showAdmin && (
                      <span className="mb-0.5 text-[9px] font-bold text-rose-500">
                        [ADMIN] {selfUsername ?? ""}
                      </span>
                    )}
                    {showBooster && (
                      <span className="mb-0.5 text-[9px] font-bold text-fuchsia-400">
                        [BOOSTER] {selfUsername ?? ""}
                      </span>
                    )}
                    <div
                      className={`max-w-[75%] rounded-2xl px-3 py-1.5 text-[13px] leading-snug ${
                        mine
                          ? "bg-indigo-500 text-white"
                          : "bg-white/10 text-zinc-100"
                      }`}
                    >
                      {m.content}
                    </div>
                    <span className="mt-0.5 text-[9px] font-mono text-zinc-600">
                      {formatDmTime(m.createdAt)}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        <form
          onSubmit={sendComposer}
          className="flex border-t border-white/5 bg-black/40"
        >
          <input
            autoFocus
            type="text"
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder={`Message à ${activePartner.name}...`}
            maxLength={500}
            disabled={hub.status !== "connected"}
            className="flex-1 bg-transparent px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!composer.trim() || hub.status !== "connected"}
            className="px-4 py-2.5 text-sm font-medium text-indigo-300 transition-colors hover:text-indigo-200 disabled:text-zinc-600"
          >
            Envoyer
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <div className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Conversations
        </div>
        <button
          type="button"
          onClick={() => setShowSearch((v) => !v)}
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
          aria-label="Nouveau message"
          title="Nouveau message"
        >
          <svg viewBox="0 0 14 14" width="14" height="14" fill="none">
            <path
              d="M7 2 V12 M2 7 H12"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {showSearch && (
        <div className="border-b border-white/5 bg-black/20 px-3 py-2">
          <form onSubmit={doSearch} className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                hub.lookupUser(e.target.value.trim());
              }}
              placeholder="Chercher un joueur..."
              maxLength={30}
              className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </form>
          <div className="mt-2 space-y-1">
            {hub.searchResults
              .filter((r) => r.id !== selfAuthId)
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => startChatWith(r)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                >
                  <Avatar url={r.avatarUrl} name={r.username} />
                  <span className="text-xs text-zinc-200">{r.username}</span>
                </button>
              ))}
            {hub.searchResults.length === 0 && searchTerm.trim() && (
              <div className="px-2 py-1 text-xs italic text-zinc-600">
                Aucun résultat.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {hub.conversations.length === 0 ? (
          <div className="p-4 text-center italic text-zinc-600">
            Aucune conversation.
            <br />
            Clique sur + pour en démarrer une.
          </div>
        ) : (
          hub.conversations.map((c) => {
            const lastMine = c.lastMessage.senderId === selfAuthId;
            return (
              <button
                key={c.partnerId}
                type="button"
                onClick={() =>
                  setActivePartner({
                    id: c.partnerId,
                    name: c.partnerName,
                    avatarUrl: c.partnerAvatarUrl,
                  })
                }
                className="flex w-full items-center gap-2 border-b border-white/5 px-3 py-2 text-left transition-colors hover:bg-white/5"
              >
                <Avatar url={c.partnerAvatarUrl} name={c.partnerName} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-zinc-100">
                      {c.partnerName}
                    </span>
                    {c.unreadCount > 0 && (
                      <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-500 px-1 text-[9px] font-bold text-white">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-zinc-500">
                    {lastMine && "Toi : "}
                    {c.lastMessage.content}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function formatDmTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function Avatar({ url, name }: { url?: string; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        width={24}
        height={24}
        className="h-6 w-6 flex-shrink-0 rounded-full border border-white/10 object-cover"
      />
    );
  }
  return (
    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500 text-[11px] font-semibold text-white">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
