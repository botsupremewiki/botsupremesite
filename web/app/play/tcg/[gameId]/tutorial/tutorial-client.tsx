"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step = {
  title: string;
  body: string;
  visual: React.ReactNode;
};

const STEPS_POKEMON: Step[] = [
  {
    title: "Bienvenue dans le TCG Pokémon Pocket",
    body: "Tu vas affronter d'autres dresseurs avec un deck de 20 cartes. Le but : mettre KO 3 Pokémon de ton adversaire avant qu'il ne fasse pareil. Pas de chance pure : c'est la stratégie qui décide.",
    visual: <BoardMockup phase="intro" />,
  },
  {
    title: "Le deck — 20 cartes, max 2 du même nom",
    body: "Tu construis un deck de 20 cartes (Pokémon + cartes Dresseur). Tu ne peux pas avoir plus de 2 exemplaires d'une même carte. Au début du match, tu piochias 5 cartes de la main de départ.",
    visual: <BoardMockup phase="deck" />,
  },
  {
    title: "L'énergie auto",
    body: "Chaque tour, tu reçois automatiquement 1 énergie d'un type aléatoire parmi ceux que ton deck déclare. Tu peux l'attacher à ton Pokémon Actif ou à un Pokémon de ton banc. Sans énergie, pas d'attaque !",
    visual: <BoardMockup phase="energy" />,
  },
  {
    title: "Le Pokémon Actif et le banc",
    body: "Tu as 1 Pokémon Actif (au front) et jusqu'à 3 Pokémon de banc (en réserve). Le banc te permet d'évoluer et de remplacer ton actif s'il est KO. Pour échanger, paye le coût de retraite (énergies à défausser).",
    visual: <BoardMockup phase="bench" />,
  },
  {
    title: "Évolution",
    body: "Un Pokémon Stage 1 / Stage 2 doit évoluer depuis sa forme précédente, déjà en jeu depuis ≥1 tour. Évoluer guérit toutes les altérations (Sommeil, Paralysie...) et permet d'utiliser sa nouvelle attaque.",
    visual: <BoardMockup phase="evolve" />,
  },
  {
    title: "Attaquer et infliger des dégâts",
    body: "Si tu as les énergies requises sur ton actif, choisis une attaque. Les dégâts sont réduits par les résistances (-20) ou doublés par les faiblesses. Quand un Pokémon atteint 0 PV, il est KO.",
    visual: <BoardMockup phase="attack" />,
  },
  {
    title: "Les points de victoire",
    body: "Mettre KO un Pokémon = 1 point. Mettre KO un Pokémon EX = 2 points. Le premier à 3 points gagne. Tu peux aussi gagner si l'adversaire ne peut plus jouer (deck vide ou aucun Pokémon en jeu).",
    visual: <BoardMockup phase="victory" />,
  },
  {
    title: "À toi de jouer !",
    body: "Tu as les bases. Le mieux est d'apprendre en jouant : commence contre le Bot Suprême (12 decks préfaits qui s'adaptent à ton style) puis affronte de vrais joueurs. Bon match ! 🎮",
    visual: <BoardMockup phase="ready" />,
  },
];

/** Étapes du tutoriel One Piece TCG. Clone fidèle des règles Bandai :
 *  Leader + 50 cartes + 10 DON, Vie 4-5 selon Leader, phases Refresh/
 *  Pioche/DON/Main/Fin, Power vs Power, Triggers de Vie. */
const STEPS_ONEPIECE: Step[] = [
  {
    title: "Bienvenue dans One Piece TCG",
    body: "Clone fidèle du jeu officiel Bandai. Tu pars à l'abordage avec ton Leader, ses Persos et ses DON!! pour réduire à zéro la Vie de l'adversaire (4 ou 5 cartes selon le Leader). Stratégie pure, pas de hasard.",
    visual: <OnePieceMockup phase="intro" />,
  },
  {
    title: "Le deck — 1 Leader + 50 cartes + 10 DON",
    body: "Tu choisis 1 Leader (qui détermine ta Vie initiale, ta puissance et tes couleurs autorisées), puis 50 cartes (Persos, Évents, Lieux) max 4 copies par cardNumber. Ton deck DON séparé contient toujours 10 cartes DON!!.",
    visual: <OnePieceMockup phase="deck" />,
  },
  {
    title: "Les DON!! — moteur du jeu",
    body: "Chaque tour, tu ajoutes 2 DON (1 au tout 1er tour) à ta zone DON active. Tu peux les dépenser pour jouer des cartes (coût) OU les attacher à un Leader/Persos pour +1000 puissance chacun. À la fin du tour, les DON attachées reviennent en zone DON épuisée.",
    visual: <OnePieceMockup phase="don" />,
  },
  {
    title: "Phases d'un tour",
    body: "1) Refresh : tu redresses Leader, Persos, Lieu et DON. 2) Pioche : 1 carte (sauf 1er tour). 3) DON : ajoute 2 DON. 4) Phase principale : joue cartes, attache DON, attaque. 5) Fin : DON attachées retournent en pool épuisée.",
    visual: <OnePieceMockup phase="phases" />,
  },
  {
    title: "Attaquer — Power vs Power",
    body: "Choisis un attaquant redressé (Leader ou Persos). Cible : Leader adverse OU Persos épuisé adverse. Si Power attaquant ≥ Power cible, ça touche. Sur Leader hit : l'adversaire prend 1 carte Vie en main (2 si [Double Attaque]). Sur Persos hit : KO. Le 1er joueur ne peut PAS attaquer au tour 1.",
    visual: <OnePieceMockup phase="attack" />,
  },
  {
    title: "Se défendre — Bloqueur, Counter, Trigger",
    body: "Quand on t'attaque tu peux : 1) [Bloqueur] : un Persos rested redirige l'attaque sur lui. 2) Counter : depuis la main, joue un Persos avec valeur counter (1000/2000) ou un Évent [Contre]. 3) Trigger : si une Vie révélée a un [Déclenchement], tu peux l'activer avant qu'elle aille en main.",
    visual: <OnePieceMockup phase="defense" />,
  },
  {
    title: "Conditions de victoire",
    body: "Tu gagnes si tu réduis la Vie de l'adversaire à 0 en attaquant son Leader (4-5 dégâts selon Leader). Tu gagnes aussi par deck-out (l'adversaire ne peut plus piocher). Inversement, garde l'œil sur ton propre deck.",
    visual: <OnePieceMockup phase="victory" />,
  },
  {
    title: "À l'abordage, pirate !",
    body: "Tu connais les règles essentielles. Le mieux est d'apprendre en jouant : commence contre le Bot Suprême (deck miroir équilibré) puis vise le PvP classé. Bon match, capitaine ! 🏴‍☠️",
    visual: <OnePieceMockup phase="ready" />,
  },
];

/** Étapes du tutoriel LoR (League of Runeterra clone). Mécaniques clés :
 *  mana max +1/round, spell mana banked, attack token alterné,
 *  champions level-up, 3 vitesses de sort. */
const STEPS_LOR: Step[] = [
  {
    title: "Bienvenue dans LoL TCG (Runeterra)",
    body: "Clone fidèle de Legends of Runeterra (sunset 2024 par Riot). Réduis le Nexus adverse de 20 à 0 via tes attaques et sorts. 6 régions, ~40 mots-clés, gameplay très tactique.",
    visual: <LorMockup phase="intro" />,
  },
  {
    title: "Le deck — 40 cartes + 1-2 régions",
    body: "Exactement 40 cartes (Unités + Sorts), max 3 copies par cardCode, max 6 champions, 1-2 régions parmi : Demacia, Freljord, Ionia, Noxus, Piltover & Zaun, Îles obscures.",
    visual: <LorMockup phase="deck" />,
  },
  {
    title: "Mana et spell mana",
    body: "Chaque round ton mana max +1 (cap 10). Mana non utilisé en fin de round → spell mana (cap 3) que tu peux dépenser uniquement pour des sorts les rounds suivants. Gestion clé !",
    visual: <LorMockup phase="mana" />,
  },
  {
    title: "Le jeton d'attaque",
    body: "Un seul joueur peut attaquer par round — le porteur du jeton. Le jeton alterne à chaque round. Tu peux choisir de ne pas attaquer et garder du mana pour des sorts.",
    visual: <LorMockup phase="token" />,
  },
  {
    title: "Combat — déclaration et bloqueurs",
    body: "Tu choisis 1 à 6 unités prêtes pour attaquer (ordre dans des lanes). L'adversaire assigne 1 bloqueur par lane (ou laisse passer = dégâts au Nexus). Mots-clés contraints : Insaisissable, Redoutable, Challenger…",
    visual: <LorMockup phase="combat" />,
  },
  {
    title: "Vitesses de sort — Burst / Fast / Slow",
    body: "Burst (instantané, ne donne pas la priorité), Fast (rapide, l'adversaire peut réagir avec ses Fast/Burst), Slow (lent, ne peut pas être lancé en combat). Choisis bien quand tu veux jouer.",
    visual: <LorMockup phase="speed" />,
  },
  {
    title: "Champions et level-up",
    body: "Les Champions ont une condition de level-up unique. Une fois remplie, ils passent niveau 2 avec stats et abilities boostés. Garen frappe 2× = level 2 ; Lux dépense 6+ mana en sorts ; Yasuo voit 4 unités stun/recall…",
    visual: <LorMockup phase="champion" />,
  },
  {
    title: "Au combat, invocateur !",
    body: "Tu connais l'essentiel. Pour tester : Bot Suprême puis ranked. Bon match ! ⚔️",
    visual: <LorMockup phase="ready" />,
  },
];

/** Sélecteur de steps selon le jeu. Default Pokemon. */
function getStepsForGame(gameId: string): Step[] {
  if (gameId === "onepiece") return STEPS_ONEPIECE;
  if (gameId === "lol") return STEPS_LOR;
  return STEPS_POKEMON;
}

export function TutorialClient({
  gameId,
  isLoggedIn,
  alreadyCompleted,
  reviewMode = false,
}: {
  gameId: string;
  isLoggedIn: boolean;
  alreadyCompleted: boolean;
  /** Tutoriel revisité depuis le hub (?review=1) : pas de récompense,
   *  bouton "Terminer" qui renvoie au hub /play/tcg/<gameId>, bouton
   *  "Skip" toujours dispo. */
  reviewMode?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [completing, setCompleting] = useState(false);
  // En mode review, jamais d'écran "Tutoriel terminé" — on revient
  // direct au hub via le bouton Terminer du dernier step.
  const [completed, setCompleted] = useState(
    reviewMode ? false : alreadyCompleted,
  );
  const [error, setError] = useState<string | null>(null);

  // Sélection des étapes selon le jeu (Pokemon / OnePiece / LoR).
  // Chaque jeu a son propre catalogue de steps (règles spécifiques).
  const steps = getStepsForGame(gameId);
  const isLast = step >= steps.length - 1;

  // "Terminer 🎉" sur la dernière étape : on affiche juste l'écran de fin
  // avec un PREVIEW des récompenses (+50 OS, +10 boosters). Aucun appel RPC
  // pour le moment — la validation officielle se fait sur le clic du bouton
  // "Accéder aux boosters" (cf. validateAndGoToBoosters), pour que l'user
  // puisse contempler ses gains tant qu'il veut avant de continuer.
  function showCompletionScreen() {
    setError(null);
    setCompleted(true);
  }

  // Mode review : "Terminer" renvoie direct au hub /play/tcg/<gameId>,
  // sans appel RPC ni écran de fin (l'user a déjà eu sa récompense la
  // 1ère fois — ou peut faire un autre run ne donne pas de récompense).
  function finishReviewMode() {
    router.push(`/play/tcg/${gameId}`);
  }

  // Mode review : skip du tutoriel = retour au hub. Identique à finir
  // mais accessible depuis n'importe quel step.
  function skipReviewMode() {
    router.push(`/play/tcg/${gameId}`);
  }

  // Validation finale + navigation. Appelé uniquement quand l'user clique
  // "Accéder aux boosters" sur l'écran de fin. C'est CE clic qui :
  //   1. Insère la ligne dans tcg_tutorial_completion (on conflict do nothing)
  //   2. Crédite les +50 OS + 10 boosters (uniquement la 1ère fois)
  //   3. Navigue vers /boosters
  // Si la RPC échoue, l'user reste sur l'écran de fin et voit l'erreur,
  // il peut re-cliquer pour retry.
  async function validateAndGoToBoosters() {
    const target = `/play/tcg/${gameId}/boosters`;
    setCompleting(true);
    setError(null);
    if (!isLoggedIn) {
      router.push(target);
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setError("Connexion à la base impossible. Réessaie.");
      setCompleting(false);
      return;
    }
    const { error: rpcError } = await supabase.rpc("complete_tcg_tutorial", {
      p_game_id: gameId,
    });
    if (rpcError) {
      setError(
        rpcError.message ?? "Erreur lors de l'enregistrement. Réessaie.",
      );
      setCompleting(false);
      return;
    }
    // RPC OK → navigation. On utilise router.push (pas router.refresh)
    // pour quitter la route /tutorial proprement sans déclencher le redirect
    // serveur intermédiaire.
    router.push(target);
  }

  if (completed) {
    // Preview de la récompense (10 boosters gratuits, valeur fixe côté
    // RPC v3). Si tu changes tcg-tutorial-rewards-v2.sql, mets aussi à
    // jour ce chiffre pour rester cohérent.
    const previewPacks = 10;
    return (
      <div className="rounded-xl border border-emerald-400/40 bg-gradient-to-b from-emerald-400/10 to-emerald-400/5 p-8 text-center">
        <div className="text-6xl">🎓</div>
        <h2 className="mt-3 text-2xl font-bold text-emerald-200">
          Tutoriel terminé !
        </h2>
        <p className="mt-2 text-sm text-zinc-300">
          Tu as reçu{" "}
          <strong className="text-amber-200">
            {previewPacks} boosters gratuits
          </strong>{" "}
          pour démarrer ta collection !
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <div className="rounded-lg border border-emerald-300/50 bg-emerald-400/15 px-4 py-3 text-sm font-bold text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.3)]">
            🎴 +{previewPacks} boosters gratuits
          </div>
        </div>
        {error && (
          <div className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            ⚠️ {error}
          </div>
        )}
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={validateAndGoToBoosters}
            disabled={completing}
            className="rounded-md border-2 border-emerald-300/70 bg-gradient-to-br from-emerald-500 to-emerald-700 px-6 py-3 text-base font-extrabold text-emerald-50 shadow-[0_4px_18px_rgba(52,211,153,0.35)] transition-all hover:scale-[1.02] hover:from-emerald-400 hover:to-emerald-600 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          >
            {completing ? "Enregistrement…" : "🎴 Accéder aux boosters"}
          </button>
        </div>
      </div>
    );
  }

  const current = steps[step];
  // Nouveau tutoriel pratique interactif (uniquement Pokemon pour
  // l'instant). On affiche un CTA en haut pour l'essayer en alternative
  // au slideshow. Les autres jeux n'ont pas (encore) de version interactive.
  const hasInteractive = gameId === "pokemon";
  return (
    <div className="flex flex-col gap-6">
      {hasInteractive && (
        <Link
          href={`/play/tcg/${gameId}/tutorial/game${reviewMode ? "?review=1" : ""}`}
          className="group relative flex items-center gap-3 overflow-hidden rounded-xl border-2 border-amber-300/60 bg-gradient-to-r from-amber-400/15 via-amber-300/10 to-emerald-400/15 p-3 shadow-[0_0_20px_rgba(251,191,36,0.2)] transition-all hover:border-amber-200/80 hover:shadow-[0_0_30px_rgba(251,191,36,0.4)]"
        >
          <span className="text-2xl">🎮</span>
          <div className="flex-1">
            <div className="text-sm font-bold text-amber-100">
              Mode pratique interactif{" "}
              <span className="ml-1 rounded bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">
                NOUVEAU
              </span>
            </div>
            <div className="text-xs text-amber-100/70">
              Joue une vraie partie pédagogique avec un coach qui te guide
              étape par étape (recommandé).
            </div>
          </div>
          <span className="text-amber-200 transition-transform group-hover:translate-x-1">
            →
          </span>
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">🎓 Tutoriel</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Étape {step + 1} / {steps.length}
            {reviewMode
              ? " — relecture libre, aucune récompense."
              : " — termine pour débloquer tes 10 boosters gratuits."}
          </p>
        </div>
        {/* Skip : visible uniquement en mode review (depuis le hub).
            En mode 1ère visite, on bloque l'évasion pour forcer la
            complétion + récompense. */}
        {reviewMode && (
          <button
            type="button"
            onClick={skipReviewMode}
            className="shrink-0 text-xs text-zinc-400 underline-offset-2 transition-colors hover:text-zinc-100 hover:underline"
          >
            Skip le tutoriel →
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-amber-400 transition-all"
          style={{ width: `${((step + 1) / steps.length) * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <h2 className="text-xl font-bold text-zinc-100">
            {current.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            {current.body}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/40 p-4">
          {current.visual}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          ⚠️ {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.07] disabled:opacity-30"
        >
          ← Précédent
        </button>
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              className={`h-2 rounded-full transition-all ${
                i === step
                  ? "w-8 bg-amber-400"
                  : i < step
                    ? "w-2 bg-emerald-400"
                    : "w-2 bg-white/20"
              }`}
            />
          ))}
        </div>
        {isLast ? (
          <button
            type="button"
            onClick={reviewMode ? finishReviewMode : showCompletionScreen}
            className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200 transition-colors hover:bg-emerald-400/20"
          >
            Terminer 🎉
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
            className="rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-bold text-amber-200 transition-colors hover:bg-amber-400/20"
          >
            Suivant →
          </button>
        )}
      </div>
    </div>
  );
}

// Petit visuel emoji-based pour illustrer chaque étape sans dépendre
// d'images externes ni de Pixi. Suffisant pour donner une idée visuelle.
function BoardMockup({ phase }: { phase: string }) {
  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-indigo-900/40 to-violet-900/40 p-4">
      {phase === "intro" ? (
        <>
          <div className="text-5xl">⚔️</div>
          <div className="text-sm text-zinc-300">Toi vs Adversaire</div>
        </>
      ) : phase === "deck" ? (
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 20 }, (_, i) => (
            <div
              key={i}
              className="h-12 w-8 rounded border border-amber-300/30 bg-amber-300/10"
            />
          ))}
        </div>
      ) : phase === "energy" ? (
        <div className="flex items-center gap-3">
          <div className="text-4xl">⚡</div>
          <div className="text-3xl">→</div>
          <div className="flex h-20 w-14 flex-col items-center justify-center rounded border border-yellow-300/40 bg-yellow-300/10">
            <span className="text-2xl">🐹</span>
            <span className="mt-1 text-[9px] text-yellow-200">+1⚡</span>
          </div>
        </div>
      ) : phase === "bench" ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-20 w-14 items-center justify-center rounded border-2 border-amber-300/60 bg-amber-300/10">
            <span className="text-2xl">⭐</span>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-400">
            Actif
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex h-16 w-12 items-center justify-center rounded border border-white/20 bg-white/5"
              >
                <span className="text-lg">🪺</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-400">
            Banc (max 3)
          </div>
        </div>
      ) : phase === "evolve" ? (
        <div className="flex items-center gap-2">
          <div className="flex h-16 w-12 items-center justify-center rounded border border-emerald-300/40 bg-emerald-300/10">
            <span className="text-xl">🌱</span>
          </div>
          <div className="text-2xl">→</div>
          <div className="flex h-16 w-12 items-center justify-center rounded border border-emerald-300/60 bg-emerald-300/20">
            <span className="text-xl">🌳</span>
          </div>
          <div className="text-2xl">→</div>
          <div className="flex h-16 w-12 items-center justify-center rounded border-2 border-emerald-300/80 bg-emerald-300/30">
            <span className="text-xl">🌲</span>
          </div>
        </div>
      ) : phase === "attack" ? (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-16 w-12 items-center justify-center rounded border border-amber-300/60 bg-amber-300/10">
              <span className="text-xl">🐹</span>
            </div>
            <div className="text-3xl">💥</div>
            <div className="flex h-16 w-12 items-center justify-center rounded border border-rose-300/60 bg-rose-300/10">
              <span className="text-xl">🪲</span>
            </div>
          </div>
          <div className="text-xs text-rose-300">−40 PV</div>
        </div>
      ) : phase === "victory" ? (
        <div className="flex flex-col items-center gap-2">
          <div className="text-5xl">🏆</div>
          <div className="flex gap-2">
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-black">
              1
            </span>
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-black">
              2
            </span>
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-black">
              3
            </span>
          </div>
          <div className="text-xs text-amber-200">3 KO = victoire</div>
        </div>
      ) : (
        <>
          <div className="text-5xl">🎮</div>
          <div className="text-sm font-bold text-emerald-200">
            Prêt à jouer !
          </div>
        </>
      )}
    </div>
  );
}

/** Visuel emoji-based pour le tutoriel One Piece TCG (8 phases). */
function OnePieceMockup({ phase }: { phase: string }) {
  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-rose-900/40 to-amber-900/30 p-4">
      {phase === "intro" ? (
        <>
          <div className="text-5xl">🏴‍☠️</div>
          <div className="text-sm text-zinc-300">Toi vs Adversaire</div>
        </>
      ) : phase === "deck" ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-16 w-12 items-center justify-center rounded border-2 border-amber-300/80 bg-amber-300/15">
            <span className="text-xl">⭐</span>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-amber-200">
            Leader
          </div>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 50 }, (_, i) => (
              <div
                key={i}
                className="h-3 w-2 rounded-sm border border-rose-300/30 bg-rose-300/10"
              />
            ))}
          </div>
          <div className="text-[10px] text-zinc-400">50 cartes deck</div>
          <div className="flex gap-0.5">
            {Array.from({ length: 10 }, (_, i) => (
              <div
                key={i}
                className="h-3 w-3 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 ring-1 ring-amber-200"
              />
            ))}
          </div>
          <div className="text-[10px] text-amber-200">10 DON!!</div>
        </div>
      ) : phase === "don" ? (
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-1">
            {Array.from({ length: 6 }, (_, i) => (
              <span
                key={i}
                className="inline-block h-5 w-5 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 ring-1 ring-amber-200 shadow"
              />
            ))}
          </div>
          <div className="text-2xl">→</div>
          <div className="flex items-center gap-2">
            <div className="flex h-16 w-12 items-center justify-center rounded border-2 border-rose-400/60 bg-rose-300/10">
              <span className="text-xl">⚔️</span>
            </div>
            <span className="text-xs text-amber-200">+3000 power</span>
          </div>
        </div>
      ) : phase === "phases" ? (
        <div className="flex flex-col items-start gap-1.5 text-xs">
          <div>
            <span className="font-bold text-amber-200">1.</span> Refresh ↻
          </div>
          <div>
            <span className="font-bold text-amber-200">2.</span> Pioche 🎴
          </div>
          <div>
            <span className="font-bold text-amber-200">3.</span> +2 DON 🟡🟡
          </div>
          <div>
            <span className="font-bold text-amber-200">4.</span> Phase
            principale ⚔️
          </div>
          <div>
            <span className="font-bold text-amber-200">5.</span> Fin ⏸
          </div>
        </div>
      ) : phase === "attack" ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-16 w-12 flex-col items-center justify-center rounded border-2 border-rose-400/60 bg-rose-300/10">
              <span className="text-xl">🦸</span>
              <span className="text-[8px] text-rose-200">5000</span>
            </div>
            <div className="text-3xl">💥</div>
            <div className="flex h-16 w-12 flex-col items-center justify-center rounded border border-amber-300/40 bg-amber-300/10">
              <span className="text-xl">⭐</span>
              <span className="text-[8px] text-amber-200">4000</span>
            </div>
          </div>
          <div className="text-xs text-rose-300">5000 ≥ 4000 → touche !</div>
        </div>
      ) : phase === "defense" ? (
        <div className="flex flex-col items-center gap-2 text-xs">
          <div className="flex gap-2">
            <div className="rounded border border-sky-400/50 bg-sky-500/10 px-2 py-1 text-sky-200">
              🛡️ Bloqueur
            </div>
            <div className="rounded border border-emerald-400/50 bg-emerald-500/10 px-2 py-1 text-emerald-200">
              ⚡ Counter
            </div>
            <div className="rounded border border-violet-400/50 bg-violet-500/10 px-2 py-1 text-violet-200">
              💫 Trigger
            </div>
          </div>
          <div className="text-zinc-400">3 façons de défendre</div>
        </div>
      ) : phase === "victory" ? (
        <div className="flex flex-col items-center gap-2">
          <div className="text-5xl">🏆</div>
          <div className="flex gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="h-6 w-4 rounded-sm border border-rose-500/60 bg-rose-900/40"
              />
            ))}
          </div>
          <div className="text-xs text-rose-300">5 Vies → 0 = défaite</div>
        </div>
      ) : (
        <>
          <div className="text-5xl">⚓</div>
          <div className="text-sm font-bold text-amber-200">À l&apos;abordage !</div>
        </>
      )}
    </div>
  );
}

/** Visuel emoji-based pour le tutoriel LoL TCG (Runeterra clone, 8 phases). */
function LorMockup({ phase }: { phase: string }) {
  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-violet-900/40 to-indigo-900/40 p-4">
      {phase === "intro" ? (
        <>
          <div className="text-5xl">⚔️</div>
          <div className="text-sm text-zinc-300">Nexus 20 → 0</div>
        </>
      ) : phase === "deck" ? (
        <div className="flex flex-col items-center gap-2">
          <div className="grid grid-cols-8 gap-1">
            {Array.from({ length: 40 }, (_, i) => (
              <div
                key={i}
                className="h-4 w-3 rounded-sm border border-violet-300/30 bg-violet-300/10"
              />
            ))}
          </div>
          <div className="text-[10px] text-zinc-400">40 cartes · 1-2 régions</div>
          <div className="flex gap-1 text-base">
            <span title="Demacia">⚔️</span>
            <span title="Noxus">🔥</span>
            <span title="Ionia">🌸</span>
            <span title="Freljord">❄️</span>
          </div>
        </div>
      ) : phase === "mana" ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-1">
            {Array.from({ length: 7 }, (_, i) => (
              <span
                key={i}
                className="h-3 w-3 rounded-full bg-sky-400 ring-1 ring-sky-200/60"
              />
            ))}
            <span className="ml-1 text-xs font-bold text-sky-200">7/10</span>
          </div>
          <div className="text-[10px] text-zinc-400">Mana max +1/round</div>
          <div className="flex items-center gap-1">
            <span className="text-violet-300">✨</span>
            {Array.from({ length: 3 }, (_, i) => (
              <span
                key={i}
                className="h-3 w-3 rounded-full bg-violet-400 ring-1 ring-violet-200/60"
              />
            ))}
            <span className="ml-1 text-xs font-bold text-violet-200">3</span>
          </div>
          <div className="text-[10px] text-zinc-400">Spell mana banked (cap 3)</div>
        </div>
      ) : phase === "token" ? (
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-full bg-orange-500/30 px-3 py-1 text-sm font-bold text-orange-200 ring-1 ring-orange-400/60">
            ⚔️ Jeton d&apos;attaque
          </div>
          <div className="text-2xl">⇄</div>
          <div className="text-xs text-zinc-300">Alterne chaque round</div>
        </div>
      ) : phase === "combat" ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-1.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex h-12 w-9 items-center justify-center rounded border border-rose-400/60 bg-rose-500/10"
              >
                <span className="text-base">⚔️</span>
              </div>
            ))}
          </div>
          <div className="text-2xl">⇅</div>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex h-12 w-9 items-center justify-center rounded border border-sky-400/60 bg-sky-500/10"
              >
                <span className="text-base">🛡️</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-zinc-400">Lanes 1-6 · bloqueurs assignés</div>
        </div>
      ) : phase === "speed" ? (
        <div className="flex flex-col items-center gap-2 text-xs">
          <div className="flex gap-2">
            <div className="rounded border border-amber-400 bg-amber-400/20 px-2 py-1 text-amber-200">
              ⚡ Burst
            </div>
            <div className="rounded border border-sky-400 bg-sky-400/20 px-2 py-1 text-sky-200">
              💨 Fast
            </div>
            <div className="rounded border border-rose-400 bg-rose-400/20 px-2 py-1 text-rose-200">
              🐢 Slow
            </div>
          </div>
          <div className="text-zinc-400">3 vitesses de sort</div>
        </div>
      ) : phase === "champion" ? (
        <div className="flex items-center gap-2">
          <div className="flex h-16 w-12 flex-col items-center justify-center rounded border-2 border-amber-300/40 bg-amber-300/10">
            <span className="text-xl">🦸</span>
            <span className="text-[8px] text-amber-200">Lv1</span>
          </div>
          <div className="text-2xl">→</div>
          <div className="flex h-16 w-12 flex-col items-center justify-center rounded-lg border-2 border-amber-300/80 bg-amber-300/25 shadow-[0_0_12px_rgba(252,211,77,0.5)]">
            <span className="text-xl">🦸‍♂️</span>
            <span className="text-[8px] font-bold text-amber-100">Lv2 ★</span>
          </div>
        </div>
      ) : (
        <>
          <div className="text-5xl">⚔️</div>
          <div className="text-sm font-bold text-violet-200">Au combat !</div>
        </>
      )}
    </div>
  );
}
