import Link from "next/link";
import { notFound } from "next/navigation";
import { TCG_GAMES, type TcgGameId } from "@shared/types";

export const dynamic = "force-static";

export default async function TcgRulesPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  if (gameId === "lol") {
    return <LorRulesPage />;
  }
  if (gameId !== "onepiece") {
    // Page règles disponible uniquement pour One Piece TCG et LoR.
    return (
      <div className="min-h-screen bg-zinc-950 p-8 text-zinc-100">
        <Link
          href={`/play/tcg/${gameId}`}
          className="text-sm text-zinc-400 hover:text-white"
        >
          ← Retour au hub
        </Link>
        <p className="mt-4 text-zinc-400">
          Page règles disponible uniquement pour One Piece TCG et LoL TCG
          pour le moment.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-rose-950/30 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={`/play/tcg/${gameId}`}
            className="text-sm text-zinc-400 hover:text-white"
          >
            ← Retour au hub
          </Link>
          <Link
            href={`/play/tcg/${gameId}/battle/bot`}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-200 hover:bg-emerald-500/20"
          >
            🤖 Tester contre le Bot
          </Link>
        </div>

        <h1 className="mb-2 text-3xl font-bold text-rose-200">
          📖 Règles One Piece TCG
        </h1>
        <p className="mb-8 text-sm text-zinc-400">
          Clone fidèle du jeu officiel Bandai. Les règles ci-dessous sont
          un résumé pour démarrer rapidement — pour les détails, consulte
          la{" "}
          <a
            href="https://fr.onepiece-cardgame.com/rules"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-rose-200"
          >
            documentation officielle One Piece TCG
          </a>
          .
        </p>

        <Section title="🎯 Objectif">
          <p>
            Réduis la <strong>Vie</strong> de ton adversaire (4 ou 5 cartes
            selon le Leader) à 0 en attaquant son Leader, OU épuise son
            deck pour le faire perdre par <em>deck-out</em>.
          </p>
        </Section>

        <Section title="🃏 Composition d'un deck">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>1 Leader</strong> qui détermine ta Vie initiale, ta
              puissance et tes couleurs autorisées.
            </li>
            <li>
              <strong>50 cartes</strong> dans le deck principal (Persos,
              Évents, Lieux), max 4 copies par cardNumber.
            </li>
            <li>
              <strong>10 DON!!</strong> dans le deck DON séparé (boost de
              puissance et coût des cartes).
            </li>
            <li>
              Toutes les cartes de ton deck doivent partager au moins une{" "}
              <strong>couleur</strong> avec ton Leader.
            </li>
          </ul>
        </Section>

        <Section title="🔄 Phases d'un tour">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong>Refresh</strong> — Redresse ton Leader, tes Persos,
              ton Lieu, et toutes tes DON épuisées.
            </li>
            <li>
              <strong>Pioche</strong> — Pioche 1 carte (sauf au tout 1er
              tour). Si ton deck est vide, tu perds immédiatement.
            </li>
            <li>
              <strong>DON</strong> — Ajoute 2 DON depuis ton deck DON à
              ta zone DON active (1 seulement au tout 1er tour).
            </li>
            <li>
              <strong>Phase principale</strong> — Joue des Persos, Évents,
              Lieux, attache des DON, attaque, active les effets{" "}
              <em>[Activation : Principale]</em>.
            </li>
            <li>
              <strong>Fin</strong> — Toutes les DON attachées retournent
              en zone DON épuisée.
            </li>
          </ol>
        </Section>

        <Section title="⚔️ Attaquer">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Choisis un attaquant <strong>redressé</strong> (Leader ou
              Persos).
            </li>
            <li>
              La cible est soit le <strong>Leader adverse</strong>, soit
              un <strong>Persos adverse épuisé</strong>.
            </li>
            <li>
              <strong>Power vs Power</strong> : si la puissance de
              l'attaquant ≥ celle de la cible, l'attaque touche.
            </li>
            <li>
              Sur Leader hit : l'adversaire prend 1 carte de Vie en main
              (<em>2 si [Double Attaque]</em>) — éventuel Trigger révélé.
            </li>
            <li>
              Sur Persos hit : le Persos est <strong>mis KO</strong>{" "}
              (envoyé en Défausse).
            </li>
            <li>
              Le 1<sup>er</sup> joueur ne peut <strong>pas attaquer</strong>{" "}
              au tour 1.
            </li>
          </ul>
        </Section>

        <Section title="🛡️ Se défendre">
          Quand tu es attaqué, tu peux :
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Activer un <strong>[Bloqueur]</strong> (Persos rested
              redirige l'attaque sur lui).
            </li>
            <li>
              Jouer un <strong>Counter</strong> depuis la main : Persos
              avec valeur counter (1000/2000) ou Évent <em>[Contre]</em>{" "}
              (gratuit).
            </li>
            <li>
              <strong>Laisser passer</strong> : l'attaque se résout
              normalement.
            </li>
          </ul>
        </Section>

        <Section title="📚 Mots-clés">
          <div className="grid gap-3 sm:grid-cols-2">
            <Keyword
              name="[Bloqueur]"
              desc="Quand l'adversaire déclare une attaque, tu peux épuiser ce Persos pour qu'il devienne la cible à la place."
            />
            <Keyword
              name="[Initiative]"
              desc="Cette carte peut attaquer dès le tour où elle est jouée (sinon il faut attendre 1 tour)."
            />
            <Keyword
              name="[Double attaque]"
              desc="Si cette carte touche le Leader adverse, il prend 2 cartes de Vie au lieu de 1."
            />
            <Keyword
              name="[Exil]"
              desc="Quand cette carte inflige des dégâts au Leader, la carte de Vie est envoyée en Défausse SANS activer son Trigger."
            />
            <Keyword
              name="[Contre]"
              desc="Sur un Évent : peut être joué pendant la défense (gratuit). Va à la Défausse."
            />
            <Keyword
              name="[Déclenchement]"
              desc="Sur une carte révélée comme Vie : tu peux choisir d'activer son effet avant qu'elle aille en main."
            />
            <Keyword
              name="[Activation : Principale]"
              desc="Effet activable manuellement pendant ta phase principale (souvent [Une fois par tour])."
            />
            <Keyword
              name="[En attaquant]"
              desc="Effet déclenché automatiquement quand cette carte attaque."
            />
            <Keyword
              name="[Jouée]"
              desc="Effet déclenché automatiquement quand cette carte est posée depuis la main."
            />
            <Keyword
              name="[En cas de KO]"
              desc="Effet déclenché automatiquement quand cette carte est mise KO."
            />
            <Keyword
              name="[Tour adverse]"
              desc="Effet conditionnel actif uniquement pendant le tour de l'adversaire."
            />
            <Keyword
              name="[Une fois par tour]"
              desc="Cet effet ne peut s'activer qu'une seule fois par tour."
            />
          </div>
        </Section>

        <Section title="💎 DON!!">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Chaque tour, ton stock de DON augmente : tu peux les utiliser
              pour <strong>jouer des cartes</strong> (coût) ou les{" "}
              <strong>attacher</strong> à un Leader/Persos pour +1000 de
              puissance chacun.
            </li>
            <li>
              Les DON attachées retournent en pool épuisée à la{" "}
              <strong>fin de ton tour</strong>.
            </li>
            <li>
              Certains effets demandent de <em>renvoyer</em> des DON au
              deck DON (refluent stratégique : Sanji, Brook, Zoro,
              Chopper…).
            </li>
          </ul>
        </Section>

        <Section title="🎓 Tutoriel pas-à-pas (premier match)">
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              <strong>Lance le hub</strong> et clique sur{" "}
              <em>Mes Decks</em> pour créer un premier deck (50 cartes +
              1 Leader).
            </li>
            <li>
              <strong>Construis ton deck</strong> : choisis un Leader (ses
              couleurs déterminent les cartes autorisées), puis ajoute 50
              cartes en respectant max 4 copies par cardNumber.
            </li>
            <li>
              <strong>Lance un combat vs Bot</strong> pour t'entraîner.
              Tu reçois <strong>+100 OS</strong> par victoire et un{" "}
              <strong>booster gratuit</strong> à la 3<sup>e</sup> victoire
              du jour.
            </li>
            <li>
              <strong>Au démarrage</strong>, tu reçois 5 cartes en main :
              tu peux mulliganer une fois si tu veux les changer.
            </li>
            <li>
              <strong>À ton tour</strong>, paie tes Persos avec des DON
              (clic <em>▶ Jouer</em>), attache des DON pour boost, puis
              déclare des attaques.
            </li>
            <li>
              <strong>Quand tu défends</strong>, choisis Bloqueur,
              Counter (Persos avec valeur ou Évent [Contre]), ou laisse
              passer.
            </li>
            <li>
              <strong>Si une Vie est révélée avec [Déclenchement]</strong>
              , tu peux activer son effet ou le passer.
            </li>
            <li>
              Une fois confiant, tente le <strong>JcJ classé</strong> pour
              gagner de l'ELO + des récompenses doublées (1000 OS + pack
              gratuit par victoire).
            </li>
          </ol>
        </Section>

        <Section title="💰 Récompenses">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-zinc-400">
                <th className="py-2 pr-3">Mode</th>
                <th className="py-2 pr-3">Victoire</th>
                <th className="py-2">Défaite</th>
              </tr>
            </thead>
            <tbody className="text-zinc-200">
              <tr className="border-b border-white/5">
                <td className="py-2 pr-3 font-semibold">Bot</td>
                <td className="py-2 pr-3">
                  +100 OS · 1 pack au 3<sup>e</sup> win quotidien
                </td>
                <td className="py-2">—</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2 pr-3 font-semibold">JcJ amical</td>
                <td className="py-2 pr-3">+500 OS</td>
                <td className="py-2">+100 OS</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-semibold">JcJ classé</td>
                <td className="py-2 pr-3">
                  +1000 OS · 1 booster gratuit · ELO ↑
                </td>
                <td className="py-2">+200 OS · ELO ↓</td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section title="⏱ Anti-AFK">
          Pour garder les parties fluides :
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>90 secondes</strong> par tour en phase principale
              (auto end-turn sinon).
            </li>
            <li>
              <strong>30 secondes</strong> pour réagir à une attaque.
            </li>
            <li>
              <strong>15 secondes</strong> pour résoudre un Trigger révélé.
            </li>
          </ul>
        </Section>

        <p className="mt-10 text-center text-xs text-zinc-500">
          One Piece TCG est une création de Bandai. Ce site est un clone
          non-officiel à but de divertissement.
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-semibold text-rose-200">{title}</h2>
      <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-zinc-200">
        {children}
      </div>
    </section>
  );
}

function Keyword({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="rounded border border-white/10 bg-black/40 p-3">
      <div className="mb-1 font-mono text-rose-300">{name}</div>
      <div className="text-xs text-zinc-300">{desc}</div>
    </div>
  );
}

// ─── LoR Rules page ──────────────────────────────────────────────────────

function LorRulesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-violet-950/30 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/play/tcg/lol"
            className="text-sm text-zinc-400 hover:text-white"
          >
            ← Retour au hub
          </Link>
          <Link
            href="/play/tcg/lol/battle/bot"
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-200 hover:bg-emerald-500/20"
          >
            🤖 Tester contre le Bot
          </Link>
        </div>

        <h1 className="mb-2 text-3xl font-bold text-violet-200">
          📖 Règles LoL TCG (Set 1 « Foundations »)
        </h1>
        <p className="mb-8 text-sm text-zinc-400">
          Clone fidèle de <em>Legends of Runeterra</em> (Riot Games a sunset
          le multijoueur en 2024). Toutes les cartes Set 1 sont jouables en
          packs et gameplay complet (mana, attack token, sorts, mots-clés,
          champions et level-up).
        </p>

        <LorSection title="🎯 Objectif">
          <p>
            Réduis le <strong>Nexus</strong> de ton adversaire (20 PV) à 0
            ou moins. Tu peux infliger des dégâts au Nexus en le frappant
            avec une unité non bloquée pendant ton attaque, ou via des
            sorts directs (ex Tir mystique, Décimation).
          </p>
        </LorSection>

        <LorSection title="🃏 Composition d'un deck">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Exactement 40 cartes</strong> (Unités + Sorts).
            </li>
            <li>
              <strong>1 ou 2 régions max</strong> parmi : Demacia, Freljord,
              Ionia, Noxus, Piltover &amp; Zaun, Îles obscures.
            </li>
            <li>
              <strong>Max 3 copies</strong> du même cardCode.
            </li>
            <li>
              <strong>Max 6 champions</strong> au total (pas plus de 3
              copies du même).
            </li>
          </ul>
        </LorSection>

        <LorSection title="🌊 Mana et tour">
          <p>
            Au début de chaque round, ton mana max augmente de 1 (cap à 10).
            Au début de ton tour tu reçois autant de mana qu'au max. Le mana
            non dépensé en fin de round se transforme en{" "}
            <strong>Spell Mana</strong> (cap 3) que tu peux dépenser
            uniquement pour des sorts les rounds suivants.
          </p>
          <p className="mt-2">
            Tu peux jouer une <strong>action par tour</strong> (poser une
            unité, lancer un sort, attaquer, ou passer). Quand les deux
            joueurs passent d'affilée, le round se termine.
          </p>
        </LorSection>

        <LorSection title="⚔️ Jeton d'attaque">
          <p>
            Un seul joueur peut <strong>déclarer une attaque</strong> par
            round — le porteur du <em>jeton d'attaque</em>. Le jeton
            alterne à chaque round. Tu peux choisir de ne pas attaquer ce
            round et garder du mana pour des sorts.
          </p>
          <p className="mt-2">
            Quelques sorts (Ralliez-vous, Poursuite inlassable) te
            redonnent le jeton si tu l'as déjà utilisé.
          </p>
        </LorSection>

        <LorSection title="🛡️ Combat">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong>Déclaration</strong> : tu choisis 1 à 6 unités
              prêtes sur ton banc (qui ne sont pas posées ce round, non
              gelées, power &gt; 0). Elles entrent dans des <em>lanes</em>{" "}
              dans l'ordre choisi.
            </li>
            <li>
              <strong>Bloqueurs</strong> : l'adversaire assigne un
              bloqueur par lane (ou laisse passer). Mots-clés contraints :
              Insaisissable, Redoutable, Challenger, etc.
            </li>
            <li>
              <strong>Résolution simultanée</strong> : chaque attaquant
              et son bloqueur s'infligent leur puissance. Sans bloqueur,
              l'attaquant frappe le Nexus.
            </li>
            <li>
              <strong>Timing Quick Strike / Double Strike</strong> :
              Frappe rapide avant l'autre, Double frappe = 2 frappes (1 en
              QS timing, 1 simultanée).
            </li>
          </ol>
        </LorSection>

        <LorSection title="📚 Mots-clés (≈40)">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Keyword
              name="Frappe rapide"
              desc="Frappe avant l'autre unité. Si elle tue avant d'être touchée, elle survit sans dégâts."
            />
            <Keyword
              name="Double frappe"
              desc="Frappe deux fois (une rapide, une simultanée)."
            />
            <Keyword
              name="Surpuissance"
              desc="Les dégâts en excès au-delà du PV du bloqueur passent au Nexus."
            />
            <Keyword
              name="Robuste"
              desc="Reçoit -1 dégât (min 0) à chaque instance."
            />
            <Keyword
              name="Barrière"
              desc="Annule entièrement la 1re instance de dégâts (jusqu'au prochain round)."
            />
            <Keyword
              name="Régénération"
              desc="Soigne tous ses dégâts en fin de round."
            />
            <Keyword
              name="Vol de vie"
              desc="Soigne ton Nexus du montant de dégâts infligé."
            />
            <Keyword
              name="Insaisissable"
              desc="Bloquée uniquement par une autre unité Insaisissable ou Vue perçante."
            />
            <Keyword
              name="Redoutable"
              desc="Bloquée uniquement par une unité de puissance ≥ 3."
            />
            <Keyword
              name="Vue perçante"
              desc="Peut bloquer les unités Insaisissables."
            />
            <Keyword
              name="Challenger"
              desc="L'attaquant force quelle unité ennemie doit bloquer ce round."
            />
            <Keyword
              name="Vulnérabilité"
              desc="L'inverse — les attaquants peuvent forcer ce qu'elle bloque."
            />
            <Keyword
              name="Fureur"
              desc="Quand l'unité tue un ennemi, elle gagne +1|+1 permanent."
            />
            <Keyword
              name="Éphémère"
              desc="Meurt à la fin du round (ou après avoir frappé)."
            />
            <Keyword
              name="Dernier souffle"
              desc="Effet déclenché quand l'unité meurt."
            />
            <Keyword
              name="Inspiration"
              desc="Effet déclenché quand le contrôleur lance un sort."
            />
            <Keyword
              name="Support"
              desc="Effet à l'allié à droite quand l'unité attaque."
            />
            <Keyword
              name="Gel (Frostbite)"
              desc="L'unité a 0 puissance ce round."
            />
            <Keyword
              name="Étourdir (Stun)"
              desc="L'unité ne peut plus attaquer ni bloquer ce round."
            />
            <Keyword
              name="Silence"
              desc="Retire tous les mots-clés et buffs de l'unité (cible adepte uniquement)."
            />
          </div>
        </LorSection>

        <LorSection title="✨ Vitesses de sort">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Instantané (Burst)</strong> : se résout
              immédiatement, ne donne pas la priorité.
            </li>
            <li>
              <strong>Rapide (Fast)</strong> : se résout après que
              l'adversaire ait pu réagir avec ses propres Fast/Burst.
            </li>
            <li>
              <strong>Lent (Slow)</strong> : ne peut pas être lancé
              pendant un combat. L'adversaire peut réagir.
            </li>
          </ul>
        </LorSection>

        <LorSection title="🏆 Champions et level-up">
          <p>
            Les <strong>Champions</strong> (Lucian, Garen, Lux, Anivia,
            Yasuo, Karma, Teemo, Heimerdinger, Draven, Darius, Jinx,
            Vladimir, Katarina, Hecarim, Kalista, Thresh, Elise…) ont une
            condition de level-up unique. Une fois remplie, ils passent
            <em>niveau 2</em> avec stats et abilities boostés.
          </p>
          <p className="mt-2">
            Exemples : Garen passe niveau 2 après avoir <em>frappé</em>{" "}
            deux fois ; Lux après que tu aies dépensé 6+ mana en sorts ;
            Yasuo après avoir vu 4 ennemis étourdis ou rappelés.
          </p>
        </LorSection>

        <LorSection title="🎓 Tutoriel pas-à-pas (premier match)">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong>Mulligan</strong> : tu pioches 4 cartes. Sélectionne
              celles à remplacer (souvent les ≥5 mana au tout début) puis
              valide.
            </li>
            <li>
              <strong>Round 1</strong> : 1 mana max — pose une unité 1
              mana ou attends. Si tu as le jeton d'attaque, attaque avec
              elle pour 1 dégât au Nexus.
            </li>
            <li>
              <strong>Round 2-3</strong> : développe le board. Garde un
              peu de mana pour des sorts Fast/Burst en réaction si
              possible.
            </li>
            <li>
              <strong>Round 4-5</strong> : commence à poser tes
              champions. Pense à leur condition de level-up.
            </li>
            <li>
              <strong>Round 6+</strong> : finishers, sorts Slow gros
              impact (Décimation 4 dmg nexus, La Ruine board wipe…).
            </li>
            <li>
              <strong>Pour gagner</strong> : 20 dégâts au Nexus adverse,
              que ce soit par attaques cumulées ou sort direct létal.
            </li>
          </ol>
        </LorSection>

        <LorSection title="💰 Récompenses">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Bot Suprême</strong> : bat le bot 3× pour 1 booster
              gratuit.
            </li>
            <li>
              <strong>JcJ classé</strong> : système ELO partagé avec les
              autres TCG. Match gagné = ELO ↑, perdu = ELO ↓.
            </li>
            <li>
              <strong>Or Suprême</strong> : pari Or sur la match
              (optionnel) pour augmenter la mise.
            </li>
            <li>
              <strong>Boosters</strong> : 6 packs régions (1 par région).
              Chaque pack = 5 cartes de cette région.
            </li>
          </ul>
        </LorSection>

        <p className="mt-10 text-xs text-zinc-500">
          Note : ce projet est un clone non-officiel à but de
          divertissement. Les noms et illustrations appartiennent à Riot
          Games.
        </p>
      </div>
    </div>
  );
}

function LorSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-semibold text-violet-200">{title}</h2>
      <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-zinc-200">
        {children}
      </div>
    </section>
  );
}
