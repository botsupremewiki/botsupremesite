# One Piece TCG — Checklist QA

Ce document liste les scénarios à valider manuellement avant un release.
À cocher dans l'ordre. Tests unitaires des effets : `cd party && npm test`
(40+ tests dans `party/test/onepiece-effects.test.ts`).

## 1. Onboarding nouveau joueur

- [ ] Créer un nouveau compte (signup OAuth Discord ou email)
- [ ] Vérifier réception **10 free packs** OnePiece dans le hub
- [ ] Ouvrir 1 pack → vérifier 5 cartes ajoutées à la collection
- [ ] Tagline du lobby OnePiece dit bien « clone fidèle Bandai » (pas « combat à venir »)
- [ ] Page `/play/tcg/onepiece/regles` accessible et lisible (objectif, deck, phases, mots-clés, tutoriel, récompenses)

## 2. Deck builder

- [ ] Créer un nouveau deck → choisir un Leader → ajouter 50 cartes
- [ ] Validation côté serveur : essayer de save avec 49 / 51 cartes → refus
- [ ] Validation : 5 copies d'une même carte → refus (max 4)
- [ ] Validation : carte hors couleur du Leader → refus côté UI
- [ ] Sauvegarde / édition / suppression de deck OK

## 3. Combat vs Bot

- [ ] Lancer un combat vs Bot avec un deck OnePiece valide
- [ ] **Mulligan** : refuser → main inchangée ; accepter → 5 nouvelles cartes
- [ ] **Tour 1 P1** : pas d'attaque autorisée (règle officielle)
- [ ] **Phase pioche** : 1 carte ajoutée à la main (sauf 1er tour)
- [ ] **Phase DON** : 1 DON au 1er tour, 2 DON ensuite
- [ ] **Phase principale** :
  - [ ] Jouer un Persos (paie le coût en DON)
  - [ ] Jouer un **Évent [Principale]** depuis la main (cost paid, va à la défausse, effet appliqué)
  - [ ] Jouer un **Lieu** (remplace le Lieu existant)
  - [ ] Attacher des DON au Leader / Persos (+1000 power chacun)
  - [ ] Activer un effet `[Activation : Principale]` (Doc Q, Hina, Garp, etc.)
  - [ ] Attaquer Leader adverse → vie prise (+ trigger possible)
  - [ ] Attaquer Persos adverse rested → KO si power ≥
- [ ] **Défense** :
  - [ ] Bloquer avec un Persos rested ayant `[Bloqueur]`
  - [ ] Counter avec un Persos discard (valeur counter 1000/2000)
  - [ ] Counter avec un **Évent [Contre]** (gratuit, depuis le panneau de défense)
  - [ ] Laisser passer
- [ ] **Trigger révélé** : OUI active l'effet, NON ignore → carte va à la main
- [ ] **Hover sur une carte** : preview agrandi avec effet complet
- [ ] **Animations** : carte arrive en jeu (fade-in scale), KO (fade-out + rotation), DON attached (pulse)
- [ ] **Bandeau** : pas de "Phase 3a — squelette" visible
- [ ] **Bouton « Règles »** ouvre la page règles dans un nouvel onglet

## 4. Récompenses & progression

- [ ] **Bot win** : log `+100 OS (victoire bot)` ; profil gold +100
- [ ] **3e bot win du jour** : log `🎁 Quête remplie ! +1 booster gratuit` + free pack incrémenté
- [ ] **PvP fun win** : `+500 OS` gagnant, `+100 OS` perdant
- [ ] **PvP ranked win** : `+1000 OS + 1 booster gratuit` gagnant, `+200 OS` perdant + ELO ajusté
- [ ] **Pioche deck vide** : tu perds immédiatement (deck-out loss)

## 5. Anti-AFK timer

- [ ] **PvP** : laisser passer 90s en main phase → auto end-turn
- [ ] **Défense** : ne pas répondre 30s → auto-pass défense
- [ ] **Trigger** : ne pas répondre 15s → auto-décline
- [ ] **PendingChoice** : 30s → auto-skip (ou auto-dismiss si non-cancellable)
- [ ] **Mulligan** : 30s → auto-passé pour les seats sans décision
- [ ] **Bot mode** : pas de timer (pas d'enjeu PvP)
- [ ] Indicateur ⏱ visible côté client, devient rouge à ≤10s

## 6. Mots-clés et mécaniques de cartes

Tester chaque mot-clé sur un cas précis :

- [ ] **[Initiative]** : Persos attaque le tour où il est joué (Shanks Char OP09-004)
- [ ] **[Double attaque]** : touche Leader → 2 Vies prises
- [ ] **[Bloqueur]** : redirige une attaque sur le Persos ayant le keyword
- [ ] **[Exil]** : Robin Leader OP09-062 inflige des dégâts → Vie révélée va directement en Défausse, pas de Trigger
- [ ] **[Déclenchement]** : Vie avec trigger révélée → choix activer/passer
- [ ] **[Contre]** : Tourbillon noir, Black Hole, Soul Franky, etc. — jouables seulement en défense
- [ ] **[Activation : Principale]** : Doc Q, Lim, Baggy, Stronger, etc. — limité à `[Une fois par tour]` quand applicable

## 7. Effets complexes (à tester avec scénarios précis)

### Cancellation d'effets
- [ ] **OP09-093 Marshall D. Teach** : annule effets Leader adv + Persos adv + cannot attack
- [ ] **OP09-081 Leader Teach** : passif annule mes [Jouée] ; active annule [Jouée] adverses 1 tour
- [ ] **OP09-097 Tourbillon noir** : -4000 + cancel cible
- [ ] **OP09-098 Black Hole** : cancel + KO si coût ≤ 4

### KO substitution
- [ ] **ST20-002 Charlotte Cracker** : KO par effet → mill 1 vie au lieu (1/turn)
- [ ] **OP09-012 Monster** : un Bonk Punch own KO par effet → Monster sacrifié à la place

### Status flags
- [ ] **ST19-001 Smoker** : 2 chars adv ≤4 cost → cannot attack jusqu'à fin du prochain tour adverse
- [ ] **OP09-014 Limejuice** : 1 char adv ≤4000 power → noBlocker pour ce tour
- [ ] **ST21-003 Sanji** : Persos Chapeau 6000+ → si attaque, opp peut pas activer [Bloqueur]
- [ ] **OP09-084 Catarina Devon** : 3-way choice (Bloqueur / Double / Exil) jusqu'à fin du prochain tour adverse
- [ ] **ST15-001 Atmos** : Newgate Leader → no-take-life-by-effect ce tour

### Win conditions
- [ ] **OP09-118 Roger Leader** : si adv active [Bloqueur] alors que l'un des 2 a 0 Vie → victoire immédiate

### Cost passive
- [ ] **OP09-061 Luffy Leader** : [DON x1] +1 cost à TOUS mes Persos joués depuis la main (+ ciblage maxCost en tient compte)
- [ ] **OP09-061 Luffy Leader** : 2+ DON renvoyées en 1 action → +1 DON active + 1 DON rested du DON deck

### Hooks specifics
- [ ] **OP09-074 Bepo** : on-don-returned [Votre tour] [1/turn] → buff +1000 leader/perso
- [ ] **OP09-032 Rosinante** : on-being-attacked [Tour adverse] [1/turn] → untap self
- [ ] **OP09-080 Thousand Sunny (Stage)** : on-leave-field — Persos Chapeau quitte par effet adverse → +1 DON

### UI flows complexes
- [ ] **OP09-018 Disparais** : sélection de 1-2 Persos avec power combiné ≤ 4000
- [ ] **ST17-004 Hancock** : reorder UI 3 cartes (drag up/down + radio top/bottom)
- [ ] **ST20-001 Katakuri** : flip 1 vie face up + give DON
- [ ] **OP09-050 Nami** : on-attack search Évent bleu

## 8. Robustesse

- [ ] **Reconnexion** : fermer onglet pendant un match → revenir → state restauré
- [ ] **Anti-double-connect** : ouvrir 2 onglets sur le même match → 2e refusé
- [ ] **Validation serveur** : modifier un message client en console (forcer cost=0) → serveur rejette
- [ ] **KO en chaîne** : Cracker (mill life) → Sunny (DON) → Bepo (buff) — pas de boucle infinie
- [ ] **Game over propre** : abandon, vies à 0, deck-out → log `🏁 Victoire` + record en DB

## 9. Persistence DB

- [ ] **battle_history** : 1 row par PvP match
- [ ] **battle_logs** : 1 row par match (incluant bot) avec log complet jsonb
- [ ] **tcg_decks** : sauvegarde / chargement OK
- [ ] **profiles.gold** : updates OK (achat pack, récompense match)
- [ ] **profiles.tcg_free_packs** : décrément à l'ouverture, increment aux récompenses
- [ ] **profiles.tcg_elo** : update au ranked match seulement

## 10. Mobile

- [ ] Combat utilisable sur écran 375px de large (iPhone SE)
- [ ] Hand cards : 16px de large mobile, lisibles
- [ ] Hover preview : ne sort pas de l'écran
- [ ] Boutons cliquables (pas trop petits)

## Bugs connus à NE PAS oublier

(Ajouter ici les bugs trouvés en QA, à corriger avant release)

- ...
