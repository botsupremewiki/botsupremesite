// Parser d'effets d'attaques — extrait des effets machine-readable depuis
// le `attack.text` français (descriptif TCG officiel) pour qu'on puisse les
// exécuter dans le moteur de combat.
//
// Approche pragmatique : ~25 patterns regex couvrent la grande majorité
// des cartes A1. Les patterns plus exotiques (« Échangez l'Actif adverse
// avec le deck », « Copiez une attaque adverse ») sont laissés non
// implémentés et taggés comme tels — l'attaque fait juste ses dégâts de
// base.

import type { BattleStatus, PokemonEnergyType } from "../../../shared/types";

/** Code de type Pocket {G} {R} {W}… → notre PokemonEnergyType. */
const TYPE_CODE: Record<string, PokemonEnergyType> = {
  G: "grass",
  R: "fire",
  W: "water",
  L: "lightning",
  P: "psychic",
  F: "fighting",
  D: "darkness",
  M: "metal",
  N: "dragon",
  Y: "fairy",
  C: "colorless",
};

/** Mots français nombre → number (pour « Lancez une pièce » / « Lancez 2 pièces »). */
function parseCount(s: string): number {
  const lower = s.toLowerCase();
  if (lower === "une") return 1;
  if (lower === "deux") return 2;
  if (lower === "trois") return 3;
  if (lower === "quatre") return 4;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 1;
}

function parseEnergyTypeCode(code: string): PokemonEnergyType {
  return TYPE_CODE[code.toUpperCase()] ?? "colorless";
}

function parseStatus(label: string): BattleStatus | null {
  switch (label.toLowerCase()) {
    case "empoisonné":
      return "poisoned";
    case "endormi":
      return "asleep";
    case "paralysé":
      return "paralyzed";
    case "brûlé":
      return "burned";
    case "confus":
      return "confused";
    default:
      return null;
  }
}

/** Effet machine-readable parsé depuis un texte d'attaque français. */
export type AttackEffect =
  // ─── Modifier le damage final ────────────────────────────────────────
  /** Multiplie le damage par le nombre de faces sur N lancers (résolu côté
   *  exec : on lance les N pièces et on multiplie). Le `damage` de base de
   *  l'attaque représente la valeur PAR FACE (ex « 30 dégâts pour chaque
   *  côté face » → damage=30, perFace, coins=N). */
  | { kind: "multi-coin-per-face"; coins: number }
  /** Lance N pièces, si TOUTES sont face → +bonus dégâts. */
  | { kind: "all-coins-bonus"; coins: number; bonus: number }
  /** Lance 1 pièce, si face → +bonus dégâts. */
  | { kind: "single-coin-bonus"; bonus: number }
  /** Lance 1 pièce, si pile → l'attaque foire (0 dégâts, aucun effet). */
  | { kind: "tails-fail" }
  /** Lance pile/face jusqu'à pile, +damage par face. */
  | { kind: "flip-until-tails-damage"; perFace: number }
  /** +bonus dégâts si l'Actif adverse est blessé. */
  | { kind: "bonus-if-opp-hurt"; bonus: number }
  /** +bonus dégâts si l'Actif adverse a un statut donné. */
  | { kind: "bonus-if-opp-status"; status: BattleStatus; bonus: number }
  /** +bonus dégâts si CE Pokémon est blessé. */
  | { kind: "bonus-if-self-hurt"; bonus: number }
  /** +bonus dégâts par Énergie attachée à l'Actif adverse. */
  | { kind: "scaling-by-opp-energies"; per: number }
  /** +bonus dégâts par Pokémon de notre Banc (toutes catégories). */
  | { kind: "scaling-by-bench-count"; per: number }
  /** +bonus dégâts par Pokémon d'un type donné sur notre Banc. */
  | { kind: "scaling-by-typed-bench"; per: number; type: PokemonEnergyType }
  /** +bonus dégâts par Pokémon d'un nom précis sur notre Banc (ex Nidoking). */
  | { kind: "scaling-by-named-bench"; per: number; name: string }
  // ─── Statuts infligés à l'Actif adverse ──────────────────────────────
  | { kind: "inflict-status"; status: BattleStatus; conditional?: "coin-flip" }
  // ─── Effets sur ce Pokémon (attaquant) ───────────────────────────────
  | { kind: "self-heal"; amount: number }
  | { kind: "self-damage"; amount: number }
  /** « Soignez ce Pokémon du nombre de dégâts infligés ». */
  | { kind: "drain-heal" }
  /** Inflige des dégâts à un de NOS Pokémon de Banc (au hasard). */
  | { kind: "self-bench-damage"; amount: number }
  /** Échange ce Pokémon contre un Pokémon du Banc. */
  | { kind: "self-swap" }
  // ─── Dégâts sur le Banc adverse / cible random ───────────────────────
  /** Inflige des dégâts à CHAQUE Pokémon de Banc adverse. */
  | { kind: "bench-damage-all-opp"; amount: number }
  /** Inflige des dégâts à 1 Pokémon adverse au hasard (Actif + Banc). */
  | { kind: "random-hit-opp"; amount: number }
  /** Inflige des dégâts à 1 Pokémon de Banc adverse au hasard. */
  | { kind: "random-hit-opp-bench"; amount: number }
  /** N tirs aléatoires de 50 dégâts (Mewtwo « Pulvérize Psy »). */
  | { kind: "multi-random-hit-opp"; times: number; amount: number }
  // ─── Énergies ────────────────────────────────────────────────────────
  /** Défausse N énergies d'un type donné de CE Pokémon. */
  | {
      kind: "discard-self-energy";
      energyType: PokemonEnergyType;
      count: number;
    }
  /** Défausse TOUTES les énergies de ce Pokémon. */
  | { kind: "discard-self-all-energies" }
  /** Défausse au hasard 1 énergie de l'Actif adverse. */
  | {
      kind: "discard-opp-energy-random";
      conditional?: "coin-flip";
    }
  /** Attache une énergie d'un type au Pokémon attaquant. */
  | { kind: "self-attach-energy"; energyType: PokemonEnergyType }
  /** Attache une énergie d'un type à un Pokémon du Banc. */
  | {
      kind: "bench-attach-energy";
      energyType: PokemonEnergyType;
      benchType: PokemonEnergyType;
    }
  // ─── Pioche / search ─────────────────────────────────────────────────
  | { kind: "draw"; count: number }
  /** Cherche un Pokémon d'un type dans le deck et l'ajoute à la main. */
  | { kind: "search-typed-to-hand"; type: PokemonEnergyType }
  /** Cherche un Pokémon d'un nom précis dans le deck et le pose au Banc. */
  | { kind: "search-named-to-bench"; name: string }
  // ─── Effets sur la main / le tour adverse ────────────────────────────
  /** Défausse 1 carte au hasard de la main de l'adversaire (avec/sans coin flip). */
  | { kind: "discard-opp-hand-random"; conditional?: "coin-flip" }
  /** L'adversaire ne peut pas jouer de carte Supporter à son prochain tour. */
  | { kind: "no-supporter-opp-next-turn" }
  // ─── Bonus conditionnel par énergies "de plus" que le coût ──────────
  /** +bonus si l'attaquant a au moins N énergies du type donné AU-DELÀ
   *  de ce que coûte l'attaque (« 2 Énergies {W} de plus »). */
  | {
      kind: "bonus-by-extra-energies";
      energyType: PokemonEnergyType;
      minExtra: number;
      bonus: number;
    }
  // ─── Multi-coin attach to bench (Salamèche-ex Pluri-Tonnerre, …) ─────
  /** Lance N pièces, attache 1 énergie par face aux Pokémon du Banc d'un
   *  type donné (au choix — MVP : random). */
  | {
      kind: "multi-coin-attach-bench";
      coins: number;
      energyType: PokemonEnergyType;
      benchType: PokemonEnergyType;
    }
  // ─── Flags "prochain tour" sur le défenseur (Pokémon adverse) ────────
  /** Le Pokémon Défenseur ne peut pas battre en retraite au prochain tour. */
  | { kind: "defender-no-retreat-next-turn" }
  /** Le Pokémon Défenseur ne peut pas attaquer au prochain tour. */
  | { kind: "defender-no-attack-next-turn"; conditional?: "coin-flip" }
  /** Les attaques utilisées par le Pokémon Défenseur infligent -N dégâts. */
  | { kind: "defender-attack-penalty-next-turn"; amount: number }
  // ─── Flags "prochain tour" sur soi-même (l'attaquant) ────────────────
  /** Ce Pokémon subit -N dégâts venant des attaques au prochain tour adverse. */
  | { kind: "self-damage-reduction-next-turn"; amount: number }
  /** Évitez tous les dégâts/effets reçus pendant le prochain tour adverse. */
  | { kind: "self-invulnerable-next-turn"; conditional?: "coin-flip" }
  // ─── Mélange Actif au deck ───────────────────────────────────────────
  /** L'adversaire mélange son Pokémon Actif dans son deck (avec coin flip). */
  | { kind: "shuffle-opp-active-to-deck"; conditional?: "coin-flip" }
  // ─── Copy attack (Mew « Mémoire Ancestrale ») ───────────────────────
  /** « Choisissez l'une des attaques des Pokémon de votre adversaire et
   *  utilisez-la en tant que cette attaque ». Le client doit fournir
   *  `copyFromUid` + `copyAttackIndex` au moment du `battle-attack` pour
   *  préciser quelle attaque copier. */
  | { kind: "copy-opp-attack" }
  // ─── Force-opp-switch (Krakos « Dégagement ») ───────────────────────
  /** « Échangez le Pokémon Actif de votre adversaire avec l'un de ses
   *  Pokémon de Banc. (Votre adversaire choisit le nouveau Pokémon
   *  Actif.) ». Identique à Morgane (Dresseur) mais en attaque : on déplace
   *  opp.active dans opp.bench et on flag mustPromoteActive. */
  | { kind: "force-opp-switch" }
  // ─── Single coin avec branches symétriques (Élektek « Poing Éclair ») ─
  /** « Lancez une pièce. Si face, +N dégâts. Si pile, ce Pokémon s'inflige
   *  aussi M dégâts. » — UN seul flip qui conditionne les DEUX résultats
   *  (50%/50% chance), pas deux flips indépendants. */
  | {
      kind: "single-coin-bonus-or-recoil";
      bonus: number;
      recoil: number;
    }
  // ─── Effets non implémentés (parsés pour debug, pas exécutés) ────────
  | { kind: "unimplemented"; pattern: string };

// ─── Patterns regex ──────────────────────────────────────────────────────

/** Détecte les patterns un par un. Retourne la liste de tous les effets
 *  trouvés. Un même texte peut produire plusieurs effets (ex pile/face
 *  conditionnel + bonus). */
export function parseAttackEffects(
  text: string | null | undefined,
): AttackEffect[] {
  if (!text) return [];
  const effects: AttackEffect[] = [];
  // On consomme le texte au fur et à mesure (replace à blanc) pour éviter
  // les doubles-matches.
  let t = text;

  const consume = (re: RegExp, handler: (m: RegExpMatchArray) => void) => {
    const m = t.match(re);
    if (m) {
      handler(m);
      t = t.replace(re, " ");
    }
  };

  // ── Multi-coin per face ──
  // « Lancez 2 pièces. Cette attaque inflige 50 dégâts pour chaque côté face. »
  consume(
    /Lancez (\d+|une|deux|trois|quatre) pièces?\.\s*Cette attaque inflige \d+ dégâts pour chaque côté face\./i,
    (m) => {
      effects.push({
        kind: "multi-coin-per-face",
        coins: parseCount(m[1]),
      });
    },
  );

  // ── All coins bonus ──
  // « Lancez 2 pièces. Si toutes sont côté face, cette attaque inflige 80 dégâts de plus. »
  consume(
    /Lancez (\d+|une|deux|trois|quatre) pièces?\.\s*Si toutes sont côté face, cette attaque inflige (\d+) dégâts de plus\./i,
    (m) => {
      effects.push({
        kind: "all-coins-bonus",
        coins: parseCount(m[1]),
        bonus: parseInt(m[2], 10),
      });
    },
  );

  // ── Flip until tails for damage ──
  consume(
    /Lancez une pièce jusqu'à ce que vous obteniez pile\.\s*Cette attaque inflige (\d+) dégâts pour chaque côté face\./i,
    (m) => {
      effects.push({
        kind: "flip-until-tails-damage",
        perFace: parseInt(m[1], 10),
      });
    },
  );

  // ── Single coin tails-fail ──
  consume(/Lancez une pièce\.\s*Si c'est pile, cette attaque ne fait rien\./i, () => {
    effects.push({ kind: "tails-fail" });
  });

  // ── Single coin avec branches symétriques (Élektek « Poing Éclair ») ──
  // « Lancez une pièce. Si c'est face, +N dégâts. Si c'est pile, ce Pokémon
  //   s'inflige aussi M dégâts. »
  // Doit être PARSÉ EN PREMIER (avant single-coin-bonus + self-damage qui
  // matcheraient chacun une moitié séparément, donnant 2 flips au lieu d'1).
  consume(
    /Lancez une pièce\.\s*Si c'est face, cette attaque inflige (\d+) dégâts de plus\.\s*Si c'est pile, ce Pokémon s'inflige aussi (\d+) dégâts\./i,
    (m) => {
      effects.push({
        kind: "single-coin-bonus-or-recoil",
        bonus: parseInt(m[1], 10),
        recoil: parseInt(m[2], 10),
      });
    },
  );

  // ── Single coin bonus simple ──
  // « Lancez une pièce. Si c'est face, cette attaque inflige 40 dégâts de plus. »
  consume(
    /Lancez une pièce\.\s*Si c'est face, cette attaque inflige (\d+) dégâts de plus\./i,
    (m) => {
      effects.push({
        kind: "single-coin-bonus",
        bonus: parseInt(m[1], 10),
      });
    },
  );

  // ── Status (avec ou sans pile/face conditionnel) ──
  // « Lancez une pièce. Si c'est face, le Pokémon Actif de votre adversaire est maintenant Paralysé. »
  consume(
    /Lancez une pièce\.\s*Si c'est face, le Pokémon (?:Actif de votre adversaire|Défenseur) est maintenant (Empoisonné|Endormi|Paralysé|Brûlé|Confus)\./i,
    (m) => {
      const status = parseStatus(m[1]);
      if (status)
        effects.push({ kind: "inflict-status", status, conditional: "coin-flip" });
    },
  );
  // « Le Pokémon Actif de votre adversaire est maintenant Empoisonné. »
  consume(
    /Le Pokémon (?:Actif de votre adversaire|Défenseur) est maintenant (Empoisonné|Endormi|Paralysé|Brûlé|Confus)\./i,
    (m) => {
      const status = parseStatus(m[1]);
      if (status) effects.push({ kind: "inflict-status", status });
    },
  );

  // ── Self heal ──
  consume(/Soignez (\d+) dégâts de ce Pokémon\./i, (m) => {
    effects.push({ kind: "self-heal", amount: parseInt(m[1], 10) });
  });

  // ── Drain heal ──
  consume(
    /Soignez ce Pokémon du nombre de dégâts que vous avez infligés au Pokémon Actif de votre adversaire\./i,
    () => {
      effects.push({ kind: "drain-heal" });
    },
  );

  // ── Self damage / recoil ──
  consume(/Ce Pokémon s'inflige aussi (\d+) dégâts\./i, (m) => {
    effects.push({ kind: "self-damage", amount: parseInt(m[1], 10) });
  });

  // ── Self bench damage ──
  consume(
    /Cette attaque inflige aussi (\d+) dégâts à un de vos Pokémon de Banc\./i,
    (m) => {
      effects.push({
        kind: "self-bench-damage",
        amount: parseInt(m[1], 10),
      });
    },
  );

  // ── Bench damage all opp ──
  consume(
    /Cette attaque inflige aussi (\d+) dégâts à chaque Pokémon de Banc de votre adversaire\./i,
    (m) => {
      effects.push({
        kind: "bench-damage-all-opp",
        amount: parseInt(m[1], 10),
      });
    },
  );

  // ── Random hit opp (banc only) ──
  consume(
    /Cette attaque inflige (\d+) dégâts à un des Pokémon de Banc de votre adversaire\./i,
    (m) => {
      effects.push({
        kind: "random-hit-opp-bench",
        amount: parseInt(m[1], 10),
      });
    },
  );

  // ── Random hit opp (any) ──
  consume(
    /Cette attaque inflige (\d+) dégâts à l'un des Pokémon de votre adversaire\./i,
    (m) => {
      effects.push({
        kind: "random-hit-opp",
        amount: parseInt(m[1], 10),
      });
    },
  );

  // ── Multi random hit opp ──
  consume(
    /Un des Pokémon de votre adversaire est choisi au hasard (\d+) fois\.\s*Pour chaque fois où un Pokémon est choisi, il subit (\d+) dégâts\./i,
    (m) => {
      effects.push({
        kind: "multi-random-hit-opp",
        times: parseInt(m[1], 10),
        amount: parseInt(m[2], 10),
      });
    },
  );

  // ── Conditions de bonus ──
  consume(
    /Si le Pokémon Actif de votre adversaire a subi des dégâts, cette attaque inflige (\d+) dégâts de plus\./i,
    (m) => {
      effects.push({ kind: "bonus-if-opp-hurt", bonus: parseInt(m[1], 10) });
    },
  );
  consume(
    /Si le Pokémon Actif de votre adversaire est (Empoisonné|Endormi|Paralysé|Brûlé|Confus), cette attaque inflige (\d+) dégâts de plus\./i,
    (m) => {
      const status = parseStatus(m[1]);
      if (status)
        effects.push({
          kind: "bonus-if-opp-status",
          status,
          bonus: parseInt(m[2], 10),
        });
    },
  );
  consume(
    /Si ce Pokémon a subi des dégâts, cette attaque inflige (\d+) dégâts de plus\./i,
    (m) => {
      effects.push({
        kind: "bonus-if-self-hurt",
        bonus: parseInt(m[1], 10),
      });
    },
  );

  // ── Scaling ──
  consume(
    /Cette attaque inflige (\d+) dégâts (?:de plus |supplémentaires )?pour chaque Énergie attachée au Pokémon Actif de votre adversaire\./i,
    (m) => {
      effects.push({
        kind: "scaling-by-opp-energies",
        per: parseInt(m[1], 10),
      });
    },
  );
  consume(
    /Cette attaque inflige (\d+) dégâts pour chacun de vos Pokémon de Banc\./i,
    (m) => {
      effects.push({
        kind: "scaling-by-bench-count",
        per: parseInt(m[1], 10),
      });
    },
  );
  consume(
    /Cette attaque inflige (\d+) dégâts pour chaque Pokémon \{(\w)\} sur votre Banc\./i,
    (m) => {
      effects.push({
        kind: "scaling-by-typed-bench",
        per: parseInt(m[1], 10),
        type: parseEnergyTypeCode(m[2]),
      });
    },
  );
  consume(
    /Cette attaque inflige (\d+) dégâts supplémentaires pour chaque (\w+) sur votre Banc\./i,
    (m) => {
      effects.push({
        kind: "scaling-by-named-bench",
        per: parseInt(m[1], 10),
        name: m[2],
      });
    },
  );

  // ── Discard self energies ──
  consume(/Défaussez toutes les Énergies de ce Pokémon\./i, () => {
    effects.push({ kind: "discard-self-all-energies" });
  });
  consume(
    /Défaussez (\d+|une) Énergies? \{(\w)\} de ce Pokémon\./i,
    (m) => {
      effects.push({
        kind: "discard-self-energy",
        energyType: parseEnergyTypeCode(m[2]),
        count: parseCount(m[1]),
      });
    },
  );

  // ── Discard opp energy random ──
  consume(
    /Lancez une pièce\.\s*Si c'est face, défaussez au hasard une Énergie du Pokémon Actif de votre adversaire\./i,
    () => {
      effects.push({
        kind: "discard-opp-energy-random",
        conditional: "coin-flip",
      });
    },
  );
  consume(
    /Défaussez au hasard une Énergie du Pokémon Actif de votre adversaire\./i,
    () => {
      effects.push({ kind: "discard-opp-energy-random" });
    },
  );

  // ── Self attach energy ──
  consume(
    /Prenez une Énergie \{(\w)\} de votre zone Énergie et attachez-la à ce Pokémon\./i,
    (m) => {
      effects.push({
        kind: "self-attach-energy",
        energyType: parseEnergyTypeCode(m[1]),
      });
    },
  );

  // ── Bench attach energy ──
  consume(
    /Prenez une Énergie \{(\w)\} de votre zone Énergie et attachez-la à l'un de vos Pokémon \{(\w)\} de Banc\./i,
    (m) => {
      effects.push({
        kind: "bench-attach-energy",
        energyType: parseEnergyTypeCode(m[1]),
        benchType: parseEnergyTypeCode(m[2]),
      });
    },
  );

  // ── Self swap ──
  consume(/Échangez ce Pokémon contre l'un de vos Pokémon de Banc\./i, () => {
    effects.push({ kind: "self-swap" });
  });

  // ── Draw ──
  consume(/Piochez une carte\./i, () => {
    effects.push({ kind: "draw", count: 1 });
  });

  // ── Search ──
  consume(
    /Ajoutez au hasard un Pokémon \{(\w)\} de votre deck à votre main\./i,
    (m) => {
      effects.push({
        kind: "search-typed-to-hand",
        type: parseEnergyTypeCode(m[1]),
      });
    },
  );
  consume(
    /Placez une carte (\S+?) au hasard de votre deck sur votre Banc\./i,
    (m) => {
      effects.push({ kind: "search-named-to-bench", name: m[1] });
    },
  );

  // ── Hand discard (avec ou sans coin flip) ──
  consume(
    /Lancez une pièce\.\s*Si c'est face, défaussez au hasard une carte de la main de votre adversaire\./i,
    () => {
      effects.push({
        kind: "discard-opp-hand-random",
        conditional: "coin-flip",
      });
    },
  );

  // ── No-supporter pour l'adversaire au prochain tour ──
  consume(
    /Votre adversaire ne peut pas jouer de carte Supporter de sa main lors son prochain tour\./i,
    () => {
      effects.push({ kind: "no-supporter-opp-next-turn" });
    },
  );

  // ── Bonus si X énergies « de plus » que le coût ──
  // « Si ce Pokémon a au moins 3 Énergies {W} de plus, +70 dégâts »
  consume(
    /Si ce Pokémon a au moins (\d+) Énergies? \{(\w)\} de plus, cette attaque inflige (\d+) dégâts? supplémentaires?\./i,
    (m) => {
      effects.push({
        kind: "bonus-by-extra-energies",
        energyType: parseEnergyTypeCode(m[2]),
        minExtra: parseInt(m[1], 10),
        bonus: parseInt(m[3], 10),
      });
    },
  );

  // ── Multi-coin attach to bench ──
  // « Lancez 3 pièces. Prenez le même nombre d'Énergie {R} de votre zone
  //   Énergie que le nombre de côté face obtenu et attachez-les à vos
  //   Pokémon {R} de Banc comme il vous plaît. »
  consume(
    /Lancez (\d+|une|deux|trois|quatre) pièces?\.\s*Prenez le même nombre d'Énergies? \{(\w)\}[^.]*?et attachez-les? à vos Pokémon \{(\w)\} de Banc[^.]*?\./i,
    (m) => {
      effects.push({
        kind: "multi-coin-attach-bench",
        coins: parseCount(m[1]),
        energyType: parseEnergyTypeCode(m[2]),
        benchType: parseEnergyTypeCode(m[3]),
      });
    },
  );

  // ── Flags "prochain tour" sur le défenseur ──
  consume(
    /Pendant le prochain tour de votre adversaire, le Pokémon Défenseur ne peut pas battre en retraite\./i,
    () => {
      effects.push({ kind: "defender-no-retreat-next-turn" });
    },
  );
  consume(
    /Lancez une pièce\.\s*Si c'est face, le Pokémon Défenseur ne peut pas attaquer pendant le prochain tour de votre adversaire\./i,
    () => {
      effects.push({
        kind: "defender-no-attack-next-turn",
        conditional: "coin-flip",
      });
    },
  );
  consume(
    /Pendant le prochain tour de votre adversaire, le Pokémon Défenseur ne peut pas attaquer\./i,
    () => {
      effects.push({ kind: "defender-no-attack-next-turn" });
    },
  );
  consume(
    /Pendant le prochain tour de votre adversaire, les attaques utilisées par le Pokémon Défenseur infligent (?:−|-) ?(\d+) dégâts?\./i,
    (m) => {
      effects.push({
        kind: "defender-attack-penalty-next-turn",
        amount: parseInt(m[1], 10),
      });
    },
  );

  // ── Flags "prochain tour" sur soi-même ──
  consume(
    /Pendant le prochain tour de votre adversaire, ce Pokémon subit (?:−|-) ?(\d+) dégâts? provenant des attaques\./i,
    (m) => {
      effects.push({
        kind: "self-damage-reduction-next-turn",
        amount: parseInt(m[1], 10),
      });
    },
  );
  consume(
    /Lancez une pièce\.\s*Si c'est face, pendant le prochain tour de votre adversaire, évitez tous les dégâts et les effets d'attaques infligés à ce Pokémon\./i,
    () => {
      effects.push({
        kind: "self-invulnerable-next-turn",
        conditional: "coin-flip",
      });
    },
  );

  // ── Mélange Actif adverse au deck (avec coin flip) ──
  consume(
    /Lancez une pièce\.\s*Si c'est face, votre adversaire mélange son Pokémon Actif (?:avec|dans) son deck\./i,
    () => {
      effects.push({
        kind: "shuffle-opp-active-to-deck",
        conditional: "coin-flip",
      });
    },
  );

  // ── Copy attack (Mew « Mémoire Ancestrale ») ──
  consume(
    /Choisissez l'une des attaques des Pokémon de votre adversaire et utilisez-la en tant que cette attaque\./i,
    () => {
      effects.push({ kind: "copy-opp-attack" });
    },
  );

  // ── Force-opp-switch (Krakos « Dégagement ») ──
  // Texte officiel : « Échangez le Pokémon Actif de votre adversaire avec
  // l'un de ses Pokémon de Banc. (Votre adversaire choisit le nouveau
  // Pokémon Actif.) ». Identique à Morgane mais déclenché par une attaque.
  // On utilise une regex large (pas de parenthèse obligatoire) pour
  // attraper d'éventuelles variations de phrasé.
  consume(
    /Échangez le Pokémon Actif de votre adversaire avec l'un de ses Pokémon de Banc\./i,
    () => {
      effects.push({ kind: "force-opp-switch" });
    },
  );

  // ── Patterns non implémentés (loggés en debug pour suivi) ────────
  // On ne les push pas comme effets exécutables, mais on peut les
  // tracer si besoin via un grep ultérieur.
  return effects;
}
