"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  BattleCard,
  BattleClientMessage,
  BattlePlayerPublicState,
  BattleSeatId,
  BattleSelfState,
  BattleServerMessage,
  BattleState,
  ChatMessage,
  PokemonCardData,
  PokemonEnergyType,
  TcgGameId,
} from "@shared/types";
import { BATTLE_CONFIG, TCG_GAMES } from "@shared/types";
import { POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { useRegisterProximityChat } from "@/app/play/proximity-chat-context";
import { CardFace, CardZoomModal } from "../../_components/card-visuals";

type ConnStatus = "connecting" | "connected" | "disconnected";

const TYPE_BG: Record<PokemonEnergyType, string> = {
  fire: "from-orange-500/30 to-red-700/40",
  water: "from-blue-400/30 to-blue-700/40",
  grass: "from-emerald-400/30 to-emerald-700/40",
  lightning: "from-yellow-400/30 to-yellow-600/40",
  psychic: "from-fuchsia-400/30 to-purple-700/40",
  fighting: "from-amber-700/30 to-stone-700/40",
  darkness: "from-zinc-700/40 to-slate-900/60",
  metal: "from-slate-300/20 to-slate-500/30",
  dragon: "from-amber-400/30 to-violet-700/40",
  fairy: "from-pink-300/30 to-rose-500/40",
  colorless: "from-zinc-300/20 to-zinc-500/30",
};

export function BattleClient({
  profile,
  gameId,
  roomId,
  deckId,
}: {
  profile: Profile | null;
  gameId: TcgGameId;
  roomId: string;
  deckId: string;
}) {
  const game = TCG_GAMES[gameId];
  const cardById = POKEMON_BASE_SET_BY_ID;
  const wsRef = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [state, setState] = useState<BattleState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [questToast, setQuestToast] = useState<{
    botWins: number;
    granted: boolean;
  } | null>(null);
  // Chat propre à la table de combat — éphémère (la room PartyKit
  // hiberne quand vide). Exposé en "proximity" via le sidebar global.
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

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
    const url = `${scheme}://${partyHost}/parties/battle/${roomId}?${params.toString()}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.addEventListener("open", () => setStatus("connected"));
    ws.addEventListener("close", () => setStatus("disconnected"));
    ws.addEventListener("error", () => setStatus("disconnected"));
    ws.addEventListener("message", (e) => {
      if (cancelled) return;
      let msg: BattleServerMessage;
      try {
        msg = JSON.parse(e.data as string) as BattleServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "battle-welcome":
          setErrorMsg(null);
          break;
        case "battle-state":
          setState(msg.state);
          setErrorMsg(null);
          break;
        case "battle-error":
          setErrorMsg(msg.message);
          break;
        case "battle-quest-reward":
          setQuestToast({ botWins: msg.botWins, granted: msg.granted });
          break;
        case "chat":
          setChatMessages((prev) => [...prev.slice(-49), msg.message]);
          break;
      }
    });
    return () => {
      cancelled = true;
      ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [profile, gameId, roomId, deckId]);

  const send = useCallback((msg: BattleClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  const setActive = (handIndex: number) =>
    send({ type: "battle-set-active", handIndex });
  const addToBench = (handIndex: number) =>
    send({ type: "battle-add-bench", handIndex });
  const removeFromBench = (benchIndex: number) =>
    send({ type: "battle-remove-bench", benchIndex });
  const confirmSetup = () => send({ type: "battle-confirm-setup" });
  const playBasic = (handIndex: number) =>
    send({ type: "battle-play-basic", handIndex });
  const attachEnergy = (targetUid: string) =>
    send({ type: "battle-attach-energy", targetUid });
  const evolve = (handIndex: number, targetUid: string) =>
    send({ type: "battle-evolve", handIndex, targetUid });
  const retreat = (benchIndex: number) =>
    send({ type: "battle-retreat", benchIndex });
  const attack = (attackIndex: number) =>
    send({ type: "battle-attack", attackIndex });
  const promoteActive = (benchIndex: number) =>
    send({ type: "battle-promote-active", benchIndex });
  const playTrainer = (handIndex: number, targetUid?: string | null) =>
    send({ type: "battle-play-trainer", handIndex, targetUid });
  const endTurn = () => send({ type: "battle-end-turn" });
  const sendChat = useCallback(
    (text: string) => send({ type: "chat", text }),
    [send],
  );

  // Pousse le chat de la table dans le sidebar global (onglet "Combat").
  useRegisterProximityChat({
    label: "Combat",
    messages: chatMessages,
    onSend: sendChat,
    enabled: status === "connected",
  });

  const concede = () => {
    if (!confirm("Abandonner la partie ?")) return;
    send({ type: "battle-concede" });
  };

  const isMyTurn = !!state && state.activeSeat === state.selfSeat;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href={lobbyHref(gameId, roomId)}
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Lobby
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>
            {game.name} · battle
          </span>
          {state && (
            <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-zinc-300">
              {phaseLabel(state.phase)}
              {state.phase === "playing" &&
                ` · tour ${state.turnNumber} · ${
                  isMyTurn ? "à toi" : `à ${state.opponent?.username ?? "adversaire"}`
                }`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <StatusIndicator status={status} />
          {state && state.phase !== "ended" && (
            <button
              onClick={concede}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:bg-rose-500/20 hover:text-rose-200"
            >
              Abandonner
            </button>
          )}
          {profile ? <UserPill profile={profile} variant="play" /> : null}
        </div>
      </header>

      {!profile && (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
          Connecte-toi avec Discord pour rejoindre la partie.
        </div>
      )}

      {profile && state && (
        <main className="flex flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.05),transparent_70%)]">
          {state.phase === "waiting" && (
            <div className="flex flex-1 items-center justify-center text-center text-sm text-zinc-300">
              <div>
                ⏳ En attente du second joueur…
                <div className="mt-2 text-xs text-zinc-500">
                  Partage l&apos;URL avec un ami pour qu&apos;il rejoigne, ou
                  attends qu&apos;un autre joueur entre via le lobby.
                </div>
              </div>
            </div>
          )}

          {(state.phase === "setup" ||
            state.phase === "playing" ||
            state.phase === "ended") && (
            <BattleBoard
              state={state}
              cardById={cardById}
              isMyTurn={isMyTurn}
              gameId={gameId}
              roomId={roomId}
              onSetActive={setActive}
              onAddBench={addToBench}
              onRemoveBench={removeFromBench}
              onConfirmSetup={confirmSetup}
              onEndTurn={endTurn}
              onPlayBasic={playBasic}
              onAttachEnergy={attachEnergy}
              onEvolve={evolve}
              onRetreat={retreat}
              onAttack={attack}
              onPromoteActive={promoteActive}
              onPlayTrainer={playTrainer}
            />
          )}

          {errorMsg && (
            <div className="border-t border-rose-500/40 bg-rose-500/10 px-3 py-2 text-center text-xs text-rose-300">
              {errorMsg}
            </div>
          )}

          {questToast && (
            <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-100 shadow-2xl backdrop-blur-md">
              {questToast.granted ? (
                <>
                  🎁 <strong>Quête complétée !</strong> +1 booster gratuit
                  ajouté à ta collection.
                </>
              ) : (
                <>
                  🎯 Victoire enregistrée — {questToast.botWins} / 3 wins
                  aujourd&apos;hui.
                </>
              )}
              <button
                onClick={() => setQuestToast(null)}
                className="ml-3 text-emerald-300 hover:text-emerald-100"
              >
                ✕
              </button>
            </div>
          )}
        </main>
      )}
    </div>
  );
}

function lobbyHref(gameId: string, roomId: string): string {
  if (roomId.startsWith("bot-")) return `/play/tcg/${gameId}/battle/bot`;
  if (roomId.startsWith("ranked-")) return `/play/tcg/${gameId}/battle/ranked`;
  return `/play/tcg/${gameId}/battle/pvp`;
}

function phaseLabel(p: BattleState["phase"]): string {
  switch (p) {
    case "waiting":
      return "en attente";
    case "setup":
      return "préparation";
    case "playing":
      return "en cours";
    case "ended":
      return "terminée";
  }
}

// ─── Board ────────────────────────────────────────────────────────────────

function BattleBoard({
  state,
  cardById,
  isMyTurn,
  gameId,
  roomId,
  onSetActive,
  onAddBench,
  onRemoveBench,
  onConfirmSetup,
  onEndTurn,
  onPlayBasic,
  onAttachEnergy,
  onEvolve,
  onRetreat,
  onAttack,
  onPromoteActive,
  onPlayTrainer,
}: {
  state: BattleState;
  cardById: Map<string, PokemonCardData>;
  isMyTurn: boolean;
  gameId: string;
  roomId: string;
  onSetActive: (handIndex: number) => void;
  onAddBench: (handIndex: number) => void;
  onRemoveBench: (benchIndex: number) => void;
  onConfirmSetup: () => void;
  onEndTurn: () => void;
  onPlayBasic: (handIndex: number) => void;
  onAttachEnergy: (targetUid: string) => void;
  onEvolve: (handIndex: number, targetUid: string) => void;
  onRetreat: (benchIndex: number) => void;
  onAttack: (attackIndex: number) => void;
  onPromoteActive: (benchIndex: number) => void;
  onPlayTrainer: (handIndex: number, targetUid?: string | null) => void;
}) {
  // Mode "attach energy" : Pocket génère 1 énergie automatique par tour. Si
  // pendingEnergy est définie côté serveur et qu'aucune attache n'a encore eu
  // lieu ce tour, le joueur peut activer ce mode pour cliquer sur un Pokémon
  // (Actif ou Banc) afin d'y attacher l'énergie.
  const [attachEnergyMode, setAttachEnergyMode] = useState(false);
  const [pendingEvolveIdx, setPendingEvolveIdx] = useState<number | null>(null);
  // Mode "Potion target picker" — quand le joueur clique sur Potion dans sa
  // main, on attend qu'il choisisse un Pokémon de son côté à soigner.
  const [pendingTrainerIdx, setPendingTrainerIdx] = useState<number | null>(
    null,
  );
  const [zoomedCard, setZoomedCard] = useState<PokemonCardData | null>(null);
  // Carte sous le curseur (main ou board) → preview en grand dans la sidebar.
  const [hoveredCard, setHoveredCard] = useState<PokemonCardData | null>(null);
  const cancelPending = () => {
    setAttachEnergyMode(false);
    setPendingEvolveIdx(null);
    setPendingTrainerIdx(null);
  };
  const promptPromote = state.self?.mustPromoteActive;
  const attachModeHandler = attachEnergyMode
    ? (uid: string) => {
        onAttachEnergy(uid);
        setAttachEnergyMode(false);
      }
    : pendingEvolveIdx !== null
      ? (uid: string) => {
          onEvolve(pendingEvolveIdx, uid);
          setPendingEvolveIdx(null);
        }
      : pendingTrainerIdx !== null
        ? (uid: string) => {
            onPlayTrainer(pendingTrainerIdx, uid);
            setPendingTrainerIdx(null);
          }
        : null;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar gauche : preview de la carte hover OU log de match. */}
      <RecapSidebar log={state.log} hoveredCard={hoveredCard} />

      {/* Centre : 2 colonnes côte à côte (joueur à gauche, adversaire à droite)
          + hand pleine largeur en bas. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {promptPromote && (
          <div className="border-b border-amber-400/40 bg-amber-400/10 p-2 text-center text-sm text-amber-200">
            Ton Pokémon Actif a été mis K.O. Choisis un Pokémon de ton Banc.
          </div>
        )}

        <div className="flex min-h-0 flex-1 gap-4 overflow-y-auto p-4">
          {/* ── Colonne joueur (gauche) — vertical : info → KO → board → contrôles ── */}
          {state.self && (
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <PlayerInfo player={state.self} isOpponent={false} />
              <BackRow
                koCount={state.self.koCount}
                deckSize={state.self.deckSize}
                discardCount={state.self.discardCount}
                handCount={state.self.handCount}
              />
              <BoardArea
                active={state.self.active}
                bench={state.self.bench}
                cardById={cardById}
                isOpponent={false}
                onZoomCard={setZoomedCard}
                onHoverCard={setHoveredCard}
                attachMode={attachModeHandler}
                promoteMode={promptPromote ?? false}
                onPromote={onPromoteActive}
                onRetreat={
                  state.phase === "playing" &&
                  isMyTurn &&
                  !state.self.hasRetreatedThisTurn &&
                  !state.self.mustPromoteActive
                    ? onRetreat
                    : null
                }
              />
              <SelfControls
                state={state}
                isMyTurn={isMyTurn}
                cardById={cardById}
                onConfirmSetup={onConfirmSetup}
                onEndTurn={onEndTurn}
                onAttack={onAttack}
                attachEnergyMode={attachEnergyMode}
                pendingEvolveIdx={pendingEvolveIdx}
                pendingTrainerIdx={pendingTrainerIdx}
                onActivateAttachMode={() => setAttachEnergyMode(true)}
              />
              {(attachEnergyMode ||
                pendingEvolveIdx !== null ||
                pendingTrainerIdx !== null) && (
                <div className="flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-xs text-amber-200">
                  {attachEnergyMode
                    ? "Choisis un Pokémon à qui attacher l'Énergie."
                    : pendingEvolveIdx !== null
                      ? "Choisis le Pokémon à faire évoluer."
                      : "Choisis le Pokémon à soigner avec la Potion."}
                  <button
                    onClick={cancelPending}
                    className="ml-auto rounded border border-white/10 bg-white/5 px-2 py-0.5 text-zinc-200 hover:bg-white/10"
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Séparateur vertical */}
          <div className="w-px shrink-0 self-stretch bg-white/10" />

          {/* ── Colonne adversaire (droite) — vertical : info → KO → board → main cachée ── */}
          {state.opponent && (
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <PlayerInfo player={state.opponent} isOpponent />
              <BackRow
                koCount={state.opponent.koCount}
                deckSize={state.opponent.deckSize}
                discardCount={state.opponent.discardCount}
                handCount={state.opponent.handCount}
              />
              <BoardArea
                active={state.opponent.active}
                bench={state.opponent.bench}
                cardById={cardById}
                isOpponent
                onZoomCard={setZoomedCard}
                onHoverCard={setHoveredCard}
              />
              <HandHidden count={state.opponent.handCount} />
            </div>
          )}
        </div>

        {/* Hand pleine largeur en bas (cartes visibles en entier). */}
        {state.self && (
          <div className="shrink-0 border-t border-white/10 bg-black/40 p-3">
            <SelfHand
              state={state}
              cardById={cardById}
              isMyTurn={isMyTurn}
              onSetActive={onSetActive}
              onAddBench={onAddBench}
              onRemoveBench={onRemoveBench}
              onPlayBasic={onPlayBasic}
              onHoverCard={setHoveredCard}
              onSelectEvolve={(i) => {
                setAttachEnergyMode(false);
                setPendingTrainerIdx(null);
                setPendingEvolveIdx(i);
              }}
              onPlayTrainerNoTarget={(i) => onPlayTrainer(i, null)}
              onSelectTrainerTarget={(i) => {
                setAttachEnergyMode(false);
                setPendingEvolveIdx(null);
                setPendingTrainerIdx(i);
              }}
            />
          </div>
        )}

        {/* Modal zoom carte (depuis click sur board uniquement) */}
        <CardZoomModal card={zoomedCard} onClose={() => setZoomedCard(null)} />

        {state.winner && (
          <div className="flex-shrink-0 bg-black/80 p-4 text-center">
            <div className="text-2xl font-bold text-amber-300">
              🏆 {state.winner === state.selfSeat ? "Victoire !" : "Défaite"}
            </div>
            <Link
              href={lobbyHref(gameId, roomId)}
              className="mt-2 inline-block rounded-md bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-400"
            >
              Retour au lobby
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/** Sidebar gauche du board : preview de la carte hover OU log de match. */
function RecapSidebar({
  log,
  hoveredCard,
}: {
  log: string[];
  hoveredCard: PokemonCardData | null;
}) {
  if (hoveredCard) {
    return (
      <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-black/40 p-3">
        <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">
          Aperçu
        </div>
        <div className="aspect-[5/7] w-full max-w-[260px]">
          <CardFace card={hoveredCard} large />
        </div>
        <div className="mt-2 text-sm font-bold text-zinc-100">
          {hoveredCard.name}
        </div>
        {hoveredCard.kind === "pokemon" && (
          <>
            <div className="mt-1 text-[11px] text-zinc-400">
              PV{" "}
              <span className="font-semibold text-emerald-300">
                {hoveredCard.hp}
              </span>{" "}
              ·{" "}
              {hoveredCard.stage === "basic"
                ? "De base"
                : hoveredCard.stage === "stage1"
                  ? "Niveau 1"
                  : "Niveau 2"}
              {hoveredCard.evolvesFrom
                ? ` · évolue de ${hoveredCard.evolvesFrom}`
                : ""}
            </div>
            {hoveredCard.weakness && (
              <div className="mt-1 text-[11px] text-rose-300">
                Faiblesse : {energyEmoji(hoveredCard.weakness)} +20
              </div>
            )}
            <div className="mt-1 text-[11px] text-zinc-400">
              Retraite : {hoveredCard.retreatCost}{" "}
              {Array.from({ length: hoveredCard.retreatCost }).map((_, k) => (
                <span key={k}>⭐</span>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-1.5 text-[11px] text-zinc-300">
              {hoveredCard.attacks.map((a, i) => (
                <div
                  key={i}
                  className="rounded border border-rose-400/30 bg-rose-500/5 p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-0.5">
                      {a.cost.map((c, j) => {
                        const bg = ENERGY_BADGE_BG[c] ?? "bg-zinc-400";
                        const fg =
                          ENERGY_BADGE_TEXT[c] ?? "text-zinc-900";
                        return (
                          <span
                            key={j}
                            className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${bg} ${fg}`}
                          >
                            {energyEmoji(c)}
                          </span>
                        );
                      })}
                    </div>
                    <span className="flex-1 font-bold text-rose-100">
                      {a.name}
                    </span>
                    {a.damage !== undefined && (
                      <span className="text-sm font-black tabular-nums text-amber-300">
                        {a.damage}
                        {a.damageSuffix ?? ""}
                      </span>
                    )}
                  </div>
                  {a.text && (
                    <div className="mt-1 text-[10px] italic text-rose-200/70">
                      {a.text}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        {hoveredCard.kind === "trainer" && (
          <>
            <div className="mt-1 text-[11px] uppercase tracking-widest text-zinc-400">
              {hoveredCard.trainerType === "supporter"
                ? "🧙 Supporter"
                : hoveredCard.trainerType === "item"
                  ? "🎒 Objet"
                  : hoveredCard.trainerType === "tool"
                    ? "🔧 Outil"
                    : "🏟 Stade"}
            </div>
            {hoveredCard.effect && (
              <div className="mt-2 rounded border border-amber-400/30 bg-amber-400/10 p-2 text-[11px] leading-snug text-amber-100">
                {hoveredCard.effect}
              </div>
            )}
          </>
        )}
      </aside>
    );
  }
  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-white/10 bg-black/40">
      <div className="border-b border-white/5 px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-500">
        📜 Journal du combat
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <div className="flex flex-col-reverse gap-1 text-xs">
          <AnimatePresence initial={false}>
            {decorateLog(log).map((entry, i) => (
              <motion.div
                key={`${i}-${entry.text.slice(0, 20)}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-start gap-1.5 ${entry.color}`}
              >
                <span className="shrink-0 text-sm leading-tight">
                  {entry.emoji}
                </span>
                <span className="leading-tight">{entry.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </aside>
  );
}

/** Décore les lignes de log avec un emoji + couleur selon le contenu, et
 *  filtre les messages trop verbeux. Renverse l'ordre pour que les plus
 *  récents soient en haut (la flex-col-reverse fait le reste). */
function decorateLog(
  log: string[],
): { emoji: string; text: string; color: string }[] {
  return log
    .map((line) => {
      // Filtres : on retire les annonces redondantes / trop bavardes.
      if (/se prépare au combat/i.test(line)) return null;
      if (/Choisissez votre Pokémon Actif/i.test(line)) return null;

      // Tour : minimal, juste un séparateur visuel.
      const turnMatch = line.match(/^Tour (\d+) — (.*)$/);
      if (turnMatch) {
        return {
          emoji: "⏱️",
          text: `Tour ${turnMatch[1]} · ${turnMatch[2]}`,
          color: "text-zinc-500",
        };
      }
      // KO marqué.
      if (line.includes("est mis K.O.") || line.includes("KO")) {
        if (/marque \d+ KO/.test(line)) {
          return { emoji: "🎯", text: line, color: "text-amber-300" };
        }
        return { emoji: "💥", text: line, color: "text-rose-300" };
      }
      // Énergie attachée.
      if (line.includes("attache ⚡") || /Énergie/i.test(line)) {
        return { emoji: "⚡", text: line, color: "text-yellow-200" };
      }
      // Attaque (mention "attaque avec").
      if (/attaque avec/i.test(line)) {
        return { emoji: "⚔️", text: line, color: "text-rose-200" };
      }
      // Retraite.
      if (/bat en retraite/i.test(line)) {
        return { emoji: "🔄", text: line, color: "text-sky-200" };
      }
      // Promotion / setup placement.
      if (/promeut|placé son Actif/i.test(line)) {
        return { emoji: "✨", text: line, color: "text-emerald-200" };
      }
      // Évolution.
      if (/évolue/i.test(line)) {
        return { emoji: "🌱", text: line, color: "text-emerald-200" };
      }
      // Pile/face.
      if (/Pile|Face/.test(line)) {
        return { emoji: "🪙", text: line, color: "text-zinc-300" };
      }
      // Statuts.
      if (/Empoisonné/i.test(line)) {
        return { emoji: "☠️", text: line, color: "text-violet-200" };
      }
      if (/Endormi/i.test(line)) {
        return { emoji: "💤", text: line, color: "text-indigo-200" };
      }
      if (/Brûlé/i.test(line)) {
        return { emoji: "🔥", text: line, color: "text-orange-200" };
      }
      if (/Paralysé/i.test(line)) {
        return { emoji: "⚡", text: line, color: "text-yellow-200" };
      }
      // Fin de partie.
      if (/gagne|abandonne|deck-out/i.test(line)) {
        return { emoji: "🏆", text: line, color: "text-amber-200 font-bold" };
      }
      // Pile/Face : qui commence.
      if (/commence/i.test(line)) {
        return { emoji: "🚦", text: line, color: "text-zinc-200" };
      }
      // Mulligan.
      if (/mulligan/i.test(line)) {
        return { emoji: "🔁", text: line, color: "text-zinc-500" };
      }
      // Default.
      return { emoji: "·", text: line, color: "text-zinc-300" };
    })
    .filter(
      (e): e is { emoji: string; text: string; color: string } => e !== null,
    );
}

function PlayerInfo({
  player,
  isOpponent,
}: {
  player: BattlePlayerPublicState | BattleSelfState;
  isOpponent: boolean;
}) {
  // Compteurs (Main, Deck, KO) sont déjà affichés dans BackRow juste en dessous,
  // donc ici on reste sur le minimum : juste le nom + l'indicateur de couleur.
  return (
    <div className="text-xs">
      <span className="font-semibold text-zinc-200">
        {isOpponent ? "🔴 " : "🟢 "}
        {player.username}
      </span>
    </div>
  );
}

/** Ligne au-dessus du board : compteur de KO + deck/discard/main, sur une
 *  même ligne horizontale pour libérer la largeur sur les côtés. */
function BackRow({
  koCount,
  deckSize,
  discardCount,
  handCount,
}: {
  koCount: number;
  deckSize: number;
  discardCount: number;
  handCount?: number;
}) {
  return (
    <div className="flex items-center gap-3 text-[10px] text-zinc-400">
      {/* KO progress en cases */}
      <div className="flex items-center gap-1.5">
        <span className="uppercase tracking-widest text-zinc-500">
          KO {koCount}/{BATTLE_CONFIG.koWinTarget}
        </span>
        <div className="flex gap-0.5">
          {Array.from({ length: BATTLE_CONFIG.koWinTarget }, (_, i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-sm border ${
                i < koCount
                  ? "border-amber-300/60 bg-amber-700/40"
                  : "border-white/5 bg-white/[0.02]"
              }`}
            />
          ))}
        </div>
      </div>
      <span className="h-3 w-px bg-white/10" />
      <span title="Cartes restantes dans le deck">📚 {deckSize}</span>
      <span title="Carte(s) en main">✋ {handCount ?? 0}</span>
      <span title="Défausse">🗑 {discardCount}</span>
    </div>
  );
}

/** Main cachée de l'adversaire — affichée en bas de sa colonne, en mini
 *  cartes empilées horizontalement (effet "fan" léger). */
function HandHidden({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] uppercase tracking-widest text-zinc-500">
        Main ({count})
      </span>
      <div className="flex">
        {Array.from({ length: Math.min(count, 7) }, (_, i) => (
          <div
            key={i}
            className="-ml-3 h-9 w-6 rounded border border-indigo-300/40 bg-gradient-to-br from-indigo-600 to-indigo-900 first:ml-0"
          />
        ))}
        {count > 7 && (
          <span className="ml-1 text-[10px] text-zinc-400">+{count - 7}</span>
        )}
      </div>
    </div>
  );
}

function BoardArea({
  active,
  bench,
  cardById,
  isOpponent,
  attachMode,
  promoteMode,
  onPromote,
  onRetreat,
  onZoomCard,
  onHoverCard,
}: {
  active: BattleCard | null;
  bench: BattleCard[];
  cardById: Map<string, PokemonCardData>;
  isOpponent: boolean;
  attachMode?: ((targetUid: string) => void) | null;
  promoteMode?: boolean;
  onPromote?: (benchIndex: number) => void;
  onRetreat?: ((benchIndex: number) => void) | null;
  onZoomCard?: (card: PokemonCardData) => void;
  onHoverCard?: (card: PokemonCardData | null) => void;
}) {
  const ownActions = !isOpponent;

  // Build le handler de click sur une carte du board (Actif ou Banc).
  // Priorité : attachMode > promoteMode > retreat > zoom.
  function makeCardHandler(
    battleCard: BattleCard,
    cardData: PokemonCardData,
    benchIndex: number | null,
  ) {
    return () => {
      if (ownActions && attachMode) {
        attachMode(battleCard.uid);
        return;
      }
      if (ownActions && promoteMode && onPromote && benchIndex !== null) {
        onPromote(benchIndex);
        return;
      }
      if (ownActions && onRetreat && benchIndex !== null) {
        onRetreat(benchIndex);
        return;
      }
      // Default : zoom modal pour voir la carte en grand.
      onZoomCard?.(cardData);
    };
  }

  // Drag & drop énergie : tout BattleCard est une dropzone, le drop appelle
  // attachMode (qui se charge du check côté Pocket).
  function makeDropProps(battleCard: BattleCard) {
    if (!ownActions || !attachMode) return {};
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "link";
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.getData("text/x-tcg-energy") === "1") {
          attachMode(battleCard.uid);
        }
      },
    };
  }

  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-xl border-2 px-6 py-4 ${
        isOpponent
          ? "border-rose-400/30 bg-rose-950/20"
          : "border-emerald-400/30 bg-emerald-950/20"
      }`}
    >
      {/* Active */}
      {active
        ? (() => {
            const data = cardById.get(active.cardId);
            if (!data || data.kind !== "pokemon") return null;
            const handler = makeCardHandler(active, data, null);
            return (
              <button
                onClick={handler}
                onMouseEnter={() => onHoverCard?.(data)}
                onMouseLeave={() => onHoverCard?.(null)}
                {...makeDropProps(active)}
                className={`rounded-lg transition-all ${
                  ownActions && attachMode
                    ? "ring-2 ring-amber-300 hover:ring-amber-200"
                    : "hover:ring-2 hover:ring-white/30"
                }`}
                title={data.name}
              >
                <BoardCard card={active} cardById={cardById} large />
              </button>
            );
          })()
        : (
          <div className="flex h-56 w-40 items-center justify-center rounded-lg border border-dashed border-white/10 text-xs text-zinc-500">
            Actif
          </div>
        )}
      {/* Bench (Pocket : max 3 slots) */}
      <div className="flex gap-2">
        {Array.from({ length: BATTLE_CONFIG.maxBench }, (_, i) => {
          const card = bench[i];
          if (!card) {
            return (
              <div
                key={i}
                className="flex h-36 w-24 items-center justify-center rounded-lg border border-dashed border-white/10 text-[10px] text-zinc-500"
              >
                Banc
              </div>
            );
          }
          const data = cardById.get(card.cardId);
          if (!data || data.kind !== "pokemon") return null;
          const handler = makeCardHandler(card, data, i);
          return (
            <button
              key={i}
              onClick={handler}
              onMouseEnter={() => onHoverCard?.(data)}
              onMouseLeave={() => onHoverCard?.(null)}
              {...makeDropProps(card)}
              className={`rounded-lg transition-all ${
                ownActions && (attachMode || promoteMode)
                  ? "ring-2 ring-amber-300 hover:ring-amber-200"
                  : ownActions && onRetreat
                    ? "hover:ring-2 hover:ring-sky-300"
                    : "hover:ring-2 hover:ring-white/30"
              }`}
              title={
                promoteMode
                  ? "Promouvoir comme Actif"
                  : onRetreat && ownActions
                    ? "Battre en retraite vers ce Pokémon"
                    : data.name
              }
            >
              <BoardCard card={card} cardById={cardById} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Couleurs Tailwind par type d'énergie pour les badges sous les Pokémon.
const ENERGY_BADGE_BG: Record<PokemonEnergyType, string> = {
  fire: "bg-orange-500",
  water: "bg-blue-400",
  grass: "bg-emerald-500",
  lightning: "bg-yellow-400",
  psychic: "bg-fuchsia-500",
  fighting: "bg-amber-700",
  darkness: "bg-zinc-700",
  metal: "bg-slate-400",
  dragon: "bg-amber-400",
  fairy: "bg-pink-400",
  colorless: "bg-zinc-300",
};
const ENERGY_BADGE_TEXT: Record<PokemonEnergyType, string> = {
  fire: "text-white",
  water: "text-white",
  grass: "text-white",
  lightning: "text-yellow-950",
  psychic: "text-white",
  fighting: "text-white",
  darkness: "text-white",
  metal: "text-slate-900",
  dragon: "text-amber-950",
  fairy: "text-pink-950",
  colorless: "text-zinc-700",
};

function BoardCard({
  card,
  cardById,
  large,
}: {
  card: BattleCard;
  cardById: Map<string, PokemonCardData>;
  large?: boolean;
}) {
  const data = cardById.get(card.cardId);
  if (!data || data.kind !== "pokemon") return null;
  // Pocket : carte officielle FR (tcgdex) en ratio 5:7. Overlays :
  //   • HP courant en bas (gros, rouge si dégâts)
  //   • Énergies attachées sous la carte (pastilles colorées par type)
  //   • Statuses en haut à droite (badges emoji)
  const w = large ? 160 : 100;
  const h = large ? 224 : 140;
  const remainingHp = Math.max(0, data.hp - card.damage);
  const damaged = card.damage > 0;
  const hpPct = Math.max(0, Math.min(1, remainingHp / data.hp));
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="relative overflow-hidden rounded-lg border border-white/10 bg-black/40 shadow-xl"
        style={{ width: w, height: h }}
        title={data.name}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data.image}
          alt={data.name}
          className="h-full w-full object-contain"
          loading="lazy"
        />

        {/* Barre HP en bas (jauge verte → rouge selon ratio) */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/90 via-black/50 to-transparent px-1.5 py-1">
          <div className="flex items-center justify-between text-xs tabular-nums">
            <span
              className={`font-bold ${
                damaged ? "text-rose-300" : "text-emerald-200"
              }`}
            >
              {remainingHp}
              <span className="text-zinc-400">/{data.hp}</span>
            </span>
            <span className="text-[10px] uppercase tracking-widest text-zinc-400">
              PV
            </span>
          </div>
          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-black/50">
            <div
              className={`h-full transition-all ${
                hpPct > 0.5
                  ? "bg-emerald-400"
                  : hpPct > 0.25
                    ? "bg-amber-400"
                    : "bg-rose-500"
              }`}
              style={{ width: `${hpPct * 100}%` }}
            />
          </div>
        </div>

        {/* Statuses en haut à droite */}
        {card.statuses.length > 0 && (
          <div className="absolute right-1 top-1 flex gap-0.5 rounded bg-black/80 px-1 py-0.5 text-sm">
            {card.statuses.map((s, i) => (
              <span key={i}>{statusEmoji(s)}</span>
            ))}
          </div>
        )}
      </div>

      {/* Pastilles d'énergies attachées (sous la carte). */}
      {card.attachedEnergies.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-0.5 px-0.5">
          {card.attachedEnergies.map((e, i) => {
            const t = e as PokemonEnergyType;
            const bg = ENERGY_BADGE_BG[t] ?? "bg-zinc-400";
            const fg = ENERGY_BADGE_TEXT[t] ?? "text-zinc-900";
            return (
              <span
                key={i}
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold shadow ring-1 ring-black/30 ${bg} ${fg}`}
                title={e}
              >
                {energyEmoji(t)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function statusEmoji(s: string): string {
  switch (s) {
    case "asleep":
      return "💤";
    case "burned":
      return "🔥";
    case "confused":
      return "❓";
    case "paralyzed":
      return "⚡";
    case "poisoned":
      return "☠️";
    default:
      return "";
  }
}

/** Bloc "contrôles" en dessous du board joueur. Selon la phase :
 *   - setup  : juste le bouton "Confirmer mon équipe" (centré).
 *   - playing : ligne [Énergie pending | Liste des attaques] + bouton "Fin du
 *               tour" en dessous, le tout dans une largeur fixe alignée sur
 *               le board. */
function SelfControls({
  state,
  isMyTurn,
  cardById,
  onConfirmSetup,
  onEndTurn,
  onAttack,
  attachEnergyMode,
  pendingEvolveIdx,
  pendingTrainerIdx,
  onActivateAttachMode,
}: {
  state: BattleState;
  isMyTurn: boolean;
  cardById: Map<string, PokemonCardData>;
  onConfirmSetup: () => void;
  onEndTurn: () => void;
  onAttack: (attackIndex: number) => void;
  attachEnergyMode: boolean;
  pendingEvolveIdx: number | null;
  pendingTrainerIdx: number | null;
  onActivateAttachMode: () => void;
}) {
  if (state.phase === "setup") {
    const ready = state.self?.hasSetup;
    const canConfirm = !!state.self?.active;
    return (
      <div className="mt-2 flex flex-col items-center gap-1">
        {ready ? (
          <span className="rounded-md bg-emerald-500/20 px-4 py-2 text-sm text-emerald-300">
            ✓ Prêt — en attente de l&apos;adversaire
          </span>
        ) : (
          <button
            onClick={onConfirmSetup}
            disabled={!canConfirm}
            className="rounded-md bg-emerald-500 px-5 py-2 text-sm font-bold text-emerald-950 shadow-lg hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirmer mon équipe
          </button>
        )}
      </div>
    );
  }
  if (state.phase !== "playing") return null;
  const self = state.self;
  const active = self?.active;
  const data = active ? cardById.get(active.cardId) : null;
  const attacks = data?.kind === "pokemon" ? data.attacks : [];
  const blocked =
    !isMyTurn ||
    !!self?.mustPromoteActive ||
    (active?.playedThisTurn ?? false);

  // L'énergie "pending" est affichée en logo brillant à gauche des attaques :
  // cliquable (active le mode Attacher) + draggable (drop sur un Pokémon).
  const showEnergy =
    !!self?.pendingEnergy &&
    !self.energyAttachedThisTurn &&
    isMyTurn &&
    !attachEnergyMode &&
    pendingEvolveIdx === null &&
    pendingTrainerIdx === null;
  const energyType = self?.pendingEnergy ?? null;

  return (
    <div className="mt-2 flex w-full max-w-[360px] flex-col items-stretch gap-2">
      {/* Ligne : [énergie | attaques] */}
      <div className="flex items-stretch gap-2">
        {/* Logo énergie à gauche (pulse + draggable). Slot toujours
            réservé pour stabilité visuelle, vide si pas d'énergie pending. */}
        <div className="flex w-12 shrink-0 items-start justify-center">
          {showEnergy && energyType ? (
            <span
              draggable
              onClick={onActivateAttachMode}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/x-tcg-energy", "1");
                e.dataTransfer.effectAllowed = "link";
                onActivateAttachMode();
              }}
              className={`flex h-12 w-12 cursor-grab select-none items-center justify-center rounded-full text-2xl font-bold shadow-xl ring-2 ring-amber-300/60 active:cursor-grabbing animate-pulse ${
                ENERGY_BADGE_BG[energyType]
              } ${ENERGY_BADGE_TEXT[energyType]}`}
              title="Glisse cette énergie sur un Pokémon (ou clique pour activer le mode Attacher)"
            >
              {energyEmoji(energyType)}
            </span>
          ) : null}
        </div>

        {/* Liste des attaques */}
        <div className="flex flex-1 flex-col gap-1">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            ⚔️ Attaques
          </div>
          {attacks.length === 0 && (
            <div className="rounded-md border border-dashed border-white/10 p-2 text-center text-[11px] text-zinc-500">
              Aucune attaque
            </div>
          )}
          {attacks.map((a, i) => {
            const canPay = active
              ? canPayCost(active.attachedEnergies, a.cost, cardById)
              : false;
            const disabled = blocked || !canPay;
            return (
              <button
                key={i}
                disabled={disabled}
                onClick={() => onAttack(i)}
                className={`flex flex-col items-stretch rounded-md border-2 px-2.5 py-1.5 text-left text-xs transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                  disabled
                    ? "border-rose-400/20 bg-rose-500/5 text-rose-300/60"
                    : "border-rose-400/60 bg-rose-500/15 text-rose-50 shadow-md hover:scale-[1.02] hover:bg-rose-500/25"
                }`}
                title={a.text ?? ""}
              >
                <div className="flex items-center justify-between gap-2">
                  {/* Coût en pastilles colorées par type */}
                  <div className="flex items-center gap-0.5">
                    {a.cost.map((c, j) => {
                      const bg = ENERGY_BADGE_BG[c] ?? "bg-zinc-400";
                      const fg = ENERGY_BADGE_TEXT[c] ?? "text-zinc-900";
                      return (
                        <span
                          key={j}
                          className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold shadow ${bg} ${fg}`}
                        >
                          {energyEmoji(c)}
                        </span>
                      );
                    })}
                  </div>
                  <span className="flex-1 font-bold">{a.name}</span>
                  {a.damage !== undefined && (
                    <span className="text-base font-black tabular-nums text-amber-300">
                      {a.damage}
                      {a.damageSuffix ?? ""}
                    </span>
                  )}
                </div>
                {a.text && (
                  <span className="mt-1 text-[10px] italic leading-tight text-rose-200/70">
                    {a.text}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bouton "Fin du tour" en bas, pleine largeur */}
      <button
        onClick={onEndTurn}
        disabled={!isMyTurn || !!self?.mustPromoteActive}
        className="rounded-md bg-amber-500 px-3 py-2 text-sm font-bold text-amber-950 shadow-lg hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ⏭ Fin du tour
      </button>
    </div>
  );
}

function energyEmoji(t: PokemonEnergyType): string {
  switch (t) {
    case "fire":
      return "🔥";
    case "water":
      return "💧";
    case "grass":
      return "🍃";
    case "lightning":
      return "⚡";
    case "psychic":
      return "🌀";
    case "fighting":
      return "👊";
    case "darkness":
      return "🌑";
    case "metal":
      return "⚙️";
    case "dragon":
      return "🐉";
    case "fairy":
      return "🧚";
    case "colorless":
      return "⭐";
  }
}

/** Reproduit côté client la logique serveur du paiement de coût.
 *  Pocket : `attached` contient directement les types ("fire", "water"…). */
function canPayCost(
  attached: string[],
  cost: PokemonEnergyType[],
  _cardById: Map<string, PokemonCardData>,
): boolean {
  const pool = new Map<string, number>();
  for (const energyType of attached) {
    pool.set(energyType, (pool.get(energyType) ?? 0) + 1);
  }
  let colorlessNeeded = 0;
  for (const c of cost) {
    if (c === "colorless") colorlessNeeded++;
    else {
      const have = pool.get(c) ?? 0;
      if (have <= 0) return false;
      pool.set(c, have - 1);
    }
  }
  let remaining = 0;
  for (const n of pool.values()) remaining += n;
  return remaining >= colorlessNeeded;
}

/** Action calculée pour une carte de la main au tour courant.
 *   - "playable" : clic exécute handler (carte highlight verte).
 *   - "blocked"  : non jouable, on grise + tooltip avec la raison. */
type HandAction =
  | { kind: "playable"; label: string; handler: () => void }
  | { kind: "blocked"; reason: string };

// Cartes Dresseur supportées par le moteur (subset starter). Les autres
// trainers tombent en "blocked: pas encore implémenté".
const TRAINER_NEEDS_TARGET = new Set<string>(["Potion"]);
const TRAINER_NO_TARGET = new Set<string>([
  "Poké Ball",
  "Recherches Professorales",
  "Vitesse +",
]);

function SelfHand({
  state,
  cardById,
  isMyTurn,
  onSetActive,
  onAddBench,
  onRemoveBench,
  onPlayBasic,
  onSelectEvolve,
  onPlayTrainerNoTarget,
  onSelectTrainerTarget,
  onHoverCard,
}: {
  state: BattleState;
  cardById: Map<string, PokemonCardData>;
  isMyTurn: boolean;
  onSetActive: (handIndex: number) => void;
  onAddBench: (handIndex: number) => void;
  onRemoveBench: (benchIndex: number) => void;
  onPlayBasic: (handIndex: number) => void;
  onSelectEvolve: (handIndex: number) => void;
  onPlayTrainerNoTarget: (handIndex: number) => void;
  onSelectTrainerTarget: (handIndex: number) => void;
  onHoverCard?: (card: PokemonCardData | null) => void;
}) {
  const self = state.self;
  if (!self) return null;
  const inSetup = state.phase === "setup" && !self.hasSetup;
  const inMain =
    state.phase === "playing" && isMyTurn && !self.mustPromoteActive;
  const benchCap = BATTLE_CONFIG.maxBench;
  // Capture pour les closures (TS perd le narrowing de state.self).
  const hasActive = !!self.active;
  const benchLen = self.bench.length;
  // Liste des Pokémon en jeu (Actif + Banc) pour vérifier les pré-requis
  // d'évolution.
  const inPlay: BattleCard[] = [];
  if (self.active) inPlay.push(self.active);
  inPlay.push(...self.bench);
  const usedSupporter = self.usedSupporterThisTurn ?? false;
  // Capture pour les closures (TS perd le narrowing de `self`).
  const mustPromoteActive = !!self.mustPromoteActive;

  /** Calcule l'action d'une carte au tour courant, ou la raison du blocage.
   *  Renvoie null pour un cas où ni jouable ni intéressant à signaler. */
  function getAction(card: PokemonCardData, i: number): HandAction | null {
    // ── Pokémon ──────────────────────────────────────────────────────
    if (card.kind === "pokemon") {
      const isBasic = card.stage === "basic";
      const isEvolution = card.stage !== "basic" && !!card.evolvesFrom;

      if (inSetup) {
        if (isEvolution) {
          return {
            kind: "blocked",
            reason: "Au setup tu poses uniquement des Pokémon de Base.",
          };
        }
        if (!hasActive) {
          return {
            kind: "playable",
            label: "→ Mettre Actif",
            handler: () => onSetActive(i),
          };
        }
        if (benchLen < benchCap) {
          return {
            kind: "playable",
            label: "→ Ajouter au Banc",
            handler: () => onAddBench(i),
          };
        }
        return { kind: "blocked", reason: "Banc plein." };
      }

      if (!inMain) {
        return {
          kind: "blocked",
          reason: mustPromoteActive
            ? "Tu dois d'abord promouvoir un Pokémon de Banc."
            : !isMyTurn
              ? "Pas encore ton tour."
              : "Tu ne peux pas jouer cette carte maintenant.",
        };
      }

      if (isBasic) {
        if (benchLen >= benchCap) {
          return { kind: "blocked", reason: `Banc plein (${benchCap}/${benchCap}).` };
        }
        return {
          kind: "playable",
          label: "→ Poser au Banc",
          handler: () => onPlayBasic(i),
        };
      }

      if (isEvolution) {
        // Doit y avoir au moins une cible valide en jeu : le `evolvesFrom`
        // doit être posé ET pas joué ce tour.
        const evolvesFrom = card.evolvesFrom ?? "";
        const candidates = inPlay.filter((c) => {
          const d = cardById.get(c.cardId);
          return d?.kind === "pokemon" && d.name === evolvesFrom;
        });
        if (candidates.length === 0) {
          return {
            kind: "blocked",
            reason: `${evolvesFrom} doit être en jeu pour évoluer en ${card.name}.`,
          };
        }
        const allJustPlayed = candidates.every((c) => c.playedThisTurn);
        if (allJustPlayed) {
          return {
            kind: "blocked",
            reason: `${evolvesFrom} vient d'être posé — attends le tour suivant pour évoluer.`,
          };
        }
        return {
          kind: "playable",
          label: "→ Choisir cible évolution",
          handler: () => onSelectEvolve(i),
        };
      }

      return null;
    }

    // ── Trainer ──────────────────────────────────────────────────────
    if (inSetup) {
      return {
        kind: "blocked",
        reason: "Les cartes Dresseur se jouent en phase de combat.",
      };
    }
    if (!inMain) {
      return {
        kind: "blocked",
        reason: !isMyTurn ? "Pas encore ton tour." : "Indisponible.",
      };
    }
    if (card.trainerType === "supporter" && usedSupporter) {
      return {
        kind: "blocked",
        reason: "1 seule carte Supporter peut être jouée par tour.",
      };
    }
    if (TRAINER_NEEDS_TARGET.has(card.name)) {
      // Potion : nécessite au moins un Pokémon blessé en jeu.
      if (card.name === "Potion") {
        const someoneHurt = inPlay.some((c) => c.damage > 0);
        if (!someoneHurt) {
          return {
            kind: "blocked",
            reason: "Aucun Pokémon n'est blessé.",
          };
        }
      }
      return {
        kind: "playable",
        label: "→ Choisir cible",
        handler: () => onSelectTrainerTarget(i),
      };
    }
    if (TRAINER_NO_TARGET.has(card.name)) {
      return {
        kind: "playable",
        label: "→ Jouer la carte",
        handler: () => onPlayTrainerNoTarget(i),
      };
    }
    // Trainer non implémenté : on l'indique clairement.
    return {
      kind: "blocked",
      reason: `« ${card.name} » — pas encore implémentée.`,
    };
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          Ta main ({self.hand.length})
        </span>
        <span className="text-[10px] text-zinc-600">
          · clic = jouer · survole = aperçu · cartes grisées = injouables
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {self.hand.map((cardId, i) => {
          const data = cardById.get(cardId);
          if (!data) return null;
          const action = getAction(data, i);
          return (
            <HandCard
              key={`${i}-${cardId}`}
              data={data}
              action={action}
              onHover={onHoverCard}
            />
          );
        })}
      </div>
      {inSetup && self.bench.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/5 pt-2">
          <span className="text-[10px] text-zinc-500">Retirer du banc :</span>
          {self.bench.map((c, i) => {
            const data = cardById.get(c.cardId);
            return (
              <button
                key={c.uid}
                onClick={() => onRemoveBench(i)}
                className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] hover:bg-rose-500/20"
              >
                {data?.kind === "pokemon" ? data.name.slice(0, 12) : ""} ✕
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HandCard({
  data,
  action,
  onHover,
}: {
  data: PokemonCardData;
  action: HandAction | null;
  onHover?: (card: PokemonCardData | null) => void;
}) {
  const playable = action?.kind === "playable";
  const blocked = action?.kind === "blocked";
  const tooltip = playable
    ? `${data.name} — ${action.label.replace("→ ", "")}`
    : blocked
      ? `${data.name} — ${action.reason}`
      : data.name;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => {
        if (action?.kind === "playable") action.handler();
      }}
      onMouseEnter={() => onHover?.(data)}
      onMouseLeave={() => onHover?.(null)}
      className={`relative shrink-0 overflow-hidden rounded-lg border transition-all ${
        playable
          ? "cursor-pointer border-emerald-400/60 ring-2 ring-emerald-400/40 hover:scale-[1.05] hover:ring-emerald-300"
          : blocked
            ? "cursor-not-allowed border-white/5 opacity-50 grayscale"
            : "cursor-default border-white/10 opacity-90 hover:ring-2 hover:ring-white/30"
      }`}
      style={{ width: 130, height: 182 }}
      title={tooltip}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data.image}
        alt={data.name}
        className="h-full w-full object-contain"
        loading="lazy"
        draggable={false}
      />
      {playable && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-emerald-900/90 via-emerald-900/60 to-transparent p-1 text-center text-[10px] font-bold text-emerald-100">
          {action.label}
        </div>
      )}
      {blocked && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-900/95 via-zinc-900/70 to-transparent p-1 text-center text-[9px] leading-tight text-zinc-300">
          {action.reason}
        </div>
      )}
    </motion.div>
  );
}

function StatusIndicator({ status }: { status: ConnStatus }) {
  const color =
    status === "connected"
      ? "bg-emerald-400"
      : status === "connecting"
        ? "bg-amber-400"
        : "bg-rose-400";
  const label =
    status === "connected"
      ? "en ligne"
      : status === "connecting"
        ? "connexion"
        : "hors ligne";
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`}>
        {status === "connected" && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-60`}
          />
        )}
      </span>
      {label}
    </span>
  );
}
