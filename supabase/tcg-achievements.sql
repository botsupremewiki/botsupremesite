-- TCG : achievements (badges) débloquables.
-- Run après supabase/tcg-battles.sql.
-- ──────────────────────────────────────────────────────────────────────

-- Table : 1 row par (user, game, achievement). UPSERT côté serveur
-- via try_unlock_achievement → INSERT ON CONFLICT DO NOTHING.
create table if not exists public.tcg_achievements_unlocked (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, game_id, achievement_id)
);

create index if not exists tcg_achievements_user_idx
  on public.tcg_achievements_unlocked (user_id, game_id, unlocked_at desc);

alter table public.tcg_achievements_unlocked enable row level security;

drop policy if exists "tcg_achievements_read_own" on public.tcg_achievements_unlocked;
create policy "tcg_achievements_read_own"
  on public.tcg_achievements_unlocked
  for select
  using (auth.uid() = user_id);

-- RPC : try_unlock_achievement
-- Insert si pas déjà unlock. Retourne true si nouvellement unlock, false sinon.
create or replace function public.try_unlock_achievement(
  p_user_id uuid,
  p_game_id text,
  p_achievement_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted int;
begin
  insert into public.tcg_achievements_unlocked (user_id, game_id, achievement_id)
  values (p_user_id, p_game_id, p_achievement_id)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted > 0;
end;
$$;

-- RPC : get_user_achievements
-- Liste les achievements unlock + leur date.
create or replace function public.get_user_achievements(
  p_user_id uuid,
  p_game_id text
) returns table (achievement_id text, unlocked_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select achievement_id, unlocked_at
  from public.tcg_achievements_unlocked
  where user_id = p_user_id and game_id = p_game_id
  order by unlocked_at desc;
$$;

-- RPC : get_user_battle_aggregates
-- Stats agrégées nécessaires pour les checks d'achievements côté serveur.
-- Renvoie un JSON avec : totalMatches, wins, losses, rankedWins, elo,
-- winningDecks (array unique), bestWinStreak (calculé sur l'historique).
create or replace function public.get_user_battle_aggregates(
  p_user_id uuid,
  p_game_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  total int;
  wins int;
  losses int;
  ranked_wins int;
  elo int;
  winning_decks jsonb;
  best_streak int;
  current_streak int := 0;
  rec record;
begin
  select coalesce((tcg_elo->>p_game_id)::int, 1000) into elo
  from public.profiles where id = p_user_id;

  select count(*) into total
  from public.battle_history
  where game_id = p_game_id
    and (winner_id = p_user_id or loser_id = p_user_id);

  select count(*) into wins
  from public.battle_history
  where game_id = p_game_id and winner_id = p_user_id;

  losses := total - wins;

  select count(*) into ranked_wins
  from public.battle_history
  where game_id = p_game_id
    and ranked = true
    and winner_id = p_user_id;

  -- Decks gagnants uniques (jsonb array de strings).
  select coalesce(jsonb_agg(distinct winner_deck_name), '[]'::jsonb)
    into winning_decks
  from public.battle_history
  where game_id = p_game_id
    and winner_id = p_user_id
    and winner_deck_name is not null;

  -- Best win streak : on parcourt les matches du joueur dans l'ordre
  -- chronologique. À chaque win → +1, à chaque loss → reset à 0.
  best_streak := 0;
  for rec in
    select winner_id = p_user_id as is_win
    from public.battle_history
    where game_id = p_game_id
      and (winner_id = p_user_id or loser_id = p_user_id)
    order by ended_at asc
  loop
    if rec.is_win then
      current_streak := current_streak + 1;
      if current_streak > best_streak then
        best_streak := current_streak;
      end if;
    else
      current_streak := 0;
    end if;
  end loop;

  return jsonb_build_object(
    'totalMatches', total,
    'wins', wins,
    'losses', losses,
    'rankedWins', ranked_wins,
    'elo', elo,
    'winningDecks', winning_decks,
    'bestWinStreak', best_streak
  );
end;
$$;

-- RPC : get_user_deck_winrates
-- Pour chaque deck avec lequel le joueur a joué (en tant que gagnant
-- OU perdant), retourne wins/losses. Permet d'afficher les decks favoris.
create or replace function public.get_user_deck_winrates(
  p_user_id uuid,
  p_game_id text
) returns table (
  deck_name text,
  wins bigint,
  losses bigint,
  total bigint
)
language sql
security definer
set search_path = public
as $$
  with combined as (
    select winner_deck_name as deck_name, 1 as is_win, 0 as is_loss
    from public.battle_history
    where game_id = p_game_id
      and winner_id = p_user_id
      and winner_deck_name is not null
    union all
    select loser_deck_name as deck_name, 0, 1
    from public.battle_history
    where game_id = p_game_id
      and loser_id = p_user_id
      and loser_deck_name is not null
  )
  select
    deck_name,
    sum(is_win)::bigint as wins,
    sum(is_loss)::bigint as losses,
    count(*)::bigint as total
  from combined
  group by deck_name
  having count(*) > 0
  order by sum(is_win) desc, count(*) desc;
$$;
