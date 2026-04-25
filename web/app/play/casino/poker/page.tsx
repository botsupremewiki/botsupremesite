import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { POKER_TABLES, type PokerTableConfig } from "@shared/types";
import { UserPill } from "@/components/user-pill";

export const dynamic = "force-dynamic";

export default async function PokerLobby() {
  const profile = await getProfile();
  const tables = Object.values(POKER_TABLES);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play/casino"
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Casino
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-medium">Poker · choisir une table</span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>
      <main className="flex flex-1 items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.08),transparent_60%)] p-6">
        <div className="grid w-full max-w-5xl grid-cols-1 gap-4 md:grid-cols-3">
          {tables.map((t) => (
            <TableCard key={t.id} table={t} gold={profile?.gold ?? 0} />
          ))}
        </div>
      </main>
    </div>
  );
}

function TableCard({ table, gold }: { table: PokerTableConfig; gold: number }) {
  const canAfford = gold >= table.buyinMin;
  return (
    <Link
      href={`/play/casino/poker/${table.id}`}
      className={`group flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/40 p-5 transition-colors hover:bg-white/[0.04] ${
        !canAfford ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className={`text-lg font-semibold ${table.accent}`}>
          {table.name}
        </h2>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-widest text-zinc-400">
          {table.seatCount} sièges
        </span>
      </div>
      <div className="flex items-baseline gap-2 text-zinc-100">
        <span className="text-2xl font-bold tabular-nums">
          {table.smallBlind.toLocaleString("fr-FR")}/
          {table.bigBlind.toLocaleString("fr-FR")}
        </span>
        <span className="text-xs text-zinc-500">SB / BB</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-white/5 bg-white/5 p-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            Buy-in min
          </div>
          <div className="mt-0.5 font-semibold tabular-nums text-zinc-200">
            {table.buyinMin.toLocaleString("fr-FR")} OS
          </div>
        </div>
        <div className="rounded-md border border-white/5 bg-white/5 p-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            Buy-in max
          </div>
          <div className="mt-0.5 font-semibold tabular-nums text-zinc-200">
            {table.buyinMax.toLocaleString("fr-FR")} OS
          </div>
        </div>
      </div>
      <div className="text-[11px] text-zinc-500">
        {canAfford
          ? `Solde dispo : ${gold.toLocaleString("fr-FR")} OS`
          : `Il te faut au moins ${table.buyinMin.toLocaleString("fr-FR")} OS pour t'asseoir.`}
      </div>
    </Link>
  );
}
