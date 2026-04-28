import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SyncRolesClient } from "./sync-roles-client";

export const dynamic = "force-dynamic";

// Stats affichées sur la page : nombre total de profils, et combien ont
// déjà un `discord_id` (i.e. sont sync-ables sans qu'ils aient à se
// reconnecter). Un profil sans discord_id = un joueur qui s'est connecté
// avant Chunk A et qui doit faire un logout/login pour qu'on récupère
// son ID Discord.

async function fetchSyncStats() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { count: total } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });
  const { count: linked } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .not("discord_id", "is", null);
  return { total: total ?? 0, linked: linked ?? 0 };
}

export default async function AdminSyncRolesPage() {
  const stats = await fetchSyncStats();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link
            href="/play"
            className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            ← Retour au site
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Synchronisation Discord
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Met à jour les pseudos et rôles Discord de tous les joueurs sans
            qu&apos;ils aient à se reconnecter.
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <StatCard
          label="Profils enregistrés"
          value={stats?.total ?? 0}
          hint="Tous les comptes Site Ultime"
        />
        <StatCard
          label="Liés à Discord"
          value={stats?.linked ?? 0}
          hint="Avec discord_id stocké → resync possible"
        />
      </div>

      <SyncRolesClient />

      <div className="mt-8 rounded-2xl border border-white/5 bg-white/[0.02] p-5 text-sm text-zinc-400">
        <h2 className="mb-2 text-base font-semibold text-zinc-200">
          Quand utiliser cette page ?
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Tu viens de créer un nouveau rôle Discord et tu veux qu&apos;il
            s&apos;applique tout de suite à tout le monde
          </li>
          <li>
            Tu as ajouté/retiré quelqu&apos;un d&apos;un rôle (admin, booster, …)
            et tu veux que le site soit au courant sans attendre sa prochaine
            connexion
          </li>
          <li>
            Tu modifies le mapping{" "}
            <code className="rounded bg-white/10 px-1 text-xs">
              shared/discord-roles.ts
            </code>{" "}
            et tu veux propager
          </li>
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          La sync se fait via le bot Discord du site (pas besoin que les
          joueurs soient en ligne). Les profils sans{" "}
          <code className="rounded bg-white/10 px-1">discord_id</code> sont
          ignorés — ces joueurs doivent se reconnecter une fois pour
          déclencher la première sync.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-3xl font-bold tabular-nums text-zinc-100">
        {value.toLocaleString("fr-FR")}
      </div>
      {hint && <div className="mt-1 text-[11px] text-zinc-500">{hint}</div>}
    </div>
  );
}
