-- IMPERIUM — schéma SQL complet (P1 → P8).
-- Jeu de stratégie médiéval persistant du Site Suprême.
-- Run this in Supabase SQL Editor (idempotent).
--
-- Couvre :
--   - Villages, bâtiments, champs, files de construction
--   - Recherche académie, forge, recrutement
--   - Carte monde, oasis, fermes barbares, merveilles
--   - Marches (raid/attack/support/spy/conquest), combat resolver, rapports
--   - Anti-grief : bouclier, loot cap, range, inactivité
--   - Alliances, soutiens militaires, diplomatie
--   - Marché de ressources, caravanes
--   - Quêtes journalières, succès one-shot, classement hebdo, hall of fame
--   - Économie OS : skip de timers, achats premium
--
-- Conventions :
--   - Tables : public.imperium_*
--   - Ressources : float8 (pour la prod lazy fractionnaire)
--   - Erreurs : raise exception '...' en français
--   - Auth : auth.uid() pour identifier l'appelant, security definer pour les RPCs
--   - Lazy : pas de cron obligatoire, tick recalculé à chaque action utilisateur
--   - Anti-triche : coûts/stats hardcodés dans des fonctions immutable

-- ══════════════════════════════════════════════════════════════════════
-- 1. CONFIG IMMUTABLE (coûts, temps, stats) — autorité serveur
-- ══════════════════════════════════════════════════════════════════════

-- Coût et temps de base d'un bâtiment au niveau 1.
create or replace function public.imperium_building_base(p_kind text)
returns jsonb language sql immutable as $$
  select case p_kind
    when 'town_hall' then jsonb_build_object('wood', 200, 'clay', 200, 'iron', 250, 'wheat', 70, 'time', 300)
    when 'barracks'  then jsonb_build_object('wood', 220, 'clay', 160, 'iron', 90,  'wheat', 40, 'time', 480)
    when 'stable'    then jsonb_build_object('wood', 270, 'clay', 180, 'iron', 350, 'wheat', 110,'time', 600)
    when 'workshop'  then jsonb_build_object('wood', 460, 'clay', 510, 'iron', 600, 'wheat', 320,'time', 1800)
    when 'academy'   then jsonb_build_object('wood', 220, 'clay', 160, 'iron', 90,  'wheat', 40, 'time', 720)
    when 'forge'     then jsonb_build_object('wood', 200, 'clay', 240, 'iron', 100, 'wheat', 30, 'time', 900)
    when 'market'    then jsonb_build_object('wood', 80,  'clay', 70,  'iron', 120, 'wheat', 70, 'time', 900)
    when 'embassy'   then jsonb_build_object('wood', 180, 'clay', 130, 'iron', 150, 'wheat', 80, 'time', 1200)
    when 'wall'      then jsonb_build_object('wood', 80,  'clay', 240, 'iron', 80,  'wheat', 30, 'time', 1200)
    when 'warehouse' then jsonb_build_object('wood', 130, 'clay', 160, 'iron', 90,  'wheat', 40, 'time', 720)
    when 'granary'   then jsonb_build_object('wood', 80,  'clay', 100, 'iron', 70,  'wheat', 20, 'time', 720)
    when 'hideout'   then jsonb_build_object('wood', 30,  'clay', 25,  'iron', 20,  'wheat', 10, 'time', 480)
    when 'wonder'    then jsonb_build_object('wood', 50000,'clay', 50000,'iron', 50000,'wheat', 50000,'time', 86400)
    when 'wood_field' then jsonb_build_object('wood', 40, 'clay', 100, 'iron', 50, 'wheat', 60, 'time', 60)
    when 'clay_field' then jsonb_build_object('wood', 80, 'clay', 40,  'iron', 80, 'wheat', 50, 'time', 60)
    when 'iron_field' then jsonb_build_object('wood', 100,'clay', 80,  'iron', 30, 'wheat', 60, 'time', 60)
    when 'wheat_field'then jsonb_build_object('wood', 70, 'clay', 90,  'iron', 70, 'wheat', 20, 'time', 60)
    else null
  end;
$$;

-- Multiplicateurs de courbe (coût/temps) par type.
create or replace function public.imperium_building_curve(p_kind text)
returns jsonb language sql immutable as $$
  select case p_kind
    when 'wood_field'  then jsonb_build_object('cost_mult', 1.5,  'time_mult', 1.6)
    when 'clay_field'  then jsonb_build_object('cost_mult', 1.5,  'time_mult', 1.6)
    when 'iron_field'  then jsonb_build_object('cost_mult', 1.5,  'time_mult', 1.6)
    when 'wheat_field' then jsonb_build_object('cost_mult', 1.5,  'time_mult', 1.6)
    when 'hideout'     then jsonb_build_object('cost_mult', 1.4,  'time_mult', 1.4)
    when 'warehouse'   then jsonb_build_object('cost_mult', 1.3,  'time_mult', 1.4)
    when 'granary'     then jsonb_build_object('cost_mult', 1.3,  'time_mult', 1.4)
    when 'wonder'      then jsonb_build_object('cost_mult', 1.5,  'time_mult', 1.5)
    else                    jsonb_build_object('cost_mult', 1.28, 'time_mult', 1.4)
  end;
$$;

-- Coût/temps pour upgrade vers niveau target (donne le coût UNITAIRE de cette upgrade, pas cumulé).
create or replace function public.imperium_building_cost(p_kind text, p_target_level int)
returns jsonb language plpgsql immutable as $$
declare
  base jsonb;
  curve jsonb;
  cost_factor numeric;
  time_factor numeric;
begin
  base := public.imperium_building_base(p_kind);
  curve := public.imperium_building_curve(p_kind);
  if base is null or curve is null then return null; end if;
  cost_factor := power((curve->>'cost_mult')::numeric, p_target_level - 1);
  time_factor := power((curve->>'time_mult')::numeric, p_target_level - 1);
  return jsonb_build_object(
    'wood',  floor((base->>'wood')::numeric  * cost_factor),
    'clay',  floor((base->>'clay')::numeric  * cost_factor),
    'iron',  floor((base->>'iron')::numeric  * cost_factor),
    'wheat', floor((base->>'wheat')::numeric * cost_factor),
    'time',  floor((base->>'time')::numeric  * time_factor)
  );
end;
$$;

-- Cap maximum d'un bâtiment (hôtel cappe les autres bâtiments du centre).
create or replace function public.imperium_building_cap(p_kind text, p_town_hall_level int)
returns int language sql immutable as $$
  select case
    when p_kind = 'town_hall' then 25
    when p_kind in ('wall', 'hideout', 'warehouse', 'granary', 'wood_field', 'clay_field', 'iron_field', 'wheat_field') then 20
    when p_kind = 'wonder' then 100
    else greatest(1, p_town_hall_level)
  end;
$$;

-- Stats de base d'une unité (cost/time/att/DI/DC/vit/loot/wheat).
create or replace function public.imperium_unit_base(p_faction text, p_kind text)
returns jsonb language sql immutable as $$
  select case p_faction || '/' || p_kind
    -- ─────── LÉGION ───────
    when 'legion/legionnaire'        then jsonb_build_object('wood', 120,  'clay', 100,  'iron', 150,  'wheat', 30,    'time', 1500, 'att', 40,  'di', 35, 'dc', 50,  'vit', 6,  'loot', 50,   'wheat_h', 1, 'cat', 'inf')
    when 'legion/pretorien'          then jsonb_build_object('wood', 100,  'clay', 130,  'iron', 160,  'wheat', 70,    'time', 1920, 'att', 30,  'di', 65, 'dc', 35,  'vit', 5,  'loot', 20,   'wheat_h', 1, 'cat', 'inf')
    when 'legion/imperator'          then jsonb_build_object('wood', 150,  'clay', 160,  'iron', 210,  'wheat', 80,    'time', 2400, 'att', 70,  'di', 40, 'dc', 25,  'vit', 7,  'loot', 50,   'wheat_h', 1, 'cat', 'inf')
    when 'legion/equite_imperatoris' then jsonb_build_object('wood', 140,  'clay', 160,  'iron', 20,   'wheat', 40,    'time', 1800, 'att', 0,   'di', 20, 'dc', 10,  'vit', 16, 'loot', 0,    'wheat_h', 2, 'cat', 'cav_scout')
    when 'legion/equite_cesaris'     then jsonb_build_object('wood', 550,  'clay', 440,  'iron', 320,  'wheat', 100,   'time', 3600, 'att', 120, 'di', 65, 'dc', 50,  'vit', 14, 'loot', 100,  'wheat_h', 3, 'cat', 'cav')
    when 'legion/equite_legati'      then jsonb_build_object('wood', 200,  'clay', 440,  'iron', 520,  'wheat', 130,   'time', 4500, 'att', 180, 'di', 80, 'dc', 105, 'vit', 10, 'loot', 70,   'wheat_h', 4, 'cat', 'cav')
    when 'legion/ram'                then jsonb_build_object('wood', 900,  'clay', 360,  'iron', 500,  'wheat', 70,    'time', 5400, 'att', 60,  'di', 30, 'dc', 75,  'vit', 4,  'loot', 0,    'wheat_h', 3, 'cat', 'siege')
    when 'legion/catapult'           then jsonb_build_object('wood', 950,  'clay', 1350, 'iron', 600,  'wheat', 90,    'time', 6600, 'att', 75,  'di', 60, 'dc', 10,  'vit', 3,  'loot', 0,    'wheat_h', 6, 'cat', 'siege')
    when 'legion/senator'            then jsonb_build_object('wood', 30750,'clay', 27200,'iron', 45000,'wheat', 37500, 'time', 28800,'att', 50,  'di', 40, 'dc', 30,  'vit', 4,  'loot', 0,    'wheat_h', 5, 'cat', 'special')
    when 'legion/settler'            then jsonb_build_object('wood', 5800, 'clay', 5300, 'iron', 7200, 'wheat', 5500,  'time', 18000,'att', 0,   'di', 80, 'dc', 80,  'vit', 5,  'loot', 3000, 'wheat_h', 1, 'cat', 'special')
    -- ─────── HORDE ───────
    when 'horde/marauder'            then jsonb_build_object('wood', 95,   'clay', 75,   'iron', 40,   'wheat', 40,    'time', 1080, 'att', 10,  'di', 25, 'dc', 20,  'vit', 7,  'loot', 60,   'wheat_h', 1, 'cat', 'inf')
    when 'horde/spearman'            then jsonb_build_object('wood', 145,  'clay', 70,   'iron', 85,   'wheat', 40,    'time', 1320, 'att', 15,  'di', 35, 'dc', 60,  'vit', 7,  'loot', 40,   'wheat_h', 1, 'cat', 'inf')
    when 'horde/berserker'           then jsonb_build_object('wood', 130,  'clay', 120,  'iron', 170,  'wheat', 40,    'time', 1800, 'att', 60,  'di', 30, 'dc', 30,  'vit', 6,  'loot', 60,   'wheat_h', 1, 'cat', 'inf')
    when 'horde/scout'               then jsonb_build_object('wood', 160,  'clay', 100,  'iron', 50,   'wheat', 50,    'time', 1500, 'att', 0,   'di', 10, 'dc', 5,   'vit', 18, 'loot', 0,    'wheat_h', 2, 'cat', 'cav_scout')
    when 'horde/nomad'               then jsonb_build_object('wood', 370,  'clay', 270,  'iron', 290,  'wheat', 75,    'time', 2700, 'att', 100, 'di', 50, 'dc', 75,  'vit', 17, 'loot', 80,   'wheat_h', 3, 'cat', 'cav')
    when 'horde/iron_rider'          then jsonb_build_object('wood', 450,  'clay', 515,  'iron', 480,  'wheat', 80,    'time', 3600, 'att', 150, 'di', 50, 'dc', 75,  'vit', 13, 'loot', 50,   'wheat_h', 3, 'cat', 'cav')
    when 'horde/ram'                 then jsonb_build_object('wood', 1000, 'clay', 300,  'iron', 350,  'wheat', 70,    'time', 4800, 'att', 65,  'di', 30, 'dc', 80,  'vit', 4,  'loot', 0,    'wheat_h', 3, 'cat', 'siege')
    when 'horde/trebuchet'           then jsonb_build_object('wood', 900,  'clay', 1200, 'iron', 600,  'wheat', 60,    'time', 6300, 'att', 50,  'di', 60, 'dc', 10,  'vit', 3,  'loot', 0,    'wheat_h', 6, 'cat', 'siege')
    when 'horde/khan'                then jsonb_build_object('wood', 35500,'clay', 26000,'iron', 25000,'wheat', 27200, 'time', 28800,'att', 40,  'di', 60, 'dc', 40,  'vit', 5,  'loot', 0,    'wheat_h', 6, 'cat', 'special')
    when 'horde/pioneer'             then jsonb_build_object('wood', 7200, 'clay', 5500, 'iron', 5800, 'wheat', 6500,  'time', 18000,'att', 10,  'di', 80, 'dc', 80,  'vit', 5,  'loot', 3500, 'wheat_h', 2, 'cat', 'special')
    -- ─────── ORDRE ───────
    when 'ordre/templar'             then jsonb_build_object('wood', 100,  'clay', 130,  'iron', 160,  'wheat', 70,    'time', 1560, 'att', 35,  'di', 45, 'dc', 40,  'vit', 7,  'loot', 60,   'wheat_h', 1, 'cat', 'inf')
    when 'ordre/hospitaller'         then jsonb_build_object('wood', 120,  'clay', 110,  'iron', 200,  'wheat', 40,    'time', 1800, 'att', 40,  'di', 60, 'dc', 50,  'vit', 6,  'loot', 40,   'wheat_h', 1, 'cat', 'inf')
    when 'ordre/brother'             then jsonb_build_object('wood', 140,  'clay', 175,  'iron', 270,  'wheat', 80,    'time', 2400, 'att', 60,  'di', 35, 'dc', 60,  'vit', 6,  'loot', 50,   'wheat_h', 1, 'cat', 'inf')
    when 'ordre/scout'               then jsonb_build_object('wood', 100,  'clay', 180,  'iron', 100,  'wheat', 65,    'time', 2100, 'att', 0,   'di', 20, 'dc', 10,  'vit', 9,  'loot', 0,    'wheat_h', 2, 'cat', 'cav_scout')
    when 'ordre/crusader'            then jsonb_build_object('wood', 350,  'clay', 320,  'iron', 330,  'wheat', 75,    'time', 3000, 'att', 110, 'di', 55, 'dc', 45,  'vit', 9,  'loot', 110,  'wheat_h', 4, 'cat', 'cav')
    when 'ordre/sergeant'            then jsonb_build_object('wood', 270,  'clay', 310,  'iron', 440,  'wheat', 80,    'time', 3600, 'att', 150, 'di', 60, 'dc', 130, 'vit', 10, 'loot', 80,   'wheat_h', 3, 'cat', 'cav')
    when 'ordre/ram'                 then jsonb_build_object('wood', 1000, 'clay', 450,  'iron', 535,  'wheat', 70,    'time', 5400, 'att', 65,  'di', 30, 'dc', 80,  'vit', 4,  'loot', 0,    'wheat_h', 3, 'cat', 'siege')
    when 'ordre/catapult'            then jsonb_build_object('wood', 950,  'clay', 1450, 'iron', 630,  'wheat', 90,    'time', 6000, 'att', 50,  'di', 60, 'dc', 10,  'vit', 3,  'loot', 0,    'wheat_h', 6, 'cat', 'siege')
    when 'ordre/grand_master'        then jsonb_build_object('wood', 30750,'clay', 45400,'iron', 31000,'wheat', 37500, 'time', 36000,'att', 70,  'di', 40, 'dc', 50,  'vit', 4,  'loot', 0,    'wheat_h', 4, 'cat', 'special')
    when 'ordre/settler'             then jsonb_build_object('wood', 5500, 'clay', 7000, 'iron', 5300, 'wheat', 4900,  'time', 18000,'att', 10,  'di', 80, 'dc', 80,  'vit', 5,  'loot', 3000, 'wheat_h', 1, 'cat', 'special')
    else null
  end;
$$;

-- Bonus muraille selon faction et niveau.
create or replace function public.imperium_wall_bonus(p_faction text, p_level int)
returns numeric language sql immutable as $$
  select case p_faction
    when 'legion' then least(0.60, p_level * 0.03)
    when 'horde'  then least(0.40, p_level * 0.02)
    when 'ordre'  then least(0.80, p_level * 0.04)
    else 0
  end;
$$;

-- Production d'une ressource selon niveau du champ. Inclut +5 base offert.
-- Niveau 0 = 5 (juste la base), niveau 1+ = 5 + 30 * 1.165^(N-1).
create or replace function public.imperium_field_rate(p_level int)
returns numeric language sql immutable as $$
  select case when p_level <= 0 then 5 else 5 + 30 * power(1.165, p_level - 1) end;
$$;

-- Cap entrepôt/grenier pour niveau N (par bâtiment, pas cumul).
create or replace function public.imperium_storage_cap(p_level int)
returns int language sql immutable as $$
  select case when p_level <= 0 then 0 else floor(400 * power(1.3, p_level - 1))::int + 800 end;
$$;

-- Cap caché pour niveau N.
create or replace function public.imperium_hideout_cap(p_level int)
returns int language sql immutable as $$
  select case when p_level <= 0 then 0 else floor(200 * power(1.25, p_level - 1))::int end;
$$;

-- Tarif OS pour skip d'un timer (en secondes restantes).
create or replace function public.imperium_skip_cost(p_seconds_remaining int)
returns int language sql immutable as $$
  select case
    when p_seconds_remaining <= 3600    then 5000
    when p_seconds_remaining <= 14400   then 15000
    when p_seconds_remaining <= 43200   then 35000
    when p_seconds_remaining <= 86400   then 50000
    else -1 -- impossible
  end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 2. TABLES
-- ══════════════════════════════════════════════════════════════════════

-- ─────── VILLAGES ───────
create table if not exists public.imperium_villages (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (length(name) between 1 and 30),
  faction       text not null check (faction in ('legion', 'horde', 'ordre')),
  x             int  not null,
  y             int  not null check (x between -50 and 50 and y between -50 and 50),
  is_secondary  boolean not null default false,
  last_tick     timestamptz not null default now(),
  last_login    timestamptz not null default now(),
  wood          float8 not null default 750,
  clay          float8 not null default 750,
  iron          float8 not null default 750,
  wheat         float8 not null default 750,
  shield_until  timestamptz,
  created_at    timestamptz not null default now(),
  unique (x, y)
);

create index if not exists imperium_villages_user_idx on public.imperium_villages(user_id);
create index if not exists imperium_villages_login_idx on public.imperium_villages(last_login);

-- ─────── BÂTIMENTS ───────
create table if not exists public.imperium_buildings (
  id          uuid primary key default gen_random_uuid(),
  village_id  uuid not null references public.imperium_villages(id) on delete cascade,
  slot        int  not null, -- 0..15 (centre) ou -1..-4 (champs)
  kind        text not null,
  level       int  not null default 0 check (level >= 0),
  unique (village_id, slot)
);

create index if not exists imperium_buildings_village_kind_idx on public.imperium_buildings(village_id, kind);

-- ─────── FILE DE CONSTRUCTION (bâtiments + recherche + forge) ───────
create table if not exists public.imperium_construction_queue (
  id            uuid primary key default gen_random_uuid(),
  village_id    uuid not null references public.imperium_villages(id) on delete cascade,
  kind          text not null check (kind in ('building', 'research', 'forge')),
  target_kind   text not null,         -- ex 'town_hall', 'wood_field', 'legionnaire', 'embassy/attack'
  target_slot   int,                   -- pour les bâtiments
  target_level  int not null,          -- niveau visé
  started_at    timestamptz not null default now(),
  finishes_at   timestamptz not null
);

create index if not exists imperium_queue_village_kind_idx on public.imperium_construction_queue(village_id, kind);
create index if not exists imperium_queue_finishes_idx on public.imperium_construction_queue(finishes_at);

-- ─────── RECHERCHE ACADÉMIE ───────
create table if not exists public.imperium_research (
  village_id  uuid not null references public.imperium_villages(id) on delete cascade,
  unit_kind   text not null,
  researched  boolean not null default false,
  primary key (village_id, unit_kind)
);

-- ─────── UNITÉS (stock + en cours de recrutement) ───────
create table if not exists public.imperium_units (
  village_id              uuid not null references public.imperium_villages(id) on delete cascade,
  unit_kind               text not null,
  count                   int  not null default 0 check (count >= 0),
  recruiting_count        int  not null default 0 check (recruiting_count >= 0),
  recruiting_finishes_at  timestamptz,
  per_unit_seconds        int, -- pour calculer combien d'unités sortent du four à chaque tick
  primary key (village_id, unit_kind)
);

-- ─────── FORGE (bonus att/def par unité par village) ───────
create table if not exists public.imperium_forge (
  village_id      uuid not null references public.imperium_villages(id) on delete cascade,
  unit_kind       text not null,
  attack_level    int  not null default 0 check (attack_level between 0 and 20),
  defense_level   int  not null default 0 check (defense_level between 0 and 20),
  primary key (village_id, unit_kind)
);

-- ─────── MARCHES ───────
create table if not exists public.imperium_marches (
  id              uuid primary key default gen_random_uuid(),
  from_village_id uuid not null references public.imperium_villages(id) on delete cascade,
  to_x            int not null,
  to_y            int not null,
  kind            text not null check (kind in ('raid','attack','support','spy','conquest','settle')),
  units           jsonb not null,
  target_building text,
  arrives_at      timestamptz not null,
  returns_at      timestamptz,
  state           text not null default 'outbound' check (state in ('outbound','arrived','returning','completed','cancelled')),
  loot            jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists imperium_marches_arrives_idx on public.imperium_marches(arrives_at) where state = 'outbound';
create index if not exists imperium_marches_returns_idx on public.imperium_marches(returns_at) where state = 'returning';
create index if not exists imperium_marches_from_state_idx on public.imperium_marches(from_village_id, state);
create index if not exists imperium_marches_to_idx on public.imperium_marches(to_x, to_y) where state = 'outbound';

-- ─────── SOUTIENS (troupes envoyées en défense d'un allié) ───────
create table if not exists public.imperium_supports (
  id              uuid primary key default gen_random_uuid(),
  from_village_id uuid not null references public.imperium_villages(id) on delete cascade,
  host_village_id uuid not null references public.imperium_villages(id) on delete cascade,
  units           jsonb not null,
  arrived_at      timestamptz not null default now(),
  recalled_at     timestamptz
);

create index if not exists imperium_supports_host_idx on public.imperium_supports(host_village_id) where recalled_at is null;
create index if not exists imperium_supports_from_idx on public.imperium_supports(from_village_id) where recalled_at is null;

-- ─────── RAPPORTS DE COMBAT ───────
create table if not exists public.imperium_reports (
  id                  uuid primary key default gen_random_uuid(),
  attacker_user_id    uuid,
  defender_user_id    uuid,
  march_id            uuid references public.imperium_marches(id) on delete set null,
  kind                text not null check (kind in ('raid','attack','spy','defense','conquest','support')),
  data                jsonb not null,
  created_at          timestamptz not null default now(),
  read_by_attacker    boolean not null default false,
  read_by_defender    boolean not null default false
);

create index if not exists imperium_reports_attacker_idx on public.imperium_reports(attacker_user_id, created_at desc);
create index if not exists imperium_reports_defender_idx on public.imperium_reports(defender_user_id, created_at desc);

-- ─────── ALLIANCES ───────
create table if not exists public.imperium_alliances (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null check (length(name) between 3 and 30),
  tag         text unique not null check (length(tag) between 3 and 4),
  color       text not null default '#888888',
  chief_id    uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

create table if not exists public.imperium_alliance_members (
  alliance_id uuid not null references public.imperium_alliances(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member' check (role in ('chief','deputy','diplomat','member')),
  joined_at   timestamptz not null default now(),
  primary key (alliance_id, user_id)
);

create index if not exists imperium_am_user_idx on public.imperium_alliance_members(user_id);

create table if not exists public.imperium_alliance_relations (
  alliance_a_id   uuid not null references public.imperium_alliances(id) on delete cascade,
  alliance_b_id   uuid not null references public.imperium_alliances(id) on delete cascade,
  kind            text not null check (kind in ('nap','war','confederation')),
  since           timestamptz not null default now(),
  primary key (alliance_a_id, alliance_b_id, kind)
);

-- ─────── MARCHÉ ───────
create table if not exists public.imperium_market_orders (
  id                  uuid primary key default gen_random_uuid(),
  seller_village_id   uuid not null references public.imperium_villages(id) on delete cascade,
  give_kind           text not null check (give_kind in ('wood','clay','iron','wheat')),
  give_amount         int  not null check (give_amount > 0),
  take_kind           text not null check (take_kind in ('wood','clay','iron','wheat')),
  take_amount         int  not null check (take_amount > 0),
  expires_at          timestamptz not null,
  created_at          timestamptz not null default now(),
  state               text not null default 'open' check (state in ('open','fulfilled','expired','cancelled'))
);

create index if not exists imperium_market_open_idx on public.imperium_market_orders(give_kind, take_kind, state) where state = 'open';

-- ─────── CARTE MONDE ───────
create table if not exists public.imperium_map (
  x           int not null,
  y           int not null,
  kind        text not null check (kind in ('player_village','oasis','barbarian','wonder','empty')),
  village_id  uuid references public.imperium_villages(id) on delete set null,
  data        jsonb,
  primary key (x, y)
);

create index if not exists imperium_map_kind_idx on public.imperium_map(kind);

create table if not exists public.imperium_oasis_ownership (
  village_id      uuid not null references public.imperium_villages(id) on delete cascade,
  oasis_x         int not null,
  oasis_y         int not null,
  conquered_at    timestamptz not null default now(),
  primary key (village_id, oasis_x, oasis_y),
  unique (oasis_x, oasis_y)
);

-- ─────── QUÊTES JOURNALIÈRES ───────
create table if not exists public.imperium_quests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  quest_id    text not null,
  progress    int  not null default 0,
  target      int  not null,
  claimed     boolean not null default false,
  expires_at  timestamptz not null
);

create index if not exists imperium_quests_user_idx on public.imperium_quests(user_id, expires_at);

-- ─────── SUCCÈS ONE-SHOT ───────
create table if not exists public.imperium_achievements (
  user_id         uuid not null references auth.users(id) on delete cascade,
  achievement_id  text not null,
  unlocked_at     timestamptz not null default now(),
  os_claimed      boolean not null default false,
  primary key (user_id, achievement_id)
);

-- ─────── SAISONS ───────
create table if not exists public.imperium_seasons (
  id          serial primary key,
  name        text not null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);

-- ─────── CLASSEMENT HEBDO ───────
create table if not exists public.imperium_leaderboard_weekly (
  week_start  date not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text not null check (category in ('attack','defense','economy')),
  score       bigint not null default 0,
  primary key (week_start, user_id, category)
);

create index if not exists imperium_lb_weekly_idx on public.imperium_leaderboard_weekly(week_start, category, score desc);

-- ─────── HALL OF FAME ───────
create table if not exists public.imperium_hall_of_fame (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  season      int,
  unlocked_at timestamptz not null default now()
);

-- ══════════════════════════════════════════════════════════════════════
-- 3. RLS (ROW-LEVEL SECURITY)
-- ══════════════════════════════════════════════════════════════════════

alter table public.imperium_villages enable row level security;
alter table public.imperium_buildings enable row level security;
alter table public.imperium_construction_queue enable row level security;
alter table public.imperium_research enable row level security;
alter table public.imperium_units enable row level security;
alter table public.imperium_forge enable row level security;
alter table public.imperium_marches enable row level security;
alter table public.imperium_supports enable row level security;
alter table public.imperium_reports enable row level security;
alter table public.imperium_alliances enable row level security;
alter table public.imperium_alliance_members enable row level security;
alter table public.imperium_alliance_relations enable row level security;
alter table public.imperium_market_orders enable row level security;
alter table public.imperium_map enable row level security;
alter table public.imperium_oasis_ownership enable row level security;
alter table public.imperium_quests enable row level security;
alter table public.imperium_achievements enable row level security;
alter table public.imperium_seasons enable row level security;
alter table public.imperium_leaderboard_weekly enable row level security;
alter table public.imperium_hall_of_fame enable row level security;

-- Lecture publique des structures de jeu (carte, alliances, leaderboard, hall of fame).
drop policy if exists "imperium_villages_read" on public.imperium_villages;
create policy "imperium_villages_read" on public.imperium_villages for select using (true);

drop policy if exists "imperium_buildings_read" on public.imperium_buildings;
create policy "imperium_buildings_read" on public.imperium_buildings for select using (true);

drop policy if exists "imperium_map_read" on public.imperium_map;
create policy "imperium_map_read" on public.imperium_map for select using (true);

drop policy if exists "imperium_alliances_read" on public.imperium_alliances;
create policy "imperium_alliances_read" on public.imperium_alliances for select using (true);

drop policy if exists "imperium_am_read" on public.imperium_alliance_members;
create policy "imperium_am_read" on public.imperium_alliance_members for select using (true);

drop policy if exists "imperium_ar_read" on public.imperium_alliance_relations;
create policy "imperium_ar_read" on public.imperium_alliance_relations for select using (true);

drop policy if exists "imperium_market_read" on public.imperium_market_orders;
create policy "imperium_market_read" on public.imperium_market_orders for select using (true);

drop policy if exists "imperium_oasis_read" on public.imperium_oasis_ownership;
create policy "imperium_oasis_read" on public.imperium_oasis_ownership for select using (true);

drop policy if exists "imperium_seasons_read" on public.imperium_seasons;
create policy "imperium_seasons_read" on public.imperium_seasons for select using (true);

drop policy if exists "imperium_lb_read" on public.imperium_leaderboard_weekly;
create policy "imperium_lb_read" on public.imperium_leaderboard_weekly for select using (true);

drop policy if exists "imperium_hof_read" on public.imperium_hall_of_fame;
create policy "imperium_hof_read" on public.imperium_hall_of_fame for select using (true);

-- Données privées (lecture restreinte au propriétaire).
drop policy if exists "imperium_queue_read_own" on public.imperium_construction_queue;
create policy "imperium_queue_read_own" on public.imperium_construction_queue for select using (
  exists (select 1 from public.imperium_villages v where v.id = village_id and v.user_id = auth.uid())
);

drop policy if exists "imperium_research_read_own" on public.imperium_research;
create policy "imperium_research_read_own" on public.imperium_research for select using (
  exists (select 1 from public.imperium_villages v where v.id = village_id and v.user_id = auth.uid())
);

drop policy if exists "imperium_units_read_own" on public.imperium_units;
create policy "imperium_units_read_own" on public.imperium_units for select using (
  exists (select 1 from public.imperium_villages v where v.id = village_id and v.user_id = auth.uid())
);

drop policy if exists "imperium_forge_read_own" on public.imperium_forge;
create policy "imperium_forge_read_own" on public.imperium_forge for select using (
  exists (select 1 from public.imperium_villages v where v.id = village_id and v.user_id = auth.uid())
);

drop policy if exists "imperium_marches_read_own" on public.imperium_marches;
create policy "imperium_marches_read_own" on public.imperium_marches for select using (
  exists (select 1 from public.imperium_villages v where v.id = from_village_id and v.user_id = auth.uid())
);

drop policy if exists "imperium_supports_read_own" on public.imperium_supports;
create policy "imperium_supports_read_own" on public.imperium_supports for select using (
  exists (select 1 from public.imperium_villages v where (v.id = from_village_id or v.id = host_village_id) and v.user_id = auth.uid())
);

drop policy if exists "imperium_reports_read_own" on public.imperium_reports;
create policy "imperium_reports_read_own" on public.imperium_reports for select using (
  attacker_user_id = auth.uid() or defender_user_id = auth.uid()
);

drop policy if exists "imperium_quests_read_own" on public.imperium_quests;
create policy "imperium_quests_read_own" on public.imperium_quests for select using (auth.uid() = user_id);

drop policy if exists "imperium_ach_read_own" on public.imperium_achievements;
create policy "imperium_ach_read_own" on public.imperium_achievements for select using (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════════
-- 4. HELPERS — calcul de puissance, recherche de slot, distance
-- ══════════════════════════════════════════════════════════════════════

-- Distance Chebyshev entre deux cases (diagonales = 1).
create or replace function public.imperium_distance(p_x1 int, p_y1 int, p_x2 int, p_y2 int)
returns int language sql immutable as $$
  select greatest(abs(p_x1 - p_x2), abs(p_y1 - p_y2));
$$;

-- Puissance totale d'un compte (toutes ses villages cumulés).
create or replace function public.imperium_compute_power(p_user_id uuid)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare
  power_units bigint := 0;
  power_buildings bigint := 0;
begin
  select coalesce(sum(
    u.count * (
      coalesce((public.imperium_unit_base(v.faction, u.unit_kind)->>'att')::int, 0)
      + coalesce((public.imperium_unit_base(v.faction, u.unit_kind)->>'di')::int, 0)
      + coalesce((public.imperium_unit_base(v.faction, u.unit_kind)->>'dc')::int, 0)
    ) / 3
  ), 0)
  into power_units
  from public.imperium_units u
  join public.imperium_villages v on v.id = u.village_id
  where v.user_id = p_user_id;

  select coalesce(sum(level), 0) * 100
  into power_buildings
  from public.imperium_buildings b
  join public.imperium_villages v on v.id = b.village_id
  where v.user_id = p_user_id;

  return power_units + power_buildings + 1000;
end;
$$;

-- Range d'attaque autorisée entre attaquant et défenseur.
create or replace function public.imperium_in_range(p_attacker uuid, p_defender uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  pa bigint;
  pd bigint;
  ratio numeric;
begin
  if p_attacker = p_defender then return false; end if;
  pa := public.imperium_compute_power(p_attacker);
  pd := public.imperium_compute_power(p_defender);
  ratio := pa::numeric / nullif(pd, 0);
  return ratio between 0.7 and 1.3;
end;
$$;

-- Trouve une coordonnée libre pour spawn d'un nouveau village (dist >= 5 du voisin le plus proche).
create or replace function public.imperium_find_spawn_coord()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  candidate_x int;
  candidate_y int;
  attempts int := 0;
  max_attempts int := 100;
  has_neighbor_close boolean;
begin
  while attempts < max_attempts loop
    -- Spawn préférentiel en périphérie (rayon 30-45 du centre)
    candidate_x := (floor(random() * 91) - 45)::int;
    candidate_y := (floor(random() * 91) - 45)::int;
    -- Forcer périphérie si trop proche du centre
    if abs(candidate_x) < 25 and abs(candidate_y) < 25 then
      attempts := attempts + 1;
      continue;
    end if;
    -- Vérifier case libre
    if exists (select 1 from public.imperium_map where x = candidate_x and y = candidate_y and kind <> 'empty') then
      attempts := attempts + 1;
      continue;
    end if;
    -- Vérifier distance min 5 du village joueur le plus proche
    select exists (
      select 1 from public.imperium_villages
      where greatest(abs(x - candidate_x), abs(y - candidate_y)) < 5
    ) into has_neighbor_close;
    if has_neighbor_close then
      attempts := attempts + 1;
      continue;
    end if;
    return jsonb_build_object('x', candidate_x, 'y', candidate_y);
  end loop;
  -- Fallback : coin extrême libre
  candidate_x := 50; candidate_y := 50;
  while exists (select 1 from public.imperium_villages where x = candidate_x and y = candidate_y) loop
    candidate_x := candidate_x - 1;
    if candidate_x < -50 then candidate_x := 50; candidate_y := candidate_y - 1; end if;
    if candidate_y < -50 then exit; end if;
  end loop;
  return jsonb_build_object('x', candidate_x, 'y', candidate_y);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 5. TICK LAZY — recalcule prod, drain blé, termine timers
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_tick(p_village_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v record;
  elapsed_sec bigint;
  wood_rate numeric := 5; clay_rate numeric := 5; iron_rate numeric := 5; wheat_rate numeric := 5;
  wood_cap int := 800; wheat_cap int := 800;
  wood_lvl int := 0; clay_lvl int := 0; iron_lvl int := 0; wheat_lvl int := 0;
  oasis_bonus_wood numeric := 0; oasis_bonus_clay numeric := 0; oasis_bonus_iron numeric := 0; oasis_bonus_wheat numeric := 0;
  wheat_drain numeric := 0;
  net_wheat numeric;
  rec record;
begin
  select * into v from public.imperium_villages where id = p_village_id for update;
  if v.id is null then raise exception 'Village introuvable.'; end if;

  elapsed_sec := greatest(0, extract(epoch from now() - v.last_tick)::bigint);

  -- Niveaux des champs
  select coalesce(max(case when kind = 'wood_field' then level end), 0),
         coalesce(max(case when kind = 'clay_field' then level end), 0),
         coalesce(max(case when kind = 'iron_field' then level end), 0),
         coalesce(max(case when kind = 'wheat_field' then level end), 0)
  into wood_lvl, clay_lvl, iron_lvl, wheat_lvl
  from public.imperium_buildings where village_id = p_village_id;

  -- Caps : somme des entrepôts/greniers
  select coalesce(sum(public.imperium_storage_cap(level)) filter (where kind = 'warehouse'), 800),
         coalesce(sum(public.imperium_storage_cap(level)) filter (where kind = 'granary'), 800)
  into wood_cap, wheat_cap
  from public.imperium_buildings where village_id = p_village_id;

  -- Bonus oasis
  for rec in select data from public.imperium_map m
             join public.imperium_oasis_ownership o on o.oasis_x = m.x and o.oasis_y = m.y
             where o.village_id = p_village_id loop
    oasis_bonus_wood  := oasis_bonus_wood  + coalesce((rec.data->>'bonus_wood')::numeric, 0);
    oasis_bonus_clay  := oasis_bonus_clay  + coalesce((rec.data->>'bonus_clay')::numeric, 0);
    oasis_bonus_iron  := oasis_bonus_iron  + coalesce((rec.data->>'bonus_iron')::numeric, 0);
    oasis_bonus_wheat := oasis_bonus_wheat + coalesce((rec.data->>'bonus_wheat')::numeric, 0);
  end loop;

  wood_rate  := public.imperium_field_rate(wood_lvl)  * (1 + oasis_bonus_wood);
  clay_rate  := public.imperium_field_rate(clay_lvl)  * (1 + oasis_bonus_clay);
  iron_rate  := public.imperium_field_rate(iron_lvl)  * (1 + oasis_bonus_iron);
  wheat_rate := public.imperium_field_rate(wheat_lvl) * (1 + oasis_bonus_wheat);

  -- Drain blé par les troupes
  select coalesce(sum(u.count * coalesce((public.imperium_unit_base(v.faction, u.unit_kind)->>'wheat_h')::numeric, 0)), 0)
  into wheat_drain from public.imperium_units u where u.village_id = p_village_id;

  net_wheat := wheat_rate - wheat_drain;

  -- Crédit prod (capé par entrepôt/grenier)
  update public.imperium_villages
  set wood  = least(wood  + wood_rate  * elapsed_sec / 3600.0, wood_cap),
      clay  = least(clay  + clay_rate  * elapsed_sec / 3600.0, wood_cap),
      iron  = least(iron  + iron_rate  * elapsed_sec / 3600.0, wood_cap),
      wheat = greatest(0, least(wheat + net_wheat * elapsed_sec / 3600.0, wheat_cap)),
      last_tick = now()
  where id = p_village_id;

  -- Famine : si wheat == 0 ET drain > 0, tue 1 unité par tranche de 30 min depuis le moment où on est tombé à 0
  -- Implémentation simplifiée : si wheat = 0 et drain > 0, tue floor(elapsed / 1800) unités
  if net_wheat < 0 then
    declare
      kills int := floor(elapsed_sec / 1800.0);
      victim record;
    begin
      while kills > 0 loop
        -- Trouve l'unité avec le plus gros drain
        select unit_kind into victim
        from public.imperium_units u
        where u.village_id = p_village_id and u.count > 0
        order by coalesce((public.imperium_unit_base(v.faction, u.unit_kind)->>'wheat_h')::numeric, 0) desc,
                 coalesce((public.imperium_unit_base(v.faction, u.unit_kind)->>'wood')::int, 0)
                  + coalesce((public.imperium_unit_base(v.faction, u.unit_kind)->>'clay')::int, 0)
                  + coalesce((public.imperium_unit_base(v.faction, u.unit_kind)->>'iron')::int, 0) desc
        limit 1;
        exit when victim.unit_kind is null;
        update public.imperium_units set count = count - 1
        where village_id = p_village_id and unit_kind = victim.unit_kind;
        kills := kills - 1;
      end loop;
    end;
  end if;

  -- Termine les constructions échues
  for rec in select * from public.imperium_construction_queue
             where village_id = p_village_id and finishes_at <= now() loop
    if rec.kind = 'building' then
      insert into public.imperium_buildings (village_id, slot, kind, level)
      values (p_village_id, rec.target_slot, rec.target_kind, rec.target_level)
      on conflict (village_id, slot) do update set kind = excluded.kind, level = excluded.level;
    elsif rec.kind = 'research' then
      insert into public.imperium_research (village_id, unit_kind, researched)
      values (p_village_id, rec.target_kind, true)
      on conflict (village_id, unit_kind) do update set researched = true;
    elsif rec.kind = 'forge' then
      declare
        axis text := split_part(rec.target_kind, '/', 2);
        unit text := split_part(rec.target_kind, '/', 1);
      begin
        if axis = 'attack' then
          insert into public.imperium_forge (village_id, unit_kind, attack_level, defense_level)
          values (p_village_id, unit, rec.target_level, 0)
          on conflict (village_id, unit_kind) do update set attack_level = rec.target_level;
        else
          insert into public.imperium_forge (village_id, unit_kind, attack_level, defense_level)
          values (p_village_id, unit, 0, rec.target_level)
          on conflict (village_id, unit_kind) do update set defense_level = rec.target_level;
        end if;
      end;
    end if;
    delete from public.imperium_construction_queue where id = rec.id;
  end loop;

  -- Termine les recrutements échus (déplace recruiting_count → count selon les ticks passés)
  for rec in select * from public.imperium_units
             where village_id = p_village_id and recruiting_count > 0 and recruiting_finishes_at is not null loop
    declare
      sec_since_start int := greatest(0, extract(epoch from now() - (rec.recruiting_finishes_at - (rec.recruiting_count * coalesce(rec.per_unit_seconds, 60) * interval '1 second')))::int);
      finished int;
    begin
      if rec.per_unit_seconds is null or rec.per_unit_seconds <= 0 then continue; end if;
      finished := least(rec.recruiting_count, sec_since_start / rec.per_unit_seconds);
      if finished > 0 then
        update public.imperium_units
        set count = count + finished,
            recruiting_count = recruiting_count - finished,
            recruiting_finishes_at = case when recruiting_count - finished <= 0 then null else recruiting_finishes_at end
        where village_id = p_village_id and unit_kind = rec.unit_kind;
      end if;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'elapsed_sec', elapsed_sec);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 6. CRÉATION DE VILLAGE
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_create_village(p_faction text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  coord jsonb;
  new_id uuid;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if p_faction not in ('legion','horde','ordre') then raise exception 'Faction invalide.'; end if;
  if length(coalesce(p_name, '')) < 1 or length(p_name) > 30 then raise exception 'Nom invalide (1-30 chars).'; end if;
  if exists (select 1 from public.imperium_villages where user_id = caller and is_secondary = false) then
    raise exception 'Tu as déjà un village principal.';
  end if;

  coord := public.imperium_find_spawn_coord();
  if coord is null then raise exception 'Aucune case libre disponible.'; end if;

  insert into public.imperium_villages (user_id, name, faction, x, y, shield_until)
  values (caller, p_name, p_faction, (coord->>'x')::int, (coord->>'y')::int, now() + interval '24 hours')
  returning id into new_id;

  -- Hôtel niveau 1 placé en slot 5 (centre 4×4, position (1,1))
  insert into public.imperium_buildings (village_id, slot, kind, level)
  values (new_id, 5, 'town_hall', 1);

  -- Champs niveau 0 sur slots -1..-4
  insert into public.imperium_buildings (village_id, slot, kind, level) values
    (new_id, -1, 'wood_field', 0),
    (new_id, -2, 'clay_field', 0),
    (new_id, -3, 'iron_field', 0),
    (new_id, -4, 'wheat_field', 0);

  -- Marquer la case sur la map
  insert into public.imperium_map (x, y, kind, village_id)
  values ((coord->>'x')::int, (coord->>'y')::int, 'player_village', new_id)
  on conflict (x, y) do update set kind = 'player_village', village_id = new_id;

  -- Achievement first_village
  insert into public.imperium_achievements (user_id, achievement_id)
  values (caller, 'ach_first_village')
  on conflict (user_id, achievement_id) do nothing;

  return new_id;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 7. UPGRADE DE BÂTIMENT
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_upgrade_building(p_village_id uuid, p_slot int, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  v record;
  current_lvl int := 0;
  current_kind text;
  target_lvl int;
  cost jsonb;
  hall_lvl int;
  cap int;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  -- Tick d'abord pour calculer prod accumulée
  perform public.imperium_tick(p_village_id);

  select * into v from public.imperium_villages where id = p_village_id for update;
  if v.user_id <> caller then raise exception 'Pas ton village.'; end if;

  -- File construction pleine ?
  if exists (select 1 from public.imperium_construction_queue where village_id = p_village_id and kind = 'building') then
    raise exception 'File de construction occupée.';
  end if;

  -- Niveau actuel du slot
  select level, kind into current_lvl, current_kind
  from public.imperium_buildings where village_id = p_village_id and slot = p_slot;

  if current_kind is null then
    -- Nouveau bâtiment, slot vide
    if p_slot < 0 then raise exception 'Champ inexistant.'; end if;
    if p_slot > 15 then raise exception 'Slot invalide.'; end if;
    target_lvl := 1;
  else
    -- Upgrade existant
    if current_kind <> p_kind then raise exception 'Kind ne matche pas (slot occupé par %).', current_kind; end if;
    target_lvl := current_lvl + 1;
  end if;

  -- Cap niveau
  select coalesce(level, 0) into hall_lvl from public.imperium_buildings where village_id = p_village_id and kind = 'town_hall';
  cap := public.imperium_building_cap(p_kind, hall_lvl);
  if target_lvl > cap then raise exception 'Niveau max atteint (cap %).', cap; end if;

  -- Champ niveau 11+ requiert hôtel >= 10
  if p_kind in ('wood_field','clay_field','iron_field','wheat_field') and target_lvl > 10 and hall_lvl < 10 then
    raise exception 'Hôtel niveau 10 requis pour champ niveau 11+.';
  end if;

  -- Prérequis spécifiques
  if p_kind = 'stable' then
    if not exists (select 1 from public.imperium_buildings where village_id = p_village_id and kind = 'barracks' and level >= 5) then
      raise exception 'Caserne niveau 5 requis.';
    end if;
  end if;
  if p_kind = 'workshop' then
    if not exists (select 1 from public.imperium_buildings where village_id = p_village_id and kind = 'barracks' and level >= 10) then
      raise exception 'Caserne niveau 10 requis.';
    end if;
    if not exists (select 1 from public.imperium_buildings where village_id = p_village_id and kind = 'academy' and level >= 10) then
      raise exception 'Académie niveau 10 requis.';
    end if;
  end if;

  cost := public.imperium_building_cost(p_kind, target_lvl);
  if cost is null then raise exception 'Bâtiment inconnu : %', p_kind; end if;

  -- Vérifier ressources
  if v.wood < (cost->>'wood')::int or v.clay < (cost->>'clay')::int
     or v.iron < (cost->>'iron')::int or v.wheat < (cost->>'wheat')::int then
    raise exception 'Ressources insuffisantes.';
  end if;

  -- Débiter
  update public.imperium_villages
  set wood = wood - (cost->>'wood')::int,
      clay = clay - (cost->>'clay')::int,
      iron = iron - (cost->>'iron')::int,
      wheat = wheat - (cost->>'wheat')::int
  where id = p_village_id;

  -- Mettre en file
  insert into public.imperium_construction_queue (village_id, kind, target_kind, target_slot, target_level, finishes_at)
  values (p_village_id, 'building', p_kind, p_slot, target_lvl, now() + ((cost->>'time')::int * interval '1 second'));

  return jsonb_build_object('ok', true, 'target_level', target_lvl, 'finishes_at', now() + ((cost->>'time')::int * interval '1 second'));
end;
$$;

-- Annule une construction (rembourse 80%).
create or replace function public.imperium_cancel_construction(p_queue_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  q record;
  v record;
  cost jsonb;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select * into q from public.imperium_construction_queue where id = p_queue_id;
  if q.id is null then raise exception 'File introuvable.'; end if;
  select * into v from public.imperium_villages where id = q.village_id for update;
  if v.user_id <> caller then raise exception 'Pas ta file.'; end if;

  if q.kind = 'building' then
    cost := public.imperium_building_cost(q.target_kind, q.target_level);
    update public.imperium_villages
    set wood = wood + ((cost->>'wood')::int * 0.8)::int,
        clay = clay + ((cost->>'clay')::int * 0.8)::int,
        iron = iron + ((cost->>'iron')::int * 0.8)::int,
        wheat = wheat + ((cost->>'wheat')::int * 0.8)::int
    where id = q.village_id;
  end if;

  delete from public.imperium_construction_queue where id = p_queue_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 8. RECHERCHE ACADÉMIE
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_research_unit(p_village_id uuid, p_unit_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  v record;
  unit_base jsonb;
  cost_mult numeric := 4; -- moyenne
  research_seconds int := 1800;
  total_cost jsonb;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  perform public.imperium_tick(p_village_id);
  select * into v from public.imperium_villages where id = p_village_id for update;
  if v.user_id <> caller then raise exception 'Pas ton village.'; end if;

  if exists (select 1 from public.imperium_construction_queue where village_id = p_village_id and kind = 'research') then
    raise exception 'Recherche déjà en cours.';
  end if;
  if exists (select 1 from public.imperium_research where village_id = p_village_id and unit_kind = p_unit_kind and researched) then
    raise exception 'Déjà recherchée.';
  end if;

  unit_base := public.imperium_unit_base(v.faction, p_unit_kind);
  if unit_base is null then raise exception 'Unité inconnue : %', p_unit_kind; end if;

  -- Coût recherche = mult × coût unité
  total_cost := jsonb_build_object(
    'wood',  (unit_base->>'wood')::int  * cost_mult,
    'clay',  (unit_base->>'clay')::int  * cost_mult,
    'iron',  (unit_base->>'iron')::int  * cost_mult,
    'wheat', (unit_base->>'wheat')::int * cost_mult
  );

  if v.wood < (total_cost->>'wood')::numeric or v.clay < (total_cost->>'clay')::numeric
     or v.iron < (total_cost->>'iron')::numeric or v.wheat < (total_cost->>'wheat')::numeric then
    raise exception 'Ressources insuffisantes.';
  end if;

  update public.imperium_villages
  set wood = wood - (total_cost->>'wood')::numeric,
      clay = clay - (total_cost->>'clay')::numeric,
      iron = iron - (total_cost->>'iron')::numeric,
      wheat = wheat - (total_cost->>'wheat')::numeric
  where id = p_village_id;

  insert into public.imperium_construction_queue (village_id, kind, target_kind, target_level, finishes_at)
  values (p_village_id, 'research', p_unit_kind, 1, now() + (research_seconds * interval '1 second'));

  return jsonb_build_object('ok', true, 'finishes_at', now() + (research_seconds * interval '1 second'));
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 9. RECRUTEMENT
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_recruit(p_village_id uuid, p_unit_kind text, p_count int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  v record;
  unit_base jsonb;
  unit_cat text;
  per_unit_seconds int;
  recruit_speed numeric := 1.0;
  bldg_level int;
  total_cost record;
  is_basic_inf boolean;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if p_count <= 0 or p_count > 10000 then raise exception 'Count invalide.'; end if;
  perform public.imperium_tick(p_village_id);
  select * into v from public.imperium_villages where id = p_village_id for update;
  if v.user_id <> caller then raise exception 'Pas ton village.'; end if;

  unit_base := public.imperium_unit_base(v.faction, p_unit_kind);
  if unit_base is null then raise exception 'Unité inconnue : %', p_unit_kind; end if;
  unit_cat := unit_base->>'cat';

  -- Bâtiment de recrutement requis
  is_basic_inf := p_unit_kind in ('legionnaire','marauder','templar');
  case unit_cat
    when 'inf' then
      select coalesce(level, 0) into bldg_level from public.imperium_buildings where village_id = p_village_id and kind = 'barracks';
      if bldg_level < 1 then raise exception 'Caserne requise.'; end if;
      recruit_speed := 1 + 0.05 * bldg_level;
    when 'cav', 'cav_scout' then
      select coalesce(level, 0) into bldg_level from public.imperium_buildings where village_id = p_village_id and kind = 'stable';
      if bldg_level < 1 then raise exception 'Écurie requise.'; end if;
      recruit_speed := 1 + 0.05 * bldg_level;
    when 'siege' then
      select coalesce(level, 0) into bldg_level from public.imperium_buildings where village_id = p_village_id and kind = 'workshop';
      if bldg_level < 1 then raise exception 'Atelier requis.'; end if;
      recruit_speed := 1 + 0.05 * bldg_level;
    when 'special' then
      select coalesce(level, 0) into bldg_level from public.imperium_buildings where village_id = p_village_id and kind = 'town_hall';
      if bldg_level < 10 then raise exception 'Hôtel niveau 10 requis pour les unités spéciales.'; end if;
      recruit_speed := 1.0;
    else raise exception 'Catégorie inconnue.';
  end case;

  -- Recherche requise sauf infanterie de base
  if not is_basic_inf then
    if not exists (select 1 from public.imperium_research where village_id = p_village_id and unit_kind = p_unit_kind and researched) then
      raise exception 'Recherche % manquante en académie.', p_unit_kind;
    end if;
  end if;

  -- Coût total
  if v.wood  < (unit_base->>'wood')::int  * p_count then raise exception 'Bois insuffisant.'; end if;
  if v.clay  < (unit_base->>'clay')::int  * p_count then raise exception 'Argile insuffisante.'; end if;
  if v.iron  < (unit_base->>'iron')::int  * p_count then raise exception 'Fer insuffisant.'; end if;
  if v.wheat < (unit_base->>'wheat')::int * p_count then raise exception 'Blé insuffisant.'; end if;

  update public.imperium_villages
  set wood  = wood  - (unit_base->>'wood')::int  * p_count,
      clay  = clay  - (unit_base->>'clay')::int  * p_count,
      iron  = iron  - (unit_base->>'iron')::int  * p_count,
      wheat = wheat - (unit_base->>'wheat')::int * p_count
  where id = p_village_id;

  per_unit_seconds := floor((unit_base->>'time')::int / recruit_speed)::int;

  -- Append à la file de recrutement
  insert into public.imperium_units (village_id, unit_kind, count, recruiting_count, recruiting_finishes_at, per_unit_seconds)
  values (p_village_id, p_unit_kind, 0, p_count, now() + (per_unit_seconds * p_count * interval '1 second'), per_unit_seconds)
  on conflict (village_id, unit_kind) do update
    set recruiting_count = public.imperium_units.recruiting_count + p_count,
        recruiting_finishes_at = greatest(coalesce(public.imperium_units.recruiting_finishes_at, now()), now())
                                  + (per_unit_seconds * p_count * interval '1 second'),
        per_unit_seconds = per_unit_seconds;

  return jsonb_build_object('ok', true, 'count', p_count, 'per_unit_seconds', per_unit_seconds);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 10. FORGE
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_forge_upgrade(p_village_id uuid, p_unit_kind text, p_axis text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  v record;
  cur record;
  next_level int;
  unit_base jsonb;
  cost_factor numeric;
  cost jsonb;
  time_seconds int;
  forge_lvl int;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if p_axis not in ('attack','defense') then raise exception 'Axe invalide.'; end if;
  perform public.imperium_tick(p_village_id);
  select * into v from public.imperium_villages where id = p_village_id for update;
  if v.user_id <> caller then raise exception 'Pas ton village.'; end if;

  if exists (select 1 from public.imperium_construction_queue where village_id = p_village_id and kind = 'forge') then
    raise exception 'Forge déjà en cours.';
  end if;

  select coalesce(level, 0) into forge_lvl from public.imperium_buildings where village_id = p_village_id and kind = 'forge';
  if forge_lvl < 1 then raise exception 'Forge requise.'; end if;

  if not exists (select 1 from public.imperium_research where village_id = p_village_id and unit_kind = p_unit_kind and researched)
     and p_unit_kind not in ('legionnaire','marauder','templar') then
    raise exception 'Unité non recherchée.';
  end if;

  select * into cur from public.imperium_forge where village_id = p_village_id and unit_kind = p_unit_kind;
  if p_axis = 'attack' then
    next_level := coalesce(cur.attack_level, 0) + 1;
  else
    next_level := coalesce(cur.defense_level, 0) + 1;
  end if;
  if next_level > 20 then raise exception 'Niveau forge max atteint.'; end if;
  if next_level > forge_lvl then raise exception 'Niveau forge bâtiment insuffisant (%).', forge_lvl; end if;

  unit_base := public.imperium_unit_base(v.faction, p_unit_kind);
  cost_factor := power(2, next_level - 1) / 5.0;
  cost := jsonb_build_object(
    'wood',  floor((unit_base->>'wood')::int  * cost_factor),
    'clay',  floor((unit_base->>'clay')::int  * cost_factor),
    'iron',  floor((unit_base->>'iron')::int  * cost_factor),
    'wheat', floor((unit_base->>'wheat')::int * cost_factor)
  );
  time_seconds := floor(900 * power(1.5, next_level - 1))::int;

  if v.wood < (cost->>'wood')::int or v.clay < (cost->>'clay')::int
     or v.iron < (cost->>'iron')::int or v.wheat < (cost->>'wheat')::int then
    raise exception 'Ressources insuffisantes.';
  end if;

  update public.imperium_villages
  set wood = wood - (cost->>'wood')::int,
      clay = clay - (cost->>'clay')::int,
      iron = iron - (cost->>'iron')::int,
      wheat = wheat - (cost->>'wheat')::int
  where id = p_village_id;

  insert into public.imperium_construction_queue (village_id, kind, target_kind, target_level, finishes_at)
  values (p_village_id, 'forge', p_unit_kind || '/' || p_axis, next_level, now() + (time_seconds * interval '1 second'));

  return jsonb_build_object('ok', true, 'next_level', next_level);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 11. COMBAT — résolveur central
-- ══════════════════════════════════════════════════════════════════════

-- Calcule pertes attaquant et défenseur pour un combat.
-- Retourne jsonb { attacker_power, defense_power, ratio, att_loss_pct, def_loss_pct }.
create or replace function public.imperium_combat_resolve(
  p_units_attacker jsonb,    -- { unit_kind: count }
  p_faction_attacker text,
  p_units_defender jsonb,    -- inclut les soutiens fusionnés
  p_faction_defender text,
  p_wall_level int
) returns jsonb language plpgsql immutable as $$
declare
  att_kind text;
  def_kind text;
  att_count int;
  def_count int;
  ub jsonb;
  power_att numeric := 0;
  power_def_inf numeric := 0;
  power_def_cav numeric := 0;
  total_att_inf numeric := 0;
  total_att_all numeric := 0;
  ratio_inf_att numeric;
  power_def numeric;
  wall_bonus numeric;
  ratio numeric;
  att_loss numeric;
  def_loss numeric;
begin
  -- Power attaquant + composition inf/cav
  for att_kind, att_count in select * from jsonb_each_text(p_units_attacker) loop
    if att_count::int = 0 then continue; end if;
    ub := public.imperium_unit_base(p_faction_attacker, att_kind);
    if ub is null then continue; end if;
    power_att := power_att + att_count::int * (ub->>'att')::int;
    total_att_all := total_att_all + att_count::int;
    if (ub->>'cat') = 'inf' then total_att_inf := total_att_inf + att_count::int; end if;
  end loop;

  -- Power défenseur (DI et DC séparés)
  for def_kind, def_count in select * from jsonb_each_text(p_units_defender) loop
    if def_count::int = 0 then continue; end if;
    ub := public.imperium_unit_base(p_faction_defender, def_kind);
    if ub is null then continue; end if;
    power_def_inf := power_def_inf + def_count::int * (ub->>'di')::int;
    power_def_cav := power_def_cav + def_count::int * (ub->>'dc')::int;
  end loop;

  -- Pondération
  if total_att_all = 0 then
    ratio_inf_att := 0;
  else
    ratio_inf_att := total_att_inf / total_att_all;
  end if;
  power_def := ratio_inf_att * power_def_inf + (1 - ratio_inf_att) * power_def_cav;

  -- Muraille
  wall_bonus := public.imperium_wall_bonus(p_faction_defender, p_wall_level);
  power_def := power_def * (1 + wall_bonus);

  -- Ratio
  ratio := power_att / greatest(power_def, 1);

  if ratio >= 1 then
    att_loss := power(1.0 / ratio, 1.5);
    def_loss := 1.0;
  else
    att_loss := 1.0;
    def_loss := power(ratio, 1.5);
  end if;

  return jsonb_build_object(
    'attacker_power', floor(power_att),
    'defense_power', floor(power_def),
    'ratio', round(ratio::numeric, 3),
    'att_loss_pct', round(att_loss::numeric, 4),
    'def_loss_pct', round(def_loss::numeric, 4),
    'wall_bonus', wall_bonus
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 12. ENVOI ET RÉSOLUTION DE MARCHES
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_send_march(
  p_village_id uuid,
  p_to_x int, p_to_y int,
  p_kind text,
  p_units jsonb,
  p_target_building text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  v record;
  target record;
  defender_user uuid;
  k text; cnt int;
  ub jsonb;
  min_speed numeric := 1000;
  total_units int := 0;
  distance int;
  travel_seconds int;
  march_id uuid;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if p_kind not in ('raid','attack','support','spy','conquest','settle') then raise exception 'Type marche invalide.'; end if;
  perform public.imperium_tick(p_village_id);
  select * into v from public.imperium_villages where id = p_village_id for update;
  if v.user_id <> caller then raise exception 'Pas ton village.'; end if;

  -- Bouclier saute si marche hostile
  if p_kind in ('raid','attack','conquest') and v.shield_until is not null and v.shield_until > now() then
    update public.imperium_villages set shield_until = null where id = p_village_id;
  end if;

  -- Vérifier troupes disponibles + débiter + calcul vitesse min
  for k, cnt in select * from jsonb_each_text(p_units) loop
    if cnt::int <= 0 then continue; end if;
    ub := public.imperium_unit_base(v.faction, k);
    if ub is null then raise exception 'Unité inconnue : %', k; end if;
    if not exists (select 1 from public.imperium_units where village_id = p_village_id and unit_kind = k and count >= cnt::int) then
      raise exception 'Troupes insuffisantes : %', k;
    end if;
    update public.imperium_units set count = count - cnt::int where village_id = p_village_id and unit_kind = k;
    if (ub->>'vit')::numeric < min_speed then min_speed := (ub->>'vit')::numeric; end if;
    total_units := total_units + cnt::int;
  end loop;

  if total_units = 0 then raise exception 'Aucune unité.'; end if;
  if min_speed >= 1000 then raise exception 'Erreur calcul vitesse.'; end if;

  -- Distance + temps
  distance := public.imperium_distance(v.x, v.y, p_to_x, p_to_y);
  if distance < 1 then raise exception 'Cible identique au village d''origine.'; end if;
  travel_seconds := ceil((distance / min_speed) * 3600)::int;

  -- Vérifications cible
  select * into target from public.imperium_map where x = p_to_x and y = p_to_y;
  if target.kind is null then
    if p_kind <> 'settle' then raise exception 'Case cible vide.'; end if;
  end if;

  if p_kind in ('raid','attack','conquest','spy') and target.kind = 'player_village' then
    select user_id into defender_user from public.imperium_villages where id = target.village_id;
    -- Pas d'attaque sur soi-même
    if defender_user = caller then raise exception 'Tu ne peux pas t''attaquer toi-même.'; end if;
    -- Bouclier
    if exists (select 1 from public.imperium_villages where id = target.village_id and shield_until > now()) then
      raise exception 'Cible sous bouclier.';
    end if;
    -- Range (sauf inactif >7j)
    if p_kind in ('raid','attack','conquest') then
      if not exists (select 1 from public.imperium_villages where id = target.village_id and last_login < now() - interval '7 days') then
        if not public.imperium_in_range(caller, defender_user) then
          raise exception 'Cible hors range de puissance (±30%%).';
        end if;
      end if;
    end if;
    -- Conquête : conditions strictes
    if p_kind = 'conquest' then
      if not exists (select 1 from public.imperium_villages where id = target.village_id and last_login < now() - interval '30 days') then
        raise exception 'Conquête possible uniquement sur village inactif >30j.';
      end if;
      if not exists (select 1 from public.imperium_buildings where village_id = p_village_id and kind = 'town_hall' and level >= 20) then
        raise exception 'Hôtel niveau 20 requis pour conquête.';
      end if;
    end if;
    -- Pas d'attaque entre alliés
    if exists (
      select 1 from public.imperium_alliance_members am1
      join public.imperium_alliance_members am2 on am1.alliance_id = am2.alliance_id
      where am1.user_id = caller and am2.user_id = defender_user
    ) then
      raise exception 'Pas d''attaque entre membres de la même alliance.';
    end if;
  end if;

  if p_kind = 'spy' and target.kind not in ('player_village','barbarian','oasis') then
    raise exception 'Espionnage impossible sur cette case.';
  end if;

  insert into public.imperium_marches (from_village_id, to_x, to_y, kind, units, target_building, arrives_at)
  values (p_village_id, p_to_x, p_to_y, p_kind, p_units, p_target_building, now() + (travel_seconds * interval '1 second'))
  returning id into march_id;

  return march_id;
end;
$$;

-- Annule une marche (< 60s après envoi).
create or replace function public.imperium_cancel_march(p_march_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  m record;
  v record;
  k text; cnt int;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select * into m from public.imperium_marches where id = p_march_id for update;
  if m.id is null then raise exception 'Marche introuvable.'; end if;
  select * into v from public.imperium_villages where id = m.from_village_id;
  if v.user_id <> caller then raise exception 'Pas ta marche.'; end if;
  if m.created_at < now() - interval '60 seconds' then raise exception 'Délai d''annulation dépassé.'; end if;
  if m.state <> 'outbound' then raise exception 'Impossible (état %).', m.state; end if;

  -- Restituer les troupes
  for k, cnt in select * from jsonb_each_text(m.units) loop
    update public.imperium_units set count = count + cnt::int where village_id = m.from_village_id and unit_kind = k;
  end loop;
  update public.imperium_marches set state = 'cancelled' where id = p_march_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Résout une marche arrivée (combat / loot / retour).
create or replace function public.imperium_resolve_one_march(p_march_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m record;
  src record;
  target_map record;
  target_village record;
  combat jsonb;
  defender_units jsonb := '{}'::jsonb;
  wall_level int := 0;
  defender_faction text;
  loot_w int := 0; loot_c int := 0; loot_i int := 0; loot_wh int := 0;
  visible_w numeric; visible_c numeric; visible_i numeric; visible_wh numeric;
  hideout_lvl int := 0; hideout_cap int := 0;
  loot_capacity int := 0;
  k text; cnt int;
  ub jsonb;
  surviving_units jsonb := '{}'::jsonb;
  remaining int;
  return_seconds int;
  src_speed numeric := 1000;
begin
  select * into m from public.imperium_marches where id = p_march_id for update;
  if m.id is null or m.state <> 'outbound' or m.arrives_at > now() then return null; end if;

  select * into src from public.imperium_villages where id = m.from_village_id;
  select * into target_map from public.imperium_map where x = m.to_x and y = m.to_y;

  -- ESPIONNAGE simple : si l'unique unité est cav_scout, on rentre direct avec rapport
  if m.kind = 'spy' then
    update public.imperium_marches set state = 'returning', returns_at = m.arrives_at + (m.arrives_at - m.created_at) where id = p_march_id;
    insert into public.imperium_reports (attacker_user_id, defender_user_id, march_id, kind, data)
    values (
      src.user_id,
      case when target_map.kind = 'player_village' then (select user_id from public.imperium_villages where id = target_map.village_id) else null end,
      p_march_id, 'spy',
      jsonb_build_object('target_x', m.to_x, 'target_y', m.to_y, 'spotted', false)
    );
    return jsonb_build_object('ok', true, 'kind', 'spy');
  end if;

  -- Récupérer composition défense
  if target_map.kind = 'player_village' then
    select * into target_village from public.imperium_villages where id = target_map.village_id for update;
    defender_faction := target_village.faction;
    select coalesce(jsonb_object_agg(unit_kind, count), '{}'::jsonb)
    into defender_units
    from public.imperium_units where village_id = target_village.id and count > 0;
    -- Soutiens : on agrège les units jsonb de tous les soutiens présents
    for k, cnt in
      select sub.unit_kind, sum(sub.cnt)::int
      from (
        select e.key as unit_kind, e.value::int as cnt
        from public.imperium_supports s, lateral jsonb_each_text(s.units) e
        where s.host_village_id = target_village.id and s.recalled_at is null
      ) sub
      group by sub.unit_kind
    loop
      defender_units := jsonb_set(defender_units, array[k], to_jsonb(coalesce((defender_units->>k)::int, 0) + cnt));
    end loop;
    select coalesce(level, 0) into wall_level from public.imperium_buildings where village_id = target_village.id and kind = 'wall';
  elsif target_map.kind = 'barbarian' then
    defender_faction := 'legion'; -- les barbares utilisent les stats légion par défaut
    -- Garnison NPC : data->'garrison' jsonb {kind: count}
    defender_units := coalesce(target_map.data->'garrison', '{}'::jsonb);
  elsif target_map.kind = 'oasis' then
    defender_faction := 'horde';
    defender_units := coalesce(target_map.data->'garrison', '{}'::jsonb);
  else
    defender_units := '{}'::jsonb;
    defender_faction := 'legion';
  end if;

  -- Combat
  combat := public.imperium_combat_resolve(m.units, src.faction, defender_units, defender_faction, wall_level);

  -- Calculer survivants attaquant
  for k, cnt in select * from jsonb_each_text(m.units) loop
    remaining := floor(cnt::int * (1.0 - (combat->>'att_loss_pct')::numeric))::int;
    if remaining > 0 then
      surviving_units := jsonb_set(surviving_units, array[k], to_jsonb(remaining));
      ub := public.imperium_unit_base(src.faction, k);
      loot_capacity := loot_capacity + remaining * coalesce((ub->>'loot')::int, 0);
      if (ub->>'vit')::numeric < src_speed then src_speed := (ub->>'vit')::numeric; end if;
    end if;
  end loop;

  -- Calcul loot si attaquant gagne
  if (combat->>'def_loss_pct')::numeric >= 0.99 and m.kind in ('raid','attack') then
    -- Ressources visibles = totales - cachées
    if target_map.kind = 'player_village' then
      select coalesce(level, 0) into hideout_lvl from public.imperium_buildings where village_id = target_village.id and kind = 'hideout';
      hideout_cap := public.imperium_hideout_cap(hideout_lvl);
      visible_w  := greatest(0, target_village.wood  - hideout_cap);
      visible_c  := greatest(0, target_village.clay  - hideout_cap);
      visible_i  := greatest(0, target_village.iron  - hideout_cap);
      visible_wh := greatest(0, target_village.wheat - hideout_cap);
      loot_w  := least(floor(visible_w  * 0.30)::int, loot_capacity);
      loot_capacity := loot_capacity - loot_w;
      loot_c  := least(floor(visible_c  * 0.30)::int, loot_capacity);
      loot_capacity := loot_capacity - loot_c;
      loot_i  := least(floor(visible_i  * 0.30)::int, loot_capacity);
      loot_capacity := loot_capacity - loot_i;
      loot_wh := least(floor(visible_wh * 0.30)::int, loot_capacity);
      update public.imperium_villages
      set wood = wood - loot_w, clay = clay - loot_c, iron = iron - loot_i, wheat = wheat - loot_wh,
          shield_until = now() + interval '12 hours'
      where id = target_village.id;
    elsif target_map.kind = 'barbarian' then
      visible_w := coalesce((target_map.data->>'wood')::numeric, 0);
      visible_c := coalesce((target_map.data->>'clay')::numeric, 0);
      visible_i := coalesce((target_map.data->>'iron')::numeric, 0);
      visible_wh := coalesce((target_map.data->>'wheat')::numeric, 0);
      loot_w  := least(floor(visible_w  * 0.50)::int, loot_capacity);
      loot_capacity := loot_capacity - loot_w;
      loot_c  := least(floor(visible_c  * 0.50)::int, loot_capacity);
      loot_capacity := loot_capacity - loot_c;
      loot_i  := least(floor(visible_i  * 0.50)::int, loot_capacity);
      loot_capacity := loot_capacity - loot_i;
      loot_wh := least(floor(visible_wh * 0.50)::int, loot_capacity);
    end if;
  end if;

  -- Appliquer pertes défenseur (joueur seulement)
  if target_map.kind = 'player_village' and (combat->>'def_loss_pct')::numeric > 0 then
    for k, cnt in select * from jsonb_each_text(defender_units) loop
      remaining := floor(cnt::int * (1.0 - (combat->>'def_loss_pct')::numeric))::int;
      update public.imperium_units set count = remaining where village_id = target_village.id and unit_kind = k;
    end loop;
  end if;

  -- Rapport pour les deux parties
  insert into public.imperium_reports (
    attacker_user_id, defender_user_id, march_id, kind, data
  ) values (
    src.user_id,
    case when target_map.kind = 'player_village' then target_village.user_id else null end,
    p_march_id, m.kind,
    jsonb_build_object(
      'target_x', m.to_x, 'target_y', m.to_y,
      'attacker_units', m.units,
      'defender_units', defender_units,
      'combat', combat,
      'survivors', surviving_units,
      'loot', jsonb_build_object('wood', loot_w, 'clay', loot_c, 'iron', loot_i, 'wheat', loot_wh)
    )
  );

  -- Lance retour
  if src_speed >= 1000 then src_speed := 5; end if; -- fallback
  return_seconds := ceil((public.imperium_distance(src.x, src.y, m.to_x, m.to_y) / src_speed) * 3600)::int;
  update public.imperium_marches
  set state = 'returning',
      returns_at = now() + (return_seconds * interval '1 second'),
      loot = jsonb_build_object('wood', loot_w, 'clay', loot_c, 'iron', loot_i, 'wheat', loot_wh),
      units = surviving_units
  where id = p_march_id;

  return jsonb_build_object('ok', true, 'combat', combat, 'loot', jsonb_build_object('wood', loot_w, 'clay', loot_c, 'iron', loot_i, 'wheat', loot_wh));
end;
$$;

-- Termine une marche revenue (rajoute troupes + butin).
create or replace function public.imperium_finalize_returning_march(p_march_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m record;
  k text; cnt int;
begin
  select * into m from public.imperium_marches where id = p_march_id for update;
  if m.id is null or m.state <> 'returning' or m.returns_at > now() then return null; end if;

  -- Restituer troupes
  for k, cnt in select * from jsonb_each_text(coalesce(m.units, '{}'::jsonb)) loop
    if cnt::int > 0 then
      insert into public.imperium_units (village_id, unit_kind, count)
      values (m.from_village_id, k, cnt::int)
      on conflict (village_id, unit_kind) do update set count = public.imperium_units.count + cnt::int;
    end if;
  end loop;

  -- Crédit loot
  if m.loot is not null then
    update public.imperium_villages
    set wood  = wood  + coalesce((m.loot->>'wood')::int, 0),
        clay  = clay  + coalesce((m.loot->>'clay')::int, 0),
        iron  = iron  + coalesce((m.loot->>'iron')::int, 0),
        wheat = wheat + coalesce((m.loot->>'wheat')::int, 0)
    where id = m.from_village_id;
  end if;

  update public.imperium_marches set state = 'completed' where id = p_march_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Cron : résout toutes les marches arrivées et terminées.
create or replace function public.imperium_resolve_marches()
returns int language plpgsql security definer set search_path = public as $$
declare
  m record;
  resolved int := 0;
begin
  for m in select id from public.imperium_marches where state = 'outbound' and arrives_at <= now() loop
    perform public.imperium_resolve_one_march(m.id);
    resolved := resolved + 1;
  end loop;
  for m in select id from public.imperium_marches where state = 'returning' and returns_at <= now() loop
    perform public.imperium_finalize_returning_march(m.id);
    resolved := resolved + 1;
  end loop;
  return resolved;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 13. ÉCONOMIE OS — skip de timer, achats premium
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_skip_timer(p_queue_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  q record;
  v record;
  remaining_sec int;
  cost int;
  cur_gold bigint;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select * into q from public.imperium_construction_queue where id = p_queue_id for update;
  if q.id is null then raise exception 'File introuvable.'; end if;
  select * into v from public.imperium_villages where id = q.village_id;
  if v.user_id <> caller then raise exception 'Pas ta file.'; end if;

  remaining_sec := greatest(0, extract(epoch from q.finishes_at - now())::int);
  cost := public.imperium_skip_cost(remaining_sec);
  if cost < 0 then raise exception 'Timer trop long pour skip (>24h).'; end if;

  select gold into cur_gold from public.profiles where id = caller for update;
  if coalesce(cur_gold, 0) < cost then raise exception 'OS insuffisants (% requis).', cost; end if;

  update public.profiles set gold = gold - cost, updated_at = now() where id = caller;

  -- Force la fin immédiate du timer
  update public.imperium_construction_queue set finishes_at = now() where id = p_queue_id;
  perform public.imperium_tick(q.village_id);
  return jsonb_build_object('ok', true, 'os_spent', cost);
end;
$$;

-- Skip recrutement (file complète d'une unité).
create or replace function public.imperium_skip_recruitment(p_village_id uuid, p_unit_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  v record;
  u record;
  remaining_sec int;
  cost int;
  cur_gold bigint;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select * into v from public.imperium_villages where id = p_village_id;
  if v.user_id <> caller then raise exception 'Pas ton village.'; end if;
  select * into u from public.imperium_units where village_id = p_village_id and unit_kind = p_unit_kind for update;
  if u.recruiting_count <= 0 then raise exception 'Aucun recrutement en cours.'; end if;
  remaining_sec := greatest(0, extract(epoch from u.recruiting_finishes_at - now())::int);
  cost := public.imperium_skip_cost(remaining_sec);
  if cost < 0 then raise exception 'Timer trop long pour skip (>24h).'; end if;
  select gold into cur_gold from public.profiles where id = caller for update;
  if coalesce(cur_gold, 0) < cost then raise exception 'OS insuffisants (% requis).', cost; end if;
  update public.profiles set gold = gold - cost, updated_at = now() where id = caller;
  update public.imperium_units
  set count = count + recruiting_count, recruiting_count = 0, recruiting_finishes_at = null
  where village_id = p_village_id and unit_kind = p_unit_kind;
  return jsonb_build_object('ok', true, 'os_spent', cost);
end;
$$;

-- 2ème village (1M OS).
create or replace function public.imperium_buy_secondary_village(p_x int, p_y int, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cost int := 1000000;
  cur_gold bigint;
  village_count int;
  hall_lvl int := 0;
  new_id uuid;
  faction text;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select count(*) into village_count from public.imperium_villages where user_id = caller;
  if village_count >= 3 then raise exception 'Limite 3 villages atteinte.'; end if;

  -- Vérifier hôtel principal niveau 15
  select coalesce(b.level, 0), v.faction into hall_lvl, faction
  from public.imperium_villages v
  left join public.imperium_buildings b on b.village_id = v.id and b.kind = 'town_hall'
  where v.user_id = caller and v.is_secondary = false
  limit 1;
  if hall_lvl < 15 then raise exception 'Hôtel principal niveau 15 requis.'; end if;

  if exists (select 1 from public.imperium_villages where x = p_x and y = p_y) then
    raise exception 'Case occupée.';
  end if;
  if exists (select 1 from public.imperium_map where x = p_x and y = p_y and kind <> 'empty') then
    raise exception 'Case non disponible.';
  end if;

  select gold into cur_gold from public.profiles where id = caller for update;
  if coalesce(cur_gold, 0) < cost then raise exception 'OS insuffisants (% requis).', cost; end if;

  update public.profiles set gold = gold - cost, updated_at = now() where id = caller;

  insert into public.imperium_villages (user_id, name, faction, x, y, is_secondary, shield_until)
  values (caller, p_name, faction, p_x, p_y, true, now() + interval '24 hours')
  returning id into new_id;
  insert into public.imperium_buildings (village_id, slot, kind, level) values
    (new_id, 5, 'town_hall', 1),
    (new_id, -1, 'wood_field', 0), (new_id, -2, 'clay_field', 0),
    (new_id, -3, 'iron_field', 0), (new_id, -4, 'wheat_field', 0);
  insert into public.imperium_map (x, y, kind, village_id)
  values (p_x, p_y, 'player_village', new_id)
  on conflict (x, y) do update set kind = 'player_village', village_id = new_id;
  return new_id;
end;
$$;

-- Changement de faction (100k OS).
create or replace function public.imperium_change_faction(p_new_faction text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cost int := 100000;
  cur_gold bigint;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if p_new_faction not in ('legion','horde','ordre') then raise exception 'Faction invalide.'; end if;
  select gold into cur_gold from public.profiles where id = caller for update;
  if coalesce(cur_gold, 0) < cost then raise exception 'OS insuffisants (% requis).', cost; end if;
  update public.profiles set gold = gold - cost, updated_at = now() where id = caller;
  update public.imperium_villages set faction = p_new_faction where user_id = caller;
  -- Reset units (conversion 1:1 abstraite : on garde les counts par catégorie mais pas par kind)
  -- Implémentation simplifiée : on supprime les unités, le joueur les recrute à nouveau dans la nouvelle faction
  delete from public.imperium_units where village_id in (select id from public.imperium_villages where user_id = caller);
  return jsonb_build_object('ok', true, 'new_faction', p_new_faction);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 14. ALLIANCES
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_create_alliance(p_name text, p_tag text, p_color text default '#888888')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  new_id uuid;
  embassy_lvl int := 0;
  main_v record;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if exists (select 1 from public.imperium_alliance_members where user_id = caller) then
    raise exception 'Tu es déjà dans une alliance.';
  end if;

  -- Vérifier ambassade niveau 3
  select coalesce(max(b.level), 0) into embassy_lvl
  from public.imperium_villages v
  join public.imperium_buildings b on b.village_id = v.id and b.kind = 'embassy'
  where v.user_id = caller;
  if embassy_lvl < 3 then raise exception 'Ambassade niveau 3 requise.'; end if;

  -- Trouver le village principal et tick avant débit
  select * into main_v from public.imperium_villages where user_id = caller and is_secondary = false limit 1;
  if main_v.id is null then raise exception 'Pas de village principal.'; end if;
  perform public.imperium_tick(main_v.id);
  select * into main_v from public.imperium_villages where id = main_v.id for update;

  if main_v.wood < 5000 or main_v.clay < 5000 or main_v.iron < 5000 or main_v.wheat < 2000 then
    raise exception 'Ressources insuffisantes (5000/5000/5000/2000).';
  end if;
  update public.imperium_villages
  set wood = wood - 5000, clay = clay - 5000, iron = iron - 5000, wheat = wheat - 2000
  where id = main_v.id;

  insert into public.imperium_alliances (name, tag, color, chief_id)
  values (p_name, upper(p_tag), p_color, caller)
  returning id into new_id;
  insert into public.imperium_alliance_members (alliance_id, user_id, role)
  values (new_id, caller, 'chief');
  return new_id;
end;
$$;

create or replace function public.imperium_join_alliance(p_alliance_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cap int;
  current_count int;
  embassy_lvl int := 0;
  chief_embassy_lvl int := 0;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if exists (select 1 from public.imperium_alliance_members where user_id = caller) then
    raise exception 'Déjà dans une alliance.';
  end if;

  -- Capacité = 9 + 3 × embassy chef
  select coalesce(max(b.level), 0) into chief_embassy_lvl
  from public.imperium_alliances a
  join public.imperium_villages v on v.user_id = a.chief_id
  join public.imperium_buildings b on b.village_id = v.id and b.kind = 'embassy'
  where a.id = p_alliance_id;
  cap := 9 + 3 * chief_embassy_lvl;
  select count(*) into current_count from public.imperium_alliance_members where alliance_id = p_alliance_id;
  if current_count >= cap then raise exception 'Alliance pleine.'; end if;

  insert into public.imperium_alliance_members (alliance_id, user_id, role)
  values (p_alliance_id, caller, 'member');
  return true;
end;
$$;

create or replace function public.imperium_leave_alliance()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  m record;
begin
  if caller is null then return false; end if;
  select * into m from public.imperium_alliance_members where user_id = caller;
  if m is null then return false; end if;
  if m.role = 'chief' then
    -- Le chef ne peut partir qu'en dissolvant ou en transférant
    raise exception 'Le chef ne peut pas quitter (transférer ou dissoudre).';
  end if;
  delete from public.imperium_alliance_members where user_id = caller;
  return true;
end;
$$;

-- Soutien militaire (envoyer troupes en défense).
create or replace function public.imperium_send_support(p_from uuid, p_to_village_id uuid, p_units jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  v record;
  target record;
  k text; cnt int;
  support_id uuid;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  perform public.imperium_tick(p_from);
  select * into v from public.imperium_villages where id = p_from for update;
  if v.user_id <> caller then raise exception 'Pas ton village.'; end if;
  select * into target from public.imperium_villages where id = p_to_village_id;
  if target.id is null then raise exception 'Cible introuvable.'; end if;

  -- Doit être propre village ou allié
  if target.user_id <> caller then
    if not exists (
      select 1 from public.imperium_alliance_members am1
      join public.imperium_alliance_members am2 on am1.alliance_id = am2.alliance_id
      where am1.user_id = caller and am2.user_id = target.user_id
    ) then
      raise exception 'Soutien réservé à ton alliance.';
    end if;
  end if;

  for k, cnt in select * from jsonb_each_text(p_units) loop
    if cnt::int <= 0 then continue; end if;
    if not exists (select 1 from public.imperium_units where village_id = p_from and unit_kind = k and count >= cnt::int) then
      raise exception 'Troupes insuffisantes : %', k;
    end if;
    update public.imperium_units set count = count - cnt::int where village_id = p_from and unit_kind = k;
  end loop;

  insert into public.imperium_supports (from_village_id, host_village_id, units)
  values (p_from, p_to_village_id, p_units)
  returning id into support_id;
  return support_id;
end;
$$;

-- Rappel de soutien.
create or replace function public.imperium_recall_support(p_support_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  s record;
  v record;
  k text; cnt int;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select * into s from public.imperium_supports where id = p_support_id for update;
  select * into v from public.imperium_villages where id = s.from_village_id;
  if v.user_id <> caller then raise exception 'Pas ton soutien.'; end if;

  for k, cnt in select * from jsonb_each_text(s.units) loop
    if cnt::int > 0 then
      insert into public.imperium_units (village_id, unit_kind, count)
      values (s.from_village_id, k, cnt::int)
      on conflict (village_id, unit_kind) do update set count = public.imperium_units.count + cnt::int;
    end if;
  end loop;
  update public.imperium_supports set recalled_at = now() where id = p_support_id;
  return true;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 15. MARCHÉ DE RESSOURCES
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_market_post_order(
  p_village_id uuid,
  p_give_kind text, p_give_amount int,
  p_take_kind text, p_take_amount int,
  p_duration_hours int default 24
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  v record;
  order_id uuid;
  market_lvl int := 0;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if p_give_kind not in ('wood','clay','iron','wheat') then raise exception 'Type donnant invalide.'; end if;
  if p_take_kind not in ('wood','clay','iron','wheat') then raise exception 'Type recevant invalide.'; end if;
  if p_give_amount <= 0 or p_take_amount <= 0 then raise exception 'Quantités invalides.'; end if;
  perform public.imperium_tick(p_village_id);
  select * into v from public.imperium_villages where id = p_village_id for update;
  if v.user_id <> caller then raise exception 'Pas ton village.'; end if;
  select coalesce(level, 0) into market_lvl from public.imperium_buildings where village_id = p_village_id and kind = 'market';
  if market_lvl < 1 then raise exception 'Marché requis.'; end if;

  -- Bloquer ressources données
  if p_give_kind = 'wood'  and v.wood  < p_give_amount then raise exception 'Bois insuffisant.'; end if;
  if p_give_kind = 'clay'  and v.clay  < p_give_amount then raise exception 'Argile insuffisante.'; end if;
  if p_give_kind = 'iron'  and v.iron  < p_give_amount then raise exception 'Fer insuffisant.'; end if;
  if p_give_kind = 'wheat' and v.wheat < p_give_amount then raise exception 'Blé insuffisant.'; end if;

  update public.imperium_villages set
    wood  = case when p_give_kind = 'wood'  then wood  - p_give_amount else wood  end,
    clay  = case when p_give_kind = 'clay'  then clay  - p_give_amount else clay  end,
    iron  = case when p_give_kind = 'iron'  then iron  - p_give_amount else iron  end,
    wheat = case when p_give_kind = 'wheat' then wheat - p_give_amount else wheat end
  where id = p_village_id;

  insert into public.imperium_market_orders (seller_village_id, give_kind, give_amount, take_kind, take_amount, expires_at)
  values (p_village_id, p_give_kind, p_give_amount, p_take_kind, p_take_amount, now() + (p_duration_hours * interval '1 hour'))
  returning id into order_id;
  return order_id;
end;
$$;

create or replace function public.imperium_market_fulfill_order(p_order_id uuid, p_buyer_village_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  o record;
  buyer record;
  seller record;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  perform public.imperium_tick(p_buyer_village_id);
  select * into buyer from public.imperium_villages where id = p_buyer_village_id for update;
  if buyer.user_id <> caller then raise exception 'Pas ton village.'; end if;
  select * into o from public.imperium_market_orders where id = p_order_id for update;
  if o.id is null or o.state <> 'open' then raise exception 'Ordre indisponible.'; end if;
  select * into seller from public.imperium_villages where id = o.seller_village_id for update;
  if seller.id = buyer.id then raise exception 'Pas le tien.'; end if;

  -- Vérifier acheteur a les ressources
  if o.take_kind = 'wood'  and buyer.wood  < o.take_amount then raise exception 'Bois insuffisant.'; end if;
  if o.take_kind = 'clay'  and buyer.clay  < o.take_amount then raise exception 'Argile insuffisante.'; end if;
  if o.take_kind = 'iron'  and buyer.iron  < o.take_amount then raise exception 'Fer insuffisant.'; end if;
  if o.take_kind = 'wheat' and buyer.wheat < o.take_amount then raise exception 'Blé insuffisant.'; end if;

  -- Échange
  update public.imperium_villages set
    wood  = wood  + case when o.give_kind = 'wood'  then o.give_amount else 0 end - case when o.take_kind = 'wood'  then o.take_amount else 0 end,
    clay  = clay  + case when o.give_kind = 'clay'  then o.give_amount else 0 end - case when o.take_kind = 'clay'  then o.take_amount else 0 end,
    iron  = iron  + case when o.give_kind = 'iron'  then o.give_amount else 0 end - case when o.take_kind = 'iron'  then o.take_amount else 0 end,
    wheat = wheat + case when o.give_kind = 'wheat' then o.give_amount else 0 end - case when o.take_kind = 'wheat' then o.take_amount else 0 end
  where id = buyer.id;

  update public.imperium_villages set
    wood  = wood  + case when o.take_kind = 'wood'  then o.take_amount else 0 end,
    clay  = clay  + case when o.take_kind = 'clay'  then o.take_amount else 0 end,
    iron  = iron  + case when o.take_kind = 'iron'  then o.take_amount else 0 end,
    wheat = wheat + case when o.take_kind = 'wheat' then o.take_amount else 0 end
  where id = seller.id;

  update public.imperium_market_orders set state = 'fulfilled' where id = p_order_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 16. QUÊTES & SUCCÈS
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_quest_progress(p_quest_id text, p_amount int)
returns void language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return; end if;
  update public.imperium_quests
  set progress = progress + p_amount
  where user_id = caller and quest_id = p_quest_id and expires_at > now() and not claimed;
end;
$$;

create or replace function public.imperium_quest_claim(p_quest_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  q record;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select * into q from public.imperium_quests
  where user_id = caller and quest_id = p_quest_id and expires_at > now() and not claimed
  for update;
  if q.id is null then raise exception 'Quête introuvable ou déjà claim.'; end if;
  if q.progress < q.target then raise exception 'Quête non terminée.'; end if;
  update public.imperium_quests set claimed = true where id = q.id;
  update public.profiles set gold = gold + 30, updated_at = now() where id = caller;
  return jsonb_build_object('ok', true, 'os_gained', 30);
end;
$$;

-- Récompenses de succès one-shot (table de référence).
create or replace function public.imperium_achievement_reward(p_achievement_id text)
returns int language sql immutable as $$
  select case p_achievement_id
    when 'ach_first_village'   then 0
    when 'ach_first_raid'      then 100
    when 'ach_first_blood'     then 100
    when 'ach_first_barbarian' then 100
    when 'ach_butcher'         then 300
    when 'ach_massacre'        then 1000
    when 'ach_hall_5'          then 200
    when 'ach_hall_10'         then 500
    when 'ach_hall_15'         then 1000
    when 'ach_hall_20'         then 1500
    when 'ach_hall_25'         then 1500
    when 'ach_oasis_first'     then 300
    when 'ach_oasis_triple'    then 1000
    when 'ach_alliance_join'   then 100
    when 'ach_alliance_chief'  then 300
    when 'ach_war_first'       then 200
    when 'ach_nap_first'       then 100
    when 'ach_loot_100k'       then 300
    when 'ach_loot_1m'         then 1500
    when 'ach_conquest_first'  then 1000
    when 'ach_center_complete' then 500
    when 'ach_forge_max'       then 300
    when 'ach_elite_100'       then 500
    when 'ach_top10_atk'       then 200
    when 'ach_top10_def'       then 200
    when 'ach_top10_eco'       then 200
    when 'ach_crown_weekly'    then 1000
    when 'ach_power_100k'      then 500
    when 'ach_power_500k'      then 1000
    when 'ach_first_builder'   then 50000
    else 0
  end;
$$;

create or replace function public.imperium_achievement_claim(p_achievement_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  a record;
  reward int;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select * into a from public.imperium_achievements
  where user_id = caller and achievement_id = p_achievement_id and not os_claimed
  for update;
  if a.user_id is null then raise exception 'Succès non débloqué ou déjà claim.'; end if;
  reward := public.imperium_achievement_reward(p_achievement_id);
  if reward > 0 then
    update public.profiles set gold = gold + reward, updated_at = now() where id = caller;
  end if;
  update public.imperium_achievements set os_claimed = true
  where user_id = caller and achievement_id = p_achievement_id;
  return jsonb_build_object('ok', true, 'os_gained', reward);
end;
$$;

-- Distribue les récompenses du classement hebdo (cron dimanche soir).
create or replace function public.imperium_finalize_weekly_leaderboard()
returns int language plpgsql security definer set search_path = public as $$
declare
  rec record;
  reward int;
  rank int;
  total int := 0;
  cat text;
  current_week date;
begin
  current_week := date_trunc('week', now())::date - interval '7 days';
  for cat in select unnest(array['attack','defense','economy']) loop
    rank := 1;
    for rec in select user_id, score from public.imperium_leaderboard_weekly
               where week_start = current_week and category = cat
               order by score desc limit 10 loop
      reward := case rank
        when 1 then 2000 when 2 then 1500 when 3 then 1000 when 4 then 700
        when 5 then 500  when 6 then 400  when 7 then 300  when 8 then 200
        when 9 then 150  when 10 then 100 else 0
      end;
      if reward > 0 then
        update public.profiles set gold = gold + reward, updated_at = now() where id = rec.user_id;
        total := total + reward;
      end if;
      rank := rank + 1;
    end loop;
  end loop;
  return total;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 17. SAISONS — initialisation
-- ══════════════════════════════════════════════════════════════════════

insert into public.imperium_seasons (name, started_at)
select 'season-1', now()
where not exists (select 1 from public.imperium_seasons);

-- ══════════════════════════════════════════════════════════════════════
-- 18. SEED CARTE — merveilles de la saison 1
-- ══════════════════════════════════════════════════════════════════════

do $$
declare
  wonders text[] := array[
    'Colosse de la Couronne', 'Phare des Alliances', 'Forteresse Suprême', 'Palais des Échanges',
    'Sanctuaire de l''Eternum', 'Bibliothèque Impériale', 'Arène des Légendes', 'Temple du Premier Empereur'
  ];
  coords int[][] := array[ array[-2,-2], array[-1,-2], array[1,-2], array[2,-2],
                           array[-2,2], array[-1,2], array[1,2], array[2,2] ];
  i int;
begin
  for i in 1..8 loop
    insert into public.imperium_map (x, y, kind, data)
    values (
      coords[i][1], coords[i][2], 'wonder',
      jsonb_build_object(
        'name', wonders[i],
        'level', 0,
        'garrison', jsonb_build_object('legionnaire', 500, 'pretorien', 200, 'equite_legati', 100)
      )
    )
    on conflict (x, y) do nothing;
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- 19. NOTES D'INTÉGRATION
-- ══════════════════════════════════════════════════════════════════════
--
-- Pattern lazy : à chaque action utilisateur (page-load village, envoi marche,
-- recrutement…), appeler `imperium_tick(village_id)` AVANT toute lecture du
-- stock de ressources / unités.
--
-- Cron Supabase : programmer `imperium_resolve_marches()` toutes les 5 minutes
-- pour résoudre les marches même quand tous les acteurs sont offline.
-- Programmer `imperium_finalize_weekly_leaderboard()` chaque dimanche à 23h.
--
-- Génération NPC (fermes barbares + oasis) : à exécuter une fois manuellement
-- ou via une fonction `imperium_generate_npcs()` à coder en P3 pour spawn
-- les ~1500 cases NPC sur la grille 100×100.
--
-- Sécurité : les coûts/stats/courbes sont hardcodés dans des fonctions
-- `immutable` côté serveur. Le client ne peut pas tricher en envoyant des
-- coûts modifiés. Il valide juste les structures jsonb d'entrée.
