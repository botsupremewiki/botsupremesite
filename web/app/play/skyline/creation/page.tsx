import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import {
  SKYLINE_COMMERCE_SECTORS,
  SKYLINE_DISTRICTS,
  SKYLINE_LOCAL_SIZES,
  skylineRentMonthly,
} from "@shared/skyline";
import { ensureSkylineProfile } from "../_lib/supabase-helpers";
import { SkylineHeader } from "../_components/skyline-header";
import { CreationForm } from "./creation-form";

export const dynamic = "force-dynamic";

export default async function CreationPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/play");

  const skyProfile = await ensureSkylineProfile();
  const cash = Number(skyProfile?.cash ?? 0);

  const params = await searchParams;
  const errorMsg = params.err ? decodeURIComponent(params.err) : null;

  // Pré-calcul des coûts pour chaque combo (district × size).
  const districts = Object.values(SKYLINE_DISTRICTS);
  const sizes = Object.values(SKYLINE_LOCAL_SIZES);

  const sectors = Object.values(SKYLINE_COMMERCE_SECTORS).sort(
    (a, b) => a.minStartCash - b.minStartCash,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkylineHeader
        profile={profile}
        cash={cash}
        subtitle="Créer une entreprise"
        backHref="/play/skyline"
        backLabel="Skyline"
      />

      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(236,72,153,0.06),transparent_60%)] p-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">
              🏗️ Lancer une entreprise
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              P1 — pour cette phase, tu peux lancer un{" "}
              <strong className="text-pink-200">commerce</strong>. Les usines,
              matières premières et services arrivent dans les phases suivantes.
            </p>
          </div>

          {errorMsg ? (
            <div className="rounded-md border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200">
              ⚠️ {errorMsg}
            </div>
          ) : null}

          <CreationForm
            sectors={sectors}
            districts={districts}
            sizes={sizes}
            cash={cash}
          />

          <details className="rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-400">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-300">
              💡 Combien ça coûte ?
            </summary>
            <div className="mt-3 space-y-2">
              <p>
                Le coût total = <strong>caution local</strong> (1 mois de
                loyer) + équipement (présentoirs, caisse) + stock initial.
                Tu peux aussi <strong>acheter le local</strong> (= 100× loyer
                mensuel) pour ne plus payer de loyer.
              </p>
              <table className="mt-2 w-full text-[11px] tabular-nums">
                <thead>
                  <tr className="text-zinc-500">
                    <th className="text-left">Loyer mensuel ($)</th>
                    {sizes.map((s) => (
                      <th key={s.id} className="text-right">
                        {s.name} ({s.sqm}m²)
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {districts.map((d) => (
                    <tr key={d.id} className="border-t border-white/5">
                      <td className={`py-1 ${d.accent}`}>
                        {d.glyph} {d.name}
                      </td>
                      {sizes.map((s) => (
                        <td key={s.id} className="text-right text-zinc-300">
                          {Math.round(skylineRentMonthly(d.id, s.id)).toLocaleString("fr-FR")} $
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2">
                Achat = ces montants × 100. Ex: XS populaire (50m²) = 400$/mois → 40 000$ achat.
              </p>
            </div>
          </details>
        </div>
      </main>
    </div>
  );
}
