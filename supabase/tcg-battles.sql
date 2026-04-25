-- Battle history + ELO ranking for TCG matches.
-- Run after supabase/tcg.sql.

-- ──────────────────────────────────────────────────────────────────────
-- Per-game ELO stored as JSONB on profiles (default 1000 per game).
-- ──────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists tcg_elo jsonb not null default '{}'::jsonb;

-- ──────────────────────────────────────────────────────────────────────
-- battle_history : 1 row per finished match (PvP fun OR ranked, NOT bot).
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.battle_history (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  winner_id uuid not null references auth.users(id) on delete cascade,
  loser_id uuid not null references auth.users(id) on delete cascade,
  winner_username text not null,
  loser_username text not null,
  winner_deck_name text,
  loser_deck_name text,
  ranked boolean not null default false,
  winner_elo_before int,
  winner_elo_after int,
  loser_elo_before int,
  loser_elo_after int,
  reason text,
  ended_at timestamptz not null default now()
);

create index if not exists battle_history_winner_idx
  on public.battle_history (winner_id, ended_at desc);
create index if not exists battle_history_loser_idx
  on public.battle_history (loser_id, ended_at desc);
create index if not exists battle_history_game_idx
  on public.battle_history (game_id, ended_at desc);

alter table public.battle_history enable row level security;

drop policy if exists "battle_history_read_own" on public.battle_history;
create policy "battle_history_read_own"
  on public.battle_history
  for select
  using (auth.uid() = winner_id or auth.uid() = loser_id);

-- ──────────────────────────────────────────────────────────────────────
-- record_battle_result : insère l'historique + met à jour l'ELO si ranked.
-- Appelé par PartyKit (service_role) à la fin d'un match PvP.
-- Retourne { winner_elo_before, winner_elo_after, loser_elo_before, loser_elo_after }.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.record_battle_result(
  p_game_id text,
  p_winner_id uuid,
  p_loser_id uuid,
  p_winner_username text,
  p_loser_username text,
  p_winner_deck_name text,
  p_loser_deck_name text,
  p_ranked boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w_elo int;
  l_elo int;
  k int := 32;
  expected_w numeric;
  w_new int;
  l_new int;
begin
  select coalesce((tcg_elo->>p_game_id)::int, 1000) into w_elo
  from public.profiles where id = p_winner_id for update;
  select coalesce((tcg_elo->>p_game_id)::int, 1000) into l_elo
  from public.profiles where id = p_loser_id for update;

  if p_ranked then
    expected_w := 1.0 / (1.0 + power(10.0, (l_elo - w_elo) / 400.0));
    w_new := w_elo + round(k * (1 - expected_w));
    l_new := greatest(0, l_elo + round(k * (0 - (1 - expected_w))));

    update public.profiles
    set tcg_elo = jsonb_set(
      coalesce(tcg_elo, '{}'::jsonb),
      array[p_game_id],
      to_jsonb(w_new)
    ),
    updated_at = now()
    where id = p_winner_id;

    update public.profiles
    set tcg_elo = jsonb_set(
      coalesce(tcg_elo, '{}'::jsonb),
      array[p_game_id],
      to_jsonb(l_new)
    ),
    updated_at = now()
    where id = p_loser_id;
  else
    w_new := w_elo;
    l_new := l_elo;
  end if;

  insert into public.battle_history (
    game_id,
    winner_id, loser_id,
    winner_username, loser_username,
    winner_deck_name, loser_deck_name,
    ranked,
    winner_elo_before, winner_elo_after,
    loser_elo_before, loser_elo_after,
    reason
  ) values (
    p_game_id,
    p_winner_id, p_loser_id,
    p_winner_username, p_loser_username,
    p_winner_deck_name, p_loser_deck_name,
    p_ranked,
    w_elo, w_new,
    l_elo, l_new,
    p_reason
  );

  return jsonb_build_object(
    'winner_elo_before', w_elo,
    'winner_elo_after', w_new,
    'loser_elo_before', l_elo,
    'loser_elo_after', l_new
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- get_tcg_player_stats : aggrégats pour la page Stats.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.get_tcg_player_stats(
  p_user_id uuid,
  p_game_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_elo int;
  total int;
  wins int;
  losses int;
  ranked_total int;
  ranked_wins int;
begin
  select coalesce((tcg_elo->>p_game_id)::int, 1000) into cur_elo
  from public.profiles where id = p_user_id;

  select count(*) into total
  from public.battle_history
  where game_id = p_game_id
    and (winner_id = p_user_id or loser_id = p_user_id);

  select count(*) into wins
  from public.battle_history
  where game_id = p_game_id and winner_id = p_user_id;

  losses := total - wins;

  select count(*) into ranked_total
  from public.battle_history
  where game_id = p_game_id
    and ranked = true
    and (winner_id = p_user_id or loser_id = p_user_id);

  select count(*) into ranked_wins
  from public.battle_history
  where game_id = p_game_id and ranked = true and winner_id = p_user_id;

  return jsonb_build_object(
    'elo', cur_elo,
    'total', total,
    'wins', wins,
    'losses', losses,
    'ranked_total', ranked_total,
    'ranked_wins', ranked_wins
  );
end;
$$;
