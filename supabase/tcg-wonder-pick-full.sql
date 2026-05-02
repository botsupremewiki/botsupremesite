-- Wonder Pick v2 — version FULL idempotente, defensive contre tous les
-- états initiaux possibles :
--   • Cas A : la v1 a été exécutée → on cleanup proprement (cascade)
--   • Cas B : la v1 n'a jamais été exécutée → les DROP IF EXISTS
--     passent silencieusement, pas d'erreur
--   • Cas C : la v2 a déjà été exécutée → idempotent, ne casse rien
--
-- Différence vs tcg-wonder-pick-v2.sql : on utilise DROP ... CASCADE
-- partout où c'est sûr (les fonctions/tables ne sont référencées que
-- dans le scope wonder pick, donc CASCADE est safe). Ça évite les
-- erreurs "trigger does not exist on table" quand la table n'existe
-- pas.
--
-- Spec :
--   • Trigger : à l'ouverture d'un pack GRATUIT (pas achat OS)
--   • Pool : 1 entrée max par membre — la "best card" du dernier pack
--     gratuit. Replace si le membre ouvre un nouveau pack gratuit.
--   • Display : section dans /boosters
--   • 5 cartes face cachée mélangées
--   • 1 wonder pick par jour par user (cooldown 24h)
--   • Le user CHOISIT 1 carte sur 5 (vraie pick)
--   • Crystaux v1 supprimés
-- ──────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 1 : Cleanup v1 (defensive, ne plante pas si déjà absent)
-- ═══════════════════════════════════════════════════════════════════════

-- DROP des fonctions v1 avec CASCADE → enlève automatiquement leurs
-- triggers dépendants (pas besoin de DROP TRIGGER explicite).
drop function if exists public._tcg_wonder_pick_on_battle() cascade;
drop function if exists public._tcg_wonder_pick_cleanup() cascade;
drop function if exists public.wonder_pick_perform(text) cascade;
drop function if exists public.wonder_pick_pool_preview(text) cascade;

-- DROP de la table v1 (schéma incompatible : v1 = 1 row par pack ouvert,
-- v2 = 1 row par user/game). CASCADE pour les FK/policies.
drop table if exists public.tcg_wonder_pick_pool cascade;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 2 : Création de la nouvelle structure v2
-- ═══════════════════════════════════════════════════════════════════════

-- Table : pool 1-par-user/game
create table public.tcg_wonder_pick_pool (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  card_id text not null,
  opener_username text not null,
  pack_type text,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create index tcg_wonder_pick_pool_game_idx
  on public.tcg_wonder_pick_pool (game_id, created_at desc);

alter table public.tcg_wonder_pick_pool enable row level security;
drop policy if exists "tcg_wonder_pick_pool_read_all" on public.tcg_wonder_pick_pool;
create policy "tcg_wonder_pick_pool_read_all"
  on public.tcg_wonder_pick_pool for select using (true);

-- Sessions wonder pick en cours (entre wonder_pick_start et _pick).
create table if not exists public.tcg_wonder_pick_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  card_ids text[] not null,
  opener_usernames text[] not null,
  created_at timestamptz not null default now()
);

create index if not exists tcg_wonder_pick_sessions_user_idx
  on public.tcg_wonder_pick_sessions (user_id, created_at desc);

alter table public.tcg_wonder_pick_sessions enable row level security;
drop policy if exists "tcg_wonder_pick_sessions_read_own"
  on public.tcg_wonder_pick_sessions;
create policy "tcg_wonder_pick_sessions_read_own"
  on public.tcg_wonder_pick_sessions for select using (auth.uid() = user_id);

-- Colonne profile pour tracker le dernier wonder pick (cooldown 1/jour).
alter table public.profiles
  add column if not exists last_wonder_pick_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 3 : RPCs (4 fonctions)
-- ═══════════════════════════════════════════════════════════════════════

-- 1) wonder_pick_upsert : appelée par PartyKit après chaque pack GRATUIT.
--    UPSERT car 1 entrée max par user/game.
create or replace function public.wonder_pick_upsert(
  p_user_id uuid,
  p_game_id text,
  p_card_id text,
  p_opener_username text,
  p_pack_type text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tcg_wonder_pick_pool (
    user_id, game_id, card_id, opener_username, pack_type, created_at
  )
  values (
    p_user_id, p_game_id, p_card_id, p_opener_username, p_pack_type, now()
  )
  on conflict (user_id, game_id) do update
    set card_id = excluded.card_id,
        opener_username = excluded.opener_username,
        pack_type = excluded.pack_type,
        created_at = now();
end;
$$;

-- 2) wonder_pick_status : { can_pick, hours_until_reset, pool_size }
create or replace function public.wonder_pick_status(p_game_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_last timestamptz;
  v_pool_size int;
  v_hours numeric;
  v_can_pick boolean;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  select last_wonder_pick_at into v_last
  from public.profiles where id = v_user_id;
  select count(*) into v_pool_size
  from public.tcg_wonder_pick_pool
  where game_id = p_game_id and user_id <> v_user_id;
  if v_last is null or now() - v_last >= interval '24 hours' then
    v_can_pick := true;
    v_hours := 0;
  else
    v_can_pick := false;
    v_hours := extract(epoch from (v_last + interval '24 hours' - now())) / 3600.0;
  end if;
  return jsonb_build_object(
    'can_pick', v_can_pick,
    'hours_until_reset', v_hours,
    'pool_size', v_pool_size
  );
end;
$$;

-- 3) wonder_pick_start : démarre une session, sample 5 cartes random.
create or replace function public.wonder_pick_start(p_game_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_last timestamptz;
  v_session_id uuid;
  v_card_ids text[];
  v_usernames text[];
  v_pool_count int;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  select last_wonder_pick_at into v_last
  from public.profiles where id = v_user_id;
  if v_last is not null and now() - v_last < interval '24 hours' then
    raise exception 'Wonder Pick déjà utilisé aujourd''hui. Reviens dans 24h.';
  end if;
  select count(*) into v_pool_count
  from public.tcg_wonder_pick_pool
  where game_id = p_game_id and user_id <> v_user_id;
  if v_pool_count < 5 then
    raise exception 'Pool Wonder Pick insuffisant (% / 5). Reviens quand d''autres joueurs auront ouvert des packs gratuits.', v_pool_count;
  end if;
  select array_agg(card_id), array_agg(opener_username)
  into v_card_ids, v_usernames
  from (
    select card_id, opener_username
    from public.tcg_wonder_pick_pool
    where game_id = p_game_id and user_id <> v_user_id
    order by random()
    limit 5
  ) sub;
  delete from public.tcg_wonder_pick_sessions
  where user_id = v_user_id
    and created_at < now() - interval '30 minutes';
  insert into public.tcg_wonder_pick_sessions (user_id, game_id, card_ids, opener_usernames)
  values (v_user_id, p_game_id, v_card_ids, v_usernames)
  returning id into v_session_id;
  return jsonb_build_object(
    'session_id', v_session_id,
    'count', array_length(v_card_ids, 1)
  );
end;
$$;

-- 4) wonder_pick_pick : finalise — récupère la carte à l'index, crédite,
--    marque cooldown.
create or replace function public.wonder_pick_pick(
  p_session_id uuid,
  p_index int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session record;
  v_card_id text;
  v_username text;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  if p_index < 0 or p_index > 4 then
    raise exception 'Index invalide (doit être 0-4)';
  end if;
  select * into v_session
  from public.tcg_wonder_pick_sessions
  where id = p_session_id and user_id = v_user_id
  for update;
  if v_session is null then
    raise exception 'Session Wonder Pick introuvable ou expirée';
  end if;
  if array_length(v_session.card_ids, 1) <= p_index then
    raise exception 'Index hors bornes';
  end if;
  v_card_id := v_session.card_ids[p_index + 1];
  v_username := v_session.opener_usernames[p_index + 1];
  insert into public.tcg_cards_owned (user_id, game_id, card_id, count)
  values (v_user_id, v_session.game_id, v_card_id, 1)
  on conflict (user_id, game_id, card_id) do update
    set count = public.tcg_cards_owned.count + 1;
  update public.profiles
  set last_wonder_pick_at = now(), updated_at = now()
  where id = v_user_id;
  delete from public.tcg_wonder_pick_sessions where id = p_session_id;
  return jsonb_build_object(
    'card_id', v_card_id,
    'opener_username', v_username
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 4 : Permissions
-- ═══════════════════════════════════════════════════════════════════════

grant execute on function public.wonder_pick_upsert(uuid, text, text, text, text) to authenticated;
grant execute on function public.wonder_pick_status(text) to authenticated;
grant execute on function public.wonder_pick_start(text) to authenticated;
grant execute on function public.wonder_pick_pick(uuid, int) to authenticated;
