-- TCG : Battle Pass saisonnier (track de récompenses progressives).
--
-- Concept :
--  • Chaque saison ranked (1 mois ≈ 30j) a un Battle Pass de 50 niveaux.
--  • Tu gagnes 100 BP-XP par match PvP joué (250 si gagné, 500 si ranked
--    gagné). Trigger AFTER INSERT sur battle_history calcule auto.
--  • Chaque palier (niveau 1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50)
--    donne une récompense (OS / boosters / titre cosmétique).
--  • Le user doit venir "claim" chaque palier (pas auto-distribué) sur
--    une page dédiée.
--  • Reset au début de chaque saison (XP remis à 0). Les récompenses
--    déjà claim restent.
--
-- Run après supabase/tcg-seasons.sql et tcg-battles.sql.
-- ──────────────────────────────────────────────────────────────────────

create table if not exists public.tcg_battle_pass (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  season_id uuid not null references public.tcg_seasons(id) on delete cascade,
  xp int not null default 0,
  claimed_levels int[] not null default '{}'::int[],
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id, season_id)
);
create index if not exists tcg_battle_pass_user_idx
  on public.tcg_battle_pass (user_id);

alter table public.tcg_battle_pass enable row level security;
drop policy if exists "tcg_battle_pass_read_own" on public.tcg_battle_pass;
create policy "tcg_battle_pass_read_own"
  on public.tcg_battle_pass for select
  using (auth.uid() = user_id);

-- ─── Helper : niveau actuel à partir de l'XP (200 XP par niveau) ──────
create or replace function public.tcg_bp_level_for_xp(p_xp int)
returns int
language sql
immutable
as $$
  select greatest(1, least(50, (p_xp / 200) + 1));
$$;

-- ─── Catalogue des récompenses (paliers 1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50) ──
create or replace function public.tcg_bp_rewards_for_level(p_level int)
returns jsonb
language sql
immutable
as $$
  select case p_level
    when 1  then jsonb_build_object('gold', 100,  'packs', 0, 'label', 'Bienvenue')
    when 5  then jsonb_build_object('gold', 200,  'packs', 0, 'label', 'Premier palier')
    when 10 then jsonb_build_object('gold', 0,    'packs', 1, 'label', '+1 booster')
    when 15 then jsonb_build_object('gold', 500,  'packs', 0, 'label', '500 OS')
    when 20 then jsonb_build_object('gold', 0,    'packs', 2, 'label', '+2 boosters')
    when 25 then jsonb_build_object('gold', 1000, 'packs', 0, 'label', '1000 OS')
    when 30 then jsonb_build_object('gold', 500,  'packs', 1, 'label', 'Mid-pass bonus')
    when 35 then jsonb_build_object('gold', 0,    'packs', 3, 'label', '+3 boosters')
    when 40 then jsonb_build_object('gold', 2000, 'packs', 0, 'label', '2000 OS')
    when 45 then jsonb_build_object('gold', 1000, 'packs', 2, 'label', 'Avant-dernier')
    when 50 then jsonb_build_object('gold', 5000, 'packs', 5, 'label', '🏆 Pass MAX')
    else null
  end;
$$;

-- ─── Trigger : XP gagnée à chaque battle_history insert ───────────────
create or replace function public._tcg_bp_on_battle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_xp_winner int;
  v_xp_loser int;
begin
  -- Récupère la saison courante du jeu.
  select id into v_season_id
  from public.tcg_seasons
  where game_id = new.game_id and is_current = true
  order by season_number desc
  limit 1;
  if v_season_id is null then return new; end if;

  -- Calcul XP : tous les matchs donnent 100 XP, gagner = +150 (250 total),
  -- match ranked donne +250 supplémentaires si gagné (500 total).
  v_xp_winner := 250 + case when new.ranked then 250 else 0 end;
  v_xp_loser := 100;

  -- Upsert pour le winner.
  insert into public.tcg_battle_pass (user_id, game_id, season_id, xp)
  values (new.winner_id, new.game_id, v_season_id, v_xp_winner)
  on conflict (user_id, game_id, season_id) do update
    set xp = least(10000, public.tcg_battle_pass.xp + v_xp_winner),
        updated_at = now();

  insert into public.tcg_battle_pass (user_id, game_id, season_id, xp)
  values (new.loser_id, new.game_id, v_season_id, v_xp_loser)
  on conflict (user_id, game_id, season_id) do update
    set xp = least(10000, public.tcg_battle_pass.xp + v_xp_loser),
        updated_at = now();

  return new;
end;
$$;
drop trigger if exists tcg_battle_pass_xp_trigger on public.battle_history;
create trigger tcg_battle_pass_xp_trigger
  after insert on public.battle_history
  for each row execute function public._tcg_bp_on_battle();

-- ─── RPC : get_my_battle_pass ─────────────────────────────────────────
create or replace function public.get_my_battle_pass(p_game_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_season record;
  v_pass record;
  v_levels jsonb := '[]'::jsonb;
  v_l int;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  select id, season_number, start_at into v_season
  from public.tcg_seasons
  where game_id = p_game_id and is_current = true
  order by season_number desc
  limit 1;
  if v_season is null then
    return jsonb_build_object('available', false);
  end if;
  select xp, claimed_levels into v_pass
  from public.tcg_battle_pass
  where user_id = v_user_id and game_id = p_game_id and season_id = v_season.id;
  if v_pass is null then
    v_pass := row(0, '{}'::int[]);
  end if;

  -- Construit la liste des paliers avec leurs rewards.
  for v_l in select unnest(array[1,5,10,15,20,25,30,35,40,45,50]) loop
    v_levels := v_levels || jsonb_build_array(
      jsonb_build_object(
        'level', v_l,
        'rewards', public.tcg_bp_rewards_for_level(v_l),
        'unlocked', public.tcg_bp_level_for_xp(coalesce(v_pass.xp, 0)) >= v_l,
        'claimed', v_l = any(coalesce(v_pass.claimed_levels, '{}'::int[]))
      )
    );
  end loop;

  return jsonb_build_object(
    'available', true,
    'season_number', v_season.season_number,
    'season_start', v_season.start_at,
    'xp', coalesce(v_pass.xp, 0),
    'level', public.tcg_bp_level_for_xp(coalesce(v_pass.xp, 0)),
    'levels', v_levels
  );
end;
$$;

-- ─── RPC : claim_battle_pass_level ────────────────────────────────────
create or replace function public.claim_battle_pass_level(
  p_game_id text,
  p_level int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_season record;
  v_pass record;
  v_rewards jsonb;
  v_gold int;
  v_packs int;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  v_rewards := public.tcg_bp_rewards_for_level(p_level);
  if v_rewards is null then
    raise exception 'Niveau invalide';
  end if;
  select id into v_season
  from public.tcg_seasons
  where game_id = p_game_id and is_current = true
  order by season_number desc
  limit 1;
  if v_season is null then
    raise exception 'Aucune saison ouverte';
  end if;
  select xp, claimed_levels into v_pass
  from public.tcg_battle_pass
  where user_id = v_user_id and game_id = p_game_id and season_id = v_season.id
  for update;
  if v_pass is null then
    raise exception 'Aucune progression sur le pass';
  end if;
  if public.tcg_bp_level_for_xp(v_pass.xp) < p_level then
    raise exception 'Niveau % non atteint (xp = %)', p_level, v_pass.xp;
  end if;
  if p_level = any(v_pass.claimed_levels) then
    raise exception 'Récompense déjà réclamée';
  end if;

  v_gold := (v_rewards->>'gold')::int;
  v_packs := (v_rewards->>'packs')::int;

  if v_gold > 0 then
    update public.profiles
    set gold = coalesce(gold, 0) + v_gold,
        updated_at = now()
    where id = v_user_id;
  end if;
  if v_packs > 0 then
    update public.profiles
    set tcg_free_packs = jsonb_set(
      coalesce(tcg_free_packs, '{}'::jsonb),
      array[p_game_id],
      to_jsonb(coalesce((tcg_free_packs->>p_game_id)::int, 0) + v_packs)
    ),
    updated_at = now()
    where id = v_user_id;
  end if;

  update public.tcg_battle_pass
  set claimed_levels = array_append(claimed_levels, p_level),
      updated_at = now()
  where user_id = v_user_id and game_id = p_game_id and season_id = v_season.id;

  return jsonb_build_object('gold', v_gold, 'packs', v_packs);
end;
$$;

grant execute on function public.get_my_battle_pass(text) to authenticated;
grant execute on function public.claim_battle_pass_level(text, int) to authenticated;
revoke execute on function public._tcg_bp_on_battle() from public, authenticated, anon;
