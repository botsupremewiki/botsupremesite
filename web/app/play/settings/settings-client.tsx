"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTheme, ThemeToggle } from "@/components/theme-provider";
import { useToast } from "@/components/toast";

type Preferences = {
  notifications_enabled?: boolean;
  notifications_trades?: boolean;
  notifications_tournaments?: boolean;
  notifications_seasons?: boolean;
  sounds_enabled?: boolean;
  compact_mode?: boolean;
};

export function SettingsClient({
  initialPreferences,
}: {
  initialPreferences: Preferences;
}) {
  const [prefs, setPrefs] = useState<Preferences>(initialPreferences);
  const toast = useToast();
  const { resolved } = useTheme();

  async function patch(p: Partial<Preferences>) {
    const next = { ...prefs, ...p };
    setPrefs(next);
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("set_my_preferences", { p_patch: p });
    if (error) {
      toast.error(error.message);
      // Rollback optimiste.
      setPrefs(prefs);
    } else {
      toast.success("Préférence sauvegardée");
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* ── Apparence ──────────────────────────────────────────── */}
      <Section title="🎨 Apparence">
        <Row
          label="Thème"
          description={`Actuellement : ${resolved}.`}
        >
          <ThemeToggle />
        </Row>
        <Toggle
          label="Mode compact"
          description="Réduire les paddings et marges (densité d'info plus haute)."
          value={prefs.compact_mode ?? false}
          onChange={(v) => patch({ compact_mode: v })}
        />
      </Section>

      {/* ── Notifications ──────────────────────────────────────── */}
      <Section title="🔔 Notifications">
        <Toggle
          label="Activer les notifications"
          description="Master switch — désactive tout d'un coup."
          value={prefs.notifications_enabled ?? true}
          onChange={(v) => patch({ notifications_enabled: v })}
        />
        <Toggle
          label="Échanges (trades)"
          description="Quand un joueur te propose un échange ou répond au tien."
          value={prefs.notifications_trades ?? true}
          onChange={(v) => patch({ notifications_trades: v })}
          disabled={!(prefs.notifications_enabled ?? true)}
        />
        <Toggle
          label="Tournois"
          description="Démarrage d'un tournoi auquel tu es inscrit."
          value={prefs.notifications_tournaments ?? true}
          onChange={(v) => patch({ notifications_tournaments: v })}
          disabled={!(prefs.notifications_enabled ?? true)}
        />
        <Toggle
          label="Saisons ranked"
          description="Clôture d'une saison avec snapshot ELO + récompenses."
          value={prefs.notifications_seasons ?? true}
          onChange={(v) => patch({ notifications_seasons: v })}
          disabled={!(prefs.notifications_enabled ?? true)}
        />
      </Section>

      {/* ── Sons ───────────────────────────────────────────────── */}
      <Section title="🔊 Sons">
        <Toggle
          label="Effets sonores"
          description="Sons pendant les matchs (cartes posées, KO, victoire)."
          value={prefs.sounds_enabled ?? true}
          onChange={(v) => patch({ sounds_enabled: v })}
        />
      </Section>

      {/* ── A11y info ──────────────────────────────────────────── */}
      <Section title="♿ Accessibilité">
        <div className="rounded-md border border-cyan-300/30 bg-cyan-300/[0.03] p-3 text-xs text-cyan-100">
          Le site respecte automatiquement la préférence{" "}
          <code className="rounded bg-black/30 px-1">
            prefers-reduced-motion
          </code>{" "}
          de ton OS — les animations longues sont désactivées si tu as coché
          &quot;réduire les animations&quot;. Configurable dans les
          paramètres système (macOS, Windows, iOS, Android).
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
    <section className="rounded-xl border border-white/10 bg-black/40 p-4">
      <h2 className="text-base font-bold text-zinc-100">{title}</h2>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-zinc-100">{label}</div>
        {description ? (
          <div className="mt-0.5 text-[11px] text-zinc-500">{description}</div>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 ${disabled ? "opacity-50" : ""}`}
    >
      <div>
        <div className="text-sm font-semibold text-zinc-100">{label}</div>
        {description ? (
          <div className="mt-0.5 text-[11px] text-zinc-500">{description}</div>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
          value
            ? "border-emerald-400/50 bg-emerald-400/30"
            : "border-white/10 bg-white/5"
        } disabled:cursor-not-allowed`}
        aria-label={`${label} ${value ? "activé" : "désactivé"}`}
      >
        <span
          className={`absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-[1.25rem]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
