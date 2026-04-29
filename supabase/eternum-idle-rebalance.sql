-- Eternum idle rebalance — stage max 1000, taux par paliers de 10 niveaux,
-- AUCUN cap journalier. L'énergie + le cap AFK 8h sont les seules limites.
-- Idempotent : peut être joué N fois.

-- ──────────────────────────────────────────────────────────────────────
-- 1) Drop de la table de cap journalier idle (plus utilisée).
--    On la supprime proprement pour ne pas garder de poussière.
-- ──────────────────────────────────────────────────────────────────────
drop table if exists public.eternum_daily_idle_os;

-- ──────────────────────────────────────────────────────────────────────
-- 2) eternum_collect_idle — nouvelle formule
--   * 1 tick = 10 minutes
--   * Cap AFK = 8h = 48 ticks max
--   * OS/tick = greatest(1, stage / 10) (augmente tous les 10 niveaux)
--     Stage 1-19 : 1 OS/tick → 48 OS / 8h
--     Stage 49 : 4 OS/tick → 192 OS / 8h
--     Stage 1000 : 100 OS/tick → 4 800 OS / 8h
--   * XP/tick = OS/tick / 4
--   * Aucun cap journalier — l'AFK 8h est la seule limite
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_collect_idle(
  p_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  current_stage int;
  last_at timestamptz;
  elapsed_sec bigint;
  ticks bigint;
  tick_seconds bigint := 600;     -- 10 min
  cap_ticks bigint := 48;         -- 8h max d'AFK accumulable
  os_per_tick_val bigint;
  os_gain bigint := 0;
  xp_gain bigint := 0;
begin
  if caller is null or caller <> p_user_id then
    raise exception 'Accès refusé.';
  end if;

  select idle_stage, idle_updated_at into current_stage, last_at
  from public.eternum_heroes
  where user_id = p_user_id
  for update;

  if current_stage is null then
    raise exception 'Aucun héros — crée-en un d''abord.';
  end if;

  elapsed_sec := greatest(0, extract(epoch from now() - last_at)::bigint);
  ticks := least(cap_ticks, elapsed_sec / tick_seconds);

  if ticks = 0 then
    return jsonb_build_object(
      'os_gained', 0,
      'xp_gained', 0,
      'stage', current_stage,
      'ticks', 0,
      'os_per_tick', greatest(1, current_stage / 10)
    );
  end if;

  -- Taux par tick : greatest(1, stage / 10)
  -- Stage 1-19 : 1 OS/tick · Stage 20-29 : 2 · ... · Stage 1000 : 100 OS/tick (4 800 OS / 8h)
  os_per_tick_val := greatest(1, current_stage / 10);
  os_gain := ticks * os_per_tick_val;
  xp_gain := os_gain / 4;

  -- Crédit OS direct, pas de cap
  update public.profiles
  set gold = gold + os_gain, updated_at = now()
  where id = p_user_id;

  -- Crédit XP au héros + bump idle_updated_at
  update public.eternum_heroes
  set xp = xp + xp_gain,
      idle_updated_at = idle_updated_at + (ticks * tick_seconds * interval '1 second'),
      updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object(
    'os_gained', os_gain,
    'xp_gained', xp_gain,
    'stage', current_stage,
    'ticks', ticks,
    'os_per_tick', os_per_tick_val
  );
end;
$$;
