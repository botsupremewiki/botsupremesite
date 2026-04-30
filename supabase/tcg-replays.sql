-- TCG : sauvegarde du log textuel de chaque match PvP pour pouvoir
-- afficher un "replay" stepper (Match Log).
--
-- v1 minimaliste : on stocke juste le log textuel ligne par ligne. Pas
-- de snapshots d'état complet (trop volumineux pour le free tier
-- Supabase). Suffit pour avoir un récap pas-à-pas du match.
--
-- Run après supabase/tcg-battles.sql.
-- ──────────────────────────────────────────────────────────────────────

create table if not exists public.tcg_replays (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  battle_id uuid,                              -- lien optionnel vers battle_history
  winner_id uuid references auth.users(id) on delete set null,
  loser_id uuid references auth.users(id) on delete set null,
  winner_username text not null,
  loser_username text not null,
  winner_deck_name text,
  loser_deck_name text,
  ranked boolean not null default false,
  duration_seconds int,
  log text[] not null default '{}'::text[],
  ended_at timestamptz not null default now()
);
create index if not exists tcg_replays_game_idx
  on public.tcg_replays (game_id, ended_at desc);
create index if not exists tcg_replays_winner_idx
  on public.tcg_replays (winner_id, ended_at desc);
create index if not exists tcg_replays_loser_idx
  on public.tcg_replays (loser_id, ended_at desc);

alter table public.tcg_replays enable row level security;
-- Lecture publique : un replay est de facto consultable par tout le monde
-- (les pseudos sont déjà publics, le log ne révèle pas la main cachée
-- des joueurs).
drop policy if exists "tcg_replays_read_all" on public.tcg_replays;
create policy "tcg_replays_read_all"
  on public.tcg_replays for select using (true);

-- Pas de policy INSERT : seul service_role (PartyKit) écrit.

-- RPC : liste des replays pour un user (sender ou recipient).
create or replace function public.list_my_replays(p_game_id text default null)
returns table (
  id uuid,
  game_id text,
  winner_username text,
  loser_username text,
  winner_deck_name text,
  loser_deck_name text,
  ranked boolean,
  duration_seconds int,
  ended_at timestamptz,
  i_won boolean
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.game_id,
         r.winner_username, r.loser_username,
         r.winner_deck_name, r.loser_deck_name,
         r.ranked, r.duration_seconds, r.ended_at,
         (r.winner_id = auth.uid()) as i_won
  from public.tcg_replays r
  where (r.winner_id = auth.uid() or r.loser_id = auth.uid())
    and (p_game_id is null or r.game_id = p_game_id)
  order by r.ended_at desc
  limit 50;
$$;

grant execute on function public.list_my_replays(text) to authenticated;
