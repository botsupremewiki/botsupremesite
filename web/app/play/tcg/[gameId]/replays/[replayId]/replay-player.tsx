"use client";

import { useEffect, useRef, useState } from "react";

export function ReplayPlayer({ log }: { log: string[] }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(800);
  const timer = useRef<NodeJS.Timeout | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setStep((s) => {
        if (s >= log.length) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, speed);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, speed, log.length]);

  useEffect(() => {
    // Auto-scroll to keep latest visible.
    if (listRef.current) {
      const last = listRef.current.querySelector("[data-current=true]");
      if (last) last.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [step]);

  if (log.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
        Aucune ligne de log enregistrée pour ce match.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStep(0)}
          className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-200 transition-colors hover:bg-white/10"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-200 transition-colors hover:bg-white/10"
        >
          ◀
        </button>
        <button
          type="button"
          onClick={() => {
            if (step >= log.length) setStep(0);
            setPlaying((p) => !p);
          }}
          className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-400/20"
        >
          {playing ? "⏸ Pause" : step >= log.length ? "⟲ Rejouer" : "▶ Lecture"}
        </button>
        <button
          type="button"
          onClick={() => setStep((s) => Math.min(log.length, s + 1))}
          className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-200 transition-colors hover:bg-white/10"
        >
          ▶
        </button>
        <button
          type="button"
          onClick={() => setStep(log.length)}
          className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-200 transition-colors hover:bg-white/10"
        >
          ⏭
        </button>
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-200"
        >
          <option value={1500}>0.5×</option>
          <option value={800}>1×</option>
          <option value={400}>2×</option>
          <option value={200}>4×</option>
        </select>
        <div className="ml-auto text-[11px] tabular-nums text-zinc-500">
          {Math.min(step, log.length)} / {log.length}
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-amber-400 transition-all"
          style={{ width: `${(Math.min(step, log.length) / log.length) * 100}%` }}
        />
      </div>
      <div
        ref={listRef}
        className="mt-3 max-h-[60vh] overflow-y-auto rounded-md border border-white/5 bg-black/60 p-3 font-mono text-xs leading-relaxed"
      >
        {log.slice(0, step + 1).map((line, i) => {
          const isCurrent = i === step;
          return (
            <div
              key={i}
              data-current={isCurrent ? "true" : undefined}
              className={`mb-0.5 ${
                isCurrent
                  ? "rounded bg-amber-300/15 px-1 text-amber-100"
                  : "text-zinc-300"
              }`}
            >
              <span className="mr-2 inline-block w-8 text-right tabular-nums text-zinc-600">
                {i + 1}.
              </span>
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
}
