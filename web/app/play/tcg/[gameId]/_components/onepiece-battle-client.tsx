"use client";

// Client de combat One Piece TCG (clone fidèle Bandai).
// Connecte au serveur PartyKit, affiche le board, la main, le log, le
// chat ; gère mulligan, attaques, défense (Bloqueur / Counter / Évent
// [Contre]), résolution de Trigger, PendingChoice, timer anti-AFK.

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CardPreview } from "./card-hover-preview";
import {
  DefeatScreen,
  LeaderShowdown,
  VictoryScreen,
} from "./onepiece-battle-cinematic";
import { BattleEffects } from "./onepiece-battle-effects";
import { useOnePieceSfx } from "./use-onepiece-sfx";
import type {
  OnePieceBattleCardInPlay,
  OnePieceBattleClientMessage,
  OnePieceBattleSeatId,
  OnePieceBattleServerMessage,
  OnePieceBattleState,
} from "@shared/types";
import { TCG_GAMES } from "@shared/types";
import { ONEPIECE_BASE_SET_BY_ID } from "@shared/tcg-onepiece-base";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";

type ConnStatus = "connecting" | "connected" | "disconnected";

export function OnePieceBattleClient({
  profile,
  roomId,
  deckId,
}: {
  profile: Profile | null;
  roomId: string;
  deckId: string;
}) {
  const game = TCG_GAMES.onepiece;
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selfSeat, setSelfSeat] = useState<OnePieceBattleSeatId | null>(null);
  const [state, setState] = useState<OnePieceBattleState | null>(null);
  const sfx = useOnePieceSfx();
  // Trackers pour détecter les transitions et jouer les bons sons.
  const prevStateRef = useRef<OnePieceBattleState | null>(null);
  // Cinematic states.
  const [showLeaderShowdown, setShowLeaderShowdown] = useState(false);
  const [showVictoryScreen, setShowVictoryScreen] = useState(false);
  const [showDefeatScreen, setShowDefeatScreen] = useState(false);
  const [endReason, setEndReason] = useState<string | null>(null);
  // Attaque en 2 étapes : clique "Attaquer" sur un de mes attackers → store
  // l'uid ici. Puis le click sur une cible adverse envoie op-attack.
  const [attackerSelected, setAttackerSelected] = useState<string | null>(null);
  // Trigger révélé en privé (op-trigger-reveal) pour le défenseur, le temps
  // de pouvoir afficher "tu as révélé X".
  const [revealedTrigger, setRevealedTrigger] = useState<{
    cardId: string;
    trigger: string | null;
  } | null>(null);
  // Ref pour le timeout d'auto-clear (cleanup au unmount).
  const revealedTriggerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const send = useCallback((msg: OnePieceBattleClientMessage) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    if (!profile) {
      setStatus("disconnected");
      return;
    }
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
    params.set("name", profile.username);
    params.set("deck", deckId);
    const url = `${scheme}://${partyHost}/parties/battleop/${roomId}?${params.toString()}`;
    const ws = new WebSocket(url);
    socketRef.current = ws;
    ws.addEventListener("open", () => setStatus("connected"));
    ws.addEventListener("close", () => setStatus("disconnected"));
    ws.addEventListener("error", () => setStatus("disconnected"));
    ws.addEventListener("message", (e) => {
      if (cancelled) return;
      let msg: OnePieceBattleServerMessage;
      try {
        msg = JSON.parse(e.data as string) as OnePieceBattleServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "op-welcome":
          setSelfSeat(msg.selfSeat);
          break;
        case "op-state": {
          // Trigger SFX selon les transitions d'état.
          const prev = prevStateRef.current;
          const next = msg.state;
          // Détecter pendingAttack apparaît → son d'attaque.
          if (!prev?.pendingAttack && next.pendingAttack) {
            sfx.play("attack");
          }
          // Détecter une carte ajoutée à ma main (Vie ou pioche).
          if (
            prev?.self &&
            next.self &&
            next.self.handCount > prev.self.handCount
          ) {
            // Si la vie a baissé en même temps : Vie prise.
            if (
              prev.self.life > next.self.life ||
              (prev.opponent && next.opponent && prev.opponent.life > next.opponent.life)
            ) {
              sfx.play("life-taken");
            } else {
              sfx.play("card-played");
            }
          }
          // Détecter une carte qui quitte le terrain (KO).
          if (
            prev?.self &&
            next.self &&
            next.self.characters.length < prev.self.characters.length
          ) {
            sfx.play("ko");
          }
          if (
            prev?.opponent &&
            next.opponent &&
            next.opponent.characters.length < prev.opponent.characters.length
          ) {
            sfx.play("ko");
          }
          // Détecter game over → cinematic victory/defeat.
          if (prev?.phase !== "ended" && next.phase === "ended") {
            if (next.winner === next.selfSeat) {
              sfx.play("win");
              setShowVictoryScreen(true);
            } else {
              sfx.play("lose");
              setShowDefeatScreen(true);
            }
            // Récupère la raison du dernier log "Victoire ..." pour
            // afficher dans le cinematic.
            const reasonLine = next.log
              .slice()
              .reverse()
              .find((l) => l.includes("Victoire"));
            setEndReason(reasonLine ?? null);
          }
          // Détecter premier passage à playing → leader showdown.
          if (prev?.phase !== "playing" && next.phase === "playing") {
            setShowLeaderShowdown(true);
          }
          // Détecter changement de tour actif.
          if (
            prev?.activeSeat &&
            next.activeSeat &&
            prev.activeSeat !== next.activeSeat
          ) {
            sfx.play("turn-end");
          }
          prevStateRef.current = next;
          setState(next);
          break;
        }
        case "op-error":
          setErrorMsg(msg.message);
          break;
        case "chat":
          // Le chat in-combat est désactivé (cf. layout principal :
          // utiliser le chat global du site en sidebar à la place).
          break;
        case "op-trigger-reveal":
          sfx.play("trigger-reveal");
          setRevealedTrigger({ cardId: msg.cardId, trigger: msg.trigger });
          // Auto-clear après 6s. Cleanup l'ancien si redéclenché entre-temps.
          if (revealedTriggerTimerRef.current) {
            clearTimeout(revealedTriggerTimerRef.current);
          }
          revealedTriggerTimerRef.current = setTimeout(() => {
            setRevealedTrigger(null);
            revealedTriggerTimerRef.current = null;
          }, 6000);
          break;
      }
    });
    return () => {
      cancelled = true;
      ws.close();
      if (socketRef.current === ws) socketRef.current = null;
      // Cleanup du timer auto-clear pour éviter setState après unmount.
      if (revealedTriggerTimerRef.current) {
        clearTimeout(revealedTriggerTimerRef.current);
        revealedTriggerTimerRef.current = null;
      }
    };
  }, [profile, roomId, deckId]);

  function concede() {
    if (!confirm("Abandonner la partie ?")) return;
    send({ type: "op-concede" });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Effets visuels overlay plein écran */}
      <BattleEffects state={state} />
      {/* Cinematic : Leader showdown au début */}
      <LeaderShowdown
        selfLeaderId={state?.self?.leader?.cardId ?? null}
        oppLeaderId={state?.opponent?.leader?.cardId ?? null}
        selfName={state?.self?.username ?? "Toi"}
        oppName={state?.opponent?.username ?? "Adversaire"}
        show={showLeaderShowdown}
        onDone={() => setShowLeaderShowdown(false)}
      />
      {/* Cinematic : Victoire / Défaite plein écran */}
      <VictoryScreen
        show={showVictoryScreen}
        reason={endReason ?? undefined}
        onClose={() => setShowVictoryScreen(false)}
      />
      <DefeatScreen
        show={showDefeatScreen}
        reason={endReason ?? undefined}
        onClose={() => setShowDefeatScreen(false)}
      />
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-2 py-2 text-sm sm:px-4 sm:py-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/play/tcg/onepiece"
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← {game.name}
          </Link>
          <div className="hidden h-4 w-px bg-white/10 sm:block" />
          <span className={`hidden font-semibold sm:inline ${game.accent}`}>{game.name}</span>
          <span className="text-xs text-zinc-500">⚔️ Combat</span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>

      <main
        className={`relative flex flex-1 flex-col gap-2 overflow-y-auto p-2 sm:gap-3 sm:p-3 ${game.gradient}`}
      >
        {/* Playmat illustré OnePiece : grain + vagues Hokusai + halo
            radial top/bottom + boussole décorative + Joly Roger en
            arrière-plan très discret. Pointer-events none, z-0. */}
        <div
          className="pointer-events-none fixed inset-0 z-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(251,191,36,0.06), transparent 70%), radial-gradient(ellipse 80% 50% at 50% 100%, rgba(220,38,38,0.07), transparent 70%), linear-gradient(180deg, #18181b 0%, #0c0a09 100%)",
          }}
        />
        <div
          className="pointer-events-none fixed inset-0 z-0 mix-blend-overlay"
          aria-hidden="true"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'><path d='M0 120 Q 30 60, 60 120 T 120 120 T 180 120 T 240 120' stroke='%23fbbf24' stroke-width='1' fill='none' opacity='0.15'/><path d='M0 160 Q 30 100, 60 160 T 120 160 T 180 160 T 240 160' stroke='%23dc2626' stroke-width='1' fill='none' opacity='0.10'/><path d='M0 80 Q 30 40, 60 80 T 120 80 T 180 80 T 240 80' stroke='%2360a5fa' stroke-width='0.5' fill='none' opacity='0.08'/></svg>\")",
            backgroundRepeat: "repeat",
            opacity: 0.6,
          }}
        />
        {/* Boussole décorative au centre — très discrète */}
        <div
          className="pointer-events-none fixed left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 opacity-[0.025]"
          aria-hidden="true"
        >
          <svg width="600" height="600" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="48" stroke="#fbbf24" strokeWidth="0.5" />
            <circle cx="50" cy="50" r="40" stroke="#fbbf24" strokeWidth="0.3" />
            <circle cx="50" cy="50" r="30" stroke="#fbbf24" strokeWidth="0.2" />
            <line x1="50" y1="2" x2="50" y2="98" stroke="#fbbf24" strokeWidth="0.3" />
            <line x1="2" y1="50" x2="98" y2="50" stroke="#fbbf24" strokeWidth="0.3" />
            <line x1="14.6" y1="14.6" x2="85.4" y2="85.4" stroke="#fbbf24" strokeWidth="0.2" />
            <line x1="85.4" y1="14.6" x2="14.6" y2="85.4" stroke="#fbbf24" strokeWidth="0.2" />
            <text x="50" y="6" fontSize="4" textAnchor="middle" fill="#fbbf24">N</text>
            <text x="50" y="98" fontSize="4" textAnchor="middle" fill="#fbbf24">S</text>
            <text x="2" y="52" fontSize="4" fill="#fbbf24">O</text>
            <text x="94" y="52" fontSize="4" fill="#fbbf24">E</text>
            <polygon points="50,18 53,50 50,82 47,50" fill="#fbbf24" opacity="0.5" />
          </svg>
        </div>
        {/* Joly Roger très discret en bas */}
        <div
          className="pointer-events-none fixed bottom-4 right-4 z-0 text-[14rem] opacity-[0.035]"
          aria-hidden="true"
        >
          🏴‍☠️
        </div>
        <div className="relative z-10 flex flex-1 flex-col gap-2 sm:gap-3">
        {!profile ? (
          <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
            Connecte-toi pour rejoindre la partie.
          </div>
        ) : (
          <>
            {/* Pills info compactes — sans bouton fin de tour (qu'on isole
                en sticky bottom-right pour l'affordance). */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Pill label="Room" value={roomId} />
              <Pill label="Conn" value={status} />
              <Pill label="Siège" value={selfSeat ?? "—"} />
              <Pill label="Phase" value={state?.phase ?? "—"} />
              <Pill label="Tour" value={String(state?.turnNumber ?? 0)} />
              <a
                href="/play/tcg/onepiece/regles"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-200 hover:bg-amber-400/20"
                title="Ouvre les règles dans un nouvel onglet"
              >
                📖 Règles
              </a>
              <button
                onClick={() => sfx.setEnabled(!sfx.enabled)}
                className="rounded-md border border-zinc-500/40 bg-zinc-500/10 px-2 py-1 text-zinc-300 hover:bg-zinc-500/20"
                title={sfx.enabled ? "Couper le son" : "Activer le son"}
                aria-label={sfx.enabled ? "Couper le son" : "Activer le son"}
              >
                {sfx.enabled ? "🔊" : "🔇"}
              </button>
              <button
                onClick={concede}
                className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-rose-200 hover:bg-rose-500/20"
              >
                Abandonner
              </button>
            </div>

            {errorMsg && (
              <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {errorMsg}
                <button
                  onClick={() => setErrorMsg(null)}
                  className="ml-2 underline"
                >
                  fermer
                </button>
              </div>
            )}

            {state?.phase === "waiting" && (
              <div className="rounded-md border border-white/10 bg-black/40 p-4 text-sm text-zinc-300">
                ⏳ En attente d&apos;un adversaire…{" "}
                <span className="text-zinc-500">
                  partage l&apos;URL de la room avec un ami pour qu&apos;il
                  rejoigne (deuxième session).
                </span>
              </div>
            )}

            {state?.phase === "mulligan" && state.self && (
              <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-4">
                <div className="mb-2 text-sm font-semibold text-amber-200">
                  🎲 Phase de mulligan
                </div>
                <p className="text-xs text-amber-100/80">
                  Tu peux refaire ta main une fois (les 5 cartes retournent au
                  deck, shuffle, repioche 5). Une seule chance.
                </p>
                {state.self.mulliganDecided ? (
                  <div className="mt-3 text-xs text-zinc-300">
                    ✓ Tu as décidé. En attente de l&apos;adversaire…
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => send({ type: "op-mulligan", take: false })}
                      className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-400"
                    >
                      ✋ Garder ma main
                    </button>
                    <button
                      onClick={() => send({ type: "op-mulligan", take: true })}
                      className="rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400"
                    >
                      🔄 Mulligan
                    </button>
                  </div>
                )}
              </div>
            )}

            {state?.phase === "playing" && (() => {
              const myTurn = state.activeSeat === state.selfSeat;
              return (
                <motion.div
                  animate={
                    myTurn
                      ? { boxShadow: ["0 0 0 rgba(52,211,153,0)", "0 0 18px rgba(52,211,153,0.4)", "0 0 0 rgba(52,211,153,0)"] }
                      : {}
                  }
                  transition={{ duration: 2, repeat: myTurn ? Infinity : 0 }}
                  className={`flex flex-wrap items-center gap-3 rounded-md border p-2.5 text-sm ${
                    myTurn
                      ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-100"
                      : "border-rose-500/40 bg-rose-950/40 text-rose-200"
                  }`}
                >
                  <span className="font-bold">
                    {myTurn ? "🟢 À toi de jouer" : "🔴 Tour adverse"}
                  </span>
                  <span className="text-xs text-zinc-300/80">
                    Tour {state.turnNumber} · {state.turnPhase}
                  </span>
                  <DeadlineCountdown deadlineMs={state.deadlineMs ?? null} />
                  {attackerSelected && (
                    <span className="ml-auto rounded bg-amber-500/20 px-2 py-1 text-xs font-semibold text-amber-200">
                      🎯 Choisis une cible{" "}
                      <button
                        onClick={() => setAttackerSelected(null)}
                        className="underline hover:text-amber-100"
                      >
                        annuler
                      </button>
                    </span>
                  )}
                </motion.div>
              );
            })()}

            {/* Pending attack panel : visible aux deux joueurs, actions
                pour le défenseur uniquement. */}
            {state?.pendingAttack && (
              <DefensePanel
                state={state}
                send={send}
                isDefender={state.pendingAttack.attackerSeat !== state.selfSeat}
              />
            )}

            {/* Pending trigger : panel pour le défenseur. */}
            {state?.pendingTrigger &&
              state.pendingTrigger.defenderSeat === state.selfSeat && (
                <TriggerPanel
                  trigger={state.pendingTrigger}
                  send={send}
                />
              )}

            {/* Pending choice (effet de carte) : panel pour le seat concerné. */}
            {state?.pendingChoice &&
              state.pendingChoice.seat === state.selfSeat && (
                <PendingChoicePanel
                  choice={state.pendingChoice}
                  state={state}
                  send={send}
                />
              )}
            {state?.pendingChoice &&
              state.pendingChoice.seat !== state.selfSeat && (
                <div className="rounded-md border border-fuchsia-400/40 bg-fuchsia-500/10 p-3 text-xs text-fuchsia-200">
                  ⏳ L&apos;adversaire résout l&apos;effet de{" "}
                  <span className="font-semibold">
                    {state.pendingChoice.sourceCardNumber}
                  </span>
                  …
                </div>
              )}

            {revealedTrigger && (
              <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-200">
                🎴 Vie révélée : {ONEPIECE_BASE_SET_BY_ID.get(revealedTrigger.cardId)?.name ?? "?"}
                {revealedTrigger.trigger ? (
                  <> — Trigger : <span className="italic">{revealedTrigger.trigger}</span></>
                ) : (
                  <> — pas de Trigger</>
                )}
              </div>
            )}

            {state?.phase === "ended" && (
              <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                🏁 Partie terminée — vainqueur :{" "}
                <span className="font-bold">
                  {state.winner === state.selfSeat
                    ? state.self?.username ?? "vous"
                    : state.opponent?.username ?? "adversaire"}
                </span>
              </div>
            )}

            {/* Vue board : adversaire en haut, soi en bas (full width). */}
            {state &&
              (() => {
                const isMyTurn =
                  state.phase === "playing" &&
                  state.activeSeat === state.selfSeat &&
                  state.turnPhase === "main" &&
                  !state.pendingAttack &&
                  !state.pendingTrigger;
                const canAttack = isMyTurn && state.turnNumber > 1;
                return (
                  <div className="flex flex-col gap-3">
                    <PlayerPanel
                      title={
                        state.opponent
                          ? `Adversaire — ${state.opponent.username}`
                          : "Adversaire (pas encore connecté)"
                      }
                      data={state.opponent}
                      isActive={state.activeSeat !== state.selfSeat}
                      isSelf={false}
                      send={send}
                      canAttachDon={false}
                      canAttack={false}
                      attackerSelected={attackerSelected}
                      onPickAttacker={null}
                      onPickTarget={(uid) => {
                        if (!attackerSelected) return;
                        send({
                          type: "op-attack",
                          attackerUid: attackerSelected,
                          targetUid: uid,
                        });
                        setAttackerSelected(null);
                      }}
                      pendingAttackTargetUid={
                        state.pendingAttack?.attackerSeat === state.selfSeat
                          ? state.pendingAttack.targetUid
                          : null
                      }
                    />
                    <PlayerPanel
                      title={`Moi — ${state.self?.username ?? "?"}`}
                      data={state.self}
                      isActive={state.activeSeat === state.selfSeat}
                      isSelf={true}
                      send={send}
                      canAttachDon={
                        isMyTurn && (state.self?.donActive ?? 0) > 0
                      }
                      canAttack={canAttack}
                      attackerSelected={attackerSelected}
                      onPickAttacker={(uid) => setAttackerSelected(uid)}
                      onPickTarget={null}
                      pendingAttackTargetUid={
                        state.pendingAttack?.attackerSeat !== state.selfSeat
                          ? state.pendingAttack?.targetUid ?? null
                          : null
                      }
                    />
                  </div>
                );
              })()}

            {state && state.self && (
              <div className="sticky bottom-0 -mx-2 mt-2 rounded-md border border-amber-400/30 bg-zinc-950/95 p-2 shadow-[0_-8px_32px_rgba(0,0,0,0.6)] backdrop-blur sm:-mx-4 sm:p-3">
                <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-widest text-zinc-400">
                  <span className="font-bold text-amber-200">
                    🃏 Ma main ({state.self.handCount} cartes)
                  </span>
                  {state.phase === "playing" &&
                    state.activeSeat === state.selfSeat &&
                    state.turnPhase === "main" && (
                      <span className="text-emerald-300">
                        💡 clique « Jouer » sur un Personnage pour le poser
                      </span>
                    )}
                </div>
                {/* Single-row horizontal scroll : permet de garder une seule
                    rangée même avec 7+ cartes en main, sans écraser le board. */}
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  <AnimatePresence mode="popLayout">
                  {state.self.hand.map((cardId, i) => {
                    const meta = ONEPIECE_BASE_SET_BY_ID.get(cardId);
                    const isMyMainPhase =
                      state.phase === "playing" &&
                      state.activeSeat === state.selfSeat &&
                      state.turnPhase === "main";
                    const canAfford =
                      meta && "cost" in meta
                        ? (state.self?.donActive ?? 0) >= meta.cost
                        : false;
                    const isCounterEvent =
                      meta?.kind === "event" &&
                      !!meta.effect &&
                      /\[Contre\]/i.test(meta.effect) &&
                      !/\[Principale\]/i.test(meta.effect);
                    // Persos : jouable en main phase si DON suffisantes + terrain pas plein.
                    const canPlayCharacter =
                      meta?.kind === "character" &&
                      isMyMainPhase &&
                      canAfford &&
                      (state.self?.characters.length ?? 0) < 7;
                    // Évent [Principale] : jouable en main phase si DON suffisantes.
                    const canPlayEvent =
                      meta?.kind === "event" &&
                      !isCounterEvent &&
                      isMyMainPhase &&
                      canAfford;
                    // Lieu : jouable en main phase si DON suffisantes.
                    const canPlayStage =
                      meta?.kind === "stage" && isMyMainPhase && canAfford;
                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: 20, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.6 }}
                        transition={{ duration: 0.2 }}
                        key={`${cardId}-${i}`}
                        className="flex w-24 shrink-0 flex-col gap-1 sm:w-28 lg:w-32 xl:w-36"
                      >
                        {meta ? (
                          <CardPreview
                            cardId={meta.id}
                            imageUrl={meta.image}
                            name={meta.name}
                            effect={meta.effect}
                            trigger={meta.trigger}
                            className="rounded border border-white/10 bg-zinc-950"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={meta.image}
                              alt={meta.name}
                              className="h-36 w-full rounded object-contain sm:h-40 lg:h-44 xl:h-48"
                            />
                          </CardPreview>
                        ) : (
                          <div className="h-36 w-full rounded border border-white/10 bg-zinc-950 sm:h-40 lg:h-44 xl:h-48" />
                        )}
                        {meta?.kind === "character" && (
                          <button
                            onClick={() =>
                              send({
                                type: "op-play-character",
                                handIndex: i,
                              })
                            }
                            disabled={!canPlayCharacter}
                            className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                            title={
                              canPlayCharacter
                                ? `Jouer (coût ${meta.cost})`
                                : `Non jouable (coût ${meta.cost})`
                            }
                          >
                            ▶ Jouer ({meta.cost})
                          </button>
                        )}
                        {meta?.kind === "event" && !isCounterEvent && (
                          <button
                            onClick={() =>
                              send({
                                type: "op-play-event",
                                handIndex: i,
                              })
                            }
                            disabled={!canPlayEvent}
                            className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                            title={
                              canPlayEvent
                                ? `Jouer Évent (coût ${meta.cost})`
                                : `Non jouable (coût ${meta.cost})`
                            }
                          >
                            ▶ Évent ({meta.cost})
                          </button>
                        )}
                        {meta?.kind === "event" && isCounterEvent && (
                          <span
                            className="rounded border border-amber-500/30 bg-amber-500/5 px-1.5 py-1 text-center text-xs text-amber-300/80"
                            title="Évent [Contre] — jouable seulement en défense"
                          >
                            ⚔️ Counter
                          </span>
                        )}
                        {meta?.kind === "stage" && (
                          <button
                            onClick={() =>
                              send({
                                type: "op-play-stage",
                                handIndex: i,
                              })
                            }
                            disabled={!canPlayStage}
                            className="rounded border border-purple-500/40 bg-purple-500/10 px-1.5 py-1 text-xs font-semibold text-purple-200 hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                            title={
                              canPlayStage
                                ? `Poser Lieu (coût ${meta.cost})`
                                : `Non jouable (coût ${meta.cost})`
                            }
                          >
                            ▶ Lieu ({meta.cost})
                          </button>
                        )}
                        {meta?.kind === "leader" && (
                          <span className="text-center text-xs text-rose-300">
                            Leader
                          </span>
                        )}
                      </motion.div>
                    );
                  })}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Journal du combat — bouton collapse pour libérer de la
                place sur le board quand le joueur a déjà compris l'action.
                Auto-scroll vers le dernier log. */}
            <BattleLog log={state?.log ?? []} />

          </>
        )}
        </div>

        {/* Bouton "Fin de tour" isolé en flottant bottom-right.
            Visible uniquement quand c'est mon tour en phase main, sans
            attaque/trigger en cours. C'est l'action centrale du joueur ;
            isoler ce bouton évite qu'il se perde dans la barre de pills. */}
        {state?.phase === "playing" &&
          state.activeSeat === state.selfSeat &&
          state.turnPhase === "main" &&
          !state.pendingAttack &&
          !state.pendingTrigger &&
          !state.pendingChoice && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => send({ type: "op-end-turn" })}
              className="fixed bottom-44 right-4 z-30 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 px-5 py-3 text-base font-extrabold text-emerald-950 shadow-[0_8px_32px_rgba(16,185,129,0.5)] hover:from-emerald-400 hover:to-emerald-500 sm:bottom-48 lg:bottom-52"
              aria-label="Terminer mon tour"
            >
              🏁 Fin de tour
            </motion.button>
          )}
      </main>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded border border-white/10 bg-black/40 px-2 py-1 text-zinc-300">
      <span className="text-zinc-500">{label}:</span> {value}
    </span>
  );
}

/** Journal du combat — collapsible avec auto-scroll vers le dernier log
 *  et bouton pour libérer de la place sur le board quand pas utilisé. */
function BattleLog({ log }: { log: string[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const listRef = useRef<HTMLUListElement | null>(null);
  // Auto-scroll vers le bas à chaque nouveau log.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);
  return (
    <div className="rounded-md border border-white/10 bg-black/30">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between px-3 py-2 text-[11px] uppercase tracking-widest text-zinc-400 hover:bg-white/5"
        aria-expanded={!collapsed}
        aria-label={
          collapsed ? "Déplier le journal" : "Replier le journal"
        }
      >
        <span>📜 Journal du combat ({log.length})</span>
        <span className="text-zinc-500">{collapsed ? "▶" : "▼"}</span>
      </button>
      {!collapsed && (
        <ul
          ref={listRef}
          className="max-h-40 space-y-0.5 overflow-y-auto px-3 pb-2 text-xs text-zinc-300"
        >
          {log.slice(-30).map((line, i) => (
            <li key={i} className="leading-relaxed">
              · {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlayerPanel({
  title,
  data,
  isActive,
  isSelf,
  send,
  canAttachDon,
  canAttack,
  attackerSelected,
  onPickAttacker,
  onPickTarget,
  pendingAttackTargetUid,
}: {
  title: string;
  data: import("@shared/types").OnePieceBattlePlayerPublicState | null;
  isActive: boolean;
  isSelf: boolean;
  send: (msg: import("@shared/types").OnePieceBattleClientMessage) => void;
  canAttachDon: boolean;
  canAttack: boolean;
  attackerSelected: string | null;
  onPickAttacker: ((uid: string) => void) | null;
  onPickTarget: ((uid: string) => void) | null;
  pendingAttackTargetUid: string | null;
}) {
  // Quand un de mes attackers est sélectionné, l'adversaire devient cible
  // cliquable (Leader + Persos rested).
  const targetMode = !!attackerSelected && !!onPickTarget;
  return (
    <div
      className={`flex flex-col gap-2 rounded-md border bg-black/30 p-2 sm:p-3 ${
        isActive ? "border-emerald-400/40" : "border-white/10"
      }`}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-zinc-100">{title}</span>
        {isActive && (
          <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] text-emerald-300">
            tour actif
          </span>
        )}
      </div>
      {!data ? (
        <div className="text-xs text-zinc-500">Aucun joueur.</div>
      ) : (
        <>
          {/* Layout horizontal : Leader (gauche) + Persos (centre, scrollable
              si débordement) + Lieu (droite). Stats compactes au-dessus. */}
          <div className="flex flex-wrap items-stretch gap-3">
            {data.leader && (() => {
              const leaderMeta = ONEPIECE_BASE_SET_BY_ID.get(data.leader.cardId);
              if (!leaderMeta) return null;
              const leaderRested = data.leader.rested;
              const leaderCanBeAttacker =
                isSelf && canAttack && !leaderRested;
              const leaderPower =
                leaderMeta.kind === "leader"
                  ? leaderMeta.power + data.leader.attachedDon * 1000
                  : 0;
              return (
                <div className="flex flex-col items-center gap-1">
                  <CardPreview
                    cardId={leaderMeta.id}
                    imageUrl={leaderMeta.image}
                    name={leaderMeta.name}
                    effect={leaderMeta.effect}
                    className={`relative w-28 rounded-md border-2 transition-all sm:w-32 lg:w-36 xl:w-40 ${
                      leaderRested
                        ? "border-zinc-500/60"
                        : "border-rose-400/80 shadow-[0_0_24px_rgba(251,113,133,0.3)]"
                    } ${
                      targetMode
                        ? "cursor-crosshair ring-2 ring-amber-400 hover:scale-105"
                        : leaderCanBeAttacker
                          ? "cursor-pointer ring-2 ring-rose-400/0 hover:ring-rose-400/80 hover:scale-105"
                          : "cursor-default"
                    } ${attackerSelected === "leader" && isSelf ? "scale-105 ring-2 ring-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.6)]" : ""}`}
                  >
                    <button
                      onClick={() => {
                        if (targetMode && onPickTarget) {
                          onPickTarget("leader");
                        } else if (leaderCanBeAttacker && onPickAttacker) {
                          onPickAttacker("leader");
                        }
                      }}
                      disabled={!targetMode && !leaderCanBeAttacker}
                      className="block w-full"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={leaderMeta.image}
                        alt={leaderMeta.name}
                        className={`h-40 w-full rounded object-contain transition-transform sm:h-48 lg:h-52 xl:h-56 ${
                          leaderRested ? "rotate-90 grayscale" : ""
                        }`}
                      />
                      {/* Badge "LEADER" parchemin doré */}
                      <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-full border-2 border-amber-300/90 bg-gradient-to-br from-amber-400 to-amber-600 px-2 py-0.5 text-[10px] font-extrabold tracking-widest text-amber-950 shadow-md">
                        ⭐ LEADER
                      </div>
                      {/* Power affiché en bas-gauche, gros et lisible */}
                      <span className="absolute bottom-0 left-0 rounded-tr bg-black/85 px-1.5 py-0.5 text-base font-bold text-amber-200 tabular-nums shadow">
                        {leaderPower.toLocaleString("fr-FR")}
                      </span>
                      {data.leader.attachedDon > 0 && (
                        <motion.span
                          key={data.leader.attachedDon}
                          initial={{ scale: 1.5 }}
                          animate={{ scale: 1 }}
                          transition={{ duration: 0.3 }}
                          className="absolute -right-2 -top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-amber-200 bg-gradient-to-br from-amber-300 to-amber-600 text-xs font-extrabold text-amber-950 shadow-lg"
                        >
                          +{data.leader.attachedDon}
                        </motion.span>
                      )}
                      {/* Watermark "ÉPUISÉ" si rested */}
                      {leaderRested && (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-bold uppercase tracking-widest text-zinc-100">
                          <span className="rounded bg-zinc-900/85 px-2 py-1">
                            Épuisé
                          </span>
                        </span>
                      )}
                    </button>
                  </CardPreview>
                </div>
              );
            })()}
            <div className="flex flex-1 flex-col gap-3 text-xs text-zinc-300">
              {/* Vies : compteur gros + cœur, plus lisible que pile écrasée */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Vie
                </span>
                <div className="flex items-center gap-1">
                  {data.life === 0 ? (
                    <span className="text-2xl">💀</span>
                  ) : (
                    <span className="text-2xl">❤️</span>
                  )}
                  <span className="text-2xl font-extrabold text-rose-300 tabular-nums">
                    {data.life}
                  </span>
                </div>
                {/* Mini-pile décorative à droite (option visuelle) */}
                {data.life > 0 && (
                  <div className="flex h-8 items-center" aria-hidden="true">
                    {Array.from({ length: Math.min(data.life, 6) }).map(
                      (_, i) => (
                        <div
                          key={i}
                          className="-ml-2 h-8 w-6 rounded-sm border border-rose-500/60 bg-gradient-to-br from-rose-900 via-rose-700 to-rose-900 shadow-[inset_0_0_8px_rgba(0,0,0,0.5)] first:ml-0"
                          style={{ transform: `rotate(${(i - 1) * 1.5}deg)` }}
                        />
                      ),
                    )}
                  </div>
                )}
                {data.faceUpLifeCardIds.length > 0 && (
                  <span
                    className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-300"
                    title="Vies face-up (révélées)"
                  >
                    👁 {data.faceUpLifeCardIds.length}
                  </span>
                )}
              </div>

              {/* DON : jetons dorés plus gros + compteur très lisible */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                  DON
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {Array.from({ length: data.donActive }).map((_, i) => (
                    <span
                      key={`act-${i}`}
                      className="inline-block h-4 w-4 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 ring-1 ring-amber-200 shadow"
                      title="DON prête"
                    />
                  ))}
                  {Array.from({ length: data.donRested }).map((_, i) => (
                    <span
                      key={`rest-${i}`}
                      className="inline-block h-4 w-4 rounded-full bg-gradient-to-br from-zinc-500 to-zinc-700 ring-1 ring-zinc-400 shadow opacity-50"
                      title="DON épuisée"
                    />
                  ))}
                </div>
                <span className="ml-1 text-sm font-bold text-amber-200 tabular-nums">
                  {data.donActive}
                </span>
                <span className="text-[10px] text-zinc-500 tabular-nums">
                  /{data.donActive + data.donRested + data.donDeckSize}
                </span>
              </div>

              {/* Deck / Défausse / Main : piles plus grandes, compteurs lisibles */}
              <div className="flex items-center gap-3">
                <div
                  className="flex flex-col items-center gap-0.5"
                  title={`Deck : ${data.deckSize} cartes`}
                >
                  <div className="relative h-14 w-10">
                    <div className="absolute left-0.5 top-0.5 h-14 w-10 rounded border border-indigo-500/40 bg-gradient-to-br from-indigo-900 to-indigo-950" />
                    <div className="absolute left-0 top-0 flex h-14 w-10 items-center justify-center rounded border border-indigo-500/60 bg-gradient-to-br from-indigo-800 via-indigo-900 to-indigo-950 text-sm font-bold text-indigo-200 tabular-nums">
                      {data.deckSize}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                    Deck
                  </span>
                </div>
                <div
                  className="flex flex-col items-center gap-0.5"
                  title={`Défausse : ${data.discardSize} cartes`}
                >
                  <div className="relative h-14 w-10">
                    {data.discardSize > 0 && (
                      <div className="absolute left-0.5 top-0.5 h-14 w-10 rounded border border-zinc-600/40 bg-zinc-800" />
                    )}
                    <div className="absolute left-0 top-0 flex h-14 w-10 items-center justify-center rounded border border-zinc-600/60 bg-gradient-to-br from-zinc-700 to-zinc-900 text-sm font-bold text-zinc-300 tabular-nums">
                      {data.discardSize}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                    Défausse
                  </span>
                </div>
                <div
                  className="flex flex-col items-center gap-0.5"
                  title={`Main : ${data.handCount} cartes`}
                >
                  <div className="flex h-14 w-10 items-center justify-center rounded border border-emerald-600/60 bg-gradient-to-br from-emerald-800 to-emerald-950 text-sm font-bold text-emerald-200 tabular-nums">
                    {data.handCount}
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                    Main
                  </span>
                </div>
                <div className="ml-auto text-xs text-zinc-400">
                  <span className="font-bold tabular-nums text-zinc-200">
                    {data.characters.length}
                  </span>
                  <span className="text-zinc-500"> / 5 Persos</span>
                </div>
              </div>

              {isSelf && canAttachDon && data.leader && (
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() =>
                      send({ type: "op-attach-don", targetUid: "leader" })
                    }
                    className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
                  >
                    + DON au Leader
                  </button>
                  {hasKeywordClient(
                    ONEPIECE_BASE_SET_BY_ID.get(data.leader.cardId)?.effect,
                    "Activation\\s*:\\s*Principale",
                  ) && (
                    <button
                      onClick={() =>
                        send({ type: "op-activate-main", uid: "leader" })
                      }
                      className="rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-2 py-1 text-xs font-semibold text-fuchsia-200 hover:bg-fuchsia-500/20"
                    >
                      ✨ Activer Leader
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Persos en jeu (sur la même ligne que le Leader visuel via
              flex-wrap, mais peuvent passer dessous si pas de place). */}
          {data.characters.length > 0 && (
            <div className="flex flex-wrap items-end gap-1.5">
              <AnimatePresence mode="popLayout">
              {data.characters.map((c) => {
                const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
                const power = meta && "power" in meta ? meta.power : 0;
                const totalPower = power + c.attachedDon * 1000;
                // Cible cliquable : Persos adverse rested uniquement.
                const targetable = targetMode && c.rested && !!onPickTarget;
                const isSelected =
                  isSelf && attackerSelected === c.uid;
                const canBeAttacker =
                  isSelf &&
                  canAttack &&
                  !c.rested &&
                  (!c.playedThisTurn ||
                    hasKeywordClient(meta?.effect, "Initiative"));
                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.6, y: -20 }}
                    animate={
                      // Si ce Persos est la cible d'une attaque pendante,
                      // on le fait trembler pour le mettre en valeur.
                      pendingAttackTargetUid === c.uid
                        ? {
                            opacity: 1,
                            scale: 1,
                            y: 0,
                            x: [0, -3, 3, -3, 3, 0],
                          }
                        : { opacity: 1, scale: 1, y: 0 }
                    }
                    exit={{ opacity: 0, scale: 0.4, rotate: -8 }}
                    transition={
                      pendingAttackTargetUid === c.uid
                        ? { x: { duration: 0.5, repeat: Infinity } }
                        : { duration: 0.25 }
                    }
                    key={c.uid}
                    className={`flex w-20 shrink-0 flex-col gap-1 sm:w-24 lg:w-28 xl:w-32 ${
                      c.rested ? "opacity-70 saturate-50" : ""
                    } ${
                      pendingAttackTargetUid === c.uid
                        ? "ring-2 ring-rose-500"
                        : ""
                    }`}
                    title={meta?.name ?? c.cardId}
                  >
                    {meta ? (
                      <CardPreview
                        cardId={meta.id}
                        imageUrl={meta.image}
                        name={meta.name}
                        effect={meta.effect}
                        trigger={meta.trigger}
                        className={`relative rounded border bg-zinc-950 transition-all ${
                          c.playedThisTurn
                            ? "border-amber-400/40"
                            : "border-white/10"
                        } ${
                          targetable
                            ? "cursor-crosshair ring-2 ring-amber-400 hover:scale-105"
                            : canBeAttacker
                              ? "cursor-pointer ring-2 ring-rose-400/0 hover:ring-rose-400/80 hover:scale-105"
                              : "cursor-default"
                        } ${isSelected ? "scale-105 ring-2 ring-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.6)]" : ""}`}
                      >
                        <button
                          onClick={() => {
                            // Toute la carte est cliquable :
                            // - cible si targetable
                            // - attaquant si canBeAttacker (mode click-on-card)
                            if (targetable && onPickTarget) {
                              onPickTarget(c.uid);
                            } else if (canBeAttacker && onPickAttacker) {
                              onPickAttacker(c.uid);
                            }
                          }}
                          disabled={!targetable && !canBeAttacker}
                          className="block w-full"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={meta.image}
                            alt={meta.name}
                            className={`h-28 w-full rounded object-contain transition-transform sm:h-32 lg:h-36 xl:h-40 ${
                              c.rested ? "rotate-90 grayscale" : ""
                            }`}
                          />
                          {/* Power total avec breakdown DON. text-sm minimum
                              pour être lisible. */}
                          <span className="absolute bottom-0 left-0 rounded-tr bg-black/85 px-1.5 py-0.5 text-sm font-bold text-amber-200 tabular-nums shadow">
                            {totalPower.toLocaleString("fr-FR")}
                          </span>
                          {c.attachedDon > 0 && (
                            <motion.span
                              key={c.attachedDon}
                              initial={{ scale: 1.5, backgroundColor: "#fef3c7" }}
                              animate={{ scale: 1, backgroundColor: "#fbbf24" }}
                              transition={{ duration: 0.3 }}
                              className="absolute right-0 top-0 rounded-bl bg-amber-400 px-1.5 py-0.5 text-xs font-extrabold text-amber-950 shadow"
                            >
                              +{c.attachedDon}
                            </motion.span>
                          )}
                          {/* Watermark "ÉPUISÉ" pour rested — plus clair que
                              juste la rotation. */}
                          {c.rested && (
                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-zinc-200/90">
                              <span className="rounded bg-zinc-900/80 px-1.5 py-0.5">
                                Épuisé
                              </span>
                            </span>
                          )}
                        </button>
                      </CardPreview>
                    ) : null}
                    {isSelf && canAttachDon && (
                      <button
                        onClick={() =>
                          send({ type: "op-attach-don", targetUid: c.uid })
                        }
                        className="rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-xs text-amber-200 hover:bg-amber-500/20"
                      >
                        + DON
                      </button>
                    )}
                    {isSelf && canAttachDon &&
                      hasKeywordClient(meta?.effect, "Activation\\s*:\\s*Principale") && (
                        <button
                          onClick={() =>
                            send({ type: "op-activate-main", uid: c.uid })
                          }
                          className="rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-1 py-0.5 text-xs text-fuchsia-200 hover:bg-fuchsia-500/20"
                        >
                          ✨ Activer
                        </button>
                      )}
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </div>
          )}

          {/* Lieu actif (Stage) */}
          {data.stage && (() => {
            const stageMeta = ONEPIECE_BASE_SET_BY_ID.get(data.stage.cardId);
            return (
              <div className="mt-1 flex items-center gap-2 border-t border-purple-500/20 pt-2">
                <span className="text-[9px] uppercase tracking-widest text-purple-400">
                  🏛️ Lieu
                </span>
                {stageMeta && (
                  <CardPreview
                    cardId={stageMeta.id}
                    imageUrl={stageMeta.image}
                    name={stageMeta.name}
                    effect={stageMeta.effect}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={stageMeta.image}
                      alt={stageMeta.name}
                      className={`h-16 w-12 rounded border-2 border-purple-500/60 object-contain shadow-[0_0_12px_rgba(168,85,247,0.3)] ${
                        data.stage!.rested ? "grayscale opacity-60" : ""
                      }`}
                    />
                  </CardPreview>
                )}
                <span className="text-[10px] text-zinc-300">
                  {stageMeta?.name ?? data.stage.cardId}
                </span>
                {isSelf && canAttachDon && hasKeywordClient(stageMeta?.effect, "Activation\\s*:\\s*Principale") && (
                  <button
                    onClick={() => send({ type: "op-activate-main", uid: data.stage!.uid })}
                    className="rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] text-fuchsia-200 hover:bg-fuchsia-500/20"
                  >
                    ✨ Activer Lieu
                  </button>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

function hasKeywordClient(
  text: string | null | undefined,
  keyword: string,
): boolean {
  if (!text) return false;
  return new RegExp(`\\[${keyword}\\]`, "i").test(text);
}

/** Panel d'options de défense pendant pendingAttack. Visible aux 2 joueurs
 *  mais actions actives uniquement pour le défenseur. */
function DefensePanel({
  state,
  send,
  isDefender,
}: {
  state: OnePieceBattleState;
  send: (msg: import("@shared/types").OnePieceBattleClientMessage) => void;
  isDefender: boolean;
}) {
  const att = state.pendingAttack!;
  const totalDefenderPower = att.defenderBasePower + att.defenderBoost;
  const wouldHit = att.attackerPower >= totalDefenderPower;

  const attackerCard =
    att.attackerUid === "leader"
      ? state.opponent?.leader?.cardId ??
        state.self?.leader?.cardId ??
        null
      : (state.opponent?.characters.find((c) => c.uid === att.attackerUid) ??
          state.self?.characters.find((c) => c.uid === att.attackerUid))
          ?.cardId ?? null;
  const targetIsLeader = att.targetUid === "leader";
  const attackerName = attackerCard
    ? ONEPIECE_BASE_SET_BY_ID.get(attackerCard)?.name ?? "?"
    : "?";

  // Bloqueurs disponibles côté défenseur (Persos avec [Bloqueur] redressés).
  const defenderHand = isDefender ? state.self : null;
  const blockers =
    defenderHand?.characters.filter(
      (c) =>
        !c.rested &&
        c.uid !== att.targetUid &&
        hasKeywordClient(
          ONEPIECE_BASE_SET_BY_ID.get(c.cardId)?.effect,
          "Bloqueur",
        ),
    ) ?? [];

  // Cartes de la main avec Counter > 0 (Persos avec valeur counter qu'on
  // discard pour booster la défense).
  const counterCards = (defenderHand?.hand ?? [])
    .map((id, i) => ({
      id,
      i,
      meta: ONEPIECE_BASE_SET_BY_ID.get(id),
    }))
    .filter((x) => {
      const c = x.meta && "counter" in x.meta ? x.meta.counter : null;
      return c != null && c > 0;
    });

  // Cartes Évent [Contre] dans la main (Counter events sans valeur counter).
  const counterEvents = (defenderHand?.hand ?? [])
    .map((id, i) => ({
      id,
      i,
      meta: ONEPIECE_BASE_SET_BY_ID.get(id),
    }))
    .filter((x) => {
      if (x.meta?.kind !== "event") return false;
      const eff = x.meta.effect ?? "";
      return /\[Contre\]/i.test(eff);
    });

  // Image de la carte attaquante pour mini-preview dans le panel.
  const attackerMeta = attackerCard
    ? ONEPIECE_BASE_SET_BY_ID.get(attackerCard)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.18 }}
      className={`rounded-md border p-3 ${
        isDefender
          ? "border-amber-400/60 bg-amber-400/10 text-amber-100 shadow-[0_0_25px_rgba(251,191,36,0.3)]"
          : "border-zinc-500/40 bg-black/40 text-zinc-300"
      }`}
    >
      <div className="text-sm font-bold">
        ⚔️ Attaque en cours{isDefender ? " — à toi de défendre" : ""}
        {att.doubleAttack && (
          <span className="ml-2 rounded bg-rose-500/30 px-2 py-0.5 text-xs text-rose-100">
            ⚡ Double Attaque
          </span>
        )}
      </div>

      {/* Affichage gros et clair : ATTAQUANT (power) → DÉFENSEUR (power)
          + résultat (touche/rate) en couleur. */}
      <div className="mt-3 flex items-center justify-center gap-3">
        {attackerMeta && (
          <div className="hidden sm:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attackerMeta.image}
              alt={attackerMeta.name}
              className="h-20 w-14 rounded border border-rose-400/50 object-contain"
            />
          </div>
        )}
        <div className="flex flex-1 items-center justify-center gap-3 sm:gap-5">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-widest text-zinc-400">
              Attaquant
            </div>
            <div className="truncate text-xs text-zinc-200">{attackerName}</div>
            <div className="text-3xl font-extrabold tabular-nums text-rose-300">
              {att.attackerPower.toLocaleString("fr-FR")}
            </div>
          </div>
          <div
            className={`text-3xl font-bold ${
              wouldHit ? "text-rose-400" : "text-emerald-400"
            }`}
          >
            {wouldHit ? "→" : "≠"}
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-widest text-zinc-400">
              {targetIsLeader ? "Leader" : "Personnage"}
            </div>
            <div className="truncate text-xs text-zinc-200">
              {targetIsLeader ? "Leader adverse" : "—"}
            </div>
            <div className="text-3xl font-extrabold tabular-nums text-sky-300">
              {totalDefenderPower.toLocaleString("fr-FR")}
            </div>
            {att.defenderBoost > 0 && (
              <div className="text-[10px] text-emerald-300">
                +{att.defenderBoost.toLocaleString("fr-FR")} (boost)
              </div>
            )}
          </div>
        </div>
        <div
          className={`shrink-0 rounded-md px-3 py-2 text-sm font-bold ${
            wouldHit
              ? "bg-rose-500/30 text-rose-100"
              : "bg-emerald-500/30 text-emerald-100"
          }`}
        >
          {wouldHit ? "❌ Touche" : "✅ Rate"}
        </div>
      </div>

      {isDefender && (
        <div className="mt-3 flex flex-wrap gap-2">
          {blockers.length > 0 && (
            <div className="flex w-full flex-wrap gap-2">
              <span className="self-center text-[10px] uppercase tracking-widest text-sky-300">
                Bloqueurs disponibles ({blockers.length}) :
              </span>
              {blockers.map((b) => {
                const meta = ONEPIECE_BASE_SET_BY_ID.get(b.cardId);
                return (
                  <button
                    key={b.uid}
                    onClick={() =>
                      send({ type: "op-block", blockerUid: b.uid })
                    }
                    className="rounded-md border border-sky-400/60 bg-sky-500/15 px-3 py-1.5 text-sm font-semibold text-sky-100 hover:bg-sky-500/25"
                  >
                    🛡️ Bloquer avec {meta?.name ?? "?"}
                  </button>
                );
              })}
            </div>
          )}
          {(counterCards.length > 0 || counterEvents.length > 0) && (
            <div className="flex w-full flex-wrap gap-2">
              <span className="self-center text-[10px] uppercase tracking-widest text-emerald-300">
                Counter / Évent [Contre] ({counterCards.length + counterEvents.length}) :
              </span>
              {counterCards.map((c) => {
                const counterValue =
                  c.meta && "counter" in c.meta ? c.meta.counter ?? 0 : 0;
                return (
                  <button
                    key={`counter-${c.i}`}
                    onClick={() =>
                      send({ type: "op-counter", handIndex: c.i })
                    }
                    className="rounded-md border border-emerald-400/60 bg-emerald-500/15 px-3 py-1.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25"
                  >
                    ⚡ {c.meta?.name} (+{counterValue.toLocaleString("fr-FR")})
                  </button>
                );
              })}
              {counterEvents.map((c) => (
                <button
                  key={`countevt-${c.i}`}
                  onClick={() =>
                    send({ type: "op-play-counter-event", handIndex: c.i })
                  }
                  className="rounded-md border border-violet-400/60 bg-violet-500/15 px-3 py-1.5 text-sm font-semibold text-violet-100 hover:bg-violet-500/25"
                  title={c.meta?.effect ?? ""}
                >
                  ⚔️ {c.meta?.name}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => send({ type: "op-pass-defense" })}
            className="ml-auto rounded-md border border-rose-400/60 bg-rose-500/15 px-3 py-1.5 text-sm font-semibold text-rose-100 hover:bg-rose-500/25"
          >
            ➡️ Laisser passer
          </button>
        </div>
      )}
    </motion.div>
  );
}

/** Panel de résolution d'un Trigger révélé par une Vie. Affiche la carte
 *  source en grand pour que le joueur sache exactement de quoi il décide. */
function TriggerPanel({
  trigger,
  send,
}: {
  trigger: import("@shared/types").OnePieceBattlePendingTrigger;
  send: (msg: import("@shared/types").OnePieceBattleClientMessage) => void;
}) {
  const meta = ONEPIECE_BASE_SET_BY_ID.get(trigger.cardId);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-start gap-3 rounded-md border border-fuchsia-400/60 bg-fuchsia-500/10 p-3 text-fuchsia-100 shadow-[0_0_25px_rgba(217,70,239,0.3)]"
    >
      {meta && (
        <CardPreview
          cardId={meta.id}
          imageUrl={meta.image}
          name={meta.name}
          effect={meta.effect}
          trigger={meta.trigger}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={meta.image}
            alt={meta.name}
            className="h-32 w-24 shrink-0 rounded border-2 border-fuchsia-400/60 object-contain shadow-lg"
          />
        </CardPreview>
      )}
      <div className="flex-1">
        <div className="text-sm font-bold">
          🎴 Vie révélée — Trigger disponible
        </div>
        <div className="mt-1 text-base font-semibold text-fuchsia-50">
          {meta?.name ?? "?"}
        </div>
        <div className="mt-1 rounded bg-black/30 px-2 py-1.5 text-xs italic text-fuchsia-100/90">
          {trigger.trigger}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => send({ type: "op-trigger-resolve", activate: true })}
            className="rounded-md border border-emerald-400/60 bg-emerald-500/15 px-3 py-1.5 text-sm font-bold text-emerald-100 hover:bg-emerald-500/25"
          >
            ✨ Activer le Trigger
          </button>
          <button
            onClick={() => send({ type: "op-trigger-resolve", activate: false })}
            className="rounded-md border border-zinc-400/50 bg-zinc-500/10 px-3 py-1.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-500/20"
          >
            ❌ Passer
          </button>
        </div>
        <div className="mt-1 text-[10px] text-fuchsia-200/60">
          La carte ira en main quoi qu&apos;il arrive.
        </div>
      </div>
    </motion.div>
  );
}

/** Panel de résolution d'un PendingChoice — ciblage Persos/Leader/main
 *  selon le `kind` du choix. Envoie `op-resolve-choice` avec la sélection
 *  ou `skipped: true` si le joueur passe. */
function PendingChoicePanel({
  choice,
  state,
  send,
}: {
  choice: import("@shared/types").OnePiecePendingChoice;
  state: OnePieceBattleState;
  send: (msg: import("@shared/types").OnePieceBattleClientMessage) => void;
}) {
  const opponent = state.opponent;
  const self = state.self;
  const maxCost =
    typeof choice.params.maxCost === "number" ? choice.params.maxCost : null;
  const maxPower =
    typeof choice.params.maxPower === "number" ? choice.params.maxPower : null;
  const onlyRested = choice.params.onlyRested === true;
  const onlyOwnType =
    typeof choice.params.requireType === "string"
      ? choice.params.requireType
      : null;
  const excludeName =
    typeof choice.params.excludeName === "string"
      ? choice.params.excludeName
      : null;
  const requireTrigger = choice.params.requireTrigger === true;
  // Filtre couleur (Sengoku "Marine noire", Smoker "Marine noire",
  // Luffytaro "Chapeau de paille violette"). Match par sous-string sur
  // meta.color (ex. "noir", "bleu", "rouge", "vert", "violet", "jaune").
  const requireColor =
    typeof choice.params.requireColor === "string"
      ? choice.params.requireColor
      : null;
  const discardCount =
    typeof choice.params.count === "number" ? choice.params.count : 1;
  const allowLeader = choice.params.allowLeader !== false;

  function pickTarget(uid: string) {
    send({
      type: "op-resolve-choice",
      choiceId: choice.id,
      skipped: false,
      selection: { targetUid: uid },
    });
  }
  function skip() {
    send({
      type: "op-resolve-choice",
      choiceId: choice.id,
      skipped: true,
    });
  }
  function answer(yesNo: boolean) {
    send({
      type: "op-resolve-choice",
      choiceId: choice.id,
      skipped: false,
      selection: { yesNo },
    });
  }

  // Identifie la carte source si possible (meta cherché par cardNumber).
  const sourceMeta = (() => {
    if (!choice.sourceCardNumber) return null;
    // ONEPIECE_BASE_SET_BY_ID est par cardId, mais on a un cardNumber.
    // Cherche manuellement dans le set (rare, OK pour ce panel).
    for (const c of ONEPIECE_BASE_SET_BY_ID.values()) {
      if (c.cardNumber === choice.sourceCardNumber) return c;
    }
    return null;
  })();

  return (
    <div className="flex items-start gap-3 rounded-md border border-amber-400/60 bg-amber-400/10 p-3 text-amber-100">
      {sourceMeta && (
        <CardPreview
          cardId={sourceMeta.id}
          imageUrl={sourceMeta.image}
          name={sourceMeta.name}
          effect={sourceMeta.effect}
          trigger={sourceMeta.trigger}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sourceMeta.image}
            alt={sourceMeta.name}
            className="h-28 w-20 shrink-0 rounded border-2 border-amber-400/60 object-contain shadow-lg"
          />
        </CardPreview>
      )}
      <div className="flex-1">
      <div className="text-sm font-bold">
        🎯 Effet en cours — choix requis
      </div>
      {sourceMeta && (
        <div className="mt-0.5 text-xs text-amber-200/80">
          Source : <span className="font-semibold">{sourceMeta.name}</span>
        </div>
      )}
      <div className="mt-1 text-sm">{choice.prompt}</div>

      {/* KO Persos adverse */}
      {choice.kind === "ko-character" && opponent && (
        <div className="mt-2 flex flex-wrap gap-2">
          {opponent.characters
            .filter((c) => {
              const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
              if (!meta || !("cost" in meta)) return false;
              if (
                maxCost !== null &&
                meta.cost + (c.costBuff ?? 0) > maxCost
              )
                return false;
              if (maxPower !== null) {
                const power =
                  ("power" in meta ? meta.power : 0) + c.attachedDon * 1000;
                if (power > maxPower) return false;
              }
              if (onlyRested && !c.rested) return false;
              // requireTrigger : ne montre que les Persos dont le cardId
              // a une carte trigger != null en base (ex. Ice Block Partisan).
              if (requireTrigger && !meta.trigger) return false;
              return true;
            })
            .map((c) => {
              const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
              return (
                <button
                  key={c.uid}
                  onClick={() => pickTarget(c.uid)}
                  className="rounded-md border border-rose-500/50 bg-rose-500/10 px-2 py-1 text-rose-100 hover:bg-rose-500/20"
                >
                  💥 KO {meta?.name ?? c.cardId}
                </button>
              );
            })}
        </div>
      )}

      {/* Réorganiser top N + placer top/bottom (Hancock) */}
      {choice.kind === "reorder-top-deck" && (
        <ReorderTopDeckPicker
          peeked={(() => {
            const raw = choice.params.peeked;
            return typeof raw === "string"
              ? raw.split(",").filter((x) => x.length > 0)
              : [];
          })()}
          onConfirm={(reorderTopDeck) =>
            send({
              type: "op-resolve-choice",
              choiceId: choice.id,
              skipped: false,
              selection: { reorderTopDeck },
            })
          }
        />
      )}

      {/* KO ≤ N Persos adv avec contrainte power combinée (Disparais) */}
      {choice.kind === "ko-multi-combined-power" && opponent && (
        <KoMultiCombinedPowerPicker
          opponentChars={opponent.characters}
          maxN={
            typeof choice.params.maxN === "number" ? choice.params.maxN : 2
          }
          maxCombinedPower={
            typeof choice.params.maxCombinedPower === "number"
              ? choice.params.maxCombinedPower
              : 4000
          }
          onConfirm={(targetUids) =>
            send({
              type: "op-resolve-choice",
              choiceId: choice.id,
              skipped: false,
              selection: { targetUids },
            })
          }
        />
      )}

      {/* KO mon propre Persos */}
      {choice.kind === "ko-character-own" && self && (
        <div className="mt-2 flex flex-wrap gap-2">
          {self.characters.map((c) => {
            const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
            return (
              <button
                key={c.uid}
                onClick={() => pickTarget(c.uid)}
                className="rounded-md border border-rose-500/50 bg-rose-500/10 px-2 py-1 text-rose-100 hover:bg-rose-500/20"
              >
                💥 KO {meta?.name ?? c.cardId}
              </button>
            );
          })}
        </div>
      )}

      {/* Buff un de mes Leader/Persos */}
      {choice.kind === "buff-target" && self && (
        <div className="mt-2 flex flex-wrap gap-2">
          {allowLeader && self.leader && (
            <button
              onClick={() => pickTarget("leader")}
              className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-emerald-100 hover:bg-emerald-500/20"
            >
              ⬆️ Leader
            </button>
          )}
          {self.characters
            .filter((c) => {
              const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
              if (!meta) return false;
              if (
                maxCost !== null &&
                "cost" in meta &&
                meta.cost + (c.costBuff ?? 0) > maxCost
              )
                return false;
              if (
                onlyOwnType &&
                !meta.types.some((t) =>
                  t.toLowerCase().includes(onlyOwnType.toLowerCase()),
                )
              )
                return false;
              if (onlyRested && !c.rested) return false;
              return true;
            })
            .map((c) => {
              const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
              return (
                <button
                  key={c.uid}
                  onClick={() => pickTarget(c.uid)}
                  className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-emerald-100 hover:bg-emerald-500/20"
                >
                  ⬆️ {meta?.name ?? c.cardId}
                </button>
              );
            })}
        </div>
      )}

      {/* Sélection cible générique (Leader ou Persos adverse) */}
      {choice.kind === "select-target" && opponent && (
        <div className="mt-2 flex flex-wrap gap-2">
          {allowLeader && opponent.leader && (
            <button
              onClick={() => pickTarget("leader")}
              className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-amber-100 hover:bg-amber-500/20"
            >
              🎯 Leader adverse
            </button>
          )}
          {opponent.characters
            .filter((c) => {
              const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
              if (!meta) return false;
              if (
                maxCost !== null &&
                "cost" in meta &&
                meta.cost + (c.costBuff ?? 0) > maxCost
              )
                return false;
              if (maxPower !== null) {
                const power =
                  ("power" in meta ? meta.power : 0) + c.attachedDon * 1000;
                if (power > maxPower) return false;
              }
              if (onlyRested && !c.rested) return false;
              return true;
            })
            .map((c) => {
              const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
              return (
                <button
                  key={c.uid}
                  onClick={() => pickTarget(c.uid)}
                  className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-amber-100 hover:bg-amber-500/20"
                >
                  🎯 {meta?.name ?? c.cardId}
                </button>
              );
            })}
        </div>
      )}

      {/* Défausser N cartes de la main */}
      {choice.kind === "discard-card" && self && (
        <DiscardCardPicker
          hand={self.hand}
          count={discardCount}
          requireTrigger={requireTrigger}
          requireType={onlyOwnType}
          requireColor={requireColor}
          excludeName={excludeName}
          onConfirm={(handIndices) =>
            send({
              type: "op-resolve-choice",
              choiceId: choice.id,
              skipped: false,
              selection: { handIndices },
            })
          }
        />
      )}

      {/* Jouer 1 Persos de la défausse gratuitement (Gecko Moria, Sanji on-ko) */}
      {choice.kind === "play-from-discard" && self && (
        <div className="mt-2 flex flex-wrap gap-2">
          {self.discard
            .map((cardId, i) => ({ cardId, i }))
            .filter(({ cardId }) => {
              const meta = ONEPIECE_BASE_SET_BY_ID.get(cardId);
              if (!meta || meta.kind !== "character") return false;
              if (maxCost !== null && meta.cost > maxCost) return false;
              if (excludeName && meta.name === excludeName) return false;
              if (
                onlyOwnType &&
                !meta.types.some((t) =>
                  t.toLowerCase().includes(onlyOwnType.toLowerCase()),
                )
              )
                return false;
              if (
                requireColor &&
                !meta.color.some((c) =>
                  c.toLowerCase().includes(requireColor.toLowerCase()),
                )
              )
                return false;
              return true;
            })
            .map(({ cardId, i }) => {
              const meta = ONEPIECE_BASE_SET_BY_ID.get(cardId);
              return (
                <button
                  key={`${cardId}-${i}`}
                  onClick={() =>
                    send({
                      type: "op-resolve-choice",
                      choiceId: choice.id,
                      skipped: false,
                      selection: { handIndices: [i] },
                    })
                  }
                  className="rounded-md border border-purple-500/50 bg-purple-500/10 px-2 py-1 text-purple-100 hover:bg-purple-500/20"
                >
                  ♻️ {meta?.name ?? cardId}
                </button>
              );
            })}
        </div>
      )}

      {/* Jouer 1 Persos de la main gratuitement (Crocodile, Lim, Baggy…) */}
      {choice.kind === "play-from-hand" && self && (
        <div className="mt-2 flex flex-wrap gap-2">
          {self.hand
            .map((cardId, i) => ({ cardId, i }))
            .filter(({ cardId }) => {
              const meta = ONEPIECE_BASE_SET_BY_ID.get(cardId);
              if (!meta || meta.kind !== "character") return false;
              if (maxCost !== null && meta.cost > maxCost) return false;
              if (excludeName && meta.name === excludeName) return false;
              if (
                onlyOwnType &&
                !meta.types.some((t) =>
                  t.toLowerCase().includes(onlyOwnType.toLowerCase()),
                )
              )
                return false;
              if (
                requireColor &&
                !meta.color.some((c) =>
                  c.toLowerCase().includes(requireColor.toLowerCase()),
                )
              )
                return false;
              return true;
            })
            .map(({ cardId, i }) => {
              const meta = ONEPIECE_BASE_SET_BY_ID.get(cardId);
              return (
                <button
                  key={i}
                  onClick={() =>
                    send({
                      type: "op-resolve-choice",
                      choiceId: choice.id,
                      skipped: false,
                      selection: { handIndices: [i] },
                    })
                  }
                  className="rounded-md border border-cyan-500/50 bg-cyan-500/10 px-2 py-1 text-cyan-100 hover:bg-cyan-500/20"
                >
                  ▶️ Jouer {meta?.name ?? cardId}
                </button>
              );
            })}
        </div>
      )}

      {/* Select-option (Catarina Devon : Bloqueur / Double / Exil) */}
      {choice.kind === "select-option" && (
        <div className="mt-2 flex flex-wrap gap-2">
          {(() => {
            const raw = choice.params.options;
            const options =
              typeof raw === "string"
                ? raw.split("|").filter((x) => x.length > 0)
                : [];
            return options.map((opt) => (
              <button
                key={opt}
                onClick={() =>
                  send({
                    type: "op-resolve-choice",
                    choiceId: choice.id,
                    skipped: false,
                    selection: { selectedOption: opt },
                  })
                }
                className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-emerald-100 hover:bg-emerald-500/20"
              >
                {opt}
              </button>
            ));
          })()}
        </div>
      )}

      {/* Yes/No */}
      {choice.kind === "yes-no" && (
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => answer(true)}
            className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-emerald-100 hover:bg-emerald-500/20"
          >
            ✓ Oui
          </button>
          <button
            onClick={() => answer(false)}
            className="rounded-md border border-zinc-500/50 bg-zinc-500/10 px-3 py-1 text-zinc-100 hover:bg-zinc-500/20"
          >
            ✗ Non
          </button>
        </div>
      )}

      {/* Bouton passer (si cancellable) */}
      {choice.cancellable && (
        <button
          onClick={skip}
          className="mt-2 rounded-md border border-zinc-500/50 bg-zinc-500/10 px-3 py-1 text-zinc-200 hover:bg-zinc-500/20"
        >
          ❌ Passer
        </button>
      )}
      </div>
    </div>
  );
}

function DeadlineCountdown({ deadlineMs }: { deadlineMs: number | null }) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (deadlineMs == null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadlineMs]);
  // Si pas de deadline en cours : badge neutre "—" pour que le placement soit
  // toujours visible (évite que l'utilisateur cherche le timer).
  if (deadlineMs == null) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded bg-zinc-800/60 px-2 py-1 font-mono text-xs text-zinc-400"
        title="Pas de chrono actif"
      >
        ⏱ —
      </span>
    );
  }
  const remaining = Math.max(0, Math.floor((deadlineMs - now) / 1000));
  const urgent = remaining <= 10;
  return (
    <motion.span
      animate={
        urgent
          ? { scale: [1, 1.08, 1] }
          : {}
      }
      transition={{ duration: 0.5, repeat: urgent ? Infinity : 0 }}
      className={`inline-flex items-center gap-1 rounded px-2 py-1 font-mono text-sm font-bold tabular-nums ${
        urgent
          ? "bg-red-500/30 text-red-100 ring-2 ring-red-500/60"
          : remaining <= 30
            ? "bg-amber-500/20 text-amber-200"
            : "bg-zinc-800/60 text-zinc-200"
      }`}
      title="Compte à rebours anti-AFK"
    >
      ⏱ {remaining}s
    </motion.span>
  );
}

function ReorderTopDeckPicker({
  peeked,
  onConfirm,
}: {
  peeked: string[];
  onConfirm: (
    reorder: { cardId: string; placement: "top" | "bottom" }[],
  ) => void;
}) {
  const [placements, setPlacements] = useState<
    Record<string, "top" | "bottom">
  >(() => Object.fromEntries(peeked.map((c) => [c, "top" as const])));
  const [order, setOrder] = useState<string[]>(peeked);
  const allChosen = order.every((c) => !!placements[c]);
  return (
    <div className="mt-2">
      <div className="mb-1 text-[11px] text-amber-200/80">
        Réorganise dans l&apos;ordre. Pour chaque carte : place au-dessus
        (top) ou au-dessous (bottom) du deck.
      </div>
      <div className="flex flex-col gap-1">
        {order.map((cardId, i) => {
          const meta = ONEPIECE_BASE_SET_BY_ID.get(cardId);
          return (
            <div
              key={`${cardId}-${i}`}
              className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900/40 px-2 py-1 text-xs"
            >
              <span className="flex-1 text-zinc-200">
                {meta?.name ?? cardId}
              </span>
              <button
                onClick={() => {
                  if (i === 0) return;
                  const next = [...order];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  setOrder(next);
                }}
                disabled={i === 0}
                className="rounded border border-zinc-700 px-1 hover:bg-zinc-800 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                onClick={() => {
                  if (i === order.length - 1) return;
                  const next = [...order];
                  [next[i + 1], next[i]] = [next[i], next[i + 1]];
                  setOrder(next);
                }}
                disabled={i === order.length - 1}
                className="rounded border border-zinc-700 px-1 hover:bg-zinc-800 disabled:opacity-30"
              >
                ↓
              </button>
              <button
                onClick={() =>
                  setPlacements((p) => ({ ...p, [cardId]: "top" }))
                }
                className={`rounded border px-2 py-0.5 ${
                  placements[cardId] === "top"
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-100"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                ⬆ Top
              </button>
              <button
                onClick={() =>
                  setPlacements((p) => ({ ...p, [cardId]: "bottom" }))
                }
                className={`rounded border px-2 py-0.5 ${
                  placements[cardId] === "bottom"
                    ? "border-amber-500 bg-amber-500/20 text-amber-100"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                ⬇ Bottom
              </button>
            </div>
          );
        })}
      </div>
      <button
        disabled={!allChosen}
        onClick={() =>
          onConfirm(
            order.map((cardId) => ({
              cardId,
              placement: placements[cardId] ?? "top",
            })),
          )
        }
        className={`mt-2 rounded-md border px-3 py-1 ${
          allChosen
            ? "border-emerald-500 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30"
            : "border-zinc-700 bg-zinc-900/40 text-zinc-500"
        }`}
      >
        ✓ Confirmer
      </button>
    </div>
  );
}

function KoMultiCombinedPowerPicker({
  opponentChars,
  maxN,
  maxCombinedPower,
  onConfirm,
}: {
  opponentChars: OnePieceBattleCardInPlay[];
  maxN: number;
  maxCombinedPower: number;
  onConfirm: (targetUids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  function toggle(uid: string) {
    const next = new Set(selected);
    if (next.has(uid)) next.delete(uid);
    else if (next.size < maxN) next.add(uid);
    setSelected(next);
  }
  const combinedPower = Array.from(selected).reduce((sum, uid) => {
    const c = opponentChars.find((x) => x.uid === uid);
    if (!c) return sum;
    const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
    if (!meta || !("power" in meta)) return sum;
    return sum + meta.power + c.attachedDon * 1000;
  }, 0);
  const valid = selected.size > 0 && combinedPower <= maxCombinedPower;
  return (
    <div className="mt-2">
      <div className="mb-1 text-[11px] text-amber-200/80">
        Sélectionne ≤ {maxN} Persos avec power combiné ≤ {maxCombinedPower}{" "}
        ({selected.size} sélectionné(s), power combiné = {combinedPower}).
      </div>
      <div className="flex flex-wrap gap-1.5">
        {opponentChars.map((c) => {
          const meta = ONEPIECE_BASE_SET_BY_ID.get(c.cardId);
          const power = meta && "power" in meta ? meta.power : 0;
          const totalPower = power + c.attachedDon * 1000;
          const isSelected = selected.has(c.uid);
          return (
            <button
              key={c.uid}
              onClick={() => toggle(c.uid)}
              className={`rounded border px-2 py-1 text-xs ${
                isSelected
                  ? "border-rose-500 bg-rose-500/20 text-rose-100"
                  : "border-zinc-600 bg-zinc-900/40 text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {meta?.name ?? c.cardId} ({totalPower})
            </button>
          );
        })}
      </div>
      <button
        disabled={!valid}
        onClick={() => onConfirm(Array.from(selected))}
        className={`mt-2 rounded-md border px-3 py-1 ${
          valid
            ? "border-rose-500 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30"
            : "border-zinc-700 bg-zinc-900/40 text-zinc-500"
        }`}
      >
        💥 Confirmer KO ({selected.size} cible{selected.size > 1 ? "s" : ""})
      </button>
    </div>
  );
}

function DiscardCardPicker({
  hand,
  count,
  requireTrigger,
  requireType,
  requireColor,
  excludeName,
  onConfirm,
}: {
  hand: string[];
  count: number;
  requireTrigger: boolean;
  requireType: string | null;
  requireColor: string | null;
  excludeName: string | null;
  onConfirm: (handIndices: number[]) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  function toggle(i: number) {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else if (next.size < count) next.add(i);
    setSelected(next);
  }
  const eligibleIndices = hand
    .map((cardId, i) => ({ cardId, i }))
    .filter(({ cardId }) => {
      const meta = ONEPIECE_BASE_SET_BY_ID.get(cardId);
      if (!meta) return false;
      if (excludeName && meta.name === excludeName) return false;
      if (requireTrigger && !meta.trigger) return false;
      if (
        requireType &&
        !meta.types.some((t) =>
          t.toLowerCase().includes(requireType.toLowerCase()),
        )
      )
        return false;
      if (
        requireColor &&
        meta.kind !== "don" &&
        !meta.color.some((c: string) =>
          c.toLowerCase().includes(requireColor.toLowerCase()),
        )
      )
        return false;
      // Skip DON cards si filtre couleur (DON n'a pas de couleur).
      if (requireColor && meta.kind === "don") return false;
      return true;
    });

  return (
    <div className="mt-2">
      <div className="mb-1 text-[11px] text-amber-200/80">
        Sélectionne {count} carte{count > 1 ? "s" : ""}{" "}
        ({selected.size}/{count}){requireTrigger ? " avec [Déclenchement]" : ""}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {eligibleIndices.map(({ cardId, i }) => {
          const meta = ONEPIECE_BASE_SET_BY_ID.get(cardId);
          const isSelected = selected.has(i);
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              className={`overflow-hidden rounded border bg-black/40 ${
                isSelected
                  ? "border-amber-400 ring-2 ring-amber-400"
                  : "border-white/10"
              }`}
              title={meta?.name ?? cardId}
            >
              {meta && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={meta.image}
                  alt={meta.name}
                  className="h-20 w-14 object-contain"
                />
              )}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => onConfirm(Array.from(selected))}
        disabled={selected.size !== count}
        className="mt-2 rounded-md bg-amber-500 px-3 py-1 text-xs font-bold text-amber-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Défausser
      </button>
    </div>
  );
}
