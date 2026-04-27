-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ETERNUM — Migration consolidée (P1 → P12)                  ║
-- ║  Idempotent : utilise IF NOT EXISTS / OR REPLACE / DROP IF   ║
-- ║  Safe à relancer plusieurs fois — ne casse rien d'existant.  ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════
-- ║  P1 : Héros + énergie + idle
-- ════════════════════════════════════════════════════════════════

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

-- ════════════════════════════════════════════════════════════════
-- ║  P2 : Familiers (collection + invocation + équipe + auberge)
-- ════════════════════════════════════════════════════════════════

-- Eternum Phase 2 : familiers (collection + invocation gacha + équipe).
-- Run after supabase/eternum.sql.

-- ──────────────────────────────────────────────────────────────────────
-- Collection : 1 ligne par instance de familier possédée.
-- Le catalogue (90 familiers de base) est défini côté shared/eternum-familiers.ts
-- — pas de table catalogue, on utilise le familier_id en référence.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_familiers_owned (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  familier_id text not null,        -- ex: "warrior-common-1"
  element_id text not null,         -- "fire" | "water" | "wind" | "earth" | "light" | "dark"
  level int not null default 1 check (level >= 1 and level <= 100),
  xp bigint not null default 0,
  star int not null default 1 check (star >= 1 and star <= 6),  -- évolution étoiles (Phase 10)
  -- Slot d'équipe (0..4) ou null si en réserve.
  team_slot smallint check (team_slot is null or (team_slot >= 0 and team_slot <= 4)),
  -- Slot d'auberge (xp passive) — null si pas en auberge.
  in_auberge boolean not null default false,
  acquired_at timestamptz not null default now()
);

create index if not exists eternum_familiers_user_idx
  on public.eternum_familiers_owned (user_id, acquired_at desc);
create unique index if not exists eternum_familiers_team_unique_idx
  on public.eternum_familiers_owned (user_id, team_slot)
  where team_slot is not null;

alter table public.eternum_familiers_owned enable row level security;

drop policy if exists "eternum_familiers_read_own" on public.eternum_familiers_owned;
create policy "eternum_familiers_read_own"
  on public.eternum_familiers_owned
  for select
  using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- INVOCATION : tire un familier au hasard parmi ceux de la rareté demandée.
-- Coût en OS débité (sauf prismatic — interdit ici, gestion via P10).
-- Élément tiré au hasard côté serveur (24% base, 2% lumière/ombre).
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_invoke_familier(
  p_rarity text,
  p_familier_pool text[],   -- liste des familier_id éligibles (envoyée par client depuis le catalogue)
  p_price bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  picked text;
  element_roll numeric;
  picked_element text;
  cur_gold bigint;
  new_id uuid;
begin
  if caller is null then
    raise exception 'Connecte-toi.';
  end if;
  if p_rarity = 'prismatic' then
    raise exception 'Les familiers prismatiques ne sont pas invocables directement (besoin d''une pierre prismatique — Phase 10).';
  end if;
  if array_length(p_familier_pool, 1) is null then
    raise exception 'Pool d''invocation vide.';
  end if;
  if p_price <= 0 then
    raise exception 'Prix invalide.';
  end if;

  -- Vérifie & débite OS atomiquement.
  select gold into cur_gold from public.profiles where id = caller for update;
  if coalesce(cur_gold, 0) < p_price then
    raise exception 'Or Suprême insuffisant.';
  end if;

  update public.profiles
  set gold = gold - p_price, updated_at = now()
  where id = caller;

  -- Tirage familier (uniforme dans la rareté).
  picked := p_familier_pool[1 + floor(random() * array_length(p_familier_pool, 1))];

  -- Tirage élément : 24% chacun pour les 4 base, 2% chacun pour Lumière/Ombre.
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
  values (caller, picked, picked_element)
  returning id into new_id;

  return jsonb_build_object(
    'id', new_id,
    'familier_id', picked,
    'element_id', picked_element,
    'rarity', p_rarity,
    'gold_after', cur_gold - p_price
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- ÉQUIPE : assigne un familier à un slot 0..4 (ou retire = null).
-- Si le slot est occupé, l'occupant est éjecté (set null). Atomique.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_set_team_slot(
  p_owned_id uuid,
  p_slot smallint   -- 0..4 ou -1 pour retirer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner uuid;
begin
  if caller is null then return false; end if;

  select user_id into owner from public.eternum_familiers_owned
  where id = p_owned_id for update;
  if owner is null or owner <> caller then return false; end if;

  if p_slot < 0 or p_slot > 4 then
    -- Retire de l'équipe
    update public.eternum_familiers_owned
    set team_slot = null
    where id = p_owned_id;
    return true;
  end if;

  -- Éjecte l'éventuel occupant du slot.
  update public.eternum_familiers_owned
  set team_slot = null
  where user_id = caller and team_slot = p_slot and id <> p_owned_id;

  -- Place le familier.
  update public.eternum_familiers_owned
  set team_slot = p_slot, in_auberge = false
  where id = p_owned_id;

  return true;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- AUBERGE : familier gagne XP passive lent (slots limités).
-- Pour MVP, le calcul est lazy à la lecture (xp = base + (now - last_check) × rate).
-- On stocke juste le flag in_auberge + un timestamp last_xp_at (ajout colonne).
-- ──────────────────────────────────────────────────────────────────────
alter table public.eternum_familiers_owned
  add column if not exists auberge_at timestamptz;

create or replace function public.eternum_toggle_auberge(
  p_owned_id uuid,
  p_in boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner uuid;
  cur_team smallint;
  in_count int;
  cap int := 5;  -- max 5 familiers à l'auberge en même temps
begin
  if caller is null then return false; end if;
  select user_id, team_slot into owner, cur_team
  from public.eternum_familiers_owned where id = p_owned_id for update;
  if owner is null or owner <> caller then return false; end if;
  if cur_team is not null then
    raise exception 'Retire-le de l''équipe d''abord.';
  end if;

  if p_in then
    select count(*) into in_count
    from public.eternum_familiers_owned
    where user_id = caller and in_auberge = true;
    if in_count >= cap then
      raise exception 'Auberge pleine (% slots max).', cap;
    end if;
    update public.eternum_familiers_owned
    set in_auberge = true, auberge_at = now()
    where id = p_owned_id;
  else
    -- Sortie auberge : applique l'XP accumulée
    update public.eternum_familiers_owned
    set xp = xp + greatest(0, extract(epoch from (now() - coalesce(auberge_at, now())))::bigint / 60),  -- 1 xp/min
        in_auberge = false,
        auberge_at = null
    where id = p_owned_id;
  end if;
  return true;
end;
$$;

-- ════════════════════════════════════════════════════════════════
-- ║  P3 : Items + ressources + métiers + boulanger
-- ════════════════════════════════════════════════════════════════

-- Eternum Phase 3 : items + ressources + craft + métiers.

-- ──────────────────────────────────────────────────────────────────────
-- INVENTAIRE ITEMS : 1 ligne par instance équipable.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_items_owned (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,             -- ex: "warrior-rare-helmet"
  -- Équipé sur héros (boolean) ou sur 1 familier (uuid de eternum_familiers_owned).
  equipped_on_hero boolean not null default false,
  equipped_on_familier uuid references public.eternum_familiers_owned(id) on delete set null,
  acquired_at timestamptz not null default now()
);

create index if not exists eternum_items_user_idx
  on public.eternum_items_owned (user_id, acquired_at desc);

alter table public.eternum_items_owned enable row level security;

drop policy if exists "eternum_items_read_own" on public.eternum_items_owned;
create policy "eternum_items_read_own"
  on public.eternum_items_owned
  for select using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- INVENTAIRE RESSOURCES : 1 ligne par (user, ressource).
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_resources_owned (
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id text not null,
  count bigint not null default 0 check (count >= 0),
  primary key (user_id, resource_id)
);

alter table public.eternum_resources_owned enable row level security;

drop policy if exists "eternum_resources_read_own" on public.eternum_resources_owned;
create policy "eternum_resources_read_own"
  on public.eternum_resources_owned
  for select using (auth.uid() = user_id);

-- Helper : ajoute des ressources (utilisé par les drops).
create or replace function public.eternum_add_resources(
  p_user_id uuid,
  p_resources jsonb   -- [{"resource_id": "iron-ore", "count": 5}, ...]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  for r in select * from jsonb_array_elements(p_resources) loop
    insert into public.eternum_resources_owned (user_id, resource_id, count)
    values (p_user_id, r->>'resource_id', (r->>'count')::bigint)
    on conflict (user_id, resource_id) do update
      set count = public.eternum_resources_owned.count + (r->>'count')::bigint;
  end loop;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- MÉTIER : sélection (1 actif par joueur).
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_set_job(
  p_job_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  valid_jobs text[] := array['blacksmith','tanner','weaver','jeweler','armorer','baker'];
begin
  if caller is null then return false; end if;
  if not (p_job_id = any(valid_jobs)) then
    raise exception 'Métier invalide.';
  end if;
  update public.eternum_heroes
  set job_id = p_job_id, updated_at = now()
  where user_id = caller;
  return true;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- CRAFT : consomme ressources, produit item.
-- p_cost = [{"resource_id": "iron-ore", "count": 5}, ...] envoyé par le client
-- (depuis le catalogue) — vérifié côté serveur que toutes sont dispos.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_craft_item(
  p_item_id text,
  p_required_job text,
  p_cost jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  user_job text;
  res jsonb;
  have bigint;
  new_id uuid;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  -- Vérifie le métier actif.
  select job_id into user_job from public.eternum_heroes where user_id = caller;
  if user_job is null then
    raise exception 'Choisis un métier d''abord.';
  end if;
  if user_job <> p_required_job then
    raise exception 'Mauvais métier (requis : %, actif : %).', p_required_job, user_job;
  end if;

  -- Vérifie les ressources.
  for res in select * from jsonb_array_elements(p_cost) loop
    select count into have from public.eternum_resources_owned
    where user_id = caller and resource_id = res->>'resource_id';
    if coalesce(have, 0) < (res->>'count')::bigint then
      raise exception 'Ressources insuffisantes : %', res->>'resource_id';
    end if;
  end loop;

  -- Décrémente les ressources.
  for res in select * from jsonb_array_elements(p_cost) loop
    update public.eternum_resources_owned
    set count = count - (res->>'count')::bigint
    where user_id = caller and resource_id = res->>'resource_id';
  end loop;

  -- Crée l'item.
  insert into public.eternum_items_owned (user_id, item_id)
  values (caller, p_item_id)
  returning id into new_id;

  return jsonb_build_object('id', new_id, 'item_id', p_item_id);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- ÉQUIPEMENT : équipe un item sur héros ou familier.
-- target_type: 'hero' | 'familier'
-- target_id  : null pour hero, uuid du familier sinon
-- Désequipe l'item courant du même slot s'il y en a un.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_equip_item(
  p_owned_item_id uuid,
  p_target_type text,
  p_target_familier_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  item_owner uuid;
begin
  if caller is null then return false; end if;

  select user_id into item_owner from public.eternum_items_owned
  where id = p_owned_item_id for update;
  if item_owner is null or item_owner <> caller then return false; end if;

  -- Désequipe l'item de tout cible précédente.
  update public.eternum_items_owned
  set equipped_on_hero = false, equipped_on_familier = null
  where id = p_owned_item_id;

  if p_target_type = 'hero' then
    update public.eternum_items_owned
    set equipped_on_hero = true
    where id = p_owned_item_id;
  elsif p_target_type = 'familier' then
    if p_target_familier_id is null then return false; end if;
    update public.eternum_items_owned
    set equipped_on_familier = p_target_familier_id
    where id = p_owned_item_id;
  end if;

  return true;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- BOULANGER : craft pain qui rend de l'énergie (cap journalier 5 pains).
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_baker_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  date_today date not null default current_date,
  bread_today int not null default 0
);

alter table public.eternum_baker_state enable row level security;

drop policy if exists "eternum_baker_read_own" on public.eternum_baker_state;
create policy "eternum_baker_read_own"
  on public.eternum_baker_state
  for select using (auth.uid() = user_id);

create or replace function public.eternum_bake_bread() returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  user_job text;
  cap int := 5;
  cur int;
  cur_date date;
  wheat_have bigint;
  wheat_cost int := 3;
  energy_per_bread int := 15;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select job_id into user_job from public.eternum_heroes where user_id = caller;
  if user_job <> 'baker' then raise exception 'Tu n''es pas Boulanger.'; end if;

  -- État journalier
  insert into public.eternum_baker_state (user_id, date_today, bread_today)
  values (caller, current_date, 0)
  on conflict (user_id) do update
    set date_today = case when public.eternum_baker_state.date_today <> current_date
                          then current_date
                          else public.eternum_baker_state.date_today end,
        bread_today = case when public.eternum_baker_state.date_today <> current_date
                            then 0
                            else public.eternum_baker_state.bread_today end;

  select bread_today, date_today into cur, cur_date
  from public.eternum_baker_state where user_id = caller for update;

  if cur >= cap then
    raise exception 'Cap journalier atteint (%/%).', cur, cap;
  end if;

  -- Vérifier ressource blé
  select count into wheat_have from public.eternum_resources_owned
  where user_id = caller and resource_id = 'wheat';
  if coalesce(wheat_have, 0) < wheat_cost then
    raise exception 'Pas assez de blé (besoin : %).', wheat_cost;
  end if;

  -- Décrémente blé + bump cap journalier
  update public.eternum_resources_owned
  set count = count - wheat_cost
  where user_id = caller and resource_id = 'wheat';

  update public.eternum_baker_state
  set bread_today = bread_today + 1
  where user_id = caller;

  -- Donne énergie (recompute d'abord, puis ajoute, cap 100)
  perform public.eternum_recompute_energy(caller);
  update public.eternum_heroes
  set energy = least(100, energy + energy_per_bread),
      energy_updated_at = now(),
      updated_at = now()
  where user_id = caller;

  return jsonb_build_object(
    'energy_gained', energy_per_bread,
    'bread_today', cur + 1,
    'cap', cap
  );
end;
$$;

-- ════════════════════════════════════════════════════════════════
-- ║  P5-P9 : Donjons + World Boss + Raids + PvP + Tour
-- ════════════════════════════════════════════════════════════════

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

-- ════════════════════════════════════════════════════════════════
-- ║  P10-P12 : Évolution + Quêtes + Pass + Bestiaire + Guildes + Amis
-- ════════════════════════════════════════════════════════════════

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

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Fin de migration Eternum — bonne aventure !                 ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════
-- ║  POLISH (auto-grant XP + bestiaire + boss guilde + amis + défis)
-- ════════════════════════════════════════════════════════════════

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

-- ════════════════════════════════════════════════════════════════
-- ║  SÉCURITÉ : RPCs server-authoritative (refactor)
-- ║  Remplace les RPCs eternum_record_* par eternum_attempt_*.
-- ║  + Prestige + évolution auto + Pass claim + Lend familier.
-- ════════════════════════════════════════════════════════════════

-- Eternum SÉCURITÉ : refactor server-authoritative.
-- Avant : le client envoyait les rewards et le résultat (exploitable).
-- Après : le serveur calcule TOUT à partir d'une simple requête "j'attaque X".
-- Catalogues hardcodés en PL/pgSQL pour éviter la duplication TS↔SQL.
-- Idempotent — safe à relancer.

-- ──────────────────────────────────────────────────────────────────────
-- Helper : power d'un joueur (héros + 5 familiers actifs).
-- Formule simple : sum(level × stat_factor) avec growth par classe.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_player_power(p_user_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  hero_lv int;
  team_total bigint := 0;
begin
  select level into hero_lv from public.eternum_heroes where user_id = p_user_id;
  if hero_lv is null then return 0; end if;

  -- Héros : level × 100 (proxy stats agrégées).
  team_total := hero_lv * 100;

  -- Familiers actifs : sum(level × 50).
  select team_total + coalesce(sum(level * 50), 0) into team_total
  from public.eternum_familiers_owned
  where user_id = p_user_id and team_slot is not null;

  return team_total;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- DONJONS — server-authoritative
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_attempt_dungeon(
  p_dungeon_id text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  required_power int;
  energy_cost int;
  os_min int; os_max int;
  xp_min int; xp_max int;
  os_reward bigint;
  xp_reward bigint;
  player_power int;
  resources jsonb := '[]'::jsonb;
  ok boolean;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  -- Catalogue server-side : énergie + power requis + reward bounds par donjon.
  case p_dungeon_id
    when 'rat-cellar'   then required_power := 150;   energy_cost := 10; os_min := 100;  os_max := 200;   xp_min := 30;   xp_max := 60;
                            resources := '[{"resource_id":"iron-ore","chance":0.6,"min":1,"max":3},{"resource_id":"leather","chance":0.5,"min":1,"max":2},{"resource_id":"wheat","chance":0.4,"min":1,"max":2}]'::jsonb;
    when 'goblin-camp'  then required_power := 800;   energy_cost := 15; os_min := 400;  os_max := 700;   xp_min := 100;  xp_max := 200;
                            resources := '[{"resource_id":"iron-ore","chance":0.7,"min":2,"max":5},{"resource_id":"silver-ore","chance":0.4,"min":1,"max":2},{"resource_id":"fine-leather","chance":0.3,"min":1,"max":2},{"resource_id":"thread","chance":0.5,"min":2,"max":4}]'::jsonb;
    when 'frost-cavern' then required_power := 2000;  energy_cost := 20; os_min := 1200; os_max := 2000;  xp_min := 300;  xp_max := 500;
                            resources := '[{"resource_id":"silver-ore","chance":0.7,"min":2,"max":5},{"resource_id":"gem-rough","chance":0.6,"min":1,"max":3},{"resource_id":"mithril-ore","chance":0.3,"min":1,"max":2},{"resource_id":"silk","chance":0.4,"min":2,"max":4}]'::jsonb;
    when 'lava-pit'     then required_power := 4500;  energy_cost := 25; os_min := 3000; os_max := 5000;  xp_min := 700;  xp_max := 1100;
                            resources := '[{"resource_id":"mithril-ore","chance":0.7,"min":2,"max":4},{"resource_id":"dragon-hide","chance":0.6,"min":1,"max":3},{"resource_id":"ruby","chance":0.5,"min":1,"max":2},{"resource_id":"moon-silk","chance":0.4,"min":1,"max":3}]'::jsonb;
    when 'void-temple'  then required_power := 9000;  energy_cost := 30; os_min := 8000; os_max := 12000; xp_min := 2000; xp_max := 3500;
                            resources := '[{"resource_id":"ether-ore","chance":0.7,"min":2,"max":4},{"resource_id":"phoenix-hide","chance":0.5,"min":1,"max":2},{"resource_id":"void-silk","chance":0.5,"min":1,"max":2},{"resource_id":"diamond","chance":0.4,"min":1,"max":2},{"resource_id":"prism-shard","chance":0.05,"min":1,"max":1}]'::jsonb;
    else raise exception 'Donjon inconnu : %', p_dungeon_id;
  end case;

  -- Consomme énergie (échec si pas assez).
  ok := public.eternum_consume_energy(caller, energy_cost);
  if not ok then return jsonb_build_object('ok', false, 'error', 'Énergie insuffisante.'); end if;

  -- Power check.
  player_power := public.eternum_player_power(caller);
  if player_power < required_power then
    return jsonb_build_object(
      'ok', true, 'won', false,
      'player_power', player_power,
      'required_power', required_power
    );
  end if;

  -- Reward random in range, server-side.
  os_reward := os_min + floor(random() * (os_max - os_min + 1));
  xp_reward := xp_min + floor(random() * (xp_max - xp_min + 1));

  -- Apply : OS + XP + ressources (drops).
  update public.profiles set gold = gold + os_reward, updated_at = now() where id = caller;
  update public.eternum_heroes set xp = xp + xp_reward, updated_at = now() where user_id = caller;

  -- Drops : pour chaque ressource, roll chance + count random.
  declare
    drops_applied jsonb := '[]'::jsonb;
    r jsonb;
    rolled int;
  begin
    for r in select * from jsonb_array_elements(resources) loop
      if random() < (r->>'chance')::numeric then
        rolled := (r->>'min')::int + floor(random() * ((r->>'max')::int - (r->>'min')::int + 1));
        drops_applied := drops_applied || jsonb_build_object(
          'resource_id', r->>'resource_id',
          'count', rolled
        );
      end if;
    end loop;
    if jsonb_array_length(drops_applied) > 0 then
      perform public.eternum_add_resources(caller, drops_applied);
    end if;

    -- Progress + Pass XP + bestiaire.
    insert into public.eternum_dungeon_progress (user_id, dungeon_id, best_floor, last_run_at)
    values (caller, p_dungeon_id, 1, now())
    on conflict (user_id, dungeon_id) do update
      set best_floor = greatest(public.eternum_dungeon_progress.best_floor, 1),
          last_run_at = now();
    perform public.eternum_pass_grant_xp(xp_reward / 2);
    perform public.eternum_quest_progress('daily-dungeon', 1);
    perform public.eternum_quest_progress('main-6-first-dungeon', 1);
    perform public.eternum_bestiary_add('dungeon-' || p_dungeon_id, true);

    return jsonb_build_object(
      'ok', true, 'won', true,
      'os_gained', os_reward,
      'xp_gained', xp_reward,
      'resources_gained', drops_applied,
      'player_power', player_power
    );
  end;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- WORLD BOSS — server-authoritative.
-- Damage calculé server-side : player_power × random(0.8, 1.2) × tier(jour).
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_attempt_world_boss()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cap int := 3;
  cur_count int;
  pwr int;
  damage bigint;
  os_reward bigint;
  pass_xp int;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select count(*) into cur_count from public.eternum_world_boss_attempts
  where user_id = caller and attempt_date = current_date;
  if cur_count >= cap then return jsonb_build_object('ok', false, 'error', 'Cap journalier atteint (3/3).'); end if;

  pwr := public.eternum_player_power(caller);
  if pwr <= 0 then return jsonb_build_object('ok', false, 'error', 'Configure ton équipe de familiers.'); end if;

  -- Dégâts = power × multi (0.8 → 1.2).
  damage := pwr * 10 * (0.8 + random() * 0.4);
  insert into public.eternum_world_boss_attempts (user_id, attempt_date, damage)
  values (caller, current_date, damage);

  os_reward := damage / 100;
  update public.profiles set gold = gold + os_reward, updated_at = now() where id = caller;

  pass_xp := greatest(50, (damage / 1000)::int);
  perform public.eternum_pass_grant_xp(pass_xp);
  perform public.eternum_quest_progress('daily-wb', 1);
  perform public.eternum_bestiary_add('world-boss-bot-supreme', true);

  return jsonb_build_object(
    'ok', true, 'damage', damage,
    'os_gained', os_reward,
    'attempts_used', cur_count + 1,
    'pass_xp_gained', pass_xp
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- RAID — server-authoritative (solo).
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_attempt_raid(
  p_raid_id text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  required_power int;
  energy_cost int := 50;
  os_reward bigint;
  xp_reward bigint;
  hero_lv int;
  ok boolean;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  -- Raids = héros only, donc on check juste le level.
  select level into hero_lv from public.eternum_heroes where user_id = caller;
  if hero_lv is null then return jsonb_build_object('ok', false, 'error', 'Crée ton héros.'); end if;

  case p_raid_id
    when 'kraken'      then required_power := 30; os_reward := 5000;  xp_reward := 1500;
    when 'dragon-rouge' then required_power := 55; os_reward := 15000; xp_reward := 4000;
    when 'titan-stone' then required_power := 80; os_reward := 35000; xp_reward := 9000;
    else raise exception 'Raid inconnu : %', p_raid_id;
  end case;

  ok := public.eternum_consume_energy(caller, energy_cost);
  if not ok then return jsonb_build_object('ok', false, 'error', 'Énergie insuffisante.'); end if;

  if hero_lv < required_power then
    return jsonb_build_object('ok', true, 'won', false, 'hero_level', hero_lv, 'required_level', required_power);
  end if;

  update public.profiles set gold = gold + os_reward, updated_at = now() where id = caller;
  update public.eternum_heroes set xp = xp + xp_reward, updated_at = now() where user_id = caller;
  perform public.eternum_pass_grant_xp(xp_reward / 2);
  perform public.eternum_bestiary_add('raid-' || p_raid_id, true);

  return jsonb_build_object('ok', true, 'won', true, 'os_gained', os_reward, 'xp_gained', xp_reward);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- TOUR INFINIE — server-authoritative.
-- Gagne si player_power >= floor × 200.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_attempt_tower(
  p_floor int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  pwr int;
  required int;
  os_reward bigint;
  xp_reward bigint;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  pwr := public.eternum_player_power(caller);
  required := p_floor * 200;
  if pwr < required then
    return jsonb_build_object('ok', true, 'won', false, 'player_power', pwr, 'required', required);
  end if;

  os_reward := 50 + p_floor * 20;
  xp_reward := 30 + p_floor * 10;

  insert into public.eternum_tower_progress (user_id, best_floor)
  values (caller, p_floor)
  on conflict (user_id) do update
    set best_floor = greatest(public.eternum_tower_progress.best_floor, p_floor),
        updated_at = now();

  update public.profiles set gold = gold + os_reward where id = caller;
  update public.eternum_heroes set xp = xp + xp_reward where user_id = caller;
  perform public.eternum_pass_grant_xp(20 + p_floor * 5);
  perform public.eternum_quest_progress('weekly-tower', 1);

  return jsonb_build_object('ok', true, 'won', true, 'floor', p_floor, 'os_gained', os_reward, 'xp_gained', xp_reward);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- DREAM — server-authoritative.
-- Gagne si player_power >= recommended_level × 200. Drop shards selon table.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_attempt_dream(
  p_dream_id text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  required int;
  energy_cost int;
  pwr int;
  ok boolean;
  drops jsonb := '[]'::jsonb;
  shard_chances jsonb;
  total_shards int := 0;
  r jsonb;
  rolled int;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  case p_dream_id
    when 'dream-1' then required := 4000;  energy_cost := 30;
                          shard_chances := '[{"rarity":"common","chance":0.8,"max":3},{"rarity":"rare","chance":0.3,"max":2},{"rarity":"epic","chance":0.05,"max":1}]'::jsonb;
    when 'dream-2' then required := 10000; energy_cost := 40;
                          shard_chances := '[{"rarity":"rare","chance":0.7,"max":3},{"rarity":"epic","chance":0.4,"max":2},{"rarity":"legendary","chance":0.1,"max":1}]'::jsonb;
    when 'dream-3' then required := 16000; energy_cost := 60;
                          shard_chances := '[{"rarity":"epic","chance":0.6,"max":3},{"rarity":"legendary","chance":0.4,"max":2},{"rarity":"prismatic","chance":0.05,"max":1}]'::jsonb;
    else raise exception 'Mode Rêve inconnu : %', p_dream_id;
  end case;

  ok := public.eternum_consume_energy(caller, energy_cost);
  if not ok then return jsonb_build_object('ok', false, 'error', 'Énergie insuffisante.'); end if;

  pwr := public.eternum_player_power(caller);
  if pwr < required then
    return jsonb_build_object('ok', true, 'won', false, 'player_power', pwr, 'required', required);
  end if;

  for r in select * from jsonb_array_elements(shard_chances) loop
    if random() < (r->>'chance')::numeric then
      rolled := 1 + floor(random() * (r->>'max')::int);
      drops := drops || jsonb_build_object(
        'resource_id', 'shard-' || (r->>'rarity'),
        'count', rolled
      );
      total_shards := total_shards + rolled;
    end if;
  end loop;

  if jsonb_array_length(drops) > 0 then
    perform public.eternum_add_resources(caller, drops);
  end if;
  perform public.eternum_pass_grant_xp(30 + total_shards * 5);

  return jsonb_build_object('ok', true, 'won', true, 'shards', drops, 'total_shards', total_shards);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- DÉFI HEBDO — server-authoritative.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_attempt_challenge(
  p_challenge_id text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  pwr int;
  required int := 5000;  -- challenge boss = ~niveau 50
  os_reward bigint;
  resources jsonb := '[]'::jsonb;
  week_start date := date_trunc('week', current_date)::date;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  if exists (
    select 1 from public.eternum_weekly_challenges_done
    where user_id = caller and challenge_id = p_challenge_id and week_start = week_start
  ) then return jsonb_build_object('ok', false, 'error', 'Déjà complété cette semaine.'); end if;

  -- Validation des restrictions côté serveur.
  case p_challenge_id
    when 'no-heal' then
      if exists (
        select 1 from public.eternum_heroes h
        where h.user_id = caller and h.class_id in ('vampire','paladin')
      ) then return jsonb_build_object('ok', false, 'error', 'Restriction violée : pas de Vampire ni Paladin.'); end if;
      os_reward := 5000;
      resources := '[{"resource_id":"ruby","count":3}]'::jsonb;
    when 'solo-element' then
      -- Vérifie que tous les familiers actifs ont le même élément.
      if (select count(distinct element_id) from public.eternum_familiers_owned
          where user_id = caller and team_slot is not null) > 1 then
        return jsonb_build_object('ok', false, 'error', 'Restriction violée : familiers d''éléments différents.');
      end if;
      os_reward := 8000;
      resources := '[{"resource_id":"moon-silk","count":5}]'::jsonb;
    when 'no-ult' then
      os_reward := 6000;
      resources := '[{"resource_id":"mithril-ore","count":4}]'::jsonb;
    when 'speed-run' then
      -- Pour speed-run on demande un power élevé.
      required := 8000;
      os_reward := 7000;
      resources := '[{"resource_id":"ether-ore","count":2}]'::jsonb;
    else raise exception 'Défi inconnu : %', p_challenge_id;
  end case;

  pwr := public.eternum_player_power(caller);
  if pwr < required then
    return jsonb_build_object('ok', true, 'won', false, 'player_power', pwr, 'required', required);
  end if;

  insert into public.eternum_weekly_challenges_done (user_id, challenge_id, week_start)
  values (caller, p_challenge_id, week_start);

  update public.profiles set gold = gold + os_reward where id = caller;
  if jsonb_array_length(resources) > 0 then
    perform public.eternum_add_resources(caller, resources);
  end if;
  perform public.eternum_pass_grant_xp(150);

  return jsonb_build_object('ok', true, 'won', true, 'os_gained', os_reward);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- PVP — server-authoritative outcome (ELO + rewards).
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_attempt_pvp(
  p_defender_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  a_pwr int; d_pwr int;
  a_elo int; d_elo int;
  k int := 32;
  exp_a numeric; a_score numeric;
  a_new int; d_new int;
  winner uuid;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if caller = p_defender_id then return jsonb_build_object('ok', false, 'error', 'Tu ne peux pas te défier toi-même.'); end if;

  a_pwr := public.eternum_player_power(caller);
  d_pwr := public.eternum_player_power(p_defender_id);
  if a_pwr <= 0 or d_pwr <= 0 then return jsonb_build_object('ok', false, 'error', 'Joueur sans héros/équipe.'); end if;

  -- Outcome : power-based avec random tweaks (15%).
  declare a_roll numeric := a_pwr * (0.85 + random() * 0.30);
          d_roll numeric := d_pwr * (0.85 + random() * 0.30);
  begin
    winner := case when a_roll >= d_roll then caller else p_defender_id end;
  end;

  select pvp_elo into a_elo from public.eternum_heroes where user_id = caller for update;
  select pvp_elo into d_elo from public.eternum_heroes where user_id = p_defender_id for update;

  exp_a := 1.0 / (1.0 + power(10.0, (d_elo - a_elo) / 400.0));
  a_score := case when winner = caller then 1 else 0 end;
  a_new := a_elo + round(k * (a_score - exp_a));
  d_new := d_elo + round(k * ((1 - a_score) - (1 - exp_a)));

  update public.eternum_heroes set pvp_elo = greatest(0, a_new) where user_id = caller;
  update public.eternum_heroes set pvp_elo = greatest(0, d_new) where user_id = p_defender_id;

  insert into public.eternum_pvp_matches (
    attacker_id, defender_id, winner_id,
    attacker_elo_before, attacker_elo_after,
    defender_elo_before, defender_elo_after
  ) values (caller, p_defender_id, winner, a_elo, a_new, d_elo, d_new);

  if winner = caller then
    perform public.eternum_pass_grant_xp(100);
    perform public.eternum_quest_progress('weekly-pvp', 1);
  else
    perform public.eternum_pass_grant_xp(40);
  end if;

  return jsonb_build_object(
    'ok', true,
    'won', winner = caller,
    'attacker_elo_after', greatest(0, a_new),
    'defender_elo_after', greatest(0, d_new),
    'attacker_power', a_pwr,
    'defender_power', d_pwr
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- GUILD BOSS — server-authoritative.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_attempt_guild_boss()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  my_guild uuid;
  pwr int;
  damage bigint;
  cur_hp bigint; cur_tier int; reset_when timestamptz;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select guild_id into my_guild from public.eternum_guild_members where user_id = caller;
  if my_guild is null then raise exception 'Tu dois être dans une guilde.'; end if;

  insert into public.eternum_guild_boss_state (guild_id) values (my_guild)
  on conflict (guild_id) do nothing;

  select boss_hp_remaining, boss_tier, reset_at into cur_hp, cur_tier, reset_when
  from public.eternum_guild_boss_state where guild_id = my_guild for update;

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

  pwr := public.eternum_player_power(caller);
  damage := pwr * 5 * (0.8 + random() * 0.4);

  update public.eternum_guild_boss_state
  set boss_hp_remaining = greatest(0, cur_hp - damage)
  where guild_id = my_guild;
  insert into public.eternum_guild_boss_attacks (guild_id, user_id, damage)
  values (my_guild, caller, damage);

  update public.profiles set gold = gold + (damage / 50 * cur_tier), updated_at = now() where id = caller;
  perform public.eternum_pass_grant_xp(50);

  return jsonb_build_object('ok', true, 'damage', damage, 'hp_left', greatest(0, cur_hp - damage), 'tier', cur_tier);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- PRESTIGE — reset progression + bonus permanents.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_prestige(
  p_new_class text,
  p_new_element text,
  p_new_job text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cur_level int;
  cur_evol int;
  valid_classes text[] := array['warrior','paladin','assassin','mage','priest','vampire'];
  valid_elements text[] := array['fire','water','wind','earth','light','dark'];
  valid_jobs text[] := array['blacksmith','tanner','weaver','jeweler','armorer','baker'];
  light_dark_unlocked boolean;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  select level, evolution_stage into cur_level, cur_evol
  from public.eternum_heroes where user_id = caller for update;
  if cur_level is null then raise exception 'Crée un héros d''abord.'; end if;
  if cur_level < 100 then raise exception 'Niveau 100 requis pour Prestige (actuel : %).', cur_level; end if;
  if cur_evol < 4 then raise exception 'Évolution finale (4) requise (actuel : %).', cur_evol; end if;

  if not (p_new_class = any(valid_classes)) then raise exception 'Classe invalide.'; end if;
  if not (p_new_element = any(valid_elements)) then raise exception 'Élément invalide.'; end if;
  if p_new_job is not null and not (p_new_job = any(valid_jobs)) then raise exception 'Métier invalide.'; end if;

  -- Lumière/Ombre dispos uniquement si déjà unlock (= déjà passé en prestige avec level/évol max).
  light_dark_unlocked := exists (
    select 1 from public.eternum_heroes
    where user_id = caller and (element_id = 'light' or element_id = 'dark')
  );
  if (p_new_element in ('light', 'dark')) and not light_dark_unlocked then
    -- Premier prestige avec niveau 100 + évolution 4 = unlock pour ce prestige.
    null;  -- on autorise vu qu'on remplit les conditions de unlock
  end if;

  update public.eternum_heroes
  set class_id = p_new_class,
      element_id = p_new_element,
      job_id = p_new_job,
      level = 1,
      xp = 0,
      evolution_stage = 0,
      prestige_count = prestige_count + 1,
      energy = 100,
      energy_updated_at = now(),
      idle_stage = 1,
      idle_updated_at = now(),
      updated_at = now()
  where user_id = caller;

  perform public.eternum_quest_progress('main-8-prestige', 1);
  perform public.eternum_pass_grant_xp(2000);

  return jsonb_build_object('ok', true, 'new_class', p_new_class, 'new_element', p_new_element);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- ÉVOLUTION HÉROS — auto au passage de niveaux 20/40/60/80.
-- Appelé via trigger sur update level (à l'occasion d'un gain XP).
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_check_level_up()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  needed bigint;
  new_level int := new.level;
  new_evol int := new.evolution_stage;
begin
  -- Promote level si XP suffisant. On boucle pour multiples niveaux.
  loop
    needed := round(100 * power(new_level, 1.6));
    exit when new.xp < needed or new_level >= 100;
    new.xp := new.xp - needed;
    new_level := new_level + 1;
  end loop;

  -- Évolutions automatiques (paliers 20/40/60/80).
  if new_level >= 20 and new_evol < 1 then new_evol := 1; end if;
  if new_level >= 40 and new_evol < 2 then new_evol := 2; end if;
  if new_level >= 60 and new_evol < 3 then new_evol := 3; end if;
  if new_level >= 80 and new_evol < 4 then new_evol := 4; end if;

  new.level := new_level;
  new.evolution_stage := new_evol;
  return new;
end;
$$;

drop trigger if exists eternum_heroes_level_up on public.eternum_heroes;
create trigger eternum_heroes_level_up
  before update of xp on public.eternum_heroes
  for each row execute function public.eternum_check_level_up();

-- ──────────────────────────────────────────────────────────────────────
-- PASS TIER CLAIM — claim un palier débloqué.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_pass_claim_tier(
  p_tier int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cur_xp bigint;
  cur_premium boolean;
  cur_last int;
  needed_xp bigint;
  os_free bigint;
  os_premium bigint;
  total_os bigint := 0;
  resources jsonb := '[]'::jsonb;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select xp, premium, last_claimed_tier into cur_xp, cur_premium, cur_last
  from public.eternum_pass_progress where user_id = caller for update;
  if cur_xp is null then raise exception 'Pass non initialisé.'; end if;

  needed_xp := p_tier * 1000;
  if cur_xp < needed_xp then raise exception 'Tier % pas atteint (% / %).', p_tier, cur_xp, needed_xp; end if;
  if p_tier <= cur_last then raise exception 'Tier % déjà claim.', p_tier; end if;

  os_free := 200 + p_tier * 50;
  total_os := os_free;
  if cur_premium then
    os_premium := 500 + p_tier * 100;
    total_os := total_os + os_premium;
    if p_tier % 5 = 0 then
      resources := '[{"resource_id":"ruby","count":1}]'::jsonb;
    end if;
  end if;

  update public.profiles set gold = gold + total_os, updated_at = now() where id = caller;
  if jsonb_array_length(resources) > 0 then
    perform public.eternum_add_resources(caller, resources);
  end if;
  update public.eternum_pass_progress set last_claimed_tier = p_tier, updated_at = now() where user_id = caller;

  return jsonb_build_object('ok', true, 'os_gained', total_os, 'premium', cur_premium);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- LUMIÈRE/OMBRE UNLOCK — disponible après évolution 4 + niveau 100.
-- Cette RPC change l'élément du héros sans Prestige.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_change_element(
  p_new_element text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cur_level int;
  cur_evol int;
  valid text[] := array['fire','water','wind','earth','light','dark'];
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if not (p_new_element = any(valid)) then raise exception 'Élément invalide.'; end if;

  select level, evolution_stage into cur_level, cur_evol
  from public.eternum_heroes where user_id = caller for update;
  if cur_level is null then raise exception 'Pas de héros.'; end if;
  if cur_evol < 4 or cur_level < 100 then
    raise exception 'Lumière/Ombre nécessitent évolution 4 + niveau 100.';
  end if;

  update public.eternum_heroes
  set element_id = p_new_element, updated_at = now()
  where user_id = caller;

  return jsonb_build_object('ok', true, 'element', p_new_element);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- LEND FAMILIER — prête un familier à un ami pour 1 jour.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_lend_familier(
  p_borrower_id uuid,
  p_familier_owned_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  is_friend boolean;
  fam_owner uuid;
  today_lent_count int;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  -- Vérifie que c'est un ami accepté.
  select exists (
    select 1 from public.eternum_friendships
    where status = 'accepted'
      and ((user_a = caller and user_b = p_borrower_id) or (user_a = p_borrower_id and user_b = caller))
  ) into is_friend;
  if not is_friend then raise exception 'Pas un ami accepté.'; end if;

  -- Vérifie le familier appartient bien à toi.
  select user_id into fam_owner from public.eternum_familiers_owned where id = p_familier_owned_id;
  if fam_owner is null or fam_owner <> caller then raise exception 'Pas ton familier.'; end if;

  -- Cap : 1 prêt par ami par jour.
  select count(*) into today_lent_count from public.eternum_familier_lends
  where lender_id = caller and borrower_id = p_borrower_id
    and lent_at::date = current_date;
  if today_lent_count >= 1 then raise exception 'Déjà un prêt aujourd''hui à cet ami.'; end if;

  insert into public.eternum_familier_lends (lender_id, borrower_id, familier_id)
  values (caller, p_borrower_id, p_familier_owned_id);

  return jsonb_build_object('ok', true);
end;
$$;
