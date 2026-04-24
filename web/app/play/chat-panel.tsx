"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ChatMessage } from "@shared/types";

export type ChatTabId = "local" | "zone" | "global" | "dms";

export type ChatChannel = {
  id: ChatTabId;
  label: string;
  messages: ChatMessage[];
  onSend?: (text: string) => void;
  disabledReason?: string;
};

const TAB_ORDER: ChatTabId[] = ["local", "zone", "global", "dms"];

const EXPANDED_WIDTH = 320;
const COLLAPSED_WIDTH = 36;

export function ChatPanel({
  channels,
  hint,
  connected,
  renderDm,
  currentUser,
}: {
  channels: ChatChannel[];
  hint?: string;
  connected: boolean;
  renderDm?: () => React.ReactNode;
  currentUser?: { username: string; isAdmin: boolean };
}) {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const [active, setActive] = useState<ChatTabId>(() => {
    const first = channels.find((c) => !c.disabledReason);
    return first?.id ?? "local";
  });
  const [collapsed, setCollapsed] = useState(false);
  const activeChannel = byId.get(active);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingFocusRef = useRef(false);
  const inputRefCallback = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (el && pendingFocusRef.current) {
        el.focus();
        pendingFocusRef.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    if (collapsed) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeChannel?.messages.length, active, collapsed]);

  const focusInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    } else {
      pendingFocusRef.current = true;
    }
  }, []);

  // Global "Enter" shortcut: open the chat and focus the input if the user
  // isn't currently typing in another field.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      e.preventDefault();
      setCollapsed(false);
      focusInput();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusInput]);

  const canSend =
    !!activeChannel && !activeChannel.disabledReason && connected;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || !activeChannel?.onSend || !canSend) return;
    activeChannel.onSend(text);
    setInput("");
  };

  return (
    <motion.aside
      layout
      initial={false}
      animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="flex flex-shrink-0 flex-col overflow-hidden border-l border-white/5 bg-black/30"
    >
      <AnimatePresence mode="wait" initial={false}>
        {collapsed ? (
          <motion.button
            key="collapsed"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setCollapsed(false)}
            title="Ouvrir le chat (ou appuie sur Entrée)"
            aria-label="Ouvrir le chat"
            className="group flex flex-1 cursor-pointer flex-col items-center justify-start gap-3 pt-4 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-100"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M9 3 L4 7 L9 11"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="flex flex-col items-center gap-2 text-[10px] font-semibold uppercase tracking-widest">
              {"Chat".split("").map((ch, i) => (
                <span key={i}>{ch}</span>
              ))}
            </div>
            {totalUnread(channels) > 0 && (
              <span className="mt-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-500 px-1 text-[9px] font-bold text-white">
                {totalUnread(channels)}
              </span>
            )}
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex items-center border-b border-white/5">
              <div className="flex flex-1">
                {TAB_ORDER.map((id) => {
                  const ch = byId.get(id);
                  if (!ch) return null;
                  const isActive = active === id;
                  const disabled = !!ch.disabledReason;
                  return (
                    <button
                      key={id}
                      onClick={() => !disabled && setActive(id)}
                      disabled={disabled}
                      title={ch.disabledReason ?? ""}
                      className={`relative flex-1 px-2 py-2.5 text-[11px] font-semibold uppercase tracking-widest transition-colors ${
                        isActive
                          ? "text-indigo-300"
                          : disabled
                            ? "text-zinc-700"
                            : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {ch.label}
                      {isActive && (
                        <motion.div
                          layoutId="chat-tab-underline"
                          className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-400"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                title="Réduire le chat"
                aria-label="Réduire le chat"
                className="mr-1 flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M5 3 L10 7 L5 11"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            {active === "dms" && renderDm ? (
              renderDm()
            ) : (
              <>
                <div
                  ref={scrollRef}
                  className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm"
                >
                  {activeChannel?.disabledReason ? (
                    <div className="italic text-zinc-600">
                      {activeChannel.disabledReason}
                    </div>
                  ) : activeChannel && activeChannel.messages.length === 0 ? (
                    <div className="italic text-zinc-600">
                      Aucun message pour l&apos;instant.
                    </div>
                  ) : (
                    <AnimatePresence initial={false}>
                      {activeChannel?.messages.map((m) => {
                        const showAdmin =
                          m.isAdmin ||
                          (currentUser?.isAdmin &&
                            m.playerName === currentUser.username);
                        return (
                          <motion.div
                            key={m.id}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="py-0.5 leading-snug"
                          >
                            <span className="mr-1.5 font-mono text-[10px] tabular-nums text-zinc-600">
                              {formatTime(m.timestamp)}
                            </span>
                            {showAdmin && (
                              <span className="mr-1 font-bold text-rose-500">
                                [ADMIN]
                              </span>
                            )}
                            <span className="font-semibold text-indigo-300">
                              {m.playerName}
                            </span>
                            <span className="text-zinc-500"> : </span>
                            <span className="text-zinc-100">{m.text}</span>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </div>

                <form
                  onSubmit={submit}
                  className="flex border-t border-white/5 bg-black/40"
                >
                  <input
                    ref={inputRefCallback}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      activeChannel?.disabledReason
                        ? "Canal indisponible"
                        : `Écrire dans ${activeChannel?.label ?? ""}...`
                    }
                    maxLength={200}
                    disabled={!canSend}
                    className="flex-1 bg-transparent px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || !canSend}
                    className="px-4 py-2.5 text-sm font-medium text-indigo-300 transition-colors hover:text-indigo-200 disabled:text-zinc-600"
                  >
                    Envoyer
                  </button>
                </form>
              </>
            )}

            {hint && (
              <div className="border-t border-white/5 bg-black/20 px-4 py-2 text-[11px] text-zinc-600">
                {hint}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

function totalUnread(_channels: ChatChannel[]): number {
  // Placeholder: no unread tracking yet.
  return 0;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
