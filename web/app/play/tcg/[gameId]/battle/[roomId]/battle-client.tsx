"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Swords, Smile, Bot } from "lucide-react";
import type {
  BattleCard,
  BattleClientMessage,
  BattlePlayerPublicState,
  BattleSeatId,
  BattleSelfState,
  BattleServerMessage,
  BattleState,
  ChatMessage,
  PokemonAbility,
  PokemonCard,
  PokemonCardData,
  PokemonEnergyType,
  TcgGameId,
  TrainerCard,
} from "@shared/types";
import { BATTLE_CONFIG, TCG_GAMES } from "@shared/types";
import { POKEMON_BASE_SET_BY_ID } from "@shared/tcg-pokemon-base";
import { POKEMON_COSMETICS } from "@shared/tcg-pokemon-cosmetics";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { useRegisterProximityChat } from "@/app/play/proximity-chat-context";
import { useSounds } from "@/lib/sounds";
import { useToast } from "@/components/toast";
import { CardFace, CardZoomModal } from "../../_components/card-visuals";

type ConnStatus = "connecting" | "connected" | "disconnected";

type CoinFlipEvent = {
  id: string;
  label: string;
  result: "heads" | "tails";
  index?: number;
  total?: number;
  followUp?: string;
};

/** Historique des résultats déjà passés DANS LA SÉRIE EN COURS, plus le
 *  flip actuel. Permet d'afficher un récap visuel "Pile X · Face Y" et
 *  les badges P/F pour chaque lancer déjà tombé. La série est groupée
 *  par `label` (toutes les Rafales d'Éclairs d'un même Pokémon = une
 *  série). On reset quand le label change ou quand la queue se vide. */
type CoinSeriesEntry = {
  index: number;
  total: number;
  result: "heads" | "tails";
};

/** Animation d'un projectile qui part d'une position de départ vers une
 *  position d'arrivée (ex énergie qui vole du logo vers une carte). */
type FlyAnim = {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  // Contenu rendu pendant le vol (emoji, badge, etc).
  content: React.ReactNode;
  // Couleur du badge rond derrière le contenu (Tailwind class).
  bg: string;
  fg: string;
};

/** Cherche un BattleCard sur un side (active ou bench) par uid. */
function findOnSide(
  side: { active: BattleCard | null; bench: BattleCard[] } | null,
  uid: string,
): BattleCard | null {
  if (!side) return null;
  if (side.active?.uid === uid) return side.active;
  return side.bench.find((c) => c.uid === uid) ?? null;
}

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

/** Résout l'id d'un sleeve Pokemon vers sa classe Tailwind de gradient.
 *  Utilisé pour colorer les dos de cartes (deck, main adverse). */
function resolveSleeveGradient(sleeveId: string): string {
  const item = POKEMON_COSMETICS.find(
    (c) => c.type === "sleeve" && c.id === sleeveId,
  );
  return item?.sleeveColor ?? "from-rose-700 via-zinc-100 to-rose-700";
}

/** Résout l'id du playmat Pokemon en classe Tailwind de gradient applicable
 *  au background du board. Mapping inline (pas dans le catalogue car les
 *  classes sont spécifiques au battle). */
const PLAYMAT_BG_BY_ID: Record<string, string> = {
  default:
    "bg-gradient-to-br from-zinc-900 via-emerald-950/30 to-zinc-950", // Bourg Palette
  "foret-jade":
    "bg-gradient-to-br from-zinc-950 via-emerald-900/40 to-green-950",
  "mont-selenite":
    "bg-gradient-to-br from-zinc-950 via-indigo-900/30 to-slate-950",
  stade:
    "bg-gradient-to-br from-zinc-900 via-amber-900/20 to-orange-950",
  cinabre:
    "bg-gradient-to-br from-zinc-950 via-orange-900/40 to-rose-950",
  "spiral-mewtwo":
    "bg-gradient-to-br from-zinc-950 via-fuchsia-900/30 to-violet-950",
};

function resolvePlaymatBg(playmatId: string): string {
  return PLAYMAT_BG_BY_ID[playmatId] ?? PLAYMAT_BG_BY_ID.default;
}

export function BattleClient({
  profile,
  gameId,
  roomId,
  deckId,
  spectator = false,
  cosmetics,
}: {
  profile: Profile | null;
  gameId: TcgGameId;
  roomId: string;
  deckId: string;
  /** Mode spectateur : WS connecté avec ?spectate=1, aucune action
   *  envoyable. Le serveur PartyKit envoie l'état complet sans
   *  révéler les mains des joueurs. */
  spectator?: boolean;
  /** Cosmétiques actifs (sleeve / playmat / coin) chargés côté serveur
   *  depuis profiles.tcg_cosmetics_active. Default = "default" si pas
   *  de cosmétique acheté/équipé. */
  cosmetics?: { sleeve: string; playmat: string; coin: string };
}) {
  const game = TCG_GAMES[gameId];
  const cardById = POKEMON_BASE_SET_BY_ID;
  const wsRef = useRef<WebSocket | null>(null);
  const sounds = useSounds();
  const toast = useToast();
  // Ref miroir pour utiliser sounds dans les closures stables (handler
  // WebSocket) sans forcer le rerender sur chaque render parent.
  const soundsRef = useRef(sounds);
  const toastRef = useRef(toast);
  useEffect(() => {
    soundsRef.current = sounds;
    toastRef.current = toast;
  }, [sounds, toast]);

  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [state, setState] = useState<BattleState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Refs pour détecter les TRANSITIONS d'état (winner null → set,
  // koCount qui augmente, etc.) et déclencher des sons une seule fois.
  const prevWinnerRef = useRef<BattleSeatId | null>(null);
  const prevKoCountsRef = useRef<{ self: number; opp: number }>({
    self: 0,
    opp: 0,
  });
  const [questToast, setQuestToast] = useState<{
    botWins: number;
    granted: boolean;
  } | null>(null);
  /** Toast pour les victoires d'arène (Champion d'arène Pokemon) :
   *  badge unlocked + booster gratuit. Distinct de questToast (qui est
   *  le 3-wins/jour générique). */
  const [arenaToast, setArenaToast] = useState<{
    badgeUnlocked: boolean;
    packGranted: boolean;
  } | null>(null);
  /** Garde-fou pour ne pas appeler record_arena_win plusieurs fois si
   *  le state est rejoué (reconnexion etc). */
  const arenaWinRecordedRef = useRef(false);
  // Chat propre à la table de combat — éphémère (la room PartyKit
  // hiberne quand vide). Exposé en "proximity" via le sidebar global.
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  // File d'attente d'animations pile/face. Le serveur les émet AVANT le
  // battle-state qui contient le résultat. Le state est DIFFÉRÉ tant
  // que la queue n'est pas vide pour que les conséquences (dégâts,
  // statuts, énergies) n'apparaissent qu'APRÈS l'animation.
  const [coinQueue, setCoinQueue] = useState<CoinFlipEvent[]>([]);
  // Historique des flips déjà passés dans la série en cours (pour le
  // récap visuel "Pile X · Face Y" + badges).
  const [coinSeries, setCoinSeries] = useState<{
    label: string;
    entries: CoinSeriesEntry[];
  }>({ label: "", entries: [] });
  // Refs en miroir pour pouvoir prendre des décisions synchrones dans
  // le handler WebSocket (les setState sont async/batched).
  const coinQueueRef = useRef<CoinFlipEvent[]>([]);
  const pendingStateRef = useRef<BattleState | null>(null);
  // Modal de révélation Dresseur (Pokédex, Scrute Main).
  const [trainerReveal, setTrainerReveal] = useState<{
    trainerName: string;
    cardIds: string[];
  } | null>(null);
  // Emotes flottantes — une par siège, disparaît après 3s.
  const [emoteSelf, setEmoteSelf] = useState<{
    id: string;
    emoteId: string;
  } | null>(null);
  const [emoteOpp, setEmoteOpp] = useState<{
    id: string;
    emoteId: string;
  } | null>(null);
  const [emotePickerOpen, setEmotePickerOpen] = useState(false);
  // Animation de changement de tour : bandeau plein écran « À toi ! » /
  // « Tour adverse… » qui apparaît brièvement à chaque flip.
  const [turnBanner, setTurnBanner] = useState<{
    text: string;
    accent: "self" | "opp";
    key: number;
  } | null>(null);
  // File des animations "fly" : un projectile qui part d'un point A vers
  // un point B (énergie qui vole du logo vers une carte, etc).
  const [flyAnims, setFlyAnims] = useState<FlyAnim[]>([]);

  /** Applique un state reçu côté serveur et déclenche le bandeau de
   *  changement de tour quand l'`activeSeat` change. Centralisé ici
   *  parce que l'application est différée tant qu'une animation
   *  pile/face est en cours. */
  const applyStateNow = useCallback(
    (newState: BattleState) => {
      setState((prev) => {
        const prevActive = prev?.activeSeat;
        const nextActive = newState.activeSeat;
        const phaseStartedNow =
          prev?.phase !== "playing" && newState.phase === "playing";
        if (
          newState.phase === "playing" &&
          ((prevActive && nextActive && prevActive !== nextActive) ||
            phaseStartedNow)
        ) {
          const isMine = nextActive === newState.selfSeat;
          setTurnBanner({
            text: isMine ? "À toi !" : "Tour adverse",
            accent: isMine ? "self" : "opp",
            key: Date.now(),
          });
        }
        // Sons : KO (compteur de KO augmente) + victoire (winner détecté).
        const prevSelfKo = prev?.self?.koCount ?? 0;
        const prevOppKo = prev?.opponent?.koCount ?? 0;
        const nextSelfKo = newState.self?.koCount ?? 0;
        const nextOppKo = newState.opponent?.koCount ?? 0;
        if (nextSelfKo > prevSelfKo || nextOppKo > prevOppKo) {
          sounds.koHit();
        }
        if (newState.winner && !prev?.winner) {
          if (newState.winner === newState.selfSeat) {
            sounds.victory();
            // Mode arène (room id "bot-arena-{type}-...") : appel
            // record_arena_win pour crédit badge + booster.
            // Le check arenaWinRecordedRef évite les doubles appels en
            // cas de reconnexion qui rejoue le state final.
            if (
              roomId.startsWith("bot-arena-") &&
              !arenaWinRecordedRef.current
            ) {
              arenaWinRecordedRef.current = true;
              const arenaIdMatch = window.location.search.match(
                /[?&]arena=([^&]+)/,
              );
              const arenaId = arenaIdMatch ? arenaIdMatch[1] : null;
              if (arenaId) {
                (async () => {
                  const sb = createClient();
                  if (!sb) return;
                  const { data } = await sb.rpc("record_arena_win", {
                    p_arena_id: arenaId,
                  });
                  const r = data as
                    | { badge_unlocked: boolean; pack_granted: boolean }
                    | null;
                  if (r && r.pack_granted) {
                    setArenaToast({
                      badgeUnlocked: r.badge_unlocked,
                      packGranted: r.pack_granted,
                    });
                  }
                })();
              }
            }
          } else {
            sounds.error();
          }
        }
        return newState;
      });
    },
    [sounds, roomId],
  );

  /** Consomme le 1er coin flip de la queue (appelé quand son anim finit).
   *  Si la queue se vide ET qu'un state est en attente, on l'applique
   *  maintenant — ce qui rend visibles les conséquences du flip. */
  const consumeCoin = useCallback(
    (id: string) => {
      coinQueueRef.current = coinQueueRef.current.filter((e) => e.id !== id);
      setCoinQueue(coinQueueRef.current);
      if (coinQueueRef.current.length === 0 && pendingStateRef.current) {
        const s = pendingStateRef.current;
        pendingStateRef.current = null;
        applyStateNow(s);
      }
      // Si plus aucun flip en attente, on reset le récap après un court
      // délai (laisse le temps de voir le résultat final).
      if (coinQueueRef.current.length === 0) {
        window.setTimeout(() => {
          // Reset uniquement si toujours pas de nouveau flip arrivé
          // entre-temps (un nouveau flip aurait écrasé coinSeries).
          if (coinQueueRef.current.length === 0) {
            setCoinSeries({ label: "", entries: [] });
          }
        }, 1500);
      }
    },
    [applyStateNow],
  );

  /** Safety net : si la queue de coin flips reste bloquée plus de 15s
   *  alors qu'un state est en attente, force l'application. Évite que
   *  le jeu se "fige" à cause d'une animation manquée. */
  useEffect(() => {
    if (coinQueue.length === 0) return;
    const t = window.setTimeout(() => {
      if (coinQueueRef.current.length > 0 && pendingStateRef.current) {
        console.warn(
          "[battle] coin queue stuck for 15s, forcing state apply",
        );
        coinQueueRef.current = [];
        setCoinQueue([]);
        const s = pendingStateRef.current;
        pendingStateRef.current = null;
        applyStateNow(s);
      }
    }, 15000);
    return () => window.clearTimeout(t);
  }, [coinQueue, applyStateNow]);

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
    if (spectator) {
      params.set("spectate", "1");
    } else {
      params.set("deck", deckId);
    }
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
        case "battle-state": {
          // Si une animation pile/face est en cours (ou en attente dans
          // la queue), on DIFFÈRE l'application du state pour que les
          // conséquences (dégâts, statuts, énergies) n'apparaissent
          // qu'APRÈS l'animation. Le state est appliqué quand la queue
          // se vide (cf. consumeCoin plus bas). Si plusieurs states
          // arrivent pendant l'attente, seul le dernier prévaut (state
          // est complet, pas une diff).
          if (coinQueueRef.current.length > 0) {
            pendingStateRef.current = msg.state;
          } else {
            applyStateNow(msg.state);
          }
          setErrorMsg(null);
          break;
        }
        case "battle-error":
          setErrorMsg(msg.message);
          break;
        case "battle-quest-reward":
          setQuestToast({ botWins: msg.botWins, granted: msg.granted });
          break;
        case "battle-coin-flip": {
          const ev: CoinFlipEvent = {
            id: msg.id,
            label: msg.label,
            result: msg.result,
            index: msg.index,
            total: msg.total,
            followUp: msg.followUp,
          };
          coinQueueRef.current = [...coinQueueRef.current, ev];
          setCoinQueue(coinQueueRef.current);
          // Son d'arrivée du coin (notify, court). Joué quand le client
          // reçoit l'event ; l'animation visuelle suit dans 0-2s.
          soundsRef.current.notify();
          // Met à jour le récap de la série en cours. Si le label
          // change, on démarre une nouvelle série. Sinon on append.
          // Inclut aussi les séries "open-ended" (Ondine, Léviator
          // Langue Sans Fin) : pas de `total` mais label stable +
          // `index` qui incrémente. Le récap s'affiche dès qu'on a
          // ≥1 entry (donc visible dès le 1er flip d'une série).
          if (msg.index !== undefined) {
            setCoinSeries((prev) => {
              if (prev.label !== msg.label) {
                return {
                  label: msg.label,
                  entries: [
                    {
                      index: msg.index ?? 1,
                      total: msg.total ?? 0,
                      result: msg.result,
                    },
                  ],
                };
              }
              return {
                label: prev.label,
                entries: [
                  ...prev.entries,
                  {
                    index: msg.index ?? 1,
                    total: msg.total ?? 0,
                    result: msg.result,
                  },
                ],
              };
            });
          }
          break;
        }
        case "battle-trainer-reveal":
          setTrainerReveal({
            trainerName: msg.trainerName,
            cardIds: msg.cardIds,
          });
          break;
        case "chat":
          setChatMessages((prev) => [...prev.slice(-49), msg.message]);
          break;
        case "battle-emote": {
          // Affiche pendant 3s puis disparaît.
          const id = crypto.randomUUID();
          const isSelf =
            pendingStateRef.current?.selfSeat === msg.seat ||
            (state?.selfSeat ?? null) === msg.seat;
          if (isSelf) setEmoteSelf({ id, emoteId: msg.emoteId });
          else setEmoteOpp({ id, emoteId: msg.emoteId });
          setTimeout(() => {
            if (isSelf) setEmoteSelf((cur) => (cur?.id === id ? null : cur));
            else setEmoteOpp((cur) => (cur?.id === id ? null : cur));
          }, 3000);
          break;
        }
        case "battle-achievement-unlocked": {
          // Toast festif + son victoire. Le user a unlock un achievement
          // pendant le match (ex « 1ère victoire », « ELO 1500 »…).
          toastRef.current.success(
            `🏅 ${msg.icon} Achievement débloqué : ${msg.name}`,
          );
          soundsRef.current.victory();
          break;
        }
      }
    });
    return () => {
      cancelled = true;
      ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [profile, gameId, roomId, deckId]);

  const send = useCallback(
    (msg: BattleClientMessage) => {
      // En mode spectateur, on bloque toutes les actions côté client.
      // Le serveur les rejetterait de toute façon (pas de seatId).
      if (spectator) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify(msg));
    },
    [spectator],
  );

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
  const attack = (
    attackIndex: number,
    copyFromUid?: string | null,
    copyAttackIndex?: number | null,
  ) =>
    send({
      type: "battle-attack",
      attackIndex,
      copyFromUid,
      copyAttackIndex,
    });
  const promoteActive = (benchIndex: number) =>
    send({ type: "battle-promote-active", benchIndex });
  const playTrainer = (handIndex: number, targetUid?: string | null) =>
    send({ type: "battle-play-trainer", handIndex, targetUid });
  const useAbility = (cardUid: string, targetUid?: string | null) =>
    send({ type: "battle-use-ability", cardUid, targetUid });
  const endTurn = () => send({ type: "battle-end-turn" });
  const sendChat = useCallback(
    (text: string) => send({ type: "chat", text }),
    [send],
  );
  const sendEmote = useCallback(
    (emoteId: string) =>
      send({ type: "battle-emote", emoteId: emoteId as never }),
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

  // ─── Détection state-diff pour les fly animations cross-card ───────
  // On garde la dernière vue des `attachedEnergies` par uid (Pokémon Actif
  // + Banc des deux côtés). Quand un count augmente, on lance une fly anim
  // depuis le logo énergie (côté concerné) vers la carte cible.
  const prevAttachedRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!state) return;
    const next = new Map<string, number>();
    const collect = (
      side: BattleSelfState | BattlePlayerPublicState | null,
    ) => {
      if (!side) return;
      if (side.active) next.set(side.active.uid, side.active.attachedEnergies.length);
      for (const c of side.bench) next.set(c.uid, c.attachedEnergies.length);
    };
    collect(state.self);
    collect(state.opponent);

    // Cherche le 1er uid dont le count a augmenté → fly anim.
    for (const [uid, count] of next) {
      const prev = prevAttachedRef.current.get(uid) ?? 0;
      if (count > prev) {
        // Trouve le type de la dernière énergie attachée pour la rendre.
        const card =
          findOnSide(state.self, uid) ?? findOnSide(state.opponent, uid);
        if (card) {
          const lastType = card.attachedEnergies[card.attachedEnergies.length - 1] as PokemonEnergyType;
          // Source : le logo énergie du joueur dont le Pokémon est ciblé
          // (côté self uniquement — l'adversaire n'a pas de logo visible
          // chez nous). Si la cible est sur le banc adverse, on utilise
          // sa propre carte comme source (effet "ping" sur place).
          const targetEl = document.querySelector(
            `[data-battle-card-uid="${uid}"]`,
          ) as HTMLElement | null;
          const logoEl = document.querySelector(
            `[data-energy-logo="self"]`,
          ) as HTMLElement | null;
          const isSelfSide = !!findOnSide(state.self, uid);
          const sourceEl = isSelfSide && logoEl ? logoEl : targetEl;
          if (targetEl && sourceEl) {
            const sR = sourceEl.getBoundingClientRect();
            const tR = targetEl.getBoundingClientRect();
            const id = `fly-${Date.now()}-${uid}`;
            setFlyAnims((prev) => [
              ...prev,
              {
                id,
                fromX: sR.left + sR.width / 2,
                fromY: sR.top + sR.height / 2,
                toX: tR.left + tR.width / 2,
                toY: tR.top + tR.height / 2,
                content: energyEmoji(lastType),
                bg: ENERGY_BADGE_BG[lastType] ?? "bg-zinc-400",
                fg: ENERGY_BADGE_TEXT[lastType] ?? "text-zinc-900",
              },
            ]);
          }
        }
      }
    }
    prevAttachedRef.current = next;
  }, [state]);

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
            <>
              <EmotePicker
                open={emotePickerOpen}
                onToggle={() => setEmotePickerOpen((v) => !v)}
                onSend={(id) => {
                  sendEmote(id);
                  setEmotePickerOpen(false);
                }}
              />
              <button
                onClick={concede}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:bg-rose-500/20 hover:text-rose-200"
              >
                Abandonner
              </button>
            </>
          )}
          {profile ? <UserPill profile={profile} variant="play" /> : null}
        </div>
      </header>
      {/* Emote bubbles flottantes : opp en haut, self en bas. */}
      {emoteOpp ? (
        <EmoteBubble emoteId={emoteOpp.emoteId} position="top" />
      ) : null}
      {emoteSelf ? (
        <EmoteBubble emoteId={emoteSelf.emoteId} position="bottom" />
      ) : null}

      {!profile && (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
          Connecte-toi avec Discord pour rejoindre la partie.
        </div>
      )}

      {profile && state && (
        <main
          className={`flex flex-1 flex-col overflow-hidden ${
            cosmetics ? resolvePlaymatBg(cosmetics.playmat) : "bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.05),transparent_70%)]"
          }`}
        >
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
              onUseAbility={useAbility}
              cosmetics={cosmetics}
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

          {arenaToast && (
            <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 transform rounded-xl border-2 border-amber-300/70 bg-gradient-to-br from-amber-500/30 to-orange-500/20 px-5 py-4 text-sm text-amber-50 shadow-[0_8px_32px_rgba(251,191,36,0.4)] backdrop-blur-md">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🏟️</span>
                <div>
                  <div className="text-base font-extrabold">
                    Champion d&apos;arène vaincu !
                  </div>
                  <div className="mt-1 text-xs">
                    {arenaToast.badgeUnlocked && (
                      <span className="mr-2 rounded-full bg-amber-400/40 px-2 py-0.5 font-bold">
                        🏅 Nouveau badge !
                      </span>
                    )}
                    {arenaToast.packGranted && (
                      <span className="rounded-full bg-emerald-400/30 px-2 py-0.5 font-bold">
                        🎴 +1 booster gratuit
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setArenaToast(null)}
                  className="text-amber-200 hover:text-amber-50"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Animation pile/face : on consomme la queue un par un.
              Le coinId vient des cosmétiques équipés (Pokéball par
              défaut, Super Ball/Hyper Ball/Master Ball/Pikachu si
              acheté). */}
          <CoinFlipQueue
            queue={coinQueue}
            series={coinSeries}
            onConsume={consumeCoin}
            coinId={cosmetics?.coin}
          />

          {/* Bandeau « À toi ! » / « Tour adverse » à chaque changement de tour. */}
          {turnBanner && (
            <TurnChangeBanner
              key={turnBanner.key}
              text={turnBanner.text}
              accent={turnBanner.accent}
              onDone={() => setTurnBanner(null)}
            />
          )}

          {/* Couche d'animations cross-card (énergie qui vole, etc). */}
          <FlyAnimLayer
            anims={flyAnims}
            onConsume={(id) =>
              setFlyAnims((prev) => prev.filter((a) => a.id !== id))
            }
          />

          {/* Modal de révélation (Pokédex, Scrute Main). */}
          {trainerReveal && (
            <TrainerRevealModal
              trainerName={trainerReveal.trainerName}
              cardIds={trainerReveal.cardIds}
              cardById={cardById}
              onClose={() => setTrainerReveal(null)}
            />
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
  onUseAbility,
  cosmetics,
}: {
  state: BattleState;
  cardById: Map<string, PokemonCardData>;
  isMyTurn: boolean;
  gameId: string;
  roomId: string;
  /** Cosmétiques équipés (sleeve/playmat/coin) — propagé du parent. */
  cosmetics?: { sleeve: string; playmat: string; coin: string };
  onSetActive: (handIndex: number) => void;
  onAddBench: (handIndex: number) => void;
  onRemoveBench: (benchIndex: number) => void;
  onConfirmSetup: () => void;
  onEndTurn: () => void;
  onPlayBasic: (handIndex: number) => void;
  onAttachEnergy: (targetUid: string) => void;
  onEvolve: (handIndex: number, targetUid: string) => void;
  onRetreat: (benchIndex: number) => void;
  onAttack: (
    attackIndex: number,
    copyFromUid?: string | null,
    copyAttackIndex?: number | null,
  ) => void;
  onPromoteActive: (benchIndex: number) => void;
  onPlayTrainer: (handIndex: number, targetUid?: string | null) => void;
  onUseAbility: (cardUid: string, targetUid?: string | null) => void;
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
  // Mode "Talent target picker" — quand le joueur active un talent qui
  // demande une cible (Sheauriken, Piège Parfumé). On stocke l'uid du
  // Pokémon qui utilise le talent, et on attend que le joueur clique sur
  // une cible (ennemie ou alliée selon le talent).
  const [pendingAbilityUid, setPendingAbilityUid] = useState<string | null>(
    null,
  );
  // Mode "Copy attack picker" — quand le joueur clique sur l'attaque
  // « Mémoire Ancestrale » de Mew, on stocke l'index de cette attaque et
  // on affiche une modal qui liste les attaques des Pokémon adverses.
  // Click sur une attaque adverse → battle-attack avec les indices.
  const [pendingCopyFor, setPendingCopyFor] = useState<number | null>(null);
  // Main minimisable : permet de masquer la main pour libérer ~200px de
  // hauteur. Auto-redéployée à chaque début de notre tour (la nouvelle
  // carte piochée apparaît dans la main, autant qu'on la voie).
  const [handMinimized, setHandMinimized] = useState(false);
  const prevActiveSeatRef = useRef(state.activeSeat);
  useEffect(() => {
    if (
      prevActiveSeatRef.current !== state.activeSeat &&
      state.activeSeat === state.selfSeat
    ) {
      // Notre tour vient de commencer → on remontre la main si elle
      // était masquée.
      setHandMinimized(false);
    }
    prevActiveSeatRef.current = state.activeSeat;
  }, [state.activeSeat, state.selfSeat]);
  const [zoomedCard, setZoomedCard] = useState<PokemonCardData | null>(null);
  // Carte sous le curseur (main ou board) → preview en grand dans la sidebar.
  const [hoveredCard, setHoveredCard] = useState<PokemonCardData | null>(null);
  const cancelPending = () => {
    setAttachEnergyMode(false);
    setPendingEvolveIdx(null);
    setPendingTrainerIdx(null);
    setPendingAbilityUid(null);
    setPendingCopyFor(null);
  };
  const promptPromote = state.self?.mustPromoteActive;
  // L'adversaire est en train de choisir son nouveau Actif (typiquement
  // suite à Morgane). Pendant ce temps, NOS actions sont bloquées : on
  // attend qu'il ait choisi pour pouvoir continuer notre tour.
  const oppPromoting = !!state.opponent?.mustPromoteActive;
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
        : pendingAbilityUid !== null
          ? (uid: string) => {
              onUseAbility(pendingAbilityUid, uid);
              setPendingAbilityUid(null);
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
        {oppPromoting && (
          <div className="flex items-center justify-center gap-2 border-b border-sky-400/40 bg-sky-400/10 p-2 text-center text-sm text-sky-200">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-300" />
            En attente — l&apos;adversaire choisit son nouveau Pokémon Actif…
          </div>
        )}

        <div className="flex min-h-0 flex-1 gap-2 overflow-y-auto p-2">
          {/* ── Colonne joueur (gauche) — vertical : info → KO → board → contrôles ── */}
          {state.self && (
            <div
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
              data-self-side
            >
              {/* Phase 11.1 : layout horizontal Pokémons à gauche,
                  PlayerInfo + BackRow + Attaques à droite (au niveau
                  de la hauteur du cadre du board). */}
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center gap-3">
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
                      !state.self.mustPromoteActive &&
                      !oppPromoting
                        ? onRetreat
                        : null
                    }
                    onUseAbility={
                      state.phase === "playing" &&
                      isMyTurn &&
                      !state.self.mustPromoteActive &&
                      !oppPromoting
                        ? (uid) => {
                            const c =
                              state.self?.active?.uid === uid
                                ? state.self?.active
                                : state.self?.bench.find((b) => b.uid === uid);
                            if (!c) return;
                            const data = cardById.get(c.cardId);
                            if (data?.kind !== "pokemon" || !data.ability) return;
                            if (ABILITY_NEEDS_TARGET.has(data.ability.name)) {
                              setAttachEnergyMode(false);
                              setPendingEvolveIdx(null);
                              setPendingTrainerIdx(null);
                              setPendingAbilityUid(uid);
                            } else {
                              onUseAbility(uid, null);
                            }
                          }
                        : null
                    }
                    abilitiesUsedThisTurn={
                      new Set(state.self.abilitiesUsedThisTurn)
                    }
                  />
                </div>
                {/* En phase combat : attaques + énergie + Fin du tour à
                    DROITE du board. En phase setup : on rend SelfControls
                    plus bas (centré sous le board) pour le bouton
                    « Confirmer ». */}
                {/* Phase 11.1 : PlayerInfo + BackRow déplacés ici (à
                    droite du board, au-dessus des attaques, au niveau
                    de la hauteur du cadre). */}
                <div className="flex flex-col gap-2">
                  <PlayerInfo player={state.self} isOpponent={false} />
                  <BackRow
                    koCount={state.self.koCount}
                    deckSize={state.self.deckSize}
                    discardCount={state.self.discardCount}
                    handCount={state.self.handCount}
                  />
                  {/* Phase 11.2 : SelfControls TOUJOURS rendu dans la
                      colonne droite (avant : setup → en bas centré,
                      playing → ici). Le bouton « Confirmer mon équipe »
                      apparaît donc à droite du board en setup, comme
                      pour les attaques en playing. */}
                  <SelfControls
                    state={state}
                    isMyTurn={isMyTurn}
                    cardById={cardById}
                    onConfirmSetup={onConfirmSetup}
                    onEndTurn={onEndTurn}
                    onAttack={onAttack}
                    onSelectCopyAttack={(idx) => {
                      cancelPending();
                      setPendingCopyFor(idx);
                    }}
                    oppPromoting={oppPromoting}
                    /* Énergie pending : intégrée dans SelfControls entre
                       les attaques et le bouton Fin du tour. Le drag (via
                       EnergyAttach) marche depuis n'importe où grâce aux
                       pointer events + document.elementFromPoint. */
                    pendingEnergy={
                      state.phase === "playing" &&
                      !state.self.energyAttachedThisTurn &&
                      isMyTurn &&
                      !oppPromoting
                        ? state.self.pendingEnergy
                        : null
                    }
                    onAttachEnergy={onAttachEnergy}
                    onActivateAttachMode={() => setAttachEnergyMode(true)}
                  />
                </div>
              </div>
              {(attachEnergyMode ||
                pendingEvolveIdx !== null ||
                pendingTrainerIdx !== null ||
                pendingAbilityUid !== null) && (
                <div className="flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-xs text-amber-200">
                  {attachEnergyMode
                    ? "Choisis un Pokémon à qui attacher l'Énergie."
                    : pendingEvolveIdx !== null
                      ? "Choisis le Pokémon à faire évoluer."
                      : pendingTrainerIdx !== null
                        ? "Choisis le Pokémon ciblé par la carte Dresseur."
                        : "Choisis la cible du talent."}
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

          {/* ── Colonne adversaire (droite) — Phase 11.1 + 11.2 : layout
              symétrique du joueur. PlayerInfo + BackRow + HandHidden à
              GAUCHE du board adverse (au niveau de la hauteur du cadre),
              board à droite. ── */}
          {state.opponent && (
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex items-start gap-2">
                {/* Phase 11.1 + 11.2 : PlayerInfo + BackRow + HandHidden
                    tous regroupés à gauche du board adverse (mirroir
                    symétrique du joueur). HandHidden était auparavant
                    rendu en dessous du board, maintenant sous le BackRow. */}
                <div className="flex flex-col items-stretch gap-2">
                  <PlayerInfo player={state.opponent} isOpponent />
                  <BackRow
                    koCount={state.opponent.koCount}
                    deckSize={state.opponent.deckSize}
                    discardCount={state.opponent.discardCount}
                    handCount={state.opponent.handCount}
                  />
                  <HandHidden
                    count={state.opponent.handCount}
                    sleeveGradient={
                      cosmetics
                        ? resolveSleeveGradient(cosmetics.sleeve)
                        : undefined
                    }
                  />
                </div>
                <BoardArea
                  active={state.opponent.active}
                  bench={state.opponent.bench}
                  cardById={cardById}
                  isOpponent
                  onZoomCard={setZoomedCard}
                  onHoverCard={setHoveredCard}
                  /* Quand on est en mode talent qui cible l'adversaire (ex
                     Sheauriken, Piège Parfumé), on rend le board adverse
                     cliquable pour sélectionner la cible. */
                  attachMode={
                    pendingAbilityUid !== null ? attachModeHandler : null
                  }
                />
              </div>
            </div>
          )}
        </div>

        {/* Hand pleine largeur en bas (cartes visibles en entier).
            Minimisable via le bouton ▼/▲ pour libérer ~200px de hauteur
            quand on n'a pas besoin de la main (ex tour adverse). Re-show
            auto à chaque début de notre tour. */}
        {state.self && (
          <div className="shrink-0 border-t border-white/10 bg-black/40">
            <button
              onClick={() => setHandMinimized((v) => !v)}
              className="flex w-full items-center justify-center gap-2 border-b border-white/5 py-1 text-[10px] uppercase tracking-widest text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
              title={
                handMinimized
                  ? "Afficher la main"
                  : "Masquer la main (libère de l'espace)"
              }
            >
              {handMinimized ? "▲" : "▼"} Ta main ({state.self.hand.length})
            </button>
            {!handMinimized && (
              <div className="p-3">
                <SelfHand
                  state={state}
                  cardById={cardById}
                  isMyTurn={isMyTurn}
                  oppPromoting={oppPromoting}
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
          </div>
        )}

        {/* Modal zoom carte (depuis click sur board uniquement) */}
        <CardZoomModal card={zoomedCard} onClose={() => setZoomedCard(null)} />

        {/* Modal copy attack (Mew « Mémoire Ancestrale »). */}
        {pendingCopyFor !== null && (
          <CopyAttackPicker
            opponent={state.opponent}
            cardById={cardById}
            onPick={(uid, attackIdx) => {
              onAttack(pendingCopyFor, uid, attackIdx);
              setPendingCopyFor(null);
            }}
            onCancel={() => setPendingCopyFor(null)}
          />
        )}

        {state.winner && (
          <div className="flex-shrink-0 bg-black/80 p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-2xl font-bold text-amber-300">
              <Trophy size={24} aria-hidden="true" />
              {state.winner === state.selfSeat ? "Victoire !" : "Défaite"}
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
      <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-black/40 p-3 xl:w-80 2xl:w-96">
        <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">
          Aperçu
        </div>
        {/* Carte qui remplit toute la largeur de la sidebar (pas de
            max-width) — proportions 5:7 préservées. */}
        <div className="aspect-[5/7] w-full">
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
    <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-white/10 bg-black/40 xl:w-80 2xl:w-96">
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

/** Décore les lignes de log : le serveur ne push plus que 3 types de lignes
 *  (attaques, utilisation de cartes Dresseur, fin de partie). On garde
 *  quand même quelques filtres défensifs pour les logs résiduels en
 *  mémoire venant d'une session pré-déploiement. */
function decorateLog(
  log: string[],
): { emoji: string; text: string; color: string }[] {
  return log
    .map((line) => {
      // Fin de partie (préfixée 🏆 côté serveur).
      if (/gagne|abandonne|deck-out/i.test(line)) {
        return { emoji: "🏆", text: line, color: "text-amber-200 font-bold" };
      }
      // Attaque : « Pikachu utilise Éclair → 40 dégâts à Electhor (super
      // efficace !) → K.O. ! ». Détecté par la présence de « → … dégâts ».
      if (/→\s*\d+\s*dégâts/i.test(line)) {
        const isKo = /K\.O\./.test(line);
        const isWeakness = /super efficace/i.test(line);
        return {
          emoji: isKo ? "💥" : "⚔️",
          text: line,
          color: isWeakness
            ? "text-amber-200 font-semibold"
            : "text-rose-200",
        };
      }
      // Carte Dresseur : « rimkidinki utilise Potion. »
      if (/\butilise\b/i.test(line)) {
        return { emoji: "🃏", text: line, color: "text-sky-200" };
      }
      // Logs résiduels / non reconnus : visibles mais discrets.
      return { emoji: "·", text: line, color: "text-zinc-500" };
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
  // Phase 11.3 : `handCount` et `discardCount` retirés de l'affichage
  // (jugés inutiles : la main est visible en bas, la défausse via le
  // bouton dédié). On garde les paramètres pour la compatibilité.
  void handCount;
  void discardCount;
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-300">
      {/* KO progress en cases — agrandi pour lisibilité 1920×1080 */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-widest text-zinc-400">
          KO <span className="font-bold tabular-nums text-amber-200">{koCount}</span>
          <span className="text-zinc-500">/{BATTLE_CONFIG.koWinTarget}</span>
        </span>
        <div className="flex gap-1">
          {Array.from({ length: BATTLE_CONFIG.koWinTarget }, (_, i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded border-2 transition-colors ${
                i < koCount
                  ? "border-amber-300/80 bg-gradient-to-br from-amber-400 to-amber-600 shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                  : "border-white/10 bg-white/[0.02]"
              }`}
            />
          ))}
        </div>
      </div>
      <span className="h-4 w-px bg-white/10" />
      <span className="tabular-nums" title="Cartes restantes dans le deck">
        📚 <span className="font-bold text-zinc-100">{deckSize}</span>
      </span>
    </div>
  );
}

/** Main cachée de l'adversaire — affichée en bas de sa colonne, en mini
 *  cartes empilées horizontalement (effet "fan" léger). */
function HandHidden({
  count,
  sleeveGradient,
}: {
  count: number;
  /** Gradient Tailwind du sleeve équipé (ex. "from-orange-700 via-red-800
   *  to-orange-900"). Si non fourni → bleu indigo classique. */
  sleeveGradient?: string;
}) {
  const gradient =
    sleeveGradient ?? "from-indigo-600 to-indigo-900";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-widest text-zinc-400">
        Main <span className="font-bold text-zinc-100 tabular-nums">{count}</span>
      </span>
      <div className="flex">
        {Array.from({ length: Math.min(count, 7) }, (_, i) => (
          <div
            key={i}
            className={`-ml-3 h-14 w-10 rounded border border-white/20 bg-gradient-to-br ${gradient} shadow first:ml-0 xl:h-16 xl:w-12`}
          />
        ))}
        {count > 7 && (
          <span className="ml-1 text-xs font-bold text-zinc-300">+{count - 7}</span>
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
  onUseAbility,
  abilitiesUsedThisTurn,
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
  /** Si défini (côté allié uniquement), un bouton ⭐ s'affiche sur les
   *  cartes ayant un talent activable. Le clic appelle ce callback. */
  onUseAbility?: ((cardUid: string) => void) | null;
  abilitiesUsedThisTurn?: Set<string>;
}) {
  const ownActions = !isOpponent;

  // Build le handler de click sur une carte du board (Actif ou Banc).
  // Priorité : attachMode > promoteMode > retreat > zoom.
  // Note : `attachMode` est autorisé même sur le board adverse (parent
  // décide de le passer ou pas selon le mode courant — typiquement
  // pour les talents qui ciblent l'adversaire).
  function makeCardHandler(
    battleCard: BattleCard,
    cardData: PokemonCardData,
    benchIndex: number | null,
  ) {
    return () => {
      if (attachMode) {
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
      className={`flex flex-col items-center gap-4 rounded-xl border-2 px-2 py-2 ${
        isOpponent
          ? "border-rose-400/30 bg-rose-950/20"
          : "border-emerald-400/30 bg-emerald-950/20"
      }`}
    >
      {/* Active — wrapper AnimatePresence : si l'Actif est KO ou retraité,
          on anime sa sortie (fade + shrink + rotation). Container
          dimensionné sur la même sizeClass que la carte interne pour
          que le layout réserve la bonne place (avant : container fixe
          h-56 w-40 plus petit que la carte → carte overflow). */}
      <div className="relative w-36 h-52 lg:w-40 lg:h-56 xl:w-44 xl:h-60 2xl:w-48 2xl:h-64">
        <AnimatePresence mode="popLayout">
          {active
            ? (() => {
                const realData = cardById.get(active.cardId);
                const data = getCardForBattle(active.cardId, cardById);
                if (!realData || !data) return null;
                const handler = makeCardHandler(active, realData, null);
                return (
                  <motion.button
                    key={active.uid}
                    layout
                    initial={{ opacity: 0, scale: 0.85, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{
                      opacity: 0,
                      scale: 0.4,
                      rotate: 12,
                      y: 24,
                      filter: "grayscale(100%) brightness(0.5)",
                    }}
                    transition={{ duration: 0.55, ease: "easeOut" }}
                    onClick={handler}
                    onMouseEnter={() => onHoverCard?.(realData)}
                    onMouseLeave={() => onHoverCard?.(null)}
                    {...makeDropProps(active)}
                    className={`absolute inset-0 rounded-lg ${
                      ownActions && attachMode
                        ? "ring-2 ring-amber-300 hover:ring-amber-200"
                        : "hover:ring-2 hover:ring-white/30"
                    }`}
                    title={data.name}
                  >
                    <BoardCard card={active} cardById={cardById} large />
                  </motion.button>
                );
              })()
            : (
              <motion.div
                key="placeholder-active"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-white/10 text-xs text-zinc-500"
              >
                Actif
              </motion.div>
            )}
        </AnimatePresence>
        {/* Bouton ⭐ Talent (overlay top-left de l'Actif) */}
        {active &&
          ownActions &&
          (() => {
            const data = getCardForBattle(active.cardId, cardById);
            if (data?.ability?.kind !== "activated") return null;
            return (
              <AbilityButton
                ability={data.ability}
                used={abilitiesUsedThisTurn?.has(active.uid) ?? false}
                onClick={() => onUseAbility?.(active.uid)}
                disabled={!onUseAbility}
              />
            );
          })()}
      </div>
      {/* Bench (Pocket : max 3 slots) — chaque carte keyée par uid pour
          que AnimatePresence anime son entrée / sa sortie. Cards qui
          shiftent (ex bench[0] KO → bench[1] devient bench[0]) glissent
          via `layout`. */}
      <div className="flex gap-2">
        {Array.from({ length: BATTLE_CONFIG.maxBench }, (_, i) => {
          const card = bench[i];
          return (
            <div
              key={`bench-slot-${i}`}
              className="relative w-24 h-32 lg:w-28 lg:h-36 xl:w-32 xl:h-40"
            >
              <AnimatePresence mode="popLayout">
                {card
                  ? (() => {
                      const realData = cardById.get(card.cardId);
                      const data = getCardForBattle(card.cardId, cardById);
                      if (!realData || !data) return null;
                      const handler = makeCardHandler(card, realData, i);
                      return (
                        <motion.button
                          key={card.uid}
                          layout
                          initial={{ opacity: 0, scale: 0.7, y: 12 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{
                            opacity: 0,
                            scale: 0.4,
                            rotate: 10,
                            filter: "grayscale(100%) brightness(0.5)",
                          }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                          onClick={handler}
                          onMouseEnter={() => onHoverCard?.(realData)}
                          onMouseLeave={() => onHoverCard?.(null)}
                          {...makeDropProps(card)}
                          className={`absolute inset-0 rounded-lg ${
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
                        </motion.button>
                      );
                    })()
                  : (
                    <motion.div
                      key={`placeholder-bench-${i}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-white/10 text-[10px] text-zinc-500"
                    >
                      Banc
                    </motion.div>
                  )}
              </AnimatePresence>
              {/* Bouton ⭐ Talent (overlay top-left du banc) */}
              {card &&
                ownActions &&
                (() => {
                  const d = getCardForBattle(card.cardId, cardById);
                  if (d?.ability?.kind !== "activated") return null;
                  return (
                    <AbilityButton
                      ability={d.ability}
                      used={
                        abilitiesUsedThisTurn?.has(card.uid) ?? false
                      }
                      onClick={() => onUseAbility?.(card.uid)}
                      disabled={!onUseAbility}
                      small
                    />
                  );
                })()}
            </div>
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
  // Vue "comme un Pokémon" — pour les Fossiles, synthétise un Pokémon
  // de Base 40 PV / Incolore.
  const data = getCardForBattle(card.cardId, cardById);

  // ─── Animations card-local — détectées via state diffs sur card ───────
  // Damage tick (attaque OU poison/brûlure) : on garde la valeur précédente,
  // si la nouvelle est plus haute on déclenche un floating number + un
  // flash rouge + un shake.
  const prevDamageRef = useRef(card.damage);
  const [damageBurst, setDamageBurst] = useState<{
    amount: number;
    key: number;
  } | null>(null);
  const [hitKey, setHitKey] = useState(0);
  useEffect(() => {
    if (card.damage > prevDamageRef.current) {
      const delta = card.damage - prevDamageRef.current;
      setDamageBurst({ amount: delta, key: Date.now() });
      setHitKey((k) => k + 1);
      const t = window.setTimeout(() => setDamageBurst(null), 1200);
      prevDamageRef.current = card.damage;
      return () => window.clearTimeout(t);
    }
    prevDamageRef.current = card.damage;
  }, [card.damage]);

  // Heal tick (Potion, Erika) : damage descend → +N vert qui flotte.
  const [healBurst, setHealBurst] = useState<{
    amount: number;
    key: number;
  } | null>(null);
  useEffect(() => {
    // Note: prevDamageRef est mis à jour dans l'effet damage ci-dessus,
    // donc on doit aussi gérer la baisse séparément. On utilise un autre
    // ref pour heal.
    /* heal handled in same effect via separate ref below */
  }, []);
  const prevDamageHealRef = useRef(card.damage);
  useEffect(() => {
    if (card.damage < prevDamageHealRef.current) {
      const delta = prevDamageHealRef.current - card.damage;
      setHealBurst({ amount: delta, key: Date.now() });
      const t = window.setTimeout(() => setHealBurst(null), 1200);
      prevDamageHealRef.current = card.damage;
      return () => window.clearTimeout(t);
    }
    prevDamageHealRef.current = card.damage;
  }, [card.damage]);

  // Évolution : le `cardId` change pour le même `uid` (le BattleCard reste
  // le même côté serveur). Flash blanc + scale.
  const prevCardIdRef = useRef(card.cardId);
  const [evoKey, setEvoKey] = useState(0);
  useEffect(() => {
    if (card.cardId !== prevCardIdRef.current) {
      setEvoKey((k) => k + 1);
      prevCardIdRef.current = card.cardId;
    }
  }, [card.cardId]);

  // Énergie attachée : on track les longueurs successives, et on flag
  // l'index de la nouvelle énergie pour la pop-in animer.
  const prevEnergyCountRef = useRef(card.attachedEnergies.length);
  const [newEnergyIdx, setNewEnergyIdx] = useState<number | null>(null);
  useEffect(() => {
    if (card.attachedEnergies.length > prevEnergyCountRef.current) {
      setNewEnergyIdx(card.attachedEnergies.length - 1);
      const t = window.setTimeout(() => setNewEnergyIdx(null), 700);
      prevEnergyCountRef.current = card.attachedEnergies.length;
      return () => window.clearTimeout(t);
    }
    prevEnergyCountRef.current = card.attachedEnergies.length;
  }, [card.attachedEnergies.length]);

  if (!data) return null;
  // Pocket : carte officielle FR (tcgdex) en ratio 5:7. Overlays :
  //   • HP courant en bas (gros, rouge si dégâts)
  //   • Énergies attachées sous la carte (pastilles colorées par type)
  //   • Statuses en haut à droite (badges emoji)
  // Tailles responsive : Active (large) plus grosse que Bench. Compactées
  // (~15-20% en moins par rapport à la refonte UX 1920×1080 initiale)
  // pour tenir verticalement sur 1080p sans scroll. Largeurs réduites en
  // proportion pour garder le ratio 5:7 des cartes.
  const sizeClass = large
    ? "w-36 h-52 lg:w-40 lg:h-56 xl:w-44 xl:h-60 2xl:w-48 2xl:h-64"
    : "w-24 h-32 lg:w-28 lg:h-36 xl:w-32 xl:h-40";
  const remainingHp = Math.max(0, data.hp - card.damage);
  const damaged = card.damage > 0;
  const hpPct = Math.max(0, Math.min(1, remainingHp / data.hp));

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Wrapper qui shake quand on est touché + card foil 3D au hover */}
      <motion.div
        key={`shake-${hitKey}`}
        animate={
          hitKey > 0
            ? { x: [0, -4, 4, -3, 3, -2, 2, 0] }
            : undefined
        }
        transition={{ duration: 0.45, ease: "easeOut" }}
        className={`relative ${sizeClass}`}
        style={{ perspective: "800px" }}
        data-battle-card-uid={card.uid}
      >
        <div
          className="card-foil relative h-full w-full overflow-hidden rounded-lg border border-white/10 bg-black/40 shadow-xl transition-transform duration-200 ease-out"
          title={data.name}
          style={{ transformStyle: "preserve-3d" }}
          onMouseMove={(e) => {
            // Parallax 3D au hover : la carte tilt vers la souris.
            const el = e.currentTarget;
            const r = el.getBoundingClientRect();
            const cx = (e.clientX - r.left) / r.width - 0.5;
            const cy = (e.clientY - r.top) / r.height - 0.5;
            const rotY = cx * 14;
            const rotX = -cy * 14;
            el.style.transform = `rotateY(${rotY}deg) rotateX(${rotX}deg) scale(1.04)`;
            // Reflet brillant qui suit la souris (positionné via custom prop).
            el.style.setProperty("--shine-x", `${(cx + 0.5) * 100}%`);
            el.style.setProperty("--shine-y", `${(cy + 0.5) * 100}%`);
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget;
            el.style.transform = "";
            el.style.removeProperty("--shine-x");
            el.style.removeProperty("--shine-y");
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.image}
            alt={data.name}
            className="h-full w-full object-contain"
            loading="lazy"
          />
          {/* Reflet brillant qui glisse au hover (visible surtout sur les
              cartes rares). */}
          <div className="card-shine pointer-events-none absolute inset-0" />

          {/* Flash rouge à l'impact (overlay) */}
          {hitKey > 0 && (
            <motion.div
              key={`flash-${hitKey}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.7, 0] }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="pointer-events-none absolute inset-0 bg-rose-500 mix-blend-multiply"
            />
          )}

          {/* Flash blanc à l'évolution */}
          {evoKey > 0 && (
            <motion.div
              key={`evo-${evoKey}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: [0, 1, 0], scale: [0.95, 1.1, 1] }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="pointer-events-none absolute inset-0 bg-white"
            />
          )}

          {/* Barre HP en bas (jauge verte → rouge selon ratio) */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/90 via-black/60 to-transparent px-1.5 py-1.5">
            <div className="flex items-baseline justify-end gap-1 tabular-nums">
              {/* HP descend smooth via composant dédié, gros texte lisible */}
              <span
                className={`text-base font-extrabold ${
                  damaged ? "text-rose-300" : "text-emerald-200"
                } ${large ? "lg:text-lg xl:text-xl" : "lg:text-base"}`}
              >
                <SmoothNumber value={remainingHp} />
              </span>
              <span className={`font-semibold text-zinc-400 ${large ? "text-sm" : "text-[11px]"}`}>
                /{data.hp}
              </span>
            </div>
            <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-black/50">
              <motion.div
                animate={{ width: `${hpPct * 100}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className={`h-full ${
                  hpPct > 0.5
                    ? "bg-emerald-400"
                    : hpPct > 0.25
                      ? "bg-amber-400"
                      : "bg-rose-500"
                }`}
              />
            </div>
          </div>

          {/* Statuses en haut à droite + watermark plein carte */}
          {card.statuses.length > 0 && (
            <>
              <div className="absolute right-1 top-1 flex gap-0.5 rounded bg-black/85 px-1.5 py-0.5 text-base shadow ring-1 ring-white/20">
                {card.statuses.map((s, i) => (
                  <span key={i} title={statusLabel(s)}>
                    {statusEmoji(s)}
                  </span>
                ))}
              </div>
              {/* Watermark central : on voit instantanément l'état même de
                  loin / sur petite carte. Couleur tranchée par status. */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest shadow-lg ring-1 ${
                    card.statuses.includes("poisoned")
                      ? "bg-violet-500/85 text-violet-50 ring-violet-300"
                      : card.statuses.includes("burned")
                        ? "bg-rose-500/85 text-rose-50 ring-rose-300"
                        : card.statuses.includes("paralyzed")
                          ? "bg-amber-500/85 text-amber-950 ring-amber-300"
                          : card.statuses.includes("asleep")
                            ? "bg-sky-500/85 text-sky-50 ring-sky-300"
                            : "bg-fuchsia-500/85 text-fuchsia-50 ring-fuchsia-300"
                  }`}
                >
                  {statusLabel(card.statuses[0])}
                </span>
              </div>
            </>
          )}

          {/* Bordure dorée + label "ex" si Pokemon EX (KO = +2 récompenses) */}
          {data.isEx && (
            <>
              <div
                className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-amber-300/80 shadow-[inset_0_0_18px_rgba(251,191,36,0.4)]"
                aria-hidden
              />
              <span className="absolute left-1 top-1 rounded bg-gradient-to-br from-amber-300 to-amber-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-amber-950 shadow ring-1 ring-amber-200">
                EX
              </span>
            </>
          )}

          {/* Floating damage number (au-dessus de la carte) */}
          <AnimatePresence>
            {damageBurst && (
              <motion.div
                key={damageBurst.key}
                initial={{ opacity: 0, y: 0, scale: 0.6 }}
                animate={{ opacity: [0, 1, 1, 0], y: -56, scale: 1.6 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.1, ease: "easeOut" }}
                className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 text-3xl font-black text-rose-400 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
              >
                -{damageBurst.amount}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floating heal number */}
          <AnimatePresence>
            {healBurst && (
              <motion.div
                key={healBurst.key}
                initial={{ opacity: 0, y: 0, scale: 0.6 }}
                animate={{ opacity: [0, 1, 1, 0], y: -50, scale: 1.4 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.1, ease: "easeOut" }}
                className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 text-2xl font-black text-emerald-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
              >
                +{healBurst.amount}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Pastilles d'énergies attachées (sous la carte). Plus grandes
          sur l'Active (large) qu'en Bench. */}
      {card.attachedEnergies.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1 px-0.5">
          {card.attachedEnergies.map((e, i) => {
            const t = e as PokemonEnergyType;
            const bg = ENERGY_BADGE_BG[t] ?? "bg-zinc-400";
            const fg = ENERGY_BADGE_TEXT[t] ?? "text-zinc-900";
            const isNew = newEnergyIdx === i;
            return (
              <motion.span
                key={i}
                initial={isNew ? { scale: 0, rotate: -180 } : false}
                animate={isNew ? { scale: [0, 1.3, 1], rotate: 0 } : undefined}
                transition={{ duration: 0.5, ease: "backOut" }}
                className={`flex items-center justify-center rounded-full font-bold shadow ring-1 ring-black/30 ${
                  large ? "h-6 w-6 text-sm" : "h-5 w-5 text-xs"
                } ${bg} ${fg}`}
                title={e}
              >
                {energyEmoji(t)}
              </motion.span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Petit bouton ⭐ qui pop sur le coin haut-gauche d'une carte du board pour
 *  activer son Talent. Glow ambré pulsant tant que disponible, grisé une
 *  fois utilisé ce tour. Tooltip = nom + effet du talent. */
function AbilityButton({
  ability,
  used,
  onClick,
  disabled,
  small,
}: {
  ability: PokemonAbility;
  used: boolean;
  onClick: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  const isDisabled = disabled || used;
  const size = small ? "h-8 w-8 text-sm" : "h-10 w-10 text-base lg:h-11 lg:w-11";
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!isDisabled) onClick();
      }}
      disabled={isDisabled}
      title={`Talent : ${ability.name}\n\n${ability.effect}${used ? "\n\n(Déjà utilisé ce tour)" : ""}`}
      className={`pointer-events-auto absolute -left-2 -top-2 z-10 flex items-center justify-center rounded-full border-2 font-bold shadow-lg transition-all ${size} ${
        isDisabled
          ? "border-zinc-600/60 bg-zinc-800/90 text-zinc-500"
          : "border-amber-300/80 bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 hover:scale-110 animate-pulse cursor-pointer"
      }`}
    >
      ⭐
    </button>
  );
}

/** Petit composant qui anime un nombre vers une cible (utile pour les PV
 *  qui descendent / remontent en douceur au lieu d'un saut net). */
function SmoothNumber({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const duration = 600; // ms
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (to - from) * eased);
      setDisplayed(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{displayed}</>;
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

/** Label court FR pour watermark plein-carte. */
function statusLabel(s: string | undefined): string {
  switch (s) {
    case "asleep":
      return "Endormi";
    case "burned":
      return "Brûlé";
    case "confused":
      return "Confus";
    case "paralyzed":
      return "Paralysé";
    case "poisoned":
      return "Empoisonné";
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
  onSelectCopyAttack,
  oppPromoting,
  pendingEnergy,
  onAttachEnergy,
  onActivateAttachMode,
}: {
  state: BattleState;
  isMyTurn: boolean;
  cardById: Map<string, PokemonCardData>;
  onConfirmSetup: () => void;
  onEndTurn: () => void;
  onAttack: (
    attackIndex: number,
    copyFromUid?: string | null,
    copyAttackIndex?: number | null,
  ) => void;
  /** Le joueur a cliqué sur une attaque "copy" (Mémoire Ancestrale). Le
   *  parent affiche alors un picker des attaques adverses à copier. */
  onSelectCopyAttack: (attackIndex: number) => void;
  oppPromoting: boolean;
  /** Énergie à attacher ce tour (null si déjà attachée ou pas notre tour).
   *  Optionnels : ils sont uniquement utilisés en phase « playing ». */
  pendingEnergy?: PokemonEnergyType | null;
  onAttachEnergy?: (targetUid: string) => void;
  onActivateAttachMode?: () => void;
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
  // Vue Pokémon (synthétise les Fossiles avec 0 attaque) — c'est ce qu'on
  // veut pour décider quoi rendre dans la liste « Attaques ».
  const data = active ? getCardForBattle(active.cardId, cardById) : null;
  const attacks = data?.attacks ?? [];
  const blocked =
    !isMyTurn ||
    !!self?.mustPromoteActive ||
    oppPromoting ||
    (active?.playedThisTurn ?? false);

  return (
    <div className="flex w-[190px] shrink-0 flex-col items-stretch gap-2 xl:w-[210px] 2xl:w-[230px]">
      {/* Liste des attaques (à droite du board joueur) */}
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-zinc-500">
        <Swords size={12} aria-hidden="true" />
        Attaques
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
        // Si l'attaque est de type "copy" (Mémoire Ancestrale), on
        // bascule en mode picker au lieu d'envoyer directement.
        const isCopy = isCopyOppAttack(a.text);
        return (
          <button
            key={i}
            disabled={disabled}
            onClick={() => {
              if (isCopy) onSelectCopyAttack(i);
              else onAttack(i);
            }}
            className={`flex items-center justify-between gap-2 rounded-md border-2 px-2 py-1.5 text-left text-xs transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
              disabled
                ? "border-rose-400/20 bg-rose-500/5 text-rose-300/60"
                : "border-rose-400/60 bg-rose-500/15 text-rose-50 shadow-md hover:scale-[1.02] hover:bg-rose-500/25"
            }`}
            // Description complète gardée en title pour hover (au cas
            // où le joueur veut connaître l'effet — pas dans le bouton).
            title={a.text ?? a.name}
          >
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
            <span className="flex-1 truncate text-sm font-bold">
              {a.name}
            </span>
            {a.damage !== undefined && (
              <span className="text-base font-black tabular-nums text-amber-300">
                {a.damage}
                {a.damageSuffix ?? ""}
              </span>
            )}
          </button>
        );
      })}

      {/* Énergie pending entre Attaques et Fin du tour. Drag avec
          pointer events natifs depuis ce point vers n'importe quelle
          carte alliée du board. */}
      {pendingEnergy && onAttachEnergy && onActivateAttachMode && (
        <div className="mt-2 flex flex-col items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/5 px-2 py-2">
          <span className="text-[10px] uppercase tracking-widest text-amber-300/70">
            ⚡ Énergie à attacher
          </span>
          <EnergyAttach
            energyType={pendingEnergy}
            onDropOnUid={onAttachEnergy}
            onClickFallback={onActivateAttachMode}
          />
          <span className="text-[9px] text-zinc-500">
            Glisse-la sur un Pokémon allié
          </span>
        </div>
      )}

      {/* Bouton "Fin du tour" — gros, isolé, gradient pour bien sauter
          aux yeux puisque c'est l'action de bouclage du tour. */}
      <button
        onClick={onEndTurn}
        disabled={!isMyTurn || !!self?.mustPromoteActive || oppPromoting}
        title={
          oppPromoting
            ? "Attends que l'adversaire choisisse son nouveau Actif"
            : undefined
        }
        className="mt-3 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 px-5 py-3 text-base font-extrabold text-amber-950 shadow-[0_4px_18px_rgba(251,191,36,0.4)] transition-all hover:from-amber-300 hover:to-amber-500 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
      >
        🏁 Fin du tour
      </button>
    </div>
  );
}

/** Énergie « pending » à attacher à un Pokémon allié. Drag & drop natif via
 *  pointer events :
 *  - pointerdown sur le badge → on commence le drag, capture le pointeur,
 *    affiche un fantôme de l'énergie qui suit la souris
 *  - pointerup sur n'importe quel élément → on cherche le data-attribute
 *    `data-battle-card-uid` dans la chaîne de parents ; s'il appartient à
 *    notre côté (data-self-side parent), on attache. Sinon, on annule.
 *  Le clic court (pointerdown + pointerup au même endroit) déclenche le
 *  fallback "mode attach" classique pour les utilisateurs qui préfèrent
 *  cliquer-cliquer. */
function EnergyAttach({
  energyType,
  onDropOnUid,
  onClickFallback,
}: {
  energyType: PokemonEnergyType;
  onDropOnUid: (uid: string) => void;
  onClickFallback: () => void;
}) {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const startRef = useRef<{ x: number; y: number; moved: boolean } | null>(
    null,
  );

  function onPointerDown(e: React.PointerEvent<HTMLSpanElement>) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    startRef.current = { x: startX, y: startY, moved: false };
    setDrag({ x: startX, y: startY });

    const onMove = (ev: PointerEvent) => {
      if (startRef.current) {
        const dx = ev.clientX - startRef.current.x;
        const dy = ev.clientY - startRef.current.y;
        // Seuil : 4px de mouvement pour considérer un drag.
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          startRef.current.moved = true;
        }
      }
      setDrag({ x: ev.clientX, y: ev.clientY });
    };
    const onUp = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      const movedFlag = startRef.current?.moved ?? false;
      startRef.current = null;
      setDrag(null);

      // Si on n'a quasi pas bougé → fallback click (active le mode Attacher).
      if (!movedFlag) {
        onClickFallback();
        return;
      }

      // Drag terminé : on cherche l'élément sous la souris.
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!target) return;
      const cardEl = target.closest(
        "[data-battle-card-uid]",
      ) as HTMLElement | null;
      if (!cardEl) return;
      const uid = cardEl.getAttribute("data-battle-card-uid");
      if (!uid) return;
      // On vérifie que la carte appartient bien à NOTRE côté (data-self-side
      // est posé en haut de la colonne du joueur).
      const ownerSide = cardEl.closest("[data-self-side]");
      if (!ownerSide) return;
      onDropOnUid(uid);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  return (
    <>
      <span
        onPointerDown={onPointerDown}
        data-energy-logo="self"
        className={`flex h-12 w-12 cursor-grab select-none items-center justify-center rounded-full text-2xl font-bold shadow-xl ring-2 ring-amber-300/60 active:cursor-grabbing animate-pulse ${
          ENERGY_BADGE_BG[energyType]
        } ${ENERGY_BADGE_TEXT[energyType]}`}
        title="Glisse cette énergie sur un Pokémon allié pour l'attacher"
      >
        {energyEmoji(energyType)}
      </span>
      {/* Fantôme qui suit le pointeur pendant le drag */}
      {drag && (
        <div
          style={{
            position: "fixed",
            left: drag.x - 24,
            top: drag.y - 24,
            pointerEvents: "none",
            zIndex: 100,
          }}
          className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl font-bold shadow-2xl ring-4 ring-white/40 ${
            ENERGY_BADGE_BG[energyType]
          } ${ENERGY_BADGE_TEXT[energyType]}`}
        >
          {energyEmoji(energyType)}
        </div>
      )}
    </>
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

// Cartes Dresseur supportées par le moteur. La résolution exacte des effets
// vit côté serveur (handlePlayTrainer dans party/src/battle.ts) — ces sets
// servent juste au client pour décider du flow d'UI (target picker ou pas).
const TRAINER_NEEDS_TARGET = new Set<string>([
  "Potion",
  "Erika",
  "Pierre",
  "Ondine",
]);
const TRAINER_NO_TARGET = new Set<string>([
  "Poké Ball",
  "Recherches Professorales",
  "Vitesse +",
  "Pokédex",
  "Scrute Main",
  "Carton Rouge",
  "Giovanni",
  "Auguste",
  "Koga",
  "Major Bob",
  "Morgane",
]);

/** Fossiles : cartes Dresseur qui se POSENT au Banc comme un Pokémon de
 *  Base à 40 PV (au lieu de passer par battle-play-trainer). On l'autorise
 *  côté UI via le flow d'évolution/setup. */
const FOSSIL_NAMES = new Set<string>([
  "Vieil Ambre",
  "Fossile Dôme",
  "Fossile Nautile",
]);

/** Talents qui demandent une cible (Pokémon adverse) — l'UI bascule en mode
 *  picker au clic du bouton ⭐, et le 2nd clic envoie la cible au serveur. */
const ABILITY_NEEDS_TARGET = new Set<string>([
  "Piège Parfumé", // Empiflor : cible un Banc adverse
  "Sheauriken", // Amphinobi : cible un Pokémon adverse
]);

/** Détecte si une attaque est de type "copy" (Mew « Mémoire Ancestrale »).
 *  Si oui, le client doit afficher un picker pour choisir une attaque
 *  adverse à copier au lieu d'envoyer directement battle-attack. */
function isCopyOppAttack(attackText: string | null | undefined): boolean {
  if (!attackText) return false;
  return /Choisissez l'une des attaques des Pokémon de votre adversaire et utilisez-la/i.test(
    attackText,
  );
}

/** Vue "comme un Pokémon" d'une carte sur le board. Pour les vrais Pokémon,
 *  retourne la carte telle quelle. Pour les Fossiles, synthétise un Pokémon
 *  de Base 40 PV / Incolore / 0 attaque / coût de retraite ∞ — équivalent
 *  client de `getCardForBattle` côté serveur. Utilisé partout où on rend
 *  une carte sur le board (BoardArea, BoardCard, SelfControls). */
function fossilAsPokemon(card: TrainerCard): PokemonCard {
  return {
    kind: "pokemon",
    id: card.id,
    number: card.number,
    pokedexId: null,
    name: card.name,
    type: "colorless",
    stage: "basic",
    hp: 40,
    retreatCost: 999,
    weakness: null,
    attacks: [],
    rarity: card.rarity,
    image: card.image,
    illustrator: card.illustrator ?? null,
    isEx: false,
    pack: card.pack,
    description:
      "Fossile — joue comme un Pokémon de Base à 40 PV. Sans attaque, ne peut pas battre en retraite.",
  };
}

function getCardForBattle(
  cardId: string,
  cardById: Map<string, PokemonCardData>,
): PokemonCard | null {
  const c = cardById.get(cardId);
  if (!c) return null;
  if (c.kind === "pokemon") return c;
  if (FOSSIL_NAMES.has(c.name)) return fossilAsPokemon(c);
  return null;
}

function SelfHand({
  state,
  cardById,
  isMyTurn,
  oppPromoting,
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
  oppPromoting: boolean;
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
  // En main phase si :
  //  - on est en `playing` et c'est notre tour
  //  - on n'a pas à promouvoir nous-mêmes
  //  - l'adversaire n'est pas en train de promouvoir (Morgane)
  const inMain =
    state.phase === "playing" &&
    isMyTurn &&
    !self.mustPromoteActive &&
    !oppPromoting;
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
  const noSupporterThisTurn = self.noSupporterThisTurn ?? false;
  // Capture pour les closures (TS perd le narrowing de `self`).
  const mustPromoteActive = !!self.mustPromoteActive;
  const selfActive = self.active;
  const selfBench = self.bench;

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
            : oppPromoting
              ? "Attends que l'adversaire choisisse son nouveau Actif."
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

    // ── Fossile (Item Dresseur qui se POSE comme un Basic) ───────────
    if (FOSSIL_NAMES.has(card.name)) {
      if (inSetup) {
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
          reason: oppPromoting
            ? "Attends que l'adversaire choisisse son nouveau Actif."
            : !isMyTurn
              ? "Pas encore ton tour."
              : "Indisponible.",
        };
      }
      if (benchLen >= benchCap) {
        return {
          kind: "blocked",
          reason: `Banc plein (${benchCap}/${benchCap}).`,
        };
      }
      return {
        kind: "playable",
        label: "→ Poser au Banc",
        handler: () => onPlayBasic(i),
      };
    }

    // ── Trainer "classique" (Supporter / Item / Outil / Stade) ───────
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
    // Flag « no Supporter ce tour » posé par l'adversaire au tour précédent
    // (ex Mr. Brillos / Hypnomade Cri Strident) ou par Maléfice des Ombres
    // d'Ectoplasma-ex Actif chez l'adversaire.
    if (
      card.trainerType === "supporter" &&
      noSupporterThisTurn
    ) {
      return {
        kind: "blocked",
        reason:
          "Tu ne peux pas jouer de Supporter ce tour (effet du tour précédent).",
      };
    }
    // Maléfice des Ombres : vérifier si l'opp Active est Ectoplasma-ex.
    if (card.trainerType === "supporter" && state.opponent?.active) {
      const oppActiveData = getCardForBattle(
        state.opponent.active.cardId,
        cardById,
      );
      if (
        oppActiveData?.ability?.kind === "passive" &&
        oppActiveData.ability.name === "Maléfice des Ombres"
      ) {
        return {
          kind: "blocked",
          reason: "Maléfice des Ombres : impossible avec Ectoplasma-ex Actif.",
        };
      }
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
      // Erika : nécessite un Pokémon Plante blessé.
      if (card.name === "Erika") {
        const grassHurt = inPlay.some((c) => {
          const d = getCardForBattle(c.cardId, cardById);
          return d?.type === "grass" && c.damage > 0;
        });
        if (!grassHurt) {
          return {
            kind: "blocked",
            reason: "Aucun Pokémon Plante blessé.",
          };
        }
      }
      // Pierre : nécessite Grolem ou Onix en jeu.
      if (card.name === "Pierre") {
        const validNames = new Set(["Grolem", "Onix"]);
        const ok = inPlay.some((c) => {
          const d = getCardForBattle(c.cardId, cardById);
          return d ? validNames.has(d.name) : false;
        });
        if (!ok) {
          return {
            kind: "blocked",
            reason: "Pas de Grolem ou Onix en jeu.",
          };
        }
      }
      // Ondine : nécessite un Pokémon Eau en jeu.
      if (card.name === "Ondine") {
        const water = inPlay.some((c) => {
          const d = getCardForBattle(c.cardId, cardById);
          return d?.type === "water";
        });
        if (!water) {
          return {
            kind: "blocked",
            reason: "Pas de Pokémon Eau en jeu.",
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
      // Koga : Actif doit être Grotadmorv ou Smogogo, et il faut au moins un Banc.
      if (card.name === "Koga") {
        const activeData = selfActive
          ? getCardForBattle(selfActive.cardId, cardById)
          : null;
        const validActive = new Set(["Grotadmorv", "Smogogo"]);
        if (!activeData || !validActive.has(activeData.name)) {
          return {
            kind: "blocked",
            reason: "L'Actif doit être Grotadmorv ou Smogogo.",
          };
        }
        if (benchLen === 0) {
          return {
            kind: "blocked",
            reason: "Pas de Banc pour remplacer ton Actif.",
          };
        }
      }
      // Major Bob : Actif doit être Raichu / Électrode / Élektek + ⚡ sur le Banc.
      if (card.name === "Major Bob") {
        const activeData = selfActive
          ? getCardForBattle(selfActive.cardId, cardById)
          : null;
        const validActive = new Set(["Raichu", "Électrode", "Élektek"]);
        if (!activeData || !validActive.has(activeData.name)) {
          return {
            kind: "blocked",
            reason: "L'Actif doit être Raichu, Électrode ou Élektek.",
          };
        }
        const hasLightningOnBench = selfBench.some((c) =>
          c.attachedEnergies.includes("lightning"),
        );
        if (!hasLightningOnBench) {
          return {
            kind: "blocked",
            reason: "Aucune Énergie ⚡ sur ton Banc.",
          };
        }
      }
      // Morgane : adversaire doit avoir un Banc à choisir.
      if (card.name === "Morgane") {
        const opp = state.opponent;
        if (!opp || opp.bench.length === 0) {
          return {
            kind: "blocked",
            reason: "L'adversaire n'a pas de Banc.",
          };
        }
      }
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
        <AnimatePresence mode="popLayout">
          {self.hand.map((entry, i) => {
            const data = cardById.get(entry.cardId);
            if (!data) return null;
            const action = getAction(data, i);
            return (
              <HandCard
                key={entry.uid}
                data={data}
                action={action}
                onHover={onHoverCard}
              />
            );
          })}
        </AnimatePresence>
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
      layout
      // Entrée : la carte tombe depuis le haut (pioche)
      initial={{ opacity: 0, y: -120, rotate: -8, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      // Sortie : la carte s'envole vers le haut (carte jouée)
      exit={{
        opacity: 0,
        y: -180,
        scale: 0.7,
        rotate: 8,
        transition: { duration: 0.45, ease: "easeIn" },
      }}
      transition={{ duration: 0.5, ease: "backOut" }}
      onClick={() => {
        if (action?.kind === "playable") action.handler();
      }}
      onMouseEnter={() => onHover?.(data)}
      onMouseLeave={() => onHover?.(null)}
      className={`relative w-24 h-32 shrink-0 overflow-hidden rounded-lg border transition-colors lg:w-28 lg:h-36 xl:w-32 xl:h-44 2xl:w-36 2xl:h-48 ${
        playable
          ? "cursor-pointer border-emerald-400/60 ring-2 ring-emerald-400/40 hover:scale-[1.05] hover:ring-emerald-300"
          : blocked
            ? "cursor-not-allowed border-white/5 opacity-50 grayscale"
            : "cursor-default border-white/10 opacity-90 hover:ring-2 hover:ring-white/30"
      }`}
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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-emerald-900/90 via-emerald-900/60 to-transparent p-1 text-center text-xs font-bold text-emerald-100">
          {action.label}
        </div>
      )}
      {blocked && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-900/95 via-zinc-900/70 to-transparent p-1 text-center text-[10px] leading-tight text-zinc-300">
          {action.reason}
        </div>
      )}
    </motion.div>
  );
}

/** Consomme une file d'évènements pile/face, en jouant l'animation un par
 *  un. Tant que la queue n'est pas vide, on rend l'overlay pour le 1er
 *  évènement. Quand l'animation finit, le parent retire l'évènement. */
/** Mapping coin cosmétique id → styles Tailwind (face heads/tails) +
 *  emoji optionnel. Utilisé par CoinFlipOverlay pour rendre la pièce
 *  équipée par le user. */
const COIN_STYLES: Record<
  string,
  {
    headsBg: string;
    headsRing: string;
    headsText: string;
    tailsBg: string;
    tailsRing: string;
    tailsText: string;
    headsEmoji?: string;
  }
> = {
  default: {
    headsBg: "from-amber-300 via-amber-400 to-amber-600",
    headsRing: "ring-amber-200/40",
    headsText: "text-amber-950",
    tailsBg: "from-zinc-300 via-zinc-400 to-zinc-600",
    tailsRing: "ring-zinc-200/40",
    tailsText: "text-zinc-900",
  },
  superball: {
    headsBg: "from-sky-400 via-blue-500 to-blue-700",
    headsRing: "ring-sky-200/40",
    headsText: "text-sky-50",
    tailsBg: "from-rose-400 via-rose-500 to-rose-700",
    tailsRing: "ring-rose-200/40",
    tailsText: "text-rose-50",
  },
  hyperball: {
    headsBg: "from-yellow-300 via-amber-500 to-yellow-700",
    headsRing: "ring-yellow-200/50",
    headsText: "text-yellow-950",
    tailsBg: "from-zinc-700 via-zinc-800 to-black",
    tailsRing: "ring-zinc-300/30",
    tailsText: "text-zinc-100",
  },
  "master-ball": {
    headsBg: "from-fuchsia-500 via-purple-600 to-violet-800",
    headsRing: "ring-fuchsia-300/50",
    headsText: "text-fuchsia-50",
    tailsBg: "from-violet-700 via-purple-800 to-fuchsia-900",
    tailsRing: "ring-violet-200/30",
    tailsText: "text-violet-50",
  },
  pikachu: {
    headsBg: "from-yellow-300 via-amber-400 to-yellow-600",
    headsRing: "ring-yellow-200/50",
    headsText: "text-yellow-950",
    tailsBg: "from-amber-700 via-amber-800 to-orange-900",
    tailsRing: "ring-amber-200/30",
    tailsText: "text-amber-50",
    headsEmoji: "⚡",
  },
};

function CoinFlipQueue({
  queue,
  series,
  onConsume,
  coinId,
}: {
  queue: CoinFlipEvent[];
  series: { label: string; entries: CoinSeriesEntry[] };
  onConsume: (id: string) => void;
  /** Id du coin cosmétique équipé. Default = "default" (Pokéball). */
  coinId?: string;
}) {
  const head = queue[0];
  if (!head) return null;
  return (
    <CoinFlipOverlay
      key={head.id}
      event={head}
      series={series}
      onComplete={() => onConsume(head.id)}
      coinId={coinId}
    />
  );
}

/** Affiche une pièce qui se retourne en 3D et atterrit sur PILE ou FACE,
 *  puis annonce le résultat (« FACE ! » + followUp en gros). Auto-dismiss
 *  après ~1.2s. Le style de la pièce dépend du cosmétique équipé. */
function CoinFlipOverlay({
  event,
  series,
  onComplete,
  coinId,
}: {
  event: CoinFlipEvent;
  series: { label: string; entries: CoinSeriesEntry[] };
  onComplete: () => void;
  coinId?: string;
}) {
  const coinStyle = COIN_STYLES[coinId ?? "default"] ?? COIN_STYLES.default;
  // Phase 0 → 0.9s : la pièce tourne. Le `result` détermine où elle s'arrête
  // (heads = 720° = face visible, tails = 540° = pile visible).
  const targetRotation = event.result === "heads" ? 720 : 540;
  // Phase 11.4 : TOTAL_MS bumpé 1200 → 2200 pour donner ~1s de pause
  // après l'annonce du résultat (~1.2s) avant de passer au flip suivant.
  // User-reported : trop rapide auparavant, on n'avait pas le temps de
  // voir/ressentir chaque flip individuellement.
  const TOTAL_MS = 2200;

  useEffect(() => {
    const t = window.setTimeout(onComplete, TOTAL_MS);
    return () => window.clearTimeout(t);
  }, [event.id, onComplete]);

  // Phase 11.4 : ne montrer dans le récap QUE les flips déjà
  // révélés (index <= event.index). Avant : le serveur envoyait souvent
  // tous les flips en rafale (Rafale d'Éclairs = 4 messages quasi
  // simultanés), donc series.entries contenait déjà les 4 résultats
  // dès le 1er flip → le user voyait le total final avant d'avoir vu
  // les flips. Désormais on cumule au fur et à mesure.
  // Sans index (single flip), tout afficher (1 entry de toute façon).
  const currentIdx = event.index ?? Number.POSITIVE_INFINITY;
  const seriesEntries =
    series.label === event.label
      ? series.entries.filter((e) => e.index <= currentIdx)
      : [];
  const headsCount = seriesEntries.filter((e) => e.result === "heads").length;
  const tailsCount = seriesEntries.filter((e) => e.result === "tails").length;
  const fixedTotal = event.total && event.total > 1 ? event.total : 0;
  const remaining = fixedTotal > 0 ? fixedTotal - seriesEntries.length : 0;
  // Mode "open-ended" : pas de total fixe (Ondine, Léviator Langue
  // Sans Fin). On affiche le récap dès le 2e flip de la série.
  const isOpenEnded = !fixedTotal && seriesEntries.length >= 2;
  const showRecap =
    (fixedTotal > 1 && seriesEntries.length > 0) || isOpenEnded;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-black/60 backdrop-blur-sm"
    >
      {/* Label en haut (« Qui commence ? », « Bulbizarre est Confus », …) */}
      <div className="text-xs uppercase tracking-[0.3em] text-zinc-300">
        {event.label}
        {event.total && event.total > 1 && (
          <span className="ml-2 text-zinc-500">
            (lancer {event.index ?? 1}/{event.total})
          </span>
        )}
      </div>

      {/* Pièce en 3D — perspective + rotateY animé */}
      <div style={{ perspective: "800px" }}>
        <motion.div
          initial={{ rotateY: 0 }}
          animate={{ rotateY: targetRotation }}
          transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
          style={{
            transformStyle: "preserve-3d",
            position: "relative",
            width: 120,
            height: 120,
          }}
        >
          {/* Face « FACE » (heads) — visible à rotateY 0/720.
              Style dépend du coin équipé (Pokéball/Super Ball/etc). */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
            }}
            className={`flex items-center justify-center rounded-full bg-gradient-to-br ${coinStyle.headsBg} text-3xl font-black ${coinStyle.headsText} shadow-2xl ring-4 ${coinStyle.headsRing}`}
          >
            {coinStyle.headsEmoji ? (
              <span className="text-4xl">{coinStyle.headsEmoji}</span>
            ) : (
              "FACE"
            )}
          </div>
          {/* Face « PILE » (tails) — visible à rotateY 180/540 */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
            className={`flex items-center justify-center rounded-full bg-gradient-to-br ${coinStyle.tailsBg} text-3xl font-black ${coinStyle.tailsText} shadow-2xl ring-4 ${coinStyle.tailsRing}`}
          >
            PILE
          </div>
        </motion.div>
      </div>

      {/* Annonce du résultat (PILE ! / FACE !) après le spin */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.9, duration: 0.3 }}
        className={`text-5xl font-black tracking-wider drop-shadow-lg ${
          event.result === "heads" ? "text-amber-300" : "text-zinc-200"
        }`}
      >
        {event.result === "heads" ? "FACE !" : "PILE !"}
      </motion.div>

      {/* followUp — l'action qui en découle (« rimkidinki commence ! ») */}
      {event.followUp && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.15, duration: 0.3 }}
          className="text-lg font-semibold text-zinc-100"
        >
          {event.followUp}
        </motion.div>
      )}

      {/* Récap série multi-coin : badges P/F + compteur Pile/Face/Restant.
       *  Visible pour les séries à total fixe (Rafale d'Éclairs : 4)
       *  OU pour les séries "open-ended" dès le 2e flip (Ondine, Léviator
       *  Langue Sans Fin — flip until tails). */}
      {showRecap && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.25 }}
          className="mt-4 flex flex-col items-center gap-2"
        >
          {/* Badges des résultats déjà tombés */}
          <div
            className="flex flex-wrap items-center justify-center gap-1.5"
            role="list"
            aria-label={`Résultats déjà obtenus : ${headsCount} face, ${tailsCount} pile`}
          >
            {seriesEntries.map((e, i) => (
              <span
                key={i}
                role="listitem"
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black shadow ${
                  e.result === "heads"
                    ? "bg-amber-300 text-amber-950 ring-1 ring-amber-200"
                    : "bg-zinc-300 text-zinc-900 ring-1 ring-zinc-200"
                }`}
                title={`Lancer ${e.index}${e.total ? `/${e.total}` : ""} : ${
                  e.result === "heads" ? "FACE" : "PILE"
                }`}
              >
                {e.result === "heads" ? "F" : "P"}
              </span>
            ))}
            {/* Slots vides pour les flips à venir (uniquement si total fixe) */}
            {fixedTotal > 0 &&
              Array.from({ length: Math.max(0, remaining - 1) }, (_, i) => (
                <span
                  key={`empty-${i}`}
                  aria-hidden="true"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-white/20 text-[10px] text-white/30"
                >
                  ?
                </span>
              ))}
            {/* Indicateur "..." pour les séries open-ended (jusqu'à pile) */}
            {isOpenEnded && (
              <span
                aria-hidden="true"
                className="inline-flex h-7 items-center justify-center px-1 text-[12px] text-white/30"
              >
                …
              </span>
            )}
          </div>
          {/* Compteur cumulé */}
          <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-widest">
            <span className="text-amber-300">
              Face : <span className="tabular-nums">{headsCount}</span>
            </span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-300">
              Pile : <span className="tabular-nums">{tailsCount}</span>
            </span>
            {fixedTotal > 0 && remaining > 1 && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">
                  Restant : <span className="tabular-nums">{remaining - 1}</span>
                </span>
              </>
            )}
            {isOpenEnded && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">
                  jusqu&apos;à pile
                </span>
              </>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

/** Modal de révélation Dresseur. Pokédex = 1 carte (top deck), Scrute Main =
 *  N cartes (main de l'adversaire). Click outside / croix = ferme. */
function TrainerRevealModal({
  trainerName,
  cardIds,
  cardById,
  onClose,
}: {
  trainerName: string;
  cardIds: string[];
  cardById: Map<string, PokemonCardData>;
  onClose: () => void;
}) {
  const subtitle =
    trainerName === "Pokédex"
      ? "Première carte du dessus de ton deck :"
      : trainerName === "Scrute Main"
        ? "Main de l'adversaire :"
        : "Carte révélée :";
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[88vh] flex-col items-center gap-3 rounded-xl border border-amber-400/40 bg-zinc-950/95 p-5 shadow-2xl"
      >
        <div className="text-xs uppercase tracking-widest text-amber-300">
          🃏 {trainerName}
        </div>
        <div className="text-sm text-zinc-300">{subtitle}</div>
        <div className="flex max-w-[80vw] flex-wrap items-center justify-center gap-3 overflow-y-auto pt-1">
          {cardIds.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/10 px-6 py-4 text-sm text-zinc-500">
              (aucune carte)
            </div>
          ) : (
            cardIds.map((cId, i) => {
              const data = cardById.get(cId);
              if (!data) return null;
              return (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={`${i}-${cId}`}
                  src={data.image}
                  alt={data.name}
                  title={data.name}
                  className="h-56 w-auto rounded-lg object-contain shadow-lg ring-1 ring-white/10"
                />
              );
            })
          )}
        </div>
        <button
          onClick={onClose}
          className="mt-2 rounded-md bg-amber-500 px-4 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-400"
        >
          OK
        </button>
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="absolute -right-3 -top-3 rounded-full bg-zinc-900 p-2 text-zinc-200 shadow-lg ring-1 ring-white/20 hover:bg-zinc-800"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** Modal du picker copy attack (Mew « Mémoire Ancestrale »). Affiche les
 *  Pokémon de l'adversaire (Actif + Banc) et leurs attaques. Click sur une
 *  attaque → callback avec (sourceUid, attackIdx). Click outside / croix =
 *  annule. */
function CopyAttackPicker({
  opponent,
  cardById,
  onPick,
  onCancel,
}: {
  opponent: BattlePlayerPublicState | null;
  cardById: Map<string, PokemonCardData>;
  onPick: (sourceUid: string, attackIdx: number) => void;
  onCancel: () => void;
}) {
  const targets: BattleCard[] = [];
  if (opponent?.active) targets.push(opponent.active);
  if (opponent?.bench) targets.push(...opponent.bench);
  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[88vh] w-full max-w-[860px] flex-col gap-3 overflow-y-auto rounded-xl border border-amber-400/40 bg-zinc-950/95 p-5 shadow-2xl"
      >
        <div className="text-center">
          <div className="text-xs uppercase tracking-widest text-amber-300">
            🃏 Mémoire Ancestrale
          </div>
          <div className="mt-1 text-sm text-zinc-300">
            Choisis l'attaque adverse à copier. Si Mew n'a pas l'Énergie
            nécessaire, l'attaque ratera.
          </div>
        </div>
        {targets.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
            L'adversaire n'a aucun Pokémon en jeu.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {targets.map((tgt) => {
              const data = cardById.get(tgt.cardId);
              if (data?.kind !== "pokemon" || data.attacks.length === 0)
                return null;
              return (
                <div
                  key={tgt.uid}
                  className="flex items-stretch gap-3 rounded-lg border border-white/10 bg-black/30 p-3"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={data.image}
                    alt={data.name}
                    className="h-32 w-auto rounded object-contain"
                  />
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="text-sm font-bold text-zinc-100">
                      {data.name}
                    </div>
                    {data.attacks.map((a, ai) => (
                      <button
                        key={ai}
                        onClick={() => onPick(tgt.uid, ai)}
                        className="flex items-center justify-between gap-2 rounded-md border-2 border-rose-400/60 bg-rose-500/15 px-3 py-2 text-left text-xs text-rose-50 shadow-md hover:scale-[1.02] hover:bg-rose-500/25"
                      >
                        <div className="flex items-center gap-1">
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
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button
          onClick={onCancel}
          aria-label="Annuler"
          className="absolute -right-3 -top-3 rounded-full bg-zinc-900 p-2 text-zinc-200 shadow-lg ring-1 ring-white/20 hover:bg-zinc-800"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** Bandeau plein écran qui s'affiche à chaque changement de tour. Texte
 *  « À toi ! » (accent vert) ou « Tour adverse » (accent rouge), traversant
 *  l'écran de gauche à droite avec un effet de glow. Auto-dismiss ~1.4s. */
function TurnChangeBanner({
  text,
  accent,
  onDone,
}: {
  text: string;
  accent: "self" | "opp";
  onDone: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 1400);
    return () => window.clearTimeout(t);
  }, [onDone]);
  const color =
    accent === "self"
      ? "from-emerald-500/0 via-emerald-400/40 to-emerald-500/0 text-emerald-200"
      : "from-rose-500/0 via-rose-400/40 to-rose-500/0 text-rose-200";
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
    >
      <motion.div
        initial={{ x: "-100%", scaleY: 0.6, opacity: 0 }}
        animate={{
          x: ["-100%", "0%", "0%", "100%"],
          scaleY: [0.6, 1, 1, 0.6],
          opacity: [0, 1, 1, 0],
        }}
        transition={{
          duration: 1.4,
          times: [0, 0.25, 0.7, 1],
          ease: "easeOut",
        }}
        className={`flex w-full items-center justify-center bg-gradient-to-r ${color} py-6`}
      >
        <span className="text-5xl font-black uppercase tracking-[0.25em] drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
          {text}
        </span>
      </motion.div>
    </motion.div>
  );
}

/** Rend une couche full-screen (`fixed inset-0`) qui affiche les projectiles
 *  en vol. Chaque anim part de `(fromX, fromY)` (centre) vers `(toX, toY)` en
 *  ~600ms, avec une légère courbe (via translate Y intermédiaire). À la fin,
 *  le parent retire l'anim de la queue. */
function FlyAnimLayer({
  anims,
  onConsume,
}: {
  anims: FlyAnim[];
  onConsume: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[55]">
      <AnimatePresence>
        {anims.map((a) => (
          <FlyProjectile
            key={a.id}
            anim={a}
            onComplete={() => onConsume(a.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function FlyProjectile({
  anim,
  onComplete,
}: {
  anim: FlyAnim;
  onComplete: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onComplete, 700);
    return () => window.clearTimeout(t);
  }, [onComplete]);
  return (
    <motion.div
      initial={{
        x: anim.fromX - 20,
        y: anim.fromY - 20,
        scale: 0.6,
        opacity: 0,
      }}
      animate={{
        x: [anim.fromX - 20, (anim.fromX + anim.toX) / 2 - 20, anim.toX - 20],
        y: [
          anim.fromY - 20,
          // Courbe : monte un peu au milieu (parabole simple)
          (anim.fromY + anim.toY) / 2 - 60,
          anim.toY - 20,
        ],
        scale: [0.6, 1.4, 1],
        opacity: [0, 1, 1, 0.2],
      }}
      transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
      className={`absolute flex h-10 w-10 items-center justify-center rounded-full text-xl font-bold shadow-2xl ring-4 ring-white/40 ${anim.bg} ${anim.fg}`}
    >
      {anim.content}
    </motion.div>
  );
}

// ─── Emotes en match ─────────────────────────────────────────────────────
import { BATTLE_EMOTES, type BattleEmoteId } from "@shared/types";

function EmotePicker({
  open,
  onToggle,
  onSend,
}: {
  open: boolean;
  onToggle: () => void;
  onSend: (id: string) => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        title="Envoyer une emote"
        aria-label="Envoyer une emote"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
          open
            ? "border-amber-400/60 bg-amber-400/15 text-amber-100"
            : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
        }`}
      >
        <Smile size={14} aria-hidden="true" />
        Emote
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-lg border border-white/10 bg-zinc-950/95 p-2 shadow-xl backdrop-blur">
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(BATTLE_EMOTES) as BattleEmoteId[]).map((id) => {
              const e = BATTLE_EMOTES[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSend(id)}
                  className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-left text-xs text-zinc-200 transition-colors hover:bg-amber-300/10 hover:text-amber-100"
                >
                  <span className="text-base">{e.emoji}</span>
                  <span>{e.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmoteBubble({
  emoteId,
  position,
}: {
  emoteId: string;
  position: "top" | "bottom";
}) {
  const e = BATTLE_EMOTES[emoteId as BattleEmoteId];
  if (!e) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: position === "top" ? -10 : 10, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className={`pointer-events-none fixed left-1/2 z-40 -translate-x-1/2 ${
        position === "top" ? "top-20" : "bottom-32"
      } flex items-center gap-2 rounded-2xl border border-amber-300/40 bg-zinc-950/95 px-4 py-2 text-sm font-bold text-amber-100 shadow-2xl backdrop-blur`}
    >
      <span className="text-xl">{e.emoji}</span>
      <span>{e.label}</span>
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
