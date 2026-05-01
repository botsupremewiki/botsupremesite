-- Helper RPC pour la timeline ELO d'un joueur (utilisé par <Sparkline />).
-- Utilise les snapshots déjà stockés dans battle_history (winner_elo_after,
-- loser_elo_after) pour reconstruire la courbe.
--
-- Run après supabase/tcg-battles.sql.
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.get_my_elo_history(
  p_game_id text,
  p_limit int default 50
) returns table (
  ended_at timestamptz,
  elo int
)
language sql
security definer
set search_path = public
as $$
  with my_battles as (
    select
      bh.ended_at,
      case
        when bh.winner_id = auth.uid() then bh.winner_elo_after
        when bh.loser_id = auth.uid() then bh.loser_elo_after
      end as elo
    from public.battle_history bh
    where bh.game_id = p_game_id
      and bh.ranked = true
      and (bh.winner_id = auth.uid() or bh.loser_id = auth.uid())
    order by bh.ended_at desc
    limit p_limit
  )
  select ended_at, elo
  from my_battles
  where elo is not null
  order by ended_at asc;
$$;

grant execute on function public.get_my_elo_history(text, int) to authenticated;
