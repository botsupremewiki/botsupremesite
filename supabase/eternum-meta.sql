-- Eternum Phases 10-12 : évolution + shards + quêtes + achievements + pass + bestiaire + guildes + amis.

-- ──────────────────────────────────────────────────────────────────────
-- P10 — SHARDS d'évolution familier (stockés comme ressources spéciales).
-- ──────────────────────────────────────────────────────────────────────
-- Les shards utilisent eternum_resources_owned avec ids "shard-common", "shard-rare"…
-- La pierre prismatique utilise "prism-shard" (déjà présent côté items).

-- Évolution d'un familier : consume N shards de sa rareté, +1 étoile (max 6).
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

  -- Détermine la rareté à partir du familier_id (ex: "warrior-common-1")
  rarity_letter := split_part(fam_id, '-', 2);
  shard_id := 'shard-' || rarity_letter;
  shard_cost := case rarity_letter
    when 'common' then 5
    when 'rare' then 10
    when 'epic' then 20
    when 'legendary' then 50
    when 'prismatic' then 100
    else 999999
  end;

  select count into have from public.eternum_resources_owned
  where user_id = caller and resource_id = shard_id;
  if coalesce(have, 0) < shard_cost then
    return jsonb_build_object('ok', false, 'error', format('Pas assez de shards (%s/%s).', coalesce(have, 0), shard_cost));
  end if;

  update public.eternum_resources_owned
  set count = count - shard_cost
  where user_id = caller and resource_id = shard_id;

  update public.eternum_familiers_owned
  set star = star + 1
  where id = p_owned_id;

  return jsonb_build_object('ok', true, 'new_star', cur_star + 1);
end;
$$;

-- Invocation prismatique : besoin de 1 prism-shard + 100k OS, tirage parmi prismatiques.
create or replace function public.eternum_invoke_prismatic(
  p_familier_pool text[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  shards bigint;
  cur_gold bigint;
  os_cost bigint := 100000;
  picked text;
  element_roll numeric;
  picked_element text;
  new_id uuid;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if array_length(p_familier_pool, 1) is null then raise exception 'Pool vide.'; end if;

  select count into shards from public.eternum_resources_owned
  where user_id = caller and resource_id = 'prism-shard';
  if coalesce(shards, 0) < 1 then
    raise exception 'Besoin d''1 éclat prismatique (drop end-game).';
  end if;

  select gold into cur_gold from public.profiles where id = caller for update;
  if coalesce(cur_gold, 0) < os_cost then
    raise exception 'Besoin de %s OS.', os_cost;
  end if;

  update public.profiles set gold = gold - os_cost where id = caller;
  update public.eternum_resources_owned set count = count - 1
  where user_id = caller and resource_id = 'prism-shard';

  picked := p_familier_pool[1 + floor(random() * array_length(p_familier_pool, 1))];
  element_roll := random();
  picked_element := case
    when element_roll < 0.20 then 'fire'
    when element_roll < 0.40 then 'water'
    when element_roll < 0.60 then 'wind'
    when element_roll < 0.80 then 'earth'
    when element_roll < 0.90 then 'light'
    else 'dark'
  end;

  insert into public.eternum_familiers_owned (user_id, familier_id, element_id)
  values (caller, picked, picked_element)
  returning id into new_id;

  return jsonb_build_object('id', new_id, 'familier_id', picked, 'element_id', picked_element);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- P11 — QUÊTES journalières/hebdo (catalogue côté shared/, progression DB).
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_quest_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id text not null,
  progress int not null default 0,
  claimed_at timestamptz,
  reset_at timestamptz not null default (now() + interval '1 day'),
  primary key (user_id, quest_id)
);

alter table public.eternum_quest_progress enable row level security;
drop policy if exists "eternum_quest_read_own" on public.eternum_quest_progress;
create policy "eternum_quest_read_own" on public.eternum_quest_progress
  for select using (auth.uid() = user_id);

-- Incrémente le progress d'une quête.
create or replace function public.eternum_quest_progress(
  p_quest_id text,
  p_amount int
) returns void
language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return; end if;
  insert into public.eternum_quest_progress (user_id, quest_id, progress)
  values (caller, p_quest_id, p_amount)
  on conflict (user_id, quest_id) do update
    set progress = public.eternum_quest_progress.progress + p_amount;
end;
$$;

-- Claim une quête complétée (vérif côté serveur).
create or replace function public.eternum_quest_claim(
  p_quest_id text,
  p_required int,
  p_os_reward bigint,
  p_xp_reward bigint
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cur int;
  done timestamptz;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select progress, claimed_at into cur, done
  from public.eternum_quest_progress
  where user_id = caller and quest_id = p_quest_id for update;
  if cur is null then return jsonb_build_object('ok', false, 'error', 'Aucun progrès.'); end if;
  if done is not null then return jsonb_build_object('ok', false, 'error', 'Déjà claim.'); end if;
  if cur < p_required then return jsonb_build_object('ok', false, 'error', 'Pas terminée.'); end if;
  update public.eternum_quest_progress set claimed_at = now()
  where user_id = caller and quest_id = p_quest_id;
  update public.profiles set gold = gold + p_os_reward, updated_at = now() where id = caller;
  update public.eternum_heroes set xp = xp + p_xp_reward, updated_at = now() where user_id = caller;
  return jsonb_build_object('ok', true, 'os_gained', p_os_reward, 'xp_gained', p_xp_reward);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- P11 — PASS SUPRÊME (XP saison, 30 paliers).
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_pass_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  season text not null default 'season-1',
  xp bigint not null default 0,
  premium boolean not null default false,
  last_claimed_tier int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.eternum_pass_progress enable row level security;
drop policy if exists "eternum_pass_read_own" on public.eternum_pass_progress;
create policy "eternum_pass_read_own" on public.eternum_pass_progress
  for select using (auth.uid() = user_id);

create or replace function public.eternum_pass_grant_xp(p_amount int)
returns void language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return; end if;
  insert into public.eternum_pass_progress (user_id, xp)
  values (caller, p_amount)
  on conflict (user_id) do update set xp = public.eternum_pass_progress.xp + p_amount, updated_at = now();
end;
$$;

-- Achète le track premium pour 50k OS.
create or replace function public.eternum_pass_buy_premium()
returns jsonb language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid(); cur_gold bigint; cost bigint := 50000;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select gold into cur_gold from public.profiles where id = caller for update;
  if coalesce(cur_gold, 0) < cost then raise exception 'Besoin de %s OS.', cost; end if;
  update public.profiles set gold = gold - cost where id = caller;
  insert into public.eternum_pass_progress (user_id, premium) values (caller, true)
  on conflict (user_id) do update set premium = true, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- P11 — BESTIAIRE (auto-tracking ennemis rencontrés).
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_bestiary (
  user_id uuid not null references auth.users(id) on delete cascade,
  enemy_id text not null,
  encountered_at timestamptz not null default now(),
  defeated_count int not null default 0,
  primary key (user_id, enemy_id)
);

alter table public.eternum_bestiary enable row level security;
drop policy if exists "eternum_bestiary_read_own" on public.eternum_bestiary;
create policy "eternum_bestiary_read_own" on public.eternum_bestiary
  for select using (auth.uid() = user_id);

create or replace function public.eternum_bestiary_add(
  p_enemy_id text, p_defeated boolean
) returns void language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return; end if;
  insert into public.eternum_bestiary (user_id, enemy_id, defeated_count)
  values (caller, p_enemy_id, case when p_defeated then 1 else 0 end)
  on conflict (user_id, enemy_id) do update
    set defeated_count = public.eternum_bestiary.defeated_count + case when p_defeated then 1 else 0 end;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- P12 — GUILDES.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(name) between 3 and 30),
  tag text not null check (length(tag) between 2 and 5),
  leader_id uuid not null references auth.users(id),
  level int not null default 1,
  xp bigint not null default 0,
  bank_gold bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.eternum_guild_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  guild_id uuid not null references public.eternum_guilds(id) on delete cascade,
  role text not null default 'member' check (role in ('leader','officer','member')),
  joined_at timestamptz not null default now()
);

alter table public.eternum_guilds enable row level security;
alter table public.eternum_guild_members enable row level security;
drop policy if exists "eternum_guilds_read" on public.eternum_guilds;
create policy "eternum_guilds_read" on public.eternum_guilds for select using (true);
drop policy if exists "eternum_gm_read" on public.eternum_guild_members;
create policy "eternum_gm_read" on public.eternum_guild_members for select using (true);

create or replace function public.eternum_create_guild(p_name text, p_tag text)
returns uuid language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid(); new_id uuid;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if exists (select 1 from public.eternum_guild_members where user_id = caller) then
    raise exception 'Tu es déjà dans une guilde.';
  end if;
  insert into public.eternum_guilds (name, tag, leader_id) values (p_name, upper(p_tag), caller)
  returning id into new_id;
  insert into public.eternum_guild_members (user_id, guild_id, role) values (caller, new_id, 'leader');
  return new_id;
end;
$$;

create or replace function public.eternum_join_guild(p_guild_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if exists (select 1 from public.eternum_guild_members where user_id = caller) then
    raise exception 'Tu es déjà dans une guilde.';
  end if;
  insert into public.eternum_guild_members (user_id, guild_id) values (caller, p_guild_id);
  return true;
end;
$$;

create or replace function public.eternum_leave_guild()
returns boolean language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return false; end if;
  delete from public.eternum_guild_members where user_id = caller;
  return true;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- P12 — AMIS (système simple : 1 demande, 1 réponse).
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_friendships (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  primary key (user_a, user_b)
);

alter table public.eternum_friendships enable row level security;
drop policy if exists "eternum_friendships_read_own" on public.eternum_friendships;
create policy "eternum_friendships_read_own" on public.eternum_friendships
  for select using (auth.uid() = user_a or auth.uid() = user_b);

create or replace function public.eternum_friend_request(p_target uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null or caller = p_target then return false; end if;
  insert into public.eternum_friendships (user_a, user_b) values (caller, p_target)
  on conflict (user_a, user_b) do nothing;
  return true;
end;
$$;

create or replace function public.eternum_friend_accept(p_requester uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return false; end if;
  update public.eternum_friendships set status = 'accepted'
  where user_a = p_requester and user_b = caller;
  return true;
end;
$$;
