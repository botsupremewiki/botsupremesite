-- Fix critique : ajoute les colonnes manquantes à tcg_decks
--
-- BUG : le PartyKit `fetchTcgDecks` fait
--   SELECT id, game_id, name, cards, energy_types, leader_id, regions,
--          is_public, share_code, updated_at
-- Si l'une des 4 dernières colonnes manque, PostgREST renvoie 400 et le
-- catch{} de fetchTcgDecks renvoie [] silencieusement → "0 decks" affichés
-- alors que les decks existent bien dans la table.
--
-- Cette migration ajoute les 4 colonnes manquantes (leader_id, regions,
-- is_public, share_code) avec les index/policy associés. Idempotent.
-- ──────────────────────────────────────────────────────────────────────

-- Leader (One Piece TCG : carte hors deck, requise).
-- Pour Pokémon/LoR : null.
alter table public.tcg_decks
  add column if not exists leader_id text;

-- Régions (Legends of Runeterra : 1-2 régions choisies).
alter table public.tcg_decks
  add column if not exists regions text[] not null default '{}';

-- Partage : deck public + code court 6 caractères.
alter table public.tcg_decks
  add column if not exists is_public boolean not null default false;
alter table public.tcg_decks
  add column if not exists share_code text;

create unique index if not exists tcg_decks_share_code_unique
  on public.tcg_decks (share_code) where share_code is not null;
create index if not exists tcg_decks_public_idx
  on public.tcg_decks (game_id, is_public, updated_at desc)
  where is_public = true;

-- Policy : lecture des siens OU des publics.
drop policy if exists "tcg_decks_read_own" on public.tcg_decks;
drop policy if exists "tcg_decks_read_public_or_own" on public.tcg_decks;
create policy "tcg_decks_read_public_or_own"
  on public.tcg_decks
  for select
  using (auth.uid() = user_id or is_public = true);


-- ──────────────────────────────────────────────────────────────────────
-- Vérification après run :
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'tcg_decks'
--   order by ordinal_position;
--
-- Tu dois voir : id, user_id, game_id, name, cards, created_at,
-- updated_at, energy_types, leader_id, regions, is_public, share_code.
-- ──────────────────────────────────────────────────────────────────────
