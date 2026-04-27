-- SKYLINE — schéma SQL complet (P1 → P12).
-- Tycoon multijoueur du Site Suprême. Gestion d'entreprise massivement multijoueur.
-- Run this in Supabase SQL Editor (idempotent).
--
-- Couvre :
--   - Profil joueur Skyline (cash $, score crédit, conversion OS/$ tracking)
--   - Entreprises (commerces, usines, matières premières, services)
--   - Locaux (loués/achetés), aménagement 2D
--   - Présentoirs / équipement
--   - Stocks, transactions (compta journalière)
--   - Marché de gros PNJ (achat à prix de référence)
--   - Pont $/OS : virement bancaire, société écran, inverse
--   - Système de prêts bancaires (apport, score crédit, mensualités)
--   - Marché de l'emploi (PNJ candidats, embauches, démissions)
--   - Marché commun (cours produits offre/demande, bourse étendue)
--   - Bourse actions (IPO, market/limit, dividendes, OPA)
--   - PNJ corporate + fil d'actu
--   - Événements (pénuries, tendances, scandales, saisons)
--   - Machines (transformation usines), R&D, brevets pharma
--   - Holdings, vente d'entreprise inter-joueurs
--   - Transport / acheminement (contrats logistiques)
--   - Audits fiscaux + amendes
--
-- Conventions :
--   - Tables : public.skyline_*
--   - Cash : numeric (15,2) pour précision financière
--   - Erreurs : raise exception '...' en français
--   - Auth : auth.uid() pour identifier l'appelant, security definer pour les RPCs
--   - Lazy : tick recalculé à chaque action utilisateur (skyline_tick_company)
--   - Anti-triche : prix de référence et taux dans des fonctions immutable

-- ══════════════════════════════════════════════════════════════════════
-- 1. CONFIG IMMUTABLE
-- ══════════════════════════════════════════════════════════════════════

-- Loyer mensuel d'un local : rentPerSqm × m².
create or replace function public.skyline_district_rent(p_district text)
returns numeric language sql immutable as $$
  select case p_district
    when 'centre'      then 50
    when 'affaires'    then 40
    when 'residentiel' then 25
    when 'peripherie'  then 10
    when 'populaire'   then 8
    else null
  end;
$$;

create or replace function public.skyline_local_sqm(p_size text)
returns int language sql immutable as $$
  select case p_size
    when 'xs' then 50
    when 's'  then 80
    when 'm'  then 140
    when 'l'  then 250
    when 'xl' then 480
    else null
  end;
$$;

create or replace function public.skyline_local_rent_monthly(p_district text, p_size text)
returns numeric language sql immutable as $$
  select public.skyline_district_rent(p_district) * public.skyline_local_sqm(p_size);
$$;

create or replace function public.skyline_local_purchase_cost(p_district text, p_size text)
returns numeric language sql immutable as $$
  select public.skyline_local_rent_monthly(p_district, p_size) * 100;
$$;

-- Prix de référence (gros) d'un produit.
create or replace function public.skyline_product_ref_buy(p_product_id text)
returns numeric language sql immutable as $$
  select case p_product_id
    when 'baguette' then 0.4
    when 'croissant' then 0.6
    when 'pain_au_chocolat' then 0.7
    when 'tarte_pommes' then 4
    when 'vin_rouge' then 5
    when 'vin_blanc' then 5
    when 'biere_blonde' then 1.2
    when 'champagne' then 25
    when 'steak' then 6
    when 'saucisson' then 5
    when 'jambon' then 8
    when 'rotisserie_poulet' then 6
    when 'pizza_margherita' then 3
    when 'pizza_4_fromages' then 4
    when 'tiramisu' then 2
    when 'burger_classique' then 2
    when 'frites' then 0.5
    when 'nuggets' then 1.5
    when 'cafe_expresso' then 0.3
    when 'cappuccino' then 0.5
    when 'biere_pression' then 0.8
    when 'soda' then 0.6
    when 'bouquet_roses' then 8
    when 'bouquet_mixte' then 6
    when 'plante_verte' then 10
    when 'orchidee' then 12
    when 'chocolat_noir' then 3
    when 'huile_olive' then 6
    when 'miel' then 5
    when 'confiture' then 3
    when 'pates' then 0.8
    when 'yaourt' then 1.5
    when 'lait' then 0.8
    when 'biscuits' then 1.5
    when 'tshirt_basic' then 5
    when 'jean' then 20
    when 'pull' then 15
    when 'robe' then 25
    when 'bague_argent' then 80
    when 'collier_or' then 400
    when 'montre_classique' then 200
    when 'bracelet' then 60
    when 'paracetamol' then 1
    when 'creme_hydratante' then 6
    when 'vitamines' then 8
    when 'shampoing' then 3
    when 'parfum_femme' then 30
    when 'parfum_homme' then 30
    when 'creme_visage' then 15
    when 'rouge_levres' then 8
    when 'canape' then 300
    when 'table_basse' then 80
    when 'lit_double' then 200
    when 'etagere' then 50
    when 'smartphone' then 250
    when 'tv_4k' then 400
    when 'casque_audio' then 50
    when 'tablette' then 200
    when 'perceuse' then 40
    when 'peinture_blanche' then 18
    when 'marteau' then 8
    when 'vis_lot' then 4
    when 'menu_decouverte' then 18
    when 'plat_jour' then 6
    when 'cave_signature' then 30
    when 'dessert_signature' then 4
    when 'citadine' then 9000
    when 'berline' then 18000
    when 'suv' then 22000
    when 'sportive' then 35000
    when 'carburant_essence' then 1.2
    when 'carburant_diesel' then 1.1
    when 'snack' then 1
    when 'boisson_chaude' then 0.4
    when 'nuitee_simple' then 25
    when 'nuitee_double' then 40
    when 'petit_dejeuner' then 4
    when 'spa' then 8
    when 'croquettes_chien' then 18
    when 'croquettes_chat' then 15
    when 'litiere' then 5
    when 'jouet_animal' then 4
    else null
  end;
$$;

-- Prix de vente recommandé (= prix de référence × marge cible secteur).
create or replace function public.skyline_product_ref_sell(p_product_id text)
returns numeric language sql immutable as $$
  select case p_product_id
    when 'baguette' then 1.2
    when 'croissant' then 1.5
    when 'pain_au_chocolat' then 1.7
    when 'tarte_pommes' then 12
    when 'vin_rouge' then 14
    when 'vin_blanc' then 14
    when 'biere_blonde' then 3.5
    when 'champagne' then 70
    when 'steak' then 15
    when 'saucisson' then 14
    when 'jambon' then 20
    when 'rotisserie_poulet' then 14
    when 'pizza_margherita' then 10
    when 'pizza_4_fromages' then 13
    when 'tiramisu' then 6
    when 'burger_classique' then 8
    when 'frites' then 3
    when 'nuggets' then 5
    when 'cafe_expresso' then 1.8
    when 'cappuccino' then 3.5
    when 'biere_pression' then 4.5
    when 'soda' then 2.5
    when 'bouquet_roses' then 25
    when 'bouquet_mixte' then 18
    when 'plante_verte' then 30
    when 'orchidee' then 35
    when 'chocolat_noir' then 9
    when 'huile_olive' then 18
    when 'miel' then 15
    when 'confiture' then 8
    when 'pates' then 2.5
    when 'yaourt' then 4
    when 'lait' then 2.2
    when 'biscuits' then 4
    when 'tshirt_basic' then 18
    when 'jean' then 60
    when 'pull' then 45
    when 'robe' then 75
    when 'bague_argent' then 240
    when 'collier_or' then 1200
    when 'montre_classique' then 600
    when 'bracelet' then 180
    when 'paracetamol' then 3.5
    when 'creme_hydratante' then 18
    when 'vitamines' then 22
    when 'shampoing' then 9
    when 'parfum_femme' then 95
    when 'parfum_homme' then 95
    when 'creme_visage' then 45
    when 'rouge_levres' then 25
    when 'canape' then 900
    when 'table_basse' then 240
    when 'lit_double' then 600
    when 'etagere' then 150
    when 'smartphone' then 750
    when 'tv_4k' then 1200
    when 'casque_audio' then 150
    when 'tablette' then 600
    when 'perceuse' then 120
    when 'peinture_blanche' then 55
    when 'marteau' then 25
    when 'vis_lot' then 12
    when 'menu_decouverte' then 75
    when 'plat_jour' then 25
    when 'cave_signature' then 100
    when 'dessert_signature' then 18
    when 'citadine' then 18000
    when 'berline' then 36000
    when 'suv' then 45000
    when 'sportive' then 75000
    when 'carburant_essence' then 1.8
    when 'carburant_diesel' then 1.7
    when 'snack' then 3
    when 'boisson_chaude' then 2
    when 'nuitee_simple' then 80
    when 'nuitee_double' then 130
    when 'petit_dejeuner' then 15
    when 'spa' then 35
    when 'croquettes_chien' then 45
    when 'croquettes_chat' then 38
    when 'litiere' then 15
    when 'jouet_animal' then 12
    else null
  end;
$$;

-- Coût d'un présentoir / équipement.
create or replace function public.skyline_furniture_cost(p_kind text)
returns numeric language sql immutable as $$
  select case p_kind
    when 'shelf_basic'      then 600
    when 'shelf_wood'       then 800
    when 'vitrine_glass'    then 1500
    when 'vitrine_fridge'   then 4000
    when 'counter_basic'    then 1200
    when 'counter_premium'  then 2500
    when 'register_basic'   then 1500
    when 'register_pro'     then 4000
    when 'table_chairs'     then 500
    when 'fridge_drinks'    then 1200
    else null
  end;
$$;

create or replace function public.skyline_furniture_capacity(p_kind text)
returns int language sql immutable as $$
  select case p_kind
    when 'shelf_basic'      then 30
    when 'shelf_wood'       then 50
    when 'vitrine_glass'    then 80
    when 'vitrine_fridge'   then 60
    when 'counter_basic'    then 20
    when 'counter_premium'  then 30
    when 'register_basic'   then 0
    when 'register_pro'     then 0
    when 'table_chairs'     then 0
    when 'fridge_drinks'    then 100
    else null
  end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 2. TABLES P1 — FOUNDATION (joueur, entreprise, stock, transactions)
-- ══════════════════════════════════════════════════════════════════════

-- Profil Skyline du joueur (cash $, score crédit, état faillite, caps quotidiens).
create table if not exists public.skyline_profiles (
  user_id                       uuid primary key references auth.users(id) on delete cascade,
  cash                          numeric(15, 2) not null default 10000,
  credit_score                  int not null default 0 check (credit_score between 0 and 1000),
  net_worth                     numeric(18, 2) not null default 10000,
  bankruptcy_pending            boolean not null default false,
  bankruptcy_started_at         timestamptz,
  os_to_dollars_today           int not null default 0,
  shell_dollars_this_week       numeric(15, 2) not null default 0,
  last_dollar_to_os_audit_at    timestamptz,
  last_daily_reset_at           timestamptz not null default now(),
  last_weekly_reset_at          timestamptz not null default now(),
  current_skill_training        text,
  skill_training_ends_at        timestamptz,
  player_skills                 jsonb not null default '{}'::jsonb,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

alter table public.skyline_profiles enable row level security;

drop policy if exists "skyline_profiles_read_own" on public.skyline_profiles;
create policy "skyline_profiles_read_own"
  on public.skyline_profiles
  for select
  using (auth.uid() = user_id OR (select is_admin from public.profiles where id = auth.uid()));

drop policy if exists "skyline_profiles_insert_own" on public.skyline_profiles;
create policy "skyline_profiles_insert_own"
  on public.skyline_profiles
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "skyline_profiles_update_own" on public.skyline_profiles;
create policy "skyline_profiles_update_own"
  on public.skyline_profiles
  for update
  using (auth.uid() = user_id);

-- Une entreprise du joueur.
create table if not exists public.skyline_companies (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  category            text not null check (category in ('commerce', 'factory', 'raw', 'service')),
  sector              text not null,
  name                text not null check (length(name) between 1 and 50),
  district            text not null check (district in ('centre', 'affaires', 'residentiel', 'peripherie', 'populaire')),
  local_size          text not null check (local_size in ('xs', 's', 'm', 'l', 'xl')),
  is_owned            boolean not null default false,
  cleanliness         int not null default 100 check (cleanliness between 0 and 100),
  hygiene_grade       text check (hygiene_grade in ('A', 'B', 'C')),
  cash                numeric(15, 2) not null default 0,
  monthly_revenue     numeric(15, 2) not null default 0,
  monthly_expenses    numeric(15, 2) not null default 0,
  is_open             boolean not null default true,
  open_hour           int not null default 8 check (open_hour between 0 and 23),
  close_hour          int not null default 20 check (close_hour between 0 and 23),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  last_tick_at        timestamptz not null default now(),
  unique (user_id, sector)
);

alter table public.skyline_companies enable row level security;

drop policy if exists "skyline_companies_read_own" on public.skyline_companies;
create policy "skyline_companies_read_own"
  on public.skyline_companies
  for select
  using (auth.uid() = user_id OR (select is_admin from public.profiles where id = auth.uid()));

drop policy if exists "skyline_companies_insert_own" on public.skyline_companies;
create policy "skyline_companies_insert_own"
  on public.skyline_companies
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "skyline_companies_update_own" on public.skyline_companies;
create policy "skyline_companies_update_own"
  on public.skyline_companies
  for update
  using (auth.uid() = user_id);

drop policy if exists "skyline_companies_delete_own" on public.skyline_companies;
create policy "skyline_companies_delete_own"
  on public.skyline_companies
  for delete
  using (auth.uid() = user_id);

create index if not exists skyline_companies_user_idx on public.skyline_companies(user_id);

-- Présentoirs / équipement placés dans l'entreprise (placement abstrait P1, 2D P3).
create table if not exists public.skyline_furniture (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.skyline_companies(id) on delete cascade,
  kind        text not null,
  grid_x      int not null default 0,
  grid_y      int not null default 0,
  rotation    int not null default 0 check (rotation in (0, 90, 180, 270)),
  created_at  timestamptz not null default now()
);

alter table public.skyline_furniture enable row level security;

drop policy if exists "skyline_furniture_read_own" on public.skyline_furniture;
create policy "skyline_furniture_read_own"
  on public.skyline_furniture
  for select
  using (
    exists (
      select 1 from public.skyline_companies c
      where c.id = company_id and c.user_id = auth.uid()
    ) OR (select is_admin from public.profiles where id = auth.uid())
  );

drop policy if exists "skyline_furniture_write_own" on public.skyline_furniture;
create policy "skyline_furniture_write_own"
  on public.skyline_furniture
  for all
  using (
    exists (
      select 1 from public.skyline_companies c
      where c.id = company_id and c.user_id = auth.uid()
    )
  );

create index if not exists skyline_furniture_company_idx on public.skyline_furniture(company_id);

-- Stock de produits.
create table if not exists public.skyline_inventory (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.skyline_companies(id) on delete cascade,
  product_id      text not null,
  quantity        int not null default 0 check (quantity >= 0),
  avg_buy_price   numeric(12, 2) not null default 0,
  sell_price      numeric(12, 2) not null default 0,
  purchased_at    timestamptz not null default now(),
  unique (company_id, product_id)
);

alter table public.skyline_inventory enable row level security;

drop policy if exists "skyline_inventory_read_own" on public.skyline_inventory;
create policy "skyline_inventory_read_own"
  on public.skyline_inventory
  for select
  using (
    exists (
      select 1 from public.skyline_companies c
      where c.id = company_id and c.user_id = auth.uid()
    ) OR (select is_admin from public.profiles where id = auth.uid())
  );

drop policy if exists "skyline_inventory_write_own" on public.skyline_inventory;
create policy "skyline_inventory_write_own"
  on public.skyline_inventory
  for all
  using (
    exists (
      select 1 from public.skyline_companies c
      where c.id = company_id and c.user_id = auth.uid()
    )
  );

create index if not exists skyline_inventory_company_idx on public.skyline_inventory(company_id);

-- Compta : transactions (ventes, achats, loyers, salaires, impôts...).
create table if not exists public.skyline_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  company_id  uuid references public.skyline_companies(id) on delete set null,
  kind        text not null,
  amount      numeric(15, 2) not null,
  description text not null,
  created_at  timestamptz not null default now()
);

alter table public.skyline_transactions enable row level security;

drop policy if exists "skyline_transactions_read_own" on public.skyline_transactions;
create policy "skyline_transactions_read_own"
  on public.skyline_transactions
  for select
  using (auth.uid() = user_id OR (select is_admin from public.profiles where id = auth.uid()));

drop policy if exists "skyline_transactions_insert_own" on public.skyline_transactions;
create policy "skyline_transactions_insert_own"
  on public.skyline_transactions
  for insert
  with check (auth.uid() = user_id);

create index if not exists skyline_transactions_user_idx
  on public.skyline_transactions(user_id, created_at desc);
create index if not exists skyline_transactions_company_idx
  on public.skyline_transactions(company_id, created_at desc);

-- Log des conversions $/OS pour tracker audits, caps, historique.
create table if not exists public.skyline_offshore_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  method        text not null check (method in ('wire', 'shell', 'os_to_dollars')),
  dollars_in    numeric(15, 2) not null default 0,
  os_in         int not null default 0,
  dollars_out   numeric(15, 2) not null default 0,
  os_out        int not null default 0,
  tax_amount    numeric(15, 2) not null default 0,
  was_audited   boolean not null default false,
  fine_amount   numeric(15, 2) not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.skyline_offshore_log enable row level security;

drop policy if exists "skyline_offshore_read_own" on public.skyline_offshore_log;
create policy "skyline_offshore_read_own"
  on public.skyline_offshore_log
  for select
  using (auth.uid() = user_id OR (select is_admin from public.profiles where id = auth.uid()));

drop policy if exists "skyline_offshore_insert_own" on public.skyline_offshore_log;
create policy "skyline_offshore_insert_own"
  on public.skyline_offshore_log
  for insert
  with check (auth.uid() = user_id);

create index if not exists skyline_offshore_user_idx
  on public.skyline_offshore_log(user_id, created_at desc);

-- ══════════════════════════════════════════════════════════════════════
-- 3. TABLES P2 — EMPLOYÉS (marché de l'emploi)
-- ══════════════════════════════════════════════════════════════════════

-- Marché de l'emploi : pool de candidats (PNJ ou joueurs au chômage).
create table if not exists public.skyline_employees (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete cascade, -- null = PNJ
  company_id        uuid references public.skyline_companies(id) on delete set null,
  full_name         text not null,
  avatar_seed       text not null default '',
  is_npc            boolean not null default true,
  skills            jsonb not null default '{}'::jsonb,
  salary_demanded   numeric(12, 2) not null default 1500,
  salary_paid       numeric(12, 2) not null default 0,
  morale            int not null default 100 check (morale between 0 and 100),
  hired_at          timestamptz,
  available_until   timestamptz,
  in_training       boolean not null default false,
  training_skill    text,
  training_ends_at  timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.skyline_employees enable row level security;

-- Lecture : marché de l'emploi visible à tous, sauf si déjà embauché ailleurs.
drop policy if exists "skyline_employees_read_market" on public.skyline_employees;
create policy "skyline_employees_read_market"
  on public.skyline_employees
  for select
  using (
    company_id is null OR
    exists (
      select 1 from public.skyline_companies c
      where c.id = company_id and c.user_id = auth.uid()
    ) OR (select is_admin from public.profiles where id = auth.uid())
  );

drop policy if exists "skyline_employees_write_owner" on public.skyline_employees;
create policy "skyline_employees_write_owner"
  on public.skyline_employees
  for all
  using (
    company_id is null OR
    exists (
      select 1 from public.skyline_companies c
      where c.id = company_id and c.user_id = auth.uid()
    )
  );

create index if not exists skyline_employees_company_idx on public.skyline_employees(company_id);
create index if not exists skyline_employees_market_idx on public.skyline_employees(company_id) where company_id is null;

-- ══════════════════════════════════════════════════════════════════════
-- 4. TABLES P4 — BANQUE (prêts, score crédit déjà sur profile, audits)
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.skyline_loans (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  company_id        uuid references public.skyline_companies(id) on delete set null,
  amount_initial    numeric(15, 2) not null,
  amount_remaining  numeric(15, 2) not null,
  rate              numeric(5, 4) not null, -- ex: 0.08 = 8%
  duration_months   int not null,
  monthly_payment   numeric(15, 2) not null,
  next_payment_at   timestamptz not null,
  paid_off_at       timestamptz,
  is_starter_loan   boolean not null default false,
  is_default        boolean not null default false,
  created_at        timestamptz not null default now()
);

alter table public.skyline_loans enable row level security;

drop policy if exists "skyline_loans_read_own" on public.skyline_loans;
create policy "skyline_loans_read_own"
  on public.skyline_loans
  for select
  using (auth.uid() = user_id OR (select is_admin from public.profiles where id = auth.uid()));

drop policy if exists "skyline_loans_write_own" on public.skyline_loans;
create policy "skyline_loans_write_own"
  on public.skyline_loans
  for all
  using (auth.uid() = user_id);

create index if not exists skyline_loans_user_idx on public.skyline_loans(user_id);

create table if not exists public.skyline_audits (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  triggered_by        text not null check (triggered_by in ('shell_conversion', 'random', 'profile_check')),
  fine_amount         numeric(15, 2) not null default 0,
  was_paid            boolean not null default false,
  description         text not null,
  created_at          timestamptz not null default now()
);

alter table public.skyline_audits enable row level security;

drop policy if exists "skyline_audits_read_own" on public.skyline_audits;
create policy "skyline_audits_read_own"
  on public.skyline_audits
  for select
  using (auth.uid() = user_id OR (select is_admin from public.profiles where id = auth.uid()));

drop policy if exists "skyline_audits_write_own" on public.skyline_audits;
create policy "skyline_audits_write_own"
  on public.skyline_audits
  for all
  using (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════════
-- 5. TABLES P5 — USINES, MACHINES, TRANSPORT, CONTRATS MATIÈRES
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.skyline_machines (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.skyline_companies(id) on delete cascade,
  kind            text not null, -- ex: 'oven_industrial_basic', 'tractor_basic', etc.
  level           text not null check (level in ('basic', 'pro', 'elite', 'hightech')),
  cost            numeric(15, 2) not null,
  capacity_per_day int not null default 0,
  condition       int not null default 100 check (condition between 0 and 100),
  installed_at    timestamptz not null default now()
);

alter table public.skyline_machines enable row level security;

drop policy if exists "skyline_machines_read_own" on public.skyline_machines;
create policy "skyline_machines_read_own"
  on public.skyline_machines
  for select
  using (
    exists (
      select 1 from public.skyline_companies c
      where c.id = company_id and c.user_id = auth.uid()
    ) OR (select is_admin from public.profiles where id = auth.uid())
  );

drop policy if exists "skyline_machines_write_own" on public.skyline_machines;
create policy "skyline_machines_write_own"
  on public.skyline_machines
  for all
  using (
    exists (
      select 1 from public.skyline_companies c
      where c.id = company_id and c.user_id = auth.uid()
    )
  );

-- Contrats fournisseurs (matières premières).
create table if not exists public.skyline_supply_contracts (
  id                uuid primary key default gen_random_uuid(),
  buyer_user_id     uuid not null references auth.users(id) on delete cascade,
  buyer_company_id  uuid not null references public.skyline_companies(id) on delete cascade,
  seller_user_id    uuid references auth.users(id) on delete set null, -- null = PNJ
  seller_company_id uuid references public.skyline_companies(id) on delete set null,
  product_id        text not null,
  contract_kind     text not null check (contract_kind in ('spot', 'short', 'medium', 'long')),
  monthly_volume    int not null,
  unit_price        numeric(12, 2) not null,
  starts_at         timestamptz not null default now(),
  ends_at           timestamptz,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

alter table public.skyline_supply_contracts enable row level security;

drop policy if exists "skyline_supply_read" on public.skyline_supply_contracts;
create policy "skyline_supply_read"
  on public.skyline_supply_contracts
  for select
  using (
    auth.uid() = buyer_user_id OR
    auth.uid() = seller_user_id OR
    (select is_admin from public.profiles where id = auth.uid())
  );

drop policy if exists "skyline_supply_write_buyer" on public.skyline_supply_contracts;
create policy "skyline_supply_write_buyer"
  on public.skyline_supply_contracts
  for all
  using (auth.uid() = buyer_user_id);

-- Contrats de transport.
create table if not exists public.skyline_shipping_contracts (
  id                uuid primary key default gen_random_uuid(),
  client_user_id    uuid not null references auth.users(id) on delete cascade,
  client_company_id uuid not null references public.skyline_companies(id) on delete cascade,
  carrier_kind      text not null check (carrier_kind in ('npc_third', 'player_carrier', 'own_fleet')),
  carrier_user_id   uuid references auth.users(id) on delete set null,
  rate_pct          numeric(5, 2) not null, -- % de la valeur transportée
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

alter table public.skyline_shipping_contracts enable row level security;

drop policy if exists "skyline_shipping_read" on public.skyline_shipping_contracts;
create policy "skyline_shipping_read"
  on public.skyline_shipping_contracts
  for select
  using (
    auth.uid() = client_user_id OR
    auth.uid() = carrier_user_id OR
    (select is_admin from public.profiles where id = auth.uid())
  );

drop policy if exists "skyline_shipping_write_client" on public.skyline_shipping_contracts;
create policy "skyline_shipping_write_client"
  on public.skyline_shipping_contracts
  for all
  using (auth.uid() = client_user_id);

-- ══════════════════════════════════════════════════════════════════════
-- 6. TABLES P6 — MARCHÉ COMMUN (cours produits, événements, fil d'actu)
-- ══════════════════════════════════════════════════════════════════════

-- Cours produits global (mis à jour par tick global).
create table if not exists public.skyline_market_courses (
  product_id      text primary key,
  current_price   numeric(12, 2) not null,
  ref_price       numeric(12, 2) not null,
  trend_24h       numeric(6, 2) not null default 0, -- % variation
  volume_24h      bigint not null default 0,
  high_30d        numeric(12, 2) not null default 0,
  low_30d         numeric(12, 2) not null default 0,
  updated_at      timestamptz not null default now()
);

alter table public.skyline_market_courses enable row level security;

drop policy if exists "skyline_market_read_all" on public.skyline_market_courses;
create policy "skyline_market_read_all"
  on public.skyline_market_courses
  for select
  using (true);

-- Ordres B2B inter-joueurs sur le marché commun.
create table if not exists public.skyline_market_orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  company_id      uuid not null references public.skyline_companies(id) on delete cascade,
  side            text not null check (side in ('buy', 'sell')),
  product_id      text not null,
  quantity        int not null check (quantity > 0),
  unit_price      numeric(12, 2) not null,
  filled_quantity int not null default 0,
  status          text not null default 'open' check (status in ('open', 'filled', 'partial', 'cancelled')),
  created_at      timestamptz not null default now(),
  filled_at       timestamptz
);

alter table public.skyline_market_orders enable row level security;

drop policy if exists "skyline_market_orders_read_all" on public.skyline_market_orders;
create policy "skyline_market_orders_read_all"
  on public.skyline_market_orders
  for select
  using (true);

drop policy if exists "skyline_market_orders_write_own" on public.skyline_market_orders;
create policy "skyline_market_orders_write_own"
  on public.skyline_market_orders
  for all
  using (auth.uid() = user_id);

create index if not exists skyline_market_orders_product_idx on public.skyline_market_orders(product_id, status);

-- Événements de marché.
create table if not exists public.skyline_events (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,
  scope         text not null check (scope in ('product', 'sector', 'global')),
  target        text, -- product_id ou sector ou null pour global
  headline      text not null,
  body          text not null,
  impact_pct    numeric(6, 2) not null default 0,
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz not null,
  announced     boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table public.skyline_events enable row level security;

drop policy if exists "skyline_events_read_all" on public.skyline_events;
create policy "skyline_events_read_all"
  on public.skyline_events
  for select
  using (true);

create index if not exists skyline_events_ends_idx on public.skyline_events(ends_at);

-- Fil d'actu type Bloomberg.
create table if not exists public.skyline_news (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  headline    text not null,
  body        text not null,
  product_id  text,
  sector      text,
  impact_pct  numeric(6, 2) not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.skyline_news enable row level security;

drop policy if exists "skyline_news_read_all" on public.skyline_news;
create policy "skyline_news_read_all"
  on public.skyline_news
  for select
  using (true);

create index if not exists skyline_news_recent_idx on public.skyline_news(created_at desc);

-- PNJ corporate (multinationales qui bougent le marché).
create table if not exists public.skyline_npc_corp (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  glyph               text not null default '🏢',
  sector              text not null,
  market_share_pct    numeric(5, 2) not null default 5,
  influence_score     int not null default 100,
  description         text,
  created_at          timestamptz not null default now()
);

alter table public.skyline_npc_corp enable row level security;

drop policy if exists "skyline_npc_corp_read_all" on public.skyline_npc_corp;
create policy "skyline_npc_corp_read_all"
  on public.skyline_npc_corp
  for select
  using (true);

-- ══════════════════════════════════════════════════════════════════════
-- 7. TABLES P7 — BOURSE (actions, ordres, dividendes)
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.skyline_company_shares (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.skyline_companies(id) on delete cascade unique,
  total_shares  bigint not null,
  ipo_price     numeric(12, 2) not null,
  current_price numeric(12, 2) not null,
  market_cap    numeric(18, 2) not null,
  ipo_at        timestamptz not null default now(),
  is_listed     boolean not null default true
);

alter table public.skyline_company_shares enable row level security;

drop policy if exists "skyline_shares_read_all" on public.skyline_company_shares;
create policy "skyline_shares_read_all"
  on public.skyline_company_shares
  for select
  using (true);

create table if not exists public.skyline_share_holdings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  company_id      uuid not null references public.skyline_companies(id) on delete cascade,
  shares          bigint not null check (shares >= 0),
  avg_buy_price   numeric(12, 2) not null,
  unique (user_id, company_id)
);

alter table public.skyline_share_holdings enable row level security;

drop policy if exists "skyline_holdings_read_own" on public.skyline_share_holdings;
create policy "skyline_holdings_read_own"
  on public.skyline_share_holdings
  for select
  using (auth.uid() = user_id OR (select is_admin from public.profiles where id = auth.uid()));

drop policy if exists "skyline_holdings_write_own" on public.skyline_share_holdings;
create policy "skyline_holdings_write_own"
  on public.skyline_share_holdings
  for all
  using (auth.uid() = user_id);

create table if not exists public.skyline_share_orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  company_id      uuid not null references public.skyline_companies(id) on delete cascade,
  side            text not null check (side in ('buy', 'sell')),
  order_kind      text not null check (order_kind in ('market', 'limit')),
  quantity        bigint not null check (quantity > 0),
  limit_price     numeric(12, 2),
  filled_quantity bigint not null default 0,
  avg_fill_price  numeric(12, 2),
  status          text not null default 'open' check (status in ('open', 'filled', 'partial', 'cancelled')),
  created_at      timestamptz not null default now(),
  filled_at       timestamptz
);

alter table public.skyline_share_orders enable row level security;

drop policy if exists "skyline_share_orders_read_all" on public.skyline_share_orders;
create policy "skyline_share_orders_read_all"
  on public.skyline_share_orders
  for select
  using (true);

drop policy if exists "skyline_share_orders_write_own" on public.skyline_share_orders;
create policy "skyline_share_orders_write_own"
  on public.skyline_share_orders
  for all
  using (auth.uid() = user_id);

-- Dividendes versés.
create table if not exists public.skyline_dividends (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.skyline_companies(id) on delete cascade,
  amount_per_share numeric(12, 4) not null,
  paid_at       timestamptz not null default now()
);

alter table public.skyline_dividends enable row level security;

drop policy if exists "skyline_dividends_read_all" on public.skyline_dividends;
create policy "skyline_dividends_read_all"
  on public.skyline_dividends
  for select
  using (true);

-- ══════════════════════════════════════════════════════════════════════
-- 8. TABLES P10 — R&D, BREVETS, ÉTOILES RESTAU
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.skyline_research (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.skyline_companies(id) on delete cascade,
  research_kind   text not null,
  progress_pct    numeric(5, 2) not null default 0 check (progress_pct between 0 and 100),
  cost_total      numeric(15, 2) not null default 0,
  ends_at         timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.skyline_research enable row level security;

drop policy if exists "skyline_research_read_own" on public.skyline_research;
create policy "skyline_research_read_own"
  on public.skyline_research
  for select
  using (
    exists (
      select 1 from public.skyline_companies c
      where c.id = company_id and c.user_id = auth.uid()
    ) OR (select is_admin from public.profiles where id = auth.uid())
  );

drop policy if exists "skyline_research_write_own" on public.skyline_research;
create policy "skyline_research_write_own"
  on public.skyline_research
  for all
  using (
    exists (
      select 1 from public.skyline_companies c
      where c.id = company_id and c.user_id = auth.uid()
    )
  );

create table if not exists public.skyline_patents (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.skyline_companies(id) on delete cascade,
  patent_name     text not null,
  registered_at   timestamptz not null default now(),
  expires_at      timestamptz not null
);

alter table public.skyline_patents enable row level security;

drop policy if exists "skyline_patents_read_all" on public.skyline_patents;
create policy "skyline_patents_read_all"
  on public.skyline_patents
  for select
  using (true);

drop policy if exists "skyline_patents_write_own" on public.skyline_patents;
create policy "skyline_patents_write_own"
  on public.skyline_patents
  for all
  using (
    exists (
      select 1 from public.skyline_companies c
      where c.id = company_id and c.user_id = auth.uid()
    )
  );

-- Étoiles "Guide Skyline" pour restaurants.
create table if not exists public.skyline_restaurant_stars (
  company_id      uuid primary key references public.skyline_companies(id) on delete cascade,
  stars           int not null default 0 check (stars between 0 and 3),
  awarded_at      timestamptz not null default now(),
  guide_score     int not null default 0
);

alter table public.skyline_restaurant_stars enable row level security;

drop policy if exists "skyline_stars_read_all" on public.skyline_restaurant_stars;
create policy "skyline_stars_read_all"
  on public.skyline_restaurant_stars
  for select
  using (true);

-- ══════════════════════════════════════════════════════════════════════
-- 9. TABLES P11 — HOLDINGS, VENTES INTER-JOUEURS
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.skyline_holdings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  total_cash  numeric(18, 2) not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.skyline_holdings enable row level security;

drop policy if exists "skyline_holdings_read_own" on public.skyline_holdings;
create policy "skyline_holdings_read_own"
  on public.skyline_holdings
  for select
  using (auth.uid() = user_id OR (select is_admin from public.profiles where id = auth.uid()));

drop policy if exists "skyline_holdings_write_own" on public.skyline_holdings;
create policy "skyline_holdings_write_own"
  on public.skyline_holdings
  for all
  using (auth.uid() = user_id);

create table if not exists public.skyline_company_holdings_link (
  holding_id  uuid not null references public.skyline_holdings(id) on delete cascade,
  company_id  uuid not null references public.skyline_companies(id) on delete cascade,
  primary key (holding_id, company_id)
);

alter table public.skyline_company_holdings_link enable row level security;

drop policy if exists "skyline_holdings_link_read_own" on public.skyline_company_holdings_link;
create policy "skyline_holdings_link_read_own"
  on public.skyline_company_holdings_link
  for select
  using (
    exists (
      select 1 from public.skyline_holdings h
      where h.id = holding_id and h.user_id = auth.uid()
    )
  );

drop policy if exists "skyline_holdings_link_write_own" on public.skyline_company_holdings_link;
create policy "skyline_holdings_link_write_own"
  on public.skyline_company_holdings_link
  for all
  using (
    exists (
      select 1 from public.skyline_holdings h
      where h.id = holding_id and h.user_id = auth.uid()
    )
  );

-- Vente d'entreprise inter-joueurs (mise en vente).
create table if not exists public.skyline_companies_for_sale (
  company_id  uuid primary key references public.skyline_companies(id) on delete cascade,
  asking_price numeric(15, 2) not null,
  listed_at   timestamptz not null default now()
);

alter table public.skyline_companies_for_sale enable row level security;

drop policy if exists "skyline_for_sale_read_all" on public.skyline_companies_for_sale;
create policy "skyline_for_sale_read_all"
  on public.skyline_companies_for_sale
  for select
  using (true);

drop policy if exists "skyline_for_sale_write_own" on public.skyline_companies_for_sale;
create policy "skyline_for_sale_write_own"
  on public.skyline_companies_for_sale
  for all
  using (
    exists (
      select 1 from public.skyline_companies c
      where c.id = company_id and c.user_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════════════════
-- 10. TABLES P12 — CLASSEMENTS
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.skyline_leaderboard (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  net_worth         numeric(18, 2) not null default 0,
  monthly_profit    numeric(15, 2) not null default 0,
  companies_count   int not null default 0,
  market_cap_total  numeric(18, 2) not null default 0,
  updated_at        timestamptz not null default now()
);

alter table public.skyline_leaderboard enable row level security;

drop policy if exists "skyline_leaderboard_read_all" on public.skyline_leaderboard;
create policy "skyline_leaderboard_read_all"
  on public.skyline_leaderboard
  for select
  using (true);

-- ══════════════════════════════════════════════════════════════════════
-- 11. RPCs P1 — INIT, CRÉATION ENTREPRISE, ACHAT STOCK, VENTE
-- ══════════════════════════════════════════════════════════════════════

-- Crée le profil Skyline si pas encore présent.
create or replace function public.skyline_init_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  insert into public.skyline_profiles (user_id, cash, credit_score, net_worth)
  values (v_user_id, 10000, 0, 10000)
  on conflict (user_id) do nothing;
end;
$$;

-- Tick lazy : applique loyer mensuel + autres frais récurrents si écoulé.
-- Mensuel jeu = 30h réelles. On applique au prorata du temps écoulé depuis last_tick_at.
create or replace function public.skyline_tick_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company    public.skyline_companies%rowtype;
  v_now        timestamptz := now();
  v_elapsed_h  numeric;
  v_month_h    numeric := 30; -- 1 mois jeu = 30h réelles
  v_rent       numeric;
  v_rent_due   numeric;
begin
  select * into v_company from public.skyline_companies where id = p_company_id;
  if not found then return; end if;
  if v_company.user_id <> auth.uid() then return; end if;

  v_elapsed_h := extract(epoch from (v_now - v_company.last_tick_at)) / 3600.0;

  -- Loyer prorata (si pas owned).
  if not v_company.is_owned then
    v_rent := public.skyline_local_rent_monthly(v_company.district, v_company.local_size);
    v_rent_due := v_rent * (v_elapsed_h / v_month_h);
    if v_rent_due > 0 then
      update public.skyline_profiles
        set cash = cash - v_rent_due, updated_at = v_now
        where user_id = v_company.user_id;
      update public.skyline_companies
        set monthly_expenses = v_rent,
            last_tick_at = v_now,
            updated_at = v_now
        where id = p_company_id;
      insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
      values (v_company.user_id, p_company_id, 'rent', -v_rent_due,
        'Loyer prorata ' || v_company.name || ' (' || round(v_elapsed_h, 1) || 'h)');
    end if;
  else
    update public.skyline_companies
      set last_tick_at = v_now, updated_at = v_now
      where id = p_company_id;
  end if;
end;
$$;

-- Crée une entreprise + bail / achat local + transaction.
create or replace function public.skyline_create_company(
  p_category    text,
  p_sector      text,
  p_name        text,
  p_district    text,
  p_local_size  text,
  p_purchase    boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_rent        numeric;
  v_purchase    numeric;
  v_total_cost  numeric;
  v_company_id  uuid;
  v_existing    int;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;

  if p_category not in ('commerce', 'factory', 'raw', 'service') then
    raise exception 'Catégorie invalide';
  end if;

  if p_district not in ('centre', 'affaires', 'residentiel', 'peripherie', 'populaire') then
    raise exception 'Quartier invalide';
  end if;

  if p_local_size not in ('xs', 's', 'm', 'l', 'xl') then
    raise exception 'Taille de local invalide';
  end if;

  -- 1 entreprise par type par joueur.
  select count(*) into v_existing
  from public.skyline_companies
  where user_id = v_user_id and sector = p_sector;
  if v_existing > 0 then
    raise exception 'Tu possèdes déjà une entreprise de ce type';
  end if;

  v_rent := public.skyline_local_rent_monthly(p_district, p_local_size);
  v_purchase := public.skyline_local_purchase_cost(p_district, p_local_size);

  if p_purchase then
    v_total_cost := v_purchase;
  else
    -- Caution = 1 mois de loyer.
    v_total_cost := v_rent;
  end if;

  -- Vérifier le cash dispo.
  declare
    v_cash numeric;
  begin
    select cash into v_cash from public.skyline_profiles where user_id = v_user_id;
    if v_cash is null then
      perform public.skyline_init_profile();
      v_cash := 10000;
    end if;
    if v_cash < v_total_cost then
      raise exception 'Cash insuffisant : il te manque % $', round(v_total_cost - v_cash, 2);
    end if;
  end;

  -- Débiter.
  update public.skyline_profiles
    set cash = cash - v_total_cost, updated_at = now()
    where user_id = v_user_id;

  -- Créer l'entreprise.
  insert into public.skyline_companies (
    user_id, category, sector, name, district, local_size, is_owned, monthly_expenses
  )
  values (
    v_user_id, p_category, p_sector, p_name, p_district, p_local_size, p_purchase, v_rent
  )
  returning id into v_company_id;

  -- Transaction.
  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (
    v_user_id, v_company_id,
    case when p_purchase then 'purchase_local' else 'deposit' end,
    -v_total_cost,
    case when p_purchase
      then 'Achat local ' || p_district || ' ' || p_local_size
      else 'Caution loyer ' || p_district || ' ' || p_local_size
    end
  );

  return v_company_id;
end;
$$;

-- Achat de stock au marché de gros PNJ (prix de référence).
create or replace function public.skyline_purchase_stock(
  p_company_id  uuid,
  p_product_id  text,
  p_quantity    int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_unit_price   numeric;
  v_total_cost   numeric;
  v_existing_qty int;
  v_existing_avg numeric;
  v_new_avg      numeric;
  v_company      public.skyline_companies%rowtype;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  if p_quantity <= 0 then
    raise exception 'Quantité invalide';
  end if;

  select * into v_company from public.skyline_companies where id = p_company_id;
  if not found or v_company.user_id <> v_user_id then
    raise exception 'Entreprise non trouvée';
  end if;

  v_unit_price := public.skyline_product_ref_buy(p_product_id);
  if v_unit_price is null then
    raise exception 'Produit inconnu';
  end if;

  v_total_cost := v_unit_price * p_quantity;

  -- Vérifier cash entreprise + perso.
  declare v_user_cash numeric;
  begin
    select cash into v_user_cash from public.skyline_profiles where user_id = v_user_id;
    if v_user_cash < v_total_cost then
      raise exception 'Cash insuffisant : il te manque % $', round(v_total_cost - v_user_cash, 2);
    end if;
  end;

  -- Débiter.
  update public.skyline_profiles
    set cash = cash - v_total_cost, updated_at = now()
    where user_id = v_user_id;

  -- Mettre à jour inventaire (avg pondéré).
  select quantity, avg_buy_price
    into v_existing_qty, v_existing_avg
    from public.skyline_inventory
    where company_id = p_company_id and product_id = p_product_id;

  if not found then
    insert into public.skyline_inventory (company_id, product_id, quantity, avg_buy_price, sell_price, purchased_at)
    values (
      p_company_id, p_product_id, p_quantity, v_unit_price,
      coalesce(public.skyline_product_ref_sell(p_product_id), v_unit_price * 2),
      now()
    );
  else
    v_new_avg := (v_existing_qty * v_existing_avg + p_quantity * v_unit_price) / (v_existing_qty + p_quantity);
    update public.skyline_inventory
      set quantity = quantity + p_quantity,
          avg_buy_price = v_new_avg,
          purchased_at = now()
      where company_id = p_company_id and product_id = p_product_id;
  end if;

  -- Transaction.
  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'purchase', -v_total_cost,
    'Achat ' || p_quantity || '× ' || p_product_id || ' à ' || v_unit_price || '$');
end;
$$;

-- Définit le prix de vente d'un produit en boutique.
create or replace function public.skyline_set_sell_price(
  p_company_id  uuid,
  p_product_id  text,
  p_price       numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if p_price < 0 then raise exception 'Prix invalide'; end if;

  update public.skyline_inventory
    set sell_price = p_price
    where company_id = p_company_id and product_id = p_product_id
      and exists (
        select 1 from public.skyline_companies c
        where c.id = p_company_id and c.user_id = v_user_id
      );
end;
$$;

-- Achat d'un présentoir / équipement (placement abstrait P1).
create or replace function public.skyline_buy_furniture(
  p_company_id  uuid,
  p_kind        text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_cost        numeric;
  v_furniture_id uuid;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;

  v_cost := public.skyline_furniture_cost(p_kind);
  if v_cost is null then raise exception 'Présentoir inconnu'; end if;

  if not exists (
    select 1 from public.skyline_companies
    where id = p_company_id and user_id = v_user_id
  ) then
    raise exception 'Entreprise non trouvée';
  end if;

  declare v_user_cash numeric;
  begin
    select cash into v_user_cash from public.skyline_profiles where user_id = v_user_id;
    if v_user_cash < v_cost then
      raise exception 'Cash insuffisant : il te manque % $', round(v_cost - v_user_cash, 2);
    end if;
  end;

  update public.skyline_profiles
    set cash = cash - v_cost, updated_at = now()
    where user_id = v_user_id;

  insert into public.skyline_furniture (company_id, kind)
  values (p_company_id, p_kind)
  returning id into v_furniture_id;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'equipment', -v_cost, 'Achat ' || p_kind);

  return v_furniture_id;
end;
$$;

-- Simulation de vente automatique (tick boutique).
-- Pour P1 : à chaque "process", consomme un peu de stock selon flux clients PNJ.
-- La formule simple : flux_clients_par_h × demand_factor × prob_achat / nb_produits.
create or replace function public.skyline_process_sales(p_company_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company       public.skyline_companies%rowtype;
  v_user_id       uuid := auth.uid();
  v_now           timestamptz := now();
  v_elapsed_h     numeric;
  v_district_factor numeric;
  v_size_factor   numeric;
  v_clients       int;
  v_inv_rec       record;
  v_sold_qty      int;
  v_revenue       numeric;
  v_total_sold    int := 0;
  v_total_revenue numeric := 0;
begin
  select * into v_company from public.skyline_companies where id = p_company_id;
  if not found or v_company.user_id <> v_user_id then
    raise exception 'Entreprise non trouvée';
  end if;

  v_elapsed_h := extract(epoch from (v_now - v_company.last_tick_at)) / 3600.0;
  if v_elapsed_h < 0.01 then return 0; end if;

  -- Flux clients horaire selon quartier.
  v_district_factor := case v_company.district
    when 'centre'      then 25
    when 'affaires'    then 20
    when 'residentiel' then 12
    when 'peripherie'  then 6
    when 'populaire'   then 8
    else 5
  end;
  v_size_factor := case v_company.local_size
    when 'xs' then 0.6
    when 's'  then 1.0
    when 'm'  then 1.5
    when 'l'  then 2.0
    when 'xl' then 2.8
    else 1
  end;
  v_clients := floor(v_district_factor * v_size_factor * v_elapsed_h)::int;

  if v_clients <= 0 then
    update public.skyline_companies set last_tick_at = v_now where id = p_company_id;
    return 0;
  end if;

  -- Pour chaque produit en stock, vente probabiliste fonction prix vs ref.
  for v_inv_rec in
    select * from public.skyline_inventory
    where company_id = p_company_id and quantity > 0
  loop
    declare
      v_ref_sell  numeric := public.skyline_product_ref_sell(v_inv_rec.product_id);
      v_price_factor numeric;
      v_demand_qty int;
    begin
      if v_ref_sell is null or v_ref_sell <= 0 then continue; end if;
      -- Si prix joueur < ref → demande boostée. Si prix > ref → demande réduite.
      v_price_factor := least(2.0, greatest(0.1, v_ref_sell / nullif(v_inv_rec.sell_price, 0)));
      v_demand_qty := least(
        v_inv_rec.quantity,
        floor(v_clients * v_price_factor * 0.15 / greatest(1, (
          select count(*) from public.skyline_inventory where company_id = p_company_id and quantity > 0
        )))::int
      );
      if v_demand_qty <= 0 then continue; end if;

      v_sold_qty := v_demand_qty;
      v_revenue := v_sold_qty * v_inv_rec.sell_price;

      update public.skyline_inventory
        set quantity = quantity - v_sold_qty
        where id = v_inv_rec.id;

      v_total_sold := v_total_sold + v_sold_qty;
      v_total_revenue := v_total_revenue + v_revenue;
    end;
  end loop;

  if v_total_revenue > 0 then
    update public.skyline_profiles
      set cash = cash + v_total_revenue, updated_at = v_now
      where user_id = v_user_id;
    update public.skyline_companies
      set monthly_revenue = v_total_revenue,
          last_tick_at = v_now,
          updated_at = v_now
      where id = p_company_id;
    insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
    values (v_user_id, p_company_id, 'sale', v_total_revenue,
      v_total_sold || ' ventes (' || round(v_elapsed_h, 1) || 'h flux ' || v_clients || ' clients)');
  else
    update public.skyline_companies set last_tick_at = v_now where id = p_company_id;
  end if;

  return v_total_sold;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 12. RPCs P1 — PONT $ ↔ OS
-- ══════════════════════════════════════════════════════════════════════

-- Conversion $ → OS via virement bancaire (taxe 60%, pas de risque).
create or replace function public.skyline_pont_wire(p_dollars numeric)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_taxed      numeric;
  v_remaining  numeric;
  v_os_int     int;
  v_user_cash  numeric;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if p_dollars <= 0 then raise exception 'Montant invalide'; end if;

  select cash into v_user_cash from public.skyline_profiles where user_id = v_user_id;
  if v_user_cash is null then
    perform public.skyline_init_profile();
    v_user_cash := 10000;
  end if;
  if v_user_cash < p_dollars then
    raise exception 'Cash insuffisant';
  end if;

  v_taxed := p_dollars * 0.6;
  v_remaining := p_dollars - v_taxed;
  v_os_int := floor(v_remaining * 0.001)::int;

  if v_os_int <= 0 then
    raise exception 'Montant trop faible (résultat 0 OS)';
  end if;

  -- Débiter $ joueur.
  update public.skyline_profiles
    set cash = cash - p_dollars, updated_at = now()
    where user_id = v_user_id;

  -- Créditer OS du profil principal.
  update public.profiles
    set gold = gold + v_os_int, updated_at = now()
    where id = v_user_id;

  -- Logs.
  insert into public.skyline_offshore_log (user_id, method, dollars_in, os_out, tax_amount)
  values (v_user_id, 'wire', p_dollars, v_os_int, v_taxed);

  insert into public.skyline_transactions (user_id, kind, amount, description)
  values (v_user_id, 'wire_conversion', -p_dollars,
    'Virement bancaire ' || p_dollars || '$ → ' || v_os_int || ' OS (taxe 60%)');

  return v_os_int;
end;
$$;

-- Conversion $ → OS via société écran (taxe 20%, risque audit, cap hebdo 100k$).
create or replace function public.skyline_pont_shell(p_dollars numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_profile    public.skyline_profiles%rowtype;
  v_taxed      numeric;
  v_remaining  numeric;
  v_os_int     int;
  v_audited    boolean := false;
  v_fine       numeric := 0;
  v_now        timestamptz := now();
  v_audit_prob numeric := 0.05;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if p_dollars <= 0 then raise exception 'Montant invalide'; end if;

  select * into v_profile from public.skyline_profiles where user_id = v_user_id;
  if not found then
    perform public.skyline_init_profile();
    select * into v_profile from public.skyline_profiles where user_id = v_user_id;
  end if;

  -- Reset hebdo si nécessaire.
  if v_now - v_profile.last_weekly_reset_at > interval '7 days' then
    update public.skyline_profiles
      set shell_dollars_this_week = 0, last_weekly_reset_at = v_now
      where user_id = v_user_id;
    v_profile.shell_dollars_this_week := 0;
  end if;

  if v_profile.shell_dollars_this_week + p_dollars > 100000 then
    raise exception 'Cap hebdo société écran atteint (100 000$). Restant : %$',
      round(100000 - v_profile.shell_dollars_this_week, 2);
  end if;

  if v_profile.cash < p_dollars then
    raise exception 'Cash insuffisant';
  end if;

  v_taxed := p_dollars * 0.2;
  v_remaining := p_dollars - v_taxed;
  v_os_int := floor(v_remaining * 0.005)::int;

  if v_os_int <= 0 then
    raise exception 'Montant trop faible (résultat 0 OS)';
  end if;

  -- Audit aléatoire (5% par opération, simplifié pour P1).
  if random() < v_audit_prob then
    v_audited := true;
    v_fine := p_dollars * 0.5;
  end if;

  -- Débiter $.
  update public.skyline_profiles
    set cash = cash - p_dollars - v_fine,
        shell_dollars_this_week = shell_dollars_this_week + p_dollars,
        last_dollar_to_os_audit_at = case when v_audited then v_now else last_dollar_to_os_audit_at end,
        updated_at = v_now
    where user_id = v_user_id;

  -- Créditer OS si pas saisi.
  if not v_audited then
    update public.profiles
      set gold = gold + v_os_int, updated_at = v_now
      where id = v_user_id;
  else
    v_os_int := 0;
  end if;

  insert into public.skyline_offshore_log (user_id, method, dollars_in, os_out, tax_amount, was_audited, fine_amount)
  values (v_user_id, 'shell', p_dollars, v_os_int, v_taxed, v_audited, v_fine);

  insert into public.skyline_transactions (user_id, kind, amount, description)
  values (v_user_id, 'shell_conversion', -p_dollars,
    'Société écran ' || p_dollars || '$ → ' || v_os_int || ' OS' ||
    case when v_audited then ' [AUDITÉ — saisie]' else ' (taxe 20%)' end);

  if v_audited then
    insert into public.skyline_transactions (user_id, kind, amount, description)
    values (v_user_id, 'audit_fine', -v_fine,
      'Amende suite audit fiscal société écran');
    insert into public.skyline_audits (user_id, triggered_by, fine_amount, description)
    values (v_user_id, 'shell_conversion', v_fine,
      'Audit fiscal sur société écran : tentative de conversion ' || p_dollars || '$ saisie');
  end if;

  return jsonb_build_object(
    'os_received', v_os_int,
    'was_audited', v_audited,
    'fine', v_fine,
    'tax', v_taxed
  );
end;
$$;

-- Conversion inverse OS → $ (à perte). Cap quotidien 50 OS.
create or replace function public.skyline_pont_inverse(p_os int)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_profile    public.skyline_profiles%rowtype;
  v_main_gold  bigint;
  v_dollars    numeric;
  v_now        timestamptz := now();
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if p_os <= 0 then raise exception 'Montant invalide'; end if;

  select * into v_profile from public.skyline_profiles where user_id = v_user_id;
  if not found then
    perform public.skyline_init_profile();
    select * into v_profile from public.skyline_profiles where user_id = v_user_id;
  end if;

  -- Reset quotidien.
  if v_now - v_profile.last_daily_reset_at > interval '1 day' then
    update public.skyline_profiles
      set os_to_dollars_today = 0, last_daily_reset_at = v_now
      where user_id = v_user_id;
    v_profile.os_to_dollars_today := 0;
  end if;

  if v_profile.os_to_dollars_today + p_os > 50 then
    raise exception 'Cap quotidien OS → $ atteint (50 OS). Restant : % OS',
      50 - v_profile.os_to_dollars_today;
  end if;

  select gold into v_main_gold from public.profiles where id = v_user_id;
  if v_main_gold < p_os then
    raise exception 'OS insuffisants';
  end if;

  v_dollars := p_os * 500;

  update public.profiles
    set gold = gold - p_os, updated_at = v_now
    where id = v_user_id;

  update public.skyline_profiles
    set cash = cash + v_dollars,
        os_to_dollars_today = os_to_dollars_today + p_os,
        updated_at = v_now
    where user_id = v_user_id;

  insert into public.skyline_offshore_log (user_id, method, dollars_in, os_in, dollars_out, os_out)
  values (v_user_id, 'os_to_dollars', 0, p_os, v_dollars, 0);

  insert into public.skyline_transactions (user_id, kind, amount, description)
  values (v_user_id, 'os_to_dollars', v_dollars,
    'Conversion OS → $ : ' || p_os || ' OS → ' || v_dollars || '$');

  return v_dollars;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 13. SEED DATA — quelques PNJ corporate de base
-- ══════════════════════════════════════════════════════════════════════

insert into public.skyline_npc_corp (name, glyph, sector, market_share_pct, influence_score, description)
values
  ('FoodCorp Industries', '🥖', 'food', 25, 800, 'Leader mondial agro-alimentaire, distribution massive.'),
  ('MegaTech Global', '💻', 'tech', 30, 950, 'Géant de la tech, smartphones, cloud, IA.'),
  ('LuxParis Group', '💎', 'luxury', 18, 600, 'Conglomérat luxe : joaillerie, parfumerie, mode.'),
  ('AutoVerse Motors', '🚗', 'auto', 22, 750, 'Constructeur automobile mondial.'),
  ('PharmaBlue', '💊', 'pharma', 15, 700, 'Big pharma, brevets sur 200+ molécules.'),
  ('SkyAir Alliance', '✈️', 'airline', 20, 680, 'Leader aérien mondial.'),
  ('GlobalRetail Co', '🛒', 'retail', 28, 720, 'Chaîne hypermarchés mondiale.'),
  ('CrudeOil Inc', '🛢️', 'energy', 35, 900, 'Pétrolière géante.'),
  ('SteelWorks Holding', '⚙️', 'industry', 25, 700, 'Aciérie + métallurgie lourde.'),
  ('DesignArt House', '🛋️', 'furniture', 12, 450, 'Mobilier et déco premium.')
on conflict (name) do nothing;

-- ══════════════════════════════════════════════════════════════════════
-- 14. P2 — TABLES PERMIS + RPCs EMPLOYÉS / HYGIÈNE / PERMIS
-- ══════════════════════════════════════════════════════════════════════

-- Permis acquis par chaque entreprise (alimentaire, alcool, pharma, enseigne, terrasse...).
create table if not exists public.skyline_permits (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.skyline_companies(id) on delete cascade,
  kind        text not null,
  acquired_at timestamptz not null default now(),
  expires_at  timestamptz not null,
  cost        numeric(15, 2) not null,
  unique (company_id, kind)
);

alter table public.skyline_permits enable row level security;

drop policy if exists "skyline_permits_read_own" on public.skyline_permits;
create policy "skyline_permits_read_own"
  on public.skyline_permits
  for select
  using (
    exists (
      select 1 from public.skyline_companies c
      where c.id = company_id and c.user_id = auth.uid()
    ) OR (select is_admin from public.profiles where id = auth.uid())
  );

drop policy if exists "skyline_permits_write_own" on public.skyline_permits;
create policy "skyline_permits_write_own"
  on public.skyline_permits
  for all
  using (
    exists (
      select 1 from public.skyline_companies c
      where c.id = company_id and c.user_id = auth.uid()
    )
  );

-- Coût d'un permis selon kind.
create or replace function public.skyline_permit_cost(p_kind text)
returns numeric language sql immutable as $$
  select case p_kind
    when 'food'      then 500    -- Licence alimentaire
    when 'alcohol'   then 1500   -- Licence IV (alcool)
    when 'pharma'    then 5000   -- Pharmacie (diplôme)
    when 'enseigne'  then 200    -- Permis enseigne
    when 'terrasse'  then 800    -- Permis terrasse
    when 'tobacco'   then 1200   -- Bureau de tabac
    when 'firearms'  then 3000   -- Vente d'armes
    when 'medical'   then 4000   -- Cabinet médical
    when 'fire'      then 300    -- Conformité incendie
    else null
  end;
$$;

-- Acquérir un permis (paie + ajoute à la table).
create or replace function public.skyline_acquire_permit(
  p_company_id uuid,
  p_kind       text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_cost    numeric;
  v_permit_id uuid;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if not exists (
    select 1 from public.skyline_companies
    where id = p_company_id and user_id = v_user_id
  ) then raise exception 'Entreprise non trouvée'; end if;

  v_cost := public.skyline_permit_cost(p_kind);
  if v_cost is null then raise exception 'Permis inconnu'; end if;

  declare v_user_cash numeric;
  begin
    select cash into v_user_cash from public.skyline_profiles where user_id = v_user_id;
    if v_user_cash < v_cost then
      raise exception 'Cash insuffisant : il te manque % $', round(v_cost - v_user_cash, 2);
    end if;
  end;

  update public.skyline_profiles
    set cash = cash - v_cost, updated_at = now()
    where user_id = v_user_id;

  insert into public.skyline_permits (company_id, kind, expires_at, cost)
  values (p_company_id, p_kind, now() + interval '360 hours', v_cost) -- 1 an jeu = 15 jours réels = 360h
  on conflict (company_id, kind) do update
    set acquired_at = now(),
        expires_at  = now() + interval '360 hours',
        cost        = v_cost
  returning id into v_permit_id;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'permit', -v_cost, 'Permis ' || p_kind);

  return v_permit_id;
end;
$$;

-- Génère / régénère le pool de candidats PNJ sur le marché de l'emploi.
-- Génère 50 candidats avec compétences randomisées et salaire demandé fonction des compétences.
create or replace function public.skyline_seed_employees(p_count int default 50)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_names text[] := array[
    'Léa', 'Maxime', 'Camille', 'Léo', 'Manon', 'Hugo', 'Inès', 'Lucas',
    'Chloé', 'Nathan', 'Emma', 'Théo', 'Sarah', 'Antoine', 'Julie', 'Romain',
    'Julia', 'Tom', 'Anaïs', 'Paul', 'Lola', 'Adrien', 'Marine', 'Quentin',
    'Pauline', 'Mathis', 'Clara', 'Alexandre', 'Eva', 'Florian'
  ];
  v_last_names text[] := array[
    'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand',
    'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David',
    'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'Andre', 'Lefevre'
  ];
  v_skill_keys text[] := array[
    'vente', 'service_client', 'presentation',
    'machine_use', 'cuisine', 'soins', 'manuel', 'medical', 'agricole',
    'rh', 'compta', 'marketing', 'negociation', 'management', 'securite', 'entretien'
  ];
  v_count int := 0;
  v_skills jsonb;
  v_avg_skill numeric;
  v_salary numeric;
  v_first text;
  v_last text;
  v_full text;
  i int;
  k text;
begin
  for i in 1..p_count loop
    v_skills := '{}'::jsonb;
    -- Pour chaque candidat : compétences avec biais (profil cohérent : 1-3 skills hauts, le reste bas).
    foreach k in array v_skill_keys loop
      v_skills := v_skills || jsonb_build_object(k, floor(random() * 30 + 5)::int);
    end loop;
    -- Booster 2-3 skills aléatoires (= spécialité).
    declare
      v_specialties int := floor(random() * 2 + 2)::int;
      v_specialty_idx int;
      j int;
    begin
      for j in 1..v_specialties loop
        v_specialty_idx := floor(random() * array_length(v_skill_keys, 1) + 1)::int;
        v_skills := v_skills || jsonb_build_object(
          v_skill_keys[v_specialty_idx],
          floor(random() * 50 + 40)::int -- 40-90
        );
      end loop;
    end;

    -- Calcul moy compétences pour salaire.
    select avg((value)::int) into v_avg_skill from jsonb_each_text(v_skills);
    v_salary := round(800 + v_avg_skill * 30 + random() * 500); -- 800-3500$/mois

    v_first := v_first_names[1 + floor(random() * array_length(v_first_names, 1))::int];
    v_last := v_last_names[1 + floor(random() * array_length(v_last_names, 1))::int];
    v_full := v_first || ' ' || v_last;

    insert into public.skyline_employees (
      full_name, avatar_seed, is_npc, skills, salary_demanded, morale, available_until
    )
    values (
      v_full,
      lower(v_first || '-' || substring(md5(random()::text) from 1 for 6)),
      true,
      v_skills,
      v_salary,
      80 + floor(random() * 20)::int,
      now() + interval '30 days'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Embauche : assigne un employé à une entreprise (le sort du marché public).
create or replace function public.skyline_hire_employee(
  p_employee_id uuid,
  p_company_id  uuid,
  p_salary      numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_emp     public.skyline_employees%rowtype;
  v_salary  numeric;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if not exists (
    select 1 from public.skyline_companies
    where id = p_company_id and user_id = v_user_id
  ) then raise exception 'Entreprise non trouvée'; end if;

  select * into v_emp from public.skyline_employees where id = p_employee_id;
  if not found then raise exception 'Candidat introuvable'; end if;
  if v_emp.company_id is not null then raise exception 'Déjà embauché ailleurs'; end if;

  v_salary := coalesce(p_salary, v_emp.salary_demanded);
  if v_salary < v_emp.salary_demanded * 0.8 then
    raise exception 'Salaire trop bas (le candidat refuse)';
  end if;

  update public.skyline_employees
    set company_id = p_company_id,
        salary_paid = v_salary,
        hired_at = now(),
        available_until = null,
        morale = least(100, morale + case when v_salary >= salary_demanded then 10 else 0 end)
    where id = p_employee_id;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'other', 0,
    'Embauche : ' || v_emp.full_name || ' (' || v_salary || '$/mois)');
end;
$$;

-- Licencie un employé.
create or replace function public.skyline_fire_employee(p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_emp     public.skyline_employees%rowtype;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  select * into v_emp from public.skyline_employees where id = p_employee_id;
  if not found then raise exception 'Employé introuvable'; end if;
  if v_emp.company_id is null then raise exception 'Pas embauché'; end if;
  if not exists (
    select 1 from public.skyline_companies
    where id = v_emp.company_id and user_id = v_user_id
  ) then raise exception 'Pas autorisé'; end if;

  update public.skyline_employees
    set company_id = null,
        salary_paid = 0,
        hired_at = null,
        morale = greatest(20, morale - 30),
        available_until = now() + interval '14 days'
    where id = p_employee_id;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, v_emp.company_id, 'other', 0,
    'Licenciement : ' || v_emp.full_name);
end;
$$;

-- Nettoyage manuel par le joueur (gratuit, reset propreté à 100).
create or replace function public.skyline_clean_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if not exists (
    select 1 from public.skyline_companies
    where id = p_company_id and user_id = v_user_id
  ) then raise exception 'Entreprise non trouvée'; end if;

  update public.skyline_companies
    set cleanliness = 100,
        hygiene_grade = 'A',
        updated_at = now()
    where id = p_company_id;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 15. P2 — TICK ENRICHI (saleté, salaires, mensualités prêts)
-- ══════════════════════════════════════════════════════════════════════

-- Réécriture du tick avec saleté progressive + salaires + mensualités.
-- Mensuel jeu = 30h réelles. Ratio horaire = 1/30.
create or replace function public.skyline_tick_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company    public.skyline_companies%rowtype;
  v_now        timestamptz := now();
  v_elapsed_h  numeric;
  v_month_h    numeric := 30;
  v_rent       numeric;
  v_rent_due   numeric;
  v_dirt_per_h numeric := 0.5;
  v_new_clean  int;
  v_emp_rec    record;
  v_salary_due numeric;
  v_total_salaries numeric := 0;
  v_loan_rec   record;
  v_loan_due   numeric;
  v_total_loans numeric := 0;
  v_has_cleaner boolean;
begin
  select * into v_company from public.skyline_companies where id = p_company_id;
  if not found then return; end if;
  if v_company.user_id <> auth.uid() then return; end if;

  v_elapsed_h := extract(epoch from (v_now - v_company.last_tick_at)) / 3600.0;
  if v_elapsed_h <= 0 then return; end if;

  -- Loyer prorata (si pas owned).
  if not v_company.is_owned then
    v_rent := public.skyline_local_rent_monthly(v_company.district, v_company.local_size);
    v_rent_due := v_rent * (v_elapsed_h / v_month_h);
    if v_rent_due > 0 then
      update public.skyline_profiles
        set cash = cash - v_rent_due, updated_at = v_now
        where user_id = v_company.user_id;
      insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
      values (v_company.user_id, p_company_id, 'rent', -v_rent_due,
        'Loyer prorata ' || v_company.name || ' (' || round(v_elapsed_h, 1) || 'h)');
    end if;
  end if;

  -- Salaires prorata par employé.
  for v_emp_rec in
    select * from public.skyline_employees where company_id = p_company_id
  loop
    v_salary_due := v_emp_rec.salary_paid * (v_elapsed_h / v_month_h);
    if v_salary_due > 0 then
      update public.skyline_profiles
        set cash = cash - v_salary_due, updated_at = v_now
        where user_id = v_company.user_id;
      v_total_salaries := v_total_salaries + v_salary_due;
    end if;
  end loop;
  if v_total_salaries > 0 then
    insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
    values (v_company.user_id, p_company_id, 'salary', -v_total_salaries,
      'Salaires prorata (' || round(v_elapsed_h, 1) || 'h)');
  end if;

  -- Mensualités prêts (proratisées).
  for v_loan_rec in
    select * from public.skyline_loans
    where (company_id = p_company_id or (company_id is null and user_id = v_company.user_id))
      and paid_off_at is null
      and is_default = false
  loop
    v_loan_due := v_loan_rec.monthly_payment * (v_elapsed_h / v_month_h);
    if v_loan_due > 0 and v_loan_rec.amount_remaining > 0 then
      v_loan_due := least(v_loan_due, v_loan_rec.amount_remaining);
      update public.skyline_loans
        set amount_remaining = amount_remaining - v_loan_due,
            paid_off_at = case when amount_remaining - v_loan_due <= 0 then v_now else null end
        where id = v_loan_rec.id;
      update public.skyline_profiles
        set cash = cash - v_loan_due, updated_at = v_now
        where user_id = v_company.user_id;
      v_total_loans := v_total_loans + v_loan_due;
    end if;
  end loop;
  if v_total_loans > 0 then
    insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
    values (v_company.user_id, p_company_id, 'loan_payment', -v_total_loans,
      'Mensualités prêts (' || round(v_elapsed_h, 1) || 'h)');
  end if;

  -- Saleté progressive (clean si femme de ménage embauchée, sinon dégrade).
  v_has_cleaner := exists (
    select 1 from public.skyline_employees
    where company_id = p_company_id
      and (skills->>'entretien')::int > 30
  );
  if v_has_cleaner then
    -- La femme de ménage maintient la propreté > 80.
    v_new_clean := greatest(80, v_company.cleanliness - floor(v_elapsed_h * 0.1)::int);
  else
    v_new_clean := greatest(0, v_company.cleanliness - floor(v_elapsed_h * v_dirt_per_h)::int);
  end if;

  update public.skyline_companies
    set cleanliness = v_new_clean,
        hygiene_grade = case
          when v_new_clean >= 70 then 'A'
          when v_new_clean >= 40 then 'B'
          else 'C'
        end,
        last_tick_at = v_now,
        updated_at = v_now
    where id = p_company_id;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 16. P3 — RPC PLACEMENT FURNITURE (drag & drop)
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.skyline_place_furniture(
  p_furniture_id uuid,
  p_grid_x       int,
  p_grid_y       int,
  p_rotation     int default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if p_grid_x < 0 or p_grid_y < 0 then raise exception 'Coordonnées invalides'; end if;
  if p_rotation not in (0, 90, 180, 270) then raise exception 'Rotation invalide'; end if;

  update public.skyline_furniture
    set grid_x = p_grid_x,
        grid_y = p_grid_y,
        rotation = p_rotation
    where id = p_furniture_id
      and exists (
        select 1 from public.skyline_companies c
        where c.id = company_id and c.user_id = v_user_id
      );
end;
$$;

create or replace function public.skyline_remove_furniture(p_furniture_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;

  delete from public.skyline_furniture
    where id = p_furniture_id
      and exists (
        select 1 from public.skyline_companies c
        where c.id = company_id and c.user_id = v_user_id
      );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 17. P4 — BANQUE : CALCUL TAUX, REQUEST LOAN, CHECK BANKRUPTCY
-- ══════════════════════════════════════════════════════════════════════

-- Taux d'intérêt selon score crédit (4% bon score → 18% mauvais).
create or replace function public.skyline_loan_rate(p_credit_score int)
returns numeric language sql immutable as $$
  select case
    when p_credit_score >= 800 then 0.04
    when p_credit_score >= 600 then 0.07
    when p_credit_score >= 400 then 0.10
    when p_credit_score >= 200 then 0.14
    else 0.18
  end;
$$;

-- Mensualité d'un prêt.
create or replace function public.skyline_loan_monthly_payment(
  p_amount numeric,
  p_rate   numeric,
  p_months int
)
returns numeric language sql immutable as $$
  -- Mensualité = principal * r / (1 - (1+r)^-n)
  -- r = taux mensuel (rate annuel / 12).
  select round(
    p_amount * (p_rate / 12) / (1 - power(1 + p_rate / 12, -p_months)),
    2
  );
$$;

-- Demande de prêt (avec ou sans apport, selon score crédit).
create or replace function public.skyline_request_loan(
  p_amount         numeric,
  p_duration_months int,
  p_company_id     uuid default null,
  p_is_starter     boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_profile      public.skyline_profiles%rowtype;
  v_rate         numeric;
  v_monthly_pmt  numeric;
  v_loan_id      uuid;
  v_existing_starter int;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if p_amount <= 0 then raise exception 'Montant invalide'; end if;
  if p_duration_months not in (5*12, 10*12, 15*12, 20*12, 60, 120, 180, 240) then
    raise exception 'Durée invalide (5/10/15/20 ans en mois jeu)';
  end if;

  select * into v_profile from public.skyline_profiles where user_id = v_user_id;
  if not found then
    perform public.skyline_init_profile();
    select * into v_profile from public.skyline_profiles where user_id = v_user_id;
  end if;

  -- Prêt création débutant : max 40k$, 8% fixe, 1× seulement, sans apport.
  if p_is_starter then
    if p_amount > 40000 then raise exception 'Prêt création max 40 000$'; end if;
    select count(*) into v_existing_starter from public.skyline_loans
      where user_id = v_user_id and is_starter_loan = true;
    if v_existing_starter > 0 then raise exception 'Prêt création déjà utilisé'; end if;
    v_rate := 0.08;
  else
    -- Prêt classique : taux selon score crédit.
    v_rate := public.skyline_loan_rate(v_profile.credit_score);
  end if;

  v_monthly_pmt := public.skyline_loan_monthly_payment(p_amount, v_rate, p_duration_months);

  -- Créditer le cash.
  update public.skyline_profiles
    set cash = cash + p_amount, updated_at = now()
    where user_id = v_user_id;

  insert into public.skyline_loans (
    user_id, company_id, amount_initial, amount_remaining, rate, duration_months,
    monthly_payment, next_payment_at, is_starter_loan
  )
  values (
    v_user_id, p_company_id, p_amount, p_amount, v_rate, p_duration_months,
    v_monthly_pmt, now() + interval '30 hours', p_is_starter
  )
  returning id into v_loan_id;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'other', p_amount,
    'Prêt accordé : ' || p_amount || '$ à ' || (v_rate * 100) || '% sur ' || (p_duration_months / 12) || ' ans');

  return v_loan_id;
end;
$$;

-- Remboursement anticipé d'une partie ou totalité du prêt.
create or replace function public.skyline_repay_loan(
  p_loan_id uuid,
  p_amount  numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_loan    public.skyline_loans%rowtype;
  v_amount  numeric;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  select * into v_loan from public.skyline_loans
    where id = p_loan_id and user_id = v_user_id and paid_off_at is null;
  if not found then raise exception 'Prêt non trouvé ou déjà soldé'; end if;

  v_amount := least(p_amount, v_loan.amount_remaining);
  declare v_user_cash numeric;
  begin
    select cash into v_user_cash from public.skyline_profiles where user_id = v_user_id;
    if v_user_cash < v_amount then
      raise exception 'Cash insuffisant';
    end if;
  end;

  update public.skyline_profiles
    set cash = cash - v_amount, updated_at = now()
    where user_id = v_user_id;

  update public.skyline_loans
    set amount_remaining = amount_remaining - v_amount,
        paid_off_at = case when amount_remaining - v_amount <= 0 then now() else null end
    where id = p_loan_id;

  -- Bonus score crédit pour remboursement anticipé.
  update public.skyline_profiles
    set credit_score = least(1000, credit_score + 5)
    where user_id = v_user_id;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, v_loan.company_id, 'loan_payment', -v_amount,
    'Remboursement anticipé prêt');
end;
$$;

-- Vérifie si l'utilisateur est en faillite imminente (compte_courant < -10% × patrimoine total).
-- Si oui, démarre la procédure progressive (alerte 7j → vente d'actifs).
create or replace function public.skyline_check_bankruptcy(p_user_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := coalesce(p_user_id, auth.uid());
  v_profile     public.skyline_profiles%rowtype;
  v_assets      numeric := 0;
  v_threshold   numeric;
begin
  if v_user_id is null then return false; end if;
  select * into v_profile from public.skyline_profiles where user_id = v_user_id;
  if not found then return false; end if;

  -- Calcul actifs (cash + valo entreprises + équipement + stocks + bourse).
  v_assets := v_profile.cash;
  -- Valeur des entreprises = trésorerie + (revenus mensuels × 6).
  v_assets := v_assets + coalesce(
    (select sum(cash + monthly_revenue * 6) from public.skyline_companies where user_id = v_user_id),
    0
  );
  -- Stocks valorisés au prix d'achat.
  v_assets := v_assets + coalesce(
    (select sum(quantity * avg_buy_price) from public.skyline_inventory inv
       inner join public.skyline_companies c on c.id = inv.company_id
       where c.user_id = v_user_id),
    0
  );
  -- Locaux possédés (100× loyer mensuel).
  v_assets := v_assets + coalesce(
    (select sum(public.skyline_local_purchase_cost(district, local_size))
       from public.skyline_companies
       where user_id = v_user_id and is_owned = true),
    0
  );

  -- Mise à jour du patrimoine cached.
  update public.skyline_profiles
    set net_worth = v_assets, updated_at = now()
    where user_id = v_user_id;

  v_threshold := -0.1 * v_assets;
  if v_profile.cash < v_threshold then
    if not v_profile.bankruptcy_pending then
      update public.skyline_profiles
        set bankruptcy_pending = true,
            bankruptcy_started_at = now(),
            updated_at = now()
        where user_id = v_user_id;
    end if;
    return true;
  else
    if v_profile.bankruptcy_pending then
      update public.skyline_profiles
        set bankruptcy_pending = false,
            bankruptcy_started_at = null,
            updated_at = now()
        where user_id = v_user_id;
    end if;
    return false;
  end if;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 18. P5 — USINES, MACHINES, MATIÈRES PREMIÈRES, PRODUCTION
-- ══════════════════════════════════════════════════════════════════════

-- Prix de référence d'une matière première (achetable au marché de gros PNJ
-- tant que les fermes/mines joueurs n'existent pas, P8).
create or replace function public.skyline_raw_material_ref_buy(p_material_id text)
returns numeric language sql immutable as $$
  select case p_material_id
    when 'wheat'         then 0.20
    when 'barley'        then 0.25
    when 'hops'          then 0.50
    when 'grapes'        then 0.80
    when 'cattle'        then 50.0
    when 'milk'          then 0.40
    when 'fruits'        then 0.60
    when 'vegetables'    then 0.40
    when 'salt'          then 0.10
    when 'sugar'         then 0.30
    when 'cocoa'         then 1.20
    when 'coffee'        then 1.50
    when 'cotton'        then 0.80
    when 'wool'          then 1.50
    when 'wood'          then 0.30
    when 'iron'          then 0.80
    when 'copper'        then 1.20
    when 'aluminum'      then 1.50
    when 'gold'          then 50
    when 'silver'        then 5
    when 'gemstones'     then 200
    when 'coal'          then 0.20
    when 'oil'           then 0.50
    when 'flowers'       then 0.30
    when 'plants_med'    then 1.00
    else null
  end;
$$;

-- Pour chaque secteur usine, retourne (input1, input2 ou null, output, ratio_in1, ratio_in2, ratio_out).
-- Ex : moulin = 1 unité de blé → 1 unité de farine. Boulangerie indus = 0.5 farine + 0.005 sel → 1 baguette.
-- On stocke en jsonb : { in1: { id, qty }, in2: { id, qty } | null, out: { id, qty } }
create or replace function public.skyline_factory_recipe(p_sector text)
returns jsonb language sql immutable as $$
  select case p_sector
    -- Moulin : blé → farine
    when 'moulin' then jsonb_build_object(
      'in1', jsonb_build_object('id', 'wheat', 'qty', 1.0),
      'in2', null,
      'out', jsonb_build_object('id', 'farine', 'qty', 0.95)
    )
    -- Boulangerie industrielle : farine + sel → pain emballé
    when 'boulangerie_indus' then jsonb_build_object(
      'in1', jsonb_build_object('id', 'farine', 'qty', 0.5),
      'in2', jsonb_build_object('id', 'salt', 'qty', 0.01),
      'out', jsonb_build_object('id', 'pain_emballe', 'qty', 1.0)
    )
    -- Brasserie : orge + houblon → bière
    when 'brasserie' then jsonb_build_object(
      'in1', jsonb_build_object('id', 'barley', 'qty', 0.4),
      'in2', jsonb_build_object('id', 'hops', 'qty', 0.05),
      'out', jsonb_build_object('id', 'biere_blonde', 'qty', 1.0)
    )
    -- Domaine viticole : raisins → vin (1 input simplifié)
    when 'viticole' then jsonb_build_object(
      'in1', jsonb_build_object('id', 'grapes', 'qty', 1.5),
      'in2', null,
      'out', jsonb_build_object('id', 'vin_rouge', 'qty', 1.0)
    )
    -- Distillerie : céréales + fruits → spiritueux
    when 'distillerie' then jsonb_build_object(
      'in1', jsonb_build_object('id', 'wheat', 'qty', 0.8),
      'in2', jsonb_build_object('id', 'fruits', 'qty', 0.3),
      'out', jsonb_build_object('id', 'spiritueux', 'qty', 1.0)
    )
    -- Abattoir : bétail + sel → viandes
    when 'abattoir' then jsonb_build_object(
      'in1', jsonb_build_object('id', 'cattle', 'qty', 0.05),
      'in2', jsonb_build_object('id', 'salt', 'qty', 0.02),
      'out', jsonb_build_object('id', 'steak', 'qty', 1.0)
    )
    -- Laiterie : lait + sel → fromages
    when 'laiterie' then jsonb_build_object(
      'in1', jsonb_build_object('id', 'milk', 'qty', 1.5),
      'in2', jsonb_build_object('id', 'salt', 'qty', 0.01),
      'out', jsonb_build_object('id', 'fromage', 'qty', 1.0)
    )
    -- Chocolaterie : cacao + sucre → chocolat
    when 'chocolaterie' then jsonb_build_object(
      'in1', jsonb_build_object('id', 'cocoa', 'qty', 0.5),
      'in2', jsonb_build_object('id', 'sugar', 'qty', 0.3),
      'out', jsonb_build_object('id', 'chocolat_noir', 'qty', 1.0)
    )
    -- Conserverie : légumes + sel → conserves
    when 'conserverie' then jsonb_build_object(
      'in1', jsonb_build_object('id', 'vegetables', 'qty', 1.0),
      'in2', jsonb_build_object('id', 'salt', 'qty', 0.05),
      'out', jsonb_build_object('id', 'conserve', 'qty', 1.0)
    )
    else null
  end;
$$;

-- Coût et capacité d'une machine (kind = secteur, level = basic/pro/elite/hightech).
create or replace function public.skyline_machine_spec(p_kind text, p_level text)
returns jsonb language sql immutable as $$
  select case p_kind || '/' || p_level
    -- Moulin
    when 'moulin/basic'    then jsonb_build_object('cost', 8000,    'capacity', 200,    'name', 'Moulin manuel')
    when 'moulin/pro'      then jsonb_build_object('cost', 30000,   'capacity', 1000,   'name', 'Moulin électrique')
    when 'moulin/elite'    then jsonb_build_object('cost', 120000,  'capacity', 5000,   'name', 'Moulin industriel')
    when 'moulin/hightech' then jsonb_build_object('cost', 500000,  'capacity', 20000,  'name', 'Moulin auto IA')
    -- Boulangerie indus
    when 'boulangerie_indus/basic'    then jsonb_build_object('cost', 20000,  'capacity', 500,   'name', 'Four industriel basique')
    when 'boulangerie_indus/pro'      then jsonb_build_object('cost', 80000,  'capacity', 2500,  'name', 'Four industriel pro')
    when 'boulangerie_indus/elite'    then jsonb_build_object('cost', 250000, 'capacity', 10000, 'name', 'Four tunnel automatisé')
    when 'boulangerie_indus/hightech' then jsonb_build_object('cost', 800000, 'capacity', 40000, 'name', 'Ligne robotisée IA')
    -- Brasserie
    when 'brasserie/basic'    then jsonb_build_object('cost', 30000,  'capacity', 800,   'name', 'Cuve brassage 1000L')
    when 'brasserie/pro'      then jsonb_build_object('cost', 100000, 'capacity', 4000,  'name', 'Brasserie semi-industrielle')
    when 'brasserie/elite'    then jsonb_build_object('cost', 400000, 'capacity', 15000, 'name', 'Brasserie industrielle')
    when 'brasserie/hightech' then jsonb_build_object('cost', 1500000,'capacity', 60000, 'name', 'Méga-brasserie auto')
    -- Viticole
    when 'viticole/basic'    then jsonb_build_object('cost', 15000,  'capacity', 300,   'name', 'Pressoir manuel')
    when 'viticole/pro'      then jsonb_build_object('cost', 60000,  'capacity', 1500,  'name', 'Pressoir pneumatique')
    when 'viticole/elite'    then jsonb_build_object('cost', 200000, 'capacity', 6000,  'name', 'Chai industriel')
    when 'viticole/hightech' then jsonb_build_object('cost', 800000, 'capacity', 25000, 'name', 'Chai automatisé IA')
    -- Distillerie
    when 'distillerie/basic'    then jsonb_build_object('cost', 25000,  'capacity', 400,   'name', 'Alambic artisanal')
    when 'distillerie/pro'      then jsonb_build_object('cost', 100000, 'capacity', 2000,  'name', 'Colonne distillation')
    when 'distillerie/elite'    then jsonb_build_object('cost', 350000, 'capacity', 8000,  'name', 'Distillerie industrielle')
    when 'distillerie/hightech' then jsonb_build_object('cost', 1200000,'capacity', 30000, 'name', 'Distillerie auto')
    -- Abattoir
    when 'abattoir/basic'    then jsonb_build_object('cost', 50000,  'capacity', 100,   'name', 'Atelier de découpe')
    when 'abattoir/pro'      then jsonb_build_object('cost', 200000, 'capacity', 500,   'name', 'Abattoir semi-indus')
    when 'abattoir/elite'    then jsonb_build_object('cost', 800000, 'capacity', 2000,  'name', 'Abattoir industriel')
    when 'abattoir/hightech' then jsonb_build_object('cost', 3000000,'capacity', 8000,  'name', 'Abattoir auto IA')
    -- Laiterie
    when 'laiterie/basic'    then jsonb_build_object('cost', 20000,  'capacity', 400,   'name', 'Atelier laitier')
    when 'laiterie/pro'      then jsonb_build_object('cost', 80000,  'capacity', 2000,  'name', 'Laiterie semi-indus')
    when 'laiterie/elite'    then jsonb_build_object('cost', 300000, 'capacity', 8000,  'name', 'Laiterie industrielle')
    when 'laiterie/hightech' then jsonb_build_object('cost', 1000000,'capacity', 30000, 'name', 'Laiterie auto IA')
    -- Chocolaterie
    when 'chocolaterie/basic'    then jsonb_build_object('cost', 15000,  'capacity', 300,   'name', 'Atelier chocolatier')
    when 'chocolaterie/pro'      then jsonb_build_object('cost', 60000,  'capacity', 1500,  'name', 'Chocolaterie semi-indus')
    when 'chocolaterie/elite'    then jsonb_build_object('cost', 200000, 'capacity', 6000,  'name', 'Chocolaterie industrielle')
    when 'chocolaterie/hightech' then jsonb_build_object('cost', 700000, 'capacity', 25000, 'name', 'Chocolaterie auto IA')
    -- Conserverie
    when 'conserverie/basic'    then jsonb_build_object('cost', 30000,  'capacity', 500,   'name', 'Ligne conserve basique')
    when 'conserverie/pro'      then jsonb_build_object('cost', 120000, 'capacity', 2500,  'name', 'Ligne conserve pro')
    when 'conserverie/elite'    then jsonb_build_object('cost', 400000, 'capacity', 10000, 'name', 'Conserverie industrielle')
    when 'conserverie/hightech' then jsonb_build_object('cost', 1500000,'capacity', 40000, 'name', 'Conserverie auto IA')
    else null
  end;
$$;

-- Acheter une machine pour une usine.
create or replace function public.skyline_buy_machine(
  p_company_id uuid,
  p_kind       text,
  p_level      text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_spec    jsonb;
  v_cost    numeric;
  v_cap     int;
  v_id      uuid;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if not exists (
    select 1 from public.skyline_companies
    where id = p_company_id and user_id = v_user_id and category = 'factory'
  ) then raise exception 'Pas une usine ou pas trouvée'; end if;

  v_spec := public.skyline_machine_spec(p_kind, p_level);
  if v_spec is null then raise exception 'Machine inconnue'; end if;

  v_cost := (v_spec->>'cost')::numeric;
  v_cap := (v_spec->>'capacity')::int;

  declare v_user_cash numeric;
  begin
    select cash into v_user_cash from public.skyline_profiles where user_id = v_user_id;
    if v_user_cash < v_cost then
      raise exception 'Cash insuffisant : il te manque % $', round(v_cost - v_user_cash, 2);
    end if;
  end;

  update public.skyline_profiles
    set cash = cash - v_cost, updated_at = now()
    where user_id = v_user_id;

  insert into public.skyline_machines (company_id, kind, level, cost, capacity_per_day)
  values (p_company_id, p_kind, p_level, v_cost, v_cap)
  returning id into v_id;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'equipment', -v_cost,
    'Machine : ' || (v_spec->>'name'));

  return v_id;
end;
$$;

-- Achat de matière première au marché de gros (équivalent skyline_purchase_stock pour matières).
-- Utilise le même inventaire (skyline_inventory) car c'est la même structure.
create or replace function public.skyline_purchase_raw_material(
  p_company_id  uuid,
  p_material_id text,
  p_quantity    int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_unit_price   numeric;
  v_total_cost   numeric;
  v_existing_qty int;
  v_existing_avg numeric;
  v_new_avg      numeric;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if p_quantity <= 0 then raise exception 'Quantité invalide'; end if;
  if not exists (
    select 1 from public.skyline_companies
    where id = p_company_id and user_id = v_user_id
  ) then raise exception 'Entreprise non trouvée'; end if;

  v_unit_price := public.skyline_raw_material_ref_buy(p_material_id);
  if v_unit_price is null then raise exception 'Matière inconnue'; end if;

  v_total_cost := v_unit_price * p_quantity;

  declare v_user_cash numeric;
  begin
    select cash into v_user_cash from public.skyline_profiles where user_id = v_user_id;
    if v_user_cash < v_total_cost then
      raise exception 'Cash insuffisant : il te manque % $', round(v_total_cost - v_user_cash, 2);
    end if;
  end;

  update public.skyline_profiles
    set cash = cash - v_total_cost, updated_at = now()
    where user_id = v_user_id;

  select quantity, avg_buy_price
    into v_existing_qty, v_existing_avg
    from public.skyline_inventory
    where company_id = p_company_id and product_id = p_material_id;

  if not found then
    insert into public.skyline_inventory (company_id, product_id, quantity, avg_buy_price, sell_price, purchased_at)
    values (p_company_id, p_material_id, p_quantity, v_unit_price, 0, now());
  else
    v_new_avg := (v_existing_qty * v_existing_avg + p_quantity * v_unit_price) / (v_existing_qty + p_quantity);
    update public.skyline_inventory
      set quantity = quantity + p_quantity,
          avg_buy_price = v_new_avg,
          purchased_at = now()
      where company_id = p_company_id and product_id = p_material_id;
  end if;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'purchase', -v_total_cost,
    'Matière 1ère ' || p_quantity || '× ' || p_material_id || ' à ' || v_unit_price || '$');
end;
$$;

-- Production usine (déclenchée par le tick) : consomme matières → produit finis.
-- Capacité = somme(machines.capacity_per_day) × heures_écoulées / 24.
-- Limitée par stock de matières dispo.
create or replace function public.skyline_factory_produce(p_company_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company   public.skyline_companies%rowtype;
  v_user_id   uuid := auth.uid();
  v_recipe    jsonb;
  v_in1_id    text;
  v_in1_qty   numeric;
  v_in2_id    text;
  v_in2_qty   numeric;
  v_out_id    text;
  v_out_qty   numeric;
  v_total_cap int;
  v_now       timestamptz := now();
  v_elapsed_h numeric;
  v_cap_window int;
  v_inv1_qty  int;
  v_inv2_qty  int;
  v_max_units int;
  v_units_to_produce int;
  v_cost_avg  numeric;
  v_existing_qty int;
  v_existing_avg numeric;
  v_new_avg   numeric;
begin
  select * into v_company from public.skyline_companies where id = p_company_id;
  if not found or v_company.user_id <> v_user_id then return 0; end if;
  if v_company.category <> 'factory' then return 0; end if;

  v_recipe := public.skyline_factory_recipe(v_company.sector);
  if v_recipe is null then return 0; end if;

  v_in1_id := v_recipe->'in1'->>'id';
  v_in1_qty := (v_recipe->'in1'->>'qty')::numeric;
  if v_recipe->'in2' is not null then
    v_in2_id := v_recipe->'in2'->>'id';
    v_in2_qty := (v_recipe->'in2'->>'qty')::numeric;
  end if;
  v_out_id := v_recipe->'out'->>'id';
  v_out_qty := (v_recipe->'out'->>'qty')::numeric;

  -- Capacité totale machines.
  select coalesce(sum(capacity_per_day), 0) into v_total_cap
  from public.skyline_machines where company_id = p_company_id;
  if v_total_cap = 0 then return 0; end if;

  v_elapsed_h := extract(epoch from (v_now - v_company.last_tick_at)) / 3600.0;
  if v_elapsed_h <= 0 then return 0; end if;
  v_cap_window := floor(v_total_cap * v_elapsed_h / 24.0)::int;
  if v_cap_window <= 0 then return 0; end if;

  -- Inventaire matières dispo.
  select coalesce(quantity, 0) into v_inv1_qty
    from public.skyline_inventory where company_id = p_company_id and product_id = v_in1_id;
  v_inv1_qty := coalesce(v_inv1_qty, 0);
  v_inv2_qty := 9999999;
  if v_in2_id is not null then
    select coalesce(quantity, 0) into v_inv2_qty
      from public.skyline_inventory where company_id = p_company_id and product_id = v_in2_id;
    v_inv2_qty := coalesce(v_inv2_qty, 0);
  end if;

  -- Limite par matière.
  v_max_units := least(
    v_cap_window,
    floor(v_inv1_qty / v_in1_qty)::int,
    case when v_in2_id is not null then floor(v_inv2_qty / v_in2_qty)::int else v_cap_window end
  );
  if v_max_units <= 0 then return 0; end if;

  v_units_to_produce := v_max_units;

  -- Calcul prix de revient moyen pour avg_buy_price du produit fini.
  v_cost_avg :=
    coalesce((select avg_buy_price from public.skyline_inventory
              where company_id = p_company_id and product_id = v_in1_id), 0) * v_in1_qty
    + case when v_in2_id is not null then
        coalesce((select avg_buy_price from public.skyline_inventory
                  where company_id = p_company_id and product_id = v_in2_id), 0) * v_in2_qty
      else 0 end;
  -- Diviser par output qty pour avoir le coût par unité produite.
  if v_out_qty > 0 then v_cost_avg := v_cost_avg / v_out_qty; end if;

  -- Consommer matières.
  update public.skyline_inventory
    set quantity = quantity - floor(v_units_to_produce * v_in1_qty)::int
    where company_id = p_company_id and product_id = v_in1_id;
  if v_in2_id is not null then
    update public.skyline_inventory
      set quantity = quantity - floor(v_units_to_produce * v_in2_qty)::int
      where company_id = p_company_id and product_id = v_in2_id;
  end if;

  -- Ajouter à l'inventaire produit fini (avg pondéré).
  select quantity, avg_buy_price into v_existing_qty, v_existing_avg
    from public.skyline_inventory
    where company_id = p_company_id and product_id = v_out_id;
  if not found then
    v_existing_qty := 0;
    v_existing_avg := 0;
  end if;
  v_new_avg := case
    when v_existing_qty + v_units_to_produce <= 0 then v_cost_avg
    else (v_existing_qty * v_existing_avg + v_units_to_produce * v_cost_avg)
         / (v_existing_qty + v_units_to_produce)
  end;

  if v_existing_qty = 0 and v_existing_avg = 0 then
    insert into public.skyline_inventory (company_id, product_id, quantity, avg_buy_price, sell_price, purchased_at)
    values (p_company_id, v_out_id, v_units_to_produce, v_new_avg,
      coalesce(public.skyline_product_ref_sell(v_out_id), v_cost_avg * 1.5),
      now())
    on conflict (company_id, product_id) do update
      set quantity = public.skyline_inventory.quantity + v_units_to_produce,
          avg_buy_price = (public.skyline_inventory.quantity * public.skyline_inventory.avg_buy_price + excluded.quantity * excluded.avg_buy_price)
                          / (public.skyline_inventory.quantity + excluded.quantity);
  else
    update public.skyline_inventory
      set quantity = quantity + v_units_to_produce,
          avg_buy_price = v_new_avg
      where company_id = p_company_id and product_id = v_out_id;
  end if;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'other', 0,
    'Production : ' || v_units_to_produce || '× ' || v_out_id);

  return v_units_to_produce;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 19. P6 — MARCHÉ COMMUN : COURS, ORDRES, ÉVÉNEMENTS, FIL D'ACTU
-- ══════════════════════════════════════════════════════════════════════

-- Liste des produits qui ont un cours public (mis à jour dynamiquement).
-- On seed avec tous les produits ref + matières.
create or replace function public.skyline_seed_market_courses()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_products text[] := array[
    -- Produits commerce
    'baguette', 'croissant', 'pain_au_chocolat', 'tarte_pommes',
    'vin_rouge', 'vin_blanc', 'biere_blonde', 'champagne',
    'steak', 'saucisson', 'jambon', 'rotisserie_poulet',
    'pizza_margherita', 'pizza_4_fromages', 'tiramisu',
    'burger_classique', 'frites', 'nuggets',
    'cafe_expresso', 'cappuccino', 'biere_pression', 'soda',
    'bouquet_roses', 'bouquet_mixte', 'plante_verte', 'orchidee',
    'chocolat_noir', 'huile_olive', 'miel', 'confiture',
    'pates', 'yaourt', 'lait', 'biscuits',
    'tshirt_basic', 'jean', 'pull', 'robe',
    'bague_argent', 'collier_or', 'montre_classique', 'bracelet',
    'paracetamol', 'creme_hydratante', 'vitamines', 'shampoing',
    'parfum_femme', 'parfum_homme', 'creme_visage', 'rouge_levres',
    -- Produits usine
    'farine', 'pain_emballe', 'fromage', 'spiritueux', 'conserve',
    -- Matières premières
    'wheat', 'barley', 'hops', 'grapes', 'cattle', 'milk',
    'fruits', 'vegetables', 'salt', 'sugar', 'cocoa', 'coffee',
    'cotton', 'wool', 'wood', 'iron', 'copper', 'aluminum',
    'gold', 'silver', 'gemstones', 'coal', 'oil', 'flowers', 'plants_med'
  ];
  v_p text;
  v_ref numeric;
begin
  foreach v_p in array v_products loop
    v_ref := coalesce(
      public.skyline_product_ref_buy(v_p),
      public.skyline_raw_material_ref_buy(v_p),
      0
    );
    if v_ref <= 0 then continue; end if;

    insert into public.skyline_market_courses (
      product_id, current_price, ref_price, trend_24h, volume_24h, high_30d, low_30d
    )
    values (v_p, v_ref, v_ref, 0, 0, v_ref, v_ref)
    on conflict (product_id) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Tick global du marché : applique drift aléatoire + effets événements actifs.
create or replace function public.skyline_tick_market()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course record;
  v_drift  numeric;
  v_event_impact numeric;
  v_new_price numeric;
  v_count int := 0;
begin
  for v_course in select * from public.skyline_market_courses loop
    -- Drift aléatoire ±2%.
    v_drift := (random() - 0.5) * 0.04;

    -- Impact des événements actifs sur ce produit.
    select coalesce(sum(impact_pct), 0) / 100.0 into v_event_impact
      from public.skyline_events
      where ends_at > now()
        and (
          (scope = 'product' and target = v_course.product_id) or
          (scope = 'global')
        );

    v_new_price := v_course.current_price * (1 + v_drift + v_event_impact * 0.02);
    -- Réversion vers le prix de référence (10% pull).
    v_new_price := v_new_price * 0.95 + v_course.ref_price * 0.05;
    v_new_price := greatest(v_course.ref_price * 0.3, least(v_course.ref_price * 3.0, v_new_price));

    update public.skyline_market_courses
      set current_price = v_new_price,
          trend_24h = ((v_new_price - v_course.current_price) / v_course.current_price) * 100,
          high_30d = greatest(high_30d, v_new_price),
          low_30d = least(low_30d, v_new_price),
          updated_at = now()
      where product_id = v_course.product_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Génère un événement aléatoire (pénurie, tendance, scandale, saisonnier, réglementation, npc_announce).
create or replace function public.skyline_generate_event()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id        uuid;
  v_kinds     text[] := array['shortage', 'trend', 'scandal', 'season', 'regulation', 'npc_announce'];
  v_kind      text;
  v_targets   text[];
  v_target    text;
  v_impact    numeric;
  v_headline  text;
  v_body      text;
  v_duration  interval;
begin
  v_kind := v_kinds[1 + floor(random() * array_length(v_kinds, 1))::int];

  -- Choix du produit cible aléatoire.
  v_targets := array(select product_id from public.skyline_market_courses order by random() limit 1);
  if array_length(v_targets, 1) is null then return null; end if;
  v_target := v_targets[1];

  case v_kind
    when 'shortage' then
      v_impact := 20 + random() * 30; -- +20 à +50%
      v_headline := '🌾 Pénurie sur le marché du ' || v_target;
      v_body := 'Une rupture d''approvisionnement fait grimper les cours. Les analystes anticipent une hausse de prix soutenue dans les semaines à venir.';
      v_duration := '60 hours'; -- 2 mois jeu
    when 'trend' then
      v_impact := 15 + random() * 25;
      v_headline := '📈 Tendance haussière : ' || v_target;
      v_body := 'Effet de mode constaté chez les consommateurs. La demande explose, les acteurs du secteur s''emballent.';
      v_duration := '45 hours';
    when 'scandal' then
      v_impact := -(20 + random() * 30); -- -20 à -50%
      v_headline := '⚠️ Scandale autour du ' || v_target;
      v_body := 'Une enquête révèle des problèmes sanitaires. Les consommateurs boycottent, les cours s''effondrent.';
      v_duration := '40 hours';
    when 'season' then
      v_impact := (case when random() > 0.5 then 1 else -1 end) * (10 + random() * 15);
      v_headline := '🍂 Effet saisonnier sur ' || v_target;
      v_body := 'La saison influence la demande. Variations attendues dans les prochains jours.';
      v_duration := '30 hours';
    when 'regulation' then
      v_impact := (case when random() > 0.5 then 1 else -1 end) * (10 + random() * 20);
      v_headline := '📜 Nouvelle réglementation : ' || v_target;
      v_body := 'Une décision réglementaire bouleverse le marché. Les acteurs doivent s''adapter.';
      v_duration := '50 hours';
    else -- npc_announce
      v_impact := 10 + random() * 20;
      v_headline := (select name from public.skyline_npc_corp order by random() limit 1) ||
                    ' annonce une expansion sur ' || v_target;
      v_body := 'Le géant industriel investit massivement. Le secteur attend de voir l''impact à moyen terme.';
      v_duration := '70 hours';
  end case;

  insert into public.skyline_events (
    kind, scope, target, headline, body, impact_pct, ends_at, announced
  )
  values (
    v_kind, 'product', v_target, v_headline, v_body, v_impact,
    now() + v_duration, true
  )
  returning id into v_id;

  insert into public.skyline_news (kind, headline, body, product_id, impact_pct)
  values (v_kind, v_headline, v_body, v_target, v_impact);

  return v_id;
end;
$$;

-- Wrapper public : si moins de 3 événements actifs, en génère un + tick le marché.
create or replace function public.skyline_market_heartbeat()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_events int;
begin
  -- Seed courses si nécessaire.
  if (select count(*) from public.skyline_market_courses) < 50 then
    perform public.skyline_seed_market_courses();
  end if;

  -- Génère événement si peu actifs.
  select count(*) into v_active_events
    from public.skyline_events where ends_at > now();
  if v_active_events < 3 then
    perform public.skyline_generate_event();
  end if;

  -- Drift les cours.
  perform public.skyline_tick_market();
end;
$$;

-- Place un ordre B2B au prix marché courant (achat ou vente).
create or replace function public.skyline_place_market_order(
  p_company_id uuid,
  p_side       text, -- 'buy' ou 'sell'
  p_product_id text,
  p_quantity   int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_company    public.skyline_companies%rowtype;
  v_price      numeric;
  v_total      numeric;
  v_inv_qty    int;
  v_existing_qty int;
  v_existing_avg numeric;
  v_user_cash  numeric;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if p_quantity <= 0 then raise exception 'Quantité invalide'; end if;
  if p_side not in ('buy', 'sell') then raise exception 'Side invalide'; end if;

  select * into v_company from public.skyline_companies
    where id = p_company_id and user_id = v_user_id;
  if not found then raise exception 'Entreprise non trouvée'; end if;

  -- Prix marché courant.
  select current_price into v_price
    from public.skyline_market_courses
    where product_id = p_product_id;
  if v_price is null then raise exception 'Produit non coté'; end if;

  v_total := v_price * p_quantity;

  if p_side = 'buy' then
    select cash into v_user_cash from public.skyline_profiles where user_id = v_user_id;
    if v_user_cash < v_total then raise exception 'Cash insuffisant'; end if;

    update public.skyline_profiles
      set cash = cash - v_total, updated_at = now()
      where user_id = v_user_id;

    select quantity, avg_buy_price into v_existing_qty, v_existing_avg
      from public.skyline_inventory
      where company_id = p_company_id and product_id = p_product_id;
    if not found then
      insert into public.skyline_inventory (company_id, product_id, quantity, avg_buy_price, sell_price, purchased_at)
      values (p_company_id, p_product_id, p_quantity, v_price, v_price * 1.4, now());
    else
      update public.skyline_inventory
        set quantity = quantity + p_quantity,
            avg_buy_price = (v_existing_qty * v_existing_avg + p_quantity * v_price) / (v_existing_qty + p_quantity),
            purchased_at = now()
        where company_id = p_company_id and product_id = p_product_id;
    end if;

    -- Achat → cours monte légèrement (volume).
    update public.skyline_market_courses
      set current_price = current_price * (1 + 0.001 * p_quantity / 1000.0),
          volume_24h = volume_24h + p_quantity,
          updated_at = now()
      where product_id = p_product_id;

    insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
    values (v_user_id, p_company_id, 'purchase', -v_total,
      'Marché : achat ' || p_quantity || '× ' || p_product_id || ' à ' || v_price || '$');
  else
    -- Vente : check qu'on a le stock.
    select quantity into v_inv_qty
      from public.skyline_inventory
      where company_id = p_company_id and product_id = p_product_id;
    if coalesce(v_inv_qty, 0) < p_quantity then
      raise exception 'Stock insuffisant : tu as % unités', coalesce(v_inv_qty, 0);
    end if;

    update public.skyline_inventory
      set quantity = quantity - p_quantity
      where company_id = p_company_id and product_id = p_product_id;

    update public.skyline_profiles
      set cash = cash + v_total, updated_at = now()
      where user_id = v_user_id;

    -- Vente → cours baisse légèrement.
    update public.skyline_market_courses
      set current_price = current_price * (1 - 0.001 * p_quantity / 1000.0),
          volume_24h = volume_24h + p_quantity,
          updated_at = now()
      where product_id = p_product_id;

    insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
    values (v_user_id, p_company_id, 'sale', v_total,
      'Marché : vente ' || p_quantity || '× ' || p_product_id || ' à ' || v_price || '$');
  end if;

  return jsonb_build_object(
    'price', v_price,
    'total', v_total,
    'quantity', p_quantity
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 20. TICK ENRICHI P5 (production usines)
-- ══════════════════════════════════════════════════════════════════════

-- Wrapper qui appelle factory_produce ou process_sales selon la catégorie.
-- À appeler à chaque lecture d'une entreprise.
create or replace function public.skyline_tick_company_full(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat text;
begin
  select category into v_cat from public.skyline_companies where id = p_company_id;
  if v_cat is null then return; end if;

  perform public.skyline_tick_company(p_company_id);

  if v_cat = 'commerce' then
    perform public.skyline_process_sales(p_company_id);
  elsif v_cat = 'factory' then
    perform public.skyline_factory_produce(p_company_id);
  elsif v_cat = 'raw' then
    perform public.skyline_raw_extract(p_company_id);
  end if;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 21. P7 — BOURSE : IPO, ORDRES, TICK COURS, DIVIDENDES
-- ══════════════════════════════════════════════════════════════════════

-- Calcule la valorisation d'une entreprise (basée sur cash + revenus mensuels × 12).
create or replace function public.skyline_company_valuation(p_company_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company public.skyline_companies%rowtype;
  v_inv_value numeric;
  v_machines_value numeric;
  v_furniture_value numeric;
begin
  select * into v_company from public.skyline_companies where id = p_company_id;
  if not found then return 0; end if;

  select coalesce(sum(quantity * avg_buy_price), 0) into v_inv_value
    from public.skyline_inventory where company_id = p_company_id;
  select coalesce(sum(cost), 0) into v_machines_value
    from public.skyline_machines where company_id = p_company_id;
  select coalesce(sum(public.skyline_furniture_cost(kind)), 0) into v_furniture_value
    from public.skyline_furniture where company_id = p_company_id;

  -- Cash + 12 mois de revenus + actifs.
  return v_company.cash + v_company.monthly_revenue * 12 + v_inv_value
         + v_machines_value + v_furniture_value;
end;
$$;

-- Introduit l'entreprise en bourse (IPO).
-- Min valorisation 5M$. Le joueur garde X% des actions, vend (100-X)% au prix d'introduction.
create or replace function public.skyline_ipo_company(
  p_company_id  uuid,
  p_total_shares bigint,
  p_keep_pct    numeric -- % d'actions que le joueur conserve (ex 60 = 60%)
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_company   public.skyline_companies%rowtype;
  v_valuation numeric;
  v_ipo_price numeric;
  v_market_cap numeric;
  v_share_id  uuid;
  v_keep_shares bigint;
  v_sold_shares bigint;
  v_proceeds  numeric;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  select * into v_company from public.skyline_companies
    where id = p_company_id and user_id = v_user_id;
  if not found then raise exception 'Entreprise non trouvée'; end if;

  if exists (select 1 from public.skyline_company_shares where company_id = p_company_id) then
    raise exception 'Déjà en bourse';
  end if;

  if p_total_shares <= 0 or p_keep_pct < 30 or p_keep_pct > 90 then
    raise exception 'Paramètres invalides (actions > 0, garde 30-90%%)';
  end if;

  v_valuation := public.skyline_company_valuation(p_company_id);
  if v_valuation < 5000000 then
    raise exception 'Valorisation insuffisante : il faut > 5M$ (actuellement % $)', round(v_valuation);
  end if;

  v_ipo_price := round(v_valuation / p_total_shares, 2);
  v_market_cap := v_ipo_price * p_total_shares;

  -- Le joueur garde keep_pct%, le reste est vendu sur le marché → cash pour la boîte.
  v_keep_shares := floor(p_total_shares * p_keep_pct / 100);
  v_sold_shares := p_total_shares - v_keep_shares;
  v_proceeds := v_sold_shares * v_ipo_price;

  insert into public.skyline_company_shares (
    company_id, total_shares, ipo_price, current_price, market_cap, ipo_at, is_listed
  )
  values (
    p_company_id, p_total_shares, v_ipo_price, v_ipo_price, v_market_cap, now(), true
  )
  returning id into v_share_id;

  -- Holding du fondateur.
  insert into public.skyline_share_holdings (user_id, company_id, shares, avg_buy_price)
  values (v_user_id, p_company_id, v_keep_shares, v_ipo_price);

  -- Cash de l'IPO crédité au profil utilisateur (le founder reçoit la trésorerie).
  update public.skyline_profiles
    set cash = cash + v_proceeds, updated_at = now()
    where user_id = v_user_id;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'other', v_proceeds,
    'IPO ' || v_company.name || ' : ' || v_sold_shares || ' actions vendues à ' || v_ipo_price || '$ = ' || v_proceeds || '$');

  -- News : annonce IPO.
  insert into public.skyline_news (kind, headline, body, sector, impact_pct)
  values ('npc_announce',
    '📈 IPO : ' || v_company.name || ' entre en bourse',
    v_company.name || ' (' || v_company.sector || ') s''introduit à ' || v_ipo_price || '$ par action. Capitalisation : ' || round(v_market_cap) || '$.',
    v_company.sector, 0);

  return v_share_id;
end;
$$;

-- Place un ordre d'achat ou vente d'actions au cours marché.
create or replace function public.skyline_place_share_order(
  p_company_id uuid,
  p_side       text, -- 'buy' ou 'sell'
  p_quantity   bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_share     public.skyline_company_shares%rowtype;
  v_price     numeric;
  v_total     numeric;
  v_holding   public.skyline_share_holdings%rowtype;
  v_existing_qty bigint;
  v_existing_avg numeric;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if p_quantity <= 0 then raise exception 'Quantité invalide'; end if;
  if p_side not in ('buy', 'sell') then raise exception 'Side invalide'; end if;

  select * into v_share from public.skyline_company_shares
    where company_id = p_company_id and is_listed = true;
  if not found then raise exception 'Entreprise non cotée'; end if;

  v_price := v_share.current_price;
  v_total := v_price * p_quantity;

  if p_side = 'buy' then
    declare v_user_cash numeric;
    begin
      select cash into v_user_cash from public.skyline_profiles where user_id = v_user_id;
      if v_user_cash < v_total then raise exception 'Cash insuffisant'; end if;
    end;

    update public.skyline_profiles
      set cash = cash - v_total, updated_at = now()
      where user_id = v_user_id;

    select * into v_holding from public.skyline_share_holdings
      where user_id = v_user_id and company_id = p_company_id;
    if not found then
      insert into public.skyline_share_holdings (user_id, company_id, shares, avg_buy_price)
      values (v_user_id, p_company_id, p_quantity, v_price);
    else
      update public.skyline_share_holdings
        set shares = shares + p_quantity,
            avg_buy_price = (shares * avg_buy_price + p_quantity * v_price) / (shares + p_quantity)
        where user_id = v_user_id and company_id = p_company_id;
    end if;

    -- Achat → cours monte (volume).
    update public.skyline_company_shares
      set current_price = current_price * (1 + 0.0005 * p_quantity / nullif(total_shares, 0)),
          market_cap = current_price * total_shares
      where company_id = p_company_id;
  else
    -- Vente : check qu'on a les actions.
    select * into v_holding from public.skyline_share_holdings
      where user_id = v_user_id and company_id = p_company_id;
    if not found or v_holding.shares < p_quantity then
      raise exception 'Actions insuffisantes (tu en as %)', coalesce(v_holding.shares, 0);
    end if;

    update public.skyline_share_holdings
      set shares = shares - p_quantity
      where user_id = v_user_id and company_id = p_company_id;

    -- Si plus d'actions, on supprime la ligne.
    delete from public.skyline_share_holdings
      where user_id = v_user_id and company_id = p_company_id and shares = 0;

    update public.skyline_profiles
      set cash = cash + v_total, updated_at = now()
      where user_id = v_user_id;

    update public.skyline_company_shares
      set current_price = current_price * (1 - 0.0005 * p_quantity / nullif(total_shares, 0)),
          market_cap = current_price * total_shares
      where company_id = p_company_id;
  end if;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'other',
    case when p_side = 'buy' then -v_total else v_total end,
    'Bourse : ' || (case when p_side = 'buy' then 'achat' else 'vente' end) || ' ' || p_quantity || ' actions à ' || v_price || '$');

  return jsonb_build_object('price', v_price, 'total', v_total, 'shares', p_quantity);
end;
$$;

-- Tick global des cours d'actions : drift selon perf entreprise + drift aléatoire.
create or replace function public.skyline_tick_shares()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share record;
  v_company public.skyline_companies%rowtype;
  v_drift numeric;
  v_perf  numeric;
  v_new_price numeric;
  v_count int := 0;
begin
  for v_share in select * from public.skyline_company_shares where is_listed = true loop
    select * into v_company from public.skyline_companies where id = v_share.company_id;
    if not found then continue; end if;

    -- Perf : revenus mensuels rapportés à la valorisation IPO.
    v_perf := v_company.monthly_revenue / nullif(v_share.ipo_price * v_share.total_shares / 12, 0);
    if v_perf is null then v_perf := 0; end if;

    v_drift := (random() - 0.5) * 0.04 + v_perf * 0.01;
    v_new_price := v_share.current_price * (1 + v_drift);
    v_new_price := greatest(v_share.ipo_price * 0.1, v_new_price);

    update public.skyline_company_shares
      set current_price = v_new_price,
          market_cap = v_new_price * total_shares
      where id = v_share.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Verse un dividende aux actionnaires (initié par le propriétaire).
create or replace function public.skyline_pay_dividend(
  p_company_id   uuid,
  p_total_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_company  public.skyline_companies%rowtype;
  v_share    public.skyline_company_shares%rowtype;
  v_per_share numeric;
  v_holder   record;
  v_payout   numeric;
  v_total_paid numeric := 0;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  select * into v_company from public.skyline_companies
    where id = p_company_id and user_id = v_user_id;
  if not found then raise exception 'Pas le propriétaire'; end if;

  select * into v_share from public.skyline_company_shares where company_id = p_company_id;
  if not found then raise exception 'Pas en bourse'; end if;

  if p_total_amount <= 0 then raise exception 'Montant invalide'; end if;

  -- Vérifier cash dispo du joueur (qui paie depuis sa trésorerie pour simplification).
  declare v_user_cash numeric;
  begin
    select cash into v_user_cash from public.skyline_profiles where user_id = v_user_id;
    if v_user_cash < p_total_amount then raise exception 'Cash insuffisant'; end if;
  end;

  v_per_share := p_total_amount / v_share.total_shares;

  update public.skyline_profiles
    set cash = cash - p_total_amount, updated_at = now()
    where user_id = v_user_id;

  -- Verser à chaque holder (sauf le payeur lui-même).
  for v_holder in
    select * from public.skyline_share_holdings where company_id = p_company_id
  loop
    v_payout := v_holder.shares * v_per_share;
    update public.skyline_profiles
      set cash = cash + v_payout, updated_at = now()
      where user_id = v_holder.user_id;
    insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
    values (v_holder.user_id, p_company_id, 'other', v_payout,
      'Dividende ' || v_company.name || ' : ' || v_holder.shares || ' actions × ' || round(v_per_share, 4) || '$');
    v_total_paid := v_total_paid + v_payout;
  end loop;

  insert into public.skyline_dividends (company_id, amount_per_share)
  values (p_company_id, v_per_share);

  return jsonb_build_object(
    'per_share', v_per_share,
    'total_paid', v_total_paid,
    'holders', (select count(*) from public.skyline_share_holdings where company_id = p_company_id)
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 22. P8 — MATIÈRES PREMIÈRES (FERMES, MINES, ÉLEVAGES, FORÊTS)
-- ══════════════════════════════════════════════════════════════════════

-- Pour chaque secteur raw (ferme/mine/etc.) : output produit (la matière) + capacité jour de base.
create or replace function public.skyline_raw_sector_spec(p_sector text)
returns jsonb language sql immutable as $$
  select case p_sector
    when 'champ_fleurs'      then jsonb_build_object('output', 'flowers',     'min_cash', 50000)
    when 'champ_ble'         then jsonb_build_object('output', 'wheat',       'min_cash', 200000)
    when 'champ_orge_houblon' then jsonb_build_object('output', 'barley',     'min_cash', 200000)
    when 'pepiniere'         then jsonb_build_object('output', 'plants_med',  'min_cash', 80000)
    when 'maraichage'        then jsonb_build_object('output', 'vegetables', 'min_cash', 100000)
    when 'verger'            then jsonb_build_object('output', 'fruits',     'min_cash', 250000)
    when 'plantation_sucre'  then jsonb_build_object('output', 'sugar',      'min_cash', 300000)
    when 'plantation_coton'  then jsonb_build_object('output', 'cotton',     'min_cash', 400000)
    when 'plantation_cafe'   then jsonb_build_object('output', 'coffee',     'min_cash', 1000000)
    when 'plantation_cacao'  then jsonb_build_object('output', 'cocoa',      'min_cash', 1500000)
    when 'vignoble'          then jsonb_build_object('output', 'grapes',     'min_cash', 500000)
    when 'elevage_volaille'  then jsonb_build_object('output', 'cattle',     'min_cash', 150000)
    when 'elevage_ovin'      then jsonb_build_object('output', 'wool',       'min_cash', 300000)
    when 'elevage_bovin'     then jsonb_build_object('output', 'milk',       'min_cash', 500000)
    when 'apiculture'        then jsonb_build_object('output', 'sugar',      'min_cash', 30000)
    when 'foret'             then jsonb_build_object('output', 'wood',       'min_cash', 800000)
    when 'salines'           then jsonb_build_object('output', 'salt',       'min_cash', 2000000)
    when 'mine_charbon'      then jsonb_build_object('output', 'coal',       'min_cash', 20000000)
    when 'mine_fer'          then jsonb_build_object('output', 'iron',       'min_cash', 50000000)
    when 'mine_cuivre'       then jsonb_build_object('output', 'copper',     'min_cash', 50000000)
    when 'mine_aluminium'    then jsonb_build_object('output', 'aluminum',   'min_cash', 80000000)
    when 'mine_or'           then jsonb_build_object('output', 'gold',       'min_cash', 100000000)
    when 'mine_pierres'      then jsonb_build_object('output', 'gemstones', 'min_cash', 200000000)
    when 'puit_petrole'      then jsonb_build_object('output', 'oil',       'min_cash', 1000000000)
    else null
  end;
$$;

-- Coût et capacité d'une machine extraction/agricole (kind = secteur, level basic/pro/elite/hightech).
create or replace function public.skyline_raw_machine_spec(p_kind text, p_level text)
returns jsonb language sql immutable as $$
  select case p_kind || '/' || p_level
    -- Champs (céréales, maraichage, etc.) : tracteurs
    when 'agri/basic'    then jsonb_build_object('cost', 25000,   'capacity', 1000,   'name', 'Tracteur basique')
    when 'agri/pro'      then jsonb_build_object('cost', 100000,  'capacity', 5000,   'name', 'Tracteur GPS')
    when 'agri/elite'    then jsonb_build_object('cost', 400000,  'capacity', 25000,  'name', 'Moissonneuse géante')
    when 'agri/hightech' then jsonb_build_object('cost', 1500000, 'capacity', 100000, 'name', 'Tracteur autonome IA')
    -- Élevage : étables/abris
    when 'livestock/basic'    then jsonb_build_object('cost', 30000,  'capacity', 200,   'name', 'Étable basique')
    when 'livestock/pro'      then jsonb_build_object('cost', 120000, 'capacity', 1000,  'name', 'Élevage industriel')
    when 'livestock/elite'    then jsonb_build_object('cost', 500000, 'capacity', 5000,  'name', 'Méga-élevage')
    when 'livestock/hightech' then jsonb_build_object('cost', 2000000,'capacity', 20000, 'name', 'Élevage automatisé IA')
    -- Forêt : tronçonneuses + scies
    when 'forestry/basic'    then jsonb_build_object('cost', 40000,  'capacity', 500,   'name', 'Atelier coupe basique')
    when 'forestry/pro'      then jsonb_build_object('cost', 150000, 'capacity', 2500,  'name', 'Exploitation pro')
    when 'forestry/elite'    then jsonb_build_object('cost', 600000, 'capacity', 12000, 'name', 'Exploitation industrielle')
    when 'forestry/hightech' then jsonb_build_object('cost', 2500000,'capacity', 50000, 'name', 'Exploitation auto IA')
    -- Mines : excavateurs
    when 'mining/basic'    then jsonb_build_object('cost', 200000,   'capacity', 200,    'name', 'Excavateur basique')
    when 'mining/pro'      then jsonb_build_object('cost', 1000000,  'capacity', 2000,   'name', 'Pelle hydraulique')
    when 'mining/elite'    then jsonb_build_object('cost', 5000000,  'capacity', 12000,  'name', 'Pelle minière géante')
    when 'mining/hightech' then jsonb_build_object('cost', 25000000, 'capacity', 60000,  'name', 'Mine automatisée IA')
    -- Pétrole : puits
    when 'oil/basic'    then jsonb_build_object('cost', 5000000,    'capacity', 1000,   'name', 'Puit terrestre basique')
    when 'oil/pro'      then jsonb_build_object('cost', 30000000,   'capacity', 8000,   'name', 'Plateforme onshore')
    when 'oil/elite'    then jsonb_build_object('cost', 200000000,  'capacity', 50000,  'name', 'Plateforme offshore')
    when 'oil/hightech' then jsonb_build_object('cost', 1000000000, 'capacity', 200000, 'name', 'Plateforme IA semi-sub')
    else null
  end;
$$;

-- Mapping secteur raw → kind de machine.
create or replace function public.skyline_raw_machine_kind(p_sector text)
returns text language sql immutable as $$
  select case
    when p_sector in ('champ_fleurs', 'champ_ble', 'champ_orge_houblon', 'pepiniere',
                      'maraichage', 'verger', 'plantation_sucre', 'plantation_coton',
                      'plantation_cafe', 'plantation_cacao', 'vignoble', 'apiculture')
      then 'agri'
    when p_sector in ('elevage_volaille', 'elevage_ovin', 'elevage_bovin')
      then 'livestock'
    when p_sector in ('foret')
      then 'forestry'
    when p_sector in ('salines', 'mine_charbon', 'mine_fer', 'mine_cuivre',
                      'mine_aluminium', 'mine_or', 'mine_pierres')
      then 'mining'
    when p_sector in ('puit_petrole')
      then 'oil'
    else null
  end;
$$;

-- Acheter une machine pour un raw site.
create or replace function public.skyline_buy_raw_machine(
  p_company_id uuid,
  p_level      text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company public.skyline_companies%rowtype;
  v_kind    text;
  v_spec    jsonb;
  v_cost    numeric;
  v_cap     int;
  v_id      uuid;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  select * into v_company from public.skyline_companies
    where id = p_company_id and user_id = v_user_id and category = 'raw';
  if not found then raise exception 'Pas une matière première ou pas trouvée'; end if;

  v_kind := public.skyline_raw_machine_kind(v_company.sector);
  if v_kind is null then raise exception 'Secteur non géré'; end if;

  v_spec := public.skyline_raw_machine_spec(v_kind, p_level);
  if v_spec is null then raise exception 'Niveau machine inconnu'; end if;

  v_cost := (v_spec->>'cost')::numeric;
  v_cap := (v_spec->>'capacity')::int;

  declare v_user_cash numeric;
  begin
    select cash into v_user_cash from public.skyline_profiles where user_id = v_user_id;
    if v_user_cash < v_cost then
      raise exception 'Cash insuffisant : il te manque % $', round(v_cost - v_user_cash, 2);
    end if;
  end;

  update public.skyline_profiles
    set cash = cash - v_cost, updated_at = now()
    where user_id = v_user_id;

  insert into public.skyline_machines (company_id, kind, level, cost, capacity_per_day)
  values (p_company_id, v_kind, p_level, v_cost, v_cap)
  returning id into v_id;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'equipment', -v_cost,
    'Machine ' || v_kind || ' : ' || (v_spec->>'name'));

  return v_id;
end;
$$;

-- Extraction matière première (lazy via tick) : produit la matière selon capacité × heures.
create or replace function public.skyline_raw_extract(p_company_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company   public.skyline_companies%rowtype;
  v_user_id   uuid := auth.uid();
  v_spec      jsonb;
  v_output_id text;
  v_total_cap int;
  v_now       timestamptz := now();
  v_elapsed_h numeric;
  v_units     int;
  v_existing_qty int;
  v_existing_avg numeric;
  v_cost_per_unit numeric;
begin
  select * into v_company from public.skyline_companies where id = p_company_id;
  if not found or v_company.user_id <> v_user_id then return 0; end if;
  if v_company.category <> 'raw' then return 0; end if;

  v_spec := public.skyline_raw_sector_spec(v_company.sector);
  if v_spec is null then return 0; end if;
  v_output_id := v_spec->>'output';

  select coalesce(sum(capacity_per_day), 0) into v_total_cap
    from public.skyline_machines where company_id = p_company_id;
  if v_total_cap = 0 then return 0; end if;

  v_elapsed_h := extract(epoch from (v_now - v_company.last_tick_at)) / 3600.0;
  if v_elapsed_h <= 0 then return 0; end if;
  v_units := floor(v_total_cap * v_elapsed_h / 24.0)::int;
  if v_units <= 0 then return 0; end if;

  -- Coût de revient = ~30% du prix de référence (production interne pas chère).
  v_cost_per_unit := coalesce(public.skyline_raw_material_ref_buy(v_output_id), 1) * 0.3;

  -- Ajouter à l'inventaire (avg pondéré).
  select quantity, avg_buy_price into v_existing_qty, v_existing_avg
    from public.skyline_inventory
    where company_id = p_company_id and product_id = v_output_id;

  if not found then
    insert into public.skyline_inventory (company_id, product_id, quantity, avg_buy_price, sell_price, purchased_at)
    values (p_company_id, v_output_id, v_units, v_cost_per_unit,
      coalesce(public.skyline_raw_material_ref_buy(v_output_id), v_cost_per_unit * 2), now());
  else
    update public.skyline_inventory
      set quantity = quantity + v_units,
          avg_buy_price = (v_existing_qty * v_existing_avg + v_units * v_cost_per_unit) / (v_existing_qty + v_units)
      where company_id = p_company_id and product_id = v_output_id;
  end if;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'other', 0,
    'Extraction : ' || v_units || '× ' || v_output_id);

  return v_units;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 23. P9 — SERVICES SCALABLES (17 secteurs)
-- ══════════════════════════════════════════════════════════════════════

-- Tarif moyen par prestation et compétence principale par secteur service.
create or replace function public.skyline_service_sector_spec(p_sector text)
returns jsonb language sql immutable as $$
  select case p_sector
    -- Bureau / digital
    when 'tech_digital'    then jsonb_build_object('rate', 200,  'skill', 'machine_use',    'name', 'Tech / Digital')
    when 'conseil_audit'   then jsonb_build_object('rate', 300,  'skill', 'compta',         'name', 'Conseil / Audit')
    when 'expertise_compta' then jsonb_build_object('rate', 180,  'skill', 'compta',         'name', 'Expertise compta')
    when 'juridique'       then jsonb_build_object('rate', 350,  'skill', 'compta',         'name', 'Cabinet juridique')
    when 'immobilier'      then jsonb_build_object('rate', 250,  'skill', 'negociation',    'name', 'Agence immobilière')
    when 'ecommerce'       then jsonb_build_object('rate', 100,  'skill', 'machine_use',    'name', 'Plateforme e-commerce')
    -- Beauté / esthétique
    when 'coiffure'        then jsonb_build_object('rate', 50,   'skill', 'soins',          'name', 'Salon coiffure')
    when 'esthetique'      then jsonb_build_object('rate', 80,   'skill', 'soins',          'name', 'Salon esthétique / spa')
    -- Sport
    when 'salle_sport'     then jsonb_build_object('rate', 40,   'skill', 'soins',          'name', 'Salle de sport')
    -- Logistique
    when 'transport'       then jsonb_build_object('rate', 150,  'skill', 'manuel',         'name', 'Société transport')
    when 'taxi_vtc'        then jsonb_build_object('rate', 25,   'skill', 'manuel',         'name', 'Taxi / VTC')
    -- Sécurité / nettoyage
    when 'securite'        then jsonb_build_object('rate', 120,  'skill', 'securite',       'name', 'Société sécurité')
    when 'nettoyage'       then jsonb_build_object('rate', 60,   'skill', 'entretien',      'name', 'Société nettoyage')
    -- Lourd / spécialisé
    when 'btp_construction' then jsonb_build_object('rate', 800,  'skill', 'manuel',         'name', 'BTP / Construction')
    when 'sante_clinique'  then jsonb_build_object('rate', 400,  'skill', 'medical',        'name', 'Clinique privée')
    when 'medias_studio'   then jsonb_build_object('rate', 600,  'skill', 'presentation',   'name', 'Studio médias')
    when 'casino'          then jsonb_build_object('rate', 1500, 'skill', 'service_client', 'name', 'Casino')
    when 'banque_commerciale' then jsonb_build_object('rate', 2500, 'skill', 'compta',       'name', 'Banque commerciale')
    when 'aerien'          then jsonb_build_object('rate', 5000, 'skill', 'machine_use',    'name', 'Compagnie aérienne')
    when 'diffusion_tv'    then jsonb_build_object('rate', 1200, 'skill', 'presentation',   'name', 'Chaîne TV / Radio')
    else null
  end;
$$;

-- Coût et capacité d'un équipement service selon (kind = sector, level basic/pro/elite/hightech).
create or replace function public.skyline_service_equipment_spec(p_kind text, p_level text)
returns jsonb language sql immutable as $$
  select case p_kind || '/' || p_level
    -- Bureau (Tech, Conseil, Juridique, Compta, Immobilier, E-commerce)
    when 'office/basic'    then jsonb_build_object('cost', 2500,    'capacity', 5,     'name', 'Poste de travail basique')
    when 'office/pro'      then jsonb_build_object('cost', 8000,    'capacity', 12,    'name', 'Workstation pro')
    when 'office/elite'    then jsonb_build_object('cost', 25000,   'capacity', 30,    'name', 'Workstation IA')
    when 'office/hightech' then jsonb_build_object('cost', 80000,   'capacity', 80,    'name', 'Suite logicielle premium')
    -- Salon (coiffure, esthétique)
    when 'salon/basic'    then jsonb_build_object('cost', 3000,    'capacity', 4,     'name', 'Fauteuil basique')
    when 'salon/pro'      then jsonb_build_object('cost', 9000,    'capacity', 10,    'name', 'Fauteuil pro avec accessoires')
    when 'salon/elite'    then jsonb_build_object('cost', 25000,   'capacity', 25,    'name', 'Cabine premium complète')
    when 'salon/hightech' then jsonb_build_object('cost', 80000,   'capacity', 60,    'name', 'Cabine spa luxe')
    -- Sport
    when 'gym/basic'    then jsonb_build_object('cost', 8000,    'capacity', 30,    'name', 'Lot machines basiques')
    when 'gym/pro'      then jsonb_build_object('cost', 25000,   'capacity', 80,    'name', 'Plateau musculation pro')
    when 'gym/elite'    then jsonb_build_object('cost', 80000,   'capacity', 200,   'name', 'Salle premium connectée')
    when 'gym/hightech' then jsonb_build_object('cost', 250000,  'capacity', 500,   'name', 'Salle premium IA')
    -- Transport / véhicules
    when 'vehicle/basic'    then jsonb_build_object('cost', 15000,   'capacity', 8,     'name', 'Véhicule occasion')
    when 'vehicle/pro'      then jsonb_build_object('cost', 45000,   'capacity', 20,    'name', 'Véhicule récent')
    when 'vehicle/elite'    then jsonb_build_object('cost', 120000,  'capacity', 50,    'name', 'Camion / utilitaire pro')
    when 'vehicle/hightech' then jsonb_build_object('cost', 400000,  'capacity', 150,   'name', 'Flotte autonome IA')
    -- Médical
    when 'medical/basic'    then jsonb_build_object('cost', 30000,   'capacity', 10,    'name', 'Cabinet basique')
    when 'medical/pro'      then jsonb_build_object('cost', 100000,  'capacity', 25,    'name', 'Cabinet équipé')
    when 'medical/elite'    then jsonb_build_object('cost', 400000,  'capacity', 60,    'name', 'Bloc opératoire')
    when 'medical/hightech' then jsonb_build_object('cost', 1500000, 'capacity', 200,   'name', 'Imagerie + IA diagnostique')
    -- BTP / construction
    when 'btp/basic'    then jsonb_build_object('cost', 50000,   'capacity', 5,     'name', 'Outils + 1 engin')
    when 'btp/pro'      then jsonb_build_object('cost', 200000,  'capacity', 15,    'name', 'Flotte d''engins')
    when 'btp/elite'    then jsonb_build_object('cost', 800000,  'capacity', 50,    'name', 'Grue + équipement lourd')
    when 'btp/hightech' then jsonb_build_object('cost', 3000000, 'capacity', 200,   'name', 'BIM + grues automatisées')
    -- Médias / studio
    when 'studio/basic'    then jsonb_build_object('cost', 25000,   'capacity', 8,     'name', 'Caméra + montage basique')
    when 'studio/pro'      then jsonb_build_object('cost', 100000,  'capacity', 25,    'name', 'Studio cinéma pro')
    when 'studio/elite'    then jsonb_build_object('cost', 500000,  'capacity', 80,    'name', 'Plateau cinéma premium')
    when 'studio/hightech' then jsonb_build_object('cost', 2000000, 'capacity', 250,   'name', 'Plateau LED virtuel + IA')
    -- Casino
    when 'casino/basic'    then jsonb_build_object('cost', 200000,  'capacity', 30,    'name', 'Salle de jeu basique')
    when 'casino/pro'      then jsonb_build_object('cost', 1000000, 'capacity', 100,   'name', 'Casino moyen')
    when 'casino/elite'    then jsonb_build_object('cost', 5000000, 'capacity', 300,   'name', 'Casino prestige + VIP')
    when 'casino/hightech' then jsonb_build_object('cost', 25000000,'capacity', 1000,  'name', 'Méga-casino + hôtel')
    -- Banque
    when 'bank/basic'    then jsonb_build_object('cost', 500000,   'capacity', 50,    'name', 'Agence basique')
    when 'bank/pro'      then jsonb_build_object('cost', 2500000,  'capacity', 200,   'name', 'Réseau régional')
    when 'bank/elite'    then jsonb_build_object('cost', 15000000, 'capacity', 800,   'name', 'Réseau national')
    when 'bank/hightech' then jsonb_build_object('cost', 80000000, 'capacity', 3000,  'name', 'Banque mondiale digitale')
    -- Aérien
    when 'airline/basic'    then jsonb_build_object('cost', 50000000,   'capacity', 200,    'name', 'Avion régional')
    when 'airline/pro'      then jsonb_build_object('cost', 200000000,  'capacity', 1000,   'name', 'Long-courrier')
    when 'airline/elite'    then jsonb_build_object('cost', 800000000,  'capacity', 4000,   'name', 'Flotte moyenne')
    when 'airline/hightech' then jsonb_build_object('cost', 3000000000, 'capacity', 15000,  'name', 'Flotte mondiale + IA ops')
    -- Diffusion (TV, radio)
    when 'broadcast/basic'    then jsonb_build_object('cost', 1000000,  'capacity', 100,   'name', 'Studio régional')
    when 'broadcast/pro'      then jsonb_build_object('cost', 5000000,  'capacity', 500,   'name', 'Chaîne nationale')
    when 'broadcast/elite'    then jsonb_build_object('cost', 25000000, 'capacity', 2000,  'name', 'Groupe média')
    when 'broadcast/hightech' then jsonb_build_object('cost', 100000000,'capacity', 8000,  'name', 'Empire média mondial')
    else null
  end;
$$;

-- Mapping secteur service → kind d'équipement.
create or replace function public.skyline_service_equipment_kind(p_sector text)
returns text language sql immutable as $$
  select case
    when p_sector in ('tech_digital', 'conseil_audit', 'expertise_compta', 'juridique',
                      'immobilier', 'ecommerce', 'securite', 'nettoyage')
      then 'office'
    when p_sector in ('coiffure', 'esthetique') then 'salon'
    when p_sector = 'salle_sport' then 'gym'
    when p_sector in ('transport', 'taxi_vtc') then 'vehicle'
    when p_sector = 'sante_clinique' then 'medical'
    when p_sector = 'btp_construction' then 'btp'
    when p_sector = 'medias_studio' then 'studio'
    when p_sector = 'casino' then 'casino'
    when p_sector = 'banque_commerciale' then 'bank'
    when p_sector = 'aerien' then 'airline'
    when p_sector = 'diffusion_tv' then 'broadcast'
    else null
  end;
$$;

-- Acheter équipement service (réutilise table skyline_machines).
create or replace function public.skyline_buy_service_equipment(
  p_company_id uuid,
  p_level      text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company public.skyline_companies%rowtype;
  v_kind    text;
  v_spec    jsonb;
  v_cost    numeric;
  v_cap     int;
  v_id      uuid;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  select * into v_company from public.skyline_companies
    where id = p_company_id and user_id = v_user_id and category = 'service';
  if not found then raise exception 'Pas un service ou pas trouvé'; end if;

  v_kind := public.skyline_service_equipment_kind(v_company.sector);
  if v_kind is null then raise exception 'Secteur service non géré'; end if;

  v_spec := public.skyline_service_equipment_spec(v_kind, p_level);
  if v_spec is null then raise exception 'Niveau équipement inconnu'; end if;

  v_cost := (v_spec->>'cost')::numeric;
  v_cap := (v_spec->>'capacity')::int;

  declare v_user_cash numeric;
  begin
    select cash into v_user_cash from public.skyline_profiles where user_id = v_user_id;
    if v_user_cash < v_cost then
      raise exception 'Cash insuffisant : il te manque % $', round(v_cost - v_user_cash, 2);
    end if;
  end;

  update public.skyline_profiles
    set cash = cash - v_cost, updated_at = now()
    where user_id = v_user_id;

  insert into public.skyline_machines (company_id, kind, level, cost, capacity_per_day)
  values (p_company_id, v_kind, p_level, v_cost, v_cap)
  returning id into v_id;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'equipment', -v_cost,
    'Équipement ' || v_kind || ' : ' || (v_spec->>'name'));

  return v_id;
end;
$$;

-- Production de service (lazy via tick) : revenus = capacité × employés × heures × tarif × quality.
-- Quality = avg(skill_avg) pondéré par compétence principale du secteur.
create or replace function public.skyline_service_produce(p_company_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company   public.skyline_companies%rowtype;
  v_user_id   uuid := auth.uid();
  v_spec      jsonb;
  v_skill     text;
  v_rate      numeric;
  v_total_cap int;
  v_emp_count int;
  v_skill_sum int;
  v_now       timestamptz := now();
  v_elapsed_h numeric;
  v_capacity_h numeric;
  v_quality   numeric;
  v_revenue   numeric;
begin
  select * into v_company from public.skyline_companies where id = p_company_id;
  if not found or v_company.user_id <> v_user_id then return 0; end if;
  if v_company.category <> 'service' then return 0; end if;

  v_spec := public.skyline_service_sector_spec(v_company.sector);
  if v_spec is null then return 0; end if;
  v_skill := v_spec->>'skill';
  v_rate := (v_spec->>'rate')::numeric;

  -- Capacité totale équipement.
  select coalesce(sum(capacity_per_day), 0) into v_total_cap
    from public.skyline_machines where company_id = p_company_id;

  -- Employés.
  select count(*), coalesce(sum(coalesce((skills->>v_skill)::int, 30)), 0)
    into v_emp_count, v_skill_sum
    from public.skyline_employees where company_id = p_company_id;

  if v_total_cap = 0 or v_emp_count = 0 then return 0; end if;

  v_elapsed_h := extract(epoch from (v_now - v_company.last_tick_at)) / 3600.0;
  if v_elapsed_h <= 0 then return 0; end if;

  -- Capacité réelle : MIN(equipment, employees) au prorata des heures.
  v_capacity_h := least(v_total_cap, v_emp_count * 8) * v_elapsed_h / 24.0;

  -- Quality factor (0.3 → 1.5 selon skill moyen).
  v_quality := 0.3 + (v_skill_sum / nullif(v_emp_count, 0)) / 100.0 * 1.2;

  v_revenue := v_capacity_h * v_rate * v_quality;
  if v_revenue <= 0 then return 0; end if;

  -- Crédite revenus.
  update public.skyline_profiles
    set cash = cash + v_revenue, updated_at = v_now
    where user_id = v_user_id;
  update public.skyline_companies
    set monthly_revenue = v_revenue,
        last_tick_at = v_now,
        updated_at = v_now
    where id = p_company_id;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'sale', v_revenue,
    'Prestations service (' || round(v_elapsed_h, 1) || 'h, qualité ' ||
    round(v_quality, 2) || ')');

  return v_revenue;
end;
$$;

-- Wrapper tick étendu avec service.
create or replace function public.skyline_tick_company_full(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat text;
begin
  select category into v_cat from public.skyline_companies where id = p_company_id;
  if v_cat is null then return; end if;

  perform public.skyline_tick_company(p_company_id);

  if v_cat = 'commerce' then
    perform public.skyline_process_sales(p_company_id);
  elsif v_cat = 'factory' then
    perform public.skyline_factory_produce(p_company_id);
  elsif v_cat = 'raw' then
    perform public.skyline_raw_extract(p_company_id);
  elsif v_cat = 'service' then
    perform public.skyline_service_produce(p_company_id);
  end if;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 24. P9 — APPRENTISSAGE JOUEUR (16 compétences)
-- ══════════════════════════════════════════════════════════════════════

-- Démarre une session de formation pour le joueur.
-- Durée : 14h réelles (2 semaines jeu). Coût : 5k$ basique → 15k$ avancé.
create or replace function public.skyline_start_player_training(
  p_skill text,
  p_target_level int default 50
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.skyline_profiles%rowtype;
  v_cost    numeric;
  v_ends_at timestamptz;
  v_current int;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if p_target_level <= 0 or p_target_level > 100 then
    raise exception 'Niveau cible invalide';
  end if;

  select * into v_profile from public.skyline_profiles where user_id = v_user_id;
  if not found then
    perform public.skyline_init_profile();
    select * into v_profile from public.skyline_profiles where user_id = v_user_id;
  end if;

  if v_profile.current_skill_training is not null then
    raise exception 'Déjà en formation : %', v_profile.current_skill_training;
  end if;

  -- Skill courant (0 si jamais formé).
  v_current := coalesce((v_profile.player_skills->>p_skill)::int, 0);
  if p_target_level <= v_current then
    raise exception 'Tu maîtrises déjà ce niveau (actuel : %)', v_current;
  end if;

  -- Coût scaled selon delta de niveau visé.
  v_cost := 5000 + (p_target_level - v_current) * 200;
  if v_profile.cash < v_cost then
    raise exception 'Cash insuffisant : il te manque % $', round(v_cost - v_profile.cash, 2);
  end if;

  -- Durée : 14h réelles (2 semaines jeu).
  v_ends_at := now() + interval '14 hours';

  update public.skyline_profiles
    set cash = cash - v_cost,
        current_skill_training = p_skill,
        skill_training_ends_at = v_ends_at,
        updated_at = now()
    where user_id = v_user_id;

  insert into public.skyline_transactions (user_id, kind, amount, description)
  values (v_user_id, 'other', -v_cost,
    'Formation : ' || p_skill || ' → niveau ' || p_target_level);

  return v_ends_at;
end;
$$;

-- Finalise une formation joueur si timer écoulé.
create or replace function public.skyline_finish_player_training()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.skyline_profiles%rowtype;
  v_skill   text;
  v_current int;
  v_new     int;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  select * into v_profile from public.skyline_profiles where user_id = v_user_id;
  if not found then return false; end if;
  if v_profile.current_skill_training is null then return false; end if;
  if v_profile.skill_training_ends_at > now() then return false; end if;

  v_skill := v_profile.current_skill_training;
  v_current := coalesce((v_profile.player_skills->>v_skill)::int, 0);
  -- Gain : entre +25 et +40 points.
  v_new := least(100, v_current + 25 + floor(random() * 15)::int);

  update public.skyline_profiles
    set player_skills = player_skills || jsonb_build_object(v_skill, v_new),
        current_skill_training = null,
        skill_training_ends_at = null,
        updated_at = now()
    where user_id = v_user_id;

  insert into public.skyline_transactions (user_id, kind, amount, description)
  values (v_user_id, 'other', 0,
    'Formation terminée : ' || v_skill || ' ' || v_current || ' → ' || v_new);

  return true;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 25. P10 — PHARMA : R&D MOLÉCULES + BREVETS 5 ANS
-- ══════════════════════════════════════════════════════════════════════

-- Catalogue de molécules (10) avec : coût R&D, durée, prix de vente unique.
create or replace function public.skyline_pharma_molecule_spec(p_molecule text)
returns jsonb language sql immutable as $$
  select case p_molecule
    when 'analgesique_pro'   then jsonb_build_object('cost', 200000,   'duration_h', 30,  'sell_price', 25,   'name', 'Analgésique pro')
    when 'antibiotique_a'    then jsonb_build_object('cost', 500000,   'duration_h', 50,  'sell_price', 60,   'name', 'Antibiotique A')
    when 'antiviral_b'       then jsonb_build_object('cost', 1500000,  'duration_h', 80,  'sell_price', 150,  'name', 'Antiviral B')
    when 'antidepresseur'    then jsonb_build_object('cost', 2000000,  'duration_h', 100, 'sell_price', 120,  'name', 'Antidépresseur')
    when 'cardio_drug'       then jsonb_build_object('cost', 5000000,  'duration_h', 150, 'sell_price', 300,  'name', 'Cardiovasculaire')
    when 'cancer_t1'         then jsonb_build_object('cost', 20000000, 'duration_h', 250, 'sell_price', 1500, 'name', 'Anti-cancer T1')
    when 'rare_disease'      then jsonb_build_object('cost', 50000000, 'duration_h', 350, 'sell_price', 8000, 'name', 'Maladie rare')
    when 'gene_therapy'      then jsonb_build_object('cost', 100000000,'duration_h', 500, 'sell_price', 25000,'name', 'Thérapie génique')
    when 'longevity_drug'    then jsonb_build_object('cost', 200000000,'duration_h', 700, 'sell_price', 40000,'name', 'Longévité')
    when 'cure_universal'    then jsonb_build_object('cost', 500000000,'duration_h', 1000,'sell_price', 100000,'name', 'Cure universelle')
    else null
  end;
$$;

-- Lance une R&D pharma. La compagnie doit être un lab pharma (factory pharma).
create or replace function public.skyline_pharma_start_research(
  p_company_id uuid,
  p_molecule   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_company    public.skyline_companies%rowtype;
  v_spec       jsonb;
  v_cost       numeric;
  v_duration_h int;
  v_research_id uuid;
  v_user_cash  numeric;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  select * into v_company from public.skyline_companies
    where id = p_company_id and user_id = v_user_id;
  if not found then raise exception 'Entreprise non trouvée'; end if;

  -- Doit être un lab pharma (factory pharma) ou clinique privée (service).
  -- Pour simplifier on autorise quiconque investit (= ouvert à tous).

  v_spec := public.skyline_pharma_molecule_spec(p_molecule);
  if v_spec is null then raise exception 'Molécule inconnue'; end if;

  v_cost := (v_spec->>'cost')::numeric;
  v_duration_h := (v_spec->>'duration_h')::int;

  -- Vérifier qu'on n'a pas déjà une R&D en cours sur cette molécule.
  if exists (
    select 1 from public.skyline_research
    where company_id = p_company_id and research_kind = p_molecule and completed_at is null
  ) then
    raise exception 'R&D déjà en cours sur %', p_molecule;
  end if;

  select cash into v_user_cash from public.skyline_profiles where user_id = v_user_id;
  if v_user_cash < v_cost then
    raise exception 'Cash insuffisant : il te manque % $', round(v_cost - v_user_cash, 2);
  end if;

  update public.skyline_profiles
    set cash = cash - v_cost, updated_at = now()
    where user_id = v_user_id;

  insert into public.skyline_research (
    company_id, research_kind, progress_pct, cost_total, ends_at
  )
  values (
    p_company_id, p_molecule, 0, v_cost, now() + make_interval(hours => v_duration_h)
  )
  returning id into v_research_id;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'other', -v_cost,
    'R&D Pharma : ' || (v_spec->>'name'));

  return v_research_id;
end;
$$;

-- Finalise la R&D : crée un brevet 5 ans jeu (= 75h réelles).
create or replace function public.skyline_pharma_complete_research(p_research_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_research public.skyline_research%rowtype;
  v_company  public.skyline_companies%rowtype;
  v_spec     jsonb;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  select * into v_research from public.skyline_research where id = p_research_id;
  if not found then raise exception 'R&D non trouvée'; end if;

  select * into v_company from public.skyline_companies where id = v_research.company_id;
  if v_company.user_id <> v_user_id then raise exception 'Pas autorisé'; end if;

  if v_research.completed_at is not null then return false; end if;
  if v_research.ends_at is null or v_research.ends_at > now() then return false; end if;

  v_spec := public.skyline_pharma_molecule_spec(v_research.research_kind);
  if v_spec is null then return false; end if;

  -- Marquer R&D terminée.
  update public.skyline_research
    set progress_pct = 100,
        completed_at = now()
    where id = p_research_id;

  -- Brevet 5 ans (= 75h réelles).
  insert into public.skyline_patents (company_id, patent_name, expires_at)
  values (
    v_company.id, v_research.research_kind, now() + interval '75 hours'
  );

  -- News.
  insert into public.skyline_news (kind, headline, body, sector, impact_pct)
  values ('npc_announce',
    '💊 Brevet pharma déposé : ' || (v_spec->>'name'),
    v_company.name || ' obtient un brevet 5 ans sur ' || (v_spec->>'name') ||
    ' — monopole sur le marché pendant cette période.',
    'pharma', 0);

  return true;
end;
$$;

-- Vendre une dose / boîte de médicament breveté (à prix premium).
-- Tant que le brevet est valide, ça vend au prix unique. Après expiration, c'est générique = -70% prix.
create or replace function public.skyline_pharma_sell(
  p_company_id uuid,
  p_molecule   text,
  p_quantity   int
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_spec      jsonb;
  v_unit_price numeric;
  v_total     numeric;
  v_has_patent boolean;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if p_quantity <= 0 then raise exception 'Quantité invalide'; end if;
  if not exists (
    select 1 from public.skyline_companies
    where id = p_company_id and user_id = v_user_id
  ) then raise exception 'Entreprise non trouvée'; end if;

  v_spec := public.skyline_pharma_molecule_spec(p_molecule);
  if v_spec is null then raise exception 'Molécule inconnue'; end if;

  v_has_patent := exists (
    select 1 from public.skyline_patents
    where company_id = p_company_id
      and patent_name = p_molecule
      and expires_at > now()
  );
  if not v_has_patent then
    -- Sans brevet, on peut quand même produire mais à 30% du prix (générique).
    v_unit_price := (v_spec->>'sell_price')::numeric * 0.3;
  else
    v_unit_price := (v_spec->>'sell_price')::numeric;
  end if;

  v_total := v_unit_price * p_quantity;

  update public.skyline_profiles
    set cash = cash + v_total, updated_at = now()
    where user_id = v_user_id;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'sale', v_total,
    'Vente pharma : ' || p_quantity || '× ' || (v_spec->>'name') ||
    case when v_has_patent then ' (brevet)' else ' (générique)' end);

  return v_total;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 26. P10 — RESTAURATION : ÉTOILES GUIDE SKYLINE
-- ══════════════════════════════════════════════════════════════════════

-- Évalue le score Guide Skyline d'un restaurant et lui attribue 0-3 étoiles.
create or replace function public.skyline_restau_evaluate(p_company_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company   public.skyline_companies%rowtype;
  v_score     int := 0;
  v_revenue_score int;
  v_skill_score int;
  v_clean_score int;
  v_skill_avg numeric;
  v_emp_count int;
  v_stars     int;
begin
  select * into v_company from public.skyline_companies where id = p_company_id;
  if not found then return 0; end if;
  -- Restau gastro ou restaurant : on prend tout commerce dont le secteur contient 'restau'.
  if v_company.sector not in ('restaurant_gastro', 'pizzeria', 'fast_food', 'cafe_bar') then
    return 0;
  end if;

  -- 3 critères :
  --  - Revenus mensuels (échelle log)
  v_revenue_score := least(40, floor(ln(greatest(1, v_company.monthly_revenue + 1)) * 4)::int);
  --  - Compétence cuisine moyenne des employés
  select coalesce(avg(coalesce((skills->>'cuisine')::int, 30)), 30), count(*)
    into v_skill_avg, v_emp_count
    from public.skyline_employees where company_id = p_company_id;
  v_skill_score := least(40, floor(v_skill_avg * 0.4)::int);
  --  - Propreté
  v_clean_score := least(20, floor(v_company.cleanliness * 0.2)::int);

  v_score := v_revenue_score + v_skill_score + v_clean_score;
  v_stars := case
    when v_score >= 80 then 3
    when v_score >= 55 then 2
    when v_score >= 30 then 1
    else 0
  end;

  insert into public.skyline_restaurant_stars (company_id, stars, awarded_at, guide_score)
  values (p_company_id, v_stars, now(), v_score)
  on conflict (company_id) do update
    set stars = excluded.stars,
        awarded_at = now(),
        guide_score = excluded.guide_score;

  -- Si nouvelle étoile, news.
  if v_stars > 0 then
    insert into public.skyline_news (kind, headline, body, sector, impact_pct)
    values ('npc_announce',
      '🍔 Guide Skyline : ' || v_company.name || ' gagne ' || v_stars || ' étoile(s)',
      v_company.name || ' (' || v_company.sector || ') obtient ' || v_stars ||
      ' étoile(s) au guide Skyline (score ' || v_score || ').',
      v_company.sector, 0);
  end if;

  return v_stars;
end;
$$;

-- Multiplicateur prix de vente selon étoiles.
create or replace function public.skyline_restau_price_multiplier(p_company_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when stars >= 3 then 30.0
    when stars >= 2 then 10.0
    when stars >= 1 then 3.0
    else 1.0
  end
  from public.skyline_restaurant_stars
  where company_id = p_company_id
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 27. P10 — TECH SAAS : PRODUITS ÉVOLUTIFS + UTILISATEURS RÉCURRENTS
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.skyline_saas_products (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.skyline_companies(id) on delete cascade,
  product_name    text not null,
  version         int not null default 1,
  users_count     int not null default 0,
  monthly_price   numeric(10, 2) not null default 9.99,
  cost_to_dev     numeric(15, 2) not null default 0,
  launched_at     timestamptz not null default now(),
  last_growth_at  timestamptz not null default now(),
  is_active       boolean not null default true,
  unique (company_id, product_name)
);

alter table public.skyline_saas_products enable row level security;

drop policy if exists "skyline_saas_read_own" on public.skyline_saas_products;
create policy "skyline_saas_read_own"
  on public.skyline_saas_products
  for select
  using (
    exists (
      select 1 from public.skyline_companies c
      where c.id = company_id and c.user_id = auth.uid()
    ) OR (select is_admin from public.profiles where id = auth.uid())
  );

drop policy if exists "skyline_saas_write_own" on public.skyline_saas_products;
create policy "skyline_saas_write_own"
  on public.skyline_saas_products
  for all
  using (
    exists (
      select 1 from public.skyline_companies c
      where c.id = company_id and c.user_id = auth.uid()
    )
  );

create index if not exists skyline_saas_company_idx on public.skyline_saas_products(company_id);

-- Lance un nouveau produit SaaS (v1) ou une nouvelle version (v+1).
-- Coût = 50k$ × version. Plus la version est élevée, plus c'est cher mais mieux ça scale.
create or replace function public.skyline_saas_launch(
  p_company_id  uuid,
  p_product_name text,
  p_monthly_price numeric default 9.99
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_company   public.skyline_companies%rowtype;
  v_existing  public.skyline_saas_products%rowtype;
  v_version   int := 1;
  v_cost      numeric;
  v_id        uuid;
  v_user_cash numeric;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if p_monthly_price <= 0 then raise exception 'Prix invalide'; end if;

  select * into v_company from public.skyline_companies
    where id = p_company_id and user_id = v_user_id;
  if not found then raise exception 'Entreprise non trouvée'; end if;

  if v_company.sector <> 'tech_digital' then
    raise exception 'Réservé au secteur Tech / Digital';
  end if;

  -- Si produit existe déjà, on lance une version supérieure.
  select * into v_existing from public.skyline_saas_products
    where company_id = p_company_id and product_name = p_product_name;
  if found then
    v_version := v_existing.version + 1;
  end if;

  v_cost := 50000 * v_version;

  select cash into v_user_cash from public.skyline_profiles where user_id = v_user_id;
  if v_user_cash < v_cost then
    raise exception 'Cash insuffisant : il te manque % $', round(v_cost - v_user_cash, 2);
  end if;

  update public.skyline_profiles
    set cash = cash - v_cost, updated_at = now()
    where user_id = v_user_id;

  if found then
    -- Nouvelle version : booste les utilisateurs existants +50%.
    update public.skyline_saas_products
      set version = v_version,
          monthly_price = p_monthly_price,
          users_count = floor(users_count * 1.5)::int,
          cost_to_dev = cost_to_dev + v_cost,
          last_growth_at = now()
      where id = v_existing.id
      returning id into v_id;
  else
    -- Nouveau produit.
    insert into public.skyline_saas_products (
      company_id, product_name, version, users_count, monthly_price, cost_to_dev
    )
    values (
      p_company_id, p_product_name, 1, 100, p_monthly_price, v_cost
    )
    returning id into v_id;
  end if;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values (v_user_id, p_company_id, 'other', -v_cost,
    'SaaS : ' || p_product_name || ' v' || v_version || ' (dev)');

  return v_id;
end;
$$;

-- Tick SaaS : revenus mensuels = nb_users × monthly_price proratisés. Croissance d'utilisateurs selon marketing/version.
create or replace function public.skyline_saas_tick(p_company_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_company   public.skyline_companies%rowtype;
  v_now       timestamptz := now();
  v_elapsed_h numeric;
  v_total_revenue numeric := 0;
  v_product   record;
  v_growth    int;
  v_revenue   numeric;
  v_skill_avg numeric;
begin
  select * into v_company from public.skyline_companies where id = p_company_id;
  if not found or v_company.user_id <> v_user_id then return 0; end if;
  if v_company.sector <> 'tech_digital' then return 0; end if;

  v_elapsed_h := extract(epoch from (v_now - v_company.last_tick_at)) / 3600.0;
  if v_elapsed_h <= 0 then return 0; end if;

  -- Skill moyen Tech (machine_use des employés).
  select coalesce(avg(coalesce((skills->>'machine_use')::int, 30)), 30)
    into v_skill_avg
    from public.skyline_employees where company_id = p_company_id;

  for v_product in
    select * from public.skyline_saas_products
    where company_id = p_company_id and is_active = true
  loop
    -- Croissance utilisateurs = base + version × skill / 100 par heure.
    v_growth := floor(v_product.users_count * 0.005 * v_elapsed_h * v_product.version * (v_skill_avg / 100.0))::int;
    if v_growth > 0 then
      update public.skyline_saas_products
        set users_count = users_count + v_growth,
            last_growth_at = v_now
        where id = v_product.id;
    end if;

    -- Revenus mensuels : nb_users × prix × (heures écoulées / 30 jours = 720h).
    v_revenue := v_product.users_count * v_product.monthly_price * v_elapsed_h / 720.0;
    v_total_revenue := v_total_revenue + v_revenue;
  end loop;

  if v_total_revenue > 0 then
    update public.skyline_profiles
      set cash = cash + v_total_revenue, updated_at = v_now
      where user_id = v_user_id;
    insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
    values (v_user_id, p_company_id, 'sale', v_total_revenue,
      'SaaS revenus récurrents (' || round(v_elapsed_h, 1) || 'h)');
  end if;

  return v_total_revenue;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 28. P11 — HOLDINGS, VENTE D'ENTREPRISES
-- ══════════════════════════════════════════════════════════════════════

-- Crée une holding (débloquée à 5+ entreprises possédées).
create or replace function public.skyline_create_holding(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_count int;
  v_holding_id uuid;
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if length(p_name) < 1 or length(p_name) > 50 then
    raise exception 'Nom invalide (1-50 caractères)';
  end if;

  select count(*) into v_company_count
    from public.skyline_companies where user_id = v_user_id;
  if v_company_count < 5 then
    raise exception 'Holding débloquée à partir de 5 entreprises (actuel : %)', v_company_count;
  end if;

  insert into public.skyline_holdings (user_id, name)
  values (v_user_id, p_name)
  returning id into v_holding_id;

  return v_holding_id;
end;
$$;

-- Lie une entreprise à une holding.
create or replace function public.skyline_link_company_to_holding(
  p_holding_id uuid,
  p_company_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if not exists (
    select 1 from public.skyline_holdings
    where id = p_holding_id and user_id = v_user_id
  ) then raise exception 'Holding non trouvée'; end if;
  if not exists (
    select 1 from public.skyline_companies
    where id = p_company_id and user_id = v_user_id
  ) then raise exception 'Entreprise non trouvée'; end if;

  insert into public.skyline_company_holdings_link (holding_id, company_id)
  values (p_holding_id, p_company_id)
  on conflict (holding_id, company_id) do nothing;
end;
$$;

-- Délie une entreprise.
create or replace function public.skyline_unlink_company_from_holding(
  p_holding_id uuid,
  p_company_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  delete from public.skyline_company_holdings_link
    where holding_id = p_holding_id and company_id = p_company_id
      and exists (
        select 1 from public.skyline_holdings
        where id = p_holding_id and user_id = v_user_id
      );
end;
$$;

-- Transfert de cash entre 2 entreprises de la même holding.
create or replace function public.skyline_holding_transfer_cash(
  p_holding_id   uuid,
  p_from_company uuid,
  p_to_company   uuid,
  p_amount       numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if p_amount <= 0 then raise exception 'Montant invalide'; end if;
  if not exists (
    select 1 from public.skyline_holdings
    where id = p_holding_id and user_id = v_user_id
  ) then raise exception 'Holding non trouvée'; end if;

  if not exists (
    select 1 from public.skyline_company_holdings_link
    where holding_id = p_holding_id and company_id = p_from_company
  ) or not exists (
    select 1 from public.skyline_company_holdings_link
    where holding_id = p_holding_id and company_id = p_to_company
  ) then
    raise exception 'Les deux entreprises doivent être liées à la holding';
  end if;

  if (select cash from public.skyline_companies where id = p_from_company) < p_amount then
    raise exception 'Cash entreprise source insuffisant';
  end if;

  update public.skyline_companies
    set cash = cash - p_amount
    where id = p_from_company;
  update public.skyline_companies
    set cash = cash + p_amount
    where id = p_to_company;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values
    (v_user_id, p_from_company, 'other', -p_amount,
     'Transfert holding → autre entreprise'),
    (v_user_id, p_to_company, 'other', p_amount,
     'Transfert holding ← autre entreprise');
end;
$$;

-- Mettre une entreprise en vente.
create or replace function public.skyline_list_company_for_sale(
  p_company_id   uuid,
  p_asking_price numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  if p_asking_price <= 0 then raise exception 'Prix invalide'; end if;
  if not exists (
    select 1 from public.skyline_companies
    where id = p_company_id and user_id = v_user_id
  ) then raise exception 'Entreprise non trouvée'; end if;

  insert into public.skyline_companies_for_sale (company_id, asking_price)
  values (p_company_id, p_asking_price)
  on conflict (company_id) do update
    set asking_price = excluded.asking_price,
        listed_at = now();
end;
$$;

create or replace function public.skyline_unlist_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Non authentifié'; end if;
  delete from public.skyline_companies_for_sale
    where company_id = p_company_id
      and exists (
        select 1 from public.skyline_companies
        where id = p_company_id and user_id = v_user_id
      );
end;
$$;

-- Acheter une entreprise listée.
create or replace function public.skyline_buy_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id  uuid := auth.uid();
  v_listing   public.skyline_companies_for_sale%rowtype;
  v_company   public.skyline_companies%rowtype;
  v_seller_id uuid;
  v_buyer_cash numeric;
  v_existing_count int;
begin
  if v_buyer_id is null then raise exception 'Non authentifié'; end if;

  select * into v_listing from public.skyline_companies_for_sale
    where company_id = p_company_id;
  if not found then raise exception 'Entreprise non listée'; end if;

  select * into v_company from public.skyline_companies where id = p_company_id;
  if not found then raise exception 'Entreprise non trouvée'; end if;

  v_seller_id := v_company.user_id;
  if v_seller_id = v_buyer_id then
    raise exception 'Tu ne peux pas acheter ta propre entreprise';
  end if;

  select count(*) into v_existing_count
    from public.skyline_companies
    where user_id = v_buyer_id and sector = v_company.sector;
  if v_existing_count > 0 then
    raise exception 'Tu possèdes déjà une entreprise du secteur %', v_company.sector;
  end if;

  select cash into v_buyer_cash from public.skyline_profiles where user_id = v_buyer_id;
  if v_buyer_cash is null then
    perform public.skyline_init_profile();
    v_buyer_cash := 10000;
  end if;
  if v_buyer_cash < v_listing.asking_price then
    raise exception 'Cash insuffisant : il te manque % $',
      round(v_listing.asking_price - v_buyer_cash, 2);
  end if;

  update public.skyline_profiles
    set cash = cash - v_listing.asking_price, updated_at = now()
    where user_id = v_buyer_id;
  update public.skyline_profiles
    set cash = cash + v_listing.asking_price, updated_at = now()
    where user_id = v_seller_id;

  update public.skyline_companies
    set user_id = v_buyer_id, updated_at = now()
    where id = p_company_id;

  delete from public.skyline_company_holdings_link
    where company_id = p_company_id
      and holding_id in (
        select id from public.skyline_holdings where user_id = v_seller_id
      );

  delete from public.skyline_companies_for_sale where company_id = p_company_id;

  insert into public.skyline_transactions (user_id, company_id, kind, amount, description)
  values
    (v_buyer_id, p_company_id, 'other', -v_listing.asking_price,
     'Achat entreprise : ' || v_company.name),
    (v_seller_id, null, 'other', v_listing.asking_price,
     'Vente entreprise : ' || v_company.name);

  insert into public.skyline_news (kind, headline, body, sector, impact_pct)
  values ('npc_announce',
    '🏢 Cession : ' || v_company.name,
    v_company.name || ' (' || v_company.sector || ') change de propriétaire pour ' ||
    round(v_listing.asking_price) || '$.',
    v_company.sector, 0);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 29. P12 — CLASSEMENTS + ACHIEVEMENTS
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.skyline_update_leaderboard(p_user_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
  v_count int := 0;
  v_assets numeric;
  v_companies int;
  v_market_cap numeric;
  v_monthly_profit numeric;
begin
  for v_user in
    select user_id from public.skyline_profiles
    where (p_user_id is null or user_id = p_user_id)
  loop
    select coalesce(sum(cash + monthly_revenue * 6), 0) into v_assets
      from public.skyline_companies where user_id = v_user.user_id;
    select count(*) into v_companies
      from public.skyline_companies where user_id = v_user.user_id;
    select coalesce(sum(s.market_cap), 0) into v_market_cap
      from public.skyline_company_shares s
      inner join public.skyline_companies c on c.id = s.company_id
      where c.user_id = v_user.user_id;
    select coalesce(sum(monthly_revenue - monthly_expenses), 0) into v_monthly_profit
      from public.skyline_companies where user_id = v_user.user_id;

    declare v_user_cash numeric;
    begin
      select cash into v_user_cash from public.skyline_profiles where user_id = v_user.user_id;
      v_assets := v_assets + coalesce(v_user_cash, 0);
    end;

    insert into public.skyline_leaderboard (
      user_id, net_worth, monthly_profit, companies_count, market_cap_total
    )
    values (v_user.user_id, v_assets, v_monthly_profit, v_companies, v_market_cap)
    on conflict (user_id) do update
      set net_worth = excluded.net_worth,
          monthly_profit = excluded.monthly_profit,
          companies_count = excluded.companies_count,
          market_cap_total = excluded.market_cap_total,
          updated_at = now();

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create table if not exists public.skyline_achievements (
  user_id        uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.skyline_achievements enable row level security;

drop policy if exists "skyline_achievements_read_all" on public.skyline_achievements;
create policy "skyline_achievements_read_all"
  on public.skyline_achievements
  for select
  using (true);

drop policy if exists "skyline_achievements_write_own" on public.skyline_achievements;
create policy "skyline_achievements_write_own"
  on public.skyline_achievements
  for all
  using (auth.uid() = user_id);

create or replace function public.skyline_check_achievements()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_count int := 0;
  v_assets numeric;
  v_company_count int;
  v_companies_distinct_categories int;
  v_has_pharma_patent boolean;
  v_has_listed_company boolean;
  v_has_holding boolean;
  v_has_3_stars boolean;
  v_saas_users int;
  v_credit_score int;
begin
  if v_user_id is null then return 0; end if;

  perform public.skyline_update_leaderboard(v_user_id);

  select net_worth, companies_count into v_assets, v_company_count
    from public.skyline_leaderboard where user_id = v_user_id;

  select count(distinct category) into v_companies_distinct_categories
    from public.skyline_companies where user_id = v_user_id;

  select exists (
    select 1 from public.skyline_patents p
    inner join public.skyline_companies c on c.id = p.company_id
    where c.user_id = v_user_id and p.expires_at > now()
  ) into v_has_pharma_patent;

  select exists (
    select 1 from public.skyline_company_shares s
    inner join public.skyline_companies c on c.id = s.company_id
    where c.user_id = v_user_id and s.is_listed = true
  ) into v_has_listed_company;

  select exists (
    select 1 from public.skyline_holdings where user_id = v_user_id
  ) into v_has_holding;

  select exists (
    select 1 from public.skyline_restaurant_stars rs
    inner join public.skyline_companies c on c.id = rs.company_id
    where c.user_id = v_user_id and rs.stars >= 3
  ) into v_has_3_stars;

  select coalesce(sum(p.users_count), 0) into v_saas_users
    from public.skyline_saas_products p
    inner join public.skyline_companies c on c.id = p.company_id
    where c.user_id = v_user_id;

  select credit_score into v_credit_score
    from public.skyline_profiles where user_id = v_user_id;

  if v_company_count >= 1 then
    insert into public.skyline_achievements (user_id, achievement_id)
    values (v_user_id, 'first_company') on conflict do nothing;
  end if;
  if v_company_count >= 5 then
    insert into public.skyline_achievements (user_id, achievement_id)
    values (v_user_id, 'five_companies') on conflict do nothing;
  end if;
  if v_company_count >= 10 then
    insert into public.skyline_achievements (user_id, achievement_id)
    values (v_user_id, 'ten_companies') on conflict do nothing;
  end if;
  if v_companies_distinct_categories >= 4 then
    insert into public.skyline_achievements (user_id, achievement_id)
    values (v_user_id, 'all_categories') on conflict do nothing;
  end if;
  if v_assets >= 1000000 then
    insert into public.skyline_achievements (user_id, achievement_id)
    values (v_user_id, 'millionaire') on conflict do nothing;
  end if;
  if v_assets >= 100000000 then
    insert into public.skyline_achievements (user_id, achievement_id)
    values (v_user_id, 'hundred_millionaire') on conflict do nothing;
  end if;
  if v_assets >= 1000000000 then
    insert into public.skyline_achievements (user_id, achievement_id)
    values (v_user_id, 'billionaire') on conflict do nothing;
  end if;
  if v_has_pharma_patent then
    insert into public.skyline_achievements (user_id, achievement_id)
    values (v_user_id, 'pharma_patent') on conflict do nothing;
  end if;
  if v_has_listed_company then
    insert into public.skyline_achievements (user_id, achievement_id)
    values (v_user_id, 'ipo_done') on conflict do nothing;
  end if;
  if v_has_holding then
    insert into public.skyline_achievements (user_id, achievement_id)
    values (v_user_id, 'holding_creator') on conflict do nothing;
  end if;
  if v_has_3_stars then
    insert into public.skyline_achievements (user_id, achievement_id)
    values (v_user_id, 'three_stars') on conflict do nothing;
  end if;
  if v_saas_users >= 10000 then
    insert into public.skyline_achievements (user_id, achievement_id)
    values (v_user_id, 'saas_10k') on conflict do nothing;
  end if;
  if v_credit_score >= 800 then
    insert into public.skyline_achievements (user_id, achievement_id)
    values (v_user_id, 'excellent_credit') on conflict do nothing;
  end if;

  select count(*) into v_count
    from public.skyline_achievements where user_id = v_user_id;
  return v_count;
end;
$$;

