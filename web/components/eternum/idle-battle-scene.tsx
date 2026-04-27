"use client";

// Animation idle "héros qui tape un monstre" — purement cosmétique.
// Ne modifie aucun état serveur. Le tick économique (toutes les 30s côté SQL)
// continue indépendamment ; cette anim suggère juste l'action.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ETERNUM_CLASSES,
  ETERNUM_ELEMENTS,
  type EternumClassId,
  type EternumElementId,
} from "@shared/types";

// Catalogue de monstres cosmétiques selon stage.
// Stage 1-5 = vermine, 6-15 = humanoïdes, 16-30 = bêtes,
// 31-50 = élites, 51+ = boss/dragons.
const MONSTERS: { range: [number, number]; glyph: string; name: string; hp: number }[] = [
  { range: [1, 5], glyph: "🐀", name: "Rat", hp: 50 },
  { range: [1, 5], glyph: "🪲", name: "Scarabée", hp: 60 },
  { range: [1, 5], glyph: "🦇", name: "Chauve-souris", hp: 55 },
  { range: [6, 15], glyph: "👺", name: "Gobelin", hp: 120 },
  { range: [6, 15], glyph: "🧟", name: "Mort-vivant", hp: 150 },
  { range: [6, 15], glyph: "🦂", name: "Scorpion géant", hp: 130 },
  { range: [16, 30], glyph: "🐺", name: "Loup noir", hp: 250 },
  { range: [16, 30], glyph: "🐗", name: "Sanglier", hp: 280 },
  { range: [16, 30], glyph: "🦁", name: "Lion d'or", hp: 300 },
  { range: [31, 50], glyph: "🐉", name: "Dragonnet", hp: 500 },
  { range: [31, 50], glyph: "👹", name: "Ogre", hp: 600 },
  { range: [31, 50], glyph: "🦅", name: "Aigle royal", hp: 480 },
  { range: [51, 100], glyph: "🐲", name: "Wyvern ancestrale", hp: 1000 },
  { range: [51, 100], glyph: "👿", name: "Démon", hp: 1100 },
  { range: [51, 100], glyph: "💀", name: "Liche", hp: 950 },
];

function pickMonsterFor(stage: number) {
  const pool = MONSTERS.filter(
    (m) => stage >= m.range[0] && stage <= m.range[1],
  );
  const list = pool.length > 0 ? pool : MONSTERS;
  return list[Math.floor(Math.random() * list.length)];
}

type FloatingDmg = { id: number; dmg: number; isCrit: boolean };

export function IdleBattleScene({
  classId,
  elementId,
  stage,
}: {
  classId: EternumClassId;
  elementId: EternumElementId;
  stage: number;
}) {
  const cls = ETERNUM_CLASSES[classId];
  const elt = ETERNUM_ELEMENTS[elementId];

  const [monster, setMonster] = useState(() => pickMonsterFor(stage));
  const [hp, setHp] = useState(monster.hp);
  const [swinging, setSwinging] = useState(false);
  const [hit, setHit] = useState(false);
  const [floatings, setFloatings] = useState<FloatingDmg[]>([]);
  const [killCount, setKillCount] = useState(0);
  const [exploding, setExploding] = useState(false);
  const dmgIdRef = useRef(0);

  // Reset si le stage change.
  useEffect(() => {
    const m = pickMonsterFor(stage);
    setMonster(m);
    setHp(m.hp);
  }, [stage]);

  useEffect(() => {
    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      // 1) swing du héros
      setSwinging(true);
      setTimeout(() => {
        if (!mounted) return;
        setSwinging(false);

        // 2) impact ~300ms après le début du swing
        const isCrit = Math.random() < (classId === "assassin" ? 0.35 : 0.15);
        const dmg = Math.max(
          1,
          Math.round(
            (15 + stage * 3) * (isCrit ? 1.6 : 1.0) * (0.85 + Math.random() * 0.3),
          ),
        );
        setHit(true);
        const id = ++dmgIdRef.current;
        setFloatings((arr) => [...arr, { id, dmg, isCrit }]);
        setTimeout(() => {
          if (!mounted) return;
          setHit(false);
        }, 200);
        setTimeout(() => {
          if (!mounted) return;
          setFloatings((arr) => arr.filter((f) => f.id !== id));
        }, 1100);

        // 3) baisse HP, vérifie KO
        setHp((cur) => {
          const next = Math.max(0, cur - dmg);
          if (next <= 0) {
            setExploding(true);
            setTimeout(() => {
              if (!mounted) return;
              setExploding(false);
              setKillCount((k) => k + 1);
              const m = pickMonsterFor(stage);
              setMonster(m);
              setHp(m.hp);
            }, 600);
          }
          return next;
        });
      }, 300);
    };

    // Tick toutes les 1.4s pour un rythme régulier
    const interval = setInterval(tick, 1400);
    // Premier swing immédiat (sinon on attend 1.4s à l'arrivée)
    const t0 = setTimeout(tick, 200);

    return () => {
      mounted = false;
      clearInterval(interval);
      clearTimeout(t0);
    };
  }, [classId, stage]);

  const hpPct = Math.max(0, (hp / monster.hp) * 100);

  const heroHalo = useMemo(() => {
    // Halo radial coloré selon élément, en CSS inline (pas besoin de Tailwind config).
    const colors: Record<EternumElementId, string> = {
      fire: "rgba(244,63,94,0.35)",
      water: "rgba(14,165,233,0.35)",
      wind: "rgba(52,211,153,0.35)",
      earth: "rgba(180,83,9,0.35)",
      light: "rgba(252,211,77,0.45)",
      dark: "rgba(139,92,246,0.45)",
    };
    return `radial-gradient(circle, ${colors[elementId]} 0%, transparent 70%)`;
  }, [elementId]);

  return (
    <div className="relative h-44 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950">
      {/* Stars / particules de fond */}
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute left-[10%] top-[20%] h-1 w-1 rounded-full bg-white/40" />
        <div className="absolute left-[30%] top-[70%] h-0.5 w-0.5 rounded-full bg-white/30" />
        <div className="absolute left-[55%] top-[35%] h-0.5 w-0.5 rounded-full bg-white/30" />
        <div className="absolute left-[70%] top-[15%] h-1 w-1 rounded-full bg-white/40" />
        <div className="absolute left-[85%] top-[60%] h-0.5 w-0.5 rounded-full bg-white/30" />
      </div>

      {/* Sol */}
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/60 to-transparent" />

      {/* Kill counter */}
      <div className="absolute right-2 top-2 rounded-md bg-black/50 px-2 py-1 text-[10px] uppercase tracking-widest text-amber-300 backdrop-blur-sm">
        💀 {killCount}
      </div>

      {/* Stage badge */}
      <div className="absolute left-2 top-2 rounded-md bg-black/50 px-2 py-1 text-[10px] uppercase tracking-widest text-sky-300 backdrop-blur-sm">
        Stage {stage}
      </div>

      {/* Halo héros */}
      <div
        className="pointer-events-none absolute bottom-6 left-[18%] h-24 w-24 -translate-x-1/2 rounded-full blur-2xl"
        style={{ backgroundImage: heroHalo }}
      />

      {/* Héros */}
      <div
        className="absolute bottom-4 left-[18%] flex flex-col items-center transition-transform duration-300 ease-out"
        style={{
          transform: swinging
            ? "translateX(60px) translateY(-8px) rotate(-6deg)"
            : "translateX(0) translateY(0) rotate(0deg)",
        }}
      >
        <div className="text-5xl drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]">
          {cls.glyph}
        </div>
        <div className="-mt-2 text-2xl">{elt.glyph}</div>
      </div>

      {/* Monstre */}
      <div
        className={`absolute bottom-6 right-[18%] flex flex-col items-center transition-all duration-150 ease-out ${
          exploding ? "scale-150 opacity-0 rotate-12" : "scale-100 opacity-100"
        }`}
        style={{
          transform: hit ? "translateX(8px) scale(1.1)" : undefined,
          filter: hit ? "brightness(2.5) drop-shadow(0 0 12px #ef4444)" : "brightness(1)",
        }}
      >
        <div className="text-5xl drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]">
          {monster.glyph}
        </div>
        {/* HP bar */}
        <div className="mt-2 h-1 w-16 overflow-hidden rounded-full bg-black/60">
          <div
            className="h-1 rounded-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all duration-150 ease-out"
            style={{ width: `${hpPct}%` }}
          />
        </div>
        <div className="mt-0.5 text-[9px] uppercase tracking-widest text-zinc-400">
          {monster.name}
        </div>
      </div>

      {/* Floating damages */}
      {floatings.map((f) => (
        <div
          key={f.id}
          className={`pointer-events-none absolute bottom-24 right-[18%] text-lg font-bold tabular-nums drop-shadow-md ${
            f.isCrit ? "text-amber-300" : "text-rose-300"
          }`}
          style={{ animation: "eternum-float-up 1s ease-out forwards" }}
        >
          {f.isCrit && <span className="text-[10px] mr-0.5">CRIT</span>}
          -{f.dmg}
        </div>
      ))}

      {/* Explosion ✨ */}
      {exploding && (
        <div className="pointer-events-none absolute bottom-12 right-[18%] animate-ping text-3xl">
          ✨
        </div>
      )}

      {/* Keyframe globale via balise <style> classique */}
      <style>{`@keyframes eternum-float-up { 0% { transform: translateY(0) translateX(0); opacity: 1; } 100% { transform: translateY(-40px) translateX(8px); opacity: 0; } }`}</style>
    </div>
  );
}
