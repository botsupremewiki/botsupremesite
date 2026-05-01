import Link from "next/link";

export const dynamic = "force-static";

const FAQ: { q: string; a: string }[] = [
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

export default function HelpPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <Link
          href="/"
          className="text-zinc-400 transition-colors hover:text-zinc-100"
        >
          ← Accueil
        </Link>
        <span className="font-semibold">❓ Aide / FAQ</span>
        <Link
          href="/changelog"
          className="text-xs text-zinc-400 hover:text-zinc-100"
        >
          📝 Changelog
        </Link>
      </header>
      <main
        id="main-content"
        className="flex flex-1 flex-col items-center overflow-y-auto p-6"
      >
        <div className="w-full max-w-2xl">
          <h1 className="text-3xl font-bold text-zinc-100">❓ Aide</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Réponses aux questions fréquentes. Si tu ne trouves pas, demande
            sur Discord.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            {FAQ.map((item, i) => (
              <details
                key={i}
                className="group rounded-xl border border-white/10 bg-black/40 p-4 transition-colors open:border-amber-300/40"
              >
                <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-100 group-open:text-amber-100">
                  <span className="mr-2 text-zinc-500 group-open:text-amber-300">
                    Q.
                  </span>
                  {item.q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
