import Link from "next/link";
import { getProfile } from "@/lib/auth";
import {
  SKYLINE_BRAND,
  SKYLINE_COMMERCE_SECTORS,
  SKYLINE_DISTRICTS,
  skylineFormatCashFR,
  type SkylineCommerceSector,
} from "@shared/skyline";
import {
  ensureSkylineProfile,
  fetchSkylineCompanies,
  fetchSkylineTransactions,
} from "./_lib/supabase-helpers";
import { SkylineHeader } from "./_components/skyline-header";

export const dynamic = "force-dynamic";

export default async function SkylineHub() {
  const profile = await getProfile();

  if (!profile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <SkylineHeader />
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="rounded-md border border-pink-400/40 bg-pink-400/10 p-3 text-sm text-pink-200">
            Connecte-toi avec Discord pour démarrer ton empire Skyline.
          </div>
        </main>
      </div>
    );
  }

  const skyProfile = await ensureSkylineProfile();
  const companies = await fetchSkylineCompanies(profile.id);
  const recentTx = await fetchSkylineTransactions(profile.id, null, 5);

  const cash = Number(skyProfile?.cash ?? 0);
  const netWorth = Number(skyProfile?.net_worth ?? cash);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkylineHeader profile={profile} cash={cash} />

      <main
        className={`flex flex-1 flex-col overflow-y-auto p-6 ${SKYLINE_BRAND.gradient}`}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          {/* Stats banner */}
          <div className="rounded-xl border border-pink-400/40 bg-black/40 p-4">
            <div className="text-[11px] uppercase tracking-widest text-zinc-400">
              {SKYLINE_BRAND.glyph} Empire {profile.username}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Cash" value={skylineFormatCashFR(cash)} accent="text-emerald-200" />
              <Stat label="Patrimoine" value={skylineFormatCashFR(netWorth)} accent="text-pink-200" />
              <Stat
                label="Entreprises"
                value={String(companies.length)}
                accent="text-amber-200"
              />
              <Stat
                label="Or Suprême"
                value={profile.gold.toLocaleString("fr-FR")}
                accent="text-yellow-200"
              />
            </div>
          </div>

          {/* Mes entreprises */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-200">
                Mes entreprises ({companies.length})
              </h2>
              <Link
                href="/play/skyline/creation"
                className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20"
              >
                + Créer une entreprise
              </Link>
            </div>

            {companies.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center">
                <div className="text-2xl">🏢</div>
                <div className="mt-2 text-sm text-zinc-400">
                  Tu n&apos;as pas encore d&apos;entreprise. Démarre avec un commerce —
                  fleuriste à 50k$ ou boulangerie à 80k$, à toi de voir.
                </div>
                <Link
                  href="/play/skyline/creation"
                  className="mt-4 inline-block rounded-md border border-pink-400/50 bg-pink-500/15 px-4 py-2 text-sm font-semibold text-pink-200 hover:bg-pink-500/25"
                >
                  Lancer ma première entreprise →
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {companies.map((c) => {
                  const sectorMeta =
                    SKYLINE_COMMERCE_SECTORS[c.sector as SkylineCommerceSector];
                  const districtMeta = SKYLINE_DISTRICTS[c.district];
                  return (
                    <Link
                      key={c.id}
                      href={`/play/skyline/${c.id}`}
                      className={`rounded-xl border bg-black/40 p-4 transition-colors hover:bg-white/[0.04] ${districtMeta.border}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-2xl">
                          {sectorMeta?.glyph ?? "🏢"}
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${districtMeta.border} ${districtMeta.accent}`}
                        >
                          {districtMeta.glyph} {districtMeta.name}
                        </span>
                      </div>
                      <div className="mt-2 text-base font-semibold text-zinc-100">
                        {c.name}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {sectorMeta?.name ?? c.sector}
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
                        <span>
                          {c.is_owned ? "🏠 Propriété" : "📜 Loué"} ·{" "}
                          {c.local_size.toUpperCase()}
                        </span>
                        <span className="text-emerald-300 tabular-nums">
                          +{skylineFormatCashFR(Number(c.monthly_revenue))}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* Navigation Skyline */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-zinc-200">
              Outils & marchés
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <MenuButton
                href="/play/skyline/offshore"
                icon="🪙"
                title="Pont $ ↔ OS"
                description="Convertir tes dollars Skyline en Or Suprême (et inversement)"
                accent="text-amber-200"
                border="border-amber-400/40"
              />
              <MenuButton
                href="/play/skyline/creation"
                icon="🏗️"
                title="Nouvelle entreprise"
                description="Créer un commerce, une usine, une matière 1ère ou un service"
                accent="text-emerald-200"
                border="border-emerald-400/40"
              />
              <MenuButton
                href="/play/skyline"
                icon="📊"
                title="Marché commun"
                description="Cours produits & matières (P6 — bientôt)"
                accent="text-zinc-300"
                border="border-zinc-400/30"
                disabled
              />
            </div>
          </section>

          {/* Dernières transactions */}
          {recentTx.length > 0 ? (
            <section>
              <h2 className="mb-2 text-base font-semibold text-zinc-200">
                Activité récente
              </h2>
              <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                <ul className="space-y-1 text-xs">
                  {recentTx.map((tx) => (
                    <li
                      key={tx.id}
                      className="flex items-center justify-between gap-2 border-b border-white/5 py-1.5 last:border-b-0"
                    >
                      <span className="text-zinc-400">{tx.description}</span>
                      <span
                        className={`tabular-nums font-semibold ${
                          Number(tx.amount) >= 0
                            ? "text-emerald-300"
                            : "text-rose-300"
                        }`}
                      >
                        {Number(tx.amount) >= 0 ? "+" : ""}
                        {skylineFormatCashFR(Number(tx.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded border border-white/5 bg-white/[0.03] px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className={`text-sm font-semibold tabular-nums ${accent}`}>
        {value}
      </div>
    </div>
  );
}

function MenuButton({
  href,
  icon,
  title,
  description,
  accent,
  border,
  disabled = false,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  accent: string;
  border: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div
        className={`relative flex h-full flex-col gap-2 rounded-xl border p-5 ${border} bg-black/30 opacity-60`}
      >
        <div className="text-3xl">{icon}</div>
        <div className={`text-base font-semibold ${accent}`}>{title}</div>
        <div className="text-[11px] leading-relaxed text-zinc-400">
          {description}
        </div>
      </div>
    );
  }
  return (
    <Link href={href}>
      <div
        className={`relative flex h-full flex-col gap-2 rounded-xl border p-5 transition-colors ${border} bg-black/40 hover:bg-white/[0.04]`}
      >
        <div className="text-3xl">{icon}</div>
        <div className={`text-base font-semibold ${accent}`}>{title}</div>
        <div className="text-[11px] leading-relaxed text-zinc-400">
          {description}
        </div>
      </div>
    </Link>
  );
}
