-- Eternum Phases 5-9 : DB pour donjons / world boss / raids / PvP / modes spéciaux.

-- ──────────────────────────────────────────────────────────────────────
-- DONJONS — runs trackés (best floor + dernière tentative).
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_dungeon_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  dungeon_id text not null,
  best_floor int not null default 0,
  last_run_at timestamptz,
  primary key (user_id, dungeon_id)
);

alter table public.eternum_dungeon_progress enable row level security;
drop policy if exists "eternum_dungeon_read_own" on public.eternum_dungeon_progress;
create policy "eternum_dungeon_read_own" on public.eternum_dungeon_progress
  for select using (auth.uid() = user_id);

-- Enregistre une victoire de donjon : applique OS + XP héros + ressources.
create or replace function public.eternum_record_dungeon_win(
  p_dungeon_id text,
  p_floor int,
  p_os_reward bigint,
  p_xp_reward bigint,
  p_resources jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  -- Update progress (best floor)
  insert into public.eternum_dungeon_progress (user_id, dungeon_id, best_floor, last_run_at)
  values (caller, p_dungeon_id, p_floor, now())
  on conflict (user_id, dungeon_id) do update
    set best_floor = greatest(public.eternum_dungeon_progress.best_floor, p_floor),
        last_run_at = now();

  -- OS au profil
  update public.profiles set gold = gold + p_os_reward, updated_at = now() where id = caller;
  -- XP au héros
  update public.eternum_heroes set xp = xp + p_xp_reward, updated_at = now() where user_id = caller;
  -- Ressources
  if p_resources is not null then
    perform public.eternum_add_resources(caller, p_resources);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- WORLD BOSS — Bot Suprême quotidien (familiers only).
-- 3 attempts/jour. Stockage par jour calendaire UTC.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_world_boss_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_date date not null default current_date,
  damage bigint not null default 0,
  attempted_at timestamptz not null default now()
);

create index if not exists eternum_wb_user_date_idx
  on public.eternum_world_boss_attempts (user_id, attempt_date);
create index if not exists eternum_wb_date_damage_idx
  on public.eternum_world_boss_attempts (attempt_date, damage desc);

alter table public.eternum_world_boss_attempts enable row level security;
-- Lecture publique pour leaderboard.
drop policy if exists "eternum_wb_read_public" on public.eternum_world_boss_attempts;
create policy "eternum_wb_read_public" on public.eternum_world_boss_attempts
  for select using (true);

-- Enregistre une attempt + crédite OS proportionnel aux dégâts.
create or replace function public.eternum_record_world_boss(
  p_damage bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  cap int := 3;
  cur_count int;
  os_reward bigint;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  select count(*) into cur_count from public.eternum_world_boss_attempts
  where user_id = caller and attempt_date = current_date;
  if cur_count >= cap then
    raise exception 'Cap journalier atteint (3/3).';
  end if;

  insert into public.eternum_world_boss_attempts (user_id, attempt_date, damage)
  values (caller, current_date, p_damage);

  -- OS = damage / 100 (1 OS pour 100 dmg)
  os_reward := greatest(0, p_damage / 100);
  update public.profiles set gold = gold + os_reward, updated_at = now() where id = caller;

  return jsonb_build_object('ok', true, 'os_gained', os_reward, 'attempts_used', cur_count + 1);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- PVP — matches async + ELO.
-- ──────────────────────────────────────────────────────────────────────
alter table public.eternum_heroes
  add column if not exists pvp_elo int not null default 1000;

create table if not exists public.eternum_pvp_matches (
  id uuid primary key default gen_random_uuid(),
  attacker_id uuid not null references auth.users(id) on delete cascade,
  defender_id uuid not null references auth.users(id) on delete cascade,
  winner_id uuid not null references auth.users(id),
  attacker_elo_before int,
  attacker_elo_after int,
  defender_elo_before int,
  defender_elo_after int,
  ended_at timestamptz not null default now()
);

create index if not exists eternum_pvp_user_idx on public.eternum_pvp_matches (attacker_id, ended_at desc);
create index if not exists eternum_pvp_def_idx on public.eternum_pvp_matches (defender_id, ended_at desc);
alter table public.eternum_pvp_matches enable row level security;
drop policy if exists "eternum_pvp_read_own" on public.eternum_pvp_matches;
create policy "eternum_pvp_read_own" on public.eternum_pvp_matches
  for select using (auth.uid() = attacker_id or auth.uid() = defender_id);

create or replace function public.eternum_record_pvp(
  p_defender_id uuid,
  p_winner_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  a_elo int; d_elo int;
  k int := 32;
  exp_a numeric;
  a_score numeric;
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
  ) values (
    caller, p_defender_id, p_winner_id, a_elo, a_new, d_elo, d_new
  );

  return jsonb_build_object('attacker_elo_after', a_new, 'defender_elo_after', d_new);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- TOUR INFINIE — best floor par joueur + leaderboard.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_tower_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  best_floor int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.eternum_tower_progress enable row level security;
drop policy if exists "eternum_tower_read_public" on public.eternum_tower_progress;
create policy "eternum_tower_read_public" on public.eternum_tower_progress
  for select using (true);

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
  return jsonb_build_object('ok', true, 'floor', p_floor);
end;
$$;
