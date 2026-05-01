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
          // Auto-clear après 6s pour ne pas surcharger l'UI.
          setTimeout(() => setRevealedTrigger(null), 6000);
          break;
      }
    });
    return () => {
      cancelled = true;
      ws.close();
      if (socketRef.current === ws) socketRef.current = null;
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
        className={`relative flex flex-1 flex-col gap-3 overflow-y-auto p-2 sm:gap-4 sm:p-4 ${game.gradient}`}
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
        <div className="relative z-10 flex flex-1 flex-col gap-3 sm:gap-4">
        {!profile ? (
          <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
            Connecte-toi pour rejoindre la partie.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Pill label="Room" value={roomId} />
              <Pill label="Connexion" value={status} />
              <Pill label="Siège" value={selfSeat ?? "—"} />
              <Pill label="Phase" value={state?.phase ?? "—"} />
              <Pill label="Tour" value={String(state?.turnNumber ?? 0)} />
              {state?.phase === "playing" &&
                state.activeSeat === state.selfSeat && (
                  <button
                    onClick={() => send({ type: "op-end-turn" })}
                    className="ml-auto rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-bold text-emerald-950 shadow hover:bg-emerald-400"
                  >
                    🏁 Fin de tour
                  </button>
                )}
              <a
                href="/play/tcg/onepiece/regles"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-amber-200 hover:bg-amber-400/20"
                title="Ouvre les règles dans un nouvel onglet"
              >
                📖 Règles
              </a>
              <button
                onClick={() => sfx.setEnabled(!sfx.enabled)}
                className="rounded-md border border-zinc-500/40 bg-zinc-500/10 px-2 py-1 text-zinc-300 hover:bg-zinc-500/20"
                title={sfx.enabled ? "Couper le son" : "Activer le son"}
              >
                {sfx.enabled ? "🔊" : "🔇"}
              </button>
              <button
                onClick={concede}
                className={
                  state?.phase === "playing" &&
                  state.activeSeat === state.selfSeat
                    ? "rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-rose-200 hover:bg-rose-500/20"
                    : "ml-auto rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-rose-200 hover:bg-rose-500/20"
                }
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

            {state?.phase === "playing" && (
              <div className="rounded-md border border-emerald-400/30 bg-emerald-400/5 p-3 text-xs text-emerald-200">
                ⚔️ Tour {state.turnNumber} ·{" "}
                {state.activeSeat === state.selfSeat
                  ? "à toi de jouer"
                  : "tour adverse"}{" "}
                · phase {state.turnPhase}
                {state.deadlineMs != null && (
                  <DeadlineCountdown deadlineMs={state.deadlineMs} />
                )}
                {attackerSelected && (
                  <span className="ml-2 text-amber-300">
                    🎯 Choisis une cible (Leader adverse ou Personnage épuisé) —{" "}
                    <button
                      onClick={() => setAttackerSelected(null)}
                      className="underline"
                    >
                      annuler
                    </button>
                  </span>
                )}
              </div>
            )}

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
              <div className="sticky bottom-0 -mx-2 mt-2 rounded-md border border-amber-400/30 bg-zinc-950/95 p-3 shadow-[0_-8px_32px_rgba(0,0,0,0.6)] backdrop-blur sm:-mx-4">
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
                <div className="flex flex-wrap gap-2">
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
                        className="flex w-16 flex-col gap-1 sm:w-20 md:w-24"
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
                              className="h-32 w-full rounded object-contain"
                            />
                          </CardPreview>
                        ) : (
                          <div className="rounded border border-white/10 bg-zinc-950 h-32" />
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
                            className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
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
                            className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1 py-0.5 text-[10px] text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
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
                            className="rounded border border-amber-500/30 bg-amber-500/5 px-1 py-0.5 text-center text-[9px] text-amber-300/80"
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
                            className="rounded border border-purple-500/40 bg-purple-500/10 px-1 py-0.5 text-[10px] text-purple-200 hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-40"
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
                          <span className="text-center text-[9px] text-rose-300">
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

            {/* Journal du combat (chat retiré : utiliser le chat global
                du site en sidebar). */}
            <div className="rounded-md border border-white/10 bg-black/30 p-3">
              <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
                Journal du combat
              </div>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs text-zinc-300">
                {(state?.log ?? []).slice(-30).map((line, i) => (
                  <li key={i} className="leading-relaxed">
                    · {line}
                  </li>
                ))}
              </ul>
            </div>

          </>
        )}
        </div>
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
      className={`flex flex-col gap-2 rounded-md border bg-black/30 p-3 ${
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
              return (
                <div className="flex flex-col items-center gap-1">
                  <CardPreview
                    cardId={leaderMeta.id}
                    imageUrl={leaderMeta.image}
                    name={leaderMeta.name}
                    effect={leaderMeta.effect}
                    className={`relative w-24 rounded-md border-2 transition-transform sm:w-28 md:w-32 ${
                      data.leader.rested
                        ? "border-zinc-500/60 grayscale"
                        : "border-rose-400/80 shadow-[0_0_24px_rgba(251,113,133,0.3)]"
                    } ${
                      targetMode
                        ? "cursor-crosshair ring-2 ring-amber-400 hover:scale-105"
                        : "cursor-default"
                    } ${attackerSelected === "leader" && isSelf ? "ring-2 ring-emerald-400" : ""}`}
                  >
                    <button
                      onClick={() => {
                        if (targetMode && onPickTarget) onPickTarget("leader");
                      }}
                      disabled={!targetMode}
                      className="block w-full"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={leaderMeta.image}
                        alt={leaderMeta.name}
                        className={`h-36 w-full rounded object-contain sm:h-40 md:h-44 ${
                          data.leader.rested ? "rotate-90" : ""
                        }`}
                      />
                      {/* Badge "LEADER" parchemin doré */}
                      <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-full border-2 border-amber-300/90 bg-gradient-to-br from-amber-400 to-amber-600 px-2 py-0.5 text-[8px] font-extrabold tracking-widest text-amber-950 shadow-md">
                        ⭐ LEADER
                      </div>
                      {data.leader.attachedDon > 0 && (
                        <motion.span
                          key={data.leader.attachedDon}
                          initial={{ scale: 1.5 }}
                          animate={{ scale: 1 }}
                          transition={{ duration: 0.3 }}
                          className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-amber-200 bg-gradient-to-br from-amber-300 to-amber-600 text-[10px] font-extrabold text-amber-950 shadow-lg"
                        >
                          +{data.leader.attachedDon}
                        </motion.span>
                      )}
                    </button>
                  </CardPreview>
                  {isSelf && canAttack && data.leader && !data.leader.rested && (
                    <button
                      onClick={() => onPickAttacker?.("leader")}
                      className="rounded border border-rose-500/40 bg-rose-500/10 px-1 py-0.5 text-[9px] text-rose-200 hover:bg-rose-500/20"
                    >
                      ⚔️ Attaquer
                    </button>
                  )}
                </div>
              );
            })()}
            <div className="flex flex-1 flex-col gap-2 text-[11px] text-zinc-300">
              {/* Vies : pile de cartes face-cachée */}
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase tracking-widest text-zinc-500">
                  Vie
                </span>
                <div className="flex h-7 items-center">
                  {Array.from({ length: data.life }).map((_, i) => (
                    <div
                      key={i}
                      className="-ml-2 h-7 w-5 rounded-sm border border-rose-500/60 bg-gradient-to-br from-rose-900 via-rose-700 to-rose-900 shadow-[inset_0_0_8px_rgba(0,0,0,0.5)] first:ml-0"
                      style={{ transform: `rotate(${(i - 1) * 1.5}deg)` }}
                      title={`Vie ${i + 1}`}
                    />
                  ))}
                  {data.life === 0 && (
                    <span className="text-rose-400 text-base">💀</span>
                  )}
                </div>
                <span className="text-rose-300 font-bold">{data.life}</span>
                {data.faceUpLifeCardIds.length > 0 && (
                  <span className="text-[9px] text-amber-300" title="Vies face-up">
                    👁 {data.faceUpLifeCardIds.length}
                  </span>
                )}
              </div>

              {/* DON : jetons dorés */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-widest text-zinc-500">
                  DON
                </span>
                <div className="flex flex-wrap items-center gap-0.5">
                  {Array.from({ length: data.donActive }).map((_, i) => (
                    <span
                      key={`act-${i}`}
                      className="inline-block h-3 w-3 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 ring-1 ring-amber-200 shadow-sm"
                      title="DON prête"
                    />
                  ))}
                  {Array.from({ length: data.donRested }).map((_, i) => (
                    <span
                      key={`rest-${i}`}
                      className="inline-block h-3 w-3 rounded-full bg-gradient-to-br from-zinc-500 to-zinc-700 ring-1 ring-zinc-400 shadow-sm opacity-60"
                      title="DON épuisée"
                    />
                  ))}
                </div>
                <span className="ml-1 text-[10px] text-zinc-400">
                  ({data.donActive}/{data.donActive + data.donRested + data.donDeckSize})
                </span>
              </div>

              {/* Deck / Défausse : piles 3D-ish */}
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-0.5" title={`${data.deckSize} cartes`}>
                  <div className="relative h-9 w-7">
                    <div className="absolute left-0.5 top-0.5 h-9 w-7 rounded-sm border border-indigo-500/40 bg-gradient-to-br from-indigo-900 to-indigo-950" />
                    <div className="absolute left-0 top-0 h-9 w-7 rounded-sm border border-indigo-500/60 bg-gradient-to-br from-indigo-800 via-indigo-900 to-indigo-950 flex items-center justify-center text-[8px] font-bold text-indigo-200">
                      {data.deckSize}
                    </div>
                  </div>
                  <span className="text-[8px] text-zinc-500">Deck</span>
                </div>
                <div className="flex flex-col items-center gap-0.5" title={`${data.discardSize} cartes`}>
                  <div className="relative h-9 w-7">
                    {data.discardSize > 0 && (
                      <div className="absolute left-0.5 top-0.5 h-9 w-7 rounded-sm border border-zinc-600/40 bg-zinc-800" />
                    )}
                    <div className="absolute left-0 top-0 h-9 w-7 rounded-sm border border-zinc-600/60 bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center text-[8px] font-bold text-zinc-300">
                      {data.discardSize}
                    </div>
                  </div>
                  <span className="text-[8px] text-zinc-500">Défausse</span>
                </div>
                <div className="flex flex-col items-center gap-0.5" title={`${data.handCount} cartes`}>
                  <div className="h-9 w-7 rounded-sm border border-emerald-600/60 bg-gradient-to-br from-emerald-800 to-emerald-950 flex items-center justify-center text-[8px] font-bold text-emerald-200">
                    {data.handCount}
                  </div>
                  <span className="text-[8px] text-zinc-500">Main</span>
                </div>
                <div className="ml-auto text-[10px] text-zinc-500">
                  {data.characters.length} / 5 Persos
                </div>
              </div>

              {isSelf && canAttachDon && data.leader && (
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() =>
                      send({ type: "op-attach-don", targetUid: "leader" })
                    }
                    className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200 hover:bg-amber-500/20"
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
                      className="rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] text-fuchsia-200 hover:bg-fuchsia-500/20"
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
                    className={`flex w-14 flex-col gap-1 sm:w-16 md:w-20 ${
                      c.rested ? "opacity-60" : ""
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
                        className={`relative rounded border bg-zinc-950 transition-transform ${
                          c.playedThisTurn
                            ? "border-amber-400/40"
                            : "border-white/10"
                        } ${
                          targetable
                            ? "cursor-crosshair ring-2 ring-amber-400 hover:scale-105"
                            : "cursor-default"
                        } ${isSelected ? "ring-2 ring-emerald-400" : ""}`}
                      >
                        <button
                          onClick={() => {
                            if (targetable && onPickTarget) onPickTarget(c.uid);
                          }}
                          disabled={!targetable}
                          className="block w-full"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={meta.image}
                            alt={meta.name}
                            className={`h-24 w-full rounded object-contain ${
                              c.rested ? "rotate-90" : ""
                            }`}
                          />
                          <span className="absolute bottom-0 left-0 rounded-tr bg-black/80 px-1 text-[9px] text-amber-200">
                            {totalPower}
                          </span>
                          {c.attachedDon > 0 && (
                            <motion.span
                              key={c.attachedDon}
                              initial={{ scale: 1.5, backgroundColor: "#fef3c7" }}
                              animate={{ scale: 1, backgroundColor: "#fbbf24" }}
                              transition={{ duration: 0.3 }}
                              className="absolute right-0 top-0 rounded-bl px-1 text-[9px] font-bold text-amber-950"
                            >
                              +{c.attachedDon}
                            </motion.span>
                          )}
                        </button>
                      </CardPreview>
                    ) : null}
                    {isSelf && canAttachDon && (
                      <button
                        onClick={() =>
                          send({ type: "op-attach-don", targetUid: c.uid })
                        }
                        className="rounded border border-amber-500/40 bg-amber-500/10 px-0.5 py-0.5 text-[9px] text-amber-200 hover:bg-amber-500/20"
                      >
                        + DON
                      </button>
                    )}
                    {canBeAttacker && (
                      <button
                        onClick={() => onPickAttacker?.(c.uid)}
                        className="rounded border border-rose-500/40 bg-rose-500/10 px-0.5 py-0.5 text-[9px] text-rose-200 hover:bg-rose-500/20"
                      >
                        ⚔️ Attaquer
                      </button>
                    )}
                    {isSelf && canAttachDon &&
                      hasKeywordClient(meta?.effect, "Activation\\s*:\\s*Principale") && (
                        <button
                          onClick={() =>
                            send({ type: "op-activate-main", uid: c.uid })
                          }
                          className="rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-0.5 py-0.5 text-[9px] text-fuchsia-200 hover:bg-fuchsia-500/20"
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-200 tabular-nums">{value}</span>
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

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.18 }}
      className={`rounded-md border p-3 text-xs ${
        isDefender
          ? "border-amber-400/60 bg-amber-400/10 text-amber-100 shadow-[0_0_25px_rgba(251,191,36,0.3)]"
          : "border-zinc-500/40 bg-black/40 text-zinc-300"
      }`}
    >
      <div className="font-semibold">
        ⚔️ Attaque en cours{isDefender ? " — à toi de défendre" : ""}
      </div>
      <div className="mt-1">
        Attaquant : <span className="font-bold">{attackerName}</span>{" "}
        ({att.attackerPower}) → cible :{" "}
        <span className="font-bold">
          {targetIsLeader ? "Leader" : "Personnage"}
        </span>{" "}
        ({totalDefenderPower}
        {att.defenderBoost > 0 ? ` = ${att.defenderBasePower}+${att.defenderBoost}` : ""}
        )
        {att.doubleAttack && (
          <span className="ml-2 text-rose-200">· Double Attaque</span>
        )}
      </div>
      <div className="mt-1 text-[11px]">
        Sans réaction : {wouldHit ? "❌ touche" : "✅ rate"}
      </div>

      {isDefender && (
        <div className="mt-2 flex flex-wrap gap-2">
          {blockers.map((b) => {
            const meta = ONEPIECE_BASE_SET_BY_ID.get(b.cardId);
            return (
              <button
                key={b.uid}
                onClick={() =>
                  send({ type: "op-block", blockerUid: b.uid })
                }
                className="rounded-md border border-sky-400/50 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-100 hover:bg-sky-500/20"
              >
                🛡️ Bloquer avec {meta?.name ?? "?"}
              </button>
            );
          })}
          {counterCards.map((c) => {
            const counterValue =
              c.meta && "counter" in c.meta ? c.meta.counter : 0;
            return (
              <button
                key={`counter-${c.i}`}
                onClick={() =>
                  send({ type: "op-counter", handIndex: c.i })
                }
                className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-500/20"
              >
                ⚡ Counter {c.meta?.name} (+{counterValue})
              </button>
            );
          })}
          {counterEvents.map((c) => (
            <button
              key={`countevt-${c.i}`}
              onClick={() =>
                send({ type: "op-play-counter-event", handIndex: c.i })
              }
              className="rounded-md border border-violet-400/50 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-100 hover:bg-violet-500/20"
              title={c.meta?.effect ?? ""}
            >
              ⚔️ Évent [Contre] {c.meta?.name}
            </button>
          ))}
          <button
            onClick={() => send({ type: "op-pass-defense" })}
            className="rounded-md border border-rose-400/50 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-100 hover:bg-rose-500/20"
          >
            ➡️ Laisser passer
          </button>
        </div>
      )}
    </motion.div>
  );
}

/** Panel de résolution d'un Trigger révélé par une Vie. */
function TriggerPanel({
  trigger,
  send,
}: {
  trigger: import("@shared/types").OnePieceBattlePendingTrigger;
  send: (msg: import("@shared/types").OnePieceBattleClientMessage) => void;
}) {
  const meta = ONEPIECE_BASE_SET_BY_ID.get(trigger.cardId);
  return (
    <div className="rounded-md border border-fuchsia-400/60 bg-fuchsia-500/10 p-3 text-xs text-fuchsia-100">
      <div className="font-semibold">
        🎴 Trigger révélé : {meta?.name ?? "?"}
      </div>
      <div className="mt-1 italic">{trigger.trigger}</div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => send({ type: "op-trigger-resolve", activate: true })}
          className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-3 py-1 text-emerald-100 hover:bg-emerald-500/20"
        >
          ✨ Activer
        </button>
        <button
          onClick={() => send({ type: "op-trigger-resolve", activate: false })}
          className="rounded-md border border-zinc-400/50 bg-zinc-500/10 px-3 py-1 text-zinc-100 hover:bg-zinc-500/20"
        >
          ❌ Passer
        </button>
      </div>
      <div className="mt-1 text-[10px] text-fuchsia-200/70">
        L&apos;effet n&apos;est pas exécuté par le moteur (descriptif). La carte
        est ajoutée à ta main quoi qu&apos;il arrive.
      </div>
    </div>
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

  return (
    <div className="rounded-md border border-amber-400/60 bg-amber-400/10 p-3 text-xs text-amber-100">
      <div className="font-semibold">🎯 Effet en cours — choix requis</div>
      <div className="mt-1">{choice.prompt}</div>

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
  );
}

function DeadlineCountdown({ deadlineMs }: { deadlineMs: number }) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, Math.floor((deadlineMs - now) / 1000));
  const urgent = remaining <= 10;
  return (
    <span
      className={`ml-2 inline-block rounded px-1.5 py-0.5 font-mono text-[10px] ${
        urgent
          ? "bg-red-500/20 text-red-200"
          : "bg-zinc-800/60 text-zinc-300"
      }`}
      title="Compte à rebours anti-AFK"
    >
      ⏱ {remaining}s
    </span>
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
        Réorganise dans l'ordre. Pour chaque carte : place au-dessus (top)
        ou au-dessous (bottom) du deck.
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
