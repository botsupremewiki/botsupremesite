-- Eternum SÉCURITÉ : refactor server-authoritative.
-- Avant : le client envoyait les rewards et le résultat (exploitable).
-- Après : le serveur calcule TOUT à partir d'une simple requête "j'attaque X".
-- Catalogues hardcodés en PL/pgSQL pour éviter la duplication TS↔SQL.
-- Idempotent — safe à relancer.

-- ──────────────────────────────────────────────────────────────────────
-- Helper : power d'un joueur (héros + 5 familiers actifs).
-- Formule simple : sum(level × stat_factor) avec growth par classe.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_player_power(p_user_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  hero_lv int;
  team_total bigint := 0;
begin
  select level into hero_lv from public.eternum_heroes where user_id = p_user_id;
  if hero_lv is null then return 0; end if;

  -- Héros : level × 100 (proxy stats agrégées).
  team_total := hero_lv * 100;

  -- Familiers actifs : sum(level × 50).
  select team_total + coalesce(sum(level * 50), 0) into team_total
  from public.eternum_familiers_owned
  where user_id = p_user_id and team_slot is not null;

  return team_total;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- DONJONS — server-authoritative
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

  -- Catalogue server-side : énergie + power requis + reward bounds par donjon.
  case p_dungeon_id
    when 'rat-cellar'   then required_power := 150;   energy_cost := 10; os_min := 100;  os_max := 200;   xp_min := 30;   xp_max := 60;
                            resources := '[{"resource_id":"iron-ore","chance":0.6,"min":1,"max":3},{"resource_id":"leather","chance":0.5,"min":1,"max":2},{"resource_id":"wheat","chance":0.4,"min":1,"max":2}]'::jsonb;
    when 'goblin-camp'  then required_power := 800;   energy_cost := 15; os_min := 400;  os_max := 700;   xp_min := 100;  xp_max := 200;
                            resources := '[{"resource_id":"iron-ore","chance":0.7,"min":2,"max":5},{"resource_id":"silver-ore","chance":0.4,"min":1,"max":2},{"resource_id":"fine-leather","chance":0.3,"min":1,"max":2},{"resource_id":"thread","chance":0.5,"min":2,"max":4}]'::jsonb;
    when 'frost-cavern' then required_power := 2000;  energy_cost := 20; os_min := 1200; os_max := 2000;  xp_min := 300;  xp_max := 500;
                            resources := '[{"resource_id":"silver-ore","chance":0.7,"min":2,"max":5},{"resource_id":"gem-rough","chance":0.6,"min":1,"max":3},{"resource_id":"mithril-ore","chance":0.3,"min":1,"max":2},{"resource_id":"silk","chance":0.4,"min":2,"max":4}]'::jsonb;
    when 'lava-pit'     then required_power := 4500;  energy_cost := 25; os_min := 3000; os_max := 5000;  xp_min := 700;  xp_max := 1100;
                            resources := '[{"resource_id":"mithril-ore","chance":0.7,"min":2,"max":4},{"resource_id":"dragon-hide","chance":0.6,"min":1,"max":3},{"resource_id":"ruby","chance":0.5,"min":1,"max":2},{"resource_id":"moon-silk","chance":0.4,"min":1,"max":3}]'::jsonb;
    when 'void-temple'  then required_power := 9000;  energy_cost := 30; os_min := 8000; os_max := 12000; xp_min := 2000; xp_max := 3500;
                            resources := '[{"resource_id":"ether-ore","chance":0.7,"min":2,"max":4},{"resource_id":"phoenix-hide","chance":0.5,"min":1,"max":2},{"resource_id":"void-silk","chance":0.5,"min":1,"max":2},{"resource_id":"diamond","chance":0.4,"min":1,"max":2},{"resource_id":"prism-shard","chance":0.05,"min":1,"max":1}]'::jsonb;
    else raise exception 'Donjon inconnu : %', p_dungeon_id;
  end case;

  -- Consomme énergie (échec si pas assez).
  ok := public.eternum_consume_energy(caller, energy_cost);
  if not ok then return jsonb_build_object('ok', false, 'error', 'Énergie insuffisante.'); end if;

  -- Power check.
  player_power := public.eternum_player_power(caller);
  if player_power < required_power then
    return jsonb_build_object(
      'ok', true, 'won', false,
      'player_power', player_power,
      'required_power', required_power
    );
  end if;

  -- Reward random in range, server-side.
  os_reward := os_min + floor(random() * (os_max - os_min + 1));
  xp_reward := xp_min + floor(random() * (xp_max - xp_min + 1));

  -- Apply : OS + XP + ressources (drops).
  update public.profiles set gold = gold + os_reward, updated_at = now() where id = caller;
  update public.eternum_heroes set xp = xp + xp_reward, updated_at = now() where user_id = caller;

  -- Drops : pour chaque ressource, roll chance + count random.
  declare
    drops_applied jsonb := '[]'::jsonb;
    r jsonb;
    rolled int;
  begin
    for r in select * from jsonb_array_elements(resources) loop
      if random() < (r->>'chance')::numeric then
        rolled := (r->>'min')::int + floor(random() * ((r->>'max')::int - (r->>'min')::int + 1));
        drops_applied := drops_applied || jsonb_build_object(
          'resource_id', r->>'resource_id',
          'count', rolled
        );
      end if;
    end loop;
    if jsonb_array_length(drops_applied) > 0 then
      perform public.eternum_add_resources(caller, drops_applied);
    end if;

    -- Progress + Pass XP + bestiaire.
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
      'os_gained', os_reward,
      'xp_gained', xp_reward,
      'resources_gained', drops_applied,
      'player_power', player_power
    );
  end;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- WORLD BOSS — server-authoritative.
-- Damage calculé server-side : player_power × random(0.8, 1.2) × tier(jour).
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
  pass_xp int;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select count(*) into cur_count from public.eternum_world_boss_attempts
  where user_id = caller and attempt_date = current_date;
  if cur_count >= cap then return jsonb_build_object('ok', false, 'error', 'Cap journalier atteint (3/3).'); end if;

  pwr := public.eternum_player_power(caller);
  if pwr <= 0 then return jsonb_build_object('ok', false, 'error', 'Configure ton équipe de familiers.'); end if;

  -- Dégâts = power × multi (0.8 → 1.2).
  damage := pwr * 10 * (0.8 + random() * 0.4);
  insert into public.eternum_world_boss_attempts (user_id, attempt_date, damage)
  values (caller, current_date, damage);

  os_reward := damage / 100;
  update public.profiles set gold = gold + os_reward, updated_at = now() where id = caller;

  pass_xp := greatest(50, (damage / 1000)::int);
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
-- RAID — server-authoritative (solo).
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_attempt_raid(
  p_raid_id text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  required_power int;
  energy_cost int := 50;
  os_reward bigint;
  xp_reward bigint;
  hero_lv int;
  ok boolean;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  -- Raids = héros only, donc on check juste le level.
  select level into hero_lv from public.eternum_heroes where user_id = caller;
  if hero_lv is null then return jsonb_build_object('ok', false, 'error', 'Crée ton héros.'); end if;

  case p_raid_id
    when 'kraken'      then required_power := 30; os_reward := 5000;  xp_reward := 1500;
    when 'dragon-rouge' then required_power := 55; os_reward := 15000; xp_reward := 4000;
    when 'titan-stone' then required_power := 80; os_reward := 35000; xp_reward := 9000;
    else raise exception 'Raid inconnu : %', p_raid_id;
  end case;

  ok := public.eternum_consume_energy(caller, energy_cost);
  if not ok then return jsonb_build_object('ok', false, 'error', 'Énergie insuffisante.'); end if;

  if hero_lv < required_power then
    return jsonb_build_object('ok', true, 'won', false, 'hero_level', hero_lv, 'required_level', required_power);
  end if;

  update public.profiles set gold = gold + os_reward, updated_at = now() where id = caller;
  update public.eternum_heroes set xp = xp + xp_reward, updated_at = now() where user_id = caller;
  perform public.eternum_pass_grant_xp(xp_reward / 2);
  perform public.eternum_bestiary_add('raid-' || p_raid_id, true);

  return jsonb_build_object('ok', true, 'won', true, 'os_gained', os_reward, 'xp_gained', xp_reward);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- TOUR INFINIE — server-authoritative.
-- Gagne si player_power >= floor × 200.
-- ──────────────────────────────────────────────────────────────────────
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
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  pwr := public.eternum_player_power(caller);
  required := p_floor * 200;
  if pwr < required then
    return jsonb_build_object('ok', true, 'won', false, 'player_power', pwr, 'required', required);
  end if;

  os_reward := 50 + p_floor * 20;
  xp_reward := 30 + p_floor * 10;

  insert into public.eternum_tower_progress (user_id, best_floor)
  values (caller, p_floor)
  on conflict (user_id) do update
    set best_floor = greatest(public.eternum_tower_progress.best_floor, p_floor),
        updated_at = now();

  update public.profiles set gold = gold + os_reward where id = caller;
  update public.eternum_heroes set xp = xp + xp_reward where user_id = caller;
  perform public.eternum_pass_grant_xp(20 + p_floor * 5);
  perform public.eternum_quest_progress('weekly-tower', 1);

  return jsonb_build_object('ok', true, 'won', true, 'floor', p_floor, 'os_gained', os_reward, 'xp_gained', xp_reward);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- DREAM — server-authoritative.
-- Gagne si player_power >= recommended_level × 200. Drop shards selon table.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_attempt_dream(
  p_dream_id text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  required int;
  energy_cost int;
  pwr int;
  ok boolean;
  drops jsonb := '[]'::jsonb;
  shard_chances jsonb;
  total_shards int := 0;
  r jsonb;
  rolled int;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  case p_dream_id
    when 'dream-1' then required := 4000;  energy_cost := 30;
                          shard_chances := '[{"rarity":"common","chance":0.8,"max":3},{"rarity":"rare","chance":0.3,"max":2},{"rarity":"epic","chance":0.05,"max":1}]'::jsonb;
    when 'dream-2' then required := 10000; energy_cost := 40;
                          shard_chances := '[{"rarity":"rare","chance":0.7,"max":3},{"rarity":"epic","chance":0.4,"max":2},{"rarity":"legendary","chance":0.1,"max":1}]'::jsonb;
    when 'dream-3' then required := 16000; energy_cost := 60;
                          shard_chances := '[{"rarity":"epic","chance":0.6,"max":3},{"rarity":"legendary","chance":0.4,"max":2},{"rarity":"prismatic","chance":0.05,"max":1}]'::jsonb;
    else raise exception 'Mode Rêve inconnu : %', p_dream_id;
  end case;

  ok := public.eternum_consume_energy(caller, energy_cost);
  if not ok then return jsonb_build_object('ok', false, 'error', 'Énergie insuffisante.'); end if;

  pwr := public.eternum_player_power(caller);
  if pwr < required then
    return jsonb_build_object('ok', true, 'won', false, 'player_power', pwr, 'required', required);
  end if;

  for r in select * from jsonb_array_elements(shard_chances) loop
    if random() < (r->>'chance')::numeric then
      rolled := 1 + floor(random() * (r->>'max')::int);
      drops := drops || jsonb_build_object(
        'resource_id', 'shard-' || (r->>'rarity'),
        'count', rolled
      );
      total_shards := total_shards + rolled;
    end if;
  end loop;

  if jsonb_array_length(drops) > 0 then
    perform public.eternum_add_resources(caller, drops);
  end if;
  perform public.eternum_pass_grant_xp(30 + total_shards * 5);

  return jsonb_build_object('ok', true, 'won', true, 'shards', drops, 'total_shards', total_shards);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- DÉFI HEBDO — server-authoritative.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_attempt_challenge(
  p_challenge_id text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  pwr int;
  required int := 5000;  -- challenge boss = ~niveau 50
  os_reward bigint;
  resources jsonb := '[]'::jsonb;
  week_start date := date_trunc('week', current_date)::date;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  if exists (
    select 1 from public.eternum_weekly_challenges_done
    where user_id = caller and challenge_id = p_challenge_id and week_start = week_start
  ) then return jsonb_build_object('ok', false, 'error', 'Déjà complété cette semaine.'); end if;

  -- Validation des restrictions côté serveur.
  case p_challenge_id
    when 'no-heal' then
      if exists (
        select 1 from public.eternum_heroes h
        where h.user_id = caller and h.class_id in ('vampire','paladin')
      ) then return jsonb_build_object('ok', false, 'error', 'Restriction violée : pas de Vampire ni Paladin.'); end if;
      os_reward := 5000;
      resources := '[{"resource_id":"ruby","count":3}]'::jsonb;
    when 'solo-element' then
      -- Vérifie que tous les familiers actifs ont le même élément.
      if (select count(distinct element_id) from public.eternum_familiers_owned
          where user_id = caller and team_slot is not null) > 1 then
        return jsonb_build_object('ok', false, 'error', 'Restriction violée : familiers d''éléments différents.');
      end if;
      os_reward := 8000;
      resources := '[{"resource_id":"moon-silk","count":5}]'::jsonb;
    when 'no-ult' then
      os_reward := 6000;
      resources := '[{"resource_id":"mithril-ore","count":4}]'::jsonb;
    when 'speed-run' then
      -- Pour speed-run on demande un power élevé.
      required := 8000;
      os_reward := 7000;
      resources := '[{"resource_id":"ether-ore","count":2}]'::jsonb;
    else raise exception 'Défi inconnu : %', p_challenge_id;
  end case;

  pwr := public.eternum_player_power(caller);
  if pwr < required then
    return jsonb_build_object('ok', true, 'won', false, 'player_power', pwr, 'required', required);
  end if;

  insert into public.eternum_weekly_challenges_done (user_id, challenge_id, week_start)
  values (caller, p_challenge_id, week_start);

  update public.profiles set gold = gold + os_reward where id = caller;
  if jsonb_array_length(resources) > 0 then
    perform public.eternum_add_resources(caller, resources);
  end if;
  perform public.eternum_pass_grant_xp(150);

  return jsonb_build_object('ok', true, 'won', true, 'os_gained', os_reward);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- PVP — server-authoritative outcome (ELO + rewards).
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_attempt_pvp(
  p_defender_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  a_pwr int; d_pwr int;
  a_elo int; d_elo int;
  k int := 32;
  exp_a numeric; a_score numeric;
  a_new int; d_new int;
  winner uuid;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if caller = p_defender_id then return jsonb_build_object('ok', false, 'error', 'Tu ne peux pas te défier toi-même.'); end if;

  a_pwr := public.eternum_player_power(caller);
  d_pwr := public.eternum_player_power(p_defender_id);
  if a_pwr <= 0 or d_pwr <= 0 then return jsonb_build_object('ok', false, 'error', 'Joueur sans héros/équipe.'); end if;

  -- Outcome : power-based avec random tweaks (15%).
  declare a_roll numeric := a_pwr * (0.85 + random() * 0.30);
          d_roll numeric := d_pwr * (0.85 + random() * 0.30);
  begin
    winner := case when a_roll >= d_roll then caller else p_defender_id end;
  end;

  select pvp_elo into a_elo from public.eternum_heroes where user_id = caller for update;
  select pvp_elo into d_elo from public.eternum_heroes where user_id = p_defender_id for update;

  exp_a := 1.0 / (1.0 + power(10.0, (d_elo - a_elo) / 400.0));
  a_score := case when winner = caller then 1 else 0 end;
  a_new := a_elo + round(k * (a_score - exp_a));
  d_new := d_elo + round(k * ((1 - a_score) - (1 - exp_a)));

  update public.eternum_heroes set pvp_elo = greatest(0, a_new) where user_id = caller;
  update public.eternum_heroes set pvp_elo = greatest(0, d_new) where user_id = p_defender_id;

  insert into public.eternum_pvp_matches (
    attacker_id, defender_id, winner_id,
    attacker_elo_before, attacker_elo_after,
    defender_elo_before, defender_elo_after
  ) values (caller, p_defender_id, winner, a_elo, a_new, d_elo, d_new);

  if winner = caller then
    perform public.eternum_pass_grant_xp(100);
    perform public.eternum_quest_progress('weekly-pvp', 1);
  else
    perform public.eternum_pass_grant_xp(40);
  end if;

  return jsonb_build_object(
    'ok', true,
    'won', winner = caller,
    'attacker_elo_after', greatest(0, a_new),
    'defender_elo_after', greatest(0, d_new),
    'attacker_power', a_pwr,
    'defender_power', d_pwr
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- GUILD BOSS — server-authoritative.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_attempt_guild_boss()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  my_guild uuid;
  pwr int;
  damage bigint;
  cur_hp bigint; cur_tier int; reset_when timestamptz;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select guild_id into my_guild from public.eternum_guild_members where user_id = caller;
  if my_guild is null then raise exception 'Tu dois être dans une guilde.'; end if;

  insert into public.eternum_guild_boss_state (guild_id) values (my_guild)
  on conflict (guild_id) do nothing;

  select boss_hp_remaining, boss_tier, reset_at into cur_hp, cur_tier, reset_when
  from public.eternum_guild_boss_state where guild_id = my_guild for update;

  if now() >= reset_when then
    update public.eternum_guild_boss_state
    set boss_tier = boss_tier + 1,
        boss_hp_remaining = 50000 * (boss_tier + 1),
        reset_at = now() + interval '7 days'
    where guild_id = my_guild;
    select boss_hp_remaining, boss_tier into cur_hp, cur_tier
    from public.eternum_guild_boss_state where guild_id = my_guild;
  end if;

  if cur_hp <= 0 then return jsonb_build_object('ok', false, 'error', 'Boss déjà battu cette semaine.'); end if;

  pwr := public.eternum_player_power(caller);
  damage := pwr * 5 * (0.8 + random() * 0.4);

  update public.eternum_guild_boss_state
  set boss_hp_remaining = greatest(0, cur_hp - damage)
  where guild_id = my_guild;
  insert into public.eternum_guild_boss_attacks (guild_id, user_id, damage)
  values (my_guild, caller, damage);

  update public.profiles set gold = gold + (damage / 50 * cur_tier), updated_at = now() where id = caller;
  perform public.eternum_pass_grant_xp(50);

  return jsonb_build_object('ok', true, 'damage', damage, 'hp_left', greatest(0, cur_hp - damage), 'tier', cur_tier);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- PRESTIGE — reset progression + bonus permanents.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_prestige(
  p_new_class text,
  p_new_element text,
  p_new_job text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cur_level int;
  cur_evol int;
  valid_classes text[] := array['warrior','paladin','assassin','mage','priest','vampire'];
  valid_elements text[] := array['fire','water','wind','earth','light','dark'];
  valid_jobs text[] := array['blacksmith','tanner','weaver','jeweler','armorer','baker'];
  light_dark_unlocked boolean;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  select level, evolution_stage into cur_level, cur_evol
  from public.eternum_heroes where user_id = caller for update;
  if cur_level is null then raise exception 'Crée un héros d''abord.'; end if;
  if cur_level < 100 then raise exception 'Niveau 100 requis pour Prestige (actuel : %).', cur_level; end if;
  if cur_evol < 4 then raise exception 'Évolution finale (4) requise (actuel : %).', cur_evol; end if;

  if not (p_new_class = any(valid_classes)) then raise exception 'Classe invalide.'; end if;
  if not (p_new_element = any(valid_elements)) then raise exception 'Élément invalide.'; end if;
  if p_new_job is not null and not (p_new_job = any(valid_jobs)) then raise exception 'Métier invalide.'; end if;

  -- Lumière/Ombre dispos uniquement si déjà unlock (= déjà passé en prestige avec level/évol max).
  light_dark_unlocked := exists (
    select 1 from public.eternum_heroes
    where user_id = caller and (element_id = 'light' or element_id = 'dark')
  );
  if (p_new_element in ('light', 'dark')) and not light_dark_unlocked then
    -- Premier prestige avec niveau 100 + évolution 4 = unlock pour ce prestige.
    null;  -- on autorise vu qu'on remplit les conditions de unlock
  end if;

  update public.eternum_heroes
  set class_id = p_new_class,
      element_id = p_new_element,
      job_id = p_new_job,
      level = 1,
      xp = 0,
      evolution_stage = 0,
      prestige_count = prestige_count + 1,
      energy = 100,
      energy_updated_at = now(),
      idle_stage = 1,
      idle_updated_at = now(),
      updated_at = now()
  where user_id = caller;

  perform public.eternum_quest_progress('main-8-prestige', 1);
  perform public.eternum_pass_grant_xp(2000);

  return jsonb_build_object('ok', true, 'new_class', p_new_class, 'new_element', p_new_element);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- ÉVOLUTION HÉROS — auto au passage de niveaux 20/40/60/80.
-- Appelé via trigger sur update level (à l'occasion d'un gain XP).
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_check_level_up()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  needed bigint;
  new_level int := new.level;
  new_evol int := new.evolution_stage;
begin
  -- Promote level si XP suffisant. On boucle pour multiples niveaux.
  loop
    needed := round(100 * power(new_level, 1.6));
    exit when new.xp < needed or new_level >= 100;
    new.xp := new.xp - needed;
    new_level := new_level + 1;
  end loop;

  -- Évolutions automatiques (paliers 20/40/60/80).
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

-- ──────────────────────────────────────────────────────────────────────
-- PASS TIER CLAIM — claim un palier débloqué.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_pass_claim_tier(
  p_tier int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cur_xp bigint;
  cur_premium boolean;
  cur_last int;
  needed_xp bigint;
  os_free bigint;
  os_premium bigint;
  total_os bigint := 0;
  resources jsonb := '[]'::jsonb;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select xp, premium, last_claimed_tier into cur_xp, cur_premium, cur_last
  from public.eternum_pass_progress where user_id = caller for update;
  if cur_xp is null then raise exception 'Pass non initialisé.'; end if;

  needed_xp := p_tier * 1000;
  if cur_xp < needed_xp then raise exception 'Tier % pas atteint (% / %).', p_tier, cur_xp, needed_xp; end if;
  if p_tier <= cur_last then raise exception 'Tier % déjà claim.', p_tier; end if;

  os_free := 200 + p_tier * 50;
  total_os := os_free;
  if cur_premium then
    os_premium := 500 + p_tier * 100;
    total_os := total_os + os_premium;
    if p_tier % 5 = 0 then
      resources := '[{"resource_id":"ruby","count":1}]'::jsonb;
    end if;
  end if;

  update public.profiles set gold = gold + total_os, updated_at = now() where id = caller;
  if jsonb_array_length(resources) > 0 then
    perform public.eternum_add_resources(caller, resources);
  end if;
  update public.eternum_pass_progress set last_claimed_tier = p_tier, updated_at = now() where user_id = caller;

  return jsonb_build_object('ok', true, 'os_gained', total_os, 'premium', cur_premium);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- LUMIÈRE/OMBRE UNLOCK — disponible après évolution 4 + niveau 100.
-- Cette RPC change l'élément du héros sans Prestige.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_change_element(
  p_new_element text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cur_level int;
  cur_evol int;
  valid text[] := array['fire','water','wind','earth','light','dark'];
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if not (p_new_element = any(valid)) then raise exception 'Élément invalide.'; end if;

  select level, evolution_stage into cur_level, cur_evol
  from public.eternum_heroes where user_id = caller for update;
  if cur_level is null then raise exception 'Pas de héros.'; end if;
  if cur_evol < 4 or cur_level < 100 then
    raise exception 'Lumière/Ombre nécessitent évolution 4 + niveau 100.';
  end if;

  update public.eternum_heroes
  set element_id = p_new_element, updated_at = now()
  where user_id = caller;

  return jsonb_build_object('ok', true, 'element', p_new_element);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- LEND FAMILIER — prête un familier à un ami pour 1 jour.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_lend_familier(
  p_borrower_id uuid,
  p_familier_owned_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  is_friend boolean;
  fam_owner uuid;
  today_lent_count int;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  -- Vérifie que c'est un ami accepté.
  select exists (
    select 1 from public.eternum_friendships
    where status = 'accepted'
      and ((user_a = caller and user_b = p_borrower_id) or (user_a = p_borrower_id and user_b = caller))
  ) into is_friend;
  if not is_friend then raise exception 'Pas un ami accepté.'; end if;

  -- Vérifie le familier appartient bien à toi.
  select user_id into fam_owner from public.eternum_familiers_owned where id = p_familier_owned_id;
  if fam_owner is null or fam_owner <> caller then raise exception 'Pas ton familier.'; end if;

  -- Cap : 1 prêt par ami par jour.
  select count(*) into today_lent_count from public.eternum_familier_lends
  where lender_id = caller and borrower_id = p_borrower_id
    and lent_at::date = current_date;
  if today_lent_count >= 1 then raise exception 'Déjà un prêt aujourd''hui à cet ami.'; end if;

  insert into public.eternum_familier_lends (lender_id, borrower_id, familier_id)
  values (caller, p_borrower_id, p_familier_owned_id);

  return jsonb_build_object('ok', true);
end;
$$;
