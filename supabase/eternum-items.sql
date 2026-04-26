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
