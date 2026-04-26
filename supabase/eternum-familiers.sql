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
