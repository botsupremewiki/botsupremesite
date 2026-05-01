-- Daily login chain : coffres bonus à 7 / 14 / 30 jours de streak
-- (en plus du gold quotidien existant via claim_daily_reward).
--
-- Stockage minimal : on lit `streak_count` depuis daily_rewards, et on
-- track les paliers déjà claim dans une nouvelle col `claimed_chain
-- _milestones int[]`.
--
-- Run après supabase/meta-systems.sql.
-- ──────────────────────────────────────────────────────────────────────

alter table public.daily_rewards
  add column if not exists claimed_chain_milestones int[]
    not null default '{}'::int[];

-- ─── Helper : récompenses par palier ──────────────────────────────────
create or replace function public.daily_chain_rewards(p_milestone int)
returns jsonb
language sql
immutable
as $$
  select case p_milestone
    when 7  then jsonb_build_object('gold', 5000,  'label', '7 jours — 5 000 OS')
    when 14 then jsonb_build_object('gold', 12000, 'label', '14 jours — 12 000 OS')
    when 30 then jsonb_build_object('gold', 30000, 'label', '30 jours — 30 000 OS')
    else null
  end;
$$;

-- ─── RPC : get_daily_chain ────────────────────────────────────────────
create or replace function public.get_my_daily_chain()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_streak int;
  v_claimed int[];
  v_levels jsonb := '[]'::jsonb;
  v_m int;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  select streak_count, claimed_chain_milestones
    into v_streak, v_claimed
  from public.daily_rewards
  where user_id = v_user_id;
  if v_streak is null then
    v_streak := 0;
    v_claimed := '{}'::int[];
  end if;

  for v_m in select unnest(array[7, 14, 30]) loop
    v_levels := v_levels || jsonb_build_array(
      jsonb_build_object(
        'milestone', v_m,
        'rewards', public.daily_chain_rewards(v_m),
        'unlocked', v_streak >= v_m,
        'claimed', v_m = any(coalesce(v_claimed, '{}'::int[]))
      )
    );
  end loop;

  return jsonb_build_object(
    'streak', v_streak,
    'milestones', v_levels
  );
end;
$$;

-- ─── RPC : claim_daily_chain_milestone ────────────────────────────────
create or replace function public.claim_daily_chain_milestone(p_milestone int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_streak int;
  v_claimed int[];
  v_rewards jsonb := public.daily_chain_rewards(p_milestone);
  v_gold int;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  if v_rewards is null then
    raise exception 'Palier invalide';
  end if;
  select streak_count, claimed_chain_milestones
    into v_streak, v_claimed
  from public.daily_rewards
  where user_id = v_user_id
  for update;
  if v_streak is null then
    raise exception 'Aucune progression daily';
  end if;
  if v_streak < p_milestone then
    raise exception 'Streak insuffisante (% jours)', v_streak;
  end if;
  if p_milestone = any(v_claimed) then
    raise exception 'Coffre déjà ouvert';
  end if;

  v_gold := (v_rewards->>'gold')::int;

  update public.profiles
  set gold = coalesce(gold, 0) + v_gold,
      updated_at = now()
  where id = v_user_id;

  update public.daily_rewards
  set claimed_chain_milestones = array_append(
        claimed_chain_milestones, p_milestone
      ),
      updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object('gold', v_gold);
end;
$$;

grant execute on function public.get_my_daily_chain() to authenticated;
grant execute on function public.claim_daily_chain_milestone(int) to authenticated;
