-- Eternum FIXES + REBALANCE (Commit A)
-- 1) Fix erreur eternum_pass_grant_xp(bigint) does not exist
-- 2) Re-apply level-up trigger + RPC de rattrapage
-- 3) Nerf économie : idle ÷3, tour ÷2.5+cap, donjons mid+ ÷1.7, world boss ÷2
-- Idempotent : peut être joué N fois sans casser quoi que ce soit.

-- ──────────────────────────────────────────────────────────────────────
-- 1) FIX SIGNATURE eternum_pass_grant_xp : int → bigint
-- Plusieurs RPCs appellent perform eternum_pass_grant_xp(p_xp_reward / 2)
-- où p_xp_reward est bigint → résultat bigint → fonction (int) introuvable.
-- ──────────────────────────────────────────────────────────────────────
drop function if exists public.eternum_pass_grant_xp(int);
drop function if exists public.eternum_pass_grant_xp(bigint);

create function public.eternum_pass_grant_xp(p_amount bigint)
returns void language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return; end if;
  insert into public.eternum_pass_progress (user_id, xp)
  values (caller, p_amount)
  on conflict (user_id) do update
    set xp = public.eternum_pass_progress.xp + p_amount,
        updated_at = now();
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 2) FIX LEVEL-UP : trigger + rattrapage des héros existants
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_check_level_up()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  needed bigint;
  new_level int := new.level;
  new_evol int := new.evolution_stage;
begin
  loop
    needed := round(100 * power(new_level, 1.6));
    exit when new.xp < needed or new_level >= 100;
    new.xp := new.xp - needed;
    new_level := new_level + 1;
  end loop;

  if new_level >= 20 and new_evol < 1 then new_evol := 1; end if;
  if new_level >= 40 and new_evol < 2 then new_evol := 2; end if;
  if new_level >= 60 and new_evol < 3 then new_evol := 3; end if;
  if new_level >= 80 and new_evol < 4 then new_evol := 4; end if;

  new.level := new_level;
  new.evolution_stage := new_evol;
  return new;
end;
$$;

drop trigger if exists eternum_heroes_level_up on public.eternum_heroes;
create trigger eternum_heroes_level_up
  before update of xp on public.eternum_heroes
  for each row execute function public.eternum_check_level_up();

-- RPC de rattrapage : force un re-calcul du level pour TOUS les héros
-- (le trigger ne s'applique qu'aux UPDATE futurs de xp, donc on fait un
--  no-op update pour le déclencher rétroactivement).
create or replace function public.eternum_recalc_levels()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  -- Touche xp pour déclencher le trigger sur chaque héros.
  update public.eternum_heroes set xp = xp;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 3) NERF IDLE : OS × 1.5/tick (au lieu de × 5), XP × 1/tick (au lieu × 2)
-- Cap AFK 4h (au lieu de 8h)
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
  cap_ticks bigint := 14400 / 30; -- 4h max d'AFK accumulable = 480 ticks
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
  ticks := least(cap_ticks, elapsed_sec / 30);

  if ticks = 0 then
    return jsonb_build_object('os_gained', 0, 'xp_gained', 0, 'stage', current_stage);
  end if;

  -- × 1.5 via (stage * 3) / 2 pour rester en int sans float
  os_gain := (ticks * current_stage * 3) / 2;
  xp_gain := ticks * current_stage * 1;

  update public.profiles
  set gold = gold + os_gain, updated_at = now()
  where id = p_user_id;

  update public.eternum_heroes
  set xp = xp + xp_gain,
      idle_updated_at = idle_updated_at + (ticks * 30 * interval '1 second'),
      updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object(
    'os_gained', os_gain,
    'xp_gained', xp_gain,
    'stage', current_stage,
    'ticks', ticks
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 4) NERF DONJONS : −40% OS sur les 3 paliers mid/end-game
-- (rat-cellar et goblin-camp restent intacts pour les débutants)
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_attempt_dungeon(
  p_dungeon_id text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  required_power int;
  energy_cost int;
  os_min int; os_max int;
  xp_min int; xp_max int;
  os_reward bigint;
  xp_reward bigint;
  player_power int;
  resources jsonb := '[]'::jsonb;
  ok boolean;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  case p_dungeon_id
    when 'rat-cellar'   then required_power := 150;   energy_cost := 10; os_min := 100;  os_max := 200;   xp_min := 30;   xp_max := 60;
                            resources := '[{"resource_id":"iron-ore","chance":0.6,"min":1,"max":3},{"resource_id":"leather","chance":0.5,"min":1,"max":2},{"resource_id":"wheat","chance":0.4,"min":1,"max":2}]'::jsonb;
    when 'goblin-camp'  then required_power := 800;   energy_cost := 15; os_min := 400;  os_max := 700;   xp_min := 100;  xp_max := 200;
                            resources := '[{"resource_id":"iron-ore","chance":0.7,"min":2,"max":5},{"resource_id":"silver-ore","chance":0.4,"min":1,"max":2},{"resource_id":"fine-leather","chance":0.3,"min":1,"max":2},{"resource_id":"thread","chance":0.5,"min":2,"max":4}]'::jsonb;
    -- NERF −40% à partir d'ici
    when 'frost-cavern' then required_power := 2000;  energy_cost := 20; os_min := 720;  os_max := 1200;  xp_min := 300;  xp_max := 500;
                            resources := '[{"resource_id":"silver-ore","chance":0.7,"min":2,"max":5},{"resource_id":"gem-rough","chance":0.6,"min":1,"max":3},{"resource_id":"mithril-ore","chance":0.3,"min":1,"max":2},{"resource_id":"silk","chance":0.4,"min":2,"max":4}]'::jsonb;
    when 'lava-pit'     then required_power := 4500;  energy_cost := 25; os_min := 1800; os_max := 3000;  xp_min := 700;  xp_max := 1100;
                            resources := '[{"resource_id":"mithril-ore","chance":0.7,"min":2,"max":4},{"resource_id":"dragon-hide","chance":0.6,"min":1,"max":3},{"resource_id":"ruby","chance":0.5,"min":1,"max":2},{"resource_id":"moon-silk","chance":0.4,"min":1,"max":3}]'::jsonb;
    when 'void-temple'  then required_power := 9000;  energy_cost := 30; os_min := 4800; os_max := 7200;  xp_min := 2000; xp_max := 3500;
                            resources := '[{"resource_id":"ether-ore","chance":0.7,"min":2,"max":4},{"resource_id":"phoenix-hide","chance":0.5,"min":1,"max":2},{"resource_id":"void-silk","chance":0.5,"min":1,"max":2},{"resource_id":"diamond","chance":0.4,"min":1,"max":2},{"resource_id":"prism-shard","chance":0.05,"min":1,"max":1}]'::jsonb;
    else raise exception 'Donjon inconnu : %', p_dungeon_id;
  end case;

  ok := public.eternum_consume_energy(caller, energy_cost);
  if not ok then return jsonb_build_object('ok', false, 'error', 'Énergie insuffisante.'); end if;

  player_power := public.eternum_player_power(caller);
  if player_power < required_power then
    return jsonb_build_object('ok', true, 'won', false, 'player_power', player_power, 'required_power', required_power);
  end if;

  os_reward := os_min + floor(random() * (os_max - os_min + 1));
  xp_reward := xp_min + floor(random() * (xp_max - xp_min + 1));

  update public.profiles set gold = gold + os_reward, updated_at = now() where id = caller;
  update public.eternum_heroes set xp = xp + xp_reward, updated_at = now() where user_id = caller;

  declare
    drops_applied jsonb := '[]'::jsonb;
    r jsonb;
    rolled int;
  begin
    for r in select * from jsonb_array_elements(resources) loop
      if random() < (r->>'chance')::numeric then
        rolled := (r->>'min')::int + floor(random() * ((r->>'max')::int - (r->>'min')::int + 1));
        drops_applied := drops_applied || jsonb_build_object('resource_id', r->>'resource_id', 'count', rolled);
      end if;
    end loop;
    if jsonb_array_length(drops_applied) > 0 then
      perform public.eternum_add_resources(caller, drops_applied);
    end if;

    insert into public.eternum_dungeon_progress (user_id, dungeon_id, best_floor, last_run_at)
    values (caller, p_dungeon_id, 1, now())
    on conflict (user_id, dungeon_id) do update
      set best_floor = greatest(public.eternum_dungeon_progress.best_floor, 1),
          last_run_at = now();
    perform public.eternum_pass_grant_xp(xp_reward / 2);
    perform public.eternum_quest_progress('daily-dungeon', 1);
    perform public.eternum_quest_progress('main-6-first-dungeon', 1);
    perform public.eternum_bestiary_add('dungeon-' || p_dungeon_id, true);

    return jsonb_build_object(
      'ok', true, 'won', true,
      'os_gained', os_reward, 'xp_gained', xp_reward,
      'resources_gained', drops_applied,
      'player_power', player_power
    );
  end;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 5) NERF WORLD BOSS : damage / 200 (au lieu de / 100)
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_attempt_world_boss()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cap int := 3;
  cur_count int;
  pwr int;
  damage bigint;
  os_reward bigint;
  pass_xp bigint;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select count(*) into cur_count from public.eternum_world_boss_attempts
  where user_id = caller and attempt_date = current_date;
  if cur_count >= cap then return jsonb_build_object('ok', false, 'error', 'Cap journalier atteint (3/3).'); end if;

  pwr := public.eternum_player_power(caller);
  if pwr <= 0 then return jsonb_build_object('ok', false, 'error', 'Configure ton équipe de familiers.'); end if;

  damage := pwr * 10 * (0.8 + random() * 0.4);
  insert into public.eternum_world_boss_attempts (user_id, attempt_date, damage)
  values (caller, current_date, damage);

  -- NERF : / 200 au lieu de / 100 → ÷2 sur les OS gagnés
  os_reward := damage / 200;
  update public.profiles set gold = gold + os_reward, updated_at = now() where id = caller;

  pass_xp := greatest(50, (damage / 1000)::bigint);
  perform public.eternum_pass_grant_xp(pass_xp);
  perform public.eternum_quest_progress('daily-wb', 1);
  perform public.eternum_bestiary_add('world-boss-bot-supreme', true);

  return jsonb_build_object(
    'ok', true, 'damage', damage,
    'os_gained', os_reward,
    'attempts_used', cur_count + 1,
    'pass_xp_gained', pass_xp
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 6) NERF TOUR INFINIE : OS = 30 + étage × 8 (au lieu de 50 + × 20)
-- + cap journalier de 15 runs/jour
-- ──────────────────────────────────────────────────────────────────────
-- Ajout des colonnes de comptage journalier sur eternum_tower_progress.
alter table public.eternum_tower_progress
  add column if not exists runs_today int not null default 0,
  add column if not exists runs_date date;

create or replace function public.eternum_attempt_tower(
  p_floor int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  pwr int;
  required int;
  os_reward bigint;
  xp_reward bigint;
  cap_per_day int := 15;
  runs_today_val int;
  runs_date_val date;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  -- Cap journalier
  select runs_today, runs_date
    into runs_today_val, runs_date_val
  from public.eternum_tower_progress
  where user_id = caller for update;

  if runs_date_val is null or runs_date_val <> current_date then
    runs_today_val := 0;
    runs_date_val := current_date;
  end if;

  if runs_today_val >= cap_per_day then
    return jsonb_build_object('ok', false, 'error', 'Cap journalier atteint (15/15). Reviens demain.');
  end if;

  pwr := public.eternum_player_power(caller);
  required := p_floor * 200;
  if pwr < required then
    return jsonb_build_object('ok', true, 'won', false, 'player_power', pwr, 'required', required);
  end if;

  -- NERF : OS = 30 + p_floor × 8 (au lieu de 50 + × 20), XP = 15 + p_floor × 4
  os_reward := 30 + p_floor * 8;
  xp_reward := 15 + p_floor * 4;

  insert into public.eternum_tower_progress (user_id, best_floor, runs_today, runs_date)
  values (caller, p_floor, 1, current_date)
  on conflict (user_id) do update
    set best_floor = greatest(public.eternum_tower_progress.best_floor, p_floor),
        runs_today = runs_today_val + 1,
        runs_date = current_date,
        updated_at = now();

  update public.profiles set gold = gold + os_reward where id = caller;
  update public.eternum_heroes set xp = xp + xp_reward where user_id = caller;
  perform public.eternum_pass_grant_xp(10 + p_floor * 2);
  perform public.eternum_quest_progress('weekly-tower', 1);

  return jsonb_build_object(
    'ok', true, 'won', true,
    'floor', p_floor,
    'os_gained', os_reward,
    'xp_gained', xp_reward,
    'runs_today', runs_today_val + 1,
    'runs_cap', cap_per_day
  );
end;
$$;
