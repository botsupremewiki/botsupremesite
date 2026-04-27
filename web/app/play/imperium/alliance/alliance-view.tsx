"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  ImperiumAllianceRow,
  ImperiumAllianceMemberRow,
} from "@shared/imperium";
import { useImperiumAllianceChat } from "./use-imperium-alliance-chat";

type Props = {
  userId: string;
  username: string;
  alliance: ImperiumAllianceRow | null;
  members: ImperiumAllianceMemberRow[];
};

export function AllianceView({ userId, username, alliance, members }: Props) {
  if (alliance) {
    return (
      <ExistingAlliance
        alliance={alliance}
        members={members}
        userId={userId}
        username={username}
      />
    );
  }
  return <CreateAlliance />;
}

function CreateAlliance() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [color, setColor] = useState("#a78bfa");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      const { error: rpcErr } = await supabase.rpc("imperium_create_alliance", {
        p_name: name.trim(),
        p_tag: tag.trim().toUpperCase(),
        p_color: color,
      });
      if (rpcErr) throw rpcErr;
      startTransition(() => router.refresh());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Fonder une alliance</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Prérequis : ambassade niveau 3. Coût : 5000/5000/5000/2000.
          Capacité initiale : 9 + 3 × niveau ambassade chef.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Field label="Nom (3-30 caractères)">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-400/50"
            placeholder="Les Légats du Couchant"
          />
        </Field>
        <Field label="Tag (3-4 caractères, MAJ)">
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value.toUpperCase().slice(0, 4))}
            className="w-32 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-400/50"
            placeholder="LEG"
          />
        </Field>
        <Field label="Couleur">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-20 cursor-pointer rounded border border-white/10"
          />
        </Field>
      </div>

      <button
        onClick={submit}
        disabled={busy || !name.trim() || tag.trim().length < 3}
        className="self-end rounded-md bg-violet-500 px-6 py-3 text-sm font-bold text-violet-950 hover:bg-violet-400 disabled:opacity-50"
      >
        {busy ? "Fondation…" : "Fonder l'alliance"}
      </button>

      <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-200">
        💬 <strong>Chat alliance :</strong> à venir en P6 final (PartyKit). Pour
        l&apos;instant, gestion des membres uniquement.
      </div>
    </div>
  );
}

function ExistingAlliance({
  alliance,
  members,
  userId,
  username,
}: {
  alliance: ImperiumAllianceRow;
  members: ImperiumAllianceMemberRow[];
  userId: string;
  username: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const myRole = members.find((m) => m.user_id === userId)?.role;
  const chat = useImperiumAllianceChat({
    authId: userId,
    username,
    allianceId: alliance.id,
  });

  async function leave() {
    if (myRole === "chief") {
      setError("Le chef ne peut quitter (transfert ou dissolution requis).");
      return;
    }
    if (!confirm("Quitter l'alliance ?")) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      const { error: rpcErr } = await supabase.rpc("imperium_leave_alliance");
      if (rpcErr) throw rpcErr;
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="rounded-xl border border-violet-400/40 bg-black/40 p-4">
        <div className="flex items-center gap-3">
          <span
            className="rounded-md px-2 py-1 text-sm font-bold text-zinc-900"
            style={{ background: alliance.color }}
          >
            [{alliance.tag}]
          </span>
          <div>
            <div className="text-xl font-bold text-zinc-100">
              {alliance.name}
            </div>
            <div className="text-[10px] text-zinc-500">
              Fondée le{" "}
              {new Date(alliance.created_at).toLocaleDateString("fr-FR")}
            </div>
          </div>
          {myRole && (
            <span className="ml-auto rounded-full bg-white/10 px-2 py-1 text-[10px] text-zinc-300">
              Mon rôle : {myRole}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <section>
        <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
          Membres ({members.length})
        </div>
        <div className="flex flex-col gap-1">
          {members.map((m) => (
            <div
              key={m.user_id}
              className="flex items-center gap-2 rounded border border-white/5 bg-white/[0.03] px-3 py-2 text-xs"
            >
              <span className="text-zinc-200">{m.user_id.slice(0, 8)}…</span>
              <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300">
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </section>

      <ChatPanel
        userId={userId}
        status={chat.status}
        messages={chat.messages}
        members={chat.members}
        chatError={chat.error}
        onSend={chat.send}
      />

      {myRole === "chief" && (
        <BannerPanel allianceId={alliance.id} currentColor={alliance.color} />
      )}

      {myRole && myRole !== "chief" && (
        <button
          onClick={leave}
          disabled={busy}
          className="self-start rounded-md border border-rose-400/40 px-4 py-2 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
        >
          Quitter l&apos;alliance
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-400">
        {label}
      </div>
      {children}
    </div>
  );
}

function BannerPanel({
  allianceId,
  currentColor,
}: {
  allianceId: string;
  currentColor: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(currentColor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const ok = window.confirm(
      "Bannière custom = 50 000 OS. Confirmer ?",
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase indisponible");
      const { error: rpcErr } = await supabase.rpc(
        "imperium_set_alliance_banner",
        { p_alliance_id: allianceId, p_color: color },
      );
      if (rpcErr) throw rpcErr;
      setOpen(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <section className="rounded-xl border border-white/10 bg-black/40 p-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Personnalisation alliance</span>
          <button
            onClick={() => setOpen(true)}
            className="rounded border border-fuchsia-400/40 px-3 py-1 text-fuchsia-200 hover:bg-fuchsia-400/10"
          >
            🎨 Bannière custom (50 000 OS)
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-fuchsia-400/40 bg-black/40 p-4 text-xs">
      <div className="mb-2 text-zinc-400">
        Couleur de bannière (50 000 OS, niveau ambassade chef ≥ 5)
      </div>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-10 w-16 cursor-pointer rounded border border-white/10"
        />
        <input
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-28 rounded border border-white/10 bg-black/40 px-2 py-1 text-zinc-100 outline-none"
          maxLength={7}
        />
        <button
          onClick={save}
          disabled={busy || color === currentColor}
          className="rounded bg-fuchsia-500 px-3 py-2 font-bold text-fuchsia-950 hover:bg-fuchsia-400 disabled:opacity-50"
        >
          {busy ? "…" : "Acheter"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setColor(currentColor);
            setError(null);
          }}
          className="rounded border border-white/10 px-3 py-2 text-zinc-300 hover:bg-white/5"
        >
          Annuler
        </button>
      </div>
      {error && <div className="mt-2 text-rose-300">{error}</div>}
    </section>
  );
}

function ChatPanel({
  userId,
  status,
  messages,
  members,
  chatError,
  onSend,
}: {
  userId: string;
  status: string;
  messages: { id: string; playerId: string; playerName: string; text: string; timestamp: number }[];
  members: { authId: string; username: string }[];
  chatError: string | null;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!draft.trim()) return;
    onSend(draft);
    setDraft("");
  }

  return (
    <section className="rounded-xl border border-violet-400/30 bg-black/40">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-violet-200">💬 Chat alliance</span>
          <span
            className={
              status === "connected"
                ? "h-2 w-2 rounded-full bg-emerald-400"
                : status === "connecting"
                  ? "h-2 w-2 rounded-full bg-amber-400 animate-pulse"
                  : "h-2 w-2 rounded-full bg-zinc-500"
            }
          />
          <span className="text-[10px] text-zinc-500">{status}</span>
        </div>
        <span className="text-[10px] text-zinc-400">
          {members.length} en ligne
        </span>
      </div>

      {chatError && (
        <div className="border-b border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {chatError}
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex h-72 flex-col gap-1 overflow-y-auto p-3 text-xs"
      >
        {messages.length === 0 ? (
          <div className="text-zinc-500">Aucun message pour l&apos;instant.</div>
        ) : (
          messages.map((m) => {
            const isMe = m.playerId === userId;
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
              >
                <div className="text-[9px] text-zinc-500">
                  {isMe ? "Toi" : m.playerName} ·{" "}
                  {new Date(m.timestamp).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div
                  className={`max-w-[75%] rounded-md px-2 py-1 ${
                    isMe
                      ? "bg-violet-500/30 text-violet-50"
                      : "bg-white/[0.04] text-zinc-100"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-white/5 p-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            status === "connected"
              ? "Message à l'alliance…"
              : "Connexion…"
          }
          disabled={status !== "connected"}
          maxLength={500}
          className="flex-1 rounded border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-violet-400/50 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={status !== "connected" || !draft.trim()}
          className="rounded bg-violet-500 px-3 py-1.5 text-xs font-bold text-violet-950 hover:bg-violet-400 disabled:opacity-50"
        >
          Envoyer
        </button>
      </form>
    </section>
  );
}
