"use client";

import { useEffect, useState } from "react";

export function Countdown({
  endsAt,
  className,
}: {
  endsAt: number;
  className?: string;
}) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, endsAt - now);
  const seconds = Math.ceil(remaining / 1000);
  return (
    <span className={className} title="Temps restant">
      {seconds}s
    </span>
  );
}

export function CountdownBar({
  endsAt,
  totalMs,
  colorClass = "bg-amber-400",
}: {
  endsAt: number;
  totalMs: number;
  colorClass?: string;
}) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, endsAt - now);
  const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
      <div
        className={`h-full transition-[width] duration-100 ${colorClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
