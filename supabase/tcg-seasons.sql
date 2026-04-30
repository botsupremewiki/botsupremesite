-- TCG : saisons ranked + reset mensuel + récompenses.
--
-- Concept :
--  • Chaque mois calendaire = 1 saison par game_id.
--  • Quand on clôture la saison N, on snapshot l'ELO/rank de tous les
--    joueurs ranked dans tcg_season_results (avec un tier bronze→master),
--    puis on soft-reset l'ELO de tout le monde vers une moyenne et on
--    ouvre la saison N+1.
--  • Les joueurs viennent claim leurs récompenses (OS + boosters) sur la
--    page /play/tcg/<game>/seasons. Les claims sont idempotents.
--
-- Run après supabase/tcg-battles.sql et supabase/tcg-onepiece-rewards.sql.
-- ──────────────────────────────────────────────────────────────────────

-- ─── 1) Table tcg_seasons ─────────────────────────────────────────────
create table if not exists public.tcg_seasons (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  season_number int not null,
  start_at timestamptz not null default now(),
  end_at timestamptz,                          -- null = saison en cours
  is_current boolean not null default true,
  unique (game_id, season_number)
);
create index if not exists tcg_seasons_game_current_idx
  on public.tcg_seasons (game_id, is_current desc, season_number desc);
alter table public.tcg_seasons enable row level security;
drop policy if exists "tcg_seasons_read_all" on public.tcg_seasons;
create policy "tcg_seasons_read_all"
  on public.tcg_seasons for select using (true);

-- ─── 2) Table tcg_season_results ──────────────────────────────────────
create table if not exists public.tcg_season_results (
  season_id uuid not null references public.tcg_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  final_elo int not null,
  final_rank int,                              -- position dans le classement saison
  tier text not null,                          -- bronze/silver/gold/platinum/diamond/master
  ranked_wins int not null default 0,
  ranked_losses int not null default 0,
  gold_reward int not null default 0,
  pack_reward int not null default 0,
  rewards_claimed boolean not null default false,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (season_id, user_id)
);
create index if not exists tcg_season_results_user_idx
  on public.tcg_season_results (user_id, created_at desc);
create index if not exists tcg_season_results_season_rank_idx
  on public.tcg_season_results (season_id, final_rank asc);
alter table public.tcg_season_results enable row level security;
drop policy if exists "tcg_season_results_read_all" on public.tcg_season_results;
create policy "tcg_season_results_read_all"
  on public.tcg_season_results for select using (true);

-- ─── 3) Helper : tier d'un ELO ────────────────────────────────────────
create or replace function public.tcg_tier_for_elo(p_elo int)
returns text
language sql
immutable
as $$
  select case
    when p_elo >= 1600 then 'master'
    when p_elo >= 1400 then 'diamond'
    when p_elo >= 1200 then 'platinum'
    when p_elo >= 1000 then 'gold'
    when p_elo >= 800  then 'silver'
    else 'bronze'
  end;
$$;

-- ─── 4) Helper : récompenses associées au tier ────────────────────────
create or replace function public.tcg_rewards_for_tier(p_tier text)
returns jsonb
language sql
immutable
as $$
  select case p_tier
    when 'master'   then jsonb_build_object('gold', 5000, 'packs', 10)
    when 'diamond'  then jsonb_build_object('gold', 2000, 'packs', 3)
    when 'platinum' then jsonb_build_object('gold', 1000, 'packs', 1)
    when 'gold'     then jsonb_build_object('gold',  500, 'packs', 0)
    when 'silver'   then jsonb_build_object('gold',  200, 'packs', 0)
    else jsonb_build_object('gold', 100, 'packs', 0)
  end;
$$;

-- ─── 5) RPC : get_current_season ──────────────────────────────────────
-- Retourne la saison en cours pour un game_id. Si aucune n'existe encore,
-- en crée une (saison #1).
create or replace function public.get_current_season(p_game_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select id, season_number, start_at, end_at
    into v_row
  from public.tcg_seasons
  where game_id = p_game_id and is_current = true
  order by season_number desc
  limit 1;
  if v_row is null then
    insert into public.tcg_seasons (game_id, season_number, is_current)
    values (p_game_id, 1, true)
    returning id, season_number, start_at, end_at into v_row;
  end if;
  return jsonb_build_object(
    'id', v_row.id,
    'season_number', v_row.season_number,
    'start_at', v_row.start_at,
    'end_at', v_row.end_at
  );
end;
$$;

-- ─── 6) RPC : get_season_leaderboard ──────────────────────────────────
-- Top N joueurs (ELO actuel) pour la saison en cours, OU classement
-- archivé pour les saisons closes.
create or replace function public.get_season_leaderboard(
  p_game_id text,
  p_season_id uuid default null,
  p_limit int default 100
) returns table (
  rank int,
  user_id uuid,
  username text,
  avatar_url text,
  elo int,
  tier text,
  ranked_wins int,
  ranked_losses int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_season_id is null then
    -- Classement live : ELO actuel des profils ayant joué au moins
    -- 1 ranked dans le game.
    return query
    select
      (row_number() over (order by coalesce((p.tcg_elo->>p_game_id)::int, 1000) desc))::int as rank,
      p.id as user_id,
      p.username,
      p.avatar_url,
      coalesce((p.tcg_elo->>p_game_id)::int, 1000) as elo,
      public.tcg_tier_for_elo(coalesce((p.tcg_elo->>p_game_id)::int, 1000)) as tier,
      (select count(*)::int from public.battle_history bh
        where bh.game_id = p_game_id and bh.ranked = true and bh.winner_id = p.id) as ranked_wins,
      (select count(*)::int from public.battle_history bh
        where bh.game_id = p_game_id and bh.ranked = true and bh.loser_id = p.id) as ranked_losses
    from public.profiles p
    where exists (
      select 1 from public.battle_history bh
      where bh.game_id = p_game_id and bh.ranked = true
        and (bh.winner_id = p.id or bh.loser_id = p.id)
    )
    order by elo desc
    limit p_limit;
  else
    -- Classement archivé.
    return query
    select
      r.final_rank as rank,
      r.user_id,
      p.username,
      p.avatar_url,
      r.final_elo as elo,
      r.tier,
      r.ranked_wins,
      r.ranked_losses
    from public.tcg_season_results r
    join public.profiles p on p.id = r.user_id
    where r.season_id = p_season_id
    order by r.final_rank asc nulls last
    limit p_limit;
  end if;
end;
$$;

-- ─── 7) RPC : close_current_season_and_open_next ──────────────────────
-- Snapshot tous les joueurs ranked, calcule rewards, soft-reset ELO,
-- ouvre la saison suivante. Idempotent par month-année (skip si la
-- saison courante a moins de 25 jours).
--
-- ⚠ À appeler avec service_role (cron Vercel) ou via SQL Editor en admin.
create or replace function public.close_current_season_and_open_next(
  p_game_id text,
  p_force boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current record;
  v_now timestamptz := now();
  v_age_days numeric;
  v_new_season uuid;
  v_count int := 0;
begin
  select id, season_number, start_at
    into v_current
  from public.tcg_seasons
  where game_id = p_game_id and is_current = true
  order by season_number desc
  limit 1;
  if v_current is null then
    insert into public.tcg_seasons (game_id, season_number, is_current)
    values (p_game_id, 1, true);
    return jsonb_build_object('opened_first_season', true);
  end if;

  v_age_days := extract(epoch from (v_now - v_current.start_at)) / 86400.0;
  if not p_force and v_age_days < 25 then
    return jsonb_build_object(
      'skipped', true,
      'reason', 'season too young',
      'age_days', v_age_days
    );
  end if;

  -- Snapshot tous les joueurs qui ont au moins 1 ranked dans cette saison.
  with ranked_players as (
    select p.id as user_id,
           coalesce((p.tcg_elo->>p_game_id)::int, 1000) as elo,
           (select count(*)::int from public.battle_history bh
             where bh.game_id = p_game_id and bh.ranked = true
               and bh.ended_at >= v_current.start_at
               and bh.winner_id = p.id) as r_wins,
           (select count(*)::int from public.battle_history bh
             where bh.game_id = p_game_id and bh.ranked = true
               and bh.ended_at >= v_current.start_at
               and bh.loser_id = p.id) as r_losses
    from public.profiles p
    where exists (
      select 1 from public.battle_history bh
      where bh.game_id = p_game_id and bh.ranked = true
        and bh.ended_at >= v_current.start_at
        and (bh.winner_id = p.id or bh.loser_id = p.id)
    )
  ),
  ranked_with_pos as (
    select user_id, elo, r_wins, r_losses,
           (row_number() over (order by elo desc))::int as pos
    from ranked_players
  )
  insert into public.tcg_season_results (
    season_id, user_id, game_id, final_elo, final_rank, tier,
    ranked_wins, ranked_losses, gold_reward, pack_reward
  )
  select
    v_current.id, rp.user_id, p_game_id, rp.elo, rp.pos,
    public.tcg_tier_for_elo(rp.elo),
    rp.r_wins, rp.r_losses,
    (public.tcg_rewards_for_tier(public.tcg_tier_for_elo(rp.elo))->>'gold')::int,
    (public.tcg_rewards_for_tier(public.tcg_tier_for_elo(rp.elo))->>'packs')::int
  from ranked_with_pos rp
  on conflict (season_id, user_id) do nothing;

  get diagnostics v_count = row_count;

  -- Soft-reset ELO : new = max(800, floor((old + 1000) / 2)).
  update public.profiles
  set tcg_elo = jsonb_set(
    coalesce(tcg_elo, '{}'::jsonb),
    array[p_game_id],
    to_jsonb(
      greatest(
        800,
        floor((coalesce((tcg_elo->>p_game_id)::int, 1000) + 1000) / 2.0)::int
      )
    )
  ),
  updated_at = now()
  where (tcg_elo->>p_game_id) is not null;

  -- Clôture la saison courante.
  update public.tcg_seasons
  set is_current = false,
      end_at = v_now
  where id = v_current.id;

  -- Ouvre la suivante.
  insert into public.tcg_seasons (game_id, season_number, is_current)
  values (p_game_id, v_current.season_number + 1, true)
  returning id into v_new_season;

  return jsonb_build_object(
    'closed_season_id', v_current.id,
    'closed_season_number', v_current.season_number,
    'snapshotted_players', v_count,
    'new_season_id', v_new_season,
    'new_season_number', v_current.season_number + 1
  );
end;
$$;

-- ─── 8) RPC : claim_season_rewards ────────────────────────────────────
-- Le joueur réclame ses OS + boosters pour une saison clôturée.
create or replace function public.claim_season_rewards(p_season_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row record;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  select * into v_row
  from public.tcg_season_results
  where season_id = p_season_id and user_id = v_user_id
  for update;
  if v_row is null then
    raise exception 'Aucune récompense pour cette saison';
  end if;
  if v_row.rewards_claimed then
    raise exception 'Récompenses déjà réclamées';
  end if;

  -- Crédite le gold.
  update public.profiles
  set gold = coalesce(gold, 0) + v_row.gold_reward,
      updated_at = now()
  where id = v_user_id;

  -- Crédite les boosters dans tcg_free_packs[game_id].
  if v_row.pack_reward > 0 then
    update public.profiles
    set tcg_free_packs = jsonb_set(
      coalesce(tcg_free_packs, '{}'::jsonb),
      array[v_row.game_id],
      to_jsonb(
        coalesce((tcg_free_packs->>v_row.game_id)::int, 0) + v_row.pack_reward
      )
    ),
    updated_at = now()
    where id = v_user_id;
  end if;

  -- Marque comme réclamée.
  update public.tcg_season_results
  set rewards_claimed = true,
      claimed_at = now()
  where season_id = p_season_id and user_id = v_user_id;

  return jsonb_build_object(
    'gold', v_row.gold_reward,
    'packs', v_row.pack_reward,
    'tier', v_row.tier,
    'rank', v_row.final_rank
  );
end;
$$;

-- ─── 9) RPC : get_my_season_history ───────────────────────────────────
-- Liste mes saisons clôturées + statut des récompenses.
create or replace function public.get_my_season_history(p_game_id text)
returns table (
  season_id uuid,
  season_number int,
  start_at timestamptz,
  end_at timestamptz,
  final_elo int,
  final_rank int,
  tier text,
  ranked_wins int,
  ranked_losses int,
  gold_reward int,
  pack_reward int,
  rewards_claimed boolean
)
language sql
security definer
set search_path = public
as $$
  select
    s.id, s.season_number, s.start_at, s.end_at,
    r.final_elo, r.final_rank, r.tier,
    r.ranked_wins, r.ranked_losses,
    r.gold_reward, r.pack_reward, r.rewards_claimed
  from public.tcg_season_results r
  join public.tcg_seasons s on s.id = r.season_id
  where r.user_id = auth.uid() and r.game_id = p_game_id
  order by s.season_number desc;
$$;

-- ─── 10) Grants pour exposer les RPCs aux clients authentifiés ────────
grant execute on function public.get_current_season(text) to authenticated;
grant execute on function public.get_season_leaderboard(text, uuid, int) to authenticated, anon;
grant execute on function public.claim_season_rewards(uuid) to authenticated;
grant execute on function public.get_my_season_history(text) to authenticated;
-- close_current_season_and_open_next : SERVICE_ROLE uniquement (cron).
revoke execute on function public.close_current_season_and_open_next(text, boolean) from authenticated, anon;
