"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_PRESTIGE_BONUSES,
  ETERNUM_PRESTIGE_PALIERS,
  type EternumHero,
  eternumPrestigeStonesOwned,
  eternumXpMultiplier,
} from "@shared/types";
import { createClient } from "@/lib/supabase/client";

/**
 * Page Prestige : système de pierres permanentes.
 *
 * 10 paliers (level 100, 200, ..., 1000), une pierre par palier, jamais
 * ré-acquisable. Chaque pierre boost l'XP gain perpétuel. Bonus croissants
 * pour récompenser pousser plus haut avant de prestige.
 *
 * Pas de condition pour prestige : tu peux le faire quand tu veux.
 * Reset : level → 1, xp → 0, idle_stage → 1, evolution_stage → 0,
 * progression contenus (donjons/tour/wb) → 0. Garde : familiers, items, OS,
 * pass, achievements, bestiaire.
 */
export function PrestigeClient({ hero }: { hero: EternumHero }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  // Pierres déjà acquises + bonus XP courant
  const ownedPaliers = eternumPrestigeStonesOwned(hero.prestigeStones);
  const currentMultiplier = eternumXpMultiplier(hero.prestigeStones);

  // Calcule les pierres qu'on gagnerait si on prestigeait MAINTENANT
  const wouldGain: number[] = [];
  for (let i = 0; i < 10; i++) {
    const palier = ETERNUM_PRESTIGE_PALIERS[i];
    const owned = (hero.prestigeStones >> i) & 1;
    if (hero.level >= palier && !owned) wouldGain.push(palier);
  }
  const wouldGainBonusPct = wouldGain.reduce((sum, palier) => {
    const idx = ETERNUM_PRESTIGE_PALIERS.indexOf(
      palier as (typeof ETERNUM_PRESTIGE_PALIERS)[number],
    );
    return sum + ETERNUM_PRESTIGE_BONUSES[idx];
  }, 0);

  async function prestige() {
    if (!supabase) return;
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc("eternum_prestige");
    if (rpcErr) {
      setError(rpcErr.message);
      setConfirming(false);
      return;
    }
    const r = data as {
      ok: boolean;
      stones_gained: number;
      total_stones_count: number;
      multiplier: number;
      multiplier_pct: number;
    };
    setOkMsg(
      `✨ Prestige réussi · +${r.stones_gained} pierre${r.stones_gained > 1 ? "s" : ""} · ${r.total_stones_count}/10 collectées · ×${r.multiplier.toFixed(2)} XP perpétuel`,
    );
    setConfirming(false);
    setTimeout(() => {
      router.push("/play/rpg/personnage");
      router.refresh();
    }, 1500);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {/* Bandeau résumé */}
      <div className="rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/[0.04] p-5">
        <div className="text-2xl font-bold text-fuchsia-200">
          ✨ Prestige #{hero.prestigeCount + 1}
        </div>
        <div className="mt-1 text-xs text-zinc-400">
          Reset complet de ton héros (niveau, XP, stage aventure, progressions
          contenus). Garde : familiers, items, OS, pass, achievements.
          <br />
          Récompense : <strong>pierres permanentes de prestige</strong> qui
          boostent l'XP gain à vie.
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <Mini label="Niveau actuel" value={`${hero.level} / 1000`} />
          <Mini
            label="Pierres collectées"
            value={`${ownedPaliers.length} / 10`}
            highlight={ownedPaliers.length > 0}
          />
          <Mini
            label="Multiplicateur XP"
            value={`× ${currentMultiplier.toFixed(2)}`}
            highlight={currentMultiplier > 1}
          />
        </div>
      </div>

      {/* Aperçu du prestige immédiat */}
      <div
        className={`rounded-xl border p-4 ${
          wouldGain.length > 0
            ? "border-emerald-400/40 bg-emerald-400/[0.04]"
            : "border-zinc-500/30 bg-zinc-500/[0.03]"
        }`}
      >
        <div className="text-[11px] uppercase tracking-widest text-zinc-400">
          🎁 Si tu prestige maintenant
        </div>
        {wouldGain.length > 0 ? (
          <>
            <div className="mt-1 text-base font-bold text-emerald-200">
              +{wouldGain.length} pierre
              {wouldGain.length > 1 ? "s" : ""} (
              {wouldGain.map((p) => `Palier ${p}`).join(", ")})
            </div>
            <div className="mt-1 text-xs text-emerald-300">
              Bonus XP gagné : +{wouldGainBonusPct}% (cumulatif avec
              l'existant)
            </div>
          </>
        ) : (
          <div className="mt-1 text-sm text-zinc-300">
            Aucune nouvelle pierre — tu n'as pas atteint de nouveau palier
            depuis ton dernier prestige.
            <br />
            <span className="text-[11px] text-zinc-500">
              Continue à grinder pour atteindre le prochain palier (level{" "}
              {(Math.floor(hero.level / 100) + 1) * 100}).
            </span>
          </div>
        )}
      </div>

      {/* Grille des 10 pierres */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
          🪨 Collection des Pierres de Prestige
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {ETERNUM_PRESTIGE_PALIERS.map((palier, i) => {
            const owned = (hero.prestigeStones >> i) & 1;
            const willGain = wouldGain.includes(palier);
            const reachable = hero.level >= palier;
            const bonus = ETERNUM_PRESTIGE_BONUSES[i];
            return (
              <div
                key={palier}
                className={`flex flex-col items-center gap-1 rounded-lg border p-3 ${
                  owned
                    ? "border-fuchsia-400/60 bg-fuchsia-400/[0.08] shadow-[0_0_16px_rgba(232,121,249,0.3)]"
                    : willGain
                      ? "border-emerald-400/60 bg-emerald-400/[0.06]"
                      : reachable
                        ? "border-amber-400/40 bg-amber-400/[0.03]"
                        : "border-zinc-700/50 bg-zinc-800/30 opacity-60"
                }`}
              >
                <div className="text-3xl">{owned || willGain ? "💎" : "🔒"}</div>
                <div className="text-xs font-semibold text-zinc-100">
                  Palier {palier}
                </div>
                <div
                  className={`text-[10px] ${
                    owned
                      ? "text-fuchsia-300"
                      : willGain
                        ? "text-emerald-300"
                        : "text-zinc-500"
                  }`}
                >
                  +{bonus}% XP
                </div>
                <div
                  className={`text-[9px] uppercase tracking-widest ${
                    owned
                      ? "text-fuchsia-300"
                      : willGain
                        ? "text-emerald-300"
                        : reachable
                          ? "text-amber-300"
                          : "text-zinc-600"
                  }`}
                >
                  {owned
                    ? "Acquise"
                    : willGain
                      ? "À gagner"
                      : reachable
                        ? "Atteignable"
                        : `Level ${palier} requis`}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="rounded-md border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm text-emerald-200">
          {okMsg}
        </div>
      )}

      {/* Bouton prestige */}
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="rounded-md bg-fuchsia-500 px-6 py-3 text-sm font-bold text-fuchsia-950 hover:bg-fuchsia-400"
        >
          ✨ Prestige maintenant
        </button>
      ) : (
        <div className="rounded-md border border-rose-400/40 bg-rose-400/10 p-3 text-sm">
          <div className="font-bold text-rose-200">⚠️ Confirmer Prestige ?</div>
          <div className="mt-1 text-xs text-zinc-300">
            Ton héros sera reset : niveau → 1, XP → 0, stage aventure → 1,
            évolution → 0, progressions donjons/tour reset.
            <br />
            <strong className="text-zinc-200">Conservés</strong> : familiers,
            items, OS, pass, achievements, bestiaire.
            {wouldGain.length === 0 && (
              <div className="mt-2 rounded bg-amber-400/10 p-2 text-amber-200">
                ⚠️ Tu ne gagneras aucune nouvelle pierre — c'est un reset
                gratuit. Continue.
              </div>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={prestige}
              className="flex-1 rounded-md bg-fuchsia-500 px-4 py-2 text-sm font-bold text-fuchsia-950 hover:bg-fuchsia-400"
            >
              Oui, faire Prestige
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-2 py-1 text-center ${
        highlight
          ? "border-fuchsia-400/40 bg-fuchsia-400/10"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className="text-[9px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div
        className={`text-sm font-semibold tabular-nums ${
          highlight ? "text-fuchsia-200" : "text-zinc-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
