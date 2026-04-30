-- Migration : logs persistents des matchs One Piece TCG.
--
-- Stocke le journal complet d'une partie (toutes les lignes pushLog) pour
-- audit post-mortem / debug / replay basique. Insert atomique en fin de
-- match via record_battle_logs (security definer).
--
-- À lancer une seule fois dans le SQL editor Supabase. Re-runnable safe.

create table if not exists public.battle_logs (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  -- Lié au battle_history (1-1) : null si bot mode (bot match n'écrit
  -- pas dans battle_history) — on enregistre quand même pour debug.
  battle_history_id uuid references public.battle_history(id) on delete cascade,
  room_id text not null,
  p1_id uuid references auth.users(id) on delete set null,
  p2_id uuid references auth.users(id) on delete set null,
  p1_username text not null,
  p2_username text not null,
  p1_deck_name text,
  p2_deck_name text,
  p1_leader_id text,
  p2_leader_id text,
  -- Lignes du log : tableau de strings (1 ligne par event push log).
  log jsonb not null default '[]'::jsonb,
  -- Métadonnées finales.
  winner_seat text, -- "p1" / "p2" / null si abandon serveur
  reason text,
  ranked boolean not null default false,
  bot_mode boolean not null default false,
  turn_count int not null default 0,
  duration_ms int not null default 0,
  ended_at timestamptz not null default now()
);

create index if not exists battle_logs_p1_idx
  on public.battle_logs (p1_id, ended_at desc);
create index if not exists battle_logs_p2_idx
  on public.battle_logs (p2_id, ended_at desc);
create index if not exists battle_logs_game_idx
  on public.battle_logs (game_id, ended_at desc);
create index if not exists battle_logs_history_idx
  on public.battle_logs (battle_history_id);

alter table public.battle_logs enable row level security;

drop policy if exists "battle_logs_read_own" on public.battle_logs;
create policy "battle_logs_read_own"
  on public.battle_logs
  for select
  using (auth.uid() = p1_id or auth.uid() = p2_id);

drop policy if exists "battle_logs_admin_read" on public.battle_logs;
create policy "battle_logs_admin_read"
  on public.battle_logs
  for select
  using (
    (select coalesce(is_admin, false) from public.profiles where id = auth.uid())
  );

-- ──────────────────────────────────────────────────────────────────────
-- record_battle_logs : insert atomique du log + métadonnées du match.
-- Appelé par PartyKit (service_role) à la fin d'un match.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.record_battle_logs(
  p_game_id text,
  p_battle_history_id uuid,
  p_room_id text,
  p_p1_id uuid,
  p_p2_id uuid,
  p_p1_username text,
  p_p2_username text,
  p_p1_deck_name text,
  p_p2_deck_name text,
  p_p1_leader_id text,
  p_p2_leader_id text,
  p_log jsonb,
  p_winner_seat text,
  p_reason text,
  p_ranked boolean,
  p_bot_mode boolean,
  p_turn_count int,
  p_duration_ms int
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.battle_logs (
    game_id,
    battle_history_id,
    room_id,
    p1_id,
    p2_id,
    p1_username,
    p2_username,
    p1_deck_name,
    p2_deck_name,
    p1_leader_id,
    p2_leader_id,
    log,
    winner_seat,
    reason,
    ranked,
    bot_mode,
    turn_count,
    duration_ms
  ) values (
    p_game_id,
    p_battle_history_id,
    p_room_id,
    p_p1_id,
    p_p2_id,
    p_p1_username,
    p_p2_username,
    p_p1_deck_name,
    p_p2_deck_name,
    p_p1_leader_id,
    p_p2_leader_id,
    p_log,
    p_winner_seat,
    p_reason,
    p_ranked,
    p_bot_mode,
    p_turn_count,
    p_duration_ms
  ) returning id into new_id;
  return new_id;
end;
$$;
