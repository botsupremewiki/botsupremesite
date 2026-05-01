/** Catalogue FAQ traduit FR/EN. Server-component-safe. */

export type FaqEntry = { q: string; a: string };

export const FAQ_FR: FaqEntry[] = [
  {
    q: "C'est quoi Site Ultime ?",
    a: "Un univers 2D multijoueur qui réunit du casino, du RPG, des jeux de cartes et plus. Chaque jeu est connecté à la même monnaie (Or Suprême) et à la même plaza centrale.",
  },
  {
    q: "Comment je m'inscris ?",
    a: "Connexion via Discord OAuth. Pas de mot de passe à retenir, pas d'email à valider. Au premier login tu reçois 1 000 OS + 5 boosters Pokémon gratuits.",
  },
  {
    q: "Pourquoi je n'ai pas d'Or Suprême au démarrage ?",
    a: "Tu en as ! Le bonus de bienvenue est 1 000 OS. Va dans /play/objectifs pour voir ton solde + récompense quotidienne.",
  },
  {
    q: "Comment construire un deck Pokémon ?",
    a: "Va dans Cartes → Pokémon → Mes Decks → Nouveau. Tu as besoin d'exactement 20 cartes, max 2 par nom. Pour démarrer, regarde aussi les Starter decks préfabriqués.",
  },
  {
    q: "C'est quoi le mode classé / saison ?",
    a: "Le PvP classé donne et retire de l'ELO selon la formule standard (K=32). Chaque mois, l'ELO est snapshotté + récompenses (OS + boosters) selon ton tier (Bronze → Maître), puis l'ELO est soft-reset (rapproché de 1000).",
  },
  {
    q: "Comment marchent les Cristaux de Pioche (Wonder Pick) ?",
    a: "Tu gagnes 1 cristal par victoire PvP (max 10). Tu dépenses 1 cristal pour piocher 1 carte au hasard parmi 5 d'un pack ouvert récemment par un autre joueur. Va dans Cartes → Pokémon → Pioche Mystère.",
  },
  {
    q: "Je peux échanger des cartes avec un ami ?",
    a: "Oui : page Trade. Tu choisis tes cartes offertes + celles que tu veux en échange, tu envoies la propal. L'autre accepte ou refuse. C'est atomique : aucune carte ne disparaît si l'échange échoue.",
  },
  {
    q: "Comment je signale un comportement toxique ?",
    a: "Sur le profil public d'un joueur (clic sur son pseudo dans le chat) → bouton 🚩 Signaler. Choix : Triche / Toxique / Spam / Autre. Limite 5 signalements/jour.",
  },
  {
    q: "Cmd+K ?",
    a: "Oui, tu peux ouvrir une palette de navigation rapide avec Cmd+K (Mac) ou Ctrl+K (Windows/Linux) pour aller direct sur une page.",
  },
  {
    q: "Qu'est-ce qui se passe si je perds mon streak quotidien ?",
    a: "Le streak revient à 1. Tu repars du jour 1, mais tu peux reclaim. Les coffres bonus (J7, J14, J30) que tu avais déjà ouverts restent — tu ne perds pas ce qui est dans ton inventaire.",
  },
  {
    q: "Le site est gratuit ?",
    a: "Oui, 100% gratuit, pas de microtransactions, pas de pub. Les Or Suprême se gagnent en jouant.",
  },
];

export const FAQ_EN: FaqEntry[] = [
  {
    q: "What is Site Ultime?",
    a: "A 2D multiplayer universe combining casino, RPG, card games and more. Every game shares the same currency (Or Suprême) and the same central plaza.",
  },
  {
    q: "How do I sign up?",
    a: "Sign in via Discord OAuth. No password to remember, no email to validate. On first login you get 1,000 OS + 5 free Pokémon boosters.",
  },
  {
    q: "Why don't I have Or Suprême at the start?",
    a: "You do! The welcome bonus is 1,000 OS. Go to /play/objectifs to see your balance + daily reward.",
  },
  {
    q: "How do I build a Pokémon deck?",
    a: "Go to Cards → Pokémon → My Decks → New. You need exactly 20 cards, max 2 per name. To get started, also check the Starter Decks.",
  },
  {
    q: "What's ranked mode / season?",
    a: "Ranked PvP gives and takes ELO using the standard formula (K=32). Every month, ELO is snapshotted + rewards (OS + boosters) based on your tier (Bronze → Master), then ELO soft-resets (toward 1000).",
  },
  {
    q: "How do Pick Crystals (Wonder Pick) work?",
    a: "You earn 1 crystal per PvP win (max 10). You spend 1 crystal to draw 1 card at random from 5 in a pack recently opened by another player. Go to Cards → Pokémon → Wonder Pick.",
  },
  {
    q: "Can I trade cards with a friend?",
    a: "Yes: Trade page. Choose your offered cards + the ones you want, send the proposal. The other accepts or declines. It's atomic: no card disappears if the trade fails.",
  },
  {
    q: "How do I report toxic behavior?",
    a: "On a player's public profile (click their name in chat) → 🚩 Report button. Choose: Cheat / Toxic / Spam / Other. Limit 5 reports/day.",
  },
  {
    q: "Cmd+K?",
    a: "Yes, you can open a quick navigation palette with Cmd+K (Mac) or Ctrl+K (Windows/Linux) to jump directly to any page.",
  },
  {
    q: "What happens if I lose my daily streak?",
    a: "The streak resets to 1. You start over from day 1, but you can re-claim. Bonus chests (D7, D14, D30) you already opened stay — you don't lose what's in your inventory.",
  },
  {
    q: "Is the site free?",
    a: "Yes, 100% free, no microtransactions, no ads. Or Suprême is earned by playing.",
  },
];
