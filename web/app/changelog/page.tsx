import Link from "next/link";

export const dynamic = "force-static";

type Entry = {
  date: string;
  version: string;
  title: string;
  items: string[];
};

const CHANGELOG: Entry[] = [
  {
    date: "2026-05-01",
    version: "1.18.0",
    title: "Polish UI & a11y",
    items: [
      "♿ Skip-to-content link, focus-visible global, prefers-reduced-motion",
      "🎨 Skeleton + EmptyState + Toast système",
      "🌓 Mode clair/sombre/auto avec toggle persistant",
      "⌘K Command Palette (navigation rapide)",
      "📈 Charts ELO timeline + Donut winrate sur la page Stats",
      "⚙️ Page Paramètres (notifications + sons + thème + a11y)",
      "📝 Page Aide / FAQ + Changelog",
    ],
  },
  {
    date: "2026-05-01",
    version: "1.17.0",
    title: "Localisation FR/EN",
    items: [
      "🌐 Infrastructure i18n complète (fr.json + en.json)",
      "🇫🇷🇬🇧 Toggle de langue dans la landing page",
    ],
  },
  {
    date: "2026-05-01",
    version: "1.16.0",
    title: "Infra & PWA",
    items: [
      "📱 Manifest PWA (installable sur mobile)",
      "🚦 Rate limiting SQL helper",
      "🧪 Smoke tests Playwright",
      "📊 Sentry stub (si SENTRY_DSN défini)",
    ],
  },
  {
    date: "2026-05-01",
    version: "1.15.0",
    title: "Tournois Swiss + Game features",
    items: [
      "🏟️ Swiss tournaments + double elim infrastructure",
      "👁️ Spectator mode live",
      "🎲 Wonder Pick (pioche mystère)",
      "🧠 Auto-deckbuilder IA",
      "🎯 Formats custom (mono-couleur, no-EX)",
      "⏰ Anti-AFK (auto-concède après 3min inactivité)",
    ],
  },
  {
    date: "2026-05-01",
    version: "1.14.0",
    title: "Engagement",
    items: [
      "🎫 Battle Pass saisonnier 50 niveaux",
      "🎁 Coffres bonus J7/J14/J30",
      "🎴 Starter decks préfabriqués",
      "📈 Stats par carte (winrate méta)",
    ],
  },
  {
    date: "2026-05-01",
    version: "1.13.0",
    title: "Social & Profile",
    items: [
      "🔗 Replays publics (sharing par URL)",
      "📌 Profile pins (épingler 3 achievements)",
      "📊 Achievement progress bars",
      "🔍 Battle history search avec filtres",
      "📖 Card encyclopedia",
      "🤝 Friends system + DM",
    ],
  },
  {
    date: "2026-04-30",
    version: "1.12.0",
    title: "Polish features",
    items: [
      "🎯 Filtres collection multi-select",
      "😄 Emotes en match",
      "🔔 Notifications hooks",
      "🎬 Replays match log + lecteur",
      "✨ Cosmétiques (titres + bordures)",
      "🚩 Système de signalement",
      "📱 Mobile responsive",
    ],
  },
  {
    date: "2026-04-30",
    version: "1.11.0",
    title: "Compétitif & engagement",
    items: [
      "📅 Saisons ranked mensuelles + récompenses par tier",
      "🏟️ Mode tournoi single-elim",
      "🎯 Quêtes journalières TCG",
      "🎓 Tutoriel guidé 8 étapes",
      "📈 Page méta (stats globales)",
    ],
  },
  {
    date: "2026-04-30",
    version: "1.10.0",
    title: "Decks publics & profils enrichis",
    items: [
      "📤 Decks partageables avec code à 6 caractères",
      "👤 Profil public /u/[username] avec stats TCG + decks",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <Link
          href="/"
          className="text-zinc-400 transition-colors hover:text-zinc-100"
        >
          ← Accueil
        </Link>
        <span className="font-semibold">📝 Changelog</span>
        <Link
          href="/help"
          className="text-xs text-zinc-400 hover:text-zinc-100"
        >
          ❓ Aide
        </Link>
      </header>
      <main
        id="main-content"
        className="flex flex-1 flex-col items-center overflow-y-auto p-6"
      >
        <div className="w-full max-w-2xl">
          <h1 className="text-3xl font-bold text-zinc-100">📝 Changelog</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Les améliorations et nouveautés du site, dans l&apos;ordre
            inverse chronologique.
          </p>
          <div className="mt-6 flex flex-col gap-4">
            {CHANGELOG.map((e) => (
              <article
                key={e.version}
                className="rounded-xl border border-white/10 bg-black/40 p-4"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="rounded-md border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                    v{e.version}
                  </span>
                  <span className="text-[10px] text-zinc-500">{e.date}</span>
                  <h2 className="text-base font-bold text-zinc-100">
                    {e.title}
                  </h2>
                </div>
                <ul className="mt-3 list-inside space-y-1 text-sm text-zinc-300">
                  {e.items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
