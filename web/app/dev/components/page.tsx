import Link from "next/link";
import { ComponentsGallery } from "./gallery";

export const dynamic = "force-static";

/**
 * Page de preview des composants UI partagés. Sert de doc visuelle
 * et de smoke-test rapide quand on modifie un composant : on charge
 * /dev/components et on vérifie que tout rend correctement.
 *
 * Pas un Storybook complet (pas d'interactivité, pas de controls),
 * mais ça donne un aperçu de tous les composants en une seule page.
 *
 * Accessible publiquement — utile pour le designer qui veut voir
 * la palette sans avoir à se connecter.
 */
export default function ComponentsDevPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <Link
          href="/"
          className="text-zinc-400 transition-colors hover:text-zinc-100"
        >
          ← Accueil
        </Link>
        <span className="font-semibold">🧩 Components Gallery</span>
        <span className="text-xs text-zinc-500">/dev/components</span>
      </header>
      <main
        id="main-content"
        className="flex flex-1 flex-col items-center overflow-y-auto p-6"
      >
        <ComponentsGallery />
      </main>
    </div>
  );
}
