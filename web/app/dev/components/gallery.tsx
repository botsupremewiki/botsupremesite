"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/icon";
import {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonAvatar,
  SkeletonGrid,
} from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ToastProvider, useToast } from "@/components/toast";
import { Tooltip } from "@/components/tooltip";
import { useConfirm } from "@/components/confirm-dialog";
import { ThemeProvider, ThemeToggle } from "@/components/theme-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Sparkline, DonutChart, BarChart } from "@/components/charts";

/** Wrapper qui fournit Toast + Theme providers (la page /dev est hors
 *  /play donc n'a pas hérité des providers du layout play). */
export function ComponentsGallery() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ComponentsGalleryInner />
      </ToastProvider>
    </ThemeProvider>
  );
}

const ALL_ICONS: IconName[] = [
  "search", "settings", "user", "users", "home", "bell", "trash", "edit",
  "plus", "minus", "check", "x", "chevron-right", "chevron-left",
  "chevron-up", "chevron-down", "arrow-right", "arrow-left", "send",
  "share", "copy", "external", "lock", "unlock", "eye", "eye-off",
  "heart", "star", "trophy", "flag", "info", "alert-triangle", "play",
  "pause", "skip-forward", "skip-back", "swords", "coins", "package",
  "filter", "sort", "calendar", "clock", "moon", "sun", "monitor",
  "log-out", "menu", "more-horizontal", "spinner",
];

function ComponentsGalleryInner() {
  const toast = useToast();
  const [askDelete, confirmNode] = useConfirm();
  const [deleted, setDeleted] = useState(false);

  return (
    <div className="w-full max-w-4xl space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-zinc-100">
          🧩 Components Gallery
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Preview de tous les composants UI partagés. Sert de
          documentation visuelle et de smoke-test pour les modifications.
          Pas interactif comme Storybook, mais zéro install.
        </p>
      </header>

      {/* ── Theme & i18n ──────────────────────────────────────── */}
      <Section title="🎨 Theme & i18n">
        <div className="flex flex-wrap items-center gap-3">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </Section>

      {/* ── Icons ─────────────────────────────────────────────── */}
      <Section title="🎯 Icons (50)">
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
          {ALL_ICONS.map((name) => (
            <div
              key={name}
              className="flex flex-col items-center gap-1 rounded-md border border-white/10 bg-black/30 p-2 text-center"
            >
              <Icon name={name} size={20} className="text-zinc-200" />
              <span className="truncate text-[9px] text-zinc-500">
                {name}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Skeletons ─────────────────────────────────────────── */}
      <Section title="💀 Skeletons">
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-widest text-zinc-500">
              Text
            </div>
            <SkeletonText width="60%" />
            <SkeletonText className="mt-2" width="80%" />
          </div>
          <div className="flex items-center gap-3">
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-widest text-zinc-500">
                Avatar
              </div>
              <SkeletonAvatar />
            </div>
            <div className="flex-1">
              <div className="mb-1 text-[11px] uppercase tracking-widest text-zinc-500">
                Block
              </div>
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-widest text-zinc-500">
              Card
            </div>
            <SkeletonCard />
          </div>
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-widest text-zinc-500">
              Grid
            </div>
            <SkeletonGrid count={6} cols="grid-cols-3 sm:grid-cols-6" height="h-20" />
          </div>
        </div>
      </Section>

      {/* ── Empty States ─────────────────────────────────────── */}
      <Section title="📭 Empty states">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <EmptyState
            icon="📜"
            title="Aucun match"
            description="Joue ton premier PvP pour voir l'historique."
            cta={{ label: "Lancer un match", href: "#" }}
          />
          <EmptyState
            icon="🔍"
            title="Aucun résultat"
            description="Aucune carte ne correspond à ces filtres."
            variant="amber"
          />
          <EmptyState
            icon="❌"
            title="Erreur réseau"
            description="Impossible de charger. Réessaie ?"
            variant="rose"
          />
          <EmptyState
            icon="✨"
            title="Tout terminé"
            description="Bravo, tu as complété toutes les quêtes !"
            variant="emerald"
          />
        </div>
      </Section>

      {/* ── Toasts ────────────────────────────────────────────── */}
      <Section title="🍞 Toasts">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => toast.success("Action réussie !")}
            className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-400/20"
          >
            success
          </button>
          <button
            type="button"
            onClick={() => toast.error("Erreur, retry stp")}
            className="rounded-md border border-rose-400/40 bg-rose-400/10 px-3 py-1.5 text-xs font-bold text-rose-200 transition-colors hover:bg-rose-400/20"
          >
            error
          </button>
          <button
            type="button"
            onClick={() => toast.info("Pour info, c'est à 14h")}
            className="rounded-md border border-sky-400/40 bg-sky-400/10 px-3 py-1.5 text-xs font-bold text-sky-200 transition-colors hover:bg-sky-400/20"
          >
            info
          </button>
          <button
            type="button"
            onClick={() => toast.warning("Attention, action irréversible")}
            className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-400/20"
          >
            warning
          </button>
        </div>
      </Section>

      {/* ── Tooltip ───────────────────────────────────────────── */}
      <Section title="💬 Tooltip">
        <div className="flex flex-wrap gap-3">
          {(["top", "bottom", "left", "right"] as const).map((side) => (
            <Tooltip key={side} content={`Tooltip ${side}`} side={side}>
              <button
                type="button"
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-white/10"
              >
                Hover : {side}
              </button>
            </Tooltip>
          ))}
        </div>
      </Section>

      {/* ── Confirm dialog ────────────────────────────────────── */}
      <Section title="⚠️ Confirm dialog">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              const ok = await askDelete({
                title: "Confirmer l'action ?",
                description: "Cette action est sans danger, juste un test.",
                confirmLabel: "OK",
              });
              if (ok) toast.success("Confirmé");
              else toast.info("Annulé");
            }}
            className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-400/20"
          >
            Confirm normal
          </button>
          <button
            type="button"
            onClick={async () => {
              const ok = await askDelete({
                title: "Supprimer le deck ?",
                description: "Action irréversible. Le deck sera perdu.",
                danger: true,
                confirmLabel: "Supprimer",
                cancelLabel: "Garder",
              });
              if (ok) {
                setDeleted(true);
                toast.success("Deck supprimé (simulé)");
              }
            }}
            className="rounded-md border border-rose-400/40 bg-rose-400/10 px-3 py-1.5 text-xs font-bold text-rose-200 transition-colors hover:bg-rose-400/20"
          >
            Confirm danger
          </button>
          {deleted ? (
            <span className="text-xs text-zinc-500">(supprimé : {String(deleted)})</span>
          ) : null}
        </div>
        {confirmNode}
      </Section>

      {/* ── Charts ────────────────────────────────────────────── */}
      <Section title="📊 Charts">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-500">
              Sparkline
            </div>
            <Sparkline
              data={[
                { x: 0, y: 1000 },
                { x: 1, y: 1015 },
                { x: 2, y: 990 },
                { x: 3, y: 1042 },
                { x: 4, y: 1078 },
                { x: 5, y: 1051 },
                { x: 6, y: 1098 },
                { x: 7, y: 1120 },
              ]}
              showDots
            />
          </div>
          <div className="flex flex-col items-center rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="mb-2 self-start text-[11px] uppercase tracking-widest text-zinc-500">
              Donut
            </div>
            <DonutChart
              segments={[
                { label: "Wins", value: 28, color: "rgb(52 211 153)" },
                { label: "Losses", value: 12, color: "rgb(244 63 94)" },
              ]}
              centerLabel="70%"
              centerSubLabel="Winrate"
            />
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-500">
              Bar chart
            </div>
            <BarChart
              items={[
                { label: "Bulbizarre", value: 42, color: "rgb(52 211 153)" },
                { label: "Salamèche", value: 35, color: "rgb(244 63 94)" },
                { label: "Carapuce", value: 28, color: "rgb(56 189 248)" },
                { label: "Pikachu", value: 50, color: "rgb(251 191 36)" },
              ]}
            />
          </div>
        </div>
      </Section>

      {/* ── Buttons reference ─────────────────────────────────── */}
      <Section title="🎛️ Boutons standards">
        <div className="flex flex-wrap gap-2">
          <button className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400/20">
            Primary
          </button>
          <button className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-400/20">
            Success
          </button>
          <button className="rounded-md border border-rose-400/40 bg-rose-400/10 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-400/20">
            Danger
          </button>
          <button className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10">
            Secondary
          </button>
          <button
            disabled
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 disabled:opacity-50"
          >
            Disabled
          </button>
        </div>
      </Section>

      {/* ── Tile colors ───────────────────────────────────────── */}
      <Section title="🎨 Palette de couleurs">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["amber", "rgb(251 191 36)"],
            ["emerald", "rgb(52 211 153)"],
            ["rose", "rgb(244 63 94)"],
            ["sky", "rgb(56 189 248)"],
            ["violet", "rgb(167 139 250)"],
            ["fuchsia", "rgb(232 121 249)"],
            ["cyan", "rgb(34 211 238)"],
            ["zinc", "rgb(161 161 170)"],
          ].map(([name, color]) => (
            <div
              key={name}
              className="flex items-center gap-2 rounded-md border border-white/10 bg-black/30 p-2"
            >
              <span
                className="h-6 w-6 rounded"
                style={{ background: color }}
              />
              <span className="text-xs text-zinc-200">{name}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-black/40 p-5">
      <h2 className="text-lg font-bold text-zinc-100">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
