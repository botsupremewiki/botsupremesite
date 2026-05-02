-- ═════════════════════════════════════════════════════════════════════════
-- POKÉMON TCG — SQL consolidé idempotent
-- ═════════════════════════════════════════════════════════════════════════
--
-- Ce script regroupe TOUT ce qui est nécessaire pour que le TCG Pokémon
-- fonctionne de bout en bout :
--   • Tables : tcg_cards_owned, tcg_decks, tcg_tutorial_completion
--   • Colonnes profiles : tcg_free_packs, tcg_quest_state
--   • RPCs : collection, free packs, decks, tutoriel, bot wins
--   • Trigger handle_new_user (pas de packs auto au signup)
--
-- À lancer dans le SQL Editor Supabase. 100% idempotent : safe à re-exécuter
-- autant de fois que tu veux. `create table if not exists`,
-- `create or replace function`, `drop policy if exists` partout.
--
-- Si une de tes tables existe déjà : aucun risque, on garde les data.
-- Si tu n'as rien : tout sera créé from scratch.
--
-- ═════════════════════════════════════════════════════════════════════════


-- ─── 1. Colonnes profiles ──────────────────────────────────────────────────
-- tcg_free_packs : { "pokemon": 10, "onepiece": 5, ... } — boosters offerts
-- tcg_quest_state : état journalier des quêtes bot (3 victoires = 1 pack)

alter table public.profiles
  add column if not exists tcg_free_packs jsonb not null default '{}'::jsonb;

alter table public.profiles
  add column if not exists tcg_quest_state jsonb not null default '{}'::jsonb;


-- ─── 2. Table : tcg_cards_owned (collection) ───────────────────────────────

create table if not exists public.tcg_cards_owned (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  card_id text not null,
  count int not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id, card_id)
);

alter table public.tcg_cards_owned enable row level security;

drop policy if exists "tcg_read_own" on public.tcg_cards_owned;
create policy "tcg_read_own"
  on public.tcg_cards_owned
  for select
  using (auth.uid() = user_id);


-- ─── 3. Table : tcg_decks (deck builder) ───────────────────────────────────

create table if not exists public.tcg_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  name text not null,
  cards jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Colonne énergies (Pocket : 1 à 3 types choisis manuellement)
alter table public.tcg_decks
  add column if not exists energy_types text[] not null default '{}';

-- Colonne leader (One Piece : carte hors deck, requise pour ce game_id).
-- Pour Pokémon/LoR : null. CRITIQUE : sans cette colonne fetchTcgDecks
-- côté PartyKit échoue (SELECT référence leader_id) → 0 decks affichés.
alter table public.tcg_decks
  add column if not exists leader_id text;

-- Colonnes régions (Legends of Runeterra : 1-2 régions par deck).
-- Idem critique : fetchTcgDecks la SELECT.
alter table public.tcg_decks
  add column if not exists regions text[] not null default '{}';

-- Partage de decks (deck public + code court à 6 chars).
-- Idem critique : fetchTcgDecks SELECT is_public et share_code.
alter table public.tcg_decks
  add column if not exists is_public boolean not null default false;
alter table public.tcg_decks
  add column if not exists share_code text;

create unique index if not exists tcg_decks_share_code_unique
  on public.tcg_decks (share_code) where share_code is not null;
create index if not exists tcg_decks_public_idx
  on public.tcg_decks (game_id, is_public, updated_at desc)
  where is_public = true;

create index if not exists tcg_decks_user_game_idx
  on public.tcg_decks (user_id, game_id);

alter table public.tcg_decks enable row level security;

-- Lecture : ses propres decks OU les decks publics.
drop policy if exists "tcg_decks_read_own" on public.tcg_decks;
drop policy if exists "tcg_decks_read_public_or_own" on public.tcg_decks;
create policy "tcg_decks_read_public_or_own"
  on public.tcg_decks
  for select
  using (auth.uid() = user_id or is_public = true);


-- ─── 4. Table : tcg_tutorial_completion (FIX du bug tuto qui revient) ──────

create table if not exists public.tcg_tutorial_completion (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.tcg_tutorial_completion enable row level security;

drop policy if exists "tcg_tutorial_completion_read_own" on public.tcg_tutorial_completion;
create policy "tcg_tutorial_completion_read_own"
  on public.tcg_tutorial_completion for select
  using (auth.uid() = user_id);


-- ─── 5. RPC : add_cards_to_tcg_collection (PartyKit utilise service_role) ──

create or replace function public.add_cards_to_tcg_collection(
  p_user_id uuid,
  p_game_id text,
  p_cards jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb;
begin
  for c in select * from jsonb_array_elements(p_cards)
  loop
    insert into public.tcg_cards_owned (user_id, game_id, card_id, count)
    values (
      p_user_id,
      p_game_id,
      c->>'card_id',
      (c->>'count')::int
    )
    on conflict (user_id, game_id, card_id)
    do update set
      count = public.tcg_cards_owned.count + (c->>'count')::int,
      updated_at = now();
  end loop;
end;
$$;


-- ─── 6. RPC : consume_tcg_free_pack ────────────────────────────────────────

create or replace function public.consume_tcg_free_pack(
  p_user_id uuid,
  p_game_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  free_count int;
begin
  select coalesce((tcg_free_packs->>p_game_id)::int, 0) into free_count
  from public.profiles
  where id = p_user_id
  for update;

  if free_count > 0 then
    update public.profiles
    set
      tcg_free_packs = jsonb_set(
        coalesce(tcg_free_packs, '{}'::jsonb),
        array[p_game_id],
        to_jsonb(free_count - 1)
      ),
      updated_at = now()
    where id = p_user_id;
    return true;
  end if;
  return false;
end;
$$;


-- ─── 7. RPC : record_tcg_bot_win (3 victoires bot/jour = 1 pack gratuit) ──

create or replace function public.record_tcg_bot_win(
  p_user_id uuid,
  p_game_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  game_state jsonb;
  today_date date := current_date;
  state_date date;
  wins int;
  rewarded boolean;
  granted boolean := false;
begin
  select coalesce(tcg_quest_state -> p_game_id, '{}'::jsonb) into game_state
  from public.profiles
  where id = p_user_id
  for update;

  state_date := nullif(game_state->>'date', '')::date;
  wins := coalesce((game_state->>'bot_wins')::int, 0);
  rewarded := coalesce((game_state->>'rewarded')::boolean, false);

  if state_date is null or state_date <> today_date then
    wins := 0;
    rewarded := false;
  end if;

  wins := wins + 1;

  if wins >= 3 and not rewarded then
    update public.profiles
    set tcg_free_packs = jsonb_set(
      coalesce(tcg_free_packs, '{}'::jsonb),
      array[p_game_id],
      to_jsonb(coalesce((tcg_free_packs->>p_game_id)::int, 0) + 1)
    )
    where id = p_user_id;
    granted := true;
    rewarded := true;
  end if;

  update public.profiles
  set
    tcg_quest_state = jsonb_set(
      coalesce(tcg_quest_state, '{}'::jsonb),
      array[p_game_id],
      jsonb_build_object(
        'date', today_date::text,
        'bot_wins', wins,
        'rewarded', rewarded
      )
    ),
    updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('bot_wins', wins, 'granted', granted);
end;
$$;


-- ─── 8. RPC : save_tcg_deck (avec cap 20 decks + energy_types) ────────────

drop function if exists public.save_tcg_deck(uuid, text, uuid, text, jsonb);
drop function if exists public.save_tcg_deck(uuid, text, uuid, text, jsonb, text[]);

create or replace function public.save_tcg_deck(
  p_user_id uuid,
  p_game_id text,
  p_id uuid,
  p_name text,
  p_cards jsonb,
  p_energy_types text[] default '{}'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  total_count int;
  max_dupes int;
  trimmed_name text;
  new_id uuid;
  energy_count int;
  current_deck_count int;
begin
  trimmed_name := trim(p_name);
  if trimmed_name is null or length(trimmed_name) = 0 then
    raise exception 'Nom de deck vide';
  end if;
  if length(trimmed_name) > 40 then
    trimmed_name := substring(trimmed_name from 1 for 40);
  end if;

  -- Total cartes = 20.
  select coalesce(sum((c->>'count')::int), 0)
  into total_count
  from jsonb_array_elements(p_cards) as c;
  if total_count <> 20 then
    raise exception 'Le deck doit contenir exactement 20 cartes (actuellement %)', total_count;
  end if;

  -- Max 2 copies par carte.
  select coalesce(max((c->>'count')::int), 0)
  into max_dupes
  from jsonb_array_elements(p_cards) as c;
  if max_dupes > 2 then
    raise exception 'Pas plus de 2 copies par carte (actuellement %)', max_dupes;
  end if;

  -- 1 à 3 types d'énergie sélectionnés (Pocket).
  energy_count := coalesce(array_length(p_energy_types, 1), 0);
  if energy_count < 1 or energy_count > 3 then
    raise exception 'Sélectionne entre 1 et 3 types d''énergie (actuellement %)', energy_count;
  end if;

  if p_id is null then
    -- Cap 20 decks par game_id pour ce user (uniquement à la création).
    select count(*)
    into current_deck_count
    from public.tcg_decks
    where user_id = p_user_id and game_id = p_game_id;
    if current_deck_count >= 20 then
      raise exception 'Limite de 20 decks atteinte pour ce jeu. Supprime un deck existant pour en créer un nouveau.';
    end if;

    insert into public.tcg_decks (user_id, game_id, name, cards, energy_types)
    values (p_user_id, p_game_id, trimmed_name, p_cards, p_energy_types)
    returning id into new_id;
  else
    update public.tcg_decks
    set
      name = trimmed_name,
      cards = p_cards,
      energy_types = p_energy_types,
      updated_at = now()
    where id = p_id and user_id = p_user_id and game_id = p_game_id
    returning id into new_id;
    if new_id is null then
      raise exception 'Deck introuvable';
    end if;
  end if;
  return new_id;
end;
$$;


-- ─── 9. RPC : delete_tcg_deck ─────────────────────────────────────────────

create or replace function public.delete_tcg_deck(
  p_user_id uuid,
  p_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.tcg_decks
  where id = p_id and user_id = p_user_id;
end;
$$;


-- ─── 10. RPC : complete_tcg_tutorial (v3 — boosters uniquement) ───────────
-- Insère dans tcg_tutorial_completion (idempotent), crédite +10 boosters
-- la 1ère fois pour les 3 jeux supportés. Aucune récompense OS.

create or replace function public.complete_tcg_tutorial(p_game_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_first boolean := false;
  v_packs int := 0;
  v_current_packs jsonb;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  insert into public.tcg_tutorial_completion (user_id, game_id)
  values (v_user_id, p_game_id)
  on conflict (user_id, game_id) do nothing;
  -- Si l'INSERT a réellement créé une ligne (= 1ère fois), récompense.
  get diagnostics v_first = row_count;
  if v_first then
    -- 10 boosters gratuits pour les TCG supportés (pokemon, onepiece, lol).
    -- Plus de bonus OS — la récompense est uniquement les boosters.
    if p_game_id in ('pokemon', 'onepiece', 'lol') then
      v_packs := 10;
      select coalesce(tcg_free_packs, '{}'::jsonb)
      into v_current_packs
      from public.profiles
      where id = v_user_id;
      update public.profiles
      set tcg_free_packs = jsonb_set(
            v_current_packs,
            array[p_game_id],
            to_jsonb(
              coalesce((v_current_packs->>p_game_id)::int, 0) + v_packs
            ),
            true
          ),
          updated_at = now()
      where id = v_user_id;
    end if;
  end if;
  -- reward_gold reste à 0 (compat client v1/v2, plus utilisé).
  return jsonb_build_object(
    'first_time', v_first,
    'reward_gold', 0,
    'reward_packs', v_packs
  );
end;
$$;


-- ─── 11. RPC : has_completed_tcg_tutorial ─────────────────────────────────
-- Le hub Pokémon appelle cette RPC à chaque visite pour décider s'il faut
-- rediriger vers le tuto.

create or replace function public.has_completed_tcg_tutorial(p_game_id text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tcg_tutorial_completion
    where user_id = auth.uid() and game_id = p_game_id
  );
$$;


-- ─── 12. Trigger handle_new_user (pas de packs auto au signup) ────────────
-- Le user obtient ses 10 boosters EN COMPLÉTANT LE TUTORIEL, pas au signup.
-- Le bonus 1000 OS reste via la default value de profiles.gold.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'user_name',
      'Joueur-' || substring(new.id::text, 1, 6)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;


-- ─── 13. Permissions ──────────────────────────────────────────────────────

grant execute on function public.complete_tcg_tutorial(text) to authenticated;
grant execute on function public.has_completed_tcg_tutorial(text) to authenticated;


-- ═════════════════════════════════════════════════════════════════════════
-- HELPERS DEBUG (commentés — décommenter au besoin)
-- ═════════════════════════════════════════════════════════════════════════

-- Reset le tuto pour un user (pour tester depuis zéro) :
--   delete from public.tcg_tutorial_completion where user_id = auth.uid();
--   update public.profiles set tcg_free_packs = '{}'::jsonb where id = auth.uid();

-- Vérifier que les tables existent :
--   select table_name from information_schema.tables
--   where table_schema = 'public' and table_name in (
--     'tcg_cards_owned', 'tcg_decks', 'tcg_tutorial_completion'
--   );

-- Vérifier que les RPCs existent :
--   select routine_name from information_schema.routines
--   where routine_schema = 'public' and routine_name in (
--     'add_cards_to_tcg_collection', 'consume_tcg_free_pack',
--     'record_tcg_bot_win', 'save_tcg_deck', 'delete_tcg_deck',
--     'complete_tcg_tutorial', 'has_completed_tcg_tutorial'
--   );
