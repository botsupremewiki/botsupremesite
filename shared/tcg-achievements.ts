// Catalogue des achievements (badges) débloquables sur le TCG.
//
// Vérifiés et débloqués côté serveur PartyKit après chaque match. Stockés
// côté Supabase dans `tcg_achievements_unlocked` (user_id × achievement_id).
// Affichés sur la page Stats avec leur date de déblocage.
//
// Chaque achievement est défini par :
//  - id          : clé stable (ex "first_win")
//  - name        : nom affiché en FR
//  - description : ce qu'il faut faire pour l'obtenir
//  - icon        : emoji d'affichage
//  - tier        : "bronze" | "silver" | "gold" — pour le visuel
//  - check       : fonction côté serveur qui valide à partir des stats
//                  agrégées du joueur. Renvoie true si l'achievement est
//                  débloqué (le serveur fait l'INSERT ON CONFLICT DO NOTHING
//                  qui évite les doublons).

import type { TcgGameId } from "./types";

export type AchievementTier = "bronze" | "silver" | "gold";

export type AchievementContext = {
  /** Total des matches joués (PvP fun + ranked, pas bot). */
  totalMatches: number;
  /** Victoires totales (idem). */
  wins: number;
  /** Défaites totales. */
  losses: number;
  /** Victoires ranked. */
  rankedWins: number;
  /** ELO courant. */
  elo: number;
  /** Liste unique des noms de deck avec lesquels le joueur a gagné. */
  winningDecks: string[];
  /** Streak de victoires consécutives (= reset à chaque défaite). */
  bestWinStreak: number;
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  /** Si défini, l'achievement n'est unlockable QUE pour ce jeu. Sinon
   *  s'applique à tous les jeux TCG (rétro-compat). */
  gameId?: TcgGameId;
  /** Renvoie true si débloqué selon les stats actuelles. */
  check: (ctx: AchievementContext) => boolean;
  /** Optionnel : retourne la progression actuelle vs target pour
   *  afficher une barre de progression dans l'UI. Si absent, fallback
   *  binaire : { current: check() ? 1 : 0, target: 1 }. */
  progress?: (ctx: AchievementContext) => { current: number; target: number };
};

/** Helper : retourne progress pour un achievement, avec fallback binaire. */
export function achievementProgress(
  ach: Achievement,
  ctx: AchievementContext,
): { current: number; target: number } {
  if (ach.progress) return ach.progress(ctx);
  return { current: ach.check(ctx) ? 1 : 0, target: 1 };
}

export const TCG_ACHIEVEMENTS: Achievement[] = [
  // ─── Tier Bronze (premiers pas) ──────────────────────────────────────
  {
    id: "first_match",
    name: "Premier combat",
    description: "Joue ton premier match (PvP ou classé).",
    icon: "⚔️",
    tier: "bronze",
    check: (c) => c.totalMatches >= 1,
    progress: (c) => ({ current: Math.min(c.totalMatches, 1), target: 1 }),
  },
  {
    id: "first_win",
    name: "Première victoire",
    description: "Gagne ton premier match.",
    icon: "🏆",
    tier: "bronze",
    check: (c) => c.wins >= 1,
    progress: (c) => ({ current: Math.min(c.wins, 1), target: 1 }),
  },
  {
    id: "first_ranked_win",
    name: "Premier classé",
    description: "Gagne un match en mode classé.",
    icon: "🥇",
    tier: "bronze",
    check: (c) => c.rankedWins >= 1,
    progress: (c) => ({ current: Math.min(c.rankedWins, 1), target: 1 }),
  },

  // ─── Tier Silver (engagement régulier) ───────────────────────────────
  {
    id: "ten_wins",
    name: "Dix victoires",
    description: "Cumule 10 victoires.",
    icon: "🔟",
    tier: "silver",
    check: (c) => c.wins >= 10,
    progress: (c) => ({ current: Math.min(c.wins, 10), target: 10 }),
  },
  {
    id: "fifty_matches",
    name: "Habitué",
    description: "Joue 50 matches.",
    icon: "🎮",
    tier: "silver",
    check: (c) => c.totalMatches >= 50,
    progress: (c) => ({ current: Math.min(c.totalMatches, 50), target: 50 }),
  },
  {
    id: "elo_1200",
    name: "ELO 1200",
    description: "Atteins 1200 d'ELO en classé.",
    icon: "📈",
    tier: "silver",
    check: (c) => c.elo >= 1200,
    progress: (c) => ({ current: Math.min(c.elo, 1200), target: 1200 }),
  },
  {
    id: "win_streak_5",
    name: "Série de 5",
    description: "Enchaîne 5 victoires consécutives.",
    icon: "🔥",
    tier: "silver",
    check: (c) => c.bestWinStreak >= 5,
    progress: (c) => ({
      current: Math.min(c.bestWinStreak, 5),
      target: 5,
    }),
  },
  {
    id: "three_decks_winner",
    name: "Polyvalent",
    description: "Gagne avec 3 decks différents.",
    icon: "🃏",
    tier: "silver",
    check: (c) => c.winningDecks.length >= 3,
    progress: (c) => ({
      current: Math.min(c.winningDecks.length, 3),
      target: 3,
    }),
  },

  // ─── Tier Gold (joueurs assidus) ─────────────────────────────────────
  {
    id: "hundred_wins",
    name: "Centenaire",
    description: "Cumule 100 victoires.",
    icon: "💯",
    tier: "gold",
    check: (c) => c.wins >= 100,
    progress: (c) => ({ current: Math.min(c.wins, 100), target: 100 }),
  },
  {
    id: "elo_1500",
    name: "ELO 1500",
    description: "Atteins 1500 d'ELO en classé.",
    icon: "⭐",
    tier: "gold",
    check: (c) => c.elo >= 1500,
    progress: (c) => ({ current: Math.min(c.elo, 1500), target: 1500 }),
  },
  {
    id: "ten_ranked_wins",
    name: "Compétiteur",
    description: "Cumule 10 victoires classées.",
    icon: "🎖️",
    tier: "gold",
    check: (c) => c.rankedWins >= 10,
    progress: (c) => ({ current: Math.min(c.rankedWins, 10), target: 10 }),
  },
  {
    id: "win_streak_10",
    name: "Imbattable",
    description: "Enchaîne 10 victoires consécutives.",
    icon: "🔥",
    tier: "gold",
    check: (c) => c.bestWinStreak >= 10,
    progress: (c) => ({
      current: Math.min(c.bestWinStreak, 10),
      target: 10,
    }),
  },
  {
    id: "five_decks_winner",
    name: "Maître des decks",
    description: "Gagne avec 5 decks différents.",
    icon: "🎴",
    tier: "gold",
    check: (c) => c.winningDecks.length >= 5,
    progress: (c) => ({
      current: Math.min(c.winningDecks.length, 5),
      target: 5,
    }),
  },
  {
    id: "two_hundred_matches",
    name: "Vétéran",
    description: "Joue 200 matches.",
    icon: "🛡️",
    tier: "gold",
    check: (c) => c.totalMatches >= 200,
    progress: (c) => ({
      current: Math.min(c.totalMatches, 200),
      target: 200,
    }),
  },
  {
    id: "elo_1800",
    name: "Champion",
    description: "Atteins 1800 d'ELO en classé.",
    icon: "👑",
    tier: "gold",
    check: (c) => c.elo >= 1800,
    progress: (c) => ({ current: Math.min(c.elo, 1800), target: 1800 }),
  },

  // ─── OnePiece TCG : achievements thématiques pirate ──────────────────
  // Ne s'unlock que pour le game_id "onepiece" (gameId field).
  {
    id: "op_first_blood",
    name: "Premier sang",
    description: "Remporte ta toute première victoire One Piece TCG.",
    icon: "🩸",
    tier: "bronze",
    gameId: "onepiece",
    check: (c) => c.wins >= 1,
  },
  {
    id: "op_pirate_apprentice",
    name: "Apprenti pirate",
    description: "Cumule 5 victoires en One Piece TCG.",
    icon: "⚓",
    tier: "bronze",
    gameId: "onepiece",
    check: (c) => c.wins >= 5,
    progress: (c) => ({ current: Math.min(c.wins, 5), target: 5 }),
  },
  {
    id: "op_supernova",
    name: "Supernova",
    description: "Gagne 25 matches One Piece TCG.",
    icon: "☄️",
    tier: "silver",
    gameId: "onepiece",
    check: (c) => c.wins >= 25,
    progress: (c) => ({ current: Math.min(c.wins, 25), target: 25 }),
  },
  {
    id: "op_warlord",
    name: "Corsaire reconnu",
    description: "Atteins 1300 d'ELO en classé One Piece TCG.",
    icon: "🗡️",
    tier: "silver",
    gameId: "onepiece",
    check: (c) => c.elo >= 1300,
    progress: (c) => ({ current: Math.min(c.elo, 1300), target: 1300 }),
  },
  {
    id: "op_yonkou",
    name: "Empereur",
    description: "Atteins 1700 d'ELO en classé One Piece TCG.",
    icon: "🌊",
    tier: "gold",
    gameId: "onepiece",
    check: (c) => c.elo >= 1700,
    progress: (c) => ({ current: Math.min(c.elo, 1700), target: 1700 }),
  },
  {
    id: "op_pirate_king",
    name: "Roi des Pirates",
    description: "Atteins 2000 d'ELO en classé One Piece TCG.",
    icon: "👑",
    tier: "gold",
    gameId: "onepiece",
    check: (c) => c.elo >= 2000,
    progress: (c) => ({ current: Math.min(c.elo, 2000), target: 2000 }),
  },
  {
    id: "op_grand_line",
    name: "Grand Line",
    description: "Joue 100 matches One Piece TCG.",
    icon: "🗺️",
    tier: "silver",
    gameId: "onepiece",
    check: (c) => c.totalMatches >= 100,
    progress: (c) => ({
      current: Math.min(c.totalMatches, 100),
      target: 100,
    }),
  },
  {
    id: "op_crew_master",
    name: "Capitaine d'équipage",
    description: "Gagne avec 4 decks One Piece TCG différents.",
    icon: "🏴‍☠️",
    tier: "silver",
    gameId: "onepiece",
    check: (c) => c.winningDecks.length >= 4,
    progress: (c) => ({
      current: Math.min(c.winningDecks.length, 4),
      target: 4,
    }),
  },
  {
    id: "op_devil_fruit",
    name: "Fruit du Démon",
    description: "Enchaîne 7 victoires consécutives One Piece TCG.",
    icon: "🍎",
    tier: "gold",
    gameId: "onepiece",
    check: (c) => c.bestWinStreak >= 7,
    progress: (c) => ({
      current: Math.min(c.bestWinStreak, 7),
      target: 7,
    }),
  },
];

/** Récupère l'achievement par id, ou undefined. */
export function getAchievement(id: string): Achievement | undefined {
  return TCG_ACHIEVEMENTS.find((a) => a.id === id);
}

/** Couleur d'accent du tier pour l'UI. */
export function tierAccent(tier: AchievementTier): string {
  switch (tier) {
    case "bronze":
      return "border-amber-700/60 bg-amber-700/10 text-amber-300";
    case "silver":
      return "border-zinc-300/60 bg-zinc-300/10 text-zinc-200";
    case "gold":
      return "border-yellow-400/60 bg-yellow-400/10 text-yellow-300";
  }
}

/** Réservé pour usage typé futur (référence à un game spécifique). */
export type AchievementForGame = {
  achievement: Achievement;
  gameId: TcgGameId;
};
