// Pokémon Génération 1 — les 151 cartes réparties sur 4 packs thématiques.
//   Dracaufeu  : Feu / Combat / Sol / Roche / Vol-Normal musclés        (39)
//   Tortank    : Eau / Glace                                             (34)
//   Florizarre : Plante / Insecte / Poison                               (38)
//   Mewtwo     : Psy / Spectre / Électrique / Dragon / Normal spéciaux   (40)
// + 6 énergies de base partagées entre tous les packs.

import type { PokemonCardData } from "./types";

const POKEMON: PokemonCardData[] = [
  // ═══════════════════════════ PACK DRACAUFEU (39) ═══════════════════════════
  // Ligne Salamèche
  { kind: "pokemon", id: "g1-004", number: 4, name: "Salamèche", type: "fire", stage: "basic", hp: 50, weakness: "water", retreatCost: 1,
    attacks: [{ name: "Griffe", cost: ["colorless"], damage: 10 }, { name: "Flammèche", cost: ["fire", "colorless"], damage: 30, text: "Défausse 1 Énergie Feu attachée." }],
    rarity: "common", art: "🦎", pack: "charizard" },
  { kind: "pokemon", id: "g1-005", number: 5, name: "Reptincel", type: "fire", stage: "stage1", evolvesFrom: "Salamèche", hp: 80, weakness: "water", retreatCost: 1,
    attacks: [{ name: "Tranche", cost: ["colorless", "colorless", "colorless"], damage: 30 }, { name: "Lance-Flammes", cost: ["fire", "fire", "colorless"], damage: 50, text: "Défausse 1 Énergie Feu attachée." }],
    rarity: "uncommon", art: "🔥", pack: "charizard" },
  { kind: "pokemon", id: "g1-006", number: 6, name: "Dracaufeu", type: "fire", stage: "stage2", evolvesFrom: "Reptincel", hp: 120, weakness: "water", resistance: "fighting", retreatCost: 3,
    ability: { name: "Brûlure d'Énergie", text: "Toute Énergie attachée à Dracaufeu compte comme Énergie Feu." },
    attacks: [{ name: "Tempête de Feu", cost: ["fire", "fire", "fire", "fire"], damage: 100, text: "Défausse 2 Énergies attachées à Dracaufeu.", effects: [{ kind: "discard-energy", count: 2 }] }],
    rarity: "holo-rare", art: "🐉", pack: "charizard" },

  // Oiseaux normaux/vol
  { kind: "pokemon", id: "g1-016", number: 16, name: "Roucool", type: "colorless", stage: "basic", hp: 40, weakness: "lightning", resistance: "fighting", retreatCost: 1,
    attacks: [{ name: "Vent", cost: ["colorless"], damage: 10 }],
    rarity: "common", art: "🐦", pack: "charizard" },
  { kind: "pokemon", id: "g1-017", number: 17, name: "Roucoups", type: "colorless", stage: "stage1", evolvesFrom: "Roucool", hp: 60, weakness: "lightning", resistance: "fighting", retreatCost: 1,
    attacks: [{ name: "Volte", cost: ["colorless", "colorless"], damage: 20 }, { name: "Pic Tornade", cost: ["colorless", "colorless", "colorless"], damage: 30 }],
    rarity: "uncommon", art: "🦅", pack: "charizard" },
  { kind: "pokemon", id: "g1-018", number: 18, name: "Roucarnage", type: "colorless", stage: "stage2", evolvesFrom: "Roucoups", hp: 80, weakness: "lightning", resistance: "fighting", retreatCost: 0,
    attacks: [{ name: "Cyclone", cost: ["colorless", "colorless", "colorless"], damage: 40, text: "Échange un Pokémon de Banc adverse avec l'Actif." }],
    rarity: "holo-rare", art: "🦅", pack: "charizard" },
  { kind: "pokemon", id: "g1-021", number: 21, name: "Piafabec", type: "colorless", stage: "basic", hp: 40, weakness: "lightning", resistance: "fighting", retreatCost: 1,
    attacks: [{ name: "Picpic", cost: ["colorless"], damage: 10 }],
    rarity: "common", art: "🐤", pack: "charizard" },
  { kind: "pokemon", id: "g1-022", number: 22, name: "Rapasdepic", type: "colorless", stage: "stage1", evolvesFrom: "Piafabec", hp: 70, weakness: "lightning", resistance: "fighting", retreatCost: 1,
    attacks: [{ name: "Coup de Bec", cost: ["colorless", "colorless"], damage: 20 }, { name: "Miroir Aérien", cost: ["colorless", "colorless", "colorless"], damage: 40 }],
    rarity: "rare", art: "🦅", pack: "charizard" },

  // Sol / Sable
  { kind: "pokemon", id: "g1-027", number: 27, name: "Sabelette", type: "fighting", stage: "basic", hp: 40, weakness: "grass", resistance: "lightning", retreatCost: 1,
    attacks: [{ name: "Coup de Griffes", cost: ["fighting"], damage: 10 }, { name: "Sable Volant", cost: ["fighting", "colorless"], damage: 10, text: "Lance une pièce. Face, le Pokémon Adverse ne peut pas attaquer le tour suivant." }],
    rarity: "common", art: "🦔", pack: "charizard" },
  { kind: "pokemon", id: "g1-028", number: 28, name: "Sablaireau", type: "fighting", stage: "stage1", evolvesFrom: "Sabelette", hp: 70, weakness: "grass", resistance: "lightning", retreatCost: 1,
    attacks: [{ name: "Coup de Griffes", cost: ["fighting"], damage: 20 }, { name: "Pic", cost: ["fighting", "fighting", "colorless"], damage: 40 }],
    rarity: "uncommon", art: "🦔", pack: "charizard" },

  // Goupix
  { kind: "pokemon", id: "g1-037", number: 37, name: "Goupix", type: "fire", stage: "basic", hp: 50, weakness: "water", retreatCost: 1,
    attacks: [{ name: "Vapeur Brûlante", cost: ["fire", "fire"], damage: 20, text: "Lance une pièce. Pile, le Pokémon Adverse est Brûlé." }],
    rarity: "common", art: "🦊", pack: "charizard" },
  { kind: "pokemon", id: "g1-038", number: 38, name: "Feunard", type: "fire", stage: "stage1", evolvesFrom: "Goupix", hp: 80, weakness: "water", retreatCost: 1,
    attacks: [{ name: "Aura Mystique", cost: ["fire"], text: "Le Pokémon Adverse est Confus." }, { name: "Geyser de Feu", cost: ["fire", "fire", "fire", "fire"], damage: 80, text: "Défausse 2 Énergies Feu attachées." }],
    rarity: "holo-rare", art: "🦊", pack: "charizard" },

  // Taupiqueur
  { kind: "pokemon", id: "g1-050", number: 50, name: "Taupiqueur", type: "fighting", stage: "basic", hp: 30, weakness: "grass", resistance: "lightning", retreatCost: 1,
    attacks: [{ name: "Frappe-Tête", cost: ["fighting"], damage: 10 }, { name: "Tunnel", cost: ["fighting", "fighting"], damage: 20, text: "Avant cette attaque, évite tous les dégâts." }],
    rarity: "common", art: "⛏️", pack: "charizard" },
  { kind: "pokemon", id: "g1-051", number: 51, name: "Triopikeur", type: "fighting", stage: "stage1", evolvesFrom: "Taupiqueur", hp: 70, weakness: "grass", resistance: "lightning", retreatCost: 1,
    attacks: [{ name: "Coup de Boule", cost: ["fighting"], damage: 20 }, { name: "Tremblement", cost: ["fighting", "fighting", "fighting"], damage: 50, text: "Inflige 10 dégâts à chacun de tes Pokémon de Banc." }],
    rarity: "uncommon", art: "⛏️", pack: "charizard" },

  // Férosinge
  { kind: "pokemon", id: "g1-056", number: 56, name: "Férosinge", type: "fighting", stage: "basic", hp: 40, weakness: "psychic", retreatCost: 1,
    attacks: [{ name: "Vis Caisse", cost: ["fighting"], damage: 20, text: "Inflige 10 dégâts à Férosinge." }],
    rarity: "common", art: "🐒", pack: "charizard" },
  { kind: "pokemon", id: "g1-057", number: 57, name: "Colossinge", type: "fighting", stage: "stage1", evolvesFrom: "Férosinge", hp: 70, weakness: "psychic", retreatCost: 2,
    attacks: [{ name: "Coup de Tête", cost: ["fighting"], damage: 10 }, { name: "Combo Coup", cost: ["fighting", "colorless"], damage: 30, damageSuffix: "x", text: "Lance 2 pièces, 30× faces." }],
    rarity: "rare", art: "🦍", pack: "charizard" },

  // Caninos
  { kind: "pokemon", id: "g1-058", number: 58, name: "Caninos", type: "fire", stage: "basic", hp: 50, weakness: "water", retreatCost: 1,
    attacks: [{ name: "Morsure", cost: ["fire"], damage: 10 }, { name: "Roulade", cost: ["fire", "colorless"], damage: 20 }],
    rarity: "common", art: "🐕", pack: "charizard" },
  { kind: "pokemon", id: "g1-059", number: 59, name: "Arcanin", type: "fire", stage: "stage1", evolvesFrom: "Caninos", hp: 100, weakness: "water", retreatCost: 2,
    attacks: [{ name: "Flammèche", cost: ["fire", "colorless"], damage: 30 }, { name: "Buster de Feu", cost: ["fire", "fire", "fire"], damage: 80, text: "Défausse 2 Énergies Feu attachées." }],
    rarity: "holo-rare", art: "🐕", pack: "charizard" },

  // Machoc
  { kind: "pokemon", id: "g1-066", number: 66, name: "Machoc", type: "fighting", stage: "basic", hp: 50, weakness: "psychic", retreatCost: 1,
    attacks: [{ name: "Coup Bas", cost: ["fighting"], damage: 10 }, { name: "Frappe Atlas", cost: ["fighting", "fighting"], damage: 20 }],
    rarity: "common", art: "💪", pack: "charizard" },
  { kind: "pokemon", id: "g1-067", number: 67, name: "Machopeur", type: "fighting", stage: "stage1", evolvesFrom: "Machoc", hp: 80, weakness: "psychic", retreatCost: 2,
    attacks: [{ name: "Poing Karaté", cost: ["fighting", "colorless"], damage: 20 }, { name: "Piqué Plongé", cost: ["fighting", "fighting", "colorless"], damage: 40 }],
    rarity: "uncommon", art: "💪", pack: "charizard" },
  { kind: "pokemon", id: "g1-068", number: 68, name: "Mackogneur", type: "fighting", stage: "stage2", evolvesFrom: "Machopeur", hp: 100, weakness: "psychic", retreatCost: 3,
    ability: { name: "Riposte", text: "Quand un Pokémon attaquant blesse Mackogneur, il subit 10 dégâts." },
    attacks: [{ name: "Frappe Sismique", cost: ["fighting", "fighting", "colorless", "colorless"], damage: 60 }],
    rarity: "holo-rare", art: "💪", pack: "charizard" },

  // Racaillou
  { kind: "pokemon", id: "g1-074", number: 74, name: "Racaillou", type: "fighting", stage: "basic", hp: 50, weakness: "grass", resistance: "lightning", retreatCost: 1,
    attacks: [{ name: "Coup de Poing", cost: ["fighting"], damage: 10 }],
    rarity: "common", art: "🪨", pack: "charizard" },
  { kind: "pokemon", id: "g1-075", number: 75, name: "Gravalanch", type: "fighting", stage: "stage1", evolvesFrom: "Racaillou", hp: 70, weakness: "grass", resistance: "lightning", retreatCost: 2,
    attacks: [{ name: "Roulade", cost: ["fighting", "colorless"], damage: 30 }, { name: "Éboulement", cost: ["fighting", "fighting", "colorless"], damage: 40 }],
    rarity: "uncommon", art: "🪨", pack: "charizard" },
  { kind: "pokemon", id: "g1-076", number: 76, name: "Grolem", type: "fighting", stage: "stage2", evolvesFrom: "Gravalanch", hp: 90, weakness: "grass", resistance: "lightning", retreatCost: 3,
    attacks: [{ name: "Tremblement", cost: ["fighting", "fighting", "colorless"], damage: 40, text: "Inflige 10 dégâts à chacun de tes Pokémon de Banc." }, { name: "Damoclès", cost: ["fighting", "fighting", "fighting", "colorless"], damage: 80, text: "Grolem se fait 20 dégâts." }],
    rarity: "holo-rare", art: "🪨", pack: "charizard" },

  // Ponyta
  { kind: "pokemon", id: "g1-077", number: 77, name: "Ponyta", type: "fire", stage: "basic", hp: 40, weakness: "water", retreatCost: 0,
    attacks: [{ name: "Piétinement", cost: ["fire"], damage: 20 }],
    rarity: "common", art: "🐴", pack: "charizard" },
  { kind: "pokemon", id: "g1-078", number: 78, name: "Galopa", type: "fire", stage: "stage1", evolvesFrom: "Ponyta", hp: 70, weakness: "water", retreatCost: 0,
    attacks: [{ name: "Détourne-Flamme", cost: ["fire"], damage: 20, text: "Lance une pièce. Pile, cette attaque ne fait rien." }, { name: "Agilité", cost: ["fire", "colorless"], damage: 20, text: "Lance une pièce. Face, ignore les effets/dégâts du tour adverse." }],
    rarity: "uncommon", art: "🐴", pack: "charizard" },

  // Onix
  { kind: "pokemon", id: "g1-095", number: 95, name: "Onix", type: "fighting", stage: "basic", hp: 90, weakness: "grass", retreatCost: 3,
    attacks: [{ name: "Riposte", cost: ["fighting"], text: "Lance une pièce. Face, inflige 10 dégâts." }, { name: "Frappe", cost: ["fighting", "fighting", "fighting"], damage: 30 }],
    rarity: "uncommon", art: "🐍", pack: "charizard" },

  // Osselait
  { kind: "pokemon", id: "g1-104", number: 104, name: "Osselait", type: "fighting", stage: "basic", hp: 50, weakness: "grass", resistance: "lightning", retreatCost: 1,
    attacks: [{ name: "Os Boomerang", cost: ["fighting"], damage: 10 }],
    rarity: "common", art: "🦴", pack: "charizard" },
  { kind: "pokemon", id: "g1-105", number: 105, name: "Ossatueur", type: "fighting", stage: "stage1", evolvesFrom: "Osselait", hp: 70, weakness: "grass", resistance: "lightning", retreatCost: 1,
    attacks: [{ name: "Os Boomerang", cost: ["fighting", "colorless"], damage: 30 }, { name: "Massue Os", cost: ["fighting", "fighting"], damage: 20, text: "Lance une pièce. Face, le Pokémon Adverse est Paralysé." }],
    rarity: "rare", art: "🦴", pack: "charizard" },

  // Kicklee / Tygnon
  { kind: "pokemon", id: "g1-106", number: 106, name: "Kicklee", type: "fighting", stage: "basic", hp: 60, weakness: "psychic", retreatCost: 2,
    attacks: [{ name: "Pied Sauté", cost: ["fighting"], damage: 20 }, { name: "Pied Voltige", cost: ["fighting", "fighting", "colorless"], damage: 50, text: "Lance une pièce. Pile, cette attaque ne fait rien." }],
    rarity: "rare", art: "🦵", pack: "charizard" },
  { kind: "pokemon", id: "g1-107", number: 107, name: "Tygnon", type: "fighting", stage: "basic", hp: 70, weakness: "psychic", retreatCost: 2,
    attacks: [{ name: "Direct", cost: ["fighting"], damage: 20 }, { name: "Coup Spécial", cost: ["fighting", "fighting", "colorless"], damage: 40 }],
    rarity: "holo-rare", art: "🥊", pack: "charizard" },

  // Rhinocorne
  { kind: "pokemon", id: "g1-111", number: 111, name: "Rhinocorne", type: "fighting", stage: "basic", hp: 70, weakness: "grass", resistance: "lightning", retreatCost: 2,
    attacks: [{ name: "Coup de Corne", cost: ["fighting", "colorless"], damage: 20 }, { name: "Bélier", cost: ["fighting", "fighting", "colorless"], damage: 30, text: "Rhinocorne se fait 10 dégâts." }],
    rarity: "common", art: "🦏", pack: "charizard" },
  { kind: "pokemon", id: "g1-112", number: 112, name: "Rhinoféros", type: "fighting", stage: "stage1", evolvesFrom: "Rhinocorne", hp: 100, weakness: "grass", resistance: "lightning", retreatCost: 3,
    attacks: [{ name: "Cornadure", cost: ["fighting", "fighting", "colorless"], damage: 40 }, { name: "Roulade", cost: ["fighting", "fighting", "fighting", "colorless"], damage: 70 }],
    rarity: "rare", art: "🦏", pack: "charizard" },

  // Kangourex (basic unique)
  { kind: "pokemon", id: "g1-115", number: 115, name: "Kangourex", type: "colorless", stage: "basic", hp: 90, weakness: "fighting", retreatCost: 3,
    attacks: [{ name: "Coup de Pied", cost: ["colorless", "colorless"], damage: 20 }, { name: "Méga-Coup d'Pince", cost: ["colorless", "colorless", "colorless", "colorless"], damage: 30, damageSuffix: "x", text: "Lance 2 pièces, 30× faces." }],
    rarity: "rare", art: "🦘", pack: "charizard" },

  // Magmar
  { kind: "pokemon", id: "g1-126", number: 126, name: "Magmar", type: "fire", stage: "basic", hp: 70, weakness: "water", retreatCost: 2,
    attacks: [{ name: "Fire Punch", cost: ["fire", "colorless"], damage: 30 }, { name: "Explosion de Flammes", cost: ["fire", "fire", "colorless"], damage: 50, text: "Défausse 1 Énergie Feu attachée." }],
    rarity: "rare", art: "🔥", pack: "charizard" },

  // Tauros
  { kind: "pokemon", id: "g1-128", number: 128, name: "Tauros", type: "colorless", stage: "basic", hp: 60, weakness: "fighting", retreatCost: 1,
    attacks: [{ name: "Coup de Corne", cost: ["colorless", "colorless", "colorless"], damage: 20, damageSuffix: "+", text: "+10 par marqueur de dégât déjà sur Tauros." }, { name: "Charge", cost: ["colorless", "colorless", "colorless", "colorless"], damage: 30 }],
    rarity: "rare", art: "🐂", pack: "charizard" },

  // Pyroli (évolution Évoli → Feu)
  { kind: "pokemon", id: "g1-136", number: 136, name: "Pyroli", type: "fire", stage: "stage1", evolvesFrom: "Évoli", hp: 70, weakness: "water", retreatCost: 1,
    attacks: [{ name: "Morsure de Feu", cost: ["fire"], damage: 20 }, { name: "Lance-Flammes", cost: ["fire", "fire", "colorless"], damage: 60, text: "Défausse 1 Énergie Feu attachée." }],
    rarity: "holo-rare", art: "🦊", pack: "charizard" },

  // Aérodactyl (fossile rare)
  { kind: "pokemon", id: "g1-142", number: 142, name: "Aérodactyl", type: "fighting", stage: "basic", hp: 60, weakness: "grass", resistance: "lightning", retreatCost: 2,
    ability: { name: "Cri Préhistorique", text: "Aucune évolution du Set Fossile n'est possible tant qu'Aérodactyl est en jeu (cosmétique pour l'instant)." },
    attacks: [{ name: "Coup d'Aile", cost: ["fighting", "colorless", "colorless"], damage: 30 }],
    rarity: "holo-rare", art: "🦅", pack: "charizard" },

  // Sulfura (légendaire)
  { kind: "pokemon", id: "g1-146", number: 146, name: "Sulfura", type: "fire", stage: "basic", hp: 70, weakness: "water", resistance: "fighting", retreatCost: 2,
    attacks: [{ name: "Geyser de Feu", cost: ["fire", "fire", "colorless"], damage: 40, text: "Lance une pièce. Pile, défausse 1 Énergie Feu." }, { name: "Plume Torride", cost: ["fire", "fire", "colorless", "colorless"], damage: 80, text: "Défausse 2 Énergies Feu attachées." }],
    rarity: "holo-rare", art: "🔥", pack: "charizard" },

  // ═══════════════════════════ PACK TORTANK (34) ═══════════════════════════
  // Ligne Carapuce
  { kind: "pokemon", id: "g1-007", number: 7, name: "Carapuce", type: "water", stage: "basic", hp: 40, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Bulle d'O", cost: ["water"], damage: 10, text: "Lance une pièce. Face, le Pokémon Adverse est Paralysé.", effects: [{ kind: "apply-status", target: "opponent", status: "paralyzed", coin: "heads" }] }, { name: "Repli", cost: ["water", "colorless"], text: "Lance une pièce. Face, ignore les dégâts pendant le tour adverse." }],
    rarity: "common", art: "🐢", pack: "blastoise" },
  { kind: "pokemon", id: "g1-008", number: 8, name: "Carabaffe", type: "water", stage: "stage1", evolvesFrom: "Carapuce", hp: 80, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Morsure", cost: ["water"], damage: 20 }, { name: "Détourne-Eau", cost: ["water", "colorless"], damage: 10, text: "Lance une pièce. Face, ignore les dégâts pendant le tour adverse." }],
    rarity: "uncommon", art: "🐢", pack: "blastoise" },
  { kind: "pokemon", id: "g1-009", number: 9, name: "Tortank", type: "water", stage: "stage2", evolvesFrom: "Carabaffe", hp: 100, weakness: "lightning", retreatCost: 3,
    ability: { name: "Danse Pluie", text: "Tu peux attacher autant d'Énergies Eau que tu veux à tes Pokémon ⚡ Eau." },
    attacks: [{ name: "Hydrocanon", cost: ["water", "water", "water"], damage: 40, damageSuffix: "+", text: "+10 par Énergie Eau supplémentaire (max +20)." }],
    rarity: "holo-rare", art: "🌊", pack: "blastoise" },

  // Psykokwak
  { kind: "pokemon", id: "g1-054", number: 54, name: "Psykokwak", type: "water", stage: "basic", hp: 50, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Picpic", cost: ["water"], damage: 10 }, { name: "Mal de Tête", cost: ["water", "colorless"], text: "L'adversaire ne peut jouer aucun Dresseur le tour suivant." }],
    rarity: "common", art: "🦆", pack: "blastoise" },
  { kind: "pokemon", id: "g1-055", number: 55, name: "Akwakwak", type: "water", stage: "stage1", evolvesFrom: "Psykokwak", hp: 70, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Canardeau", cost: ["water"], damage: 20 }, { name: "Jet d'Eau", cost: ["water", "water"], damage: 20, damageSuffix: "+", text: "+10 par Énergie Eau supplémentaire." }],
    rarity: "uncommon", art: "🦆", pack: "blastoise" },

  // Ptitard
  { kind: "pokemon", id: "g1-060", number: 60, name: "Ptitard", type: "water", stage: "basic", hp: 40, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Bulles d'O", cost: ["water"], damage: 10 }],
    rarity: "common", art: "🐸", pack: "blastoise" },
  { kind: "pokemon", id: "g1-061", number: 61, name: "Têtarte", type: "water", stage: "stage1", evolvesFrom: "Ptitard", hp: 60, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Hypnose", cost: ["water"], text: "Le Pokémon Adverse est Endormi.", effects: [{ kind: "apply-status", target: "opponent", status: "asleep" }] }, { name: "Bulles d'O", cost: ["water", "water"], damage: 20 }],
    rarity: "uncommon", art: "🐸", pack: "blastoise" },
  { kind: "pokemon", id: "g1-062", number: 62, name: "Tartard", type: "water", stage: "stage2", evolvesFrom: "Têtarte", hp: 90, weakness: "lightning", retreatCost: 3,
    attacks: [{ name: "Direct", cost: ["fighting", "colorless"], damage: 30 }, { name: "Hydrocanon", cost: ["water", "water", "colorless"], damage: 40 }],
    rarity: "holo-rare", art: "🐸", pack: "blastoise" },

  // Tentacool
  { kind: "pokemon", id: "g1-072", number: 72, name: "Tentacool", type: "water", stage: "basic", hp: 30, weakness: "lightning", retreatCost: 0,
    attacks: [{ name: "Cingle", cost: ["water"], damage: 10 }],
    rarity: "common", art: "🪼", pack: "blastoise" },
  { kind: "pokemon", id: "g1-073", number: 73, name: "Tentacruel", type: "water", stage: "stage1", evolvesFrom: "Tentacool", hp: 60, weakness: "lightning", retreatCost: 0,
    attacks: [{ name: "Tentacule", cost: ["water"], damage: 10, damageSuffix: "x", text: "Lance 3 pièces, 10× faces." }, { name: "Poison Jelly", cost: ["water", "water", "colorless"], damage: 30, text: "Lance une pièce. Face, le Pokémon Adverse est Empoisonné." }],
    rarity: "rare", art: "🪼", pack: "blastoise" },

  // Ramoloss
  { kind: "pokemon", id: "g1-079", number: 79, name: "Ramoloss", type: "water", stage: "basic", hp: 50, weakness: "lightning", retreatCost: 2,
    attacks: [{ name: "Lecher", cost: ["colorless"], damage: 10, text: "Lance une pièce. Face, le Pokémon Adverse est Paralysé." }, { name: "Bâille", cost: ["water", "colorless"], text: "Le Pokémon Adverse est Endormi." }],
    rarity: "common", art: "🦛", pack: "blastoise" },
  { kind: "pokemon", id: "g1-080", number: 80, name: "Flagadoss", type: "water", stage: "stage1", evolvesFrom: "Ramoloss", hp: 80, weakness: "lightning", retreatCost: 2,
    attacks: [{ name: "Pincer", cost: ["water", "colorless"], damage: 20 }, { name: "Tempête Psy", cost: ["water", "water", "psychic"], damage: 40 }],
    rarity: "rare", art: "🐚", pack: "blastoise" },

  // Otaria
  { kind: "pokemon", id: "g1-086", number: 86, name: "Otaria", type: "water", stage: "basic", hp: 50, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Aurore Blanche", cost: ["water"], damage: 10 }],
    rarity: "common", art: "🦭", pack: "blastoise" },
  { kind: "pokemon", id: "g1-087", number: 87, name: "Lamantine", type: "water", stage: "stage1", evolvesFrom: "Otaria", hp: 80, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Onde Froide", cost: ["water", "colorless"], damage: 30 }, { name: "Glaciation", cost: ["water", "water", "colorless"], damage: 40, text: "Lance une pièce. Face, le Pokémon Adverse est Paralysé." }],
    rarity: "rare", art: "🦭", pack: "blastoise" },

  // Kokiyas
  { kind: "pokemon", id: "g1-090", number: 90, name: "Kokiyas", type: "water", stage: "basic", hp: 30, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Bulles d'O", cost: ["water"], damage: 10 }],
    rarity: "common", art: "🐚", pack: "blastoise" },
  { kind: "pokemon", id: "g1-091", number: 91, name: "Crustabri", type: "water", stage: "stage1", evolvesFrom: "Kokiyas", hp: 70, weakness: "lightning", retreatCost: 3,
    attacks: [{ name: "Pincer", cost: ["water"], damage: 20 }, { name: "Coquille", cost: ["water", "water", "colorless"], damage: 50, text: "Soigne 20 dégâts à Crustabri." }],
    rarity: "rare", art: "🐚", pack: "blastoise" },

  // Krabby
  { kind: "pokemon", id: "g1-098", number: 98, name: "Krabby", type: "water", stage: "basic", hp: 40, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Pince Rouille", cost: ["water"], damage: 10 }, { name: "Tac-Au-But", cost: ["water", "colorless"], damage: 20 }],
    rarity: "common", art: "🦀", pack: "blastoise" },
  { kind: "pokemon", id: "g1-099", number: 99, name: "Krabboss", type: "water", stage: "stage1", evolvesFrom: "Krabby", hp: 70, weakness: "lightning", retreatCost: 3,
    attacks: [{ name: "Pince-Marteau", cost: ["water", "colorless"], damage: 30 }, { name: "Frappe Ultra-Son", cost: ["water", "water", "colorless"], damage: 50 }],
    rarity: "uncommon", art: "🦀", pack: "blastoise" },

  // Hypotrempe
  { kind: "pokemon", id: "g1-116", number: 116, name: "Hypotrempe", type: "water", stage: "basic", hp: 40, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Cingle", cost: ["water"], damage: 10 }],
    rarity: "common", art: "🐉", pack: "blastoise" },
  { kind: "pokemon", id: "g1-117", number: 117, name: "Hypocéan", type: "water", stage: "stage1", evolvesFrom: "Hypotrempe", hp: 70, weakness: "lightning", retreatCost: 2,
    attacks: [{ name: "Pic Cornu", cost: ["water", "water"], damage: 30 }, { name: "Agilité", cost: ["water", "water", "colorless"], damage: 20, text: "Face, ignore les dégâts adverses." }],
    rarity: "rare", art: "🌊", pack: "blastoise" },

  // Poissirène
  { kind: "pokemon", id: "g1-118", number: 118, name: "Poissirène", type: "water", stage: "basic", hp: 40, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Pic Cornu", cost: ["water"], damage: 10 }, { name: "Cornadure", cost: ["water", "water"], damage: 30 }],
    rarity: "common", art: "🐠", pack: "blastoise" },
  { kind: "pokemon", id: "g1-119", number: 119, name: "Poissoroy", type: "water", stage: "stage1", evolvesFrom: "Poissirène", hp: 70, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Cornadure", cost: ["water", "water"], damage: 30 }, { name: "Bélier", cost: ["water", "water", "colorless"], damage: 40, text: "Poissoroy se fait 10 dégâts." }],
    rarity: "uncommon", art: "🐡", pack: "blastoise" },

  // Stari
  { kind: "pokemon", id: "g1-120", number: 120, name: "Stari", type: "water", stage: "basic", hp: 40, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Tourniquet", cost: ["water"], damage: 20, damageSuffix: "x", text: "Lance 2 pièces, 20× faces." }],
    rarity: "common", art: "⭐", pack: "blastoise" },
  { kind: "pokemon", id: "g1-121", number: 121, name: "Staross", type: "water", stage: "stage1", evolvesFrom: "Stari", hp: 60, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Recovery", cost: ["water"], text: "Défausse 1 Énergie. Soigne tous les dégâts de Staross." }, { name: "Tourniquet Stellaire", cost: ["water", "colorless"], damage: 40 }],
    rarity: "rare", art: "⭐", pack: "blastoise" },

  // Lippoutou (psychic/glace → classée eau thématiquement)
  { kind: "pokemon", id: "g1-124", number: 124, name: "Lippoutou", type: "water", stage: "basic", hp: 70, weakness: "psychic", retreatCost: 2,
    attacks: [{ name: "Mélodie Berçante", cost: ["water"], text: "Le Pokémon Adverse est Endormi." }, { name: "Tempête Glacée", cost: ["water", "water", "colorless"], damage: 30, text: "Lance une pièce. Face, le Pokémon Adverse est Paralysé." }],
    rarity: "rare", art: "💋", pack: "blastoise" },

  // Magicarpe → Léviator
  { kind: "pokemon", id: "g1-129", number: 129, name: "Magicarpe", type: "water", stage: "basic", hp: 30, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Saute", cost: ["water"], text: "Lance une pièce. Face, ignore les dégâts pendant le tour adverse." }, { name: "Trempette", cost: ["water", "colorless", "colorless"], damage: 10 }],
    rarity: "common", art: "🐟", pack: "blastoise" },
  { kind: "pokemon", id: "g1-130", number: 130, name: "Léviator", type: "water", stage: "stage1", evolvesFrom: "Magicarpe", hp: 100, weakness: "lightning", resistance: "fighting", retreatCost: 3,
    attacks: [{ name: "Bulles d'O", cost: ["water", "water", "water"], damage: 40 }, { name: "Colère", cost: ["water", "water", "water", "water"], damage: 50 }],
    rarity: "holo-rare", art: "🐉", pack: "blastoise" },

  // Lokhlass (iconic basic)
  { kind: "pokemon", id: "g1-131", number: 131, name: "Lokhlass", type: "water", stage: "basic", hp: 80, weakness: "lightning", retreatCost: 2,
    attacks: [{ name: "Chant", cost: ["water"], text: "Le Pokémon Adverse est Endormi." }, { name: "Laser Glace", cost: ["water", "water", "colorless"], damage: 30, text: "Lance une pièce. Face, le Pokémon Adverse est Paralysé." }],
    rarity: "holo-rare", art: "🦕", pack: "blastoise" },

  // Aquali (évolution Évoli)
  { kind: "pokemon", id: "g1-134", number: 134, name: "Aquali", type: "water", stage: "stage1", evolvesFrom: "Évoli", hp: 80, weakness: "lightning", retreatCost: 1,
    attacks: [{ name: "Pistolet à O", cost: ["water", "water"], damage: 30, damageSuffix: "+", text: "+10 par Énergie Eau supplémentaire." }, { name: "Saut Aquatique", cost: ["water", "water", "water"], damage: 40 }],
    rarity: "holo-rare", art: "🐬", pack: "blastoise" },

  // Fossiles aquatiques
  { kind: "pokemon", id: "g1-138", number: 138, name: "Amonita", type: "water", stage: "basic", hp: 40, weakness: "grass", retreatCost: 1,
    attacks: [{ name: "Coup Minuscule", cost: ["water"], damage: 10 }, { name: "Frappe Eau", cost: ["water", "water"], damage: 20 }],
    rarity: "common", art: "🐚", pack: "blastoise" },
  { kind: "pokemon", id: "g1-139", number: 139, name: "Amonistar", type: "water", stage: "stage1", evolvesFrom: "Amonita", hp: 70, weakness: "grass", retreatCost: 2,
    attacks: [{ name: "Tentacules", cost: ["water", "water"], damage: 30 }, { name: "Frappe Spirale", cost: ["water", "water", "colorless"], damage: 40 }],
    rarity: "uncommon", art: "🐚", pack: "blastoise" },
  { kind: "pokemon", id: "g1-140", number: 140, name: "Kabuto", type: "water", stage: "basic", hp: 30, weakness: "grass", retreatCost: 1,
    attacks: [{ name: "Cachette", cost: ["water"], text: "Lance une pièce. Face, ignore les dégâts adverses." }],
    rarity: "common", art: "🦞", pack: "blastoise" },
  { kind: "pokemon", id: "g1-141", number: 141, name: "Kabutops", type: "water", stage: "stage1", evolvesFrom: "Kabuto", hp: 70, weakness: "grass", retreatCost: 2,
    attacks: [{ name: "Tranche-Faux", cost: ["water", "water"], damage: 30 }, { name: "Frappe Sang-Froid", cost: ["water", "water", "colorless"], damage: 50 }],
    rarity: "rare", art: "🦀", pack: "blastoise" },

  // Artikodin (légendaire)
  { kind: "pokemon", id: "g1-144", number: 144, name: "Artikodin", type: "water", stage: "basic", hp: 70, weakness: "fighting", retreatCost: 2,
    attacks: [{ name: "Vent Glacial", cost: ["water", "water"], damage: 30 }, { name: "Laser Glace", cost: ["water", "water", "water"], damage: 50, text: "Lance une pièce. Face, le Pokémon Adverse est Paralysé." }],
    rarity: "holo-rare", art: "❄️", pack: "blastoise" },

  // ═══════════════════════════ PACK FLORIZARRE (38) ═══════════════════════════
  // Ligne Bulbizarre
  { kind: "pokemon", id: "g1-001", number: 1, name: "Bulbizarre", type: "grass", stage: "basic", hp: 40, weakness: "fire", retreatCost: 1,
    attacks: [{ name: "Vampigraine", cost: ["grass", "grass"], damage: 20, text: "Soigne 10 dégâts à Bulbizarre.", effects: [{ kind: "heal", amount: 10 }] }],
    rarity: "common", art: "🌱", pack: "venusaur" },
  { kind: "pokemon", id: "g1-002", number: 2, name: "Herbizarre", type: "grass", stage: "stage1", evolvesFrom: "Bulbizarre", hp: 60, weakness: "fire", retreatCost: 1,
    attacks: [{ name: "Vampigraine", cost: ["grass", "grass"], damage: 20, text: "Soigne 10 dégâts.", effects: [{ kind: "heal", amount: 10 }] }],
    rarity: "uncommon", art: "🌿", pack: "venusaur" },
  { kind: "pokemon", id: "g1-003", number: 3, name: "Florizarre", type: "grass", stage: "stage2", evolvesFrom: "Herbizarre", hp: 100, weakness: "fire", retreatCost: 2,
    ability: { name: "Transfert d'Énergie", text: "Déplace une Énergie Plante d'un de tes Pokémon à un autre." },
    attacks: [{ name: "Lance-Soleil", cost: ["grass", "grass", "grass", "grass"], damage: 60 }],
    rarity: "holo-rare", art: "🌺", pack: "venusaur" },

  // Chenipan
  { kind: "pokemon", id: "g1-010", number: 10, name: "Chenipan", type: "grass", stage: "basic", hp: 40, weakness: "fire", retreatCost: 1,
    attacks: [{ name: "Sécrétion", cost: ["grass"], damage: 10, text: "Coût de retraite adverse +1 le tour suivant." }],
    rarity: "common", art: "🐛", pack: "venusaur" },
  { kind: "pokemon", id: "g1-011", number: 11, name: "Chrysacier", type: "grass", stage: "stage1", evolvesFrom: "Chenipan", hp: 60, weakness: "fire", retreatCost: 2,
    attacks: [{ name: "Armure", cost: ["colorless"], text: "Pendant le tour adverse, ignore les 20 premiers dégâts." }],
    rarity: "uncommon", art: "🪲", pack: "venusaur" },
  { kind: "pokemon", id: "g1-012", number: 12, name: "Papilusion", type: "grass", stage: "stage2", evolvesFrom: "Chrysacier", hp: 70, weakness: "fire", resistance: "fighting", retreatCost: 0,
    attacks: [{ name: "Poudre Dodo", cost: ["grass"], damage: 20, text: "Le Pokémon Adverse est Endormi." }, { name: "Poudre Toxik", cost: ["grass", "grass", "colorless"], damage: 20, text: "Le Pokémon Adverse est Empoisonné." }],
    rarity: "holo-rare", art: "🦋", pack: "venusaur" },

  // Aspicot
  { kind: "pokemon", id: "g1-013", number: 13, name: "Aspicot", type: "grass", stage: "basic", hp: 40, weakness: "fire", retreatCost: 1,
    attacks: [{ name: "Dard-Venin", cost: ["grass"], damage: 10, text: "Lance une pièce. Face, le Pokémon Adverse est Empoisonné." }],
    rarity: "common", art: "🐛", pack: "venusaur" },
  { kind: "pokemon", id: "g1-014", number: 14, name: "Coconfort", type: "grass", stage: "stage1", evolvesFrom: "Aspicot", hp: 50, weakness: "fire", retreatCost: 2,
    attacks: [{ name: "Dur", cost: ["grass"], text: "Ignore tous les effets." }],
    rarity: "uncommon", art: "🪲", pack: "venusaur" },
  { kind: "pokemon", id: "g1-015", number: 15, name: "Dardargnan", type: "grass", stage: "stage2", evolvesFrom: "Coconfort", hp: 80, weakness: "fire", resistance: "fighting", retreatCost: 0,
    attacks: [{ name: "Attaque Essaim", cost: ["grass"], damage: 10, damageSuffix: "x", text: "Lance 4 pièces, 10× faces." }, { name: "Double Dard-Venin", cost: ["grass", "grass", "colorless"], damage: 40, text: "Le Pokémon Adverse est Empoisonné." }],
    rarity: "holo-rare", art: "🐝", pack: "venusaur" },

  // Abo
  { kind: "pokemon", id: "g1-023", number: 23, name: "Abo", type: "grass", stage: "basic", hp: 40, weakness: "psychic", retreatCost: 0,
    attacks: [{ name: "Morsure Venin", cost: ["grass"], damage: 10, text: "Lance une pièce. Face, le Pokémon Adverse est Empoisonné." }],
    rarity: "common", art: "🐍", pack: "venusaur" },
  { kind: "pokemon", id: "g1-024", number: 24, name: "Arbok", type: "grass", stage: "stage1", evolvesFrom: "Abo", hp: 60, weakness: "psychic", retreatCost: 2,
    attacks: [{ name: "Crochet Venin", cost: ["grass"], damage: 20, text: "Lance une pièce. Face, le Pokémon Adverse est Empoisonné." }, { name: "Étreinte", cost: ["grass", "grass", "colorless"], damage: 30 }],
    rarity: "rare", art: "🐍", pack: "venusaur" },

  // Nidoran♀ line
  { kind: "pokemon", id: "g1-029", number: 29, name: "Nidoran♀", type: "grass", stage: "basic", hp: 40, weakness: "psychic", retreatCost: 1,
    attacks: [{ name: "Pic Fourchu", cost: ["grass"], damage: 10 }],
    rarity: "common", art: "🦌", pack: "venusaur" },
  { kind: "pokemon", id: "g1-030", number: 30, name: "Nidorina", type: "grass", stage: "stage1", evolvesFrom: "Nidoran♀", hp: 70, weakness: "psychic", retreatCost: 1,
    attacks: [{ name: "Griffe", cost: ["grass"], damage: 20 }, { name: "Supersonique", cost: ["grass", "colorless"], text: "Le Pokémon Adverse est Confus." }],
    rarity: "uncommon", art: "🦌", pack: "venusaur" },
  { kind: "pokemon", id: "g1-031", number: 31, name: "Nidoqueen", type: "grass", stage: "stage2", evolvesFrom: "Nidorina", hp: 90, weakness: "psychic", retreatCost: 3,
    attacks: [{ name: "Coup de Poing", cost: ["grass", "grass"], damage: 30 }, { name: "Écrase-Mâchoire", cost: ["grass", "grass", "colorless"], damage: 40, text: "Lance une pièce. Face, le Pokémon Adverse est Paralysé." }],
    rarity: "holo-rare", art: "👸", pack: "venusaur" },
  { kind: "pokemon", id: "g1-032", number: 32, name: "Nidoran♂", type: "grass", stage: "basic", hp: 40, weakness: "psychic", retreatCost: 1,
    attacks: [{ name: "Dard-Venin", cost: ["grass"], damage: 10, text: "Lance une pièce. Face, Empoisonné." }],
    rarity: "common", art: "🦌", pack: "venusaur" },
  { kind: "pokemon", id: "g1-033", number: 33, name: "Nidorino", type: "grass", stage: "stage1", evolvesFrom: "Nidoran♂", hp: 60, weakness: "psychic", retreatCost: 1,
    attacks: [{ name: "Coup de Corne", cost: ["grass", "colorless"], damage: 20 }, { name: "Double Pique", cost: ["grass", "grass", "colorless"], damage: 20, damageSuffix: "x", text: "Lance 2 pièces, 20× faces." }],
    rarity: "uncommon", art: "🦌", pack: "venusaur" },
  { kind: "pokemon", id: "g1-034", number: 34, name: "Nidoking", type: "grass", stage: "stage2", evolvesFrom: "Nidorino", hp: 90, weakness: "psychic", retreatCost: 3,
    attacks: [{ name: "Cornadure", cost: ["grass", "grass"], damage: 30 }, { name: "Coup de Pied Sauté", cost: ["grass", "grass", "colorless", "colorless"], damage: 60 }],
    rarity: "holo-rare", art: "🦏", pack: "venusaur" },

  // Nosferapti
  { kind: "pokemon", id: "g1-041", number: 41, name: "Nosferapti", type: "grass", stage: "basic", hp: 40, weakness: "psychic", resistance: "fighting", retreatCost: 1,
    attacks: [{ name: "Vol-Vie", cost: ["grass"], damage: 10, text: "Soigne 10 dégâts à Nosferapti." }],
    rarity: "common", art: "🦇", pack: "venusaur" },
  { kind: "pokemon", id: "g1-042", number: 42, name: "Nosferalto", type: "grass", stage: "stage1", evolvesFrom: "Nosferapti", hp: 70, weakness: "psychic", resistance: "fighting", retreatCost: 0,
    attacks: [{ name: "Vol-Vie", cost: ["grass", "colorless"], damage: 20, text: "Soigne 10 dégâts à Nosferalto." }, { name: "Ultrason", cost: ["grass", "colorless", "colorless"], damage: 30, text: "Lance une pièce. Face, le Pokémon Adverse est Confus." }],
    rarity: "uncommon", art: "🦇", pack: "venusaur" },

  // Mystherbe / Ortide / Rafflesia
  { kind: "pokemon", id: "g1-043", number: 43, name: "Mystherbe", type: "grass", stage: "basic", hp: 40, weakness: "fire", retreatCost: 1,
    attacks: [{ name: "Poudre Toxik", cost: ["grass"], damage: 10, text: "Le Pokémon Adverse est Empoisonné." }],
    rarity: "common", art: "🌿", pack: "venusaur" },
  { kind: "pokemon", id: "g1-044", number: 44, name: "Ortide", type: "grass", stage: "stage1", evolvesFrom: "Mystherbe", hp: 60, weakness: "fire", retreatCost: 1,
    attacks: [{ name: "Poudre Soporifik", cost: ["grass", "colorless"], text: "Le Pokémon Adverse est Endormi." }, { name: "Pétale Danse", cost: ["grass", "grass", "colorless"], damage: 40 }],
    rarity: "uncommon", art: "🌺", pack: "venusaur" },
  { kind: "pokemon", id: "g1-045", number: 45, name: "Rafflesia", type: "grass", stage: "stage2", evolvesFrom: "Ortide", hp: 80, weakness: "fire", retreatCost: 2,
    ability: { name: "Spores de Pollen", text: "Lance 1 pièce à chaque attaque de Rafflesia. Face, le Pokémon Adverse est Endormi." },
    attacks: [{ name: "Pétale Danse", cost: ["grass", "grass", "grass"], damage: 40, damageSuffix: "x", text: "Lance 3 pièces, 40× faces. Rafflesia est Confus." }],
    rarity: "holo-rare", art: "🌺", pack: "venusaur" },

  // Paras
  { kind: "pokemon", id: "g1-046", number: 46, name: "Paras", type: "grass", stage: "basic", hp: 40, weakness: "fire", retreatCost: 1,
    attacks: [{ name: "Spore", cost: ["grass"], text: "Le Pokémon Adverse est Endormi.", effects: [{ kind: "apply-status", target: "opponent", status: "asleep" }] }],
    rarity: "common", art: "🍄", pack: "venusaur" },
  { kind: "pokemon", id: "g1-047", number: 47, name: "Parasect", type: "grass", stage: "stage1", evolvesFrom: "Paras", hp: 60, weakness: "fire", retreatCost: 1,
    attacks: [{ name: "Spore", cost: ["grass"], text: "Le Pokémon Adverse est Endormi.", effects: [{ kind: "apply-status", target: "opponent", status: "asleep" }] }, { name: "Fonce", cost: ["grass", "grass", "colorless"], damage: 40 }],
    rarity: "uncommon", art: "🍄", pack: "venusaur" },

  // Mimitoss
  { kind: "pokemon", id: "g1-048", number: 48, name: "Mimitoss", type: "grass", stage: "basic", hp: 40, weakness: "fire", retreatCost: 1,
    attacks: [{ name: "Dard Collant", cost: ["grass"], damage: 10, text: "Coût de retraite adverse +1 le tour suivant." }],
    rarity: "common", art: "🐛", pack: "venusaur" },
  { kind: "pokemon", id: "g1-049", number: 49, name: "Aéromite", type: "grass", stage: "stage1", evolvesFrom: "Mimitoss", hp: 60, weakness: "fire", retreatCost: 0,
    attacks: [{ name: "Poudre Dodo", cost: ["grass", "colorless"], text: "Le Pokémon Adverse est Endormi." }, { name: "Laser Lent", cost: ["grass", "colorless", "colorless"], damage: 30 }],
    rarity: "uncommon", art: "🦋", pack: "venusaur" },

  // Chétiflor
  { kind: "pokemon", id: "g1-069", number: 69, name: "Chétiflor", type: "grass", stage: "basic", hp: 40, weakness: "fire", retreatCost: 1,
    attacks: [{ name: "Vol-Vie", cost: ["grass"], damage: 10, text: "Soigne 10 dégâts." }],
    rarity: "common", art: "🌱", pack: "venusaur" },
  { kind: "pokemon", id: "g1-070", number: 70, name: "Boustiflor", type: "grass", stage: "stage1", evolvesFrom: "Chétiflor", hp: 60, weakness: "fire", retreatCost: 1,
    attacks: [{ name: "Vol-Vie", cost: ["grass"], damage: 10, text: "Soigne 10 dégâts." }, { name: "Liane", cost: ["grass", "colorless"], damage: 20 }],
    rarity: "uncommon", art: "🌿", pack: "venusaur" },
  { kind: "pokemon", id: "g1-071", number: 71, name: "Empiflor", type: "grass", stage: "stage2", evolvesFrom: "Boustiflor", hp: 80, weakness: "fire", retreatCost: 2,
    attacks: [{ name: "Poudre Soporifik", cost: ["grass", "colorless"], text: "Le Pokémon Adverse est Endormi." }, { name: "Acide", cost: ["grass", "grass", "colorless"], damage: 40, text: "Lance une pièce. Face, Empoisonné." }],
    rarity: "holo-rare", art: "🌺", pack: "venusaur" },

  // Tadmorv
  { kind: "pokemon", id: "g1-088", number: 88, name: "Tadmorv", type: "grass", stage: "basic", hp: 50, weakness: "psychic", retreatCost: 1,
    attacks: [{ name: "Émanation", cost: ["grass"], damage: 10, text: "Lance une pièce. Face, Empoisonné." }],
    rarity: "common", art: "🦠", pack: "venusaur" },
  { kind: "pokemon", id: "g1-089", number: 89, name: "Grotadmorv", type: "grass", stage: "stage1", evolvesFrom: "Tadmorv", hp: 80, weakness: "psychic", retreatCost: 3,
    attacks: [{ name: "Nauséeux", cost: ["grass"], damage: 20, text: "Le Pokémon Adverse est Empoisonné." }, { name: "Frappe Visqueuse", cost: ["grass", "grass", "colorless"], damage: 30 }],
    rarity: "rare", art: "🦠", pack: "venusaur" },

  // Noeunoeuf
  { kind: "pokemon", id: "g1-102", number: 102, name: "Noeunoeuf", type: "grass", stage: "basic", hp: 50, weakness: "fire", retreatCost: 1,
    attacks: [{ name: "Pique Mental", cost: ["grass"], damage: 10 }],
    rarity: "common", art: "🥚", pack: "venusaur" },
  { kind: "pokemon", id: "g1-103", number: 103, name: "Noadkoko", type: "grass", stage: "stage1", evolvesFrom: "Noeunoeuf", hp: 80, weakness: "fire", retreatCost: 3,
    attacks: [{ name: "Balle de Psy", cost: ["psychic", "colorless"], damage: 20 }, { name: "Lance-Soleil", cost: ["grass", "grass", "colorless"], damage: 40 }],
    rarity: "rare", art: "🌴", pack: "venusaur" },

  // Smogo
  { kind: "pokemon", id: "g1-109", number: 109, name: "Smogo", type: "grass", stage: "basic", hp: 50, weakness: "psychic", retreatCost: 1,
    attacks: [{ name: "Buée Noire", cost: ["grass"], damage: 10, text: "Lance une pièce. Face, le Pokémon Adverse est Empoisonné." }],
    rarity: "common", art: "💨", pack: "venusaur" },
  { kind: "pokemon", id: "g1-110", number: 110, name: "Smogogo", type: "grass", stage: "stage1", evolvesFrom: "Smogo", hp: 70, weakness: "psychic", retreatCost: 1,
    attacks: [{ name: "Détonation", cost: ["grass", "grass"], damage: 30 }, { name: "Gaz Explosif", cost: ["grass", "grass", "colorless"], damage: 40, text: "Smogogo se fait 10 dégâts." }],
    rarity: "rare", art: "💨", pack: "venusaur" },

  // Saquedeneu (basic unique)
  { kind: "pokemon", id: "g1-114", number: 114, name: "Saquedeneu", type: "grass", stage: "basic", hp: 60, weakness: "fire", retreatCost: 1,
    attacks: [{ name: "Fouet Lianes", cost: ["grass"], damage: 20 }, { name: "Étreinte", cost: ["grass", "grass", "colorless"], damage: 30 }],
    rarity: "rare", art: "🌿", pack: "venusaur" },

  // Insécateur
  { kind: "pokemon", id: "g1-123", number: 123, name: "Insécateur", type: "grass", stage: "basic", hp: 70, weakness: "fire", resistance: "fighting", retreatCost: 0,
    attacks: [{ name: "Plane", cost: ["colorless"], damage: 30, text: "Lance une pièce. Pile, cette attaque ne fait rien." }, { name: "Tranchécroix", cost: ["grass", "grass", "colorless"], damage: 30 }],
    rarity: "holo-rare", art: "🦗", pack: "venusaur" },

  // Scarabrute
  { kind: "pokemon", id: "g1-127", number: 127, name: "Scarabrute", type: "grass", stage: "basic", hp: 60, weakness: "fire", retreatCost: 2,
    attacks: [{ name: "Bagarre", cost: ["grass"], damage: 10 }, { name: "Guillotine", cost: ["grass", "grass", "colorless", "colorless"], damage: 50 }],
    rarity: "rare", art: "🪲", pack: "venusaur" },

  // ═══════════════════════════ PACK MEWTWO (40) ═══════════════════════════
  // Rattata
  { kind: "pokemon", id: "g1-019", number: 19, name: "Rattata", type: "colorless", stage: "basic", hp: 30, weakness: "fighting", retreatCost: 1,
    attacks: [{ name: "Morsure", cost: ["colorless"], damage: 10 }],
    rarity: "common", art: "🐭", pack: "mewtwo" },
  { kind: "pokemon", id: "g1-020", number: 20, name: "Rattatac", type: "colorless", stage: "stage1", evolvesFrom: "Rattata", hp: 60, weakness: "fighting", retreatCost: 1,
    attacks: [{ name: "Morsure Féroce", cost: ["colorless", "colorless"], damage: 20 }, { name: "Super Crocs", cost: ["colorless", "colorless", "colorless"], damage: 20, damageSuffix: "+", text: "Lance une pièce. Face, +20." }],
    rarity: "uncommon", art: "🐀", pack: "mewtwo" },

  // Pikachu
  { kind: "pokemon", id: "g1-025", number: 25, name: "Pikachu", type: "lightning", stage: "basic", hp: 40, weakness: "fighting", retreatCost: 1,
    attacks: [{ name: "Mordille", cost: ["colorless"], damage: 10 }, { name: "Choc Foudre", cost: ["lightning", "colorless"], damage: 30, text: "Lance une pièce. Pile, Pikachu se fait 10 dégâts.", effects: [{ kind: "self-damage", amount: 10, coin: "tails" }] }],
    rarity: "common", art: "⚡", pack: "mewtwo" },
  { kind: "pokemon", id: "g1-026", number: 26, name: "Raichu", type: "lightning", stage: "stage1", evolvesFrom: "Pikachu", hp: 80, weakness: "fighting", retreatCost: 1,
    attacks: [{ name: "Vivacité", cost: ["lightning", "colorless"], damage: 20, text: "Lance une pièce. Face, ignore les effets adverses." }, { name: "Tonnerre", cost: ["lightning", "lightning", "colorless", "colorless"], damage: 60 }],
    rarity: "holo-rare", art: "⚡", pack: "mewtwo" },

  // Mélofée
  { kind: "pokemon", id: "g1-035", number: 35, name: "Mélofée", type: "colorless", stage: "basic", hp: 40, weakness: "fighting", retreatCost: 1,
    attacks: [{ name: "Émanation", cost: ["colorless"], damage: 10 }],
    rarity: "common", art: "🧚", pack: "mewtwo" },
  { kind: "pokemon", id: "g1-036", number: 36, name: "Mélodelfe", type: "colorless", stage: "stage1", evolvesFrom: "Mélofée", hp: 70, weakness: "fighting", retreatCost: 1,
    attacks: [{ name: "Métronome", cost: ["colorless", "colorless", "colorless"], text: "Choisis une attaque du Pokémon Adverse et utilise-la (sans coût)." }],
    rarity: "rare", art: "✨", pack: "mewtwo" },

  // Rondoudou
  { kind: "pokemon", id: "g1-039", number: 39, name: "Rondoudou", type: "colorless", stage: "basic", hp: 50, weakness: "fighting", retreatCost: 1,
    attacks: [{ name: "Berceuse", cost: ["colorless"], text: "Le Pokémon Adverse est Endormi." }, { name: "Double Claque", cost: ["colorless", "colorless"], damage: 10, damageSuffix: "x", text: "Lance 2 pièces, 10× faces." }],
    rarity: "common", art: "🎀", pack: "mewtwo" },
  { kind: "pokemon", id: "g1-040", number: 40, name: "Grodoudou", type: "colorless", stage: "stage1", evolvesFrom: "Rondoudou", hp: 70, weakness: "fighting", retreatCost: 2,
    attacks: [{ name: "Voix Enjôleuse", cost: ["colorless"], text: "Tous les Pokémon actifs adverses sont Endormis." }, { name: "Tacle Lourd", cost: ["colorless", "colorless", "colorless"], damage: 30 }],
    rarity: "holo-rare", art: "🎀", pack: "mewtwo" },

  // Miaouss
  { kind: "pokemon", id: "g1-052", number: 52, name: "Miaouss", type: "colorless", stage: "basic", hp: 50, weakness: "fighting", retreatCost: 1,
    attacks: [{ name: "Griffes", cost: ["colorless"], damage: 10 }, { name: "Picsou", cost: ["colorless", "colorless"], text: "Pioche 2 cartes." }],
    rarity: "common", art: "🐈", pack: "mewtwo" },
  { kind: "pokemon", id: "g1-053", number: 53, name: "Persian", type: "colorless", stage: "stage1", evolvesFrom: "Miaouss", hp: 70, weakness: "fighting", retreatCost: 0,
    attacks: [{ name: "Pause Sieste", cost: ["colorless"], text: "Persian est Endormi. Soigne 20 dégâts." }, { name: "Coup de Patte", cost: ["colorless", "colorless"], damage: 20 }],
    rarity: "rare", art: "🐱", pack: "mewtwo" },

  // Abra
  { kind: "pokemon", id: "g1-063", number: 63, name: "Abra", type: "psychic", stage: "basic", hp: 30, weakness: "psychic", retreatCost: 0,
    attacks: [{ name: "Téléport", cost: ["psychic"], text: "Échange Abra avec un de tes Pokémon de Banc." }],
    rarity: "common", art: "🔮", pack: "mewtwo" },
  { kind: "pokemon", id: "g1-064", number: 64, name: "Kadabra", type: "psychic", stage: "stage1", evolvesFrom: "Abra", hp: 60, weakness: "psychic", retreatCost: 0,
    attacks: [{ name: "Regard Troublant", cost: ["psychic"], text: "Lance une pièce. Face, le Pokémon Adverse est Paralysé." }, { name: "Super Psy", cost: ["psychic", "psychic", "colorless"], damage: 30 }],
    rarity: "uncommon", art: "🔮", pack: "mewtwo" },
  { kind: "pokemon", id: "g1-065", number: 65, name: "Alakazam", type: "psychic", stage: "stage2", evolvesFrom: "Kadabra", hp: 80, weakness: "psychic", retreatCost: 3,
    ability: { name: "Échange de Dégâts", text: "Une fois par tour, déplace 1 marqueur de dégât d'un Pokémon à un autre." },
    attacks: [{ name: "Onde Mentale", cost: ["psychic", "psychic", "psychic"], damage: 30, text: "Lance une pièce. Pile, le Pokémon Adverse est Confus." }],
    rarity: "holo-rare", art: "🔮", pack: "mewtwo" },

  // Magnéti
  { kind: "pokemon", id: "g1-081", number: 81, name: "Magnéti", type: "lightning", stage: "basic", hp: 40, weakness: "fighting", resistance: "fighting", retreatCost: 1,
    attacks: [{ name: "Vis Tonnerre", cost: ["lightning"], damage: 10 }, { name: "Choc Tonnerre", cost: ["lightning", "colorless"], damage: 20, text: "Lance une pièce. Face, le Pokémon Adverse est Paralysé.", effects: [{ kind: "apply-status", target: "opponent", status: "paralyzed", coin: "heads" }] }],
    rarity: "common", art: "🧲", pack: "mewtwo" },
  { kind: "pokemon", id: "g1-082", number: 82, name: "Magnéton", type: "lightning", stage: "stage1", evolvesFrom: "Magnéti", hp: 60, weakness: "fighting", resistance: "fighting", retreatCost: 1,
    attacks: [{ name: "Choc Foudre", cost: ["lightning", "lightning"], damage: 30 }, { name: "Tempête de Foudre", cost: ["lightning", "lightning", "lightning", "lightning"], damage: 80, text: "Inflige 10 dégâts à chacun de tes Pokémon de Banc." }],
    rarity: "holo-rare", art: "🧲", pack: "mewtwo" },

  // Canarticho
  { kind: "pokemon", id: "g1-083", number: 83, name: "Canarticho", type: "colorless", stage: "basic", hp: 50, weakness: "lightning", resistance: "fighting", retreatCost: 1,
    attacks: [{ name: "Assaut Poireau", cost: ["colorless"], damage: 10 }, { name: "Frappe Poireau", cost: ["colorless", "colorless"], damage: 30 }],
    rarity: "rare", art: "🦆", pack: "mewtwo" },

  // Doduo
  { kind: "pokemon", id: "g1-084", number: 84, name: "Doduo", type: "colorless", stage: "basic", hp: 50, weakness: "lightning", resistance: "fighting", retreatCost: 1,
    attacks: [{ name: "Fureur", cost: ["colorless"], damage: 10, damageSuffix: "x", text: "Lance 2 pièces, 10× faces." }],
    rarity: "common", art: "🦆", pack: "mewtwo" },
  { kind: "pokemon", id: "g1-085", number: 85, name: "Dodrio", type: "colorless", stage: "stage1", evolvesFrom: "Doduo", hp: 70, weakness: "lightning", resistance: "fighting", retreatCost: 0,
    attacks: [{ name: "Fureur à Trois", cost: ["colorless"], damage: 20, damageSuffix: "x", text: "Lance 3 pièces, 20× faces." }, { name: "Agilité", cost: ["colorless", "colorless", "colorless"], damage: 20, text: "Face, ignore les dégâts adverses." }],
    rarity: "uncommon", art: "🦜", pack: "mewtwo" },

  // Fantominus
  { kind: "pokemon", id: "g1-092", number: 92, name: "Fantominus", type: "psychic", stage: "basic", hp: 30, weakness: "psychic", retreatCost: 0,
    attacks: [{ name: "Choc Mental", cost: ["psychic"], damage: 10 }, { name: "Léchouille", cost: ["psychic"], text: "Lance une pièce. Face, le Pokémon Adverse est Paralysé.", effects: [{ kind: "apply-status", target: "opponent", status: "paralyzed", coin: "heads" }] }],
    rarity: "common", art: "👻", pack: "mewtwo" },
  { kind: "pokemon", id: "g1-093", number: 93, name: "Spectrum", type: "psychic", stage: "stage1", evolvesFrom: "Fantominus", hp: 50, weakness: "psychic", retreatCost: 0,
    attacks: [{ name: "Rêve Éveillé", cost: ["psychic"], damage: 10, text: "Le Pokémon Adverse est Endormi." }, { name: "Onde Nocturne", cost: ["psychic", "psychic"], damage: 30 }],
    rarity: "uncommon", art: "👻", pack: "mewtwo" },
  { kind: "pokemon", id: "g1-094", number: 94, name: "Ectoplasma", type: "psychic", stage: "stage2", evolvesFrom: "Spectrum", hp: 80, weakness: "psychic", retreatCost: 0,
    ability: { name: "Sombre Rêve", text: "Tant qu'Ectoplasma est sur le Banc et le Pokémon Adverse Endormi, inflige 10 dégâts à l'adversaire entre les tours." },
    attacks: [{ name: "Damoclès Énergétique", cost: ["psychic", "psychic", "psychic"], damage: 50, text: "Défausse 1 Énergie Psy." }],
    rarity: "holo-rare", art: "👻", pack: "mewtwo" },

  // Soporifik
  { kind: "pokemon", id: "g1-096", number: 96, name: "Soporifik", type: "psychic", stage: "basic", hp: 50, weakness: "psychic", retreatCost: 1,
    attacks: [{ name: "Choc Mental", cost: ["psychic"], damage: 10 }, { name: "Hypnose", cost: ["psychic", "psychic"], text: "Le Pokémon Adverse est Endormi.", effects: [{ kind: "apply-status", target: "opponent", status: "asleep" }] }],
    rarity: "common", art: "😴", pack: "mewtwo" },
  { kind: "pokemon", id: "g1-097", number: 97, name: "Hypnomade", type: "psychic", stage: "stage1", evolvesFrom: "Soporifik", hp: 90, weakness: "psychic", retreatCost: 2,
    attacks: [{ name: "Hypnose", cost: ["psychic"], text: "Le Pokémon Adverse est Endormi.", effects: [{ kind: "apply-status", target: "opponent", status: "asleep" }] }, { name: "Prophétie", cost: ["psychic", "psychic"], text: "Regarde les 3 cartes du dessus de ton deck et réorganise-les." }],
    rarity: "rare", art: "😴", pack: "mewtwo" },

  // Voltorbe
  { kind: "pokemon", id: "g1-100", number: 100, name: "Voltorbe", type: "lightning", stage: "basic", hp: 40, weakness: "fighting", retreatCost: 1,
    attacks: [{ name: "Tacle", cost: ["lightning"], damage: 10 }],
    rarity: "common", art: "🔴", pack: "mewtwo" },
  { kind: "pokemon", id: "g1-101", number: 101, name: "Électrode", type: "lightning", stage: "stage1", evolvesFrom: "Voltorbe", hp: 70, weakness: "fighting", retreatCost: 1,
    attacks: [{ name: "Auto-destruction", cost: ["lightning", "lightning", "lightning"], damage: 50, text: "Inflige 10 à chaque Pokémon de Banc. Électrode se KO." }],
    rarity: "rare", art: "🔴", pack: "mewtwo" },

  // Excelangue
  { kind: "pokemon", id: "g1-108", number: 108, name: "Excelangue", type: "colorless", stage: "basic", hp: 50, weakness: "fighting", retreatCost: 2,
    attacks: [{ name: "Léchouille", cost: ["colorless"], damage: 10, text: "Lance une pièce. Face, le Pokémon Adverse est Paralysé." }],
    rarity: "rare", art: "👅", pack: "mewtwo" },

  // Leveinard
  { kind: "pokemon", id: "g1-113", number: 113, name: "Leveinard", type: "colorless", stage: "basic", hp: 120, weakness: "fighting", retreatCost: 1,
    attacks: [{ name: "Encaissement", cost: ["colorless", "colorless"], text: "Lance une pièce. Face, ignore tous les dégâts adverses." }, { name: "Damoclès", cost: ["colorless", "colorless", "colorless", "colorless"], damage: 80, text: "Leveinard se fait 80 dégâts." }],
    rarity: "holo-rare", art: "🥚", pack: "mewtwo" },

  // M. Mime
  { kind: "pokemon", id: "g1-122", number: 122, name: "M. Mime", type: "psychic", stage: "basic", hp: 40, weakness: "psychic", retreatCost: 1,
    ability: { name: "Mur de Lumière", text: "Ignore tous les dégâts ≥ 30 infligés à M. Mime." },
    attacks: [{ name: "Méditation", cost: ["psychic", "colorless"], damage: 10, damageSuffix: "+", text: "+10 par carte dans la main de l'adversaire." }],
    rarity: "holo-rare", art: "🤡", pack: "mewtwo" },

  // Élektek
  { kind: "pokemon", id: "g1-125", number: 125, name: "Élektek", type: "lightning", stage: "basic", hp: 70, weakness: "fighting", retreatCost: 2,
    attacks: [{ name: "Choc Foudre", cost: ["lightning", "colorless"], damage: 30 }, { name: "Tonnerre", cost: ["lightning", "lightning", "colorless"], damage: 50, text: "Lance une pièce. Pile, Élektek se fait 10 dégâts.", effects: [{ kind: "self-damage", amount: 10, coin: "tails" }] }],
    rarity: "rare", art: "⚡", pack: "mewtwo" },

  // Métamorph
  { kind: "pokemon", id: "g1-132", number: 132, name: "Métamorph", type: "colorless", stage: "basic", hp: 50, weakness: "fighting", retreatCost: 1,
    ability: { name: "Morphing", text: "Copie les attaques du Pokémon Adverse Actif (sans payer leur coût)." },
    attacks: [{ name: "Tacle", cost: ["colorless"], damage: 10 }],
    rarity: "rare", art: "🫠", pack: "mewtwo" },

  // Évoli
  { kind: "pokemon", id: "g1-133", number: 133, name: "Évoli", type: "colorless", stage: "basic", hp: 50, weakness: "fighting", retreatCost: 1,
    attacks: [{ name: "Charge", cost: ["colorless"], damage: 10 }, { name: "Crocs", cost: ["colorless", "colorless"], damage: 30 }],
    rarity: "common", art: "🦊", pack: "mewtwo" },

  // Voltali
  { kind: "pokemon", id: "g1-135", number: 135, name: "Voltali", type: "lightning", stage: "stage1", evolvesFrom: "Évoli", hp: 70, weakness: "fighting", retreatCost: 1,
    attacks: [{ name: "Mâchouille", cost: ["colorless"], damage: 10 }, { name: "Fil Foudre", cost: ["lightning", "lightning"], damage: 30, text: "Lance une pièce. Face, le Pokémon Adverse est Paralysé." }],
    rarity: "holo-rare", art: "⚡", pack: "mewtwo" },

  // Porygon
  { kind: "pokemon", id: "g1-137", number: 137, name: "Porygon", type: "colorless", stage: "basic", hp: 50, weakness: "fighting", retreatCost: 1,
    attacks: [{ name: "Conversion", cost: ["colorless"], text: "Choisis un type. La faiblesse de Porygon devient ce type." }, { name: "Laser", cost: ["colorless", "colorless"], damage: 20 }],
    rarity: "rare", art: "📐", pack: "mewtwo" },

  // Ronflex
  { kind: "pokemon", id: "g1-143", number: 143, name: "Ronflex", type: "colorless", stage: "basic", hp: 90, weakness: "fighting", retreatCost: 4,
    ability: { name: "Sans Garde", text: "Tant que Ronflex est Endormi, ignore les dégâts qui lui sont infligés." },
    attacks: [{ name: "Frappe Lourde", cost: ["colorless", "colorless", "colorless", "colorless"], damage: 60 }],
    rarity: "holo-rare", art: "🐻", pack: "mewtwo" },

  // Électhor
  { kind: "pokemon", id: "g1-145", number: 145, name: "Électhor", type: "lightning", stage: "basic", hp: 90, weakness: "fighting", resistance: "fighting", retreatCost: 3,
    attacks: [{ name: "Choc-Mental", cost: ["lightning"], damage: 10, text: "Lance une pièce. Face, le Pokémon Adverse est Paralysé.", effects: [{ kind: "apply-status", target: "opponent", status: "paralyzed", coin: "heads" }] }, { name: "Tonnerre", cost: ["lightning", "lightning", "lightning", "lightning"], damage: 60, text: "Lance une pièce. Pile, Électhor se fait 30 dégâts.", effects: [{ kind: "self-damage", amount: 30, coin: "tails" }] }],
    rarity: "holo-rare", art: "⚡", pack: "mewtwo" },

  // Minidraco
  { kind: "pokemon", id: "g1-147", number: 147, name: "Minidraco", type: "colorless", stage: "basic", hp: 40, weakness: "colorless", retreatCost: 1,
    attacks: [{ name: "Crocs", cost: ["colorless", "colorless"], damage: 20 }],
    rarity: "common", art: "🐉", pack: "mewtwo" },
  { kind: "pokemon", id: "g1-148", number: 148, name: "Draco", type: "colorless", stage: "stage1", evolvesFrom: "Minidraco", hp: 70, weakness: "colorless", retreatCost: 2,
    attacks: [{ name: "Agilité", cost: ["colorless", "colorless"], damage: 20, text: "Face, ignore les dégâts adverses." }, { name: "Ultrason", cost: ["colorless", "colorless", "colorless"], damage: 30, text: "Lance une pièce. Face, Confus." }],
    rarity: "uncommon", art: "🐉", pack: "mewtwo" },
  { kind: "pokemon", id: "g1-149", number: 149, name: "Dracolosse", type: "colorless", stage: "stage2", evolvesFrom: "Draco", hp: 100, weakness: "colorless", retreatCost: 2,
    attacks: [{ name: "Pic Toxik", cost: ["colorless", "colorless"], damage: 20, text: "Lance une pièce. Face, Empoisonné.", effects: [{ kind: "apply-status", target: "opponent", status: "poisoned", coin: "heads" }] }, { name: "Super Tonnerre", cost: ["colorless", "colorless", "colorless", "colorless"], damage: 80, text: "Défausse 1 Énergie.", effects: [{ kind: "discard-energy", count: 1 }] }],
    rarity: "holo-rare", art: "🐲", pack: "mewtwo" },

  // Mewtwo & Mew
  { kind: "pokemon", id: "g1-150", number: 150, name: "Mewtwo", type: "psychic", stage: "basic", hp: 60, weakness: "psychic", retreatCost: 3,
    attacks: [{ name: "Psy", cost: ["psychic", "psychic", "colorless"], damage: 10, damageSuffix: "+", text: "+10 par Énergie attachée au Pokémon Adverse." }, { name: "Barrière", cost: ["psychic", "psychic"], text: "Défausse 1 Énergie Psy. Ignore les dégâts adverses le tour suivant." }],
    rarity: "holo-rare", art: "🧠", pack: "mewtwo" },
  { kind: "pokemon", id: "g1-151", number: 151, name: "Mew", type: "psychic", stage: "basic", hp: 50, weakness: "psychic", retreatCost: 1,
    ability: { name: "Esquive Neutre", text: "Si un Pokémon évolué attaque Mew, lance une pièce. Face, les dégâts sont ignorés." },
    attacks: [{ name: "Dévoreur", cost: ["psychic"], text: "Copie 1 attaque basique d'un Pokémon du Banc adverse et utilise-la." }],
    rarity: "holo-rare", art: "💮", pack: "mewtwo" },

  // ═══════════════════════════ ÉNERGIES DE BASE (6) ═══════════════════════════
  { kind: "energy", id: "g1-energy-fire", number: 200, name: "Énergie Feu", energyType: "fire", rarity: "energy", art: "🔥" },
  { kind: "energy", id: "g1-energy-water", number: 201, name: "Énergie Eau", energyType: "water", rarity: "energy", art: "💧" },
  { kind: "energy", id: "g1-energy-grass", number: 202, name: "Énergie Plante", energyType: "grass", rarity: "energy", art: "🍃" },
  { kind: "energy", id: "g1-energy-lightning", number: 203, name: "Énergie Électrique", energyType: "lightning", rarity: "energy", art: "⚡" },
  { kind: "energy", id: "g1-energy-psychic", number: 204, name: "Énergie Psy", energyType: "psychic", rarity: "energy", art: "🌀" },
  { kind: "energy", id: "g1-energy-fighting", number: 205, name: "Énergie Combat", energyType: "fighting", rarity: "energy", art: "👊" },
];

export const POKEMON_GEN1: PokemonCardData[] = POKEMON;

export const POKEMON_GEN1_BY_ID: Map<string, PokemonCardData> = new Map(
  POKEMON.map((c) => [c.id, c]),
);

// Aliases pour rétrocompatibilité avec les imports existants (clients web
// et serveur party qui importaient encore POKEMON_BASE_SET).
export const POKEMON_BASE_SET: PokemonCardData[] = POKEMON_GEN1;
export const POKEMON_BASE_SET_BY_ID: Map<string, PokemonCardData> =
  POKEMON_GEN1_BY_ID;
