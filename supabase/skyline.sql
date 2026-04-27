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
