# IMPERIUM — Document de design

> Jeu de stratégie médiéval persistant du Site Suprême.
> Inspiré de Travian (carte 2D, économie, factions asymétriques) avec les protections anti-grief de Clash of Clans.
>
> **Statut** : design complet et équilibré, prêt à coder. Sert de référence unique pour P1 → P8.

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Ressources](#2-ressources)
3. [Village & bâtiments](#3-village--bâtiments)
4. [Carte monde](#4-carte-monde)
5. [Militaire](#5-militaire)
6. [Combat](#6-combat)
7. [Anti-grief](#7-anti-grief)
8. [Alliance & social](#8-alliance--social)
9. [Économie Or Suprême](#9-économie-or-suprême)
10. [Progression & endgame](#10-progression--endgame)
11. [Phasing P1 → P8](#11-phasing-p1--p8)
12. [Schéma de données](#12-schéma-de-données)
13. [Annexes](#13-annexes)

---

## 1. Vue d'ensemble

### Pitch

Imperium est le jeu de stratégie médiéval persistant du Site Suprême. Chaque joueur fonde un village, le développe, recrute une armée, attaque ses voisins, conclut des alliances et vise les merveilles du monde. Le jeu mélange l'économie profonde et la carte 2D de Travian avec les protections anti-grief de Clash of Clans (bouclier, loot cap, range de cibles).

### Boucle de gameplay

| Échelle | Activité type |
|---|---|
| Session 5-15 min | Récupérer la prod accumulée, lancer une upgrade, lancer un recrutement, partir en raid sur barbares |
| Jour | Compléter quêtes journalières, surveiller attaques entrantes, échanger sur le marché |
| Semaine | Prendre des décisions stratégiques, monter dans le classement hebdo, soutenir alliés |
| Mois+ | Monter l'hôtel de ville, débloquer unités d'élite, viser conquête merveille |

### Format

- **Persistant**, pas de wipe. Saisons cosmétiques de ~3 mois (titres, bannières), pas de reset gameplay.
- **Vitesse x1**. Les premières upgrades durent quelques minutes ; en mid/lategame elles montent à 12-24h.
- **Mono-village par défaut**. Slots additionnels :
  - **+1 slot** via achat premium (1 000 000 OS).
  - **+1 slot** via conquête de village inactif (P5+).
  - Maximum **3 villages** par compte (1 base + 1 premium + 1 conquis).

### Les 3 factions

| Faction | Identité | Style de jeu |
|---|---|---|
| **Légion** | Héritage romain, équilibrée | Discipline, économie solide, infanterie polyvalente, cavalerie lourde. L'allrounder, choix par défaut. |
| **Horde** | Barbares des steppes, offensive | Vitesse de marche, loot capacity élevée, unités bon marché. Défense fragile. Le raider. |
| **Ordre** | Chevaliers templiers, défensive | Bunker. Infanterie lourde, mauvaise mobilité, économie auto-suffisante. Le contrôleur de territoire. |

Choix de faction à la création du compte Imperium. Changement plus tard contre **100 000 OS** (les unités existantes sont converties 1:1 sur leur équivalent fonctionnel).

---

## 2. Ressources

### Les 4 ressources

| Ressource | Source | Rôle principal |
|---|---|---|
| Bois | Bûcheron | Bâtiments légers, sièges, palissade, troupes |
| Argile | Glaisière | Bâtiments lourds, murailles |
| Fer | Mine | Armes, troupes, forge, recherches |
| Blé | Ferme | Nourriture (drain par les troupes), grenier, sénateurs |

### Production lazy

Comme Eternum, **pas de cron**. À chaque action ou page-load, on calcule la prod accumulée :

```
prod_accumulee = (now - last_tick) * rate_par_seconde
ressources = min(stock + prod_accumulee, cap_entrepot)
last_tick = now
```

### Drain de blé par les troupes

Chaque unité consomme N blé/h (cf. tables du chapitre 5). La balance blé du village =

```
balance_ble = production_ferme + 5 (base) - somme(unite_count * unit_wheat_per_h)
```

- Si `balance_ble >= 0` → tout va bien, le blé s'accumule normalement (capé par grenier).
- Si `balance_ble < 0` → famine. Le stock de blé descend. Quand il atteint 0, **1 unité meurt toutes les 30 minutes**, en commençant par la plus chère en blé/h, puis par la plus chère en coût total (départager les égalités).

C'est le seul vrai garde-fou contre l'armée infinie.

### Ressources de départ

À la création du village :
- **750 bois / 750 argile / 750 fer / 750 blé**.
- Cap initial : 800 / 800 (entrepôt 0 + grenier 0).
- Donc le joueur a ~50 de marge avant de déborder → l'incite à upgrader rapidement.

### Caps de stockage

- **Entrepôt** : cap commun bois / argile / fer. Niveau 0 (village vide) = 800. Niveau 1 = 1200 (+400). Croissance ×1.3 par niveau.
- **Grenier** : cap blé. Mêmes courbes.
- Au-delà du cap, la prod déborde et est perdue.
- On peut empiler jusqu'à **3 entrepôts** et **3 greniers** (bonus additif).

| Niveau | Cap (par bâtiment) | Cap total ×3 |
|---|---|---|
| 1 | 1 200 | 3 600 |
| 5 | 2 800 | 8 400 |
| 10 | 10 400 | 31 200 |
| 15 | 38 600 | 115 800 |
| 20 | 143 600 | 430 800 |

### Taux de production par champ niveau N

```
rate(N) = 30 * 1.165^(N-1)   ressources/h
```

| Niveau | Prod/h | Prod/jour |
|---|---|---|
| 1 | 30 | 720 |
| 5 | 56 | 1 350 |
| 10 | 122 | 2 930 |
| 15 | 265 | 6 360 |
| 20 | 575 | 13 800 |

### Production de base offerte

Tout village a **+5 par ressource/h** offert même si le champ correspondant est niveau 0. Évite qu'une destruction de champ fasse couler le village (la famine reste possible mais lente).

### Coûts initiaux par ressource (champ niveau 1)

| Champ | Bois | Argile | Fer | Blé |
|---|---|---|---|---|
| Bûcheron | 40 | 100 | 50 | 60 |
| Glaisière | 80 | 40 | 80 | 50 |
| Mine | 100 | 80 | 30 | 60 |
| Ferme | 70 | 90 | 70 | 20 |

Croissance : **coût ×1.5 par niveau, temps ×1.6 par niveau**.

| Niveau | Coût total approx | Temps construction |
|---|---|---|
| 1 | ~250 | 1 min |
| 5 | ~1 250 | 7 min |
| 10 | ~9 500 | 1 h 50 |
| 15 | ~72 000 | 21 h |
| 20 | ~545 000 | ~10 jours (capé visible 24h, skip impossible au-delà) |

---

## 3. Village & bâtiments

### Layout

- **Champs périphériques** : 4 cases fixes (1 bûcheron + 1 glaisière + 1 mine + 1 ferme). Hors centre.
- **Centre du village** : grille **4×4 = 16 emplacements**. Le joueur place ses bâtiments aux emplacements de son choix lors de la construction. Un bâtiment occupe 1 slot.

### Règles communes

- **Niveau cap** : tous les bâtiments du centre sont capés au niveau de l'**hôtel de ville** (sauf Murailles, Caché, Entrepôt, Grenier qui ont leurs propres caps à 20).
- **Files d'attente** par village (toutes parallèles entre elles, séquentielles à l'intérieur de chacune) :
  - **Construction** (1 slot) : 1 upgrade/construction de bâtiment ou champ à la fois.
  - **Recherche académie** (1 slot) : 1 unité en recherche à la fois.
  - **Forge** (1 slot) : 1 amélioration en cours à la fois.
  - **Caserne** (1 slot) : N infanterie en file. Un par caserne.
  - **Écurie** (1 slot) : idem cavalerie.
  - **Atelier** (1 slot) : idem siège.
- **Coûts et temps** : croissance géométrique. **Coût ×1.28 par niveau, temps ×1.4 par niveau**.
- **Annulation** : annuler une construction restitue 80% des ressources investies (perte 20% de "frais administratifs"). Pas de remboursement de temps.
- **Démolition** (P+ à activer) : démolir un bâtiment prend 50% du temps de construction du niveau actuel et restitue 50% des ressources cumulées. Libère le slot.

### Liste des bâtiments du centre

| Bâtiment | Rôle | Cap | Coût niv 1 (b/a/f/blé) | Temps niv 1 |
|---|---|---|---|---|
| Hôtel de ville | Cap les autres bâtiments. N15 = condition 2ème village | 25 | 200/200/250/70 | 5 min |
| Caserne | Recrute infanterie. Niveau augmente vitesse de recrutement | hôtel | 220/160/90/40 | 8 min |
| Écurie | Recrute cavalerie. Prérequis caserne 5 | hôtel | 270/180/350/110 | 10 min |
| Atelier | Construit engins de siège. Prérequis caserne 10 + académie 10 | hôtel | 460/510/600/320 | 30 min |
| Académie | Recherche unités avancées avant recrutement | hôtel | 220/160/90/40 | 12 min |
| Forge | Améliore attaque/défense des unités débloquées | hôtel | 200/240/100/30 | 15 min |
| Marché | Échange ressources avec joueurs (taux libres) | hôtel | 80/70/120/70 | 15 min |
| Ambassade | Rejoindre alliance. Niveau 3 = créer alliance | hôtel | 180/130/150/80 | 20 min |
| Murailles | Bonus défense passif. Skin selon faction | 20 | 80/240/80/30 | 20 min |
| Entrepôt | Cap bois/argile/fer. Empilable ×3 | 20 | 130/160/90/40 | 12 min |
| Grenier | Cap blé. Empilable ×3 | 20 | 80/100/70/20 | 12 min |
| Caché | Stocke ressources protégées du loot | 20 | 30/25/20/10 | 8 min |

### Détails par bâtiment

**Hôtel de ville**
- Niveau 1-25.
- Niveau 15 : condition pour 2ème village (premium).
- Niveau 20 : débloque conquête de villages inactifs (>30 j).
- Cap les autres bâtiments du centre à son niveau.

**Caserne**
- Vitesse recrutement infanterie : `× (1 + 0.05 × niveau)`.
- Niveau 1 = vitesse normale. Niveau 20 = recrutement 2× plus rapide.
- Prérequis pour Écurie (niv 5) et Atelier (niv 10).

**Écurie**
- Idem caserne mais pour cavalerie. Vitesse `× (1 + 0.05 × niveau)`.

**Atelier**
- Idem mais pour engins de siège.

**Académie**
- Recherche d'unités avancées. Sans recherche, l'unité est inrecrutable même si le bâtiment de recrutement est haut.
- Coût recherche : 3 à 5× le coût de production unitaire. Temps : 30 min (basique) à 12 h (élite). Cf. tableau en §5.

**Forge**
- Améliore attaque OU défense d'une unité débloquée.
- **20 niveaux par axe** (att et def séparément, par unité).
- **+1% par niveau**, max **+20%** par axe.
- Coût ×2 par niveau, temps ×1.5 par niveau. Coût niveau 1 = 100 bois + 100 fer.
- Une amélioration à la fois (file forge).

**Marché**
- Niveau 1 = 1 marchand. Capacité par marchand = 500 ressources. Vitesse 12 cases/h.
- Capacité +200 par niveau. Marchand supplémentaire tous les 5 niveaux.
- Niveau 20 = 5 marchands × 4500 capacité.

**Ambassade**
- Niveau 1 = peut rejoindre une alliance.
- Niveau 3 = peut créer une alliance.
- Capacité d'une alliance = `9 + 3 × niveau ambassade du chef`. Niveau 20 = 69 membres.
- Niveau 15 = débloque la confédération.

**Murailles** (skin par faction)
- Légion → muraille de pierre : +3% défense par niveau, cap +60% niveau 20.
- Horde → palissade : +2% défense par niveau, cap +40% niveau 20.
- Ordre → rempart fortifié : +4% défense par niveau, cap +80% niveau 20.
- Détruit par 4 béliers cumulés (1 niveau de muraille perdu par batch de 4 béliers survivants).

**Entrepôt** / **Grenier**
- Niveau 1 cap = +400 (par-dessus base 800), donc cap effectif village 1200.
- Empilable jusqu'à 3 du même type. Cap final niveau 20 ×3 ≈ 430 000.

**Caché**
- Niveau 1 = **200 ressources** de chaque protégées du loot.
- Croissance ×1.25 par niveau.
- Niveau 20 = ~5 500 par ressource protégée.
- Empilable ×1 (un seul caché par village, pour éviter le farming en pure protection).
- Coût croissance ×1.4, temps ×1.4.

### Champs de ressources

- 4 cases fixes périphériques. Pas de slot du centre.
- Niveau 1 → niveau 20.
- Coûts niveau 1 : cf. tableau §2.
- Croissance coût ×1.5, temps ×1.6.
- Niveau 1-10 : pas de prérequis.
- Niveau 11-20 : nécessite hôtel de ville ≥ 10.

### Récap courbes (référence rapide)

| Cible | Courbe coût | Courbe temps |
|---|---|---|
| Bâtiments centre | ×1.28 / niveau | ×1.4 / niveau |
| Champs ressources | ×1.5 / niveau | ×1.6 / niveau |
| Caché | ×1.4 / niveau | ×1.4 / niveau |
| Entrepôt / Grenier | ×1.3 / niveau (cap aussi ×1.3) | ×1.4 / niveau |
| Recherche académie | 3 à 5× coût unité | spécifique par unité |
| Forge (par axe) | ×2 / niveau | ×1.5 / niveau |

---

## 4. Carte monde

### Grille

- Taille : **100 × 100 = 10 000 cases**.
- Coordonnées (x, y) ∈ [-50, +50].
- Centre (0, 0) = **Cité Suprême**, siège des merveilles (cf. §10).
- Plus on est proche du centre, plus la zone est convoitée et richement défendue.

### Types de cases

| Type | Proportion cible | Description |
|---|---|---|
| Village joueur | jusqu'à 30% à terme | Créé à l'inscription |
| Oasis | 5% (~500 cases) | Bonus prod passif si conquise par village adjacent. Défendue par animaux NPC |
| Ferme barbare (NPC) | 10% (~1 000 cases) | Village statique pillable, réapparaît 24h après destruction |
| Merveille | 8 cases fixes | Cases (-2,-2) à (+2,+2) hors (0,0). Conquérables en endgame |
| Terrain vide | reste | Utilisable pour fonder 2ème village ou event admin |

### Oasis — détail

Type d'oasis (random à la génération) :
- Forêt → +25% bois pour le village adjacent qui la conquiert.
- Carrière → +25% argile.
- Veine → +25% fer.
- Champs → +25% blé.
- Oasis double-bonus : +25% sur 2 ressources (rare, ~10% des oasis).

Pour conquérir une oasis : un village adjacent (1 case) envoie une attaque qui annihile les troupes NPC. Une fois conquise, le bonus est passif tant que personne ne la reprend. Limite : un village peut posséder **3 oasis max**.

Si une oasis est conquise par un autre joueur (combat contre la garnison du joueur précédent + animaux NPC), elle change d'allégeance.

### Ferme barbare — détail

- Niveau 1 à 10. Réapparaît avec niveau croissant selon ancienneté de la zone (case proche du centre = niveaux plus hauts).
- Stockage de ressources généré au fil du temps (slow drip, ~50/h par niveau).
- Garnison NPC qui scale avec le niveau (cf. table garnisons §6).
- Pillable autant que tu veux mais loot cap **50%** des ressources visibles (les barbares "cachent" la moitié).
- Reset 24h après destruction complète de la garnison.

### Spawn d'un nouveau joueur

À l'inscription :
1. On cherche la zone ayant le moins de joueurs récents (anti-désertification).
2. On place le joueur à **distance ≥ 5 cases** du voisin le plus proche.
3. Bouclier de bienvenue **24h** activé (saute s'il attaque).
4. Quête tutoriel guidée pour les 3 premières upgrades.

### Vision et fog of war

- **Rayon 7 autour de ton village** : tu vois tous les villages, oasis, NPC en clair (nom propriétaire, type).
- Au-delà : tu vois les coordonnées + nom du propriétaire mais **pas** les ressources/troupes.
- Pour scouter un village hors rayon : envoyer un éclaireur. Si l'éclaireur survit (pas détecté), tu obtiens un rapport instantané valable 1h.

---

## 5. Militaire

### Principe

Chaque faction a **10 unités** réparties en 4 catégories :

- **Infanterie** (3) : base, défensive, offensive.
- **Cavalerie** (3) : éclaireur, défensive, offensive.
- **Siège** (2) : bélier (anti-muraille), catapulte/trébuchet (anti-bâtiment).
- **Spécial** (2) : sénateur/khan/grand-maître (conquête de village inactif), colon/pionnier (fonder village additionnel).

### Stats unifiées (lecture des tables)

- **Coût** : bois / argile / fer / blé (one-shot pour produire l'unité).
- **Temps** : à caserne/écurie/atelier niveau 1. Réduit par niveau du bâtiment de recrutement.
- **Att** : note d'attaque unique.
- **DI** : défense contre infanterie.
- **DC** : défense contre cavalerie.
- **Vit** : cases/h sur la carte. La marche entière prend la vitesse de la plus lente.
- **Loot** : capacité en ressources rapportées par marche.
- **Blé/h** : drain en upkeep tant que l'unité existe.

### Faction Légion

| Unité | Cat | Coût (b/a/f/blé) | Temps | Att | DI | DC | Vit | Loot | Blé/h |
|---|---|---|---|---|---|---|---|---|---|
| Légionnaire | Inf base | 120/100/150/30 | 25 min | 40 | 35 | 50 | 6 | 50 | 1 |
| Prétorien | Inf def | 100/130/160/70 | 32 min | 30 | 65 | 35 | 5 | 20 | 1 |
| Imperator | Inf off | 150/160/210/80 | 40 min | 70 | 40 | 25 | 7 | 50 | 1 |
| Equite Imperatoris | Cav éclaireur | 140/160/20/40 | 30 min | 0 | 20 | 10 | 16 | 0 | 2 |
| Equite Cesaris | Cav off | 550/440/320/100 | 60 min | 120 | 65 | 50 | 14 | 100 | 3 |
| Equite Legati | Cav def | 200/440/520/130 | 75 min | 180 | 80 | 105 | 10 | 70 | 4 |
| Bélier | Siège muraille | 900/360/500/70 | 90 min | 60 | 30 | 75 | 4 | 0 | 3 |
| Catapulte | Siège bâtiment | 950/1350/600/90 | 110 min | 75 | 60 | 10 | 3 | 0 | 6 |
| Sénateur | Conquête | 30750/27200/45000/37500 | 8 h | 50 | 40 | 30 | 4 | 0 | 5 |
| Colon | Fonder village | 5800/5300/7200/5500 | 5 h | 0 | 80 | 80 | 5 | 3000 | 1 |

Identité : armée disciplinée, polyvalente, légèrement orientée défense. Cavalerie lourde excellente.

### Faction Horde

| Unité | Cat | Coût (b/a/f/blé) | Temps | Att | DI | DC | Vit | Loot | Blé/h |
|---|---|---|---|---|---|---|---|---|---|
| Maraudeur | Inf base | 95/75/40/40 | 18 min | 10 | 25 | 20 | 7 | 60 | 1 |
| Lancier | Inf def | 145/70/85/40 | 22 min | 15 | 35 | 60 | 7 | 40 | 1 |
| Berserker | Inf off | 130/120/170/40 | 30 min | 60 | 30 | 30 | 6 | 60 | 1 |
| Éclaireur | Cav éclaireur | 160/100/50/50 | 25 min | 0 | 10 | 5 | 18 | 0 | 2 |
| Cavalier nomade | Cav off | 370/270/290/75 | 45 min | 100 | 50 | 75 | 17 | 80 | 3 |
| Cavalier de fer | Cav def | 450/515/480/80 | 60 min | 150 | 50 | 75 | 13 | 50 | 3 |
| Bélier | Siège muraille | 1000/300/350/70 | 80 min | 65 | 30 | 80 | 4 | 0 | 3 |
| Trébuchet | Siège bâtiment | 900/1200/600/60 | 105 min | 50 | 60 | 10 | 3 | 0 | 6 |
| Khan | Conquête | 35500/26000/25000/27200 | 8 h | 40 | 60 | 40 | 5 | 0 | 6 |
| Pionnier | Fonder village | 7200/5500/5800/6500 | 5 h | 10 | 80 | 80 | 5 | 3500 | 2 |

Identité : raideurs rapides. Loot capacity la plus élevée du jeu, vitesse la plus haute. Peu de défense → punis si on les rattrape.

### Faction Ordre

| Unité | Cat | Coût (b/a/f/blé) | Temps | Att | DI | DC | Vit | Loot | Blé/h |
|---|---|---|---|---|---|---|---|---|---|
| Templier | Inf base | 100/130/160/70 | 26 min | 35 | 45 | 40 | 7 | 60 | 1 |
| Hospitalier | Inf def | 120/110/200/40 | 30 min | 40 | 60 | 50 | 6 | 40 | 1 |
| Frère d'armes | Inf off | 140/175/270/80 | 40 min | 60 | 35 | 60 | 6 | 50 | 1 |
| Éclaireur | Cav éclaireur | 100/180/100/65 | 35 min | 0 | 20 | 10 | 9 | 0 | 2 |
| Croisé | Cav off | 350/320/330/75 | 50 min | 110 | 55 | 45 | 9 | 110 | 4 |
| Sergent à cheval | Cav def | 270/310/440/80 | 60 min | 150 | 60 | 130 | 10 | 80 | 3 |
| Bélier | Siège muraille | 1000/450/535/70 | 90 min | 65 | 30 | 80 | 4 | 0 | 3 |
| Catapulte | Siège bâtiment | 950/1450/630/90 | 100 min | 50 | 60 | 10 | 3 | 0 | 6 |
| Grand Maître | Conquête | 30750/45400/31000/37500 | 10 h | 70 | 40 | 50 | 4 | 0 | 4 |
| Colon | Fonder village | 5500/7000/5300/4900 | 5 h | 10 | 80 | 80 | 5 | 3000 | 1 |

Identité : bunker. Défenses individuelles élevées, vitesse moyenne, économie indulgente sur les troupes "tank". Faible mobilité offensive.

### Recherche en Académie — prérequis et coûts

Toutes les unités sauf l'**infanterie de base** (Légionnaire / Maraudeur / Templier) doivent être recherchées.

| Unité | Acad. min | Bât. recrut. min | Multiplicateur coût | Temps recherche |
|---|---|---|---|---|
| Inf défensive | 1 | Caserne 3 | 3× | 30 min |
| Inf offensive | 5 | Caserne 5 | 4× | 1 h |
| Cav éclaireur | 5 | Écurie 1 | 3× | 1 h |
| Cav offensive | 10 | Écurie 5 | 5× | 4 h |
| Cav défensive | 15 | Écurie 10 | 5× | 6 h |
| Bélier | 10 | Atelier 1 | 5× | 4 h |
| Catapulte/Trébuchet | 15 | Atelier 5 | 5× | 8 h |
| Sénateur/Khan/Grand Maître | 20 | Hôtel 20 | 5× | 12 h |
| Colon/Pionnier | 10 | Hôtel 10 | 4× | 6 h |

Le coût recherche = `multiplicateur × coût_production_unitaire` (ressources unitaires).

### Forge

Améliore attaque OU défense d'une unité débloquée :
- **20 niveaux par axe** (att et def séparément, par unité).
- **+1% par niveau**, max **+20%** par axe.
- Coût base = coût de l'unité ÷ 5. Croissance ×2 par niveau, temps ×1.5.
- Une amélioration à la fois (file forge, séparée des autres files).

---

## 6. Combat

### Marche d'unités

Le joueur :
1. Sélectionne une cible (autre village, oasis, ferme NPC).
2. Choisit le type de marche (raid / attaque / soutien / espionnage).
3. Compose son détachement (combien de chaque unité).
4. Confirme.

Les unités quittent le village. **Temps de trajet** :
```
trajet = distance_cases / vitesse_unite_la_plus_lente   (en heures)
```
Distance = distance Chebyshev (max(|dx|, |dy|)) — diagonales = 1 case.

Annulation possible **< 1 minute** après envoi (les troupes rentrent immédiatement). Au-delà, irréversible jusqu'à arrivée.

### Types de marche

| Type | Objectif | Effet |
|---|---|---|
| **Raid** | Loot | Si défense survit : attaque échoue, survivants attaquant rentrent. Si défense annihilée : butin pris (capé). Pas de destruction de bâtiments. |
| **Attaque** | Destruction | Idem raid mais les engins de siège peuvent détruire bâtiments (béliers → muraille, catapultes → bâtiment ciblé). |
| **Soutien** | Renfort | Tes unités vont défendre un village allié (le tien ou un membre d'alliance). Le village hôte les nourrit en blé. Rappelables à tout moment. |
| **Espionnage** | Info | Éclaireurs uniquement. Si pas détecté, retour avec rapport (ressources visibles, troupes, bâtiments principaux). Détection par éclaireurs adverses. |

### Sièges en attaque

Si l'attaque réussit (défense annihilée) ET qu'il reste des engins de siège survivants chez l'attaquant :

- **Béliers** : 4 béliers survivants = -1 niveau muraille. Si <4 béliers, aucun effet.
- **Catapultes/Trébuchets** : chaque catapulte survivante a **20% de chance** de détruire 1 niveau du bâtiment ciblé par l'attaquant. Cibles possibles : un seul bâtiment au choix (sélectionné lors de l'envoi de la marche).
- Le bâtiment niveau 0 est démoli (libère le slot).
- Hôtel de ville détruit niveau 0 = village ne peut plus rien upgrader, plus rien recruter, mais existe encore. Reconstruction obligatoire.

### Espionnage et détection

- Éclaireur attaquant arrive → comparaison `eclaireurs_attaque` vs `eclaireurs_defense` du village cible.
- Si `attaque > defense × 1.5` : pas détecté, rapport complet.
- Si `attaque > defense` : partiellement détecté, rapport partiel + le défenseur est notifié.
- Si `attaque <= defense` : tous les éclaireurs attaquants tués, défenseur reçoit notif "tentative d'espionnage repoussée".

### Résolution de combat (formule)

Combat = battle entre `attaquant` et `défenseur` (incluant les soutiens reçus par le défenseur, qui défendent ensemble).

```
puissance_attaque = somme(unite_count * attaque_unite * (1 + forge_att_bonus))

puissance_defense_inf = somme(unite_count_def * DI * (1 + forge_def_bonus))
puissance_defense_cav = somme(unite_count_def * DC * (1 + forge_def_bonus))

# Pondération par composition de l'attaquant
total_att = somme(unite_count_attaquant)
ratio_inf_att = unites_inf_attaquantes / total_att   (0 si total_att == 0)

puissance_defense = ratio_inf_att * puissance_defense_inf
                  + (1 - ratio_inf_att) * puissance_defense_cav

puissance_defense_finale = puissance_defense * (1 + bonus_muraille)

ratio = puissance_attaque / max(puissance_defense_finale, 1)

si ratio >= 1 :
    pertes_attaquant_pct = (1 / ratio)^1.5    (entre 0 et 1)
    pertes_defenseur_pct = 1.0
sinon :
    pertes_attaquant_pct = 1.0
    pertes_defenseur_pct = ratio^1.5
```

Pertes appliquées **proportionnellement** à chaque type d'unité dans le détachement (ex. si pertes 30%, on tue 30% de chaque unit_kind, arrondi vers le bas, le reste éventuel arrondi probabiliste).

### Bonus muraille (rappel)

- Légion : +3% défense / niveau, cap +60% niveau 20.
- Horde : +2% défense / niveau, cap +40%.
- Ordre : +4% défense / niveau, cap +80%.

### Loot

- Capé à **30%** des ressources visibles du défenseur (= ressources totales – ressources cachées).
- Ramené par les unités survivantes selon la **somme** de leur capacité de loot.
- Si capacité de transport < loot disponible, on prend ce qu'on peut, le reste reste au défenseur.
- Le butin retourne au village attaquant à la même vitesse que l'aller.

### Soutien

- Quand `kind = 'support'`, les unités envoyées **rejoignent les défenseurs** du village hôte.
- Elles défendent jusqu'à rappel.
- Le drain blé est compté chez l'**hôte** (pas chez l'envoyeur).
- En cas de combat, les soutiens prennent leurs pertes proportionnellement.
- Rappelables à tout moment (temps de retour = temps d'aller au moment du rappel).

### Rapport de combat

Après résolution, un rapport est généré pour les deux parties :

- Forces engagées (attaquant et défenseur, soutiens compris).
- Pertes par unité.
- Bonus appliqués (muraille, forge).
- Butin pris.
- Bâtiments détruits (si attaque + sièges).
- Suggestion stratégique courte ("Renforcez votre garnison de cavalerie", "Vos murailles sont insuffisantes").

Stocké dans `imperium_reports`. Visible dans l'onglet Rapports.

### Garnisons NPC (référence)

Pour les fermes barbares (niveau N) :

```
garnison = {
    inf_base: 5 + N * 8,
    inf_def: 2 + N * 4,
    cav_off: max(0, N - 3) * 2
}
```

Exemple N=5 : 45 inf base + 22 inf def + 4 cav off ≈ ressources lootables ~5 000 + ~50 OS si la quête barbare est active.

Pour oasis : 10-30 animaux (loup/sanglier/ours selon type), équivalent ~80-150 d'attaque combinée.

Pour merveille (avant conquête) : garnison **massive** ~50× une ferme niveau 10. Nécessite armée d'alliance.

---

## 7. Anti-grief

Quatre garde-fous, tous activés par défaut.

### Bouclier

- **12 heures** d'invulnérabilité après une attaque où tu as subi des **pertes significatives** (>10% de tes troupes OU ≥1 bâtiment endommagé).
- Pendant le bouclier : aucune marche hostile ne peut atteindre ton village. Les marches déjà en route sont **annulées** (les troupes rentrent à leur base, sans loot).
- Le bouclier saute **immédiatement** si tu lances toi-même une marche hostile (raid, attaque). Soutien et espionnage ne le cassent pas.
- À l'inscription : bouclier de bienvenue **24h**, idem condition de saut.

### Loot cap

- 30% maximum des ressources visibles par marche (cf. §6).

### Range d'attaque

- Tu ne peux attaquer un joueur que si sa **puissance totale** est dans `[0.7×, 1.3×]` de la tienne.
- **Formule de puissance** :
  ```
  score_militaire = somme(unite_count * (att + DI + DC) / 3)
  score_batiments = somme(niveau_batiment) * 100
  puissance_totale = score_militaire + score_batiments + 1000
  ```
  (Le `+1000` baseline évite la division par zéro et donne aux nouveaux joueurs un range raisonnable.)
- **Exceptions** :
  - Joueurs inactifs >7j : pas de range.
  - Cibles NPC (oasis, fermes barbares, merveilles) : pas de range.
  - Membres de la même alliance : ne peuvent jamais s'attaquer.

### Inactivité

| Durée d'inactivité | Effet |
|---|---|
| < 7 jours | Comportement normal (bouclier valide) |
| ≥ 7 jours | Devient farmable sans bouclier (mais village conserve ses troupes/ressources) |
| ≥ 30 jours | Village conquérable (siège avec Sénateur/Khan/Grand Maître + hôtel attaquant niveau 20) |
| ≥ 90 jours | Village supprimé, case redevient terrain vide |

L'inactivité = `now() - last_login`. Reset si le joueur revient.

---

## 8. Alliance & social

### Création

- Niveau ambassade ≥ 3 pour fonder.
- Coût création : 5000 bois + 5000 argile + 5000 fer + 2000 blé.
- Capacité initiale : `9 + 3 × niveau ambassade du chef`. Le cap augmente quand le chef monte son ambassade.

### Rôles

| Rôle | Droits |
|---|---|
| Chef | Tout : invite, exclut, dissolution, diplomatie, tag |
| Adjoint | Invite, exclut, déclare guerre |
| Diplomate | Signe NAP, propose pacte |
| Membre | Lit/écrit chat, demande soutien |

### Identité

- **Nom** : 30 caractères max, unique.
- **Tag** : 3-4 caractères affichés à côté du pseudo joueur sur la carte. Unique.
- **Couleur** : pour le tag (palette restreinte). Bannière custom = 50 000 OS (cosmétique).

### Chat (PartyKit)

- **Salon alliance** : chat texte temps réel pour les membres uniquement.
- **Salon global** : chat all-comers du serveur Imperium, modéré.
- **Notifications serveur** : "Alliance X a déclaré la guerre à Alliance Y", "Membre Z subit une attaque", etc.

### Diplomatie

- **NAP** (non-aggression pact) : interdit attaques mutuelles. Rupture sur cooldown 24h (déclaration de fin → 24h plus tard, attaques possibles).
- **Guerre** : double les rapports d'alliance, débloque classement de guerre, supprime le NAP automatiquement.
- **Confédération** (endgame uniquement, débloquée niveau ambassade chef ≥ 15) : 2 alliances peuvent fusionner leurs scores pour le classement. Limite de membres totale = somme des caps. Une alliance ne peut être que dans 1 confédération à la fois.

### Soutien militaire

- Tu envoies un détachement à un village allié (le tien ou un membre).
- Les unités défendent le village hôte.
- Le village hôte les **nourrit en blé** (drain compté chez l'hôte, pas chez l'envoyeur).
- Rappelables à tout moment (temps de retour = temps d'aller).

### Conquête de village inactif

Procédure :

1. **Cible** : village d'un joueur inactif ≥ 30 jours.
2. **Conditions attaquant** : hôtel niveau ≥ 20, posséder un Sénateur/Khan/Grand Maître recruté.
3. **Marche de type "conquête"** : envoyer 1 Sénateur (ou équivalent) + escorte. Les autres unités combattent normalement, le Sénateur reste à l'arrière.
4. **Résolution** :
   - Combat normal contre la garnison résiduelle du village inactif.
   - Si défense annihilée ET le Sénateur survit (perte des unités d'escorte distribuée proportionnellement, le Sénateur a la priorité de survie) : le village change d'allégeance.
5. **Effets** : le village rejoint le compte attaquant, conserve ses bâtiments, ressources, et troupes restantes (qui changent d'allégeance). Bouclier 48h sur le village conquis.
6. **Cooldown** : 1 conquête par mois et par joueur.
7. **Slot de village** : utilise un slot. Si le joueur a déjà 3 villages, conquête impossible.

---

## 9. Économie Or Suprême

L'OS est la monnaie premium **partagée du Site Suprême**. Imperium ne lui ajoute rien : c'est le même OS que TCG, casino, RPG. Imperium **consomme** de l'OS contre des avantages de confort, et en **redistribue** légèrement via récompenses in-game.

### Skips de timer (verrouillés)

| Durée à skipper | Coût OS |
|---|---|
| ≤ 1h | 5 000 |
| ≤ 4h | 15 000 |
| ≤ 12h | 35 000 |
| ≤ 24h | 50 000 |
| > 24h | impossible (faut attendre que le timer redescende sous 24h) |

Applicable à :
- Construction de bâtiment.
- Recherche en académie.
- Recrutement (file complète).
- Marche en cours (raccourcir le trajet).
- Production de ressources (avance instantanée capée à 4h de prod).
- Forge.
- Cooldown conquête.

### Achats permanents

| Achat | Coût | Conditions |
|---|---|---|
| Village secondaire (slot +1) | **1 000 000 OS** | Hôtel principal niveau 15. One-time. |
| Changement de faction | **100 000 OS** | Conversion 1:1 des unités existantes sur leur équivalent. |
| Renommer village | 5 000 OS | Aucune. |
| Bannière custom alliance | 50 000 OS | Niveau ambassade chef ≥ 5. Cosmétique. |

### Quêtes journalières (10 dans la pool, 3 actives par jour)

À minuit, le système pioche aléatoirement 3 quêtes parmi la pool. 30 OS chacune = **90 OS/jour cap**.

| ID | Nom | Objectif |
|---|---|---|
| `daily_builder` | Bâtisseur | Compléter 3 niveaux de bâtiments (centre ou champs) |
| `daily_recruiter` | Recruteur | Recruter 20 unités |
| `daily_marcher` | Marcheur | Lancer 2 marches (n'importe quel type) |
| `daily_pillager` | Pillard | Piller 1 ferme barbare avec succès |
| `daily_trader` | Marchand | Échanger 2000 ressources via le marché |
| `daily_spy` | Espion | Espionner 1 village ennemi |
| `daily_researcher` | Chercheur | Compléter 1 recherche en académie |
| `daily_hoarder` | Accumulateur | Atteindre 5000 dans 1 ressource |
| `daily_warrior` | Guerrier | Détruire 50 unités ennemies (cumul tous combats) |
| `daily_smith` | Forgeron | Compléter 1 amélioration en forge |

### Succès one-shot (~30, total ~12 000 OS)

| ID | Nom | Récompense | Condition |
|---|---|---|---|
| `ach_first_village` | Premier village | — | Créer le compte (achievement seul) |
| `ach_first_raid` | Premier raid | 100 | Premier raid réussi avec loot |
| `ach_first_blood` | Premier sang | 100 | Tuer la première unité ennemie |
| `ach_first_barbarian` | Pillage barbare | 100 | Premier raid sur ferme barbare |
| `ach_butcher` | Boucher | 300 | 1 000 unités tuées cumul |
| `ach_massacre` | Massacre | 1 000 | 10 000 unités tuées cumul |
| `ach_hall_5` | Hôtel niveau 5 | 200 | Hôtel niveau 5 |
| `ach_hall_10` | Hôtel niveau 10 | 500 | Hôtel niveau 10 |
| `ach_hall_15` | Hôtel niveau 15 | 1 000 | Hôtel niveau 15 |
| `ach_hall_20` | Hôtel niveau 20 | 1 500 | Hôtel niveau 20 |
| `ach_hall_25` | Hôtel niveau 25 | 1 500 | Hôtel niveau 25 |
| `ach_oasis_first` | Conquête oasis | 300 | Première oasis conquise |
| `ach_oasis_triple` | Triade des oasis | 1 000 | 3 oasis simultanées |
| `ach_alliance_join` | Recrue | 100 | Rejoindre une alliance |
| `ach_alliance_chief` | Chef | 300 | Devenir chef d'alliance |
| `ach_war_first` | Belliciste | 200 | Première guerre déclarée |
| `ach_nap_first` | Pacificateur | 100 | Première NAP signée |
| `ach_loot_100k` | Petit pilleur | 300 | 100k ressources lootées cumul |
| `ach_loot_1m` | Grand pilleur | 1 500 | 1M ressources lootées cumul |
| `ach_conquest_first` | Conquérant | 1 000 | Premier village conquis |
| `ach_center_complete` | Centre complet | 500 | Tous les bâtiments du centre construits (peu importe niveau) |
| `ach_forge_max` | Forge maxée | 300 | Première amélioration forge maxée (1 axe d'1 unité) |
| `ach_elite_100` | Élite | 500 | 100 unités d'élite recrutées (cavalerie/siège/spécial) |
| `ach_top10_atk` | Top hebdo attaque | 200 | Top 10 hebdo attaque |
| `ach_top10_def` | Top hebdo défense | 200 | Top 10 hebdo défense |
| `ach_top10_eco` | Top hebdo économie | 200 | Top 10 hebdo économie |
| `ach_crown_weekly` | Couronne hebdo | 1 000 | Top 1 hebdo (n'importe quelle catégorie) |
| `ach_power_100k` | Force grandissante | 500 | 100 000 puissance totale |
| `ach_power_500k` | Force majeure | 1 000 | 500 000 puissance totale |
| `ach_first_builder` | Premier Bâtisseur | 50 000 | Premier joueur à compléter une merveille (cumulable saisons) |

### Classement hebdomadaire — récompenses détaillées

| Rang | OS / catégorie |
|---|---|
| 1 | 2 000 |
| 2 | 1 500 |
| 3 | 1 000 |
| 4 | 700 |
| 5 | 500 |
| 6 | 400 |
| 7 | 300 |
| 8 | 200 |
| 9 | 150 |
| 10 | 100 |

3 catégories (attaque, défense, économie) → cap théorique 6 850 OS/sem si rang 1 dans les trois (très improbable).

### Estimation de gain mensuel

| Source | OS/mois (joueur très actif) |
|---|---|
| Quêtes journalières | ~2 700 |
| Succès one-shot (étalés sur la vie du compte) | ~500 (moyenne) |
| Classement hebdo (top 10 réaliste, 1 catégorie) | ~3 000 |
| Conquête de merveille | event one-shot |
| **Total mensuel récurrent** | **~6 000-8 000 OS** |

Pour rusher en pur OS, il faudrait ~5 mois de gain in-game pour 1 skip de 24h. Inintéressant pour rusher, suffisant pour des coups de presse occasionnels.

---

## 10. Progression & endgame

### Pas de wipe — quel objectif long terme ?

Le persistant CoC-style nécessite des objectifs renouvelables, sinon les vétérans s'ennuient et les nouveaux abandonnent. Imperium a 3 niveaux d'objectifs imbriqués :

**Court terme (semaines 1-4)** : monter hôtel niveau 10, premier raid réussi, intégration alliance, première oasis.

**Moyen terme (mois 1-3)** : hôtel niveau 15, débloquer unités d'élite, première guerre alliance, top classement hebdo.

**Long terme (mois 3+)** : viser conquête merveille.

### Merveilles du monde

- **8 merveilles** spawnent au centre de la carte, sur les cases (-2, -2) à (+2, +2) sauf (0, 0).
- Une case merveille démarre comme un terrain vide protégé par une garnison NPC très lourde (~50× une ferme niveau 10). Nécessite généralement armée d'alliance.
- Pour terminer une merveille :
  1. Conquérir une case merveille (combat contre garnison NPC).
  2. Y construire le **bâtiment "Merveille"** jusqu'au niveau **100**.
  3. Chaque niveau coûte ressources + temps croissants. Niveau 100 ≈ 800 000 ressources / 1 niveau, ~24h de construction par niveau (skip impossible >24h).
- Le bâtiment Merveille n'a **aucun bonus gameplay** (pas de prod, pas de défense). Pure trophée.
- La case merveille peut être attaquée par d'autres joueurs même si le propriétaire actuel monte le bâtiment. Si le propriétaire perd le combat, la merveille reste mais change de propriétaire (les niveaux déjà construits sont conservés).

### Récompense de complétion

Le **premier joueur à compléter une merveille** reçoit :

- 50 000 OS.
- Titre permanent : "Premier Bâtisseur de [nom merveille]" (dans Hall of Fame).
- Bannière exclusive cosmétique.

Les autres joueurs peuvent toujours essayer de compléter les autres merveilles. Quand toutes les 8 sont terminées (probablement plusieurs mois) → **fin de saison**.

### Noms des 8 merveilles (saison 1)

1. Colosse de la Couronne — case (-2, -2)
2. Phare des Alliances — case (-1, -2)
3. Forteresse Suprême — case (1, -2)
4. Palais des Échanges — case (2, -2)
5. Sanctuaire de l'Eternum — case (-2, 2)
6. Bibliothèque Impériale — case (-1, 2)
7. Arène des Légendes — case (1, 2)
8. Temple du Premier Empereur — case (2, 2)

### Fin de saison (cosmétique uniquement)

- Pas de wipe.
- Reset des classements hebdo.
- Distribution de récompenses cosmétiques aux top joueurs et alliances :
  - Top 1 alliance attaque saison → bannière exclusive.
  - Top 1 alliance défense → skin muraille exclusive.
  - Top 1 alliance économie → skin marché exclusive.
  - Top 1 individuel → titre saisonnier ("Empereur de saison N", etc.).
- 8 nouvelles merveilles spawnent (nouveaux noms/skins).
- Le Hall of Fame conserve les Premiers Bâtisseurs des saisons précédentes.

### Titres permanents (Hall of Fame)

- "Premier Bâtisseur de [merveille]" — premier joueur à compléter une merveille.
- "Empereur de [saison N]" — top 1 attaque saisonnier (Légion).
- "Khan de [saison N]" — top 1 attaque saisonnier (Horde).
- "Grand Maître de [saison N]" — top 1 attaque saisonnier (Ordre).
- "Sentinelle de [saison N]" — top 1 défense saisonnier.
- "Marchand de [saison N]" — top 1 économie saisonnier.

### Classements

| Classement | Période | Catégories | Récompenses |
|---|---|---|---|
| Hebdomadaire | Reset chaque dimanche soir | Attaque, défense, économie | OS (cf. §9) |
| Saisonnier | Reset à fin de saison | 3 catégories + globale | Titres + cosmétiques |
| Hall of Fame | Permanent | Premiers Bâtisseurs + titres | Titres permanents |

**Définitions des scores classement** :
- **Attaque** = somme des unités ennemies tuées sur la période × leur valeur (att + DI + DC) / 3.
- **Défense** = somme des unités ennemies tuées EN défense × leur valeur.
- **Économie** = somme des ressources produites (capées au cap entrepôt avant overflow).

---

## 11. Phasing P1 → P8

Chaque phase est un livrable testable, pas une étape d'implémentation interne. Référence : phasing Eternum (P1 = foundation, P2 = bâtiments, etc.).

### P1 — Foundation (livrable jouable solo)

**Objectif** : un joueur peut s'inscrire, choisir sa faction, voir son village, upgrader des champs et l'hôtel de ville. C'est tout. Pas de combat, pas de carte, pas de social.

- Hub `/play/imperium` : création de compte, choix faction (Légion/Horde/Ordre), choix nom village.
- Vue village : layout 4 champs périphériques + grille centre 4×4.
- Au démarrage :
  - Hôtel niveau 1 placé en slot 5 (case (1, 1) du centre 4×4).
  - 4 champs niveau 0.
  - Ressources : 750/750/750/750.
  - Cap entrepôt/grenier : 800.
- Production lazy 4 ressources (formule §2).
- Upgrade champs (niveau 1-20), hôtel (niveau 1-10 cap pour P1).
- Entrepôt et grenier upgradables (jusqu'à 3 chacun).
- Caché upgradable.
- 1 file de construction (1 upgrade en cours max).
- Skip OS opérationnel sur les timers.
- Tables : `imperium_villages`, `imperium_buildings`.

### P2 — Bâtiments du centre

**Objectif** : tous les bâtiments existent, recherche académie possible, recrutement caserne possible (mais sans cible à attaquer).

- Caserne, écurie, atelier, académie, forge, marché, ambassade, murailles.
- Recherche en académie fonctionnelle (avec prérequis du tableau §5).
- Recrutement en caserne/écurie/atelier fonctionnel (les unités s'accumulent dans le village, drain blé en upkeep).
- Forge fonctionnelle (bonus passifs visibles).
- Marché et ambassade : interfaces vides (à activer P6/P7).
- Tables : `imperium_research`, `imperium_units`, `imperium_construction_queue`.

### P3 — Carte monde

**Objectif** : explorer la carte, voir les autres joueurs, identifier les NPC.

- Génération initiale de la grille 100×100.
- Placement de tous les villages joueurs existants (migration P1 → P3).
- Génération NPC (fermes barbares + oasis) selon proportions §4.
- Vue carte : grille avec zoom, click case → info.
- Fog of war (rayon 7).
- Spawn nouveau joueur en périphérie + bouclier 24h bienvenue.
- Tables : `imperium_map`.

### P4 — Militaire actif (combat NPC)

**Objectif** : envoyer une marche, résoudre un combat, voir un rapport. Cibles NPC uniquement.

- Marches sur fermes barbares + oasis.
- Moteur de combat (formule §6).
- Rapports textuels stockés.
- Loot et retour des troupes au village.
- Espionnage par éclaireur.
- Conquête d'oasis (devient possession passive).
- Tables : `imperium_marches`, `imperium_reports`, `imperium_oasis_ownership`.

### P5 — PvP

**Objectif** : attaques entre joueurs ouvertes avec tous les anti-griefs.

- Attaques joueur vs joueur (raid + attaque).
- Bouclier 12h après attaque subie.
- Range ±30%.
- Inactif >7j farmable.
- Sièges (béliers anti-muraille, catapultes anti-bâtiment).
- Conquête de village inactif >30j (Sénateur/Khan/Grand Maître).

### P6 — Alliance

**Objectif** : groupes sociaux fonctionnels.

- Création/dissolution alliance.
- Rôles + invitations + exclusions.
- Chat alliance (PartyKit).
- Soutien militaire (envoi/rappel).
- Notification d'attaque alliance.
- Tables : `imperium_alliances`, `imperium_alliance_members`, `imperium_supports`.

### P7 — Marché & diplomatie

**Objectif** : économie d'échange et politique inter-alliance.

- Marché : ordres d'achat/vente entre joueurs (taux libres).
- Caravanes physiques (les marchands transportent, pas instantané).
- Diplomatie : NAP, guerre, confédération.
- Tables : `imperium_market_orders`, `imperium_alliance_relations`.

### P8 — Endgame (merveilles + saisons)

**Objectif** : objectif long terme, fin de saison, Hall of Fame.

- 8 merveilles spawn au centre.
- Bâtiment "Merveille" niveau 1-100.
- Récompense premier bâtisseur : 50 000 OS + titre.
- Classements hebdo + saisonnier + Hall of Fame.
- Récompenses cosmétiques saison.
- Système de fin de saison automatique quand 8/8 merveilles terminées.

---

## 12. Schéma de données

### Conventions

- Toutes les tables préfixées `imperium_`.
- Timestamps en `timestamptz`.
- Quantités de ressources en `float8` (pour la prod lazy fractionnaire).
- IDs en `uuid`.
- RLS activée sur toutes les tables, lecture publique des données non-sensibles, écriture restreinte au propriétaire ou via RPCs `security definer`.

### Tables principales

#### `imperium_villages`

```
id              uuid    PK
user_id         uuid    FK profiles
name            text
faction         text    'legion' | 'horde' | 'ordre'
x               int
y               int
is_secondary    boolean default false  -- true si premium ou conquis
last_tick       timestamptz
last_login      timestamptz
wood            float8
clay            float8
iron            float8
wheat           float8
shield_until    timestamptz nullable
created_at      timestamptz

UNIQUE (x, y)
INDEX (user_id)
INDEX (last_login)
```

#### `imperium_buildings`

```
id              uuid    PK
village_id      uuid    FK villages
slot            int     -- 0..15 pour le centre, -1..-4 pour les champs
kind            text    -- 'wood'|'clay'|'iron'|'wheat'|'town_hall'|'barracks'|'stable'|'workshop'|'academy'|'forge'|'market'|'embassy'|'wall'|'warehouse'|'granary'|'hideout'|'wonder'
level           int     default 0

INDEX (village_id, slot)
INDEX (village_id, kind)
```

#### `imperium_construction_queue`

```
id              uuid    PK
village_id      uuid    FK villages
kind            text    -- 'building' | 'research' | 'forge' | 'recruit'
target_id       uuid    -- pointe vers le bâtiment, recherche, forge, ou unit recruit slot
target_kind     text    -- type de l'item upgradé
target_level    int     -- niveau visé (pour bâtiment) ou count (pour recruit)
finishes_at     timestamptz
started_at      timestamptz

INDEX (village_id, kind)
INDEX (finishes_at)
```

#### `imperium_research`

```
village_id          uuid    FK villages
unit_kind           text
researched          boolean default false
researching_until   timestamptz nullable

PK (village_id, unit_kind)
```

#### `imperium_units`

```
village_id              uuid    FK villages
unit_kind               text
count                   int     default 0
recruiting_count        int     default 0
recruiting_finishes_at  timestamptz nullable

PK (village_id, unit_kind)
```

#### `imperium_forge`

```
village_id      uuid    FK villages
unit_kind       text
attack_level    int     default 0  -- 0..20
defense_level   int     default 0  -- 0..20

PK (village_id, unit_kind)
```

#### `imperium_marches`

```
id              uuid    PK
from_village_id uuid    FK villages
to_x            int
to_y            int
kind            text    -- 'raid' | 'attack' | 'support' | 'spy' | 'conquest' | 'settle'
units           jsonb   -- { unit_kind: count }
target_building text    nullable  -- pour catapultes (kind = attack)
arrives_at      timestamptz
returns_at      timestamptz nullable
state           text    -- 'outbound' | 'arrived' | 'returning' | 'completed' | 'cancelled'
loot            jsonb   nullable

INDEX (arrives_at, state) WHERE state IN ('outbound', 'returning')
INDEX (from_village_id, state)
INDEX (to_x, to_y, state) WHERE state = 'outbound'
```

#### `imperium_supports`

```
id              uuid    PK
from_village_id uuid    FK villages
host_village_id uuid    FK villages
units           jsonb   -- { unit_kind: count }
arrived_at      timestamptz
recalled_at     timestamptz nullable

INDEX (host_village_id) WHERE recalled_at IS NULL
INDEX (from_village_id) WHERE recalled_at IS NULL
```

#### `imperium_reports`

```
id                  uuid    PK
attacker_user_id    uuid
defender_user_id    uuid
march_id            uuid    nullable
kind                text    -- 'raid'|'attack'|'spy'|'defense'|'conquest'|'support'
data                jsonb   -- forces, pertes, loot, bonus, etc.
created_at          timestamptz
read_by_attacker    boolean default false
read_by_defender    boolean default false

INDEX (attacker_user_id, created_at desc)
INDEX (defender_user_id, created_at desc)
```

#### `imperium_alliances`

```
id          uuid    PK
name        text    UNIQUE
tag         text    UNIQUE
color       text
chief_id    uuid
created_at  timestamptz
```

#### `imperium_alliance_members`

```
alliance_id uuid    FK alliances
user_id     uuid    FK profiles
role        text    -- 'chief' | 'deputy' | 'diplomat' | 'member'
joined_at   timestamptz

PK (alliance_id, user_id)
INDEX (user_id)
```

#### `imperium_alliance_relations`

```
alliance_a_id   uuid
alliance_b_id   uuid
kind            text    -- 'nap' | 'war' | 'confederation'
since           timestamptz

PK (alliance_a_id, alliance_b_id, kind)
```

#### `imperium_market_orders`

```
id                  uuid    PK
seller_village_id   uuid
give_kind           text
give_amount         int
take_kind           text
take_amount         int
expires_at          timestamptz
created_at          timestamptz
state               text    -- 'open' | 'fulfilled' | 'expired' | 'cancelled'

INDEX (give_kind, take_kind, state) WHERE state = 'open'
```

#### `imperium_map`

```
x           int
y           int
kind        text    -- 'player_village' | 'oasis' | 'barbarian' | 'wonder' | 'empty'
village_id  uuid    nullable
data        jsonb   -- bonus oasis, troupes barbares, état merveille, etc.

PK (x, y)
INDEX (kind)
```

#### `imperium_oasis_ownership`

```
village_id      uuid    FK villages
oasis_x         int
oasis_y         int
conquered_at    timestamptz

PK (village_id, oasis_x, oasis_y)
INDEX (oasis_x, oasis_y) UNIQUE
```

#### `imperium_quests` (journalières)

```
id          uuid    PK
user_id     uuid
quest_id    text
progress    int     default 0
target      int
claimed     boolean default false
expires_at  timestamptz

INDEX (user_id, expires_at)
UNIQUE (user_id, quest_id, expires_at)
```

#### `imperium_achievements` (one-shot)

```
user_id         uuid
achievement_id  text
unlocked_at     timestamptz
os_claimed      boolean default false

PK (user_id, achievement_id)
```

#### `imperium_seasons`

```
id          int     PK
name        text
started_at  timestamptz
ended_at    timestamptz nullable
```

#### `imperium_leaderboard_weekly`

```
week_start  date
user_id     uuid
category    text    -- 'attack' | 'defense' | 'economy'
score       bigint

PK (week_start, user_id, category)
INDEX (week_start, category, score desc)
```

#### `imperium_hall_of_fame`

```
id          uuid    PK
user_id     uuid
title       text
season      int
unlocked_at timestamptz
```

### RPCs critiques

- **`imperium_create_village(p_faction, p_name)`** : crée le village pour `auth.uid()`, choisit ses coordonnées (politique anti-désertification, dist ≥ 5), pose hôtel niveau 1, déclenche bouclier 24h, crédite ressources de départ.
- **`imperium_tick(p_village_id)`** : tick lazy d'un village. Calcule prod, applique drain blé, termine constructions/recherches/recrutements/marches échus, met à jour `last_tick`.
- **`imperium_resolve_marches()`** : résout les marches dont `arrives_at < now()`. Cron Supabase 1×/5min ou trigger sur `imperium_tick`.
- **`imperium_upgrade_building(p_village_id, p_kind, p_slot)`** : démarre upgrade. Vérifie ressources, slot libre/occupé, prérequis, file libre.
- **`imperium_cancel_construction(p_queue_id)`** : annule, restitue 80% des ressources.
- **`imperium_research(p_village_id, p_unit_kind)`** : démarre recherche.
- **`imperium_recruit(p_village_id, p_unit_kind, p_count)`** : ajoute à la file de recrutement.
- **`imperium_forge_upgrade(p_village_id, p_unit_kind, p_axis)`** : axis = 'attack' ou 'defense'.
- **`imperium_send_march(p_village_id, p_to_x, p_to_y, p_kind, p_units, p_target_building)`** : valide composition, range, bouclier, débite unités, crée marche.
- **`imperium_cancel_march(p_march_id)`** : annule si <60s après envoi.
- **`imperium_skip_timer(p_target_kind, p_target_id, p_os_amount)`** : débite OS, raccourcit timer cible. Vérifie tarif valide.
- **`imperium_create_alliance(p_name, p_tag, p_color)`** : vérifie ambassade ≥ 3, débite ressources, crée alliance + ajoute chef.
- **`imperium_invite_to_alliance(p_alliance_id, p_user_id)`** : ajoute membre (invitation acceptée par le destinataire via `imperium_join_alliance`).
- **`imperium_market_post_order(p_village_id, p_give_kind, p_give_amount, p_take_kind, p_take_amount)`** : crée ordre.
- **`imperium_market_fulfill_order(p_order_id, p_buyer_village_id)`** : execute échange.
- **`imperium_buy_secondary_village()`** : débite 1 000 000 OS, autorise slot +1.
- **`imperium_change_faction(p_new_faction)`** : débite 100 000 OS, convertit unités.
- **`imperium_claim_achievement(p_achievement_id)`** : crédite récompense OS si débloqué et non claim.
- **`imperium_claim_daily_quest(p_quest_id)`** : crédite 30 OS si quête complète.
- **`imperium_finalize_weekly_leaderboard()`** : cron dimanche soir, distribue récompenses OS top 10 × 3 catégories.

### Pattern de résolution lazy

À chaque action utilisateur (page-load village, envoi marche, achat, recrutement) :

1. Appel `imperium_tick(village_id)`.
2. Production accumulée capée par entrepôt/grenier.
3. Drain blé appliqué (famine si négatif).
4. Termine constructions/recrutements/recherches dont le timer est passé.
5. Termine les marches arrivées au village (résout combat, calcule loot, lance retour).
6. `last_tick = now()`, `last_login = now()`.

Pour les défenseurs offline : la marche reste en `state = outbound` tant que personne ne tique. Quand le défenseur ou l'attaquant revient, leur tick résout. Pour garantir un délai borné même si tous les acteurs sont offline, un cron Supabase léger appelle `imperium_resolve_marches()` toutes les 5 min.

---

## 13. Annexes

### Annexe A — Convention de fichiers

| Type | Emplacement |
|---|---|
| Routes Next.js | `web/app/play/imperium/` |
| Constants & types partagés | `shared/imperium-*.ts` (ex: `imperium-buildings.ts`, `imperium-units.ts`, `imperium-combat.ts`, `imperium-quests.ts`) |
| SQL Supabase | `supabase/imperium.sql` (1 fichier unique) |
| PartyKit (chat alliance) | `partykit/imperium-alliance.ts` (P6) |
| Document de design | `docs/imperium.md` (ce fichier) |

### Annexe B — Numérique récapitulatif

| Constante | Valeur |
|---|---|
| Taille carte | 100 × 100 |
| Centre carte | (0, 0) |
| Cases merveilles | (-2,-2) à (+2,+2) hors (0,0), 8 cases |
| Distance min spawn | 5 cases |
| Rayon vision | 7 cases |
| Bouclier après attaque | 12h |
| Bouclier bienvenue | 24h |
| Bouclier post-conquête | 48h |
| Loot cap (joueur) | 30% |
| Loot cap (barbare) | 50% |
| Range d'attaque | ±30% puissance |
| Inactivité farmable | 7 jours |
| Inactivité conquérable | 30 jours |
| Inactivité supprimée | 90 jours |
| Cap niveau hôtel | 25 |
| Cap niveau bâtiments centre | hôtel (cf. cas particuliers) |
| Cap niveau murailles, caché | 20 |
| Cap niveau forge (par axe) | 20 |
| Cap stack entrepôt/grenier | 3 |
| Cap oasis par village | 3 |
| Cap niveau merveille | 100 |
| Cap villages par compte | 3 |
| Ressources de départ | 750 chacune |
| Cap entrepôt/grenier initial | 800 |
| Drain mort de famine | 1 unité / 30 min |
| Vitesse marchand | 12 cases/h |
| Capacité marchand niv 1 | 500 |
| Cooldown conquête | 1 / mois / joueur |
| Cooldown rupture NAP | 24h |
| Skip 1h | 5 000 OS |
| Skip 4h | 15 000 OS |
| Skip 12h | 35 000 OS |
| Skip 24h | 50 000 OS |
| 2ème village | 1 000 000 OS |
| Changement faction | 100 000 OS |
| Renommer village | 5 000 OS |
| Bannière custom alliance | 50 000 OS |
| Récompense quête journalière | 30 OS |
| Cap quêtes journalières | 90 OS / jour |
| Récompense classement rang 1 | 2 000 OS / catégorie |
| Récompense Premier Bâtisseur | 50 000 OS |

### Annexe C — Courbes de référence

| Courbe | Formule | À retenir |
|---|---|---|
| Production champ | `30 × 1.165^(N-1)` | N20 ≈ 575/h |
| Coût bâtiment centre | `coût(1) × 1.28^(N-1)` | N20 ≈ 145× le coût L1 |
| Temps bâtiment centre | `temps(1) × 1.4^(N-1)` | N20 ≈ 836× le temps L1 |
| Coût champ | `coût(1) × 1.5^(N-1)` | N20 ≈ 2200× |
| Temps champ | `temps(1) × 1.6^(N-1)` | N20 ≈ 12500× |
| Cap entrepôt/grenier | `(800 + 400) × 1.3^(N-1)` | N20 ≈ 144 000 |
| Caché | `200 × 1.25^(N-1)` | N20 ≈ 5500 |
| Forge | `+1% × niveau` | N20 = +20% |
| Combat ratio>=1 | `pertes_att = (1/ratio)^1.5` | ratio 2 → pertes 35% |
| Combat ratio<1 | `pertes_def = ratio^1.5` | ratio 0.5 → pertes 35% |
