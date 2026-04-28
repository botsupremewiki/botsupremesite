"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { resyncMyDiscordProfile } from "@/app/actions/discord-resync";
import type { Profile } from "@/lib/auth";
import { NotifBell } from "./notif-bell";
import { useMetaBadges } from "./use-meta-badges";

export function UserPill({
  profile,
  variant = "nav",
}: {
  profile: Profile;
  variant?: "nav" | "play";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const badges = useMetaBadges(true);
  // Resync Discord (pseudo serveur + rôles) à la demande, sans logout.
  const [resyncing, startResync] = useTransition();
  const [resyncStatus, setResyncStatus] = useState<
    "idle" | "ok" | "error"
  >("idle");
  const [resyncMessage, setResyncMessage] = useState<string | null>(null);
  const onResync = () => {
    startResync(async () => {
      try {
        const r = await resyncMyDiscordProfile();
        if (r.ok) {
          setResyncStatus("ok");
          setResyncMessage(`Pseudo : ${r.username ?? "—"}`);
          router.refresh();
        } else {
          setResyncStatus("error");
          setResyncMessage(r.reason ?? "Erreur inconnue");
        }
      } catch (e) {
        // Next.js utilise des "erreurs" spéciales (NEXT_REDIRECT,
        // NEXT_NOT_FOUND) pour piloter la navigation depuis un Server
        // Action. On les laisse passer pour que la nav se fasse, sinon
        // on les afficherait à tort en rouge sous le bouton.
        if (isFrameworkSignal(e)) throw e;
        setResyncStatus("error");
        setResyncMessage((e as Error).message);
      }
    });
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // Combined badge on the trigger : true if any sub-section has a "1".
  const hasAnyBadge = badges.dailyClaimable || badges.friendPending > 0;

  return (
    <div className="flex items-center gap-2">
      <NotifBell />
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="relative flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 text-sm text-zinc-100 transition-colors hover:bg-white/10"
        >
          <Avatar url={profile.avatar_url} name={profile.username} />
          <span className="font-medium">{profile.username}</span>
          <GoldBadge gold={profile.gold} />
          {hasAnyBadge && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-zinc-900" />
          )}
        </button>

        {open && (
          <div
            className={
              variant === "play"
                ? "absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 shadow-xl shadow-black/40 backdrop-blur-md"
                : "absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 shadow-xl shadow-black/40 backdrop-blur-md"
            }
          >
            <div className="border-b border-white/5 p-3">
              <div className="text-xs text-zinc-500">Connecté</div>
              <div className="truncate text-sm font-medium text-zinc-100">
                {profile.username}
              </div>
            </div>

            <div className="p-1">
              <MenuItem
                href="/play/profil"
                onClick={() => setOpen(false)}
                icon="👤"
                label="Profil"
                hint="Stats, avatar, cosmétiques"
              />
              <MenuItem
                href="/play/objectifs"
                onClick={() => setOpen(false)}
                icon="🎯"
                label="Objectifs"
                hint="Récompenses, quêtes, achievements"
                badge={badges.dailyClaimable ? 1 : 0}
              />
              <MenuItem
                href="/play/amis"
                onClick={() => setOpen(false)}
                icon="👥"
                label="Amis"
                hint="Liste, demandes, ajouter"
                badge={badges.friendPending}
              />

              {profile.is_admin && (
                <MenuItem
                  href="/admin/sync-roles"
                  onClick={() => setOpen(false)}
                  icon="🛠️"
                  label="Admin"
                  hint="Resync Discord, outils admin"
                />
              )}

              <div className="my-1 h-px bg-white/5" />

              <button
                type="button"
                onClick={onResync}
                disabled={resyncing}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-white/5 disabled:opacity-60"
                title="Resynchroniser mon pseudo et mes rôles depuis Discord"
              >
                <span className="text-base">{resyncing ? "⏳" : "🔄"}</span>
                <span className="flex flex-col">
                  <span className="font-medium leading-tight">
                    {resyncing ? "Synchronisation..." : "Resynchroniser Discord"}
                  </span>
                  {resyncMessage && (
                    <span
                      className={`text-[10px] leading-tight ${
                        resyncStatus === "ok"
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {resyncMessage}
                    </span>
                  )}
                </span>
              </button>

              <form action={signOut}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-zinc-400 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
                >
                  <span className="text-base">🚪</span>
                  <span>Se déconnecter</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Vrai pour les "erreurs" internes Next.js (redirect, notFound) qu'il
 *  faut re-throw pour que le framework finisse la nav. Ne pas afficher
 *  comme un vrai bug. */
function isFrameworkSignal(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const digest = (e as { digest?: unknown }).digest;
  if (typeof digest === "string") {
    return (
      digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("NEXT_NOT_FOUND") ||
      digest.startsWith("DYNAMIC_SERVER_USAGE")
    );
  }
  const message = (e as { message?: unknown }).message;
  return typeof message === "string" && message === "NEXT_REDIRECT";
}

function MenuItem({
  href,
  onClick,
  icon,
  label,
  hint,
  badge = 0,
}: {
  href: string;
  onClick: () => void;
  icon: string;
  label: string;
  hint?: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/5"
    >
      <span className="flex items-center gap-3">
        <span className="text-base">{icon}</span>
        <span className="flex flex-col">
          <span className="font-medium leading-tight">{label}</span>
          {hint && (
            <span className="text-[10px] leading-tight text-zinc-500">
              {hint}
            </span>
          )}
        </span>
      </span>
      {badge > 0 && (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white shadow">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        width={24}
        height={24}
        className="h-6 w-6 rounded-full border border-white/10 object-cover"
      />
    );
  }
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-[11px] font-semibold text-white">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function GoldBadge({ gold }: { gold: number }) {
  return (
    <span
      className="flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-xs font-semibold text-amber-300"
      title="Or Suprême"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
      {gold.toLocaleString("fr-FR")}
      <span className="text-[10px] font-bold opacity-70">OS</span>
    </span>
  );
}
