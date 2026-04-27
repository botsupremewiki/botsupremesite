-- TCG WIPE — exécuter dans Supabase SQL Editor pour repartir de zéro avec
-- le nouveau set Pokémon (151 × 3 raretés). Anciens IDs (g1-001, g1-006…)
-- sont remplacés par les nouveaux (g1-001-common, g1-001-rare,
-- g1-001-holo-rare). Le user a explicitement validé le wipe (cf. session).

-- 1. Cartes possédées (toutes les collections de tous les joueurs)
truncate table public.tcg_cards_owned restart identity cascade;

-- 2. Decks (tous les joueurs)
truncate table public.tcg_decks restart identity cascade;

-- 3. Marché (annonces actives + favoris)
truncate table public.tcg_card_listings restart identity cascade;
truncate table public.tcg_card_favorites restart identity cascade;

-- 4. Historique des combats (ELO ranked, replays)
truncate table public.battle_history restart identity cascade;

-- 5. Reset des champs profils liés au TCG :
--    free_packs (boosters offerts par jeu), elo (ranking par jeu),
--    quest_state (quêtes quotidiennes en cours).
update public.profiles
set
  tcg_free_packs = '{}'::jsonb,
  tcg_elo = '{}'::jsonb,
  tcg_quest_state = '{}'::jsonb
where
  tcg_free_packs is not null
  or tcg_elo is not null
  or tcg_quest_state is not null;

-- 6. Vérification — devrait retourner 0 partout :
-- select count(*) from public.tcg_cards_owned;
-- select count(*) from public.tcg_decks;
-- select count(*) from public.tcg_card_listings;
