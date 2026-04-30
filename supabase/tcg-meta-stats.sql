-- TCG : statistiques meta agrégées (publiques) pour la page /meta.
--
-- Toutes les fonctions sont security definer + lecture seule + grant
-- public/anon — l'idée est d'avoir une page leaderboard/meta accessible
-- même aux invités.
--
-- Run après supabase/tcg-battles.sql.
-- ──────────────────────────────────────────────────────────────────────

-- ─── 1) Vue d'ensemble (4 chiffres) ───────────────────────────────────
create or replace function public.tcg_meta_overview(p_game_id text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total_matches', (
      select count(*) from public.battle_history where game_id = p_game_id
    ),
    'ranked_matches', (
      select count(*) from public.battle_history
      where game_id = p_game_id and ranked = true
    ),
    'active_players_24h', (
      select count(distinct id) from (
        select winner_id as id from public.battle_history
          where game_id = p_game_id and ended_at >= now() - interval '24 hours'
        union
        select loser_id as id from public.battle_history
          where game_id = p_game_id and ended_at >= now() - interval '24 hours'
      ) sub
    ),
    'total_decks', (
      select count(*) from public.tcg_decks where game_id = p_game_id
    ),
    'total_unique_players', (
      select count(distinct id) from (
        select winner_id as id from public.battle_history where game_id = p_game_id
        union
        select loser_id as id from public.battle_history where game_id = p_game_id
      ) sub
    )
  );
$$;

-- ─── 2) Top archétypes (deck names les + winrate, min 5 matches) ──────
create or replace function public.tcg_meta_top_archetypes(
  p_game_id text,
  p_limit int default 10
) returns table (
  deck_name text,
  matches int,
  wins int,
  losses int,
  winrate int
)
language sql
security definer
set search_path = public
as $$
  with all_matches as (
    select winner_deck_name as deck_name, true as won
    from public.battle_history
    where game_id = p_game_id and winner_deck_name is not null
    union all
    select loser_deck_name as deck_name, false as won
    from public.battle_history
    where game_id = p_game_id and loser_deck_name is not null
  ),
  agg as (
    select
      deck_name,
      count(*)::int as matches,
      count(*) filter (where won)::int as wins,
      count(*) filter (where not won)::int as losses
    from all_matches
    where deck_name is not null and length(trim(deck_name)) > 0
    group by deck_name
  )
  select deck_name, matches, wins, losses,
    case when matches > 0 then round(wins::numeric * 100 / matches)::int else 0 end as winrate
  from agg
  where matches >= 5
  order by winrate desc, matches desc
  limit p_limit;
$$;

-- ─── 3) Cartes les + jouées dans les decks (any user) ─────────────────
-- Compte chaque (card_id, count) dans les decks du jeu, pondéré par count.
create or replace function public.tcg_meta_top_cards(
  p_game_id text,
  p_limit int default 20
) returns table (
  card_id text,
  decks_count int,
  total_copies int
)
language sql
security definer
set search_path = public
as $$
  select
    (entry->>'card_id')::text as card_id,
    count(distinct d.id)::int as decks_count,
    sum((entry->>'count')::int)::int as total_copies
  from public.tcg_decks d,
       jsonb_array_elements(d.cards) as entry
  where d.game_id = p_game_id
    and (entry->>'card_id') is not null
  group by (entry->>'card_id')
  order by total_copies desc, decks_count desc
  limit p_limit;
$$;

-- ─── 4) Top 10 joueurs all-time (par ELO actuel) ──────────────────────
create or replace function public.tcg_meta_top_players(
  p_game_id text,
  p_limit int default 10
) returns table (
  user_id uuid,
  username text,
  avatar_url text,
  elo int,
  ranked_wins int,
  ranked_losses int,
  total_matches int
)
language sql
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.username,
    p.avatar_url,
    coalesce((p.tcg_elo->>p_game_id)::int, 1000) as elo,
    (select count(*)::int from public.battle_history bh
      where bh.game_id = p_game_id and bh.ranked = true and bh.winner_id = p.id) as ranked_wins,
    (select count(*)::int from public.battle_history bh
      where bh.game_id = p_game_id and bh.ranked = true and bh.loser_id = p.id) as ranked_losses,
    (select count(*)::int from public.battle_history bh
      where bh.game_id = p_game_id and (bh.winner_id = p.id or bh.loser_id = p.id)) as total_matches
  from public.profiles p
  where exists (
    select 1 from public.battle_history bh
    where bh.game_id = p_game_id
      and (bh.winner_id = p.id or bh.loser_id = p.id)
  )
  order by elo desc
  limit p_limit;
$$;

-- ─── 5) Grants publics ────────────────────────────────────────────────
grant execute on function public.tcg_meta_overview(text) to authenticated, anon;
grant execute on function public.tcg_meta_top_archetypes(text, int) to authenticated, anon;
grant execute on function public.tcg_meta_top_cards(text, int) to authenticated, anon;
grant execute on function public.tcg_meta_top_players(text, int) to authenticated, anon;
