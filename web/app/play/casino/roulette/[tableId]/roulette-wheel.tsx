"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

// European wheel order, clockwise starting at 0.
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const POCKETS = WHEEL_ORDER.length; // 37
const POCKET_ANGLE = 360 / POCKETS;

const RED_NUMBERS = new Set<number>([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
const fillFor = (n: number): string =>
  n === 0 ? "#047857" : RED_NUMBERS.has(n) ? "#b91c1c" : "#18181b";

const R_OUTER = 95;
const R_MID = 78;
const R_INNER = 36;
const R_BALL_TRACK = 88;

const deg2rad = (d: number) => (d * Math.PI) / 180;

// Build the SVG path for a pocket slice (ring sector).
function sectorPath(startDeg: number, endDeg: number): string {
  const a0 = deg2rad(startDeg);
  const a1 = deg2rad(endDeg);
  const x0o = R_OUTER * Math.cos(a0);
  const y0o = R_OUTER * Math.sin(a0);
  const x1o = R_OUTER * Math.cos(a1);
  const y1o = R_OUTER * Math.sin(a1);
  const x0i = R_MID * Math.cos(a1);
  const y0i = R_MID * Math.sin(a1);
  const x1i = R_MID * Math.cos(a0);
  const y1i = R_MID * Math.sin(a0);
  return `M ${x0o} ${y0o} A ${R_OUTER} ${R_OUTER} 0 0 1 ${x1o} ${y1o} L ${x0i} ${y0i} A ${R_MID} ${R_MID} 0 0 0 ${x1i} ${y1i} Z`;
}

export function RouletteWheel({
  phase,
  winningNumber,
  size = 260,
}: {
  phase: "idle" | "betting" | "spinning" | "resolving";
  winningNumber: number | null;
  size?: number;
}) {
  // Absolute rotations (can grow beyond 360 for multi-turn drama).
  const [wheelRot, setWheelRot] = useState(0);
  const [ballRot, setBallRot] = useState(0);
  const lastSpinNumber = useRef<number | null>(null);
  const spinKey = useRef(0);

  useEffect(() => {
    if (phase !== "spinning" || winningNumber == null) return;
    if (lastSpinNumber.current === winningNumber) return;
    lastSpinNumber.current = winningNumber;
    spinKey.current += 1;

    const pocketIndex = WHEEL_ORDER.indexOf(winningNumber);
    // Rotate the wheel so that the winning pocket ends at the top (-90°).
    // Small random jitter within the pocket so it doesn't always look identical.
    const jitter = (Math.random() - 0.5) * POCKET_ANGLE * 0.6;
    const finalAngle = -(pocketIndex * POCKET_ANGLE) + jitter;
    // Add 6 full CCW turns for the drama.
    setWheelRot((prev) => Math.floor(prev / 360) * 360 - 6 * 360 + finalAngle);
    // The ball orbits in the opposite direction, 8 turns, lands at 12 o'clock
    // (which is where the winning pocket is after the wheel settles).
    setBallRot((prev) => Math.floor(prev / 360) * 360 + 8 * 360);
  }, [phase, winningNumber]);

  // Reset on idle so the next spin starts cleanly — but without a visible snap.
  useEffect(() => {
    if (phase === "idle" && lastSpinNumber.current != null) {
      // Leave rotation where it is; next spin keeps it continuous.
      lastSpinNumber.current = null;
    }
  }, [phase]);

  const spinning = phase === "spinning";
  const settled = phase === "resolving" || phase === "idle" || phase === "betting";

  const pockets = useMemo(
    () =>
      WHEEL_ORDER.map((n, i) => {
        // Pocket i spans angles around the position i * POCKET_ANGLE.
        // Offset by -90° so pocket 0 is at the top.
        const start = -90 + (i - 0.5) * POCKET_ANGLE;
        const end = -90 + (i + 0.5) * POCKET_ANGLE;
        const mid = -90 + i * POCKET_ANGLE;
        const labelR = (R_OUTER + R_MID) / 2;
        const lx = labelR * Math.cos(deg2rad(mid));
        const ly = labelR * Math.sin(deg2rad(mid));
        return { n, start, end, mid, lx, ly };
      }),
    [],
  );

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      aria-label="Roulette"
    >
      {/* Pointer (static at the top) */}
      <div
        className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1"
        style={{
          width: 0,
          height: 0,
          borderLeft: "7px solid transparent",
          borderRight: "7px solid transparent",
          borderTop: "12px solid #fbbf24",
          filter: "drop-shadow(0 0 4px rgba(251,191,36,0.6))",
          zIndex: 3,
        }}
      />

      {/* Wheel SVG */}
      <motion.svg
        viewBox="-100 -100 200 200"
        width={size}
        height={size}
        className="absolute inset-0"
        animate={{ rotate: wheelRot }}
        transition={{
          duration: spinning ? 4 : 0,
          ease: spinning ? [0.15, 0.9, 0.2, 1] : "linear",
        }}
      >
        {/* Outer ring */}
        <circle r={R_OUTER + 2} fill="#0f172a" />
        <circle
          r={R_OUTER}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={1.5}
          opacity={0.4}
        />

        {/* Pockets */}
        {pockets.map(({ n, start, end, mid, lx, ly }) => (
          <g key={n}>
            <path
              d={sectorPath(start, end)}
              fill={fillFor(n)}
              stroke="rgba(0,0,0,0.5)"
              strokeWidth={0.3}
            />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize={n >= 10 ? 7 : 8}
              fontWeight={700}
              transform={`rotate(${mid + 90} ${lx} ${ly})`}
            >
              {n}
            </text>
          </g>
        ))}

        {/* Inner disc */}
        <circle r={R_MID} fill="#1e293b" stroke="#fbbf24" strokeWidth={0.8} opacity={0.9} />
        <circle r={R_INNER} fill="#0f172a" stroke="#fbbf24" strokeWidth={0.8} opacity={0.9} />

        {/* Center hub spokes */}
        <g stroke="#fbbf24" strokeWidth={0.6} opacity={0.5}>
          <line x1={-R_INNER} y1={0} x2={-R_MID} y2={0} />
          <line x1={R_INNER} y1={0} x2={R_MID} y2={0} />
          <line x1={0} y1={-R_INNER} x2={0} y2={-R_MID} />
          <line x1={0} y1={R_INNER} x2={0} y2={R_MID} />
        </g>
      </motion.svg>

      {/* Ball — rotates on top of the wheel (opposite direction visually) */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: ballRot }}
        transition={{
          duration: spinning ? 4 : 0,
          ease: spinning ? [0.2, 0.85, 0.2, 1] : "linear",
        }}
        style={{ pointerEvents: "none" }}
      >
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
          style={{
            width: 10,
            height: 10,
            top: `calc(50% - ${R_BALL_TRACK * (size / 200)}px - 5px)`,
          }}
        />
      </motion.div>

      {/* Result badge at center when settled */}
      {settled && winningNumber != null && phase !== "betting" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white shadow-lg ring-2 ring-amber-300 ${
              winningNumber === 0
                ? "bg-emerald-600"
                : RED_NUMBERS.has(winningNumber)
                  ? "bg-rose-600"
                  : "bg-zinc-900"
            }`}
          >
            {winningNumber}
          </div>
        </div>
      )}
    </div>
  );
}
