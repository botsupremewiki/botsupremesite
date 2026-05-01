"use client";

import { useState } from "react";

export function ShareReplayButton() {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (typeof window === "undefined") return;
    navigator.clipboard.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-200 transition-colors hover:bg-white/[0.07]"
    >
      {copied ? "✓ Copié" : "🔗 Partager le replay"}
    </button>
  );
}
