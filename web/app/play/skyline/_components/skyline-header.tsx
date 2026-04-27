import Link from "next/link";
import { UserPill } from "@/components/user-pill";

type Profile = {
  id: string;
  gold: number;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
};

export function SkylineHeader({
  profile,
  cash,
  subtitle,
  backHref = "/play",
  backLabel = "Plaza",
}: {
  profile?: Profile;
  cash?: number;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          className="text-zinc-400 transition-colors hover:text-zinc-100"
        >
          ← {backLabel}
        </Link>
        <div className="h-4 w-px bg-white/10" />
        <span className="font-semibold text-pink-200">🏙️ Skyline</span>
        {subtitle ? (
          <span className="text-xs text-zinc-500">{subtitle}</span>
        ) : (
          <span className="text-xs text-zinc-500">Tycoon multijoueur</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {typeof cash === "number" ? (
          <div className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 tabular-nums">
            💵 {Math.round(cash).toLocaleString("fr-FR")} $
          </div>
        ) : null}
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </div>
    </header>
  );
}
