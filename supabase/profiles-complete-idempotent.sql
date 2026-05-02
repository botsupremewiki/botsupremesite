-- Fichier SQL 100% idempotent qui (re)crée la table `profiles` complète
-- avec TOUTES les colonnes ajoutées par les migrations qui la touchent.
--
-- Safe à re-exécuter autant de fois que nécessaire :
--   • CREATE TABLE IF NOT EXISTS         → ne touche rien si la table existe
--   • ADD COLUMN IF NOT EXISTS           → ne touche rien si la colonne existe
--   • CREATE OR REPLACE FUNCTION         → remplace la fonction (pas les data)
--   • DROP POLICY IF EXISTS + CREATE     → recrée la policy proprement
--   • DROP TRIGGER IF EXISTS + CREATE    → recrée le trigger proprement
--
-- Aucune ligne de données n'est supprimée. Aucun DROP TABLE / DELETE / TRUNCATE.
--
-- À copier-coller dans le SQL editor Supabase et exécuter en une fois.
-- ──────────────────────────────────────────────────────────────────────

-- 1) Table de base ────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  avatar_url text,
  gold bigint not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Colonnes ajoutées par les migrations annexes ─────────────────────
-- Onboarding (popup "Bienvenue sur Site Ultime !")
alter table public.profiles
  add column if not exists onboarded_at timestamptz;

-- Admin flag
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Customisation visuelle plaza
alter table public.profiles
  add column if not exists appearance jsonb;

-- Sync Discord
alter table public.profiles
  add column if not exists discord_id text,
  add column if not exists discord_nick text,
  add column if not exists discord_global_name text,
  add column if not exists discord_roles text[],
  add column if not exists discord_synced_at timestamptz;

-- Achievements épinglés sur le profil public
alter table public.profiles
  add column if not exists pinned_achievements text[] not null default '{}'::text[];

-- TCG : ELO par jeu
alter table public.profiles
  add column if not exists tcg_elo jsonb not null default '{}'::jsonb;

-- TCG : free packs (10 packs offerts au premier login)
alter table public.profiles
  add column if not exists tcg_free_packs jsonb not null default '{}'::jsonb;

-- TCG : état des quêtes quotidiennes
alter table public.profiles
  add column if not exists tcg_quest_state jsonb not null default '{}'::jsonb;

-- TCG : titre cosmétique custom
alter table public.profiles
  add column if not exists cosmetic_title text;

-- TCG : bordure d'avatar cosmétique
alter table public.profiles
  add column if not exists cosmetic_avatar_border text;

-- TCG One Piece : cosmétiques actifs (avatar Leader / sleeve / playmat par jeu)
alter table public.profiles
  add column if not exists tcg_cosmetics_active jsonb not null default '{}'::jsonb;

-- Préférences user (sons, animations, etc.)
alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;

-- TCG : crystals Wonder Pick
alter table public.profiles
  add column if not exists wonder_pick_crystals int not null default 0;

-- 3) Index ────────────────────────────────────────────────────────────
create index if not exists profiles_discord_id_idx
  on public.profiles (discord_id)
  where discord_id is not null;

-- 4) RLS ──────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all"
  on public.profiles
  for select
  using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id);

-- 5) Trigger : auto-création du profile au signup OAuth Discord ───────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'user_name',
      'Joueur-' || substring(new.id::text, 1, 6)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6) RPC complete_onboarding() — utilisée par le bouton "Passer / Terminer"
create or replace function public.complete_onboarding()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return; end if;
  update public.profiles
  set onboarded_at = coalesce(onboarded_at, now()),
      updated_at = now()
  where id = v_user_id;
end;
$$;

grant execute on function public.complete_onboarding() to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- Vérif rapide post-exécution (à lancer à la main après) :
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--   order by ordinal_position;
-- → Tu dois voir au minimum : onboarded_at, complete_onboarding() existante.
-- ──────────────────────────────────────────────────────────────────────
