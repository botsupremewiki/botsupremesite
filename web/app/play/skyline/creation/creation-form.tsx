"use client";

import { useState, useTransition } from "react";
import {
  SKYLINE_FACTORY_SECTORS,
  SKYLINE_RAW_MATERIALS,
  SKYLINE_RAW_SECTORS,
  SKYLINE_SERVICE_SECTORS,
  type SkylineCommerceSector,
  type SkylineDistrict,
  type SkylineFactorySector,
  type SkylineLocalSize,
  type SkylineRawSector,
  type SkylineServiceSector,
  skylineRentMonthly,
  skylinePurchaseCost,
  skylineFormatCashFR,
} from "@shared/skyline";
import { createCompanyAction } from "../_lib/actions";

type Sector = {
  id: SkylineCommerceSector;
  name: string;
  glyph: string;
  description: string;
  minStartCash: number;
};

type District = {
  id: SkylineDistrict;
  name: string;
  glyph: string;
  rentPerSqm: number;
  accent: string;
  border: string;
  description: string;
};

type Size = {
  id: SkylineLocalSize;
  name: string;
  sqm: number;
};

type Category = "commerce" | "factory" | "raw" | "service";

const FACTORY_SECTORS = Object.values(SKYLINE_FACTORY_SECTORS).sort(
  (a, b) => a.minStartCash - b.minStartCash,
);
const RAW_SECTORS = Object.values(SKYLINE_RAW_SECTORS).sort(
  (a, b) => a.minStartCash - b.minStartCash,
);
const SERVICE_SECTORS = Object.values(SKYLINE_SERVICE_SECTORS).sort(
  (a, b) => a.minStartCash - b.minStartCash,
);

export function CreationForm({
  sectors,
  districts,
  sizes,
  cash,
}: {
  sectors: Sector[];
  districts: District[];
  sizes: Size[];
  cash: number;
}) {
  const [category, setCategory] = useState<Category>("commerce");
  const [commerceSector, setCommerceSector] = useState<SkylineCommerceSector>(
    sectors[0].id,
  );
  const [factorySector, setFactorySector] = useState<SkylineFactorySector>(
    FACTORY_SECTORS[0].id,
  );
  const [rawSector, setRawSector] = useState<SkylineRawSector>(
    RAW_SECTORS[0].id,
  );
  const [serviceSector, setServiceSector] = useState<SkylineServiceSector>(
    SERVICE_SECTORS[0].id,
  );
  const [name, setName] = useState("");
  const [district, setDistrict] = useState<SkylineDistrict>("populaire");
  const [size, setSize] = useState<SkylineLocalSize>("xs");
  const [purchase, setPurchase] = useState(false);
  const [pending, startTransition] = useTransition();

  const commerceSectorMeta = sectors.find((s) => s.id === commerceSector)!;
  const factorySectorMeta = SKYLINE_FACTORY_SECTORS[factorySector];
  const rawSectorMeta = SKYLINE_RAW_SECTORS[rawSector];
  const serviceSectorMeta = SKYLINE_SERVICE_SECTORS[serviceSector];
  const sectorId =
    category === "commerce"
      ? commerceSector
      : category === "factory"
      ? factorySector
      : category === "raw"
      ? rawSector
      : serviceSector;
  const sectorMeta =
    category === "commerce"
      ? commerceSectorMeta
      : category === "factory"
      ? factorySectorMeta
      : category === "raw"
      ? rawSectorMeta
      : serviceSectorMeta;
  const rent = skylineRentMonthly(district, size);
  const buyCost = skylinePurchaseCost(district, size);
  const totalCost = purchase ? buyCost : rent;
  const canAfford = cash >= totalCost;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canAfford || pending || !name.trim()) return;
    const formData = new FormData(e.currentTarget);
    startTransition(() => {
      createCompanyAction(formData);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="sector" value={sectorId} />

      {/* Step 0 — Catégorie */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="text-[11px] uppercase tracking-widest text-zinc-400">
          Type d&apos;entreprise
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => setCategory("commerce")}
            className={`rounded-lg border p-3 text-left transition-colors ${
              category === "commerce"
                ? "border-pink-400/60 bg-pink-500/10"
                : "border-white/10 bg-white/[0.02] hover:border-white/20"
            }`}
          >
            <div className="text-2xl">🏪</div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">
              Commerce
            </div>
            <div className="text-[10px] text-zinc-500">
              Vendre au consommateur
            </div>
          </button>
          <button
            type="button"
            onClick={() => setCategory("factory")}
            className={`rounded-lg border p-3 text-left transition-colors ${
              category === "factory"
                ? "border-orange-400/60 bg-orange-500/10"
                : "border-white/10 bg-white/[0.02] hover:border-white/20"
            }`}
          >
            <div className="text-2xl">🏭</div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">
              Usine
            </div>
            <div className="text-[10px] text-zinc-500">
              2 matières → produit fini
            </div>
          </button>
          <button
            type="button"
            onClick={() => setCategory("raw")}
            className={`rounded-lg border p-3 text-left transition-colors ${
              category === "raw"
                ? "border-emerald-400/60 bg-emerald-500/10"
                : "border-white/10 bg-white/[0.02] hover:border-white/20"
            }`}
          >
            <div className="text-2xl">🌾</div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">
              Matière première
            </div>
            <div className="text-[10px] text-zinc-500">
              Champ, mine, élevage...
            </div>
          </button>
          <button
            type="button"
            onClick={() => setCategory("service")}
            className={`rounded-lg border p-3 text-left transition-colors ${
              category === "service"
                ? "border-blue-400/60 bg-blue-500/10"
                : "border-white/10 bg-white/[0.02] hover:border-white/20"
            }`}
          >
            <div className="text-2xl">🔧</div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">
              Service
            </div>
            <div className="text-[10px] text-zinc-500">
              Tech, conseil, sport, BTP...
            </div>
          </button>
        </div>
      </section>

      {/* Step 1 — Secteur */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="text-[11px] uppercase tracking-widest text-zinc-400">
          1. Choisis ton secteur
        </div>
        {category === "commerce" ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {sectors.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => setCommerceSector(s.id)}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                  commerceSector === s.id
                    ? "border-pink-400/60 bg-pink-500/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                <span className="text-2xl">{s.glyph}</span>
                <span className="text-xs font-semibold text-zinc-100">
                  {s.name}
                </span>
                <span className="text-[10px] text-zinc-500">
                  ~{s.minStartCash.toLocaleString("fr-FR")}$ démarrage
                </span>
              </button>
            ))}
          </div>
        ) : category === "factory" ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {FACTORY_SECTORS.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => setFactorySector(s.id)}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                  factorySector === s.id
                    ? "border-orange-400/60 bg-orange-500/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                <span className="text-2xl">{s.glyph}</span>
                <span className="text-xs font-semibold text-zinc-100">
                  {s.name}
                </span>
                <span className="text-[10px] text-zinc-500">
                  ~{s.minStartCash.toLocaleString("fr-FR")}$ démarrage
                </span>
              </button>
            ))}
          </div>
        ) : category === "raw" ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {RAW_SECTORS.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => setRawSector(s.id)}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                  rawSector === s.id
                    ? "border-emerald-400/60 bg-emerald-500/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                <span className="text-2xl">{s.glyph}</span>
                <span className="text-xs font-semibold text-zinc-100">
                  {s.name}
                </span>
                <span className="text-[10px] text-zinc-500">
                  ~{s.minStartCash.toLocaleString("fr-FR")}$ démarrage
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {SERVICE_SECTORS.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => setServiceSector(s.id)}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                  serviceSector === s.id
                    ? "border-blue-400/60 bg-blue-500/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                <span className="text-2xl">{s.glyph}</span>
                <span className="text-xs font-semibold text-zinc-100">
                  {s.name}
                </span>
                <span className="text-[10px] text-zinc-500">
                  ~{s.minStartCash.toLocaleString("fr-FR")}$ démarrage
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-zinc-400">{sectorMeta.description}</p>
        {category === "factory" ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            <span className="text-zinc-400">Recette :</span>
            {factorySectorMeta.inputs.map((inp, i) => (
              <span key={i} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5">
                {inp.qty} × {inp.id}
              </span>
            ))}
            <span>→</span>
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
              {factorySectorMeta.output.qty} × {factorySectorMeta.output.id}
            </span>
          </div>
        ) : null}
        {category === "raw" ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            <span className="text-zinc-400">Production directe :</span>
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
              {SKYLINE_RAW_MATERIALS[rawSectorMeta.output]?.glyph}{" "}
              {SKYLINE_RAW_MATERIALS[rawSectorMeta.output]?.name}
            </span>
            <span className="text-zinc-500">
              · machines {rawSectorMeta.machineKind}
            </span>
          </div>
        ) : null}
        {category === "service" ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            <span className="text-zinc-400">Tarif moyen :</span>
            <span className="rounded-full border border-blue-400/40 bg-blue-500/10 px-2 py-0.5 text-blue-200 tabular-nums">
              {skylineFormatCashFR(serviceSectorMeta.rate)} / prestation
            </span>
            <span className="text-zinc-500">
              · compétence clé {serviceSectorMeta.primarySkill}
            </span>
          </div>
        ) : null}
      </section>

      {/* Step 2 — Nom */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="text-[11px] uppercase tracking-widest text-zinc-400">
          2. Nom de l&apos;entreprise
        </div>
        <input
          type="text"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          placeholder="Ex : La Boulange du Coin"
          className="mt-2 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-pink-400/50"
          required
        />
      </section>

      {/* Step 3 — Quartier */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="text-[11px] uppercase tracking-widest text-zinc-400">
          3. Quartier
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {districts.map((d) => (
            <button
              type="button"
              key={d.id}
              onClick={() => setDistrict(d.id)}
              className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                district === d.id
                  ? `${d.border} bg-white/[0.04]`
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <span className={`text-base font-semibold ${d.accent}`}>
                {d.glyph} {d.name}
              </span>
              <span className="text-[10px] tabular-nums text-zinc-400">
                {d.rentPerSqm}$ /m²/mois
              </span>
              <span className="text-[10px] leading-tight text-zinc-500">
                {d.description}
              </span>
            </button>
          ))}
        </div>
        <input type="hidden" name="district" value={district} />
      </section>

      {/* Step 4 — Taille local */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="text-[11px] uppercase tracking-widest text-zinc-400">
          4. Taille du local
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {sizes.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => setSize(s.id)}
              className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors ${
                size === s.id
                  ? "border-pink-400/60 bg-pink-500/10"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <span className="text-base font-bold text-zinc-100">
                {s.name}
              </span>
              <span className="text-[10px] tabular-nums text-zinc-400">
                {s.sqm} m²
              </span>
            </button>
          ))}
        </div>
        <input type="hidden" name="local_size" value={size} />
      </section>

      {/* Step 5 — Loyer / achat */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="text-[11px] uppercase tracking-widest text-zinc-400">
          5. Loyer ou achat
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label
            className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 ${
              !purchase
                ? "border-emerald-400/60 bg-emerald-500/10"
                : "border-white/10 bg-white/[0.02]"
            }`}
          >
            <input
              type="radio"
              checked={!purchase}
              onChange={() => setPurchase(false)}
              className="sr-only"
            />
            <span className="text-sm font-semibold text-zinc-100">
              📜 Louer
            </span>
            <span className="text-[10px] text-zinc-400">
              Caution = 1 mois de loyer
            </span>
            <span className="text-base font-bold tabular-nums text-emerald-200">
              {skylineFormatCashFR(rent)}
            </span>
            <span className="text-[10px] text-zinc-500">
              Loyer mensuel : {skylineFormatCashFR(rent)}
            </span>
          </label>
          <label
            className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 ${
              purchase
                ? "border-amber-400/60 bg-amber-500/10"
                : "border-white/10 bg-white/[0.02]"
            }`}
          >
            <input
              type="radio"
              checked={purchase}
              onChange={() => setPurchase(true)}
              className="sr-only"
            />
            <span className="text-sm font-semibold text-zinc-100">
              🏠 Acheter
            </span>
            <span className="text-[10px] text-zinc-400">
              100× loyer mensuel — pas de loyer ensuite
            </span>
            <span className="text-base font-bold tabular-nums text-amber-200">
              {skylineFormatCashFR(buyCost)}
            </span>
          </label>
        </div>
        <input
          type="checkbox"
          name="purchase"
          checked={purchase}
          onChange={(e) => setPurchase(e.target.checked)}
          className="sr-only"
        />
      </section>

      {/* Récap & submit */}
      <section className="rounded-xl border border-pink-400/40 bg-black/60 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">Coût aujourd&apos;hui</span>
          <span
            className={`text-xl font-bold tabular-nums ${
              canAfford ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {skylineFormatCashFR(totalCost)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-zinc-500">Cash dispo</span>
          <span className="tabular-nums text-zinc-300">
            {skylineFormatCashFR(cash)}
          </span>
        </div>
        {!canAfford ? (
          <div className="mt-2 text-xs text-rose-300">
            Cash insuffisant. Convertis des OS en $ via le pont, ou choisis un
            local moins cher.
          </div>
        ) : null}
        <button
          type="submit"
          disabled={!canAfford || pending || !name.trim()}
          className="mt-4 w-full rounded-md border border-pink-400/50 bg-pink-500/15 px-4 py-2.5 text-sm font-semibold text-pink-100 transition-colors hover:bg-pink-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Création en cours..." : "🏗️ Lancer l'entreprise"}
        </button>
      </section>
    </form>
  );
}
