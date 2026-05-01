// Helpers de validation des formats Pokémon TCG.
//
// Un deck peut être tagué avec un format ; à la sauvegarde on vérifie
// que les cartes respectent les contraintes. Les decks sans format
// sont implicitement "standard" et n'ont aucune contrainte.

import type { PokemonCardData } from "./types";

export type PokemonDeckFormat = "standard" | "mono" | "no-ex";

export const FORMAT_META: Record<
  PokemonDeckFormat,
  { label: string; description: string; emoji: string }
> = {
  standard: {
    label: "Standard",
    description: "Aucune contrainte. Toutes les cartes autorisées.",
    emoji: "🃏",
  },
  mono: {
    label: "Mono-couleur",
    description:
      "Tous les Pokémon doivent partager le même type d'énergie (Incolore autorisé).",
    emoji: "🎨",
  },
  "no-ex": {
    label: "Sans EX",
    description: "Aucun Pokémon EX dans le deck (uniquement des cartes normales).",
    emoji: "🎯",
  },
};

export function validateDeckFormat(
  format: PokemonDeckFormat | null | undefined,
  cards: PokemonCardData[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!format || format === "standard") {
    return { valid: true, errors };
  }
  if (format === "mono") {
    const types = new Set<string>();
    for (const c of cards) {
      if (c.kind !== "pokemon") continue;
      if (c.type === "colorless") continue; // toléré
      types.add(c.type);
    }
    if (types.size > 1) {
      errors.push(
        `Mono-couleur : trouvé ${types.size} types (${Array.from(types).join(", ")}). Maximum 1.`,
      );
    }
  }
  if (format === "no-ex") {
    const exCount = cards.filter(
      (c) => c.kind === "pokemon" && c.isEx,
    ).length;
    if (exCount > 0) {
      errors.push(`Sans EX : trouvé ${exCount} carte(s) EX.`);
    }
  }
  return { valid: errors.length === 0, errors };
}
