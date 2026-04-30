"use client";

// Phase 3a : client minimaliste pour la connexion + affichage d'état brut.
// L'UI riche (board, hand, attaques, animations) viendra en 3b-3e.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatMessage,
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
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
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
        case "op-state":
          setState(msg.state);
          break;
        case "op-error":
          setErrorMsg(msg.message);
          break;
        case "chat":
          setChat((prev) => [...prev.slice(-29), msg.message]);
          break;
        case "op-trigger-reveal":
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

  function sendChat() {
    const text = chatDraft.trim();
    if (!text) return;
    send({ type: "chat", text });
    setChatDraft("");
  }

  function concede() {
    if (!confirm("Abandonner la partie ?")) return;
    send({ type: "op-concede" });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play/tcg/onepiece"
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← {game.name}
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>{game.name}</span>
          <span className="text-xs text-zinc-500">⚔️ Combat</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-widest text-zinc-300">
            Phase 3a — squelette
          </span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>

      <main
        className={`relative flex flex-1 flex-col gap-4 overflow-y-auto p-4 ${game.gradient}`}
      >
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

            {/* Vue board minimaliste : 2 zones (adversaire en haut, soi en bas). */}
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
                  <div className="grid gap-3 sm:grid-cols-2">
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
                    />
                  </div>
                );
              })()}

            {state && state.self && (
              <div className="rounded-md border border-white/10 bg-black/30 p-3">
                <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-widest text-zinc-400">
                  <span>Ma main ({state.self.handCount} cartes)</span>
                  {state.phase === "playing" &&
                    state.activeSeat === state.selfSeat &&
                    state.turnPhase === "main" && (
                      <span className="text-emerald-300">
                        💡 clique « Jouer » sur un Personnage pour le poser
                      </span>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {state.self.hand.map((cardId, i) => {
                    const meta = ONEPIECE_BASE_SET_BY_ID.get(cardId);
                    const canPlay =
                      meta?.kind === "character" &&
                      state.phase === "playing" &&
                      state.activeSeat === state.selfSeat &&
                      state.turnPhase === "main" &&
                      (state.self?.donActive ?? 0) >= meta.cost &&
                      (state.self?.characters.length ?? 0) <
                        ONEPIECE_BASE_SET_BY_ID.size;
                    return (
                      <div
                        key={`${cardId}-${i}`}
                        className="flex w-24 flex-col gap-1"
                      >
                        <div
                          className="overflow-hidden rounded border border-white/10 bg-zinc-950"
                          title={meta?.name ?? cardId}
                        >
                          {meta && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={meta.image}
                              alt={meta.name}
                              className="h-32 w-full object-contain"
                            />
                          )}
                        </div>
                        {meta?.kind === "character" && (
                          <button
                            onClick={() =>
                              send({
                                type: "op-play-character",
                                handIndex: i,
                              })
                            }
                            disabled={!canPlay}
                            className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                            title={
                              canPlay
                                ? `Jouer (coût ${meta.cost})`
                                : `Non jouable (coût ${meta.cost})`
                            }
                          >
                            ▶ Jouer ({meta.cost})
                          </button>
                        )}
                        {meta?.kind === "leader" && (
                          <span className="text-center text-[9px] text-rose-300">
                            Leader
                          </span>
                        )}
                        {(meta?.kind === "event" ||
                          meta?.kind === "stage") && (
                          <span className="text-center text-[9px] text-zinc-500">
                            {meta.kind} (Phase 3c-bis)
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Log + chat */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-white/10 bg-black/30 p-3">
                <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
                  Journal
                </div>
                <ul className="space-y-0.5 text-xs text-zinc-300">
                  {(state?.log ?? []).slice(-15).map((line, i) => (
                    <li key={i}>· {line}</li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-2 rounded-md border border-white/10 bg-black/30 p-3">
                <div className="text-[11px] uppercase tracking-widest text-zinc-400">
                  Chat
                </div>
                <ul className="flex-1 space-y-0.5 text-xs">
                  {chat.slice(-10).map((m) => (
                    <li key={m.id}>
                      <span className="text-zinc-500">{m.playerName}:</span>{" "}
                      <span className="text-zinc-200">{m.text}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <input
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sendChat();
                    }}
                    placeholder="Message…"
                    className="flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-rose-400/50 focus:outline-none"
                  />
                  <button
                    onClick={sendChat}
                    className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-200 hover:bg-white/10"
                  >
                    Envoyer
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3 text-[11px] text-amber-200">
              ⚠️ Combat en cours d&apos;implémentation — Phase 3a (squelette).
              Setup, mulligan, tours et combat arrivent en Phase 3b-3e.
            </div>
          </>
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
          <div className="flex items-center gap-3">
            {data.leader && (
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={() => {
                    if (targetMode && onPickTarget) {
                      // Le Leader adverse est toujours une cible valide.
                      onPickTarget("leader");
                    }
                  }}
                  disabled={!targetMode}
                  className={`relative w-20 overflow-hidden rounded border-2 transition-transform ${
                    data.leader.rested
                      ? "border-zinc-500/60 grayscale"
                      : "border-rose-400/60"
                  } ${
                    targetMode
                      ? "cursor-crosshair ring-2 ring-amber-400 hover:scale-105"
                      : "cursor-default"
                  } ${attackerSelected === "leader" && isSelf ? "ring-2 ring-emerald-400" : ""}`}
                >
                  {(() => {
                    const meta = ONEPIECE_BASE_SET_BY_ID.get(
                      data.leader.cardId,
                    );
                    return meta ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={meta.image}
                        alt={meta.name}
                        className={`h-28 w-full object-contain ${
                          data.leader.rested ? "rotate-90" : ""
                        }`}
                      />
                    ) : null;
                  })()}
                  {data.leader.attachedDon > 0 && (
                    <span className="absolute right-0 top-0 rounded-bl bg-amber-400 px-1 text-[9px] font-bold text-amber-950">
                      +{data.leader.attachedDon}
                    </span>
                  )}
                </button>
                {isSelf && canAttack && data.leader && !data.leader.rested && (
                  <button
                    onClick={() => onPickAttacker?.("leader")}
                    className="rounded border border-rose-500/40 bg-rose-500/10 px-1 py-0.5 text-[9px] text-rose-200 hover:bg-rose-500/20"
                  >
                    ⚔️ Attaquer
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-1 flex-col gap-1 text-[11px] text-zinc-300">
              <Stat label="Vies" value={`❤️ ${data.life}`} />
              <Stat
                label="DON"
                value={`${data.donActive} prêts · ${data.donRested} épuisés · ${data.donDeckSize} en deck`}
              />
              <Stat
                label="Deck / Main / Défausse"
                value={`${data.deckSize} / ${data.handCount} / ${data.discardSize}`}
              />
              <Stat
                label="Persos en jeu"
                value={`${data.characters.length} / 5`}
              />
              {isSelf && canAttachDon && data.leader && (
                <button
                  onClick={() =>
                    send({ type: "op-attach-don", targetUid: "leader" })
                  }
                  className="self-start rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200 hover:bg-amber-500/20"
                >
                  + DON au Leader
                </button>
              )}
              {isSelf && canAttachDon && data.leader &&
                hasKeywordClient(
                  ONEPIECE_BASE_SET_BY_ID.get(data.leader.cardId)?.effect,
                  "Activation\\s*:\\s*Principale",
                ) && (
                  <button
                    onClick={() =>
                      send({ type: "op-activate-main", uid: "leader" })
                    }
                    className="self-start rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] text-fuchsia-200 hover:bg-fuchsia-500/20"
                  >
                    ✨ Activer Leader
                  </button>
                )}
            </div>
          </div>

          {/* Persos en jeu */}
          {data.characters.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5 border-t border-white/5 pt-2">
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
                  <div
                    key={c.uid}
                    className={`flex w-20 flex-col gap-1 ${
                      c.rested ? "opacity-60" : ""
                    }`}
                    title={meta?.name ?? c.cardId}
                  >
                    <button
                      onClick={() => {
                        if (targetable && onPickTarget) onPickTarget(c.uid);
                      }}
                      disabled={!targetable}
                      className={`relative overflow-hidden rounded border bg-zinc-950 transition-transform ${
                        c.playedThisTurn
                          ? "border-amber-400/40"
                          : "border-white/10"
                      } ${
                        targetable
                          ? "cursor-crosshair ring-2 ring-amber-400 hover:scale-105"
                          : "cursor-default"
                      } ${isSelected ? "ring-2 ring-emerald-400" : ""}`}
                    >
                      {meta && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={meta.image}
                          alt={meta.name}
                          className={`h-24 w-full object-contain ${
                            c.rested ? "rotate-90" : ""
                          }`}
                        />
                      )}
                      <span className="absolute bottom-0 left-0 rounded-tr bg-black/80 px-1 text-[9px] text-amber-200">
                        {totalPower}
                      </span>
                      {c.attachedDon > 0 && (
                        <span className="absolute right-0 top-0 rounded-bl bg-amber-400 px-1 text-[9px] font-bold text-amber-950">
                          +{c.attachedDon}
                        </span>
                      )}
                    </button>
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
                  </div>
                );
              })}
            </div>
          )}
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

  // Cartes de la main avec Counter > 0.
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

  return (
    <div
      className={`rounded-md border p-3 text-xs ${
        isDefender
          ? "border-amber-400/60 bg-amber-400/10 text-amber-100"
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
          <button
            onClick={() => send({ type: "op-pass-defense" })}
            className="rounded-md border border-rose-400/50 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-100 hover:bg-rose-500/20"
          >
            ➡️ Laisser passer
          </button>
        </div>
      )}
    </div>
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

function DiscardCardPicker({
  hand,
  count,
  requireTrigger,
  excludeName,
  onConfirm,
}: {
  hand: string[];
  count: number;
  requireTrigger: boolean;
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
