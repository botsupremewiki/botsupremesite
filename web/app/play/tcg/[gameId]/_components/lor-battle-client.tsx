"use client";

// LorBattleClient — Phase 3.6b (skeleton playable) :
//  • Connexion WebSocket à /parties/battlelor/{roomId}
//  • Mulligan UI (multi-select 0-4 cartes, confirm)
//  • Vue principale : nexus/bench/hand/mana opp + self, log
//  • Click sur carte main → lor-play-unit (units uniquement pour l'instant)
//  • Boutons Pass et Concède
//  • Phase ended : écran de fin
//
// Manque (Phase 3.6c) : déclaration d'attaque (sélectionner attaquants),
// assignement de bloqueurs (drag-drop ou click-pair), play-spell avec
// targeting, animations, effets de cartes.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  RuneterraBattleClientMessage,
  RuneterraBattleServerMessage,
  RuneterraBattleState,
  RuneterraBattleUnit,
  RuneterraPlayerPublicState,
  RuneterraSelfState,
  SpellTargetSide,
} from "@shared/types";
import {
  RUNETERRA_SPELL_EFFECTS,
  TCG_GAMES,
  getSpellTargetSide,
} from "@shared/types";
import { RUNETERRA_BASE_SET_BY_CODE } from "@shared/tcg-runeterra-base";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import {
  LorCardFace,
  LorCardZoomModal,
  LOR_RARITY_COLOR,
} from "./lor-card-visuals";

type ConnStatus = "connecting" | "connected" | "disconnected";

export function LorBattleClient({
  profile,
  roomId,
  deckId,
}: {
  profile: Profile | null;
  roomId: string;
  deckId: string;
}) {
  const game = TCG_GAMES.lol;
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [state, setState] = useState<RuneterraBattleState | null>(null);
  const [mulliganSelection, setMulliganSelection] = useState<Set<number>>(
    new Set(),
  );
  const [zoomedCard, setZoomedCard] = useState<RuneterraBattleUnit | string | null>(
    null,
  );
  // Phase 3.7 : sort en attente de cible (null = pas de targeting en cours).
  const [pendingSpell, setPendingSpell] = useState<{
    handIndex: number;
    side: SpellTargetSide;
    cardCode: string;
  } | null>(null);

  const send = useCallback((msg: RuneterraBattleClientMessage) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    const partyHost =
      process.env.NEXT_PUBLIC_PARTYKIT_HOST || "127.0.0.1:1999";
    const scheme =
      partyHost.startsWith("localhost") ||
      partyHost.startsWith("127.") ||
      partyHost.startsWith("192.168.")
        ? "ws"
        : "wss";
    const params = new URLSearchParams();
    params.set("authId", profile.id);
    params.set("deckId", deckId);
    params.set("name", profile.username);
    const url = `${scheme}://${partyHost}/parties/battlelor/${roomId}?${params.toString()}`;
    const ws = new WebSocket(url);
    socketRef.current = ws;
    ws.addEventListener("open", () => setStatus("connected"));
    ws.addEventListener("close", () => setStatus("disconnected"));
    ws.addEventListener("error", () => setStatus("disconnected"));
    ws.addEventListener("message", (e) => {
      if (cancelled) return;
      let msg: RuneterraBattleServerMessage;
      try {
        msg = JSON.parse(e.data as string) as RuneterraBattleServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "lor-battle-welcome":
          // pas d'action particulière — on attend lor-battle-state
          break;
        case "lor-battle-state":
          setState(msg.state);
          // Reset mulligan selection si on quitte la phase mulligan.
          if (msg.state.phase !== "mulligan") setMulliganSelection(new Set());
          break;
        case "lor-battle-error":
          setErrorMsg(msg.message);
          break;
      }
    });
    return () => {
      cancelled = true;
      ws.close();
      if (socketRef.current === ws) socketRef.current = null;
    };
  }, [profile, roomId, deckId]);

  // Click sur carte main : unit → joue ; sort avec effet ciblé → entre en
  // targeting mode ; sort sans effet → joue sans cible (mana déduite).
  const playHandCard = useCallback(
    (handIndex: number) => {
      if (!state?.self) return;
      const cardCode = state.self.hand[handIndex];
      const card = RUNETERRA_BASE_SET_BY_CODE.get(cardCode);
      if (!card) return;
      setErrorMsg(null);
      if (card.type === "Unit") {
        send({ type: "lor-play-unit", handIndex });
        return;
      }
      if (card.type === "Spell") {
        const effect = RUNETERRA_SPELL_EFFECTS[cardCode];
        if (!effect) {
          // Pas d'effet enregistré : sort joué sans résolution (Phase 3.7+
          // ajoutera plus de sorts au registry).
          send({ type: "lor-play-spell", handIndex, targetUid: null });
          return;
        }
        const side = getSpellTargetSide(effect);
        if (side === "none") {
          send({ type: "lor-play-spell", handIndex, targetUid: null });
          return;
        }
        // Mode targeting : attend que le user clique une cible valide.
        setPendingSpell({ handIndex, side, cardCode });
      }
    },
    [state, send],
  );

  const targetSpell = useCallback(
    (targetUid: string) => {
      if (!pendingSpell) return;
      send({
        type: "lor-play-spell",
        handIndex: pendingSpell.handIndex,
        targetUid,
      });
      setPendingSpell(null);
    },
    [pendingSpell, send],
  );

  const cancelSpell = useCallback(() => setPendingSpell(null), []);

  if (!profile) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
          Connecte-toi pour jouer.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play/tcg/lol"
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← {game.name}
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>{game.name}</span>
          <span className="text-xs text-zinc-500">⚔️ Combat — salle {roomId.slice(0, 8)}</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>

      <main
        className={`relative flex flex-1 flex-col overflow-hidden p-4 ${game.gradient}`}
      >
        {status !== "connected" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="text-sm text-zinc-300">
              {status === "connecting"
                ? "Connexion..."
                : "Connexion perdue — recharger la page."}
            </div>
          </div>
        )}

        {!state ? (
          <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
            En attente de l'adversaire...
          </div>
        ) : state.phase === "mulligan" ? (
          <MulliganView
            state={state}
            selection={mulliganSelection}
            onToggle={(i) => {
              setMulliganSelection((prev) => {
                const next = new Set(prev);
                if (next.has(i)) next.delete(i);
                else next.add(i);
                return next;
              });
            }}
            onConfirm={() => {
              send({
                type: "lor-mulligan",
                replaceIndices: [...mulliganSelection].sort((a, b) => a - b),
              });
            }}
            onZoom={(c) => setZoomedCard(c)}
          />
        ) : state.phase === "ended" ? (
          <EndView state={state} />
        ) : (
          <RoundView
            state={state}
            onPlayHand={playHandCard}
            onPass={() => send({ type: "lor-pass" })}
            onConcede={() => {
              if (confirm("Concéder la partie ?")) {
                send({ type: "lor-concede" });
              }
            }}
            onDeclareAttack={(uids, forcedBlockerUids) =>
              send({
                type: "lor-declare-attack",
                attackerUids: uids,
                forcedBlockerUids,
              })
            }
            onAssignBlockers={(uids) =>
              send({ type: "lor-assign-blockers", blockerUids: uids })
            }
            pendingSpell={pendingSpell}
            onTargetSpell={targetSpell}
            onCancelSpell={cancelSpell}
            onZoom={(c) => setZoomedCard(c)}
          />
        )}

        {errorMsg && (
          <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
            {errorMsg}
            <button
              onClick={() => setErrorMsg(null)}
              className="ml-3 text-rose-300 hover:text-rose-100"
            >
              ✕
            </button>
          </div>
        )}

        <CardZoomFromBattle
          card={zoomedCard}
          onClose={() => setZoomedCard(null)}
        />
      </main>
    </div>
  );
}

// ────────────────────── Mulligan ─────────────────────────────────────────

function MulliganView({
  state,
  selection,
  onToggle,
  onConfirm,
  onZoom,
}: {
  state: RuneterraBattleState;
  selection: Set<number>;
  onToggle: (i: number) => void;
  onConfirm: () => void;
  onZoom: (cardCode: string) => void;
}) {
  if (!state.self) return null;
  const done = state.self.hasMulliganed;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 py-8">
      <h1 className="text-2xl font-bold text-zinc-100">Mulligan</h1>
      <p className="text-sm text-zinc-400">
        {done
          ? state.opponent?.hasMulliganed
            ? "Mulligan terminé — démarrage du round 1..."
            : "En attente de l'adversaire..."
          : "Sélectionne les cartes à remplacer (0 à 4), puis confirme."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {state.self.hand.map((cardCode, i) => {
          const isSelected = selection.has(i);
          return (
            <button
              key={`${cardCode}-${i}`}
              onClick={() => !done && onToggle(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                onZoom(cardCode);
              }}
              disabled={done}
              className={`relative w-40 rounded-lg border-2 p-1 transition-transform disabled:cursor-not-allowed ${
                isSelected
                  ? "border-rose-400 scale-95 opacity-70"
                  : "border-white/10 hover:scale-[1.02]"
              }`}
              title="Click gauche : sélectionner · Click droit : zoom"
            >
              <CardFromCode cardCode={cardCode} />
              {isSelected && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-rose-900/40">
                  <span className="text-2xl">✕</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
      {!done && (
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="rounded-md bg-emerald-500 px-5 py-2 text-sm font-bold text-emerald-950 shadow hover:bg-emerald-400"
          >
            {selection.size === 0
              ? "Garder ma main"
              : `Remplacer ${selection.size} carte${selection.size > 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ────────────────────── Round (vue principale) ───────────────────────────

function RoundView({
  state,
  onPlayHand,
  onPass,
  onConcede,
  onDeclareAttack,
  onAssignBlockers,
  pendingSpell,
  onTargetSpell,
  onCancelSpell,
  onZoom,
}: {
  state: RuneterraBattleState;
  onPlayHand: (handIndex: number) => void;
  onPass: () => void;
  onConcede: () => void;
  onDeclareAttack: (
    attackerUids: string[],
    forcedBlockerUids?: (string | null)[],
  ) => void;
  onAssignBlockers: (blockerUids: (string | null)[]) => void;
  pendingSpell: {
    handIndex: number;
    side: SpellTargetSide;
    cardCode: string;
  } | null;
  onTargetSpell: (uid: string) => void;
  onCancelSpell: () => void;
  onZoom: (c: RuneterraBattleUnit | string) => void;
}) {
  // Hooks AVANT tout return conditionnel pour respecter les rules of hooks.
  const [combatMode, setCombatMode] = useState<"none" | "attacker-pick">(
    "none",
  );
  const [pickedAttackers, setPickedAttackers] = useState<Set<string>>(
    new Set(),
  );
  const [blockerByLane, setBlockerByLane] = useState<Map<number, string>>(
    new Map(),
  );
  // Phase 3.19 : pour les attaquants avec Challenger, l'attaquant peut
  // forcer un bloqueur ennemi spécifique. Map: attackerUid → forcedBlockerUid.
  const [forcedBlockerByAttacker, setForcedBlockerByAttacker] = useState<
    Map<string, string>
  >(new Map());

  // Reset l'état de combat quand l'attaque se termine.
  const attackInProgress = state.attackInProgress;
  useEffect(() => {
    if (!attackInProgress) {
      setCombatMode("none");
      setPickedAttackers(new Set());
      setBlockerByLane(new Map());
      setForcedBlockerByAttacker(new Map());
    }
  }, [attackInProgress]);

  if (!state.self || !state.opponent) return null;
  const myTurn = state.activeSeat === state.selfSeat;
  const isMyAttack = attackInProgress?.attackerSeat === state.selfSeat;
  const mustAssignBlockers =
    attackInProgress !== null &&
    !isMyAttack &&
    state.activeSeat === state.selfSeat;
  const canDeclareAttack =
    attackInProgress === null &&
    myTurn &&
    state.attackTokenSeat === state.selfSeat &&
    state.self.bench.some((u) => !u.playedThisRound && u.power > 0);

  const handleSelfBenchClick = (unit: RuneterraBattleUnit) => {
    if (combatMode === "attacker-pick") {
      if (unit.playedThisRound || unit.power <= 0) return;
      setPickedAttackers((prev) => {
        const next = new Set(prev);
        if (next.has(unit.uid)) next.delete(unit.uid);
        else next.add(unit.uid);
        return next;
      });
      return;
    }
    if (
      pendingSpell &&
      (pendingSpell.side === "ally" || pendingSpell.side === "any")
    ) {
      onTargetSpell(unit.uid);
      return;
    }
    onZoom(unit);
  };

  const handleOpponentBenchClick = (unit: RuneterraBattleUnit) => {
    if (
      pendingSpell &&
      (pendingSpell.side === "enemy" || pendingSpell.side === "any")
    ) {
      onTargetSpell(unit.uid);
      return;
    }
    onZoom(unit);
  };

  const handleConfirmAttack = () => {
    if (pickedAttackers.size === 0) return;
    // Phase 3.19 : construit forcedBlockerUids parallèle aux attackerUids.
    const attackerUidsList = [...pickedAttackers];
    const forcedBlockerUids: (string | null)[] = attackerUidsList.map(
      (uid) => forcedBlockerByAttacker.get(uid) ?? null,
    );
    const hasAnyForce = forcedBlockerUids.some((b) => b !== null);
    onDeclareAttack(
      attackerUidsList,
      hasAnyForce ? forcedBlockerUids : undefined,
    );
    setCombatMode("none");
    setPickedAttackers(new Set());
    setForcedBlockerByAttacker(new Map());
  };

  const handleConfirmBlocks = () => {
    if (!attackInProgress) return;
    const assignments = attackInProgress.lanes.map(
      (_, i) => blockerByLane.get(i) ?? null,
    );
    onAssignBlockers(assignments);
    setBlockerByLane(new Map());
  };

  // Bench attaquant / défenseur pour AttackLanesView.
  const attackerBench = isMyAttack ? state.self.bench : state.opponent.bench;
  const defenderBench = isMyAttack ? state.opponent.bench : state.self.bench;

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-2 overflow-hidden">
      {/* Adversaire */}
      <PlayerStrip player={state.opponent} isOpponent />
      <BenchRow
        units={state.opponent.bench}
        onUnitClick={handleOpponentBenchClick}
        highlighted={
          pendingSpell &&
          (pendingSpell.side === "enemy" || pendingSpell.side === "any")
            ? new Set(state.opponent.bench.map((u) => u.uid))
            : undefined
        }
      />

      {/* Attack lanes (visible quand attaque en cours, peu importe le côté) */}
      {attackInProgress && (
        <AttackLanesView
          lanes={attackInProgress.lanes}
          attackerBench={attackerBench}
          defenderBench={defenderBench}
          mustAssignBlockers={mustAssignBlockers}
          blockerByLane={blockerByLane}
          onSetBlocker={(laneIdx, uid) => {
            setBlockerByLane((prev) => {
              const next = new Map(prev);
              if (uid === null) next.delete(laneIdx);
              else next.set(laneIdx, uid);
              return next;
            });
          }}
          onZoom={(u) => onZoom(u)}
        />
      )}

      {/* Centre : info round + actions */}
      <div className="flex shrink-0 items-center justify-between rounded-lg border border-white/10 bg-black/40 px-4 py-2 text-sm">
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-widest text-zinc-400">
            Round {state.round}
          </span>
          {state.attackTokenSeat === state.selfSeat ? (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-200">
              ⚔️ Jeton d'attaque (toi)
            </span>
          ) : (
            <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-[11px] text-zinc-300">
              ⚔️ Jeton adverse
            </span>
          )}
          <span className={myTurn ? "text-emerald-300" : "text-zinc-500"}>
            {myTurn ? "▶ Ton tour" : "⏸ Tour adverse"}
          </span>
          {isMyAttack && (
            <span className="text-rose-300">
              ⚔️ Tu attaques — en attente des bloqueurs adverses
            </span>
          )}
          {mustAssignBlockers && (
            <span className="text-orange-300">
              🛡 L'adversaire t'attaque — assigne tes bloqueurs
            </span>
          )}
          {pendingSpell && (
            <span className="text-violet-300">
              ✨ Choisis une cible (
              {pendingSpell.side === "ally"
                ? "allié"
                : pendingSpell.side === "enemy"
                  ? "ennemi"
                  : "n'importe quelle unité"}
              )
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {pendingSpell ? (
            <button
              onClick={onCancelSpell}
              className="rounded-md border border-violet-400/40 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-500/20"
            >
              Annuler le sort
            </button>
          ) : combatMode === "attacker-pick" ? (
            <>
              <button
                onClick={handleConfirmAttack}
                disabled={pickedAttackers.size === 0}
                className="rounded-md bg-rose-500 px-3 py-1.5 text-xs font-bold text-rose-950 hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ⚔️ Confirmer ({pickedAttackers.size})
              </button>
              <button
                onClick={() => {
                  setCombatMode("none");
                  setPickedAttackers(new Set());
                }}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
              >
                Annuler
              </button>
            </>
          ) : mustAssignBlockers ? (
            <button
              onClick={handleConfirmBlocks}
              className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-bold text-orange-950 hover:bg-orange-400"
            >
              🛡 Confirmer bloqueurs ({blockerByLane.size}/
              {attackInProgress!.lanes.length})
            </button>
          ) : (
            <>
              {canDeclareAttack && (
                <button
                  onClick={() => setCombatMode("attacker-pick")}
                  className="rounded-md bg-rose-500 px-3 py-1.5 text-xs font-bold text-rose-950 hover:bg-rose-400"
                >
                  ⚔️ Attaquer
                </button>
              )}
              <button
                onClick={onPass}
                disabled={!myTurn || isMyAttack === true}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Passer
              </button>
              <button
                onClick={onConcede}
                className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/20"
              >
                Concéder
              </button>
            </>
          )}
        </div>
      </div>

      {/* Phase 3.19 : Challenger picker — visible en attacker-pick si au
          moins un attaquant choisi a le keyword Challenger. Permet à
          l'attaquant de désigner quelle unité ennemie doit bloquer. */}
      {combatMode === "attacker-pick" && pickedAttackers.size > 0 && (
        <ChallengerPicker
          pickedAttackerUids={[...pickedAttackers]}
          attackerBench={state.self.bench}
          enemyBench={state.opponent.bench}
          forcedByAttacker={forcedBlockerByAttacker}
          onSetForced={(attackerUid, blockerUid) => {
            setForcedBlockerByAttacker((prev) => {
              const next = new Map(prev);
              if (blockerUid === null) next.delete(attackerUid);
              else next.set(attackerUid, blockerUid);
              return next;
            });
          }}
        />
      )}

      {/* Self bench (cliquable pour zoom OU pick selon combat mode OU
          target selon spell targeting). */}
      <BenchRow
        units={state.self.bench}
        highlighted={
          combatMode === "attacker-pick"
            ? pickedAttackers
            : pendingSpell &&
                (pendingSpell.side === "ally" || pendingSpell.side === "any")
              ? new Set(state.self.bench.map((u) => u.uid))
              : undefined
        }
        attackerPickMode={combatMode === "attacker-pick"}
        onUnitClick={handleSelfBenchClick}
      />
      <PlayerStrip player={state.self} isOpponent={false} />
      <HandRow
        self={state.self}
        myTurn={
          myTurn &&
          combatMode === "none" &&
          !mustAssignBlockers &&
          pendingSpell === null
        }
        onPlay={onPlayHand}
        onZoom={(c) => onZoom(c)}
      />

      {/* Log compact */}
      <div className="shrink-0 max-h-20 overflow-y-auto rounded-md border border-white/5 bg-black/30 p-2 text-[11px] text-zinc-400">
        {state.log.slice(-5).map((entry, i) => (
          <div key={i}>{entry}</div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────── Sub-components ──────────────────────────────────

function PlayerStrip({
  player,
  isOpponent,
  onZoom,
}: {
  player: RuneterraPlayerPublicState | RuneterraSelfState;
  isOpponent: boolean;
  onZoom?: (c: RuneterraBattleUnit | string) => void;
}) {
  void onZoom;
  return (
    <div className="flex shrink-0 items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm">
      <div className="flex items-center gap-3">
        <span
          className={`font-semibold ${isOpponent ? "text-rose-300" : "text-sky-300"}`}
        >
          {player.username}
        </span>
        <span className="text-[11px] text-zinc-500">
          🎴 {player.handCount} · 📦 {player.deckSize}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs tabular-nums">
        <span className="text-amber-300">
          💧 {player.mana}/{player.manaMax}
        </span>
        {player.spellMana > 0 && (
          <span className="text-violet-300">✨ {player.spellMana}</span>
        )}
        <span className="text-emerald-300">❤️ {player.nexusHealth}</span>
      </div>
    </div>
  );
}

function BenchRow({
  units,
  onUnitClick,
  highlighted,
  attackerPickMode,
}: {
  units: RuneterraBattleUnit[];
  onUnitClick: (u: RuneterraBattleUnit) => void;
  highlighted?: Set<string>;
  attackerPickMode?: boolean;
}) {
  if (units.length === 0) {
    return (
      <div className="flex h-32 shrink-0 items-center justify-center rounded-md border border-dashed border-white/10 text-xs text-zinc-600">
        Banc vide
      </div>
    );
  }
  return (
    <div
      className={`flex shrink-0 gap-2 overflow-x-auto rounded-md border bg-black/20 p-2 ${
        attackerPickMode
          ? "border-rose-500/40 bg-rose-900/10"
          : "border-white/10"
      }`}
    >
      {units.map((u) => {
        const isPicked = highlighted?.has(u.uid) ?? false;
        const eligibleAttacker =
          !attackerPickMode || (!u.playedThisRound && u.power > 0);
        return (
          <UnitCard
            key={u.uid}
            unit={u}
            onClick={() => onUnitClick(u)}
            highlighted={isPicked}
            dimmed={attackerPickMode && !eligibleAttacker}
          />
        );
      })}
    </div>
  );
}

// Phase 3.19 : ChallengerPicker — pour chaque attaquant choisi avec le
// keyword Challenger, propose un dropdown de bloqueurs ennemis à forcer.
function ChallengerPicker({
  pickedAttackerUids,
  attackerBench,
  enemyBench,
  forcedByAttacker,
  onSetForced,
}: {
  pickedAttackerUids: string[];
  attackerBench: RuneterraBattleUnit[];
  enemyBench: RuneterraBattleUnit[];
  forcedByAttacker: Map<string, string>;
  onSetForced: (attackerUid: string, blockerUid: string | null) => void;
}) {
  const challengerAttackers = pickedAttackerUids
    .map((uid) => attackerBench.find((u) => u.uid === uid))
    .filter(
      (u): u is RuneterraBattleUnit =>
        u !== undefined && u.keywords.includes("Challenger"),
    );
  if (challengerAttackers.length === 0) return null;
  return (
    <div className="flex shrink-0 flex-col gap-1.5 rounded-md border border-rose-500/40 bg-rose-900/15 p-2">
      <div className="text-[11px] uppercase tracking-widest text-rose-300">
        ⚔️ Challenger — force quel ennemi bloque
      </div>
      <div className="flex flex-wrap gap-2">
        {challengerAttackers.map((attacker) => {
          const card = RUNETERRA_BASE_SET_BY_CODE.get(attacker.cardCode);
          const forced = forcedByAttacker.get(attacker.uid) ?? "";
          return (
            <div
              key={attacker.uid}
              className="flex items-center gap-2 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
            >
              <span className="text-rose-300">{card?.name ?? attacker.uid}</span>
              <span className="text-zinc-500">→</span>
              <select
                value={forced}
                onChange={(e) =>
                  onSetForced(attacker.uid, e.target.value || null)
                }
                className="rounded border border-white/10 bg-black/60 px-1 py-0.5 text-[11px] text-zinc-100"
              >
                <option value="">— libre (pas de force) —</option>
                {enemyBench.map((b) => {
                  const bCard = RUNETERRA_BASE_SET_BY_CODE.get(b.cardCode);
                  return (
                    <option key={b.uid} value={b.uid}>
                      {bCard?.name?.slice(0, 14) ?? b.cardCode} (
                      {b.power}/{b.health - b.damage})
                    </option>
                  );
                })}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// AttackLanesView : affichage central des lanes d'attaque avec leurs
// bloqueurs (modifiables si on est le défenseur en train d'assigner).
function AttackLanesView({
  lanes,
  attackerBench,
  defenderBench,
  mustAssignBlockers,
  blockerByLane,
  onSetBlocker,
  onZoom,
}: {
  lanes: { attackerUid: string; blockerUid: string | null }[];
  attackerBench: RuneterraBattleUnit[];
  defenderBench: RuneterraBattleUnit[];
  mustAssignBlockers: boolean;
  blockerByLane: Map<number, string>;
  onSetBlocker: (laneIdx: number, uid: string | null) => void;
  onZoom: (u: RuneterraBattleUnit) => void;
}) {
  return (
    <div className="flex shrink-0 gap-3 overflow-x-auto rounded-md border border-rose-500/30 bg-rose-900/10 p-2">
      {lanes.map((lane, i) => {
        const attackerUnit = attackerBench.find(
          (u) => u.uid === lane.attackerUid,
        );
        // En mode assign, on prend la sélection locale ; sinon, on lit
        // directement la lane (mise à jour côté serveur).
        const blockerUid = mustAssignBlockers
          ? (blockerByLane.get(i) ?? null)
          : lane.blockerUid;
        const blockerUnit = blockerUid
          ? defenderBench.find((u) => u.uid === blockerUid)
          : null;

        // Liste des bloqueurs valides (filtre Elusive + Fearsome).
        const validBlockers = mustAssignBlockers
          ? defenderBench.filter((u) => {
              if (!attackerUnit) return true;
              if (
                attackerUnit.keywords.includes("Elusive") &&
                !u.keywords.includes("Elusive")
              )
                return false;
              if (
                attackerUnit.keywords.includes("Fearsome") &&
                u.power < 3
              )
                return false;
              // Pas réutilisé sur une autre lane.
              for (const [otherI, otherUid] of blockerByLane) {
                if (otherI !== i && otherUid === u.uid) return false;
              }
              return true;
            })
          : [];

        return (
          <div
            key={i}
            className="flex flex-col items-center gap-1 rounded border border-white/10 bg-black/40 p-1.5"
          >
            <div className="text-[9px] uppercase tracking-widest text-rose-300">
              Lane {i + 1}
            </div>
            {attackerUnit ? (
              <UnitCard unit={attackerUnit} onClick={() => onZoom(attackerUnit)} />
            ) : (
              <div className="h-32 w-24" />
            )}
            <div className="text-[9px] text-zinc-500">vs</div>
            {mustAssignBlockers ? (
              <select
                value={blockerUid ?? ""}
                onChange={(e) =>
                  onSetBlocker(i, e.target.value ? e.target.value : null)
                }
                className="w-24 rounded border border-white/10 bg-black/60 px-1 py-0.5 text-[10px] text-zinc-200"
              >
                <option value="">— nexus —</option>
                {validBlockers.map((u) => {
                  const card = RUNETERRA_BASE_SET_BY_CODE.get(u.cardCode);
                  const label = card?.name?.slice(0, 12) ?? u.cardCode;
                  return (
                    <option key={u.uid} value={u.uid}>
                      {label} ({u.power}/{u.health - u.damage})
                    </option>
                  );
                })}
              </select>
            ) : blockerUnit ? (
              <UnitCard
                unit={blockerUnit}
                onClick={() => onZoom(blockerUnit)}
              />
            ) : (
              <div className="flex h-32 w-24 items-center justify-center rounded border border-dashed border-zinc-700 text-[10px] text-zinc-500">
                → nexus
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function UnitCard({
  unit,
  onClick,
  highlighted,
  dimmed,
}: {
  unit: RuneterraBattleUnit;
  onClick: () => void;
  highlighted?: boolean;
  dimmed?: boolean;
}) {
  const card = RUNETERRA_BASE_SET_BY_CODE.get(unit.cardCode);
  const aliveHealth = unit.health - unit.damage;
  const isChampion = card?.supertype === "Champion";
  return (
    <button
      onClick={onClick}
      disabled={dimmed}
      className={`relative flex w-24 flex-col items-stretch overflow-hidden rounded border bg-black/40 ${
        highlighted
          ? "border-rose-400 ring-2 ring-rose-400/60 shadow-[0_0_20px_rgba(244,114,128,0.5)] -translate-y-1"
          : card
            ? LOR_RARITY_COLOR[card.rarity]
            : "border-white/10"
      } ${dimmed ? "opacity-40 cursor-not-allowed" : "hover:scale-[1.03]"}`}
      title={card?.name ?? unit.cardCode}
    >
      <div className="aspect-[2/3]">
        {card?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.image}
            alt={card.name}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-[10px] text-zinc-500">
            {unit.cardCode}
          </div>
        )}
      </div>
      <div className="flex justify-between bg-black/60 px-1 py-0.5 text-[10px] tabular-nums">
        <span className="text-amber-300">{unit.power}</span>
        <span className={aliveHealth <= 0 ? "text-rose-400" : "text-emerald-300"}>
          {aliveHealth}
        </span>
      </div>
      {isChampion && unit.level >= 2 && (
        <div className="absolute right-0.5 top-0.5 rounded bg-amber-400 px-1 text-[8px] font-bold text-amber-950">
          ★ 2
        </div>
      )}
      {unit.playedThisRound && (
        <div className="absolute left-0.5 top-0.5 rounded bg-zinc-700/70 px-1 text-[8px] text-zinc-300">
          🆕
        </div>
      )}
    </button>
  );
}

function HandRow({
  self,
  myTurn,
  onPlay,
  onZoom,
}: {
  self: RuneterraSelfState;
  myTurn: boolean;
  onPlay: (handIndex: number) => void;
  onZoom: (cardCode: string) => void;
}) {
  return (
    <div className="flex shrink-0 gap-2 overflow-x-auto rounded-md border border-white/10 bg-black/30 p-2">
      {self.hand.length === 0 ? (
        <span className="px-3 py-2 text-xs text-zinc-500">Main vide</span>
      ) : (
        self.hand.map((cardCode, i) => {
          const card = RUNETERRA_BASE_SET_BY_CODE.get(cardCode);
          const cost = card?.cost ?? 0;
          const total = self.mana + (card?.type === "Spell" ? self.spellMana : 0);
          const playable = myTurn && total >= cost && card?.type === "Unit";
          return (
            <button
              key={`${cardCode}-${i}`}
              onClick={() => playable && onPlay(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                onZoom(cardCode);
              }}
              disabled={!myTurn}
              className={`relative w-28 shrink-0 overflow-hidden rounded border-2 transition-transform ${
                playable
                  ? "border-emerald-400/60 cursor-pointer hover:scale-[1.05] hover:-translate-y-2"
                  : "border-white/10 opacity-70 cursor-not-allowed"
              }`}
              title={`${card?.name ?? cardCode} · click pour jouer · clic-droit pour zoomer`}
            >
              <div className="aspect-[2/3]">
                {card?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.image}
                    alt={card.name}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-[10px] text-zinc-500">
                    {cardCode}
                  </div>
                )}
              </div>
              <div className="absolute left-1 top-1 rounded-full bg-blue-500/80 px-1.5 text-[10px] font-bold text-white">
                {cost}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

function CardFromCode({ cardCode }: { cardCode: string }) {
  const card = RUNETERRA_BASE_SET_BY_CODE.get(cardCode);
  if (!card) {
    return (
      <div className="flex aspect-[2/3] items-center justify-center bg-zinc-900 text-[10px] text-zinc-500">
        {cardCode}
      </div>
    );
  }
  return <LorCardFace card={card} />;
}

function CardZoomFromBattle({
  card,
  onClose,
}: {
  card: RuneterraBattleUnit | string | null;
  onClose: () => void;
}) {
  // Convertit un BattleUnit OU un cardCode en RuneterraCardData pour le modal.
  const cardCode = useMemo(() => {
    if (card === null) return null;
    if (typeof card === "string") return card;
    return card.cardCode;
  }, [card]);
  const cardData = cardCode ? RUNETERRA_BASE_SET_BY_CODE.get(cardCode) ?? null : null;
  return <LorCardZoomModal card={cardData} onClose={onClose} />;
}

// ────────────────────── Fin de partie ────────────────────────────────────

function EndView({ state }: { state: RuneterraBattleState }) {
  const won = state.winner === state.selfSeat;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 py-12">
      <h1 className={`text-3xl font-bold ${won ? "text-emerald-300" : "text-rose-300"}`}>
        {won ? "🏆 Victoire !" : state.winner === null ? "Égalité" : "Défaite"}
      </h1>
      <p className="text-sm text-zinc-400">
        Round {state.round} · Nexus {state.self?.nexusHealth ?? 0} vs{" "}
        {state.opponent?.nexusHealth ?? 0}
      </p>
      <div className="max-h-60 w-full overflow-y-auto rounded-md border border-white/10 bg-black/40 p-3 text-[11px] text-zinc-400">
        {state.log.map((entry, i) => (
          <div key={i}>{entry}</div>
        ))}
      </div>
      <Link
        href="/play/tcg/lol"
        className="rounded-md bg-sky-500 px-4 py-2 text-sm font-bold text-sky-950 hover:bg-sky-400"
      >
        Retour au menu
      </Link>
    </div>
  );
}
