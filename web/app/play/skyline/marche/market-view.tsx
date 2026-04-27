"use client";

import { useMemo, useState } from "react";
import {
  SKYLINE_INTERMEDIATE_PRODUCTS,
  SKYLINE_PRODUCTS,
  SKYLINE_RAW_MATERIALS,
  skylineFormatCashFR,
  type SkylineMarketCourseRow,
  type SkylineNewsRow,
  type SkylineRawMaterialId,
} from "@shared/skyline";

type Filter = "all" | "products" | "intermediate" | "raw";

function classify(productId: string): Filter {
  if (SKYLINE_RAW_MATERIALS[productId as SkylineRawMaterialId]) return "raw";
  if (SKYLINE_INTERMEDIATE_PRODUCTS[productId]) return "intermediate";
  if (SKYLINE_PRODUCTS[productId]) return "products";
  return "all";
}

function getMeta(productId: string) {
  const p = SKYLINE_PRODUCTS[productId];
  if (p) return { name: p.name, glyph: p.glyph };
  const i = SKYLINE_INTERMEDIATE_PRODUCTS[productId];
  if (i) return { name: i.name, glyph: i.glyph };
  const m = SKYLINE_RAW_MATERIALS[productId as SkylineRawMaterialId];
  if (m) return { name: m.name, glyph: m.glyph };
  return { name: productId, glyph: "📦" };
}

export function MarketView({
  courses,
  news,
}: {
  courses: SkylineMarketCourseRow[];
  news: SkylineNewsRow[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return courses
      .filter((c) => filter === "all" || classify(c.product_id) === filter)
      .filter((c) => {
        if (!search.trim()) return true;
        const meta = getMeta(c.product_id);
        return (
          meta.name.toLowerCase().includes(search.toLowerCase()) ||
          c.product_id.toLowerCase().includes(search.toLowerCase())
        );
      })
      .sort((a, b) => Math.abs(Number(b.trend_24h)) - Math.abs(Number(a.trend_24h)));
  }, [courses, filter, search]);

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.06),transparent_60%)] p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">📊 Marché commun</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Cours produits + matières premières + intermédiaires. Mis à jour en
            continu selon offre/demande globale et événements actifs.
          </p>
        </div>

        {/* Fil d'actu */}
        {news.length > 0 ? (
          <section className="rounded-xl border border-cyan-400/40 bg-black/40 p-4">
            <h2 className="text-sm font-semibold text-cyan-200">
              📰 Fil d&apos;actu Skyline
            </h2>
            <ul className="mt-3 space-y-2 text-xs">
              {news.slice(0, 5).map((n) => {
                const impact = Number(n.impact_pct);
                return (
                  <li
                    key={n.id}
                    className="rounded border border-white/5 bg-white/[0.02] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-zinc-100">
                          {n.headline}
                        </div>
                        <div className="mt-0.5 text-zinc-400">{n.body}</div>
                      </div>
                      <span
                        className={`whitespace-nowrap tabular-nums font-semibold ${
                          impact >= 0 ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {impact >= 0 ? "+" : ""}
                        {impact.toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-zinc-500">
                      {new Date(n.created_at).toLocaleString("fr-FR")}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterButton current={filter} value="all" onClick={setFilter}>
            Tous ({courses.length})
          </FilterButton>
          <FilterButton current={filter} value="products" onClick={setFilter}>
            🏪 Produits commerce
          </FilterButton>
          <FilterButton
            current={filter}
            value="intermediate"
            onClick={setFilter}
          >
            🏭 Intermédiaires
          </FilterButton>
          <FilterButton current={filter} value="raw" onClick={setFilter}>
            🌾 Matières 1ères
          </FilterButton>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="ml-auto w-48 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-400/50"
          />
        </div>

        {/* Cours */}
        <section className="rounded-xl border border-white/10 bg-black/40 p-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-zinc-500">
                <tr className="border-b border-white/5">
                  <th className="py-2 text-left">Produit</th>
                  <th className="text-right">Cours</th>
                  <th className="text-right">Réf.</th>
                  <th className="text-right">Tendance 24h</th>
                  <th className="text-right">Plus haut 30j</th>
                  <th className="text-right">Plus bas 30j</th>
                  <th className="text-right">Volume 24h</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-6 text-center text-zinc-500"
                    >
                      Aucun produit ne correspond aux filtres.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    const meta = getMeta(c.product_id);
                    const trend = Number(c.trend_24h);
                    const ref = Number(c.ref_price);
                    const cur = Number(c.current_price);
                    const drift = ((cur - ref) / ref) * 100;
                    return (
                      <tr
                        key={c.product_id}
                        className="border-b border-white/5 hover:bg-white/[0.02]"
                      >
                        <td className="py-2 text-zinc-200">
                          {meta.glyph} {meta.name}
                        </td>
                        <td className="text-right text-zinc-100 font-semibold">
                          {skylineFormatCashFR(cur)}
                        </td>
                        <td className="text-right text-zinc-500">
                          {skylineFormatCashFR(ref)}
                        </td>
                        <td
                          className={`text-right ${
                            trend >= 0 ? "text-emerald-300" : "text-rose-300"
                          }`}
                        >
                          {trend >= 0 ? "↗" : "↘"} {trend.toFixed(2)}%
                          <span className="ml-1 text-[10px] text-zinc-500">
                            ({drift >= 0 ? "+" : ""}
                            {drift.toFixed(0)}% vs ref)
                          </span>
                        </td>
                        <td className="text-right text-zinc-400">
                          {skylineFormatCashFR(Number(c.high_30d))}
                        </td>
                        <td className="text-right text-zinc-400">
                          {skylineFormatCashFR(Number(c.low_30d))}
                        </td>
                        <td className="text-right text-zinc-500">
                          {Number(c.volume_24h).toLocaleString("fr-FR")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-[11px] text-zinc-500">
          Achats / ventes sur le marché : depuis l&apos;onglet Marché B2B de
          ton entreprise (usines) ou les onglets Stock/Ventes (commerces).
        </p>
      </div>
    </main>
  );
}

function FilterButton({
  current,
  value,
  onClick,
  children,
}: {
  current: Filter;
  value: Filter;
  onClick: (f: Filter) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100"
          : "border-white/10 bg-black/40 text-zinc-400 hover:border-white/20"
      }`}
    >
      {children}
    </button>
  );
}
