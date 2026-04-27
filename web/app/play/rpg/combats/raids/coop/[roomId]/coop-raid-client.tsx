"use client";

import { useEffect, useRef, useState } from "react";
import {
  ETERNUM_CLASSES,
  type EternumHero,
} from "@shared/types";
import { ETERNUM_RAIDS } from "@shared/eternum-content";
import {
  buildHeroUnit,
  buildFamilierUnit,
  simulateBattle,
} from "@shared/eternum-combat";

type ServerMsg =
  | {
      type: "raid-state";
      state: { bossName: string; bossHp: number; bossHpMax: number };
      players: { id: string; username: string; totalDamage: number }[];
    }
  | {
      type: "raid-log";
      log: { from: string; msg: string; ts: number }[];
    }
  | { type: "raid-victory"; topDamager: string }
  | { type: "raid-error"; message: string };

export function CoopRaidClient({
  roomId,
  raidId,
  hero,
  authId,
  username,
}: {
  roomId: string;
  raidId: string;
  hero: EternumHero;
  authId: string;
  username: string;
}) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<{
    bossName: string;
    bossHp: number;
    bossHpMax: number;
  } | null>(null);
  const [players, setPlayers] = useState<{ id: string; username: string; totalDamage: number }[]>([]);
  const [log, setLog] = useState<{ from: string; msg: string; ts: number }[]>([]);
  const [victory, setVictory] = useState<string | null>(null);
  const [chat, setChat] = useState("");

  const raid = ETERNUM_RAIDS.find((r) => r.id === raidId) ?? ETERNUM_RAIDS[0];

  useEffect(() => {
    const partyHost =
      process.env.NEXT_PUBLIC_PARTYKIT_HOST || "127.0.0.1:1999";
    const scheme =
      partyHost.startsWith("localhost") ||
      partyHost.startsWith("127.") ||
      partyHost.startsWith("192.168.")
        ? "ws"
        : "wss";
    const params = new URLSearchParams();
    params.set("authId", authId);
    params.set("name", username);
    params.set("boss", raid.bossName);
    params.set("hp", String(raid.bossHp));
    const url = `${scheme}://${partyHost}/parties/eternumraid/${roomId}?${params.toString()}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data as string) as ServerMsg;
        if (m.type === "raid-state") {
          setState(m.state);
          setPlayers(m.players);
        } else if (m.type === "raid-log") setLog(m.log);
        else if (m.type === "raid-victory") setVictory(m.topDamager);
      } catch {
        /* ignore */
      }
    };
    return () => {
      ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [authId, username, roomId, raid.bossName, raid.bossHp]);

  function attack() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // Simule un combat héros vs boss et envoie les dégâts.
    const playerTeam = [
      buildHeroUnit(
        "hero",
        ETERNUM_CLASSES[hero.classId].name,
        hero.classId,
        hero.elementId,
        hero.level,
        "A",
      ),
    ];
    const bossUnit = [
      buildFamilierUnit(
        "raid-boss",
        raid.bossName,
        "warrior",
        raid.bossElement,
        80,
        { hp: raid.bossHp, atk: raid.bossAtk, def: raid.bossDef, spd: raid.bossSpd },
        "B",
      ),
    ];
    const battle = simulateBattle(playerTeam, bossUnit, 10);
    const damage = battle.log
      .filter((l) => l.target === raid.bossName && l.damage)
      .reduce((s, l) => s + (l.damage ?? 0), 0);
    ws.send(JSON.stringify({ type: "raid-attack", damage }));
  }

  function sendChat() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !chat.trim()) return;
    ws.send(JSON.stringify({ type: "raid-chat", text: chat.trim() }));
    setChat("");
  }

  const hpPct = state ? (state.bossHp / state.bossHpMax) * 100 : 100;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 rounded-2xl border border-emerald-400/40 bg-black/50 p-5">
        <div className="text-3xl">{raid.glyph} {state?.bossName ?? raid.bossName}</div>
        <div className="mt-2 h-3 rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-rose-500/80 transition-all"
            style={{ width: `${hpPct}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-zinc-400">
          <span>
            HP : {(state?.bossHp ?? raid.bossHp).toLocaleString("fr-FR")} /{" "}
            {(state?.bossHpMax ?? raid.bossHp).toLocaleString("fr-FR")}
          </span>
          <span>
            {connected ? "🟢 connecté" : "🔴 déconnecté"} · {players.length} joueur(s)
          </span>
        </div>
        <button
          onClick={attack}
          disabled={!connected || state?.bossHp === 0}
          className="mt-3 w-full rounded-md bg-rose-500 px-4 py-3 text-sm font-bold text-rose-950 hover:bg-rose-400 disabled:opacity-40"
        >
          ⚔️ Attaquer
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-2">
        <section className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40">
          <div className="shrink-0 border-b border-white/5 px-4 py-2 text-[11px] uppercase tracking-widest text-zinc-400">
            🛡️ Joueurs ({players.length})
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {players
              .sort((a, b) => b.totalDamage - a.totalDamage)
              .map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded border border-white/5 bg-white/[0.03] px-2 py-1 text-xs"
                >
                  <span>{p.username}</span>
                  <span className="font-bold tabular-nums text-rose-300">
                    {p.totalDamage.toLocaleString("fr-FR")} dmg
                  </span>
                </div>
              ))}
          </div>
        </section>

        <section className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40">
          <div className="shrink-0 border-b border-white/5 px-4 py-2 text-[11px] uppercase tracking-widest text-zinc-400">
            📜 Journal du raid
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 text-xs">
            {[...log].reverse().map((l, i) => (
              <div key={i}>
                <span className="mr-1 text-zinc-600">
                  {new Date(l.ts).toLocaleTimeString("fr-FR")}
                </span>
                {l.msg}
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendChat();
            }}
            className="flex shrink-0 border-t border-white/5"
          >
            <input
              value={chat}
              onChange={(e) => setChat(e.target.value)}
              placeholder="Discuter avec le raid…"
              className="flex-1 bg-transparent px-3 py-2 text-xs text-zinc-100 focus:outline-none"
            />
            <button
              type="submit"
              className="px-3 py-2 text-xs text-emerald-300 hover:text-emerald-200"
            >
              Envoyer
            </button>
          </form>
        </section>
      </div>

      {victory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div className="rounded-2xl border-2 border-emerald-400/60 bg-zinc-950 p-6 text-center">
            <div className="text-3xl font-bold text-emerald-300">🏆 Boss vaincu !</div>
            <div className="mt-2 text-sm text-zinc-400">
              Top damager : <strong className="text-rose-300">{victory}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
