"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/actions/auth";
import type { Profile } from "@/lib/auth";

export function UserPill({
  profile,
  variant = "nav",
}: {
  profile: Profile;
  variant?: "nav" | "play";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 text-sm text-zinc-100 transition-colors hover:bg-white/10"
      >
        <Avatar url={profile.avatar_url} name={profile.username} />
        <span className="font-medium">{profile.username}</span>
        <GoldBadge gold={profile.gold} />
      </button>

      {open && (
        <div
          className={
            variant === "play"
              ? "absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 shadow-xl shadow-black/40 backdrop-blur-md"
              : "absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 shadow-xl shadow-black/40 backdrop-blur-md"
          }
        >
          <div className="border-b border-white/5 p-3">
            <div className="text-xs text-zinc-500">Connecté</div>
            <div className="truncate text-sm font-medium text-zinc-100">
              {profile.username}
            </div>
          </div>
          <div className="p-1">
            <form action={signOut}>
              <button
                type="submit"
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/5"
              >
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      )}
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
