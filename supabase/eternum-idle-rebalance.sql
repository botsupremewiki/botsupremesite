-- Eternum Commit E : refactor idle "1 OS × stage / 10min, cap 8h, cap journalier proportionnel"
-- Idempotent : peut être joué N fois sans casser quoi que ce soit.

-- ──────────────────────────────────────────────────────────────────────
-- 1) TABLE de tracking du cap journalier idle
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.eternum_daily_idle_os (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  os_earned bigint not null default 0,
  primary key (user_id, day)
);

alter table public.eternum_daily_idle_os enable row level security;
drop policy if exists "eternum_daily_idle_os_read_own" on public.eternum_daily_idle_os;
create policy "eternum_daily_idle_os_read_own" on public.eternum_daily_idle_os
  for select using (auth.uid() = user_id);

-- Index pour purges éventuelles (optionnel mais utile pour le ménage).
create index if not exists eternum_daily_idle_os_day_idx
  on public.eternum_daily_idle_os (day);

-- ──────────────────────────────────────────────────────────────────────
-- 2) eternum_collect_idle — nouvelle formule
--   * 1 tick = 10 minutes (au lieu de 30s)
--   * Cap AFK = 8h = 48 ticks (au lieu de 4h × 480 ticks de 30s)
--   * OS = ticks × stage (ex: stage 100 sur 8h = 4 800 OS)
--   * XP = ticks × stage / 4 (mineur)
--   * Cap journalier OS idle = stage × 30 (proportionnel à la difficulté)
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
  os_gain bigint := 0;
  xp_gain bigint := 0;
  daily_cap bigint;
  earned_today bigint := 0;
  os_credited bigint;
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
      'os_potential', 0,
      'xp_gained', 0,
      'stage', current_stage,
      'ticks', 0,
      'daily_cap', current_stage * 30,
      'earned_today_after', coalesce((
        select os_earned from public.eternum_daily_idle_os
        where user_id = p_user_id and day = current_date
      ), 0)
    );
  end if;

  -- Formule : 1 OS × stage par tick.
  os_gain := ticks * current_stage;
  xp_gain := (ticks * current_stage) / 4;

  -- Cap journalier proportionnel
  daily_cap := current_stage * 30;
  select coalesce(os_earned, 0) into earned_today
  from public.eternum_daily_idle_os
  where user_id = p_user_id and day = current_date;

  -- Combien on peut effectivement créditer (le reste est perdu, le joueur
  -- est encouragé à varier ses activités).
  os_credited := least(os_gain, greatest(0, daily_cap - earned_today));

  if os_credited > 0 then
    update public.profiles
    set gold = gold + os_credited, updated_at = now()
    where id = p_user_id;

    insert into public.eternum_daily_idle_os (user_id, day, os_earned)
    values (p_user_id, current_date, os_credited)
    on conflict (user_id, day) do update
      set os_earned = public.eternum_daily_idle_os.os_earned + os_credited;
  end if;

  -- L'XP est crédité même si l'OS est cappé (continue à monter en niveau)
  update public.eternum_heroes
  set xp = xp + xp_gain,
      idle_updated_at = idle_updated_at + (ticks * tick_seconds * interval '1 second'),
      updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object(
    'os_gained', os_credited,
    'os_potential', os_gain,
    'xp_gained', xp_gain,
    'stage', current_stage,
    'ticks', ticks,
    'daily_cap', daily_cap,
    'earned_today_after', earned_today + os_credited,
    'capped', os_credited < os_gain
  );
end;
$$;
