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
  if (gameId !== "onepiece") {
    // Pour l'instant la page règles est OnePiece-spécifique. Les autres
    // jeux retombent sur le hub.
    return (
      <div className="min-h-screen bg-zinc-950 p-8 text-zinc-100">
        <Link
          href={`/play/tcg/${gameId}`}
          className="text-sm text-zinc-400 hover:text-white"
        >
          ← Retour au hub
        </Link>
        <p className="mt-4 text-zinc-400">
          Page règles disponible uniquement pour One Piece TCG pour le
          moment.
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
