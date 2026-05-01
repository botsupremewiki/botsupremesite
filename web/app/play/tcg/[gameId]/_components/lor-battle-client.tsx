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
  getSpellTargetCount,
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
  // Phase 3.85 : toast quête bot (3 wins → 1 booster gratuit). On reçoit
  // `lor-battle-quest-reward` à chaque victoire vs bot, on affiche le
  // compteur et un toast doré quand `granted` passe à true.
  const [questToast, setQuestToast] = useState<{
    botWins: number;
    granted: boolean;
    goldReward: number;
  } | null>(null);
  const [state, setState] = useState<RuneterraBattleState | null>(null);
  const [mulliganSelection, setMulliganSelection] = useState<Set<number>>(
    new Set(),
  );
  const [zoomedCard, setZoomedCard] = useState<RuneterraBattleUnit | string | null>(
    null,
  );
  // Phase 4.3 : preview au survol — un cardCode hovered affiche un grand
  // panel à droite de l'écran avec le full art + texte. Ne nécessite pas
  // de clic, contrairement au zoom modal (qui prend tout l'écran).
  const [hoveredCardCode, setHoveredCardCode] = useState<string | null>(null);
  // Phase 4.4 : VFX flash level-up et damage popups. Set d'uids qui ont
  // récemment level-up (auto-clear après 2s). Map uid → damage taken pour
  // afficher un "-N" floating qui fade out après 1s.
  const [recentLevelUps, setRecentLevelUps] = useState<Set<string>>(new Set());
  const [damagePopups, setDamagePopups] = useState<
    Record<string, { amount: number; ts: number }>
  >({});
  // Phase 4.7 : annonce centre-écran « Round N » au début de chaque round
  // (auto-fade après 1.5s). Détectée par diff state.round.
  const [roundAnnouncement, setRoundAnnouncement] = useState<{
    round: number;
    ts: number;
  } | null>(null);
  // Phase 5.4 : popup -N rouge sur le nexus quand il prend des dégâts
  // (et +N vert si soigné). 2 entries : seatIdx → {amount, ts}.
  const [nexusDamagePopups, setNexusDamagePopups] = useState<{
    self?: { amount: number; ts: number; isHeal: boolean };
    opponent?: { amount: number; ts: number; isHeal: boolean };
  }>({});
  // Phase 5.6 : Set d'uids qui viennent d'apparaître sur le banc (animation
  // entrée slide-in). Auto-clear après 600ms.
  const [recentlySummoned, setRecentlySummoned] = useState<Set<string>>(
    new Set(),
  );
  // Phase 5.8 : modal confirmation concede (vs native confirm).
  const [concedeModalOpen, setConcedeModalOpen] = useState(false);
  // Phase 5.12 : pulse hand badge quand handCount augmente (draw card).
  const [handPulse, setHandPulse] = useState<{ self: number; opponent: number }>({
    self: 0,
    opponent: 0,
  });
  // Phase 3.7 + 3.39 + 3.70 + 3.71 : sort en attente de cible (null = pas
  // de targeting en cours). targetCount: 1, 2 ou 3 (3 = Crépuscule).
  // firstTargetUid + secondTargetUid stockent les cibles pickées en
  // attendant la suivante. spellChoice: 0 ou 1 pour les sorts à choix
  // (default 0). hasChoice: true si l'effet expose un toggle.
  const [pendingSpell, setPendingSpell] = useState<{
    handIndex: number;
    side: SpellTargetSide;
    cardCode: string;
    targetCount: 1 | 2 | 3;
    firstTargetUid: string | null;
    secondTargetUid: string | null;
    spellChoice: 0 | 1;
    hasChoice: boolean;
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
        case "lor-battle-quest-reward":
          setQuestToast({
            botWins: msg.botWins,
            granted: msg.granted,
            goldReward: msg.goldReward,
          });
          break;
      }
    });
    return () => {
      cancelled = true;
      ws.close();
      if (socketRef.current === ws) socketRef.current = null;
    };
  }, [profile, roomId, deckId]);

  // Phase 3.85 : auto-dismiss du toast quête après 8s. Si une nouvelle
  // victoire arrive avant l'expiration, on reset le timer.
  useEffect(() => {
    if (!questToast) return;
    const id = setTimeout(() => setQuestToast(null), 8000);
    return () => clearTimeout(id);
  }, [questToast]);

  // Phase 4.4 : diff entre state précédent et nouveau pour détecter :
  //   - level-ups : uid passe de level 1 à level 2 → flash gold 2s
  //   - dégâts : damage augmente → popup "-N" rouge 1s
  // Les deux sont des effets purement visuels, déclenchés au moment où
  // le serveur push un nouveau state.
  const prevStateRef = useRef<RuneterraBattleState | null>(null);
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (!prev || !state) return;
    // Phase 4.7 : nouveau round (state.round augmente) → annonce overlay.
    if (state.round > prev.round && state.phase === "round") {
      const ts = Date.now();
      setRoundAnnouncement({ round: state.round, ts });
      setTimeout(() => {
        setRoundAnnouncement((curr) => (curr?.ts === ts ? null : curr));
      }, 1500);
    }
    // Helper : récupère TOUTES les unités sur les deux bancs (allié + ennemi).
    const getAllUnits = (s: RuneterraBattleState): RuneterraBattleUnit[] => {
      const out: RuneterraBattleUnit[] = [];
      if (s.self) out.push(...s.self.bench);
      if (s.opponent) out.push(...s.opponent.bench);
      return out;
    };
    const prevUnits = new Map(getAllUnits(prev).map((u) => [u.uid, u]));
    const currUnits = getAllUnits(state);
    const newLevelUps = new Set<string>();
    const newDamage: Record<string, { amount: number; ts: number }> = {};
    // Phase 5.6 : nouveaux uids sur le banc (summon animation).
    const newSummonedUids = new Set<string>();
    for (const u of currUnits) {
      const old = prevUnits.get(u.uid);
      if (!old) {
        // Nouveau uid → summon animation
        newSummonedUids.add(u.uid);
        continue;
      }
      // Level-up détecté : 1 → 2
      if (old.level < 2 && u.level >= 2) {
        newLevelUps.add(u.uid);
      }
      // Damage augmenté
      const dmgDelta = u.damage - old.damage;
      if (dmgDelta > 0) {
        newDamage[u.uid] = { amount: dmgDelta, ts: Date.now() };
      }
    }
    if (newSummonedUids.size > 0) {
      setRecentlySummoned((prevSet) => {
        const next = new Set(prevSet);
        newSummonedUids.forEach((uid) => next.add(uid));
        return next;
      });
      setTimeout(() => {
        setRecentlySummoned((prevSet) => {
          const next = new Set(prevSet);
          newSummonedUids.forEach((uid) => next.delete(uid));
          return next;
        });
      }, 600);
    }
    if (newLevelUps.size > 0) {
      setRecentLevelUps((prevSet) => {
        const next = new Set(prevSet);
        newLevelUps.forEach((uid) => next.add(uid));
        return next;
      });
      // Auto-clear après 2s.
      setTimeout(() => {
        setRecentLevelUps((prevSet) => {
          const next = new Set(prevSet);
          newLevelUps.forEach((uid) => next.delete(uid));
          return next;
        });
      }, 2000);
    }
    if (Object.keys(newDamage).length > 0) {
      setDamagePopups((prev) => ({ ...prev, ...newDamage }));
      // Auto-clear chaque popup après 1.2s.
      setTimeout(() => {
        setDamagePopups((prev) => {
          const next = { ...prev };
          for (const uid of Object.keys(newDamage)) {
            // On ne clear que si le ts est le même (sinon un nouveau
            // popup a remplacé celui-ci, on le laisse).
            if (next[uid]?.ts === newDamage[uid].ts) {
              delete next[uid];
            }
          }
          return next;
        });
      }, 1200);
    }
    // Phase 5.12 : hand grow → pulse handCount badge (draw card visual).
    const selfHandDiff = (state.self?.handCount ?? 0) - (prev.self?.handCount ?? 0);
    const oppHandDiff =
      (state.opponent?.handCount ?? 0) - (prev.opponent?.handCount ?? 0);
    if (selfHandDiff > 0 || oppHandDiff > 0) {
      const ts = Date.now();
      setHandPulse({
        self: selfHandDiff > 0 ? ts : handPulse.self,
        opponent: oppHandDiff > 0 ? ts : handPulse.opponent,
      });
      setTimeout(() => {
        setHandPulse((curr) => ({
          self: curr.self === ts ? 0 : curr.self,
          opponent: curr.opponent === ts ? 0 : curr.opponent,
        }));
      }, 800);
    }
    // Phase 5.4 : nexus health diff → popup -N (dégâts) ou +N (heal).
    const nexusDiffSelf = prev.self && state.self
      ? state.self.nexusHealth - prev.self.nexusHealth
      : 0;
    const nexusDiffOpp = prev.opponent && state.opponent
      ? state.opponent.nexusHealth - prev.opponent.nexusHealth
      : 0;
    if (nexusDiffSelf !== 0 || nexusDiffOpp !== 0) {
      const ts = Date.now();
      setNexusDamagePopups((prev) => ({
        ...prev,
        ...(nexusDiffSelf !== 0 && {
          self: {
            amount: Math.abs(nexusDiffSelf),
            ts,
            isHeal: nexusDiffSelf > 0,
          },
        }),
        ...(nexusDiffOpp !== 0 && {
          opponent: {
            amount: Math.abs(nexusDiffOpp),
            ts,
            isHeal: nexusDiffOpp > 0,
          },
        }),
      }));
      setTimeout(() => {
        setNexusDamagePopups((prev) => {
          const next = { ...prev };
          if (next.self?.ts === ts) delete next.self;
          if (next.opponent?.ts === ts) delete next.opponent;
          return next;
        });
      }, 1500);
    }
  }, [state]);

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
        // Mode targeting : attend que le user clique une (ou 2 ou 3) cibles.
        const targetCount = getSpellTargetCount(effect);
        const hasChoice = effect.type === "buff-ally-round-choice";
        setPendingSpell({
          handIndex,
          side,
          cardCode,
          targetCount: targetCount === 0 ? 1 : targetCount,
          firstTargetUid: null,
          secondTargetUid: null,
          spellChoice: 0,
          hasChoice,
        });
      }
    },
    [state, send],
  );

  const targetSpell = useCallback(
    (targetUid: string) => {
      if (!pendingSpell) return;
      // Phase 3.39 + 3.70 : multi-target → stocke les cibles et attend
      // la dernière, puis envoie tout.
      const tc = pendingSpell.targetCount;
      if (tc >= 2 && pendingSpell.firstTargetUid === null) {
        setPendingSpell({ ...pendingSpell, firstTargetUid: targetUid });
        return;
      }
      // Cancel si user reclique la même cible (anti-doublon).
      if (
        pendingSpell.firstTargetUid === targetUid ||
        pendingSpell.secondTargetUid === targetUid
      ) {
        setErrorMsg("Les cibles doivent être distinctes.");
        return;
      }
      if (tc === 3 && pendingSpell.secondTargetUid === null) {
        setPendingSpell({ ...pendingSpell, secondTargetUid: targetUid });
        return;
      }
      // Tous les targets pickés — envoie.
      send({
        type: "lor-play-spell",
        handIndex: pendingSpell.handIndex,
        targetUid:
          tc === 1 ? targetUid : pendingSpell.firstTargetUid,
        targetUid2:
          tc === 2
            ? targetUid
            : tc === 3
              ? pendingSpell.secondTargetUid
              : undefined,
        targetUid3: tc === 3 ? targetUid : undefined,
        spellChoice: pendingSpell.hasChoice ? pendingSpell.spellChoice : undefined,
      });
      setPendingSpell(null);
    },
    [pendingSpell, send],
  );

  const toggleSpellChoice = useCallback(() => {
    setPendingSpell((prev) =>
      prev
        ? { ...prev, spellChoice: prev.spellChoice === 0 ? 1 : 0 }
        : prev,
    );
  }, []);

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
            onConcede={() => setConcedeModalOpen(true)}
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
            onToggleSpellChoice={toggleSpellChoice}
            onZoom={(c) => setZoomedCard(c)}
            onHoverCode={setHoveredCardCode}
            recentLevelUps={recentLevelUps}
            damagePopups={damagePopups}
            nexusDamagePopups={nexusDamagePopups}
            recentlySummoned={recentlySummoned}
            handPulse={handPulse}
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

        {/* Phase 3.85 : toast quête bot wins. Le compteur s'affiche dès
            la 1ère victoire ; quand granted=true, le toast brille en doré. */}
        {questToast && (
          <div
            className={`absolute right-4 top-4 z-20 flex items-center gap-2 rounded-md border px-3 py-2 text-xs shadow-lg backdrop-blur-sm ${
              questToast.granted
                ? "animate-pulse border-amber-300/70 bg-amber-400/20 text-amber-100 shadow-amber-500/30"
                : "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
            }`}
          >
            {questToast.granted ? (
              <span>
                🎁 Quête remplie ! +1 booster gratuit
                {questToast.goldReward > 0
                  ? ` + ${questToast.goldReward.toLocaleString("fr-FR")} OS`
                  : ""}
              </span>
            ) : (
              <span>
                🤖 Victoire vs bot ! Compteur : {questToast.botWins}/3
              </span>
            )}
            <button
              onClick={() => setQuestToast(null)}
              className="ml-1 text-current/70 hover:text-current"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
        )}

        <CardZoomFromBattle
          card={zoomedCard}
          onClose={() => setZoomedCard(null)}
        />

        {/* Phase 4.3 : preview au survol — affiche une grande version
            de la carte hovered en bas-droite. Pointer-events none pour
            ne pas bloquer le clic. Hidden quand pendingSpell (focus
            sur targeting). */}
        {hoveredCardCode && pendingSpell === null && (
          <HoverPreview cardCode={hoveredCardCode} />
        )}

        {/* Phase 5.8 : modal de confirmation concede stylé. */}
        {concedeModalOpen && (
          <div
            onClick={() => setConcedeModalOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border-2 border-rose-500/40 bg-zinc-950 p-6 shadow-2xl animate-in zoom-in-95 duration-300"
            >
              <div className="text-center">
                <div className="text-5xl">🏳️</div>
                <h2 className="mt-2 text-xl font-bold text-zinc-100">
                  Concéder la partie ?
                </h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Tu perds immédiatement le match. Cette action est
                  irréversible.
                </p>
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setConcedeModalOpen(false)}
                  className="flex-1 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10"
                >
                  Continuer le combat
                </button>
                <button
                  onClick={() => {
                    send({ type: "lor-concede" });
                    setConcedeModalOpen(false);
                  }}
                  className="flex-1 rounded-md bg-rose-500 px-4 py-2 text-sm font-bold text-rose-950 hover:bg-rose-400"
                >
                  ✓ Concéder
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Phase 4.7 : annonce centrée « Round N » 1.5s à chaque nouveau
            round. Ne bloque pas l'interaction (pointer-events-none). */}
        {roundAnnouncement && (
          <div
            key={roundAnnouncement.ts}
            className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
            aria-hidden
          >
            <div className="animate-in fade-in zoom-in-50 duration-500 rounded-2xl border-2 border-amber-300/60 bg-zinc-950/80 px-12 py-6 text-center shadow-2xl backdrop-blur-md">
              <div className="text-[10px] uppercase tracking-[0.4em] text-amber-300/80">
                Round
              </div>
              <div className="mt-1 text-6xl font-black tabular-nums text-amber-200 drop-shadow-[0_4px_12px_rgba(252,211,77,0.6)]">
                {roundAnnouncement.round}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

// Phase 4.6 : dictionnaire des mots-clés LoR (keywordRef → description FR).
// Affiché dans la HoverPreview pour que les nouveaux joueurs comprennent
// les keywords sans devoir lire les règles.
const KEYWORD_LEGEND: Record<string, string> = {
  Elusive: "Élusif — bloqué uniquement par d'autres unités élusives.",
  Burst: "Instantané — résolu immédiatement, l'adversaire ne peut pas réagir.",
  Fast: "Rapide — l'adversaire peut réagir avec un sort Rapide ou Instantané.",
  Slow: "Lent — peut être contré par un sort Rapide. Pas jouable en combat.",
  Focus: "Focalisé — comme Instantané mais hors d'une fenêtre de réaction.",
  QuickStrike: "Frappe rapide — frappe en premier en combat.",
  DoubleStrike: "Double frappe — frappe deux fois en combat.",
  Overwhelm: "Surpuissance — les dégâts excédentaires touchent le Nexus ennemi.",
  SpellOverwhelm:
    "Sur-puissance de sort — les dégâts excédentaires d'un sort touchent le Nexus.",
  Fearsome:
    "Redoutable — ne peut être bloqué que par des ennemis avec ≥ 3 puissance.",
  Lifesteal: "Vampirisme — les dégâts infligés régénèrent ton Nexus.",
  Tough: "Robuste — réduit de 1 tous les dégâts reçus.",
  Regeneration: "Régénération — soigné totalement à la fin du round.",
  Barrier:
    "Barrière — annule les prochains dégâts subis ce round, puis disparaît.",
  Challenger: "Provocateur — choisit qui doit le bloquer côté ennemi.",
  Vulnerable:
    "Vulnérable — n'importe quel attaquant peut forcer cet ennemi à bloquer.",
  CantBlock: "Ne peut pas bloquer — incapable de défendre.",
  LastBreath: "Dernier souffle — déclenche un effet quand l'unité meurt.",
  Skill: "Compétence — comme un sort, peut être contré par sort Rapide.",
  ElementalSkill: "Compétence Élémentaire — sous-type de Skill.",
  Imbue:
    "Imprégnation — gagne un effet à chaque sort que tu lances.",
  Support: "Soutien — quand cette unité attaque, son allié à droite gagne un bonus.",
  Ephemeral: "Éphémère — disparaît après son combat ou la fin du round.",
  Fleeting: "Fugace — défaussé en fin de round si encore en main.",
  Stun: "Étourdir — l'unité est mise au repos et ne peut pas attaquer/bloquer.",
  Recall: "Rappeler — l'unité retourne en main de son contrôleur.",
};

// Phase 4.3 : preview large de la carte hovered (bas-droite, fixed, pas
// d'interaction). Affiche full-art si dispo + texte description.
function HoverPreview({ cardCode }: { cardCode: string }) {
  const card = RUNETERRA_BASE_SET_BY_CODE.get(cardCode);
  if (!card) return null;
  // Phase 4.6 : extraire les keywords avec définition pour afficher la légende.
  const keywordsWithDef = (card.keywordRefs ?? [])
    .map((ref) => ({ ref, def: KEYWORD_LEGEND[ref] }))
    .filter((k): k is { ref: string; def: string } => !!k.def);
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-30 w-64 overflow-hidden rounded-xl border-2 border-white/20 bg-zinc-950/95 shadow-2xl backdrop-blur-sm animate-in fade-in slide-in-from-right-4"
      aria-hidden
    >
      <div className="aspect-[2/3] w-full">
        {card.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.image}
            alt={card.name}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-xs text-zinc-500">
            {card.name}
          </div>
        )}
      </div>
      <div className="border-t border-white/10 p-2">
        <div className="flex items-start justify-between gap-1">
          <div className="text-sm font-semibold text-zinc-100">{card.name}</div>
          {/* Phase 5.0 : badge spell speed coloré pour repérer Burst/Fast/Slow. */}
          {card.spellSpeed && (
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest ${
                card.spellSpeed === "Burst"
                  ? "bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/50"
                  : card.spellSpeed === "Fast"
                    ? "bg-sky-400/20 text-sky-200 ring-1 ring-sky-400/50"
                    : card.spellSpeed === "Slow"
                      ? "bg-rose-400/20 text-rose-200 ring-1 ring-rose-400/50"
                      : "bg-violet-400/20 text-violet-200 ring-1 ring-violet-400/50"
              }`}
              title={
                card.spellSpeed === "Burst"
                  ? "Instantané — non interruptible"
                  : card.spellSpeed === "Fast"
                    ? "Rapide — l'adversaire peut réagir"
                    : card.spellSpeed === "Slow"
                      ? "Lent — pas en combat, l'adversaire peut réagir"
                      : "Focalisé"
              }
            >
              {card.spellSpeed === "Burst"
                ? "⚡ Inst."
                : card.spellSpeed === "Fast"
                  ? "💨 Rap."
                  : card.spellSpeed === "Slow"
                    ? "🐢 Lent"
                    : "🎯 Foc."}
            </span>
          )}
        </div>
        <div className="text-[10px] text-zinc-400">
          💧 {card.cost}
          {card.attack !== undefined && ` · ⚔️ ${card.attack}/${card.health}`}
          {card.supertype === "Champion" && " · ★ Champion"}
          {card.keywordRefs?.includes("Fleeting") && (
            <span className="ml-1 rounded bg-orange-500/20 px-1 py-0.5 text-[8px] text-orange-200">
              ⏳ Fugace
            </span>
          )}
        </div>
        {card.descriptionRaw && (
          <div className="mt-1 max-h-24 overflow-y-auto text-[11px] leading-tight text-zinc-300">
            {card.descriptionRaw}
          </div>
        )}
        {keywordsWithDef.length > 0 && (
          <div className="mt-2 space-y-0.5 border-t border-white/10 pt-1.5">
            {keywordsWithDef.map(({ ref, def }) => (
              <div key={ref} className="text-[10px] leading-tight">
                <span className="font-semibold text-amber-300">
                  {(card.keywords ?? []).find(
                    (_, i) => card.keywordRefs?.[i] === ref,
                  ) ?? ref}
                </span>{" "}
                <span className="text-zinc-500">— {def}</span>
              </div>
            ))}
          </div>
        )}
      </div>
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
      {/* Phase 4.7 : header polish — gradient + border + glow */}
      <div className="animate-in fade-in slide-in-from-top-4 duration-500 text-center">
        <h1 className="text-3xl font-black bg-gradient-to-r from-amber-200 via-amber-300 to-orange-300 bg-clip-text text-transparent drop-shadow">
          ⚡ Mulligan
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          {done
            ? state.opponent?.hasMulliganed
              ? "Mulligan terminé — démarrage du round 1..."
              : "En attente de l'adversaire..."
            : "Sélectionne les cartes à remplacer (0 à 4), puis confirme."}
        </p>
      </div>
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
              // Phase 4.7 : entrée animée carte par carte (cascade 80ms),
              // hover gain plus visible.
              style={{ animationDelay: `${i * 80}ms` }}
              className={`relative w-40 rounded-lg border-2 p-1 transition-all duration-200 disabled:cursor-not-allowed animate-in fade-in zoom-in-95 ${
                isSelected
                  ? "border-rose-400 scale-95 opacity-60 rotate-1"
                  : "border-white/10 hover:scale-[1.04] hover:-translate-y-2 hover:border-amber-400/40 hover:shadow-[0_8px_20px_rgba(251,191,36,0.3)]"
              }`}
              title="Click gauche : sélectionner · Click droit : zoom"
            >
              <CardFromCode cardCode={cardCode} />
              {isSelected && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-rose-900/50 backdrop-blur-[1px]">
                  <span className="text-4xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                    ✕
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
      {!done && (
        <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
          <button
            onClick={onConfirm}
            className={`rounded-md px-6 py-2.5 text-sm font-bold shadow-lg transition-all hover:scale-105 ${
              selection.size === 0
                ? "bg-emerald-500 text-emerald-950 hover:bg-emerald-400 hover:shadow-emerald-500/30"
                : "bg-amber-500 text-amber-950 hover:bg-amber-400 hover:shadow-amber-500/30"
            }`}
          >
            {selection.size === 0
              ? "✓ Garder ma main"
              : `🔄 Remplacer ${selection.size} carte${selection.size > 1 ? "s" : ""}`}
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
  onToggleSpellChoice,
  onZoom,
  onHoverCode,
  recentLevelUps,
  damagePopups,
  nexusDamagePopups,
  recentlySummoned,
  handPulse,
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
    targetCount: 1 | 2 | 3;
    firstTargetUid: string | null;
    secondTargetUid: string | null;
    spellChoice: 0 | 1;
    hasChoice: boolean;
  } | null;
  onTargetSpell: (uid: string) => void;
  onCancelSpell: () => void;
  onToggleSpellChoice: () => void;
  onZoom: (c: RuneterraBattleUnit | string) => void;
  // Phase 4.3 : hover preview à droite de l'écran. Propagé aux Bench/Hand.
  onHoverCode?: (code: string | null) => void;
  // Phase 4.4 : VFX flash level-up et damage popups (propagés aux BenchRow).
  recentLevelUps?: Set<string>;
  damagePopups?: Record<string, { amount: number; ts: number }>;
  // Phase 5.4 : popups -N/+N nexus (propagés aux PlayerStrip).
  nexusDamagePopups?: {
    self?: { amount: number; ts: number; isHeal: boolean };
    opponent?: { amount: number; ts: number; isHeal: boolean };
  };
  // Phase 5.6 : summon animation entrée banc (slide-in 600ms).
  recentlySummoned?: Set<string>;
  // Phase 5.12 : pulse handCount sur draw card (timestamp).
  handPulse?: { self: number; opponent: number };
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
      (pendingSpell.side === "ally" ||
        pendingSpell.side === "any" ||
        pendingSpell.side === "any-or-nexus" ||
        // Phase 3.46 : ally-and-enemy → 1re cible doit être ally.
        (pendingSpell.side === "ally-and-enemy" &&
          pendingSpell.firstTargetUid === null) ||
        // Phase 3.59 : ally-and-any-or-nexus →
        //  - 1re cible ally (sacrifice).
        //  - 2e cible any (incluant ally pour 01SI025).
        pendingSpell.side === "ally-and-any-or-nexus")
    ) {
      onTargetSpell(unit.uid);
      return;
    }
    onZoom(unit);
  };

  const handleOpponentBenchClick = (unit: RuneterraBattleUnit) => {
    if (
      pendingSpell &&
      (pendingSpell.side === "enemy" ||
        pendingSpell.side === "any" ||
        pendingSpell.side === "any-or-nexus" ||
        // Phase 3.46 : ally-and-enemy → 2e cible doit être enemy.
        (pendingSpell.side === "ally-and-enemy" &&
          pendingSpell.firstTargetUid !== null) ||
        // Phase 3.59 : ally-and-any-or-nexus → 2e cible any.
        (pendingSpell.side === "ally-and-any-or-nexus" &&
          pendingSpell.firstTargetUid !== null))
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
      <PlayerStrip
        player={state.opponent}
        isOpponent
        isActive={state.activeSeat !== state.selfSeat}
        hasAttackToken={state.opponent.attackToken}
        nexusPopup={nexusDamagePopups?.opponent}
        handPulse={handPulse?.opponent}
        nexusTargetable={
          pendingSpell?.side === "any-or-nexus" ||
          (pendingSpell?.side === "ally-and-any-or-nexus" &&
            pendingSpell.firstTargetUid !== null)
        }
        onNexusClick={() => onTargetSpell("nexus-enemy")}
      />
      <BenchRow
        units={state.opponent.bench}
        onUnitClick={handleOpponentBenchClick}
        onHoverCode={onHoverCode}
        recentLevelUps={recentLevelUps}
        damagePopups={damagePopups}
        recentlySummoned={recentlySummoned}
        highlighted={
          pendingSpell &&
          (pendingSpell.side === "enemy" ||
            pendingSpell.side === "any" ||
            pendingSpell.side === "any-or-nexus" ||
            (pendingSpell.side === "ally-and-enemy" &&
              pendingSpell.firstTargetUid !== null) ||
            (pendingSpell.side === "ally-and-any-or-nexus" &&
              pendingSpell.firstTargetUid !== null))
            ? new Set(state.opponent.bench.map((u) => u.uid))
            : undefined
        }
        firstSelectedUid={pendingSpell?.firstTargetUid ?? null}
        secondSelectedUid={pendingSpell?.secondTargetUid ?? null}
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
          {pendingSpell && pendingSpell.hasChoice && (
            <button
              onClick={onToggleSpellChoice}
              className="rounded-md border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-amber-500/30"
            >
              Choix : {pendingSpell.spellChoice === 0 ? "+3|+0" : "+0|+3"} (clic pour switch)
            </button>
          )}
          {pendingSpell && (
            <span className="text-violet-300">
              ✨{" "}
              {pendingSpell.targetCount === 1
                ? "Choisis une cible"
                : pendingSpell.firstTargetUid === null
                  ? `Choisis la 1re cible (${pendingSpell.targetCount} au total)`
                  : pendingSpell.targetCount === 3 &&
                      pendingSpell.secondTargetUid === null
                    ? "Choisis la 2e cible (distincte)"
                    : pendingSpell.targetCount === 3
                      ? "Choisis la 3e cible (distincte)"
                      : "Choisis la 2e cible (distincte)"}{" "}
              (
              {pendingSpell.side === "ally"
                ? "allié"
                : pendingSpell.side === "enemy"
                  ? "ennemi"
                  : pendingSpell.side === "any-or-nexus"
                    ? "unité ou nexus"
                    : pendingSpell.side === "ally-and-enemy"
                      ? pendingSpell.firstTargetUid === null
                        ? "1er = allié"
                        : "2e = ennemi"
                      : pendingSpell.side === "ally-and-any-or-nexus"
                        ? pendingSpell.firstTargetUid === null
                          ? "1er = allié à sacrifier"
                          : "2e = unité ou nexus"
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
        onHoverCode={onHoverCode}
        recentLevelUps={recentLevelUps}
        damagePopups={damagePopups}
        recentlySummoned={recentlySummoned}
        highlighted={
          combatMode === "attacker-pick"
            ? pickedAttackers
            : pendingSpell &&
                (pendingSpell.side === "ally" ||
                  pendingSpell.side === "any" ||
                  pendingSpell.side === "any-or-nexus" ||
                  (pendingSpell.side === "ally-and-enemy" &&
                    pendingSpell.firstTargetUid === null) ||
                  pendingSpell.side === "ally-and-any-or-nexus")
              ? new Set(state.self.bench.map((u) => u.uid))
              : undefined
        }
        firstSelectedUid={pendingSpell?.firstTargetUid ?? null}
        secondSelectedUid={pendingSpell?.secondTargetUid ?? null}
        attackerPickMode={combatMode === "attacker-pick"}
        onUnitClick={handleSelfBenchClick}
      />
      <PlayerStrip
        player={state.self}
        isOpponent={false}
        isActive={state.activeSeat === state.selfSeat}
        hasAttackToken={state.self.attackToken}
        nexusPopup={nexusDamagePopups?.self}
        handPulse={handPulse?.self}
        nexusTargetable={
          pendingSpell?.side === "any-or-nexus" ||
          (pendingSpell?.side === "ally-and-any-or-nexus" &&
            pendingSpell.firstTargetUid !== null)
        }
        onNexusClick={() => onTargetSpell("nexus-self")}
      />
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
        onHoverCode={onHoverCode}
      />

      {/* Log expandable + help button */}
      <BattleLogPanel state={state} />
    </div>
  );
}

function BattleLogPanel({ state }: { state: RuneterraBattleState }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? state.log : state.log.slice(-5);
  return (
    <div className="shrink-0">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-white/[0.07]"
        >
          <span>{expanded ? "▼" : "▶"}</span>
          <span>
            {expanded
              ? `Log (${state.log.length} évènements)`
              : `Log compact (5/${state.log.length})`}
          </span>
        </button>
        <Link
          href="/play/tcg/lol/regles"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200 hover:bg-violet-500/20"
        >
          📖 Règles
        </Link>
      </div>
      <div
        className={`mt-1 overflow-y-auto rounded-md border border-white/5 bg-black/30 p-2 text-[11px] text-zinc-400 ${
          expanded ? "max-h-48" : "max-h-20"
        }`}
      >
        {visible.length === 0 ? (
          <div className="text-zinc-600">— début de la partie —</div>
        ) : (
          visible.map((entry, i) => <div key={i}>{entry}</div>)
        )}
      </div>
    </div>
  );
}

// ────────────────────── Sub-components ──────────────────────────────────

function PlayerStrip({
  player,
  isOpponent,
  onZoom,
  nexusTargetable,
  onNexusClick,
  isActive,
  hasAttackToken,
  nexusPopup,
  handPulse,
}: {
  player: RuneterraPlayerPublicState | RuneterraSelfState;
  isOpponent: boolean;
  onZoom?: (c: RuneterraBattleUnit | string) => void;
  // Phase 3.41 : nexus comme cible cliquable pour sorts any-or-nexus.
  nexusTargetable?: boolean;
  onNexusClick?: () => void;
  // Phase 4.9 : ce joueur a la priorité ce tour ? Active glow distinct.
  isActive?: boolean;
  // Phase 4.9 : ce joueur a le jeton d'attaque ce round ?
  hasAttackToken?: boolean;
  // Phase 5.4 : popup -N rouge (dégâts) ou +N vert (heal) au-dessus du nexus.
  nexusPopup?: { amount: number; ts: number; isHeal: boolean };
  // Phase 5.12 : timestamp du dernier draw — déclenche un animate-pulse
  // sur le badge handCount (~800ms).
  handPulse?: number;
}) {
  void onZoom;
  const nexusClass = nexusTargetable
    ? "cursor-pointer rounded-md bg-violet-500/20 px-2 py-0.5 text-violet-200 ring-1 ring-violet-300 hover:bg-violet-500/40"
    : "text-emerald-300";
  // Phase 4.9 : border + glow différents selon le tour actif.
  const activeClass = isActive
    ? isOpponent
      ? "border-rose-400/60 bg-rose-950/40 shadow-[0_0_24px_rgba(244,63,94,0.35)]"
      : "border-sky-400/60 bg-sky-950/40 shadow-[0_0_24px_rgba(56,189,248,0.4)] ring-1 ring-sky-400/30"
    : "border-white/10 bg-black/40";
  return (
    <div
      className={`flex shrink-0 items-center justify-between rounded-lg border px-3 py-1.5 text-sm transition-all ${activeClass}`}
    >
      <div className="flex items-center gap-3">
        {/* Phase 4.9 : indicateur de tour visible à gauche */}
        {isActive && (
          <span
            className="text-base animate-pulse"
            title={isOpponent ? "Tour adverse" : "Ton tour"}
          >
            ▶
          </span>
        )}
        <span
          className={`font-semibold ${isOpponent ? "text-rose-300" : "text-sky-300"}`}
        >
          {player.username}
        </span>
        {/* Phase 6.3 : icônes des régions du deck du joueur. */}
        {player.deckRegions && player.deckRegions.length > 0 && (
          <span className="flex items-center gap-0.5">
            {player.deckRegions.map((r) => (
              <span
                key={r}
                className="text-base"
                title={REGION_LABELS[r] ?? r}
              >
                {REGION_GLYPHS[r] ?? "❓"}
              </span>
            ))}
          </span>
        )}
        {/* Phase 4.9 : badge jeton d'attaque (⚔️ si en main ce round) */}
        {hasAttackToken && (
          <span
            className="rounded bg-orange-500/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-orange-200 ring-1 ring-orange-400/40"
            title="Jeton d'attaque ce round"
          >
            ⚔️ Attaque
          </span>
        )}
        <span className="text-[11px] text-zinc-500">
          <span
            key={handPulse ?? 0}
            className={
              handPulse
                ? "rounded bg-emerald-500/30 px-1 text-emerald-200 animate-pulse"
                : ""
            }
          >
            🎴 {player.handCount}
          </span>
          {" · "}📦 {player.deckSize}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs tabular-nums">
        {/* Phase 5.13 : mana orbs visuels — chaque mana = un cercle.
            Bleu plein = disponible, gris vide = utilisé. Cap à 10 (manaMax max). */}
        <ManaDisplay
          mana={player.mana}
          manaMax={player.manaMax}
          spellMana={player.spellMana}
        />
        <button
          type="button"
          disabled={!nexusTargetable}
          onClick={() => onNexusClick?.()}
          className={`${nexusClass} relative`}
        >
          ❤️ {player.nexusHealth}
          {/* Phase 5.4 : popup -N rouge ou +N vert au-dessus du nexus. */}
          {nexusPopup && (
            <span
              key={nexusPopup.ts}
              className={`pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 animate-bounce text-2xl font-bold drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)] ${
                nexusPopup.isHeal ? "text-emerald-300" : "text-rose-400"
              }`}
              aria-hidden
            >
              {nexusPopup.isHeal ? "+" : "-"}
              {nexusPopup.amount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

// Phase 6.3 : glyphes + labels par région LoR pour PlayerStrip.
const REGION_GLYPHS: Record<string, string> = {
  Demacia: "⚔️",
  Noxus: "🔥",
  Ionia: "🌸",
  Freljord: "❄️",
  PiltoverZaun: "⚙️",
  ShadowIsles: "👻",
};
const REGION_LABELS: Record<string, string> = {
  Demacia: "Demacia",
  Noxus: "Noxus",
  Ionia: "Ionia",
  Freljord: "Freljord",
  PiltoverZaun: "Piltover & Zaun",
  ShadowIsles: "Îles obscures",
};

// Phase 5.13 : visuel mana sous forme de pastilles circulaires.
// `mana` = cercles bleus pleins (mana dispo) ; `manaMax - mana` =
// cercles gris (utilisée ce round). `spellMana` = bonus violet à droite.
function ManaDisplay({
  mana,
  manaMax,
  spellMana,
}: {
  mana: number;
  manaMax: number;
  spellMana: number;
}) {
  // Affichage compact pour ≤6, plus condensé au-delà.
  const orbs = Array.from({ length: manaMax }).map((_, i) => i < mana);
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex items-center gap-0.5" title={`${mana}/${manaMax} mana`}>
        {orbs.map((filled, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full ring-1 ${
              filled
                ? "bg-sky-400 ring-sky-200/60 shadow-[0_0_4px_rgba(56,189,248,0.6)]"
                : "bg-zinc-700 ring-zinc-600"
            }`}
          />
        ))}
      </span>
      {spellMana > 0 && (
        <span
          className="flex items-center gap-0.5"
          title={`${spellMana} spell mana banked`}
        >
          <span className="text-[10px] text-violet-300">✨</span>
          {Array.from({ length: spellMana }).map((_, i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-violet-400 ring-1 ring-violet-200/60 shadow-[0_0_4px_rgba(167,139,250,0.6)]"
            />
          ))}
        </span>
      )}
    </div>
  );
}

function BenchRow({
  units,
  onUnitClick,
  onHoverCode,
  highlighted,
  firstSelectedUid,
  secondSelectedUid,
  attackerPickMode,
  recentLevelUps,
  damagePopups,
  recentlySummoned,
}: {
  units: RuneterraBattleUnit[];
  onUnitClick: (u: RuneterraBattleUnit) => void;
  // Phase 4.3 : preview survol — propagé depuis LorBattleClient.
  onHoverCode?: (code: string | null) => void;
  highlighted?: Set<string>;
  // Phase 3.39 : pour les sorts 2-cibles, marque la 1re cible déjà
  // sélectionnée. Phase 3.70 : 2e cible pour sorts 3-cibles.
  firstSelectedUid?: string | null;
  secondSelectedUid?: string | null;
  attackerPickMode?: boolean;
  // Phase 4.4 : VFX
  recentLevelUps?: Set<string>;
  damagePopups?: Record<string, { amount: number; ts: number }>;
  // Phase 5.6 : animation summon entrée (slide-in 600ms).
  recentlySummoned?: Set<string>;
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
        const isFirstSelected = firstSelectedUid === u.uid;
        const isSecondSelected = secondSelectedUid === u.uid;
        const eligibleAttacker =
          !attackerPickMode || (!u.playedThisRound && u.power > 0);
        const ringClass = isFirstSelected
          ? "rounded-md ring-2 ring-fuchsia-400 ring-offset-1 ring-offset-black"
          : isSecondSelected
            ? "rounded-md ring-2 ring-amber-400 ring-offset-1 ring-offset-black"
            : "";
        return (
          <div key={u.uid} className={ringClass}>
            <UnitCard
              unit={u}
              onClick={() => onUnitClick(u)}
              onHoverCode={onHoverCode}
              highlighted={isPicked}
              dimmed={attackerPickMode && !eligibleAttacker}
              flashLevelUp={recentLevelUps?.has(u.uid)}
              damagePopup={damagePopups?.[u.uid]}
              justSummoned={recentlySummoned?.has(u.uid)}
            />
          </div>
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
  // Phase 3.19 : Challenger units peuvent forcer n'importe quel ennemi.
  // Phase 3.21 : tous les attaquants peuvent forcer un ennemi qui a
  // Vulnerable (sans avoir besoin de Challenger côté attaquant).
  const challengerAttackers = pickedAttackerUids
    .map((uid) => attackerBench.find((u) => u.uid === uid))
    .filter((u): u is RuneterraBattleUnit => u !== undefined)
    .filter((u) => {
      // Show picker si l'attaquant a Challenger (peut forcer n'importe qui)
      // OU si au moins un ennemi a Vulnerable (l'attaquant peut le forcer).
      if (u.keywords.includes("Challenger")) return true;
      return enemyBench.some((b) => b.keywords.includes("Vulnerable"));
    });
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
                {enemyBench
                  .filter((b) => {
                    // Phase 3.21 : si l'attaquant n'a pas Challenger, seuls
                    // les ennemis Vulnerable sont éligibles.
                    if (attacker.keywords.includes("Challenger")) return true;
                    return b.keywords.includes("Vulnerable");
                  })
                  .map((b) => {
                    const bCard = RUNETERRA_BASE_SET_BY_CODE.get(b.cardCode);
                    const tag = b.keywords.includes("Vulnerable") ? " ⚠️" : "";
                    return (
                      <option key={b.uid} value={b.uid}>
                        {bCard?.name?.slice(0, 14) ?? b.cardCode}
                        {tag} ({b.power}/{b.health - b.damage})
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
    <div className="flex shrink-0 gap-3 overflow-x-auto rounded-md border border-rose-500/40 bg-gradient-to-b from-rose-900/30 to-rose-900/10 p-2 shadow-[inset_0_0_20px_rgba(244,63,94,0.2)] animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Phase 4.5 : header animé pour mettre en valeur le moment combat. */}
      <div className="flex shrink-0 flex-col items-center justify-center px-2">
        <div className="text-2xl animate-pulse">⚔️</div>
        <div className="text-[9px] uppercase tracking-widest text-rose-300">
          Combat
        </div>
      </div>
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

        // Liste des bloqueurs valides (filtre Elusive + Fearsome + CantBlock).
        const validBlockers = mustAssignBlockers
          ? defenderBench.filter((u) => {
              if (!attackerUnit) return true;
              // Phase 4.8 : CantBlock interdit le défenseur d'être bloqueur.
              if (u.keywords.includes("CantBlock")) return false;
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
            className="flex flex-col items-center gap-1 rounded border border-white/10 bg-black/40 p-1.5 animate-in fade-in slide-in-from-top-2 duration-300"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="text-[9px] uppercase tracking-widest text-rose-300">
              Lane {i + 1}
            </div>
            {attackerUnit ? (
              <div className="animate-in zoom-in-95 duration-300">
                <UnitCard
                  unit={attackerUnit}
                  onClick={() => onZoom(attackerUnit)}
                />
              </div>
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
  onHoverCode,
  highlighted,
  dimmed,
  flashLevelUp,
  damagePopup,
  justSummoned,
}: {
  unit: RuneterraBattleUnit;
  onClick: () => void;
  // Phase 4.3 : appelé avec cardCode au survol (mouseenter), null à la
  // sortie. Permet d'afficher une preview large à droite de l'écran.
  onHoverCode?: (code: string | null) => void;
  highlighted?: boolean;
  dimmed?: boolean;
  // Phase 4.4 : VFX flash juste après le level-up (gold burst 2s).
  flashLevelUp?: boolean;
  // Phase 4.4 : damage popup floating "-N" (1.2s).
  damagePopup?: { amount: number; ts: number };
  // Phase 5.6 : animation d'entrée slide-in quand l'unité vient d'être
  // invoquée sur le banc (600ms).
  justSummoned?: boolean;
}) {
  const card = RUNETERRA_BASE_SET_BY_CODE.get(unit.cardCode);
  const aliveHealth = unit.health - unit.damage;
  const isChampion = card?.supertype === "Champion";
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => onHoverCode?.(unit.cardCode)}
      onMouseLeave={() => onHoverCode?.(null)}
      disabled={dimmed}
      className={`relative flex w-24 flex-col items-stretch overflow-hidden rounded border bg-black/40 transition-transform ${
        highlighted
          ? "border-rose-400 ring-2 ring-rose-400/60 shadow-[0_0_20px_rgba(244,114,128,0.5)] -translate-y-1"
          : card
            ? LOR_RARITY_COLOR[card.rarity]
            : "border-white/10"
      } ${dimmed ? "opacity-40 cursor-not-allowed" : "hover:scale-[1.05] hover:-translate-y-1"} ${
        justSummoned
          ? "animate-in zoom-in-50 fade-in slide-in-from-bottom-4 duration-500"
          : ""
      }`}
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
        <>
          {/* Phase 4.3 : aura dorée pulsante autour des champions level 2. */}
          <div className="pointer-events-none absolute inset-0 animate-pulse rounded ring-2 ring-amber-300/60 shadow-[0_0_18px_rgba(252,211,77,0.55)]" />
          <div className="absolute right-0.5 top-0.5 rounded bg-amber-400 px-1 text-[8px] font-bold text-amber-950 shadow">
            ★ 2
          </div>
        </>
      )}
      {/* Phase 4.4 : flash gold-burst au moment du level-up (2s). */}
      {flashLevelUp && (
        <div
          className="pointer-events-none absolute inset-0 animate-ping rounded bg-amber-300/30 ring-4 ring-amber-200"
          aria-hidden
        />
      )}
      {/* Phase 4.4 : damage popup flottant ("-N" rouge, slide-up + fade-out). */}
      {damagePopup && (
        <div
          key={damagePopup.ts}
          className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 animate-bounce text-2xl font-bold text-rose-400 drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]"
          aria-hidden
        >
          -{damagePopup.amount}
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
  onHoverCode,
}: {
  self: RuneterraSelfState;
  myTurn: boolean;
  onPlay: (handIndex: number) => void;
  onZoom: (cardCode: string) => void;
  // Phase 4.3 : preview survol
  onHoverCode?: (code: string | null) => void;
}) {
  return (
    <div className="flex shrink-0 gap-2 overflow-x-auto rounded-md border border-white/10 bg-black/30 p-2">
      {self.hand.length === 0 ? (
        <span className="px-3 py-2 text-xs text-zinc-500">Main vide</span>
      ) : (
        self.hand.map((cardCode, i) => {
          const card = RUNETERRA_BASE_SET_BY_CODE.get(cardCode);
          // Phase 3.67 : récupère le cardBuff pour cet uid (si présent).
          const handUid = self.handUids?.[i];
          const buff = handUid ? self.cardBuffs?.[handUid] : undefined;
          const printedCost = card?.cost ?? 0;
          const effectiveCost = Math.max(0, printedCost + (buff?.costDelta ?? 0));
          const total = self.mana + (card?.type === "Spell" ? self.spellMana : 0);
          const playable = myTurn && total >= effectiveCost;
          // Stats affichées avec buff (pour Units uniquement).
          const printedAttack = card?.attack ?? 0;
          const printedHealth = card?.health ?? 0;
          const effectiveAttack = printedAttack + (buff?.powerDelta ?? 0);
          const effectiveHealth = printedHealth + (buff?.healthDelta ?? 0);
          const hasBuff = buff && (
            buff.powerDelta !== 0 ||
            buff.healthDelta !== 0 ||
            buff.costDelta !== 0 ||
            buff.addKeywords.length > 0
          );
          const costColor = buff && buff.costDelta < 0 ? "bg-emerald-500/90" : "bg-blue-500/80";
          return (
            <button
              key={`${cardCode}-${i}`}
              onClick={() => playable && onPlay(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                onZoom(cardCode);
              }}
              onMouseEnter={() => onHoverCode?.(cardCode)}
              onMouseLeave={() => onHoverCode?.(null)}
              disabled={!myTurn}
              className={`relative w-28 shrink-0 overflow-hidden rounded border-2 transition-transform ${
                playable
                  ? "border-emerald-400/60 cursor-pointer hover:scale-[1.08] hover:-translate-y-3"
                  : "border-white/10 opacity-70 cursor-not-allowed"
              }`}
              title={`${card?.name ?? cardCode}${hasBuff ? " (buffé)" : ""} · click pour jouer · clic-droit pour zoomer`}
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
              <div className={`absolute left-1 top-1 rounded-full px-1.5 text-[10px] font-bold text-white ${costColor}`}>
                {effectiveCost}
              </div>
              {/* Phase 3.67 : badge stats si Unit + buff */}
              {card?.type === "Unit" && hasBuff && (
                <div className="absolute right-1 top-1 rounded bg-fuchsia-500/90 px-1 text-[9px] font-bold text-white">
                  {effectiveAttack}/{effectiveHealth}
                </div>
              )}
              {/* Phase 5.0 : badge spell speed sur sorts (Burst/Fast/Slow). */}
              {card?.type === "Spell" && card.spellSpeed && (
                <div
                  className={`absolute right-1 top-1 rounded px-1 text-[8px] font-bold ${
                    card.spellSpeed === "Burst"
                      ? "bg-amber-400 text-amber-950"
                      : card.spellSpeed === "Fast"
                        ? "bg-sky-400 text-sky-950"
                        : card.spellSpeed === "Slow"
                          ? "bg-rose-400 text-rose-950"
                          : "bg-violet-400 text-violet-950"
                  }`}
                  title={card.spellSpeed}
                >
                  {card.spellSpeed === "Burst"
                    ? "⚡"
                    : card.spellSpeed === "Fast"
                      ? "💨"
                      : card.spellSpeed === "Slow"
                        ? "🐢"
                        : "🎯"}
                </div>
              )}
              {/* Phase 5.0 : badge Fleeting si défaussé EOR. */}
              {card?.keywordRefs?.includes("Fleeting") && (
                <div
                  className="absolute bottom-6 right-1 rounded bg-orange-500 px-1 text-[8px] font-bold text-orange-950 shadow"
                  title="Fugace : défaussée à la fin du round si en main"
                >
                  ⏳
                </div>
              )}
              {/* Phase 3.67 : badge keywords ajoutés */}
              {hasBuff && buff && buff.addKeywords.length > 0 && (
                <div className="absolute bottom-1 left-1 right-1 truncate rounded bg-fuchsia-500/90 px-1 text-[8px] font-bold text-white">
                  +{buff.addKeywords.join(" +")}
                </div>
              )}
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
  const isDraw = state.winner === null;
  // Phase 5.5 : EndView polish — gros titre gradient, résumé stats, log
  // expandable, bouton retour + revanche.
  return (
    <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-6 py-10">
      {/* Background overlay coloré selon résultat */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 ${
          won
            ? "bg-gradient-to-b from-emerald-500/10 via-emerald-500/5 to-transparent"
            : isDraw
              ? "bg-gradient-to-b from-zinc-500/10 to-transparent"
              : "bg-gradient-to-b from-rose-500/10 via-rose-500/5 to-transparent"
        }`}
      />
      <div className="animate-in fade-in zoom-in-90 duration-500 text-center">
        <div className="text-6xl">
          {won ? "🏆" : isDraw ? "🤝" : "💀"}
        </div>
        <h1
          className={`mt-2 text-5xl font-black tracking-tight drop-shadow-lg ${
            won
              ? "bg-gradient-to-r from-emerald-200 to-emerald-400 bg-clip-text text-transparent"
              : isDraw
                ? "text-zinc-200"
                : "bg-gradient-to-r from-rose-200 to-rose-400 bg-clip-text text-transparent"
          }`}
        >
          {won ? "VICTOIRE" : isDraw ? "ÉGALITÉ" : "DÉFAITE"}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          {won
            ? "Tu as réduit le Nexus adverse à 0 — bien joué !"
            : isDraw
              ? "Les deux Nexus sont tombés ce round."
              : "Ton Nexus est tombé. Réessaye avec un autre deck !"}
        </p>
      </div>

      {/* Résumé stats du match */}
      <div className="grid w-full max-w-md grid-cols-3 gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
        <div className="rounded-md border border-white/10 bg-black/40 p-2 text-center">
          <div className="text-[9px] uppercase tracking-widest text-zinc-500">
            Round
          </div>
          <div className="text-lg font-bold tabular-nums text-zinc-200">
            {state.round}
          </div>
        </div>
        <div className="rounded-md border border-white/10 bg-black/40 p-2 text-center">
          <div className="text-[9px] uppercase tracking-widest text-zinc-500">
            Ton Nexus
          </div>
          <div
            className={`text-lg font-bold tabular-nums ${(state.self?.nexusHealth ?? 0) > 0 ? "text-emerald-300" : "text-rose-400"}`}
          >
            {state.self?.nexusHealth ?? 0}
          </div>
        </div>
        <div className="rounded-md border border-white/10 bg-black/40 p-2 text-center">
          <div className="text-[9px] uppercase tracking-widest text-zinc-500">
            Adverse
          </div>
          <div
            className={`text-lg font-bold tabular-nums ${(state.opponent?.nexusHealth ?? 0) > 0 ? "text-emerald-300" : "text-rose-400"}`}
          >
            {state.opponent?.nexusHealth ?? 0}
          </div>
        </div>
      </div>

      {/* Log scrollable */}
      <details className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
        <summary className="cursor-pointer rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-400 hover:bg-black/60">
          📜 Voir le journal du combat ({state.log.length} événements)
        </summary>
        <div className="mt-2 max-h-60 w-full overflow-y-auto rounded-md border border-white/10 bg-black/40 p-3 text-[11px] text-zinc-400">
          {state.log.map((entry, i) => (
            <div key={i} className="border-b border-white/5 py-0.5 last:border-0">
              {entry}
            </div>
          ))}
        </div>
      </details>

      <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-500">
        <Link
          href="/play/tcg/lol"
          className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10"
        >
          ← Retour au menu
        </Link>
        <Link
          href="/play/tcg/lol/decks"
          className="rounded-md bg-violet-500 px-4 py-2 text-sm font-bold text-violet-950 hover:bg-violet-400"
        >
          🛠️ Mes decks
        </Link>
        <Link
          href="/play/tcg/lol/battle/bot"
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-400"
        >
          🤖 Rejouer vs bot
        </Link>
      </div>
    </div>
  );
}
