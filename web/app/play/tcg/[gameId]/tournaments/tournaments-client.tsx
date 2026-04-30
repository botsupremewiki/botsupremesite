"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

type TournamentRow = {
  id: string;
  name: string;
  game_id: string;
  created_by: string;
  creator_username: string | null;
  size: number;
  status: string;
  prize_gold: number;
  prize_packs: number;
  winner_id: string | null;
  winner_username: string | null;
  entries_count: number;
  created_at: string;
};

type Deck = { id: string; name: string };

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "Ouvert", color: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" },
  running: { label: "En cours", color: "border-amber-400/40 bg-amber-400/10 text-amber-200" },
  finished: { label: "Terminé", color: "border-zinc-400/40 bg-zinc-400/10 text-zinc-200" },
  cancelled: { label: "Annulé", color: "border-rose-400/40 bg-rose-400/10 text-rose-200" },
};

export function TournamentsClient({
  gameId,
  tournaments,
  isLoggedIn,
  myUserId,
  myDecks,
  myGold,
  myPacks,
}: {
  gameId: string;
  tournaments: TournamentRow[];
  isLoggedIn: boolean;
  myUserId: string | null;
  myDecks: Deck[];
  myGold: number;
  myPacks: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [size, setSize] = useState<4 | 8>(8);
  const [prizeGold, setPrizeGold] = useState(0);
  const [prizePacks, setPrizePacks] = useState(0);
  const [busy, setBusy] = useState(false);

  async function createTournament() {
    setError(null);
    setBusy(true);
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase indisponible");
      setBusy(false);
      return;
    }
    const { data, error: rpcErr } = await supabase.rpc("create_tournament", {
      p_name: name,
      p_game_id: gameId,
      p_size: size,
      p_prize_gold: prizeGold,
      p_prize_packs: prizePacks,
    });
    setBusy(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setShowCreate(false);
    setName("");
    setPrizeGold(0);
    setPrizePacks(0);
    if (data) {
      router.push(`/play/tcg/${gameId}/tournaments/${data}`);
    } else {
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">🏟️ Tournois</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Single elimination, 4 ou 8 joueurs. Le créateur met les
            récompenses en cashprize, distribué selon le placement.
          </p>
        </div>
        {isLoggedIn ? (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-md border border-amber-400/60 bg-amber-400/10 px-3 py-1.5 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-400/20"
          >
            {showCreate ? "Annuler" : "+ Créer un tournoi"}
          </button>
        ) : null}
      </div>

      {showCreate ? (
        <div className="rounded-xl border border-amber-300/40 bg-amber-300/5 p-5">
          <h2 className="text-lg font-bold text-amber-100">
            Nouveau tournoi
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Tu paies le cashprize d&apos;avance — il sera redistribué aux
            podiumés à la fin. Tu as : {myGold.toLocaleString()} OS,{" "}
            {myPacks} booster(s).
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-zinc-400">
                Nom
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-300/60"
                placeholder="Ex: Coupe d'avril"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-zinc-400">
                Taille
              </span>
              <select
                value={size}
                onChange={(e) => setSize(Number(e.target.value) as 4 | 8)}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-300/60"
              >
                <option value={4}>4 joueurs</option>
                <option value={8}>8 joueurs</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-zinc-400">
                Cashprize OS
              </span>
              <input
                type="number"
                min={0}
                value={prizeGold}
                onChange={(e) => setPrizeGold(Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-300/60"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-zinc-400">
                Cashprize Boosters
              </span>
              <input
                type="number"
                min={0}
                value={prizePacks}
                onChange={(e) => setPrizePacks(Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-300/60"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              disabled={busy || name.trim().length < 3}
              onClick={createTournament}
              className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-sm font-bold text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
            >
              {busy ? "Création…" : "Créer"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-white/[0.07]"
            >
              Annuler
            </button>
            {error ? <span className="ml-2 text-xs text-rose-300">{error}</span> : null}
          </div>
          {myDecks.length === 0 ? (
            <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-400/10 p-2 text-[11px] text-amber-200">
              ⚠ Tu n&apos;as pas encore de deck pour ce jeu — tu devras en
              créer un avant de pouvoir t&apos;inscrire.
            </div>
          ) : null}
        </div>
      ) : null}

      {tournaments.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/10 p-10 text-center text-sm text-zinc-500">
          Aucun tournoi pour l&apos;instant. Sois le premier à en créer un !
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {tournaments.map((t) => {
            const status = STATUS_LABELS[t.status] ?? STATUS_LABELS.open;
            const isMine = myUserId === t.created_by;
            return (
              <Link
                key={t.id}
                href={`/play/tcg/${gameId}/tournaments/${t.id}`}
                className="rounded-xl border border-white/10 bg-black/40 p-4 transition-colors hover:border-amber-300/40 hover:bg-amber-300/[0.03]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-bold text-zinc-100">
                      {t.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      par {t.creator_username ?? "?"}
                      {isMine ? " (toi)" : ""}
                      {" · "}
                      {new Date(t.created_at).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${status.color}`}
                  >
                    {status.label}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-zinc-500">
                      Joueurs
                    </div>
                    <div className="font-bold tabular-nums text-zinc-100">
                      {t.entries_count} / {t.size}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-zinc-500">
                      Cashprize
                    </div>
                    <div className="font-bold tabular-nums text-amber-200">
                      {t.prize_gold} OS
                      {t.prize_packs > 0 ? ` + ${t.prize_packs}🎴` : ""}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-zinc-500">
                      Vainqueur
                    </div>
                    <div className="truncate font-bold text-zinc-100">
                      {t.winner_username ?? "—"}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
