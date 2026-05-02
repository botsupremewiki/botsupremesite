-- Cleanup périodique des données anciennes pour limiter le bloat de
-- la DB (free tier Supabase ~500MB). À appeler par un cron Vercel
-- quotidien (cf. web/app/api/cron/cleanup-old-data/route.ts).
--
-- Politique de rétention :
--  • notifications lues (read_at not null) > 30 jours    → DELETE
--  • notifications non lues > 90 jours                   → DELETE (même non lues, pour éviter les ghosts)
--  • tcg_replays > 90 jours                              → DELETE (sauf le top 10 par user, à garder pour les portfolios)
--  • rate_limit_log > 7 jours                            → DELETE (le check_rate_limit fait déjà du cleanup à 24h, mais c'est par-user-row donc le bloat global peut subsister)
--  • tcg_wonder_pick_pool : déjà capé à 100 par game_id via trigger, OK
--  • user_reports résolus (status != 'open') > 180 jours → DELETE
--  • tcg_daily_quest_progress > 60 jours                 → DELETE (les quêtes day-by-day, on garde 2 mois pour stats)
--
-- Run après les autres migrations.
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.cleanup_old_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notif_read int;
  v_notif_unread int;
  v_replays int;
  v_rate_limit int;
  v_reports int;
  v_quests int;
begin
  -- Notifications lues > 30j.
  with d as (
    delete from public.notifications
    where read_at is not null and read_at < now() - interval '30 days'
    returning 1
  )
  select count(*) into v_notif_read from d;

  -- Notifications non lues > 90j (cleanup ghosts).
  with d as (
    delete from public.notifications
    where read_at is null and created_at < now() - interval '90 days'
    returning 1
  )
  select count(*) into v_notif_unread from d;

  -- Replays > 90j, sauf top 10 par user (garde un portfolio).
  with kept as (
    select id from (
      select id,
             row_number() over (
               partition by winner_id
               order by ended_at desc
             ) as rn
      from public.tcg_replays
      where winner_id is not null
    ) sub
    where rn <= 10
  ),
  d as (
    delete from public.tcg_replays
    where ended_at < now() - interval '90 days'
      and id not in (select id from kept)
    returning 1
  )
  select count(*) into v_replays from d;

  -- Rate limit log > 7 jours (check_rate_limit cleanup à 24h en
  -- ligne, mais ne tape que les rows du user appelant — donc le
  -- bloat global persiste sans ce cron).
  with d as (
    delete from public.rate_limit_log
    where called_at < now() - interval '7 days'
    returning 1
  )
  select count(*) into v_rate_limit from d;

  -- User reports résolus > 180j.
  with d as (
    delete from public.user_reports
    where status <> 'open' and created_at < now() - interval '180 days'
    returning 1
  )
  select count(*) into v_reports from d;

  -- Daily quest progress > 60j (on garde 2 mois pour stats).
  with d as (
    delete from public.tcg_daily_quest_progress
    where quest_date < (now() - interval '60 days')::date
    returning 1
  )
  select count(*) into v_quests from d;

  return jsonb_build_object(
    'notifications_read', v_notif_read,
    'notifications_unread', v_notif_unread,
    'replays', v_replays,
    'rate_limit_log', v_rate_limit,
    'user_reports', v_reports,
    'daily_quest_progress', v_quests,
    'ran_at', now()
  );
end;
$$;

-- Service role only (cron Vercel). Pas de grant aux clients.
revoke execute on function public.cleanup_old_data() from public, authenticated, anon;
