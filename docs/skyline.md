# Skyline — tycoon multijoueur de Site Ultime

5ᵉ univers (après Plaza, Casino, TCG, Eternum, Imperium). Jeu de gestion d'entreprise massivement multijoueur, marché 100% commun à tous les joueurs, vraie compétition économique. Inspiration : Big Ambitions + Capitalism Lab + bourse simplifiée.

## Concept général

- **Une grande ville commune** à tous les joueurs (5 quartiers).
- **Monnaie séparée** : `$` (dollars Skyline), distincte de l'Or Suprême (OS) pour éviter inflation OS.
- **Pont $ ↔ OS** : seul lien inter-univers. Pas de synergie directe avec Eternum/Imperium/Casino/TCG.
- **Marché commun multijoueur** : prix offre/demande dynamiques entre tous + entreprises PNJ.
- **Liberté totale** : pas de tiers, pas de phases de déblocage. Tu fais ce que tu peux te payer.
- **Modèle modulaire** : pas de prix forfaitaire par entreprise. Tu paies loyer + équipement + stock + salaires.
- **Philosophie Site Ultime** : systèmes réalistes simplifiés en mécaniques de jeu.

## Démarrage

**Capital initial : 10 000 $**.

4 voies parallèles toujours dispo :
- 💼 **Salariat PNJ** : 2 000-4 000 $/mois jeu, accumul lent. Aussi salariat possible chez d'autres joueurs (P11).
- 🛠️ **Freelance / petit commerce** : selon coût d'équipement initial (~5-10k$ possible).
- 🏦 **Prêt création débutant** : max 40k$, 8% fixe, 5 ans, sans apport.
- 🪙 **Pont OS → $** : 1 OS = 500 $, cap 50 OS/jour pour éviter dump massif.

Le local (loyer ou achat) est **obligatoire** pour toute entreprise — pas de mode "à domicile".

## Échelle temporelle

```
1h réelle = 1 jour jeu (24h jeu)
1 jour réel ≈ 1 mois jeu
1 semaine réelle ≈ 6 mois jeu
1 an jeu ≈ 15 jours réels
```

Récurrents : salaires + compta + impôts + mensualités prêts = 1×/mois jeu (~30h réelles).

## Modèle modulaire — Coût total = somme

```
Coût démarrage = Loyer/Achat local + Équipement + Stock initial + Salaires (si employés)
```

Pour chaque catégorie d'entreprise :

| Catégorie | Local | Équipement | Spécificité |
|---|---|---|---|
| 🏪 Commerce | Loyer (m² × quartier) | Présentoirs (1-10k$) | Achat de stock à revendre |
| 🏭 Usine | Loyer industriel | **Machines** (10k$ → millions) | Production gros volume |
| 🌾 Matière 1ère | Terrain | **Machines agri/extraction** (encore plus chères) | Production massive |
| 🔧 Service | Bureau/local | Équipement (PCs, fauteuils...) | Compétences clés |

## Locaux et quartiers

5 tailles : **XS** (50m²) · **S** (80m²) · **M** (140m²) · **L** (250m²) · **XL** (480m²)

5 quartiers (loyer $/m²/mois) :
| Quartier | $/m²/mois | Mix démographie dominante |
|---|---|---|
| 🏙️ Centre-ville | 50 | Touristes 30% + Hauts revenus 25% + Salariés 25% |
| 🌆 Affaires | 40 | Salariés 60% + Hauts revenus 25% |
| 🏘️ Résidentiel | 25 | Familles 40% + Retraités 30% + Salariés 20% |
| 🌳 Périphérie | 10 | Familles 50% + Retraités 30% + Étudiants 20% |
| 🏚️ Populaire | 8 | Étudiants 35% + Familles 35% + Retraités 30% |

**Achat = 100× loyer mensuel** (réaliste).

**Stockage** = arrière boutique = 50% du local. Ex : local 50m² → 50m² boutique + 25m² arrière. Pour stocker plus, louer un entrepôt séparé.

## Démographies clients (6 profils)

| Profil | Panier moy | Sensib. prix | Préférences |
|---|---|---|---|
| 👶 Étudiants | Faible | Très élevée | Fast-food, tech, mode jeune |
| 👨‍💼 Salariés | Moyen | Moyenne | Pause déj rapide, basique |
| 👨‍👩‍👧 Familles | Élevé (vol) | Moyenne | Supérette, vêtements enfants |
| 💎 Hauts revenus | Très élevé | Faible | Premium, luxe, gastro |
| 👴 Retraités | Moyen | Élevée | Boulangerie, pharmacie, calme |
| 🛒 Touristes | Variable | Faible | Souvenirs, restos, hôtels |

Heures de pointe par profil (P3) : étudiants midi/soir, salariés matin/midi, retraités matin.

## Structure : 4 catégories d'entreprises (règle 2:1 avec exceptions)

```
2 matières premières  →  1 usine  →  produit fini
2 produits finis      →  1 commerce
```

**Limite : 1 entreprise par type par joueur** (pas de chaîne identique). Tu peux avoir 1 boulangerie + 1 cave + 1 fleuriste = 3 entreprises distinctes.

### 🌾 Matières premières (~24 sources)

Champ blé · Vignoble · Élevage bovin · Mine fer · Mine or · Salines · Forêt · Puit pétrole · Champ fleurs · Pépinière · Maraîchage · Élevage volaille · Apiculture · Champ orge & houblon · Verger · Plantation sucre · Élevage ovin · Plantation coton · Plantation café · Plantation cacao · Mine cuivre · Mine aluminium · Mine pierres précieuses · Mine charbon

Capital équipement : 50k$ (champ fleurs petit) → 100M$+ (mine pétrole).

### 🏭 Usines de transformation (~18 usines)

2 matières → produits finis. Boulangerie indus, Domaine viticole, Brasserie, Distillerie, Chocolaterie, Aciérie, Usine auto, Pharma, Aéronautique, etc.

Capital équipement : ~30-50k$ minimum → milliards.

### 🏪 Commerces (~21 commerces)

2 fournisseurs → gamme. Boulangerie-pâtisserie, Cave alcool, Boucherie, Pizzeria, Pharmacie, Joaillerie, Concessionnaire, Hôtel, Fleuriste, etc.

Capital total minimum (loyer + équipement basique + stock) : ~5-10k$ pour les petits.

### 🔧 Services scalables (~17 secteurs)

Mécanique commune : **local + équipement + personnel à équilibrer**.

```
Capacité = MIN(taille local, nb équipement, nb personnel)
Qualité  = compétences personnel × niveau équipement
Revenus  = capacité × qualité × tarif × demande
```

Tech, Conseil, Beauté, Immobilier, Sécurité, Juridique, Sport, Logistique, Médias, BTP, Santé, Diffusion, Casino, Banque, Aérien, etc.

## Système de compétences (16 compétences génériques, 0-100, pas de niveaux)

**Front (interaction client)** :
- 👔 Vente · 📞 Service client · 🎨 Présentation

**Production** :
- ⚙️ Utilisation machines (avec niveaux) · 🍳 Cuisine / Préparation · 💈 Soins / Esthétique · 🏗️ Manuel / Construction · 💊 Médical · 🌾 Agricole

**Support** :
- 💼 Recrutement (RH) · 📊 Comptabilité · 📢 Marketing · 🛒 Négociation · 👨‍💼 Management · 🛡️ Sécurité · 🧹 Entretien

**Productivité = compétence × qualité équipement / 100**.

### Niveau machine vs compétence requise

| Niveau machine | Comp. "Utilisation machines" requise |
|---|---|
| Basique | 30 |
| Pro | 60 |
| Élite | 85 |
| High-tech (R&D) | 95 |

## Apprentissage (3 modes)

### Joueur
- 1 seule compétence à la fois. 5× plus rapide que les employés.
- Pendant : plus possible de bosser dans une entreprise (gestion stratégique OK).
- 5-15k$ par session. 2-4 semaines jeu (14-28h réelles) → +25-40 points.

### Employé
- En parallèle du travail (productivité -30%). Payé par l'entreprise : 10-30k$.
- 2-3 mois jeu (60-90h réelles) → +15-30 points.
- Risque : surqualifié peut demander augmentation, démissionner si refus.

### Slow grind (passif)
- Travailler sur la tâche : +1 / 3 jours jeu (90h réelles).

## Marché de l'emploi

Page commune `/play/skyline/emploi` à tout le jeu :
- Côté chercheur (joueur ou PNJ) : poste profil (compétences + salaire demandé).
- Côté employeur : recherche par filtres, envoi d'offres.
- **Pas de vol d'employés** : un employé sous contrat ne peut pas être chassé directement.
- Démission spontanée si moral < 30 → re-disponible sur le marché.
- **Salaire demandé monte avec compétences**.
- **PNJ candidats** toujours dispo (le marché ne se vide jamais).

### Auto-recrutement par RH (P9)

Joueur embauche un RH (compétence Recrutement) → définit règles :
- "2 vendeurs Vente >40, max 2 000$/mois"
- "1 boulanger Cuisine >60 + Utilisation machines >60, max 3 500$/mois"
→ RH scanne le marché en continu, propose ou recrute auto.

### Joueurs salariés (P11)
Les joueurs peuvent être employés chez d'autres joueurs (au-delà du salariat PNJ).

## Le pont $ ↔ OS

| Méthode | Taux | Taxe | Risque | Cap |
|---|---|---|---|---|
| Virement bancaire | 1$ → 0.001 OS | 60% | Aucun | Illimité |
| Société écran | 1$ → 0.005 OS | 20% | Audit 5%/jour (1% si comptable) | Cap hebdo 100k$ → 500 OS |
| **Inverse** OS → $ | 1 OS = 500 $ | À perte | — | Cap 50 OS/jour |

Audit conséquence : amende = 50% de la conversion. Comptable employé réduit risque à 1%/jour.

## Système de prêt bancaire

Critères :
1. **Apport personnel** : 20-30% du capital (sauf prêt création débutant)
2. **Score de crédit** : 0 au départ, monte avec remboursements
3. **Business plan** : secteur (risqué = taux ↑)
4. **Garanties** : actifs existants

Conditions :
- Taux : 4% (excellent) → 18% (mauvais)
- Durée : 5/10/15/20 ans
- Mensualités auto-prélevées
- Défaut → saisie progressive

## Patrimoine + faillite progressive

**Patrimoine total (actifs bruts)** = liquidités + valorisation entreprises + immobilier + équipement + stocks + portefeuille bourse + patrimoine perso.

**Trigger faillite** : `compte_courant < -10% × patrimoine_total`

Procédure progressive :
1. Alerte rouge → 7 jours jeu pour redresser
2. Sinon : licenciement employé moins productif → vente équipement → vente perso → vente local → vente entreprise
3. Tout vendu et toujours rouge → reset 10k$ + score crédit pourri 30 jours jeu

## Marché dynamique

**5 facteurs sur cours produit/matière** :
- 📊 Offre globale (joueurs + PNJ)
- 🛒 Demande globale
- 🍂 Saisons (hiver = pain ↑, été = glaces ↑, Noël = chocolats ↑)
- 📈 Tendances mode (vegan, gaming, fitness — signalées en jeu)
- ⚡ Événements aléatoires (pénuries, crises, scandales)

**Cannibalisation locale** : si trop de joueurs ouvrent le même type de commerce dans le même quartier → offre dépasse demande locale → prix tirés vers le bas. **Pas de tendances positives par "spam joueurs"** (la dynamique est inverse).

### Bourse étendue (P7)

- Cours produits/matières en temps réel (graphes, plus haut/bas, alertes)
- Actions entreprises (IPO valorisation > 5M$, OPA hostile, dividendes)
- Trading produits (spéculation : stocker bas → revendre haut, avec coût stockage)
- Mise à jour cours toutes les minutes réelles
- Pseudo joueur visible sur transactions
- Ordres : Market + Limit (Option B simplifiée)

### PNJ corporate

- Petites boîtes locales (liquidité minimale)
- Multinationales avec noms travaillés (FoodCorp, MegaTech...) qui peuvent **bouleverser le marché** (annonces, fusions, OPA)
- Fil d'actu type Bloomberg/Les Échos en jeu

### Événements (1 majeur tous les 2-3 jours jeu)

70% annoncés à l'avance. Catégories : pénurie agricole, crise import, scandale sanitaire, tendance mode, saisonnier, réglementation, annonce PNJ.

## Transport / acheminement

| Mode | Coût | Avantage |
|---|---|---|
| 🚛 Transport tiers (PNJ ou Société joueur) | 2-5% valeur | Aucun setup |
| 🚚 Contrat société transport joueur | 1.5-4% (négocié) | Meilleur prix |
| 🚐 Flotte propre | Coûts fixes (camions + chauffeurs), 0%/envoi | Rentable à gros volumes |

Transport interne (entre tes propres boîtes) : payé pareil, pas de gratuité. **Distance géographique compte**.

## 10 secteurs creusés (endgame stratégique)

| Secteur | Profondeur supplémentaire |
|---|---|
| 💊 Pharma | R&D molécules + brevets 5 ans (premier sur brevet = monopole) |
| 🏦 Banque | Prêts à risque aux joueurs/PNJ, produits structurés, risque crise |
| 🎰 Casino | RTP configurables 90-99%, système VIP, hôtel attaché |
| 🍔 Restauration | Score "Guide Skyline" (0-3 étoiles, multiplicateurs prix x1/x3/x10/x30) |
| 💻 Tech | Produits évolutifs (v1→v2→v3), SaaS récurrent, valorisation x10-x50 |
| 🏗️ BTP | Grands chantiers, contrats publics, échelle infrastructure |
| ✈️ Compagnie aérienne | Lignes, alliances, points fidélité |
| 📺 Médias | Programmation, audiences, droits |
| 🚗 Auto/Aéro/Armement | R&D modèles, contrats militaires |
| 💎 Luxe | Marques iconiques, défilés, image |

## Fiscalité

**Impôt sur les bénéfices progressif** :
- 0-50k$ profit/an : 15%
- 50k-500k$ : 25%
- 500k-5M$ : 33%
- 5M$+ : 40%

**TVA** simulée 20% (incluse dans prix affichés). **Charges sociales** 30% du salaire brut. **Amortissement** simplifié : -30% valeur équipement déductible la 1re année.

## Persistance

- Entreprises tournent **24/7 même offline**
- Salaires + ventes + production continuent
- Limite d'absence : 30 jours réels avant pénalités

## Multi-entreprises, holdings (P11)

- **1 entreprise par type par joueur** (pas de chaîne identique)
- **Holding** débloquée à 5+ entreprises : centralise compta + trésorerie
- **Synergies intégration verticale** : posséder la chaîne complète (champ + usine + commerce) = -30% coûts internes
- **Vente d'entreprise** entre joueurs : libre, négo. Valorisation indicative = multiple du profit annuel x3-x10 selon secteur.

## Une entreprise = 14 onglets (par catégorie)

```
🏠 Local & Aménagement       🚛 Logistique
🪑 Présentoirs / Équipement  💵 Finance
🧹 Saleté & Hygiène          📊 Compta
🏭 Production / Catalogue    📜 Permis & Légal
📦 Stocks                    🛒 Achats / Contrats
💰 Ventes / Pricing          👥 RH
📢 Marketing                 🛡️ Sécurité
🔬 R&D / Formations
```

**Local 2D (P3)** : grille drag & drop (1 case = 1m²), 5 tailles. Style **flat design**. Pathfinding réel des clients. Présentoirs 1-4 cases. Saleté avec femme de ménage (1 200$/mois) ou robot (R&D, 5k$).

## Structure menu

```
/play/skyline/        Hub : dashboard global (cash, valo, alertes, fil actu)
  /entreprises        Liste tes boîtes
  /entreprises/[id]   Vue par boîte (14 onglets)
  /marche             Marché public (graphes offre/demande live, cours produits)
  /bourse             Trading actions + produits
  /banque             Prêts, comptes, score crédit
  /offshore           Conversion $ ↔ OS (le pont)
  /immobilier         Achat de locaux/terrains
  /emploi             Marché de l'emploi (candidats, offres)
  /classement         Top entreprises et joueurs
```

## Roadmap de dev (P1 → P12)

| Phase | Contenu |
|---|---|
| **P1** | Foundation + 1er commerce. Hub, création boîte, vente PNJ, compta basique, pont virement. |
| **P2** | Élargissement commerces (5-6 secteurs) + employés (marché emploi PNJ basique) + permis + hygiène |
| **P3** | Local 2D drag & drop + démographies + pathfinding + sécurité + horaires |
| **P4** | Banque complète (prêts, score, faillite progressive) + pont société écran (audit) |
| **P5** | Usines de transformation + machines + transport + B2B basique |
| **P6** | Marché commun multijoueur + cours dynamiques + PNJ corporate + événements |
| **P7** | Bourse (IPO, actions, trading produits, dividendes, OPA) |
| **P8** | Matières premières + saisons/cycles + intégration verticale -30% |
| **P9** | Services scalables + auto-recrutement RH + apprentissage joueur |
| **P10** | 10 secteurs creusés (Pharma R&D, Banque prêts, Casino RTP, Restau étoiles, Tech SaaS, etc.) |
| **P11** | Holdings + vente entreprise inter-joueurs + sociétés transport joueurs + salariat joueur |
| **P12** | Polish (notifications, classements, tutoriel, achievements, mobile) |

## Conventions techniques

- **Tables Supabase** : préfixe `skyline_*`
- **Helpers serveur** : `web/app/play/skyline/_lib/supabase-helpers.ts`
- **Types partagés** : `shared/skyline.ts` (types + constants visuels + formules duplicate côté client)
- **Anti-triche** : valeurs autoritaires côté SQL (fonctions immutable), client = read + UX
- **Lazy tick** : RPC `skyline_tick_company` avant chaque lecture de boîte (recompute revenus, salaires payés, etc.)
- **RLS** : tout lisible/écrivable par owner uniquement (sauf marché public)
- **Realtime** : Supabase Realtime pour cours / fil d'actu (pas PartyKit, pas critique low-latency)
