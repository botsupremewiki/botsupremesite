import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import { CosmeticsClient } from "./cosmetics-client";

export const dynamic = "force-dynamic";

type Cosmetic = {
  id: string;
  label: string;
  unlocked: boolean;
  color?: string;
};

type CosmeticsResponse = {
  titles: Cosmetic[];
  borders: Cosmetic[];
  current_title: string | null;
  current_border: string | null;
};

export default async function CosmeticsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/");

  let data: CosmeticsResponse | null = null;
  const supabase = await createClient();
  if (supabase) {
    const { data: rpcData } = await supabase.rpc("get_my_cosmetics");
    data = (rpcData as CosmeticsResponse) ?? null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play/profil"
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Profil
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold">✨ Cosmétiques</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col items-center overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.06),transparent_60%)] p-6">
        <div className="w-full max-w-3xl">
          <h1 className="text-2xl font-bold text-zinc-100">
            ✨ Cosmétiques
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Personnalise ton apparence : titre affiché sous ton pseudo et
            couleur de bordure d&apos;avatar. Certaines options se débloquent
            via les achievements ou un bon placement en saison.
          </p>
          {data ? (
            <CosmeticsClient data={data} />
          ) : (
            <div className="mt-6 rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
              Lance la migration{" "}
              <code className="text-zinc-300">supabase/tcg-cosmetics.sql</code>.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
