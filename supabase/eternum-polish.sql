-- Eternum POLISH (P10-P12++) : finitions des systèmes existants.
-- Idempotent — safe à relancer.

-- ──────────────────────────────────────────────────────────────────────
-- 1) AUTO-GRANT Pass XP + Bestiaire : modifie les RPCs combat pour
--    appeler pass_grant_xp + bestiary_add automatiquement.
-- ──────────────────────────────────────────────────────────────────────

-- Donjon win : ajoute Pass XP (=XP/2) + bestiary entries.
create or replace function public.eternum_record_dungeon_win(
  p_dungeon_id text,
  p_floor int,
  p_os_reward bigint,
  p_xp_reward bigint,
  p_resources jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  insert into public.eternum_dungeon_progress (user_id, dungeon_id, best_floor, last_run_at)
  values (caller, p_dungeon_id, p_floor, now())
  on conflict (user_id, dungeon_id) do update
    set best_floor = greatest(public.eternum_dungeon_progress.best_floor, p_floor),
        last_run_at = now();

  update public.profiles set gold = gold + p_os_reward, updated_at = now() where id = caller;
  update public.eternum_heroes set xp = xp + p_xp_reward, updated_at = now() where user_id = caller;
  if p_resources is not null then
    perform public.eternum_add_resources(caller, p_resources);
  end if;

  -- Pass XP auto (50% du XP héros).
  perform public.eternum_pass_grant_xp(p_xp_reward / 2);

  -- Quest progress auto.
  perform public.eternum_quest_progress('daily-dungeon', 1);
  perform public.eternum_quest_progress('main-6-first-dungeon', 1);

  return jsonb_build_object('ok', true, 'pass_xp_gained', p_xp_reward / 2);
end;
$$;

-- World Boss : auto-grant Pass XP + quest progress.
create or replace function public.eternum_record_world_boss(
  p_damage bigint
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cap int := 3;
  cur_count int;
  os_reward bigint;
  pass_xp int;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select count(*) into cur_count from public.eternum_world_boss_attempts
  where user_id = caller and attempt_date = current_date;
  if cur_count >= cap then raise exception 'Cap journalier atteint (3/3).'; end if;

  insert into public.eternum_world_boss_attempts (user_id, attempt_date, damage)
  values (caller, current_date, p_damage);

  os_reward := greatest(0, p_damage / 100);
  update public.profiles set gold = gold + os_reward, updated_at = now() where id = caller;

  pass_xp := greatest(50, (p_damage / 1000)::int);
  perform public.eternum_pass_grant_xp(pass_xp);
  perform public.eternum_quest_progress('daily-wb', 1);
  perform public.eternum_bestiary_add('world-boss-bot-supreme', true);

  return jsonb_build_object('ok', true, 'os_gained', os_reward, 'attempts_used', cur_count + 1, 'pass_xp_gained', pass_xp);
end;
$$;

-- PvP : auto-grant Pass XP + quest progress.
create or replace function public.eternum_record_pvp(
  p_defender_id uuid,
  p_winner_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  a_elo int; d_elo int;
  k int := 32;
  exp_a numeric; a_score numeric;
  a_new int; d_new int;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select pvp_elo into a_elo from public.eternum_heroes where user_id = caller for update;
  select pvp_elo into d_elo from public.eternum_heroes where user_id = p_defender_id for update;
  if a_elo is null or d_elo is null then raise exception 'Joueur sans héros.'; end if;

  exp_a := 1.0 / (1.0 + power(10.0, (d_elo - a_elo) / 400.0));
  a_score := case when p_winner_id = caller then 1 else 0 end;
  a_new := a_elo + round(k * (a_score - exp_a));
  d_new := d_elo + round(k * ((1 - a_score) - (1 - exp_a)));

  update public.eternum_heroes set pvp_elo = a_new where user_id = caller;
  update public.eternum_heroes set pvp_elo = greatest(0, d_new) where user_id = p_defender_id;

  insert into public.eternum_pvp_matches (
    attacker_id, defender_id, winner_id,
    attacker_elo_before, attacker_elo_after,
    defender_elo_before, defender_elo_after
  ) values (caller, p_defender_id, p_winner_id, a_elo, a_new, d_elo, d_new);

  if p_winner_id = caller then
    perform public.eternum_pass_grant_xp(100);
    perform public.eternum_quest_progress('weekly-pvp', 1);
  else
    perform public.eternum_pass_grant_xp(40);
  end if;

  return jsonb_build_object('attacker_elo_after', a_new, 'defender_elo_after', d_new);
end;
$$;

-- Tour : Pass XP + bestiary.
create or replace function public.eternum_record_tower(
  p_floor int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  insert into public.eternum_tower_progress (user_id, best_floor)
  values (caller, p_floor)
  on conflict (user_id) do update
    set best_floor = greatest(public.eternum_tower_progress.best_floor, p_floor),
        updated_at = now();
  perform public.eternum_pass_grant_xp(20 + p_floor * 5);
  perform public.eternum_quest_progress('weekly-tower', 1);
  return jsonb_build_object('ok', true, 'floor', p_floor);
end;
$$;

-- Craft : quest progress + Pass XP.
create or replace function public.eternum_craft_item(
  p_item_id text,
  p_required_job text,
  p_cost jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  user_job text;
  res jsonb;
  have bigint;
  new_id uuid;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select job_id into user_job from public.eternum_heroes where user_id = caller;
  if user_job is null then raise exception 'Choisis un métier d''abord.'; end if;
  if user_job <> p_required_job then
    raise exception 'Mauvais métier (requis : %, actif : %).', p_required_job, user_job;
  end if;

  for res in select * from jsonb_array_elements(p_cost) loop
    select count into have from public.eternum_resources_owned
    where user_id = caller and resource_id = res->>'resource_id';
    if coalesce(have, 0) < (res->>'count')::bigint then
      raise exception 'Ressources insuffisantes : %', res->>'resource_id';
    end if;
  end loop;
  for res in select * from jsonb_array_elements(p_cost) loop
    update public.eternum_resources_owned
    set count = count - (res->>'count')::bigint
    where user_id = caller and resource_id = res->>'resource_id';
  end loop;

  insert into public.eternum_items_owned (user_id, item_id)
  values (caller, p_item_id) returning id into new_id;

  perform public.eternum_pass_grant_xp(20);
  perform public.eternum_quest_progress('weekly-craft', 1);
  perform public.eternum_quest_progress('main-5-first-craft', 1);

  return jsonb_build_object('id', new_id, 'item_id', p_item_id);
end;
$$;

-- Invocation familier : main quest "first familier".
create or replace function public.eternum_invoke_familier(
  p_rarity text,
  p_familier_pool text[],
  p_price bigint
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  picked text;
  element_roll numeric;
  picked_element text;
  cur_gold bigint;
  new_id uuid;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if p_rarity = 'prismatic' then
    raise exception 'Les familiers prismatiques ne sont pas invocables directement.';
  end if;
  if array_length(p_familier_pool, 1) is null then raise exception 'Pool vide.'; end if;
  if p_price <= 0 then raise exception 'Prix invalide.'; end if;

  select gold into cur_gold from public.profiles where id = caller for update;
  if coalesce(cur_gold, 0) < p_price then raise exception 'Or Suprême insuffisant.'; end if;
  update public.profiles set gold = gold - p_price, updated_at = now() where id = caller;

  picked := p_familier_pool[1 + floor(random() * array_length(p_familier_pool, 1))];
  element_roll := random();
  picked_element := case
    when element_roll < 0.24 then 'fire'
    when element_roll < 0.48 then 'water'
    when element_roll < 0.72 then 'wind'
    when element_roll < 0.96 then 'earth'
    when element_roll < 0.98 then 'light'
    else 'dark'
  end;

  insert into public.eternum_familiers_owned (user_id, familier_id, element_id)
  values (caller, picked, picked_element) returning id into new_id;

  perform public.eternum_pass_grant_xp(10);
  perform public.eternum_quest_progress('main-2-first-familier', 1);

  return jsonb_build_object('id', new_id, 'familier_id', picked, 'element_id', picked_element, 'rarity', p_rarity, 'gold_after', cur_gold - p_price);
end;
$$;

-- Set team slot : trigger main quest "team complete".
create or replace function public.eternum_set_team_slot(
  p_owned_id uuid,
  p_slot smallint
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  owner uuid;
  team_count int;
begin
  if caller is null then return false; end if;
  select user_id into owner from public.eternum_familiers_owned where id = p_owned_id for update;
  if owner is null or owner <> caller then return false; end if;

  if p_slot < 0 or p_slot > 4 then
    update public.eternum_familiers_owned set team_slot = null where id = p_owned_id;
    return true;
  end if;

  update public.eternum_familiers_owned set team_slot = null
  where user_id = caller and team_slot = p_slot and id <> p_owned_id;
  update public.eternum_familiers_owned set team_slot = p_slot, in_auberge = false where id = p_owned_id;

  -- Compte la team actuelle pour la quest "team complete".
  select count(*) into team_count from public.eternum_familiers_owned
  where user_id = caller and team_slot is not null;
  perform public.eternum_quest_progress('main-3-team', team_count);
  return true;
end;
$$;

-- Création héros : quest progress + auto-init pass.
create or replace function public.eternum_create_hero(
  p_class_id text,
  p_element_id text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  valid_classes text[] := array['warrior','paladin','assassin','mage','priest','vampire'];
  valid_elements text[] := array['fire','water','wind','earth'];
begin
  if caller is null then raise exception 'Connecte-toi pour créer un héros.'; end if;
  if not (p_class_id = any(valid_classes)) then raise exception 'Classe invalide : %', p_class_id; end if;
  if not (p_element_id = any(valid_elements)) then raise exception 'Élément invalide ou verrouillé : %', p_element_id; end if;

  insert into public.eternum_heroes (user_id, class_id, element_id)
  values (caller, p_class_id, p_element_id)
  on conflict (user_id) do nothing;
  if not found then raise exception 'Tu as déjà un héros (utilise Prestige pour changer de classe).'; end if;

  -- Init Pass progress (0 XP, free track).
  insert into public.eternum_pass_progress (user_id) values (caller)
  on conflict (user_id) do nothing;

  perform public.eternum_quest_progress('main-1-create-hero', 1);
  return jsonb_build_object('class_id', p_class_id, 'element_id', p_element_id, 'level', 1, 'energy', 100);
end;
$$;

-- Set job : quest progress.
create or replace function public.eternum_set_job(
  p_job_id text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  valid_jobs text[] := array['blacksmith','tanner','weaver','jeweler','armorer','baker'];
begin
  if caller is null then return false; end if;
  if not (p_job_id = any(valid_jobs)) then raise exception 'Métier invalide.'; end if;
  update public.eternum_heroes set job_id = p_job_id, updated_at = now() where user_id = caller;
  perform public.eternum_quest_progress('main-4-job', 1);
  return true;
end;
$$;

-- Évolution familier : quest progress.
create or replace function public.eternum_evolve_familier(
  p_owned_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  fam_owner uuid;
  fam_id text;
  cur_star int;
  rarity_letter text;
  shard_id text;
  shard_cost int;
  have bigint;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select user_id, familier_id, star into fam_owner, fam_id, cur_star
  from public.eternum_familiers_owned where id = p_owned_id for update;
  if fam_owner is null or fam_owner <> caller then return jsonb_build_object('ok', false, 'error', 'Pas ton familier.'); end if;
  if cur_star >= 6 then return jsonb_build_object('ok', false, 'error', 'Étoiles max atteintes.'); end if;

  rarity_letter := split_part(fam_id, '-', 2);
  shard_id := 'shard-' || rarity_letter;
  shard_cost := case rarity_letter
    when 'common' then 5 when 'rare' then 10 when 'epic' then 20
    when 'legendary' then 50 when 'prismatic' then 100 else 999999 end;

  select count into have from public.eternum_resources_owned
  where user_id = caller and resource_id = shard_id;
  if coalesce(have, 0) < shard_cost then
    return jsonb_build_object('ok', false, 'error', format('Pas assez de shards (%s/%s).', coalesce(have, 0), shard_cost));
  end if;

  update public.eternum_resources_owned set count = count - shard_cost
  where user_id = caller and resource_id = shard_id;
  update public.eternum_familiers_owned set star = star + 1 where id = p_owned_id;

  perform public.eternum_pass_grant_xp(50);
  perform public.eternum_quest_progress('main-7-evolution', 1);

  return jsonb_build_object('ok', true, 'new_star', cur_star + 1);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 2) MODE RÊVE : RPC pour appliquer le drop de shards après un combat.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_record_dream(
  p_dream_id text,
  p_shards jsonb  -- [{"shard_rarity": "common", "count": 2}, ...]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  s jsonb;
  total_shards int := 0;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  for s in select * from jsonb_array_elements(p_shards) loop
    insert into public.eternum_resources_owned (user_id, resource_id, count)
    values (caller, 'shard-' || (s->>'shard_rarity'), (s->>'count')::bigint)
    on conflict (user_id, resource_id) do update
      set count = public.eternum_resources_owned.count + (s->>'count')::bigint;
    total_shards := total_shards + (s->>'count')::int;
  end loop;

  perform public.eternum_pass_grant_xp(30 + total_shards * 5);
  return jsonb_build_object('ok', true, 'total_shards', total_shards);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 3) DÉFI HEBDO : RPC pour valider une victoire avec restriction.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_weekly_challenges_done (
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id text not null,
  week_start date not null,
  primary key (user_id, challenge_id, week_start)
);

alter table public.eternum_weekly_challenges_done enable row level security;
drop policy if exists "eternum_wc_read_own" on public.eternum_weekly_challenges_done;
create policy "eternum_wc_read_own" on public.eternum_weekly_challenges_done
  for select using (auth.uid() = user_id);

create or replace function public.eternum_complete_challenge(
  p_challenge_id text,
  p_os_reward bigint,
  p_resources jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  week_start date := date_trunc('week', current_date)::date;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  insert into public.eternum_weekly_challenges_done (user_id, challenge_id, week_start)
  values (caller, p_challenge_id, week_start)
  on conflict (user_id, challenge_id, week_start) do nothing;
  if not found then raise exception 'Déjà complété cette semaine.'; end if;

  update public.profiles set gold = gold + p_os_reward, updated_at = now() where id = caller;
  if p_resources is not null then
    perform public.eternum_add_resources(caller, p_resources);
  end if;
  perform public.eternum_pass_grant_xp(150);
  return jsonb_build_object('ok', true, 'os_gained', p_os_reward);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 4) BOSS DE GUILDE : table + RPC.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_guild_boss_state (
  guild_id uuid primary key references public.eternum_guilds(id) on delete cascade,
  boss_tier int not null default 1,
  boss_hp_remaining bigint not null default 50000,
  reset_at timestamptz not null default (now() + interval '7 days')
);

create table if not exists public.eternum_guild_boss_attacks (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.eternum_guilds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  damage bigint not null default 0,
  attacked_at timestamptz not null default now()
);

alter table public.eternum_guild_boss_state enable row level security;
alter table public.eternum_guild_boss_attacks enable row level security;
drop policy if exists "eternum_gb_state_read" on public.eternum_guild_boss_state;
create policy "eternum_gb_state_read" on public.eternum_guild_boss_state for select using (true);
drop policy if exists "eternum_gb_attacks_read" on public.eternum_guild_boss_attacks;
create policy "eternum_gb_attacks_read" on public.eternum_guild_boss_attacks for select using (true);

create or replace function public.eternum_guild_boss_attack(
  p_damage bigint
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  my_guild uuid;
  cur_hp bigint;
  cur_tier int;
  reset_when timestamptz;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select guild_id into my_guild from public.eternum_guild_members where user_id = caller;
  if my_guild is null then raise exception 'Tu dois être dans une guilde.'; end if;

  -- Init boss state si pas existant.
  insert into public.eternum_guild_boss_state (guild_id) values (my_guild)
  on conflict (guild_id) do nothing;

  select boss_hp_remaining, boss_tier, reset_at into cur_hp, cur_tier, reset_when
  from public.eternum_guild_boss_state where guild_id = my_guild for update;

  -- Reset hebdo automatique.
  if now() >= reset_when then
    update public.eternum_guild_boss_state
    set boss_tier = boss_tier + 1,
        boss_hp_remaining = 50000 * (boss_tier + 1),
        reset_at = now() + interval '7 days'
    where guild_id = my_guild;
    select boss_hp_remaining, boss_tier into cur_hp, cur_tier
    from public.eternum_guild_boss_state where guild_id = my_guild;
  end if;

  if cur_hp <= 0 then return jsonb_build_object('ok', false, 'error', 'Boss déjà battu cette semaine.'); end if;

  update public.eternum_guild_boss_state
  set boss_hp_remaining = greatest(0, cur_hp - p_damage)
  where guild_id = my_guild;

  insert into public.eternum_guild_boss_attacks (guild_id, user_id, damage)
  values (my_guild, caller, p_damage);

  -- Reward proportionnel à dmg + tier.
  update public.profiles set gold = gold + (p_damage / 50 * cur_tier), updated_at = now() where id = caller;

  return jsonb_build_object('ok', true, 'hp_left', greatest(0, cur_hp - p_damage), 'tier', cur_tier);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 5) AMIS — prêt familier 1×/jour.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_familier_lends (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references auth.users(id) on delete cascade,
  borrower_id uuid not null references auth.users(id) on delete cascade,
  familier_id uuid not null references public.eternum_familiers_owned(id) on delete cascade,
  lent_at timestamptz not null default now(),
  unique (lender_id, borrower_id, lent_at)
);

alter table public.eternum_familier_lends enable row level security;
drop policy if exists "eternum_lends_read_own" on public.eternum_familier_lends;
create policy "eternum_lends_read_own" on public.eternum_familier_lends
  for select using (auth.uid() = lender_id or auth.uid() = borrower_id);

-- Recherche d'un user par username (pour amis).
create or replace function public.eternum_search_user(
  p_query text
) returns table (id uuid, username text, avatar_url text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select p.id, p.username, p.avatar_url
  from public.profiles p
  where p.username ilike '%' || p_query || '%'
    and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  limit 10;
end;
$$;

-- Refuser une demande d'amitié.
create or replace function public.eternum_friend_decline(p_requester uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return false; end if;
  delete from public.eternum_friendships where user_a = p_requester and user_b = caller;
  return true;
end;
$$;

-- Liste des amis acceptés (avec hero info).
create or replace function public.eternum_get_friends()
returns table (
  friend_id uuid,
  username text,
  class_id text,
  element_id text,
  level int
) language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return; end if;
  return query
  select
    case when f.user_a = caller then f.user_b else f.user_a end as friend_id,
    p.username,
    h.class_id,
    h.element_id,
    h.level
  from public.eternum_friendships f
  left join public.profiles p
    on p.id = case when f.user_a = caller then f.user_b else f.user_a end
  left join public.eternum_heroes h
    on h.user_id = case when f.user_a = caller then f.user_b else f.user_a end
  where f.status = 'accepted' and (f.user_a = caller or f.user_b = caller);
end;
$$;

-- Demandes d'amitié reçues (pending).
create or replace function public.eternum_get_friend_requests()
returns table (requester_id uuid, username text)
language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return; end if;
  return query
  select f.user_a as requester_id, p.username
  from public.eternum_friendships f
  left join public.profiles p on p.id = f.user_a
  where f.user_b = caller and f.status = 'pending';
end;
$$;
