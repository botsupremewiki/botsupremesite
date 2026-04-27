import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { ACHIEVEMENTS } from "@shared/achievements";

export const dynamic = "force-dynamic";

type PublicTarget = {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
};

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const decoded = decodeURIComponent(username);
  const me = await getProfile();

  // Si on est l'utilisateur lui-même, on redirige vers la page Profil
  // privée — plus complète.
  if (me && me.username === decoded) {
    redirect("/play/profil");
  }

  const supabase = await createClient();
  let target: PublicTarget | null = null;
  let unlockedCount = 0;
  let streak = 0;

  if (supabase) {
    const { data } = await supabase
      .from("profiles")
      .select("id,username,avatar_url,created_at")
      .eq("username", decoded)
      .maybeSingle();
    if (data) {
      target = data as PublicTarget;
      const [achievementsRes, dailyRes] = await Promise.all([
        supabase
          .from("achievements_progress")
          .select("unlocked_at")
          .eq("user_id", data.id)
          .not("unlocked_at", "is", null),
        supabase
          .from("daily_rewards")
          .select("streak_count")
          .eq("user_id", data.id)
          .maybeSingle(),
      ]);
      unlockedCount = achievementsRes.data?.length ?? 0;
      streak =
        (dailyRes.data as { streak_count?: number } | null)?.streak_count ??
        0;
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play"
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Plaza
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold">Profil public</span>
        </div>
        {me ? <UserPill profile={me} variant="play" /> : null}
      </header>
      <main className="flex flex-1 items-start justify-center bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.06),transparent_60%)] p-6">
        {target ? (
          <div className="w-full max-w-xl rounded-xl border border-white/10 bg-black/40 p-6">
            <div className="flex items-center gap-4">
              <Avatar url={target.avatar_url} name={target.username} />
              <div>
                <div className="text-xl font-bold text-zinc-100">
                  {target.username}
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  Membre depuis le{" "}
                  {new Date(target.created_at).toLocaleDateString("fr-FR")}
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat
                label="Achievements"
                value={`${unlockedCount}/${ACHIEVEMENTS.length}`}
              />
              <Stat label="Streak daily" value={`${streak}/30`} />
              <Stat label="Statut" value="Joueur actif" />
            </div>
            <div className="mt-5 text-[11px] text-zinc-500">
              Plus de détails (gold, stats par jeu) sont privés. Pour
              interagir avec ce joueur, utilise les actions sur son pseudo
              dans le chat.
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-rose-400/40 bg-rose-400/5 p-6 text-sm text-rose-200">
            Joueur <span className="font-mono">{decoded}</span> introuvable.
          </div>
        )}
      </main>
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
        className="h-16 w-16 rounded-full border border-white/10 object-cover"
      />
    );
  }
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500 text-2xl font-bold text-white">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <div className="text-[9px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className="text-sm font-bold text-zinc-100 tabular-nums">
        {value}
      </div>
    </div>
  );
}
