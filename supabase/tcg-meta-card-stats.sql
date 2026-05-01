-- Stats par carte : winrate de chaque carte basé sur les decks gagnants
-- vs perdants. Utilise battle_history pour l'issue + tcg_decks pour le
-- contenu. Lourd à calculer en lecture, donc on stocke un cache
-- dans une matérialized view qu'on refresh périodiquement.
--
-- Run après supabase/tcg-meta-stats.sql.
-- ──────────────────────────────────────────────────────────────────────

-- Matérialized view : pour chaque (game_id, card_id), agrège games_won /
-- games_lost / games_total dans des decks où la carte est présente.
drop materialized view if exists public.tcg_meta_card_stats_mv;
create materialized view public.tcg_meta_card_stats_mv as
with deck_cards_per_battle as (
  -- Pour chaque battle, expand les cartes du deck du gagnant et du perdant
  select
    bh.id as battle_id,
    bh.game_id,
    bh.winner_id, bh.loser_id,
    bh.winner_deck_name, bh.loser_deck_name,
    bh.ended_at
  from public.battle_history bh
),
expanded as (
  -- Winner side : on cherche le deck du gagnant via name (best effort).
  select
    b.game_id,
    (entry->>'card_id')::text as card_id,
    true as won
  from deck_cards_per_battle b
  join public.tcg_decks d
    on d.user_id = b.winner_id
   and d.game_id = b.game_id
   and d.name = b.winner_deck_name
  cross join lateral jsonb_array_elements(d.cards) as entry
  union all
  select
    b.game_id,
    (entry->>'card_id')::text as card_id,
    false as won
  from deck_cards_per_battle b
  join public.tcg_decks d
    on d.user_id = b.loser_id
   and d.game_id = b.game_id
   and d.name = b.loser_deck_name
  cross join lateral jsonb_array_elements(d.cards) as entry
)
select
  game_id,
  card_id,
  count(*)::int as total,
  count(*) filter (where won)::int as wins,
  count(*) filter (where not won)::int as losses
from expanded
where card_id is not null
group by game_id, card_id;

create unique index if not exists tcg_meta_card_stats_mv_pk
  on public.tcg_meta_card_stats_mv (game_id, card_id);

-- ─── RPC : stats par carte ────────────────────────────────────────────
-- Lecture publique (anon ok), retour trié par winrate avec min de matches.
create or replace function public.tcg_meta_card_winrates(
  p_game_id text,
  p_min_matches int default 10,
  p_limit int default 30
) returns table (
  card_id text,
  total int,
  wins int,
  losses int,
  winrate int
)
language sql
security definer
set search_path = public
as $$
  select
    s.card_id,
    s.total,
    s.wins,
    s.losses,
    case when s.total > 0
      then round(s.wins::numeric * 100 / s.total)::int
      else 0
    end as winrate
  from public.tcg_meta_card_stats_mv s
  where s.game_id = p_game_id and s.total >= p_min_matches
  order by winrate desc, s.total desc
  limit p_limit;
$$;

-- ─── RPC : refresh la matérialized view (à appeler par cron) ──────────
create or replace function public.refresh_tcg_meta_card_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view public.tcg_meta_card_stats_mv;
end;
$$;

grant execute on function public.tcg_meta_card_winrates(text, int, int) to authenticated, anon;
revoke execute on function public.refresh_tcg_meta_card_stats() from public, authenticated, anon;
