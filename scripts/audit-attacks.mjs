import fs from "fs";

const content = fs.readFileSync("shared/tcg-pokemon-base.ts", "utf8");

// Find all attacks with text via regex on lines
const lines = content.split("\n");
const attacks = [];
for (const line of lines) {
  if (!line.includes('{ kind: "pokemon"')) continue;
  const cm = line.match(/name: "([^"]+)"/);
  if (!cm) continue;
  const cardName = cm[1];
  const attackPattern =
    /\{ name: "([^"]+)", cost: \[([^\]]+)\](?:, damage: (\d+))?(?:, damageSuffix: "([^"]+)")?(?:, text: "([^"]+)")? \}/g;
  let m;
  while ((m = attackPattern.exec(line)) !== null) {
    if (m[5]) {
      attacks.push({
        card: cardName,
        attack: m[1],
        damage: m[3] || "",
        suffix: m[4] || "",
        text: m[5],
      });
    }
  }
}

console.log("Total attacks with text:", attacks.length);

const PATTERNS = [
  { kind: "multi-coin-per-face", re: /Lancez (\d+|une|deux|trois|quatre) pièces?\.\s*Cette attaque inflige \d+ dégâts pour chaque côté face\./i },
  { kind: "all-coins-bonus", re: /Lancez (\d+|une|deux|trois|quatre) pièces?\.\s*Si toutes sont côté face, cette attaque inflige (\d+) dégâts de plus\./i },
  { kind: "flip-until-tails-damage", re: /Lancez une pièce jusqu'à ce que vous obteniez pile\.\s*Cette attaque inflige (\d+) dégâts pour chaque côté face\./i },
  { kind: "tails-fail", re: /Lancez une pièce\.\s*Si c'est pile, cette attaque ne fait rien\./i },
  { kind: "single-coin-bonus-or-recoil", re: /Lancez une pièce\.\s*Si c'est face, cette attaque inflige (\d+) dégâts de plus\.\s*Si c'est pile, ce Pokémon s'inflige aussi (\d+) dégâts\./i },
  { kind: "single-coin-bonus", re: /Lancez une pièce\.\s*Si c'est face, cette attaque inflige (\d+) dégâts de plus\./i },
  { kind: "inflict-status-coin", re: /Lancez une pièce\.\s*Si c'est face, le Pokémon (?:Actif de votre adversaire|Défenseur) est maintenant (Empoisonné|Endormi|Paralysé|Brûlé|Confus)\./i },
  { kind: "inflict-status", re: /Le Pokémon (?:Actif de votre adversaire|Défenseur) est maintenant (Empoisonné|Endormi|Paralysé|Brûlé|Confus)\./i },
  { kind: "self-heal", re: /Soignez (\d+) dégâts de ce Pokémon\./i },
  { kind: "drain-heal", re: /Soignez ce Pokémon du nombre de dégâts que vous avez infligés au Pokémon Actif de votre adversaire\./i },
  { kind: "self-damage", re: /Ce Pokémon s'inflige aussi (\d+) dégâts\./i },
  { kind: "self-bench-damage", re: /Cette attaque inflige aussi (\d+) dégâts à un de vos Pokémon de Banc\./i },
  { kind: "bench-damage-all-opp", re: /Cette attaque inflige aussi (\d+) dégâts à chaque Pokémon de Banc de votre adversaire\./i },
  { kind: "random-hit-opp-bench", re: /Cette attaque inflige (\d+) dégâts à un des Pokémon de Banc de votre adversaire\./i },
  { kind: "random-hit-opp", re: /Cette attaque inflige (\d+) dégâts à l'un des Pokémon de votre adversaire\./i },
  { kind: "multi-random-hit-opp", re: /Un des Pokémon de votre adversaire est choisi au hasard (\d+) fois/i },
  { kind: "bonus-if-opp-hurt", re: /Si le Pokémon Actif de votre adversaire a subi des dégâts, cette attaque inflige (\d+) dégâts de plus\./i },
  { kind: "bonus-if-opp-status", re: /Si le Pokémon Actif de votre adversaire est (Empoisonné|Endormi|Paralysé|Brûlé|Confus), cette attaque inflige (\d+) dégâts de plus\./i },
  { kind: "bonus-if-self-hurt", re: /Si ce Pokémon a subi des dégâts, cette attaque inflige (\d+) dégâts de plus\./i },
  { kind: "scaling-by-opp-energies", re: /Cette attaque inflige (\d+) dégâts (?:de plus |supplémentaires )?pour chaque Énergie attachée au Pokémon Actif de votre adversaire/i },
  { kind: "scaling-by-bench-count", re: /Cette attaque inflige (\d+) dégâts pour chacun de vos Pokémon de Banc\./i },
  { kind: "scaling-by-typed-bench", re: /Cette attaque inflige (\d+) dégâts pour chaque Pokémon \{(\w)\} sur votre Banc\./i },
  { kind: "scaling-by-named-bench", re: /Cette attaque inflige (\d+) dégâts supplémentaires pour chaque (\w+) sur votre Banc\./i },
  { kind: "discard-self-all-energies", re: /Défaussez toutes les Énergies de ce Pokémon\./i },
  { kind: "discard-self-energy", re: /Défaussez (\d+|une) Énergies? \{(\w)\} de ce Pokémon\./i },
  { kind: "discard-opp-energy-coin", re: /Lancez une pièce\.\s*Si c'est face, défaussez au hasard une Énergie du Pokémon Actif de votre adversaire\./i },
  { kind: "discard-opp-energy", re: /Défaussez au hasard une Énergie du Pokémon Actif de votre adversaire\./i },
  { kind: "self-attach-energy", re: /Prenez une Énergie \{(\w)\} de votre zone Énergie et attachez-la à ce Pokémon\./i },
  { kind: "bench-attach-energy", re: /Prenez une Énergie \{(\w)\} de votre zone Énergie et attachez-la à l'un de vos Pokémon \{(\w)\} de Banc\./i },
  { kind: "self-swap", re: /Échangez ce Pokémon contre l'un de vos Pokémon de Banc\./i },
  { kind: "draw", re: /Piochez une carte\./i },
  { kind: "search-typed-to-hand", re: /Ajoutez au hasard un Pokémon \{(\w)\} de votre deck à votre main\./i },
  { kind: "search-named-to-bench", re: /Placez une carte (\S+?) au hasard de votre deck sur votre Banc\./i },
  { kind: "discard-opp-hand-random", re: /Lancez une pièce\.\s*Si c'est face, défaussez au hasard une carte de la main de votre adversaire\./i },
  { kind: "no-supporter-opp-next-turn", re: /Votre adversaire ne peut pas jouer de carte Supporter de sa main lors son prochain tour\./i },
  { kind: "bonus-by-extra-energies", re: /Si ce Pokémon a au moins (\d+) Énergies? \{(\w)\} de plus, cette attaque inflige (\d+) dégâts? supplémentaires?\./i },
  { kind: "multi-coin-attach-bench", re: /Lancez (\d+|une|deux|trois|quatre) pièces?\.\s*Prenez le même nombre d'Énergies? \{(\w)\}[^.]*?et attachez-les? à vos Pokémon \{(\w)\} de Banc/i },
  { kind: "defender-no-retreat-next-turn", re: /Pendant le prochain tour de votre adversaire, le Pokémon Défenseur ne peut pas battre en retraite\./i },
  { kind: "defender-no-attack-next-turn-coin", re: /Lancez une pièce\.\s*Si c'est face, le Pokémon Défenseur ne peut pas attaquer pendant le prochain tour de votre adversaire\./i },
  { kind: "defender-no-attack-next-turn", re: /Pendant le prochain tour de votre adversaire, le Pokémon Défenseur ne peut pas attaquer\./i },
  { kind: "defender-attack-penalty-next-turn", re: /Pendant le prochain tour de votre adversaire, les attaques utilisées par le Pokémon Défenseur infligent (?:−|-) ?(\d+) dégâts?\./i },
  { kind: "self-damage-reduction-next-turn", re: /Pendant le prochain tour de votre adversaire, ce Pokémon subit (?:−|-) ?(\d+) dégâts? provenant des attaques\./i },
  { kind: "self-invulnerable-next-turn", re: /Lancez une pièce\.\s*Si c'est face, pendant le prochain tour de votre adversaire, évitez tous les dégâts et les effets d'attaques infligés à ce Pokémon\./i },
  { kind: "shuffle-opp-active-to-deck", re: /Lancez une pièce\.\s*Si c'est face, votre adversaire mélange son Pokémon Actif (?:avec|dans) son deck\./i },
  { kind: "copy-opp-attack", re: /Choisissez l'une des attaques des Pokémon de votre adversaire et utilisez-la en tant que cette attaque/i },
  { kind: "force-opp-switch", re: /Échangez le Pokémon Actif de votre adversaire avec l'un de ses Pokémon de Banc\./i },
];

const unhandled = [];
const partial = [];
for (const a of attacks) {
  let t = a.text;
  const matchedKinds = [];
  for (const p of PATTERNS) {
    if (p.re.test(t)) {
      matchedKinds.push(p.kind);
      t = t.replace(p.re, " ");
    }
  }
  const leftover = t.replace(/\s+/g, " ").trim();
  if (matchedKinds.length === 0) {
    unhandled.push({ ...a, leftover });
  } else if (leftover.length > 5) {
    partial.push({ ...a, matched: matchedKinds, leftover });
  }
}

console.log(`\n=== UNHANDLED (${unhandled.length}) ===`);
const seen = new Set();
for (const a of unhandled) {
  if (seen.has(a.text)) continue;
  seen.add(a.text);
  console.log(`• ${a.card} - ${a.attack} (${a.damage}${a.suffix})`);
  console.log(`  "${a.text}"`);
}

console.log(`\n=== PARTIAL (${partial.length}) — leftover non parsé ===`);
const seenP = new Set();
for (const a of partial) {
  if (seenP.has(a.leftover)) continue;
  seenP.add(a.leftover);
  console.log(`• ${a.card} - ${a.attack}`);
  console.log(`  full: "${a.text}"`);
  console.log(`  matched: ${a.matched.join(", ")}`);
  console.log(`  leftover: "${a.leftover}"`);
}
