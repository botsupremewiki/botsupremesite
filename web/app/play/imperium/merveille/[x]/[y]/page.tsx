import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { createClient } from "@/lib/supabase/server";
import {
  fetchImperiumVillages,
} from "../../../_lib/supabase-helpers";
import { formatNumber } from "@shared/imperium";

export const dynamic = "force-dynamic";

type WonderData = {
  name?: string;
  level?: number;
  garrison?: Record<string, number>;
};

export default async function MerveillePage({
  params,
}: {
  params: Promise<{ x: string; y: string }>;
}) {
  const { x: xStr, y: yStr } = await params;
  const x = parseInt(xStr);
  const y = parseInt(yStr);
  if (Number.isNaN(x) || Number.isNaN(y)) notFound();

  const profile = await getProfile();
  if (!profile) redirect("/play/imperium");

  const villages = await fetchImperiumVillages(profile.id);
  if (villages.length === 0) redirect("/play/imperium/creation");
  const main = villages.find((v) => !v.is_secondary) ?? villages[0];

  const supabase = await createClient();
  const cell = supabase
    ? (
        await supabase
          .from("imperium_map")
          .select("*")
          .eq("x", x)
          .eq("y", y)
          .maybeSingle()
      ).data
    : null;

  if (!cell || cell.kind !== "wonder") {
    return (
      <Layout profile={profile} title="Merveille introuvable">
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          Aucune merveille à ({x}, {y}).
        </div>
      </Layout>
    );
  }

  const data = (cell.data ?? {}) as WonderData;
  const garrison = data.garrison ?? {};
  const garrisonAlive = Object.values(garrison).reduce(
    (a, b) => a + (b as number),
    0,
  );
  const wonderLevel = data.level ?? 0;
  const wonderName = data.name ?? "Merveille sans nom";
  const ownerVillageId = cell.village_id;
  const isOwnedByMe = ownerVillageId
    ? villages.some((v) => v.id === ownerVillageId)
    : false;

  return (
    <Layout profile={profile} title={`✨ ${wonderName}`}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
        <section className="rounded-xl border border-fuchsia-400/30 bg-black/40 p-4">
          <div className="text-[11px] uppercase tracking-widest text-zinc-400">
            ({x}, {y})
          </div>
          <div className="mt-1 text-2xl font-bold text-fuchsia-200">
            {wonderName}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <Stat label="Niveau" value={`${wonderLevel} / 100`} />
            <Stat label="Garnison" value={formatNumber(garrisonAlive)} />
            <Stat
              label="Statut"
              value={
                garrisonAlive > 0
                  ? "Sauvage"
                  : isOwnedByMe
                    ? "Te appartient"
                    : ownerVillageId
                      ? "Conquise par un joueur"
                      : "Libre"
              }
            />
          </div>
        </section>

        {garrisonAlive > 0 && (
          <section className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm">
            <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
              Garnison NPC
            </div>
            <ul className="grid grid-cols-2 gap-1 text-xs">
              {Object.entries(garrison).map(([kind, count]) => (
                <li
                  key={kind}
                  className="flex justify-between rounded border border-white/5 bg-white/[0.03] px-2 py-1"
                >
                  <span className="text-zinc-300">{kind}</span>
                  <span className="tabular-nums text-zinc-100">
                    {formatNumber(count as number)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 text-xs text-zinc-400">
              Pour conquérir cette merveille, tu dois envoyer une attaque qui
              annihile cette garnison. Une alliance solide est nécessaire — le
              total de force est à plusieurs dizaines de milliers de points.
            </div>
            <Link
              href={`/play/imperium/${main.id}/carte`}
              className="mt-3 inline-block rounded bg-fuchsia-500 px-4 py-2 text-xs font-bold text-fuchsia-950 hover:bg-fuchsia-400"
            >
              🗺️ Aller sur la carte pour attaquer
            </Link>
          </section>
        )}

        {garrisonAlive === 0 && isOwnedByMe && (
          <section className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm">
            <div className="mb-2 text-[11px] uppercase tracking-widest text-amber-300">
              🏆 Construction
            </div>
            <div className="text-zinc-100">
              Tu détiens cette merveille. Construis-la jusqu&apos;au niveau 100
              pour gagner le titre <em>Premier Bâtisseur</em> + 50 000 OS.
            </div>
            <div className="mt-2 text-[11px] text-zinc-400">
              L&apos;upgrade de la merveille passe par la RPC{" "}
              <code className="rounded bg-white/10 px-1">
                imperium_upgrade_building
              </code>{" "}
              avec <code>p_kind = &apos;wonder&apos;</code>. Coût : 50 000 de chaque
              ressource × 1.5^N, temps : 24h × 1.5^N (skip impossible).
            </div>
          </section>
        )}

        {garrisonAlive === 0 && !isOwnedByMe && ownerVillageId && (
          <section className="rounded-xl border border-rose-400/30 bg-rose-400/5 p-4 text-sm">
            <div className="text-zinc-100">
              Cette merveille appartient déjà à un autre joueur. Tu peux la lui
              prendre via une attaque qui annihile ses défenseurs (la merveille
              et ses niveaux construits restent en place et changent de
              propriétaire).
            </div>
          </section>
        )}

        <Link
          href={`/play/imperium/${main.id}/carte`}
          className="self-start text-xs text-zinc-400 hover:text-zinc-200"
        >
          ← Retour à la carte
        </Link>
      </div>
    </Layout>
  );
}

function Layout({
  profile,
  title,
  children,
}: {
  profile: { id: string; gold: number; username: string; avatar_url: string | null; is_admin: boolean };
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/imperium" className="text-zinc-400 hover:text-zinc-100">
            ← Imperium
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-fuchsia-200">{title}</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(232,121,249,0.06),transparent_60%)]">
        {children}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums text-zinc-100">
        {value}
      </div>
    </div>
  );
}
