# IMPERIUM — Document de design

> Jeu de stratégie médiéval persistant du Site Suprême.
> Inspiré de Travian (carte 2D, économie, factions asymétriques) avec les protections anti-grief de Clash of Clans.
>
> **Statut** : design figé, pas encore codé. Sert de référence unique pour P1 → P8.

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
- **Mono-village par défaut**. Un 2ème village (premium) est possible contre 1 000 000 OS, conditionné à hôtel principal niveau 15.

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

Chaque unité consomme N blé/h (cf. tables du chapitre 5). Si la conso totale dépasse la prod de blé, le surplus de troupes meurt de faim au rythme de **1 unité toutes les 30 min**, en commençant par la plus chère en blé. C'est le seul vrai garde-fou contre l'armée infinie.

### Caps de stockage

- **Entrepôt** : cap commun bois / argile / fer. Niveau 1 = 1200 chacune. Croissance ×1.3 par niveau. Niveau 20 = ~80 000.
- **Grenier** : cap blé. Mêmes courbes.
- Au-delà du cap, la prod déborde et est perdue.
- On peut empiler jusqu'à **3 entrepôts** et **3 greniers** (bonus additif).

### Taux de production (champ niveau N)

```
rate(N) = 30 * 1.16^(N-1)   ressources/h
```

| Niveau | Prod/h | Prod/jour |
|---|---|---|
| 1 | 30 | 720 |
| 5 | 56 | 1340 |
| 10 | 121 | 2900 |
| 15 | 254 | 6100 |
| 20 | 533 | 12 800 |

### Production de base offerte

Tout village a **+5 de chaque ressource/h** offert (production "manuelle du village"), même sans champ. Ça évite que la perte d'un champ niveau 1 fasse couler le village.

---

## 3. Village & bâtiments

### Layout

Le village se divise en deux zones :

- **Champs périphériques** : 4 cases fixes dédiées (1 bûcheron, 1 glaisière, 1 mine, 1 ferme).
- **Centre du village** : grille **4×4 = 16 emplacements**. Le joueur place ses bâtiments aux emplacements de son choix. Un bâtiment occupe 1 slot.

### Règles communes

- **Niveau cap** : tous les bâtiments du centre sont capés au niveau de l'**hôtel de ville** (sauf Caché et Murailles qui ont leurs propres caps).
- **Une upgrade à la fois** par village (file d'attente unique pour bâtiments). Avec 2ème village premium → file séparée.
- **Coûts et temps** : croissance géométrique. Coût ×1.4 par niveau, temps ×1.5 par niveau.

### Liste des bâtiments du centre

| Bâtiment | Rôle | Cap | Coût niv 1 (b/a/f/blé) | Temps niv 1 |
|---|---|---|---|---|
| Hôtel de ville | Cap les autres bâtiments. Niveau 15 = condition 2ème village | 25 | 200/200/250/70 | 5 min |
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
- Niveau 15 = condition pour 2ème village (premium).
- Niveau 20 = débloque conquête de villages inactifs.
- Cap les autres bâtiments du centre à son niveau.

**Caserne**
- Vitesse de recrutement infanterie : ×(1 + 0.05 × niveau).
- Niveau 1 = vitesse normale. Niveau 20 = recrutement 2× plus rapide.
- Prérequis pour Écurie (niv 5) et Atelier (niv 10).

**Écurie**
- Idem caserne mais pour cavalerie.

**Atelier**
- Idem mais pour engins de siège.

**Académie**
- Permet de chercher de nouvelles unités. Sans recherche, l'unité ne peut pas être recrutée même si la caserne/écurie est haute.
- Coût recherche unité = 3 à 5× le coût de production de l'unité, temps 30 min à 12h.

**Forge**
- Améliore attaque OU défense d'une unité débloquée.
- 10 niveaux par axe (att et def), +1.5% par niveau, soit max +15%.
- Coûts croissants ×2 par niveau.

**Marché**
- Niveau 1 = 1 marchand. Capacité par marchand = 500 ressources. Vitesse 12 cases/h.
- Niveau augmente nombre de marchands (+1 tous les 5 niveaux) et capacité (+200 par niveau).
- Niveau 20 = 5 marchands × 4500 capacité.

**Ambassade**
- Niveau 1 = peut rejoindre alliance.
- Niveau 3 = peut créer alliance.
- Capacité d'une alliance = 9 + 3 × niveau ambassade du chef. Niveau 20 = 69 membres.

**Murailles** (skin par faction)
- Légion → muraille de pierre : +3% défense par niveau, cap +60% niveau 20.
- Horde → palissade : +2% défense par niveau, cap +40%.
- Ordre → rempart fortifié : +4% défense par niveau, cap +80%.

**Entrepôt** / **Grenier**
- Niveau 1 cap = +400 (par-dessus la base 800), donc cap effectif village = 1200.
- Empilable jusqu'à 3 du même type. Cap final niveau 20 ×3 = ~240 000.

**Caché**
- Niveau 1 = 100 ressources de chaque protégées du loot.
- Niveau 20 = 4000 de chaque protégées.
- Très utile pour les petits joueurs : un attaquant ne peut PAS voler ce qui est caché.

### Champs de ressources

- 4 cases fixes périphériques. Ne consomment pas de slot du centre.
- Niveau 1 → niveau 20.
- Coûts niveau 1 : 100/40/30/30 (bûcheron) – ajustés selon ressource.
- Croissance coût ×1.5, temps ×1.6.
- Niveau 1-10 : pas de prérequis.
- Niveau 11-20 : nécessite hôtel de ville ≥ 10.

---

## 4. Carte monde

### Grille

- Taille : **100 × 100 = 10 000 cases**.
- Coordonnées (x, y) ∈ [-50, +50].
- Centre (0, 0) = **Cité Suprême**, siège des merveilles (cf. chap. 10).
- Plus on est proche du centre, plus la zone est convoitée et richement défendue.

### Types de cases

| Type | Proportion cible | Description |
|---|---|---|
| Village joueur | jusqu'à 30% à terme | Créé à l'inscription |
| Oasis | 5% | Bonus prod passif si conquise par village adjacent. Défendue par animaux NPC |
| Ferme barbare (NPC) | 10% | Village statique pillable, réapparaît 24h après destruction |
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

### Ferme barbare — détail

- Niveau 1 à 10. Réapparaît avec niveau croissant selon ancienneté de la zone.
- Stockage de ressources généré au fil du temps (slow drip).
- Garnison NPC qui scale avec le niveau.
- Pillable autant que tu veux mais loot cap 50% (les barbares "cachent" la moitié de leurs richesses).
- Reset 24h après destruction complète.

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
- **Spécial** (2) : sénateur/khan/grand-maître (conquête de village inactif), colon/pionnier (fonder 2ème village premium).

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

| Unité | Coût (b/a/f/blé) | Temps | Att | DI | DC | Vit | Loot | Blé/h |
|---|---|---|---|---|---|---|---|---|
| Légionnaire | 120/100/150/30 | 25 min | 40 | 35 | 50 | 6 | 50 | 1 |
| Prétorien | 100/130/160/70 | 32 min | 30 | 65 | 35 | 5 | 20 | 1 |
| Imperator | 150/160/210/80 | 40 min | 70 | 40 | 25 | 7 | 50 | 1 |
| Equite Imperatoris | 140/160/20/40 | 30 min | 0 | 20 | 10 | 16 | 0 | 2 |
| Equite Cesaris | 550/440/320/100 | 60 min | 120 | 65 | 50 | 14 | 100 | 3 |
| Equite Legati | 200/440/520/130 | 75 min | 180 | 80 | 105 | 10 | 70 | 4 |
| Bélier | 900/360/500/70 | 90 min | 60 | 30 | 75 | 4 | 0 | 3 |
| Catapulte | 950/1350/600/90 | 110 min | 75 | 60 | 10 | 3 | 0 | 6 |
| Sénateur | 30750/27200/45000/37500 | 8 h | 50 | 40 | 30 | 4 | 0 | 5 |
| Colon | 5800/5300/7200/5500 | 5 h | 0 | 80 | 80 | 5 | 3000 | 1 |

Identité : armée disciplinée, polyvalente, légèrement orientée défense. Cavalerie lourde excellente.

### Faction Horde

| Unité | Coût (b/a/f/blé) | Temps | Att | DI | DC | Vit | Loot | Blé/h |
|---|---|---|---|---|---|---|---|---|
| Maraudeur | 95/75/40/40 | 18 min | 10 | 25 | 20 | 7 | 60 | 1 |
| Lancier | 145/70/85/40 | 22 min | 15 | 35 | 60 | 7 | 40 | 1 |
| Berserker | 130/120/170/40 | 30 min | 60 | 30 | 30 | 6 | 60 | 1 |
| Éclaireur | 160/100/50/50 | 25 min | 0 | 10 | 5 | 18 | 0 | 2 |
| Cavalier nomade | 370/270/290/75 | 45 min | 100 | 50 | 75 | 17 | 80 | 3 |
| Cavalier de fer | 450/515/480/80 | 60 min | 150 | 50 | 75 | 13 | 50 | 3 |
| Bélier | 1000/300/350/70 | 80 min | 65 | 30 | 80 | 4 | 0 | 3 |
| Trébuchet | 900/1200/600/60 | 105 min | 50 | 60 | 10 | 3 | 0 | 6 |
| Khan | 35500/26000/25000/27200 | 8 h | 40 | 60 | 40 | 5 | 0 | 6 |
| Pionnier | 7200/5500/5800/6500 | 5 h | 10 | 80 | 80 | 5 | 3500 | 2 |

Identité : raideurs rapides. Loot capacity la plus élevée du jeu, vitesse la plus haute. Peu de défense → punis si on les rattrape.

### Faction Ordre

| Unité | Coût (b/a/f/blé) | Temps | Att | DI | DC | Vit | Loot | Blé/h |
|---|---|---|---|---|---|---|---|---|
| Templier | 100/130/160/70 | 26 min | 35 | 45 | 40 | 7 | 60 | 1 |
| Hospitalier | 120/110/200/40 | 30 min | 40 | 60 | 50 | 6 | 40 | 1 |
| Frère d'armes | 140/175/270/80 | 40 min | 60 | 35 | 60 | 6 | 50 | 1 |
| Éclaireur | 100/180/100/65 | 35 min | 0 | 20 | 10 | 9 | 0 | 2 |
| Croisé | 350/320/330/75 | 50 min | 110 | 55 | 45 | 9 | 110 | 4 |
| Sergent à cheval | 270/310/440/80 | 60 min | 150 | 60 | 130 | 10 | 80 | 3 |
| Bélier | 1000/450/535/70 | 90 min | 65 | 30 | 80 | 4 | 0 | 3 |
| Catapulte | 950/1450/630/90 | 100 min | 50 | 60 | 10 | 3 | 0 | 6 |
| Grand Maître | 30750/45400/31000/37500 | 10 h | 70 | 40 | 50 | 4 | 0 | 4 |
| Colon | 5500/7000/5300/4900 | 5 h | 10 | 80 | 80 | 5 | 3000 | 1 |

Identité : bunker. Défenses individuelles élevées, vitesse moyenne, économie indulgente sur les troupes "tank". Faible mobilité offensive.

### Recherche en Académie

Chaque unité **sauf l'infanterie de base** (Légionnaire / Maraudeur / Templier) doit être recherchée en Académie avant de pouvoir être recrutée.

- Coût recherche : 3 à 5× le coût de production unitaire.
- Temps recherche : 30 min (basique) à 12 h (élite).
- Prérequis spécifiques par unité (ex. cavalerie lourde demande académie niveau 15 + écurie niveau 10).

### Forge

Améliore attaque OU défense d'une unité débloquée :
- 10 niveaux par axe (att et def séparément).
- +1.5% par niveau (max +15% par axe).
- Coûts ×2 par niveau, temps ×1.5.
- Une recherche à la fois en forge.

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
| **Raid** | Loot | Si défense survit : attaque échoue, survivants rentrent. Si défense annihilée : butin pris (capé). Pas de destruction de bâtiments. |
| **Attaque** | Destruction | Idem raid mais les engins de siège peuvent détruire 1 bâtiment au choix (béliers → muraille, catapultes → bâtiment ciblé). |
| **Soutien** | Renfort | Tes unités vont défendre un village allié (le tien ou un membre d'alliance). Le village hôte les nourrit en blé. Rappelables à tout moment. |
| **Espionnage** | Info | Éclaireurs uniquement. Si pas détecté, retour avec rapport (ressources visibles, troupes, bâtiments principaux). Détection par éclaireurs adverses. |

### Résolution de combat (formule)

Pour chaque combat :
```
puissance_attaque = somme(attaque_unite × forge_att_bonus)
puissance_defense_inf = somme(unites_inf_def × DI × forge_def_bonus)
puissance_defense_cav = somme(unites_cav_def × DC × forge_def_bonus)

# Pondération par composition de l'attaquant
ratio_inf_att = unites_inf_attaquantes / total_attaquant
puissance_defense = ratio_inf_att × puissance_defense_inf
                  + (1 - ratio_inf_att) × puissance_defense_cav

puissance_defense_avec_muraille = puissance_defense × (1 + bonus_muraille)

ratio = puissance_attaque / puissance_defense_avec_muraille

si ratio >= 1 :
    pertes_attaquant_pct = (1 / ratio)^1.5
    pertes_defenseur_pct = 100%
sinon :
    pertes_attaquant_pct = 100%
    pertes_defenseur_pct = ratio^1.5
```

Pertes appliquées proportionnellement à chaque type d'unité dans le détachement.

### Bonus muraille (rappel)

- Légion : +3% défense / niveau, cap +60% niveau 20.
- Horde : +2% défense / niveau, cap +40%.
- Ordre : +4% défense / niveau, cap +80%.

### Loot

- Capé à **30%** des ressources visibles du défenseur (= ressources totales – ressources cachées par le Caché).
- Ramené par les unités survivantes selon la **somme** de leur capacité de loot.
- Si capacité de transport < loot disponible, on prend ce qu'on peut, le reste reste au défenseur.
- Le butin retourne au village attaquant à la même vitesse que l'aller.

### Rapport de combat

Après résolution, un rapport est généré pour les deux parties :

- Forces engagées (attaquant et défenseur).
- Pertes par unité.
- Bonus appliqués (muraille, forge, soutien).
- Butin pris.
- Bâtiments détruits (si attaque + sièges).
- Suggestion stratégique courte (ex : "Renforcez votre garnison de cavalerie").

Stocké dans `imperium_reports`. Visible dans l'onglet Rapports.

---

## 7. Anti-grief

Quatre garde-fous, tous activés par défaut.

### Bouclier

- **12 heures** d'invulnérabilité après une attaque où tu as subi des **pertes significatives** (>10% de tes troupes OU >30% d'un bâtiment touché).
- Pendant le bouclier : aucune marche hostile ne peut atteindre ton village. Les marches déjà en route sont annulées (les troupes rentrent à leur base).
- Le bouclier saute **immédiatement** si tu lances toi-même une marche hostile (raid, attaque).
- À l'inscription : bouclier de bienvenue **24h**, idem condition de saut.

### Loot cap

- 30% maximum des ressources visibles par marche (cf. chap. 6).

### Range d'attaque

- Tu ne peux attaquer un joueur que si sa **puissance totale** est dans `[0.7×, 1.3×]` de la tienne.
- Puissance totale = score militaire (somme val troupes) + score bâtiments (somme val niveaux).
- **Exceptions** :
  - Joueurs inactifs >7j : pas de range.
  - Cibles NPC (oasis, fermes barbares) : pas de range.
  - Membres de la même alliance ne peuvent jamais s'attaquer.

### Inactivité

| Durée d'inactivité | Effet |
|---|---|
| < 7 jours | Comportement normal (bouclier valide) |
| ≥ 7 jours | Devient farmable sans bouclier (mais village conserve ses troupes/ressources) |
| ≥ 30 jours | Village conquérable (siège avec Sénateur/Khan/Grand Maître + hôtel attaquant niveau 20) |
| ≥ 90 jours | Village supprimé, case redevient terrain vide |

---

## 8. Alliance & social

### Création

- Niveau ambassade ≥ 3 pour fonder.
- Coût création : 5000 bois + 5000 argile + 5000 fer + 2000 blé.
- Capacité initiale : 9 + 3 × niveau ambassade du chef. Le cap augmente quand le chef monte son ambassade.

### Rôles

| Rôle | Droits |
|---|---|
| Chef | Tout : invite, exclut, dissolution, diplomatie, tag |
| Adjoint | Invite, exclut, déclare guerre |
| Diplomate | Signe NAP, propose pacte |
| Membre | Lit/écrit chat, demande soutien |

### Identité

- **Nom** : 30 caractères max.
- **Tag** : 3-4 caractères affichés à côté du pseudo joueur sur la carte.
- **Couleur** : pour le tag (palette restreinte). Bannière custom = 50 000 OS (cosmétique).

### Chat (PartyKit)

- **Salon alliance** : chat texte temps réel pour les membres uniquement.
- **Salon global** : chat all-comers du serveur Imperium, modéré.
- **Notifications serveur** : "Alliance X a déclaré la guerre à Alliance Y", "Membre Z subit une attaque", etc.

### Diplomatie

- **NAP** (non-aggression pact) : interdit attaques mutuelles. Rupture sur cooldown 24h (déclaration de fin → 24h plus tard, attaques possibles).
- **Guerre** : double les rapports d'alliance, débloque classement de guerre, supprime le NAP automatiquement.
- **Confédération** (endgame uniquement, débloquée niveau ambassade chef ≥ 15) : 2 alliances peuvent fusionner leurs scores pour le classement. Limite de membres totale = somme des caps.

### Soutien militaire

- Tu envoies un détachement à un village allié (le tien ou un membre).
- Les unités défendent le village hôte.
- Le village hôte les **nourrit en blé** (drain compté chez l'hôte, pas chez l'envoyeur).
- Rappelables à tout moment (temps de retour = temps d'aller).

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

### Achats permanents

| Achat | Coût | Conditions |
|---|---|---|
| Village secondaire | **1 000 000 OS** | Hôtel principal niveau 15. One-time. |
| Changement de faction | **100 000 OS** | Conversion 1:1 des unités existantes sur leur équivalent. |
| Renommer village | 5 000 OS | Aucune. |
| Bannière custom alliance | 50 000 OS | Niveau ambassade chef ≥ 5. Cosmétique. |

### Gains d'OS in-game (cap modéré)

Pour donner du sens au jeu sans tuer le store :

| Source | Récompense | Cap |
|---|---|---|
| Quêtes journalières | 30 OS / quête, 3 quêtes/jour | 90 OS/jour |
| Succès one-shot | 100 à 1000 OS / succès | ~30 succès → ~10 000 OS sur la durée de vie du compte |
| Classement hebdo | 100 (rang 10) à 2000 OS (rang 1) × 3 catégories | ~6 000 OS/sem max pour le top 1 dans toutes catégories |
| Conquête de merveille | 50 000 OS (au premier joueur) | One-time |

**Estimation joueur très actif** : ~25 000 OS/mois. Soit ~2-3 packs TCG, soit ~1 jour de skip 24h. Inintéressant pour rusher en pur OS, suffisant pour des coups de presse occasionnels.

---

## 10. Progression & endgame

### Pas de wipe — quel objectif long terme ?

Le persistant CoC-style nécessite des objectifs renouvelables, sinon les vétérans s'ennuient et les nouveaux abandonnent. Imperium a 3 niveaux d'objectifs imbriqués :

**Court terme (semaines 1-4)** : monter hôtel niveau 10, premier raid réussi, intégration alliance, première oasis.

**Moyen terme (mois 1-3)** : hôtel niveau 15, débloquer unités d'élite, première guerre alliance, top classement hebdo.

**Long terme (mois 3+)** : viser conquête merveille.

### Merveilles du monde

- **8 merveilles** spawnent au centre de la carte, sur les cases (-2, -2) à (+2, +2) sauf (0, 0).
- Une case merveille démarre comme un terrain vide protégé par une garnison NPC très lourde.
- Pour terminer une merveille :
  1. Conquérir une case merveille (combat contre garnison NPC).
  2. Y construire le **bâtiment "Merveille"** jusqu'au niveau **100**.
  3. Chaque niveau coûte ressources + temps croissants (niveau 100 ≈ plusieurs jours de prod max).

### Récompense de complétion

Le **premier joueur à compléter une merveille** reçoit :

- 50 000 OS.
- Titre permanent : "Premier Bâtisseur de [nom merveille]" (dans Hall of Fame).
- Bannière exclusive cosmétique.

Les autres joueurs peuvent toujours essayer de compléter les autres merveilles. Quand toutes les 8 sont terminées (probablement plusieurs mois) → **fin de saison** :

### Fin de saison (cosmétique uniquement)

- Pas de wipe.
- Reset des classements hebdo.
- Distribution de récompenses cosmétiques aux top joueurs et alliances.
- 8 nouvelles merveilles spawnent (nouveaux noms/skins).
- Le Hall of Fame conserve les Premiers Bâtisseurs des saisons précédentes.

### Titres permanents (Hall of Fame)

- "Premier Bâtisseur de [merveille]" — premier joueur à compléter une merveille.
- "Empereur / Khan / Grand Maître de [saison N]" — top 1 attaque saisonnier.
- "Sentinelle de [saison N]" — top 1 défense saisonnier.
- "Marchand de [saison N]" — top 1 économie saisonnier.

### Classements

| Classement | Période | Catégories | Récompenses |
|---|---|---|---|
| Hebdomadaire | Reset chaque dimanche soir | Attaque, défense, économie | OS (cf. chap. 9) |
| Saisonnier | Reset à fin de saison | 3 catégories + globale | Titres + cosmétiques |
| Hall of Fame | Permanent | Premiers Bâtisseurs | Titres permanents |

---

## 11. Phasing P1 → P8

Chaque phase est un livrable testable, pas une étape d'implémentation interne. Référence : phasing Eternum (P1 = foundation, P2 = bâtiments, etc.).

### P1 — Foundation (livrable jouable solo)

**Objectif** : un joueur peut s'inscrire, choisir sa faction, voir son village, upgrader des champs et l'hôtel de ville. C'est tout. Pas de combat, pas de carte, pas de social.

- Hub `/play/imperium` : création de compte, choix faction (Légion/Horde/Ordre), choix nom village.
- Vue village : layout 4 champs périphériques + grille centre 4×4.
- Au démarrage : hôtel niveau 1 placé en (1,1) du centre. Champs niveau 0.
- Production lazy 4 ressources (formule chap. 2).
- Upgrade champs (niveau 1-20), hôtel (niveau 1-10 cap pour P1).
- Entrepôt et grenier upgradables.
- Caché upgradable (utile dès P5 mais autant le mettre dispo).
- Pas de file de construction (1 upgrade en cours max).
- Tables : `imperium_villages`, `imperium_buildings`, `imperium_resources_log`.

### P2 — Bâtiments du centre

**Objectif** : tous les bâtiments existent, recherche académie possible, recrutement caserne possible (mais sans cible à attaquer).

- Caserne, écurie, atelier, académie, forge, marché, ambassade, murailles.
- Recherche en académie fonctionnelle.
- Recrutement en caserne/écurie/atelier fonctionnel (les unités s'accumulent dans le village).
- Forge fonctionnelle (bonus passifs visibles).
- Marché et ambassade : interfaces vides (à activer P6/P7).

### P3 — Carte monde

**Objectif** : explorer la carte, voir les autres joueurs, identifier les NPC.

- Génération initiale de la grille 100×100.
- Placement de tous les villages joueurs existants (migration P1 → P3).
- Génération NPC (fermes barbares + oasis) selon proportions chap. 4.
- Vue carte : grille avec zoom, click case → info.
- Fog of war (rayon 7).
- Spawn nouveau joueur en périphérie + bouclier 24h bienvenue.
- Tables : `imperium_map`.

### P4 — Militaire actif (combat NPC)

**Objectif** : envoyer une marche, résoudre un combat, voir un rapport. Cibles NPC uniquement.

- Marches sur fermes barbares + oasis.
- Engin de combat (formule chap. 6).
- Rapports textuels stockés.
- Loot et retour des troupes au village.
- Espionnage par éclaireur.
- Conquête d'oasis (devient possession passive).
- Tables : `imperium_marches`, `imperium_reports`.

### P5 — PvP

**Objectif** : attaques entre joueurs ouvertes avec tous les anti-griefs.

- Attaques joueur vs joueur (raid + attaque).
- Bouclier 12h après attaque subie.
- Range ±30%.
- Inactif >7j farmable.
- Conquête de village inactif >30j (Sénateur/Khan/Grand Maître).

### P6 — Alliance

**Objectif** : groupes sociaux fonctionnels.

- Création/dissolution alliance.
- Rôles + invitations + exclusions.
- Chat alliance (PartyKit).
- Soutien militaire (envoi/rappel).
- Notification d'attaque alliance.
- Tables : `imperium_alliances`, `imperium_alliance_members`.

### P7 — Marché & diplomatie

**Objectif** : économie d'échange et politique inter-alliance.

- Marché : ordres d'achat/vente entre joueurs (taux libres).
- Caravanes physiques (les marchands transportent, pas instantané).
- Diplomatie : NAP, guerre, confédération.
- Tables : `imperium_market_orders`, `imperium_alliance_relations`.

### P8 — Endgame (merveilles)

**Objectif** : objectif long terme, fin de saison, Hall of Fame.

- 8 merveilles spawn au centre.
- Bâtiment "Merveille" niveau 1-100.
- Récompense premier bâtisseur : 50 000 OS + titre.
- Classements hebdo + saisonnier + Hall of Fame.
- Récompenses cosmétiques saison.

---

## 12. Schéma de données

### Conventions

- Toutes les tables préfixées `imperium_`.
- Timestamps en `timestamptz`.
- Quantités de ressources en `float8` (pour la prod lazy fractionnaire).
- IDs en `uuid`.

### Tables

#### `imperium_villages`

```
id              uuid    PK
user_id         uuid    FK profiles
name            text
faction         text    'legion' | 'horde' | 'ordre'
x               int
y               int
is_secondary    boolean default false
last_tick       timestamptz
wood            float8
clay            float8
iron            float8
wheat           float8
shield_until    timestamptz nullable
created_at      timestamptz

UNIQUE (x, y)
INDEX (user_id)
```

#### `imperium_buildings`

```
id              uuid    PK
village_id      uuid    FK villages
slot            int     -- 0..15 pour le centre, -1..-4 pour les champs
kind            text    -- 'wood' | 'clay' | 'iron' | 'wheat' | 'town_hall' | 'barracks' | ...
level           int     default 0
upgrading_until timestamptz nullable

INDEX (village_id, slot)
```

#### `imperium_research`

```
id                  uuid    PK
village_id          uuid    FK villages
unit_kind           text
researched          boolean default false
researching_until   timestamptz nullable

INDEX (village_id)
```

#### `imperium_units`

```
id                          uuid    PK
village_id                  uuid    FK villages
unit_kind                   text
count                       int     default 0
recruiting_count            int     default 0
recruiting_finishes_at      timestamptz nullable

UNIQUE (village_id, unit_kind)
```

#### `imperium_marches`

```
id              uuid    PK
from_village_id uuid    FK villages
to_x            int
to_y            int
kind            text    -- 'raid' | 'attack' | 'support' | 'spy'
units           jsonb   -- { unit_kind: count }
arrives_at      timestamptz
returns_at      timestamptz nullable
state           text    -- 'outbound' | 'returning' | 'completed'
loot            jsonb   nullable

INDEX (arrives_at, state) WHERE state IN ('outbound', 'returning')
INDEX (from_village_id, state)
```

#### `imperium_reports`

```
id                  uuid    PK
attacker_id         uuid
defender_id         uuid
march_id            uuid
kind                text    -- 'raid' | 'attack' | 'spy' | 'defense'
data                jsonb   -- forces, pertes, loot, bonus
created_at          timestamptz
read_by_attacker    boolean default false
read_by_defender    boolean default false

INDEX (attacker_id, created_at)
INDEX (defender_id, created_at)
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
give_kind           text    -- 'wood' | 'clay' | 'iron' | 'wheat'
give_amount         int
take_kind           text
take_amount         int
expires_at          timestamptz
created_at          timestamptz

INDEX (give_kind, take_kind, expires_at)
```

#### `imperium_map`

```
x           int
y           int
kind        text    -- 'player_village' | 'oasis' | 'barbarian' | 'wonder' | 'empty'
village_id  uuid    nullable
data        jsonb   -- bonus oasis, troupes barbares, état merveille

PK (x, y)
INDEX (kind)
```

#### `imperium_quests`

```
id          uuid    PK
user_id     uuid
kind        text    -- 'daily_login' | 'daily_raid' | 'daily_upgrade' | ...
progress    int     default 0
target      int
claimed     boolean default false
expires_at  timestamptz

INDEX (user_id, expires_at)
```

#### `imperium_achievements`

```
id              uuid    PK
user_id         uuid
kind            text
unlocked_at     timestamptz
os_claimed      boolean default false

UNIQUE (user_id, kind)
```

### RPC critiques

- `imperium_tick(village_id)` : tick lazy d'un village. Calcule prod, termine constructions/recherches/recrutements/marches échus, met à jour `last_tick`.
- `imperium_resolve_marches()` : résout les marches dont `arrives_at < now()` et qui n'ont pas été déclenchées par un tick joueur. Peut tourner via cron Supabase léger (1× / 5 min) si on veut éviter les défenseurs offline qui découvrent leurs pertes uniquement quand ils reviennent.
- `imperium_create_village(user_id, faction, name)` : crée le village, choisit ses coordonnées (politique anti-désertification), pose hôtel niveau 1, déclenche bouclier 24h.
- `imperium_send_march(village_id, to_x, to_y, kind, units)` : valide la composition, vérifie range/bouclier, débite les unités, crée la marche.
- `imperium_skip_timer(target_id, target_kind, os_amount)` : skip de timer contre OS. Vérifie le solde OS du joueur, débite, met à jour le timer cible.

### Pattern de résolution lazy

À chaque action utilisateur (page-load village, envoi marche, achat, recrutement) :

1. Appel `imperium_tick(village_id)`.
2. Production accumulée capée par entrepôt/grenier.
3. Termine les constructions/recrutements/recherches dont le timer est passé.
4. Termine les marches arrivées au village (résout combat, calcule loot, lance retour).
5. `last_tick = now()`.

Pour les défenseurs offline : la marche reste en `state = outbound` tant que personne ne tique. Quand le défenseur ou l'attaquant revient, leur tick résout. Pour garantir un délai borné même si tous les acteurs sont offline, un cron Supabase léger appelle `imperium_resolve_marches()` toutes les 5 min (peu coûteux : un index sur `arrives_at` rend la query instantanée).

---

## Annexe A — Convention de fichiers

| Type | Emplacement |
|---|---|
| Routes Next.js | `web/app/play/imperium/` |
| Constants & types partagés | `shared/imperium-*.ts` (ex: `imperium-buildings.ts`, `imperium-units.ts`, `imperium-combat.ts`) |
| SQL Supabase | `supabase/imperium*.sql` (ex: `imperium.sql`, `imperium-units.sql`) |
| PartyKit (chat alliance) | `partykit/imperium-alliance.ts` (à confirmer P6) |
| Document de design | `docs/imperium.md` (ce fichier) |

## Annexe B — Numérique récapitulatif

| Constante | Valeur |
|---|---|
| Taille carte | 100 × 100 |
| Centre carte | (0, 0) |
| Cases merveilles | (-2,-2) à (+2,+2) hors (0,0), 8 cases |
| Distance min spawn | 5 cases |
| Rayon vision | 7 cases |
| Bouclier après attaque | 12h |
| Bouclier bienvenue | 24h |
| Loot cap | 30% |
| Range d'attaque | ±30% puissance |
| Inactivité farmable | 7 jours |
| Inactivité conquérable | 30 jours |
| Inactivité supprimée | 90 jours |
| Cap niveau hôtel | 25 |
| Cap niveau bâtiments centre | hôtel |
| Cap niveau murailles, caché | 20 |
| Cap niveau forge (par axe) | 10 |
| Cap stack entrepôt/grenier | 3 |
| Cap oasis par village | 3 |
| Cap niveau merveille | 100 |
| Skip 1h | 5 000 OS |
| Skip 4h | 15 000 OS |
| Skip 12h | 35 000 OS |
| Skip 24h | 50 000 OS |
| 2ème village | 1 000 000 OS |
| Changement faction | 100 000 OS |
| Récompense Premier Bâtisseur | 50 000 OS |
