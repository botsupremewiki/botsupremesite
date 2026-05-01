"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTheme, ThemeToggle } from "@/components/theme-provider";
import { useToast } from "@/components/toast";
import { useLocale } from "@/lib/i18n-client";
import { setSoundsEnabled } from "@/lib/sounds";

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
  const { t } = useLocale();

  // Sync localStorage cache pour useSounds() (utilisé hors React tree).
  useEffect(() => {
    setSoundsEnabled(prefs.sounds_enabled ?? true);
  }, [prefs.sounds_enabled]);

  async function patch(p: Partial<Preferences>) {
    const next = { ...prefs, ...p };
    setPrefs(next);
    // Sync localStorage immédiat pour les sons (avant l'appel SQL).
    if (typeof p.sounds_enabled === "boolean") {
      setSoundsEnabled(p.sounds_enabled);
    }
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("set_my_preferences", { p_patch: p });
    if (error) {
      toast.error(error.message);
      setPrefs(prefs);
    } else {
      toast.success(t("settings.saved"));
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* ── Apparence ──────────────────────────────────────────── */}
      <Section title={t("settings.appearance")}>
        <Row
          label={t("settings.theme")}
          description={`${t("settings.themeCurrent")} : ${resolved}.`}
        >
          <ThemeToggle />
        </Row>
        <Toggle
          label={t("settings.compactMode")}
          description={t("settings.compactModeDesc")}
          value={prefs.compact_mode ?? false}
          onChange={(v) => patch({ compact_mode: v })}
        />
      </Section>

      {/* ── Notifications ──────────────────────────────────────── */}
      <Section title={t("settings.notifications")}>
        <Toggle
          label={t("settings.notifEnable")}
          description={t("settings.notifEnableDesc")}
          value={prefs.notifications_enabled ?? true}
          onChange={(v) => patch({ notifications_enabled: v })}
        />
        <Toggle
          label={t("settings.notifTrades")}
          description={t("settings.notifTradesDesc")}
          value={prefs.notifications_trades ?? true}
          onChange={(v) => patch({ notifications_trades: v })}
          disabled={!(prefs.notifications_enabled ?? true)}
        />
        <Toggle
          label={t("settings.notifTournaments")}
          description={t("settings.notifTournamentsDesc")}
          value={prefs.notifications_tournaments ?? true}
          onChange={(v) => patch({ notifications_tournaments: v })}
          disabled={!(prefs.notifications_enabled ?? true)}
        />
        <Toggle
          label={t("settings.notifSeasons")}
          description={t("settings.notifSeasonsDesc")}
          value={prefs.notifications_seasons ?? true}
          onChange={(v) => patch({ notifications_seasons: v })}
          disabled={!(prefs.notifications_enabled ?? true)}
        />
      </Section>

      {/* ── Sons ───────────────────────────────────────────────── */}
      <Section title={t("settings.sounds")}>
        <Toggle
          label={t("settings.sfx")}
          description={t("settings.sfxDesc")}
          value={prefs.sounds_enabled ?? true}
          onChange={(v) => patch({ sounds_enabled: v })}
        />
      </Section>

      {/* ── A11y info ──────────────────────────────────────────── */}
      <Section title={t("settings.a11y")}>
        <div className="rounded-md border border-cyan-300/30 bg-cyan-300/[0.03] p-3 text-xs text-cyan-100">
          {t("settings.a11yMotion")}
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
