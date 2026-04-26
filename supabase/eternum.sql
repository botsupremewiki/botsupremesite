-- Eternum (RPG idle) — schéma de base.
-- Run this in Supabase SQL Editor.
-- Phase 1 : héros + énergie + état idle.

-- ──────────────────────────────────────────────────────────────────────
-- Héros : 1 par compte. Created when the player picks a class+element.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_heroes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  class_id text not null,             -- "warrior" | "paladin" | "assassin" | "mage" | "priest" | "vampire"
  element_id text not null,           -- "fire" | "water" | "wind" | "earth" | "light" | "dark"
  job_id text,                        -- "blacksmith" | "tanner" | "weaver" | "jeweler" | "armorer" | "baker"
  level int not null default 1 check (level >= 1 and level <= 100),
  xp bigint not null default 0,
  evolution_stage int not null default 0 check (evolution_stage >= 0 and evolution_stage <= 4),
  prestige_count int not null default 0,
  -- Énergie : on stocke la valeur + le timestamp du dernier calcul.
  -- Le serveur recompute à chaque accès (pas de cron, économique).
  energy int not null default 100 check (energy >= 0),
  energy_updated_at timestamptz not null default now(),
  -- Stage idle actuel + timestamp pour calcul AFK gold.
  idle_stage int not null default 1,
  idle_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eternum_heroes_class_idx on public.eternum_heroes (class_id);
create index if not exists eternum_heroes_level_idx on public.eternum_heroes (level desc);

alter table public.eternum_heroes enable row level security;

drop policy if exists "eternum_heroes_read_own" on public.eternum_heroes;
create policy "eternum_heroes_read_own"
  on public.eternum_heroes
  for select
  using (auth.uid() = user_id);

-- Reads pour leaderboards (lecture publique du level + class + element seulement)
drop policy if exists "eternum_heroes_read_public" on public.eternum_heroes;
create policy "eternum_heroes_read_public"
  on public.eternum_heroes
  for select
  using (true);

-- ──────────────────────────────────────────────────────────────────────
-- ÉNERGIE : helpers
-- regen 1/min, cap 100. Idem pour tout le contenu (donjon = 10, raid = 50…).
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_recompute_energy(
  p_user_id uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  cur int;
  cap int := 100;
  last_at timestamptz;
  delta_min int;
  new_val int;
begin
  select energy, energy_updated_at into cur, last_at
  from public.eternum_heroes
  where user_id = p_user_id
  for update;

  if cur is null then return 0; end if;

  delta_min := greatest(0, floor(extract(epoch from now() - last_at) / 60));
  new_val := least(cap, cur + delta_min);

  if new_val <> cur or delta_min > 0 then
    update public.eternum_heroes
    set energy = new_val,
        energy_updated_at = case
          when new_val >= cap then now()
          else last_at + (delta_min * interval '1 minute')
        end,
        updated_at = now()
    where user_id = p_user_id;
  end if;

  return new_val;
end;
$$;

-- Consomme N énergie (recalcule d'abord, puis check si suffisant).
-- Retourne true si OK, false sinon. Utilise auth.uid() pour sécurité.
create or replace function public.eternum_consume_energy(
  p_user_id uuid,
  p_amount int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cur int;
begin
  if p_amount <= 0 then return true; end if;
  cur := public.eternum_recompute_energy(p_user_id);
  if cur < p_amount then return false; end if;
  update public.eternum_heroes
  set energy = cur - p_amount,
      updated_at = now()
  where user_id = p_user_id;
  return true;
end;
$$;

-- Wrapper safe : utilise auth.uid() automatiquement.
create or replace function public.eternum_consume_my_energy(
  p_amount int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return false; end if;
  return public.eternum_consume_energy(caller, p_amount);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- CRÉATION HÉROS — atomique, refuse si déjà créé.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_create_hero(
  p_class_id text,
  p_element_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  valid_classes text[] := array['warrior','paladin','assassin','mage','priest','vampire'];
  valid_elements text[] := array['fire','water','wind','earth'];
  -- Lumière/Ombre verrouillés au début (unlock après évolution finale + niveau max).
begin
  if caller is null then
    raise exception 'Connecte-toi pour créer un héros.';
  end if;
  if not (p_class_id = any(valid_classes)) then
    raise exception 'Classe invalide : %', p_class_id;
  end if;
  if not (p_element_id = any(valid_elements)) then
    raise exception 'Élément invalide ou verrouillé : %', p_element_id;
  end if;

  insert into public.eternum_heroes (user_id, class_id, element_id)
  values (caller, p_class_id, p_element_id)
  on conflict (user_id) do nothing;

  if not found then
    raise exception 'Tu as déjà un héros (utilise Prestige pour changer de classe).';
  end if;

  return jsonb_build_object(
    'class_id', p_class_id,
    'element_id', p_element_id,
    'level', 1,
    'energy', 100
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- IDLE : avancer dans le stage + récolter l'AFK.
-- Pour MVP : chaque "tick" idle (à l'accès) calcule N stages réussis depuis
-- le dernier check, basé sur la difficulté courante. Drop = OS.
-- Formule : OS gain = stage * 5 * tickRate. tickRate = 1 stage / 30 sec.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_collect_idle(
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  current_stage int;
  last_at timestamptz;
  elapsed_sec bigint;
  ticks bigint;
  cap_ticks bigint := 28800; -- 8h max d'AFK accumulable
  os_gain bigint := 0;
  xp_gain bigint := 0;
begin
  if caller is null or caller <> p_user_id then
    raise exception 'Accès refusé.';
  end if;

  select idle_stage, idle_updated_at into current_stage, last_at
  from public.eternum_heroes
  where user_id = p_user_id
  for update;

  if current_stage is null then
    raise exception 'Aucun héros — crée-en un d''abord.';
  end if;

  elapsed_sec := greatest(0, extract(epoch from now() - last_at)::bigint);
  ticks := least(cap_ticks, elapsed_sec / 30); -- 1 tick = 30s

  if ticks = 0 then
    return jsonb_build_object('os_gained', 0, 'xp_gained', 0, 'stage', current_stage);
  end if;

  os_gain := ticks * current_stage * 5;
  xp_gain := ticks * current_stage * 2;

  -- Crédit OS au profil
  update public.profiles
  set gold = gold + os_gain, updated_at = now()
  where id = p_user_id;

  -- Crédit XP au héros + bump idle_updated_at
  update public.eternum_heroes
  set xp = xp + xp_gain,
      idle_updated_at = idle_updated_at + (ticks * 30 * interval '1 second'),
      updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object(
    'os_gained', os_gain,
    'xp_gained', xp_gain,
    'stage', current_stage,
    'ticks', ticks
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- IDLE : avancer manuellement au stage suivant (combat actif).
-- Pour MVP : succès auto si héros niveau >= stage. Coût énergie 5.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_advance_stage(
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  cur_stage int;
  cur_level int;
  ok boolean;
begin
  if caller is null or caller <> p_user_id then
    raise exception 'Accès refusé.';
  end if;

  -- Coût énergie 5 par tentative.
  ok := public.eternum_consume_energy(p_user_id, 5);
  if not ok then
    return jsonb_build_object('ok', false, 'error', 'Énergie insuffisante.');
  end if;

  select idle_stage, level into cur_stage, cur_level
  from public.eternum_heroes
  where user_id = p_user_id
  for update;

  -- Échec si trop de gap entre niveau et stage.
  if cur_level + 5 < cur_stage then
    return jsonb_build_object('ok', false, 'error', 'Ton héros est trop faible. Reste sur le stage et accumule de l''XP.');
  end if;

  update public.eternum_heroes
  set idle_stage = idle_stage + 1,
      idle_updated_at = now(),
      updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object('ok', true, 'new_stage', cur_stage + 1);
end;
$$;
