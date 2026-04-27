"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Appearance,
  Direction,
  GlassesStyle,
  HairStyle,
  HatStyle,
  SkinTone,
} from "@shared/types";
import type { GameScene, SceneConfig } from "@/lib/game/scene";
import { createClient } from "@/lib/supabase/client";

const SKIN_OPTIONS: { id: SkinTone; label: string; swatch: string }[] = [
  { id: "pale", label: "Pâle", swatch: "#fde4cf" },
  { id: "beige", label: "Beige", swatch: "#f2c4a3" },
  { id: "tan", label: "Hâlée", swatch: "#d6996b" },
  { id: "brown", label: "Brune", swatch: "#9c6b46" },
  { id: "dark", label: "Foncée", swatch: "#5c3a26" },
];

const HAIR_OPTIONS: { id: HairStyle; label: string }[] = [
  { id: "short", label: "Courts" },
  { id: "long", label: "Longs" },
  { id: "bun", label: "Chignon" },
  { id: "mohawk", label: "Mohawk" },
  { id: "bald", label: "Chauve" },
];

const HAT_OPTIONS: { id: HatStyle; label: string }[] = [
  { id: "none", label: "Aucun" },
  { id: "cap", label: "Casquette" },
  { id: "crown", label: "Couronne" },
  { id: "wizard", label: "Magicien" },
  { id: "headband", label: "Bandeau" },
  { id: "horns", label: "Cornes" },
];

const GLASSES_OPTIONS: { id: GlassesStyle; label: string }[] = [
  { id: "none", label: "Aucune" },
  { id: "round", label: "Rondes" },
  { id: "shades", label: "Lunettes noires" },
  { id: "monocle", label: "Monocle" },
];

const BODY_PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#f43f5e",
  "#0ea5e9",
  "#84cc16",
];

const HAIR_PALETTE = [
  "#1f2937",
  "#3f3f46",
  "#78350f",
  "#a16207",
  "#fde68a",
  "#f97316",
  "#dc2626",
  "#a855f7",
  "#06b6d4",
  "#ec4899",
];

const PREVIEW_SIZE = 320;

const PREVIEW_CONFIG: SceneConfig = {
  width: PREVIEW_SIZE,
  height: PREVIEW_SIZE,
  backgroundColor: 0x0b0b14,
  floorColor: 0x12121c,
  floorAccentColor: 0xffffff,
  floorAccentAlpha: 0.018,
  ambiance: "neutral",
  landmarks: [],
};

const PREVIEW_DIRECTIONS: Direction[] = ["down", "right", "up", "left"];

export function CustomizeForm({
  userId,
  username,
  initialAppearance,
}: {
  userId: string;
  username: string;
  initialAppearance: Appearance | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const dirIdxRef = useRef(0);

  const [appearance, setAppearance] = useState<Appearance>(() => ({
    bodyColor: initialAppearance?.bodyColor ?? "#3b82f6",
    skinTone: initialAppearance?.skinTone ?? "pale",
    hairStyle: initialAppearance?.hairStyle ?? "short",
    hairColor: initialAppearance?.hairColor ?? "#3f3f46",
    hat: initialAppearance?.hat ?? "none",
    glasses: initialAppearance?.glasses ?? "none",
  }));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mount Pixi preview scene once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let scene: GameScene | null = null;
    let rotateInterval: ReturnType<typeof setInterval> | null = null;

    (async () => {
      const mod = await import("@/lib/game/scene");
      if (cancelled) return;
      scene = new mod.GameScene(PREVIEW_CONFIG);
      await scene.init(host);
      if (cancelled) {
        scene.destroy();
        return;
      }
      sceneRef.current = scene;
      scene.addPlayer({
        id: "self",
        name: username,
        x: PREVIEW_SIZE / 2,
        y: PREVIEW_SIZE / 2 + 10,
        direction: "down",
        color: appearance.bodyColor ?? "#3b82f6",
        appearance,
      });

      // Rotate the avatar through the 4 directions every 1.4s so the user
      // can see how their look reads from every angle.
      rotateInterval = setInterval(() => {
        if (!sceneRef.current) return;
        dirIdxRef.current = (dirIdxRef.current + 1) % PREVIEW_DIRECTIONS.length;
        const dir = PREVIEW_DIRECTIONS[dirIdxRef.current];
        sceneRef.current.updatePlayer(
          "self",
          PREVIEW_SIZE / 2,
          PREVIEW_SIZE / 2 + 10,
          dir,
        );
      }, 1400);
    })();

    return () => {
      cancelled = true;
      if (rotateInterval) clearInterval(rotateInterval);
      if (scene) {
        scene.destroy();
        if (sceneRef.current === scene) sceneRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  // Push appearance changes into the live scene.
  useEffect(() => {
    sceneRef.current?.updatePlayerAppearance("self", appearance);
  }, [appearance]);

  function update<K extends keyof Appearance>(key: K, value: Appearance[K]) {
    setAppearance((prev) => ({ ...prev, [key]: value }));
    setSavedAt(null);
    setError(null);
  }

  async function save() {
    if (!supabase) {
      setError("Auth Supabase non configuré.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          appearance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (updateError) {
        setError(updateError.message);
      } else {
        setSavedAt(Date.now());
        // Refresh server data so plaza picks up the new look on next mount.
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 lg:flex-row">
      {/* Preview column ─────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-3">
        <div
          ref={hostRef}
          style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
          className="overflow-hidden rounded-2xl border border-white/10 shadow-xl shadow-purple-500/10"
        />
        <div className="text-xs text-zinc-500">
          Aperçu en direct · rotation auto
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="mt-2 w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-amber-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
        >
          {saving ? "Sauvegarde…" : "Sauvegarder"}
        </button>
        {savedAt && (
          <div className="text-xs text-emerald-400">
            ✓ Sauvegardé · visible en plaza dès la prochaine connexion
          </div>
        )}
        {error && (
          <div className="rounded-md border border-rose-400/40 bg-rose-400/10 px-3 py-1.5 text-xs text-rose-300">
            {error}
          </div>
        )}
      </div>

      {/* Options column ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-5">
        <Section title="Couleur du corps">
          <Swatches
            options={BODY_PALETTE}
            value={appearance.bodyColor ?? "#3b82f6"}
            onChange={(c) => update("bodyColor", c)}
          />
        </Section>

        <Section title="Peau">
          <div className="flex flex-wrap gap-2">
            {SKIN_OPTIONS.map((s) => {
              const active = appearance.skinTone === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => update("skinTone", s.id)}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                    active
                      ? "border-amber-400 bg-amber-400/10 text-amber-200"
                      : "border-white/10 bg-white/[0.02] text-zinc-300 hover:border-white/20"
                  }`}
                >
                  <span
                    className="inline-block h-4 w-4 rounded-full border border-black/30"
                    style={{ backgroundColor: s.swatch }}
                  />
                  {s.label}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Cheveux — style">
          <Pills
            options={HAIR_OPTIONS}
            value={appearance.hairStyle ?? "short"}
            onChange={(v) => update("hairStyle", v)}
          />
        </Section>

        {appearance.hairStyle !== "bald" && (
          <Section title="Cheveux — couleur">
            <Swatches
              options={HAIR_PALETTE}
              value={appearance.hairColor ?? "#3f3f46"}
              onChange={(c) => update("hairColor", c)}
            />
          </Section>
        )}

        <Section title="Chapeau">
          <Pills
            options={HAT_OPTIONS}
            value={appearance.hat ?? "none"}
            onChange={(v) => update("hat", v)}
          />
        </Section>

        <Section title="Lunettes">
          <Pills
            options={GLASSES_OPTIONS}
            value={appearance.glasses ?? "none"}
            onChange={(v) => update("glasses", v)}
          />
        </Section>
      </div>
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
    <div className="flex flex-col gap-2">
      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
        {title}
      </div>
      {children}
    </div>
  );
}

function Pills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
              active
                ? "border-amber-400 bg-amber-400/10 text-amber-200"
                : "border-white/10 bg-white/[0.02] text-zinc-300 hover:border-white/20"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Swatches({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((c) => {
        const active = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            onClick={() => onChange(c)}
            title={c}
            className={`h-8 w-8 rounded-md border-2 transition-transform ${
              active
                ? "scale-110 border-amber-400"
                : "border-white/10 hover:border-white/30"
            }`}
            style={{ backgroundColor: c }}
          />
        );
      })}
      <label className="flex h-8 w-12 cursor-pointer items-center justify-center rounded-md border-2 border-white/10 bg-white/[0.02] text-[9px] uppercase tracking-wide text-zinc-400 hover:border-white/30">
        Custom
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute h-0 w-0 opacity-0"
        />
      </label>
    </div>
  );
}
