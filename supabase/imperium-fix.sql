-- IMPERIUM FIX — Étape 1 : combler les TODOs critiques.
-- Run this in Supabase SQL Editor (idempotent, additif sur imperium.sql).
--
-- Couvre :
--   1a. Génération NPC (fermes barbares + oasis)
--   1b. Forge bonus dans combat resolver
--   1c. Hooks achievements automatiques
--   1d. Tracking score leaderboard
--   1e. Distribution quotidienne des quêtes

-- ══════════════════════════════════════════════════════════════════════
-- 0. TABLES ADDITIONNELLES
-- ══════════════════════════════════════════════════════════════════════

-- Cumuls par utilisateur pour les achievements à seuil
create table if not exists public.imperium_stats (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  kills_total             bigint not null default 0,
  losses_total            bigint not null default 0,
  loot_total              bigint not null default 0,
  units_recruited_elite   bigint not null default 0,
  oasis_owned             int    not null default 0,
  villages_conquered      int    not null default 0,
  power_max               bigint not null default 0,
  updated_at              timestamptz not null default now()
);
alter table public.imperium_stats enable row level security;
drop policy if exists "imperium_stats_read_own" on public.imperium_stats;
create policy "imperium_stats_read_own" on public.imperium_stats
  for select using (auth.uid() = user_id);

-- Cooldown conquête (1 par mois par user)
create table if not exists public.imperium_conquests_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  village_id    uuid not null references public.imperium_villages(id) on delete cascade,
  conquered_at  timestamptz not null default now()
);
create index if not exists imperium_conquests_log_user_idx
  on public.imperium_conquests_log(user_id, conquered_at desc);

-- Index utile pour assign_daily_quests (anti-doublon par jour)
-- expires_at est calé sur date_trunc('day', now()) + 1j donc l'unicité (user, quest, expires_at) suffit
create unique index if not exists imperium_quests_user_quest_expires_idx
  on public.imperium_quests(user_id, quest_id, expires_at);

-- ══════════════════════════════════════════════════════════════════════
-- 1. HELPERS — grant achievement + leaderboard add
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_grant_achievement(
  p_user_id uuid, p_achievement_id text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null then return; end if;
  insert into public.imperium_achievements (user_id, achievement_id)
  values (p_user_id, p_achievement_id)
  on conflict (user_id, achievement_id) do nothing;
end;
$$;

create or replace function public.imperium_lb_add(
  p_user_id uuid, p_category text, p_amount bigint
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null or p_amount <= 0 then return; end if;
  if p_category not in ('attack','defense','economy') then return; end if;
  insert into public.imperium_leaderboard_weekly (week_start, user_id, category, score)
  values (date_trunc('week', now())::date, p_user_id, p_category, p_amount)
  on conflict (week_start, user_id, category) do update
    set score = public.imperium_leaderboard_weekly.score + p_amount;
end;
$$;

create or replace function public.imperium_stats_inc(
  p_user_id uuid, p_kills bigint, p_losses bigint, p_loot bigint
) returns void language plpgsql security definer set search_path = public as $$
declare new_kills bigint;
begin
  if p_user_id is null then return; end if;
  insert into public.imperium_stats (user_id, kills_total, losses_total, loot_total)
  values (p_user_id, p_kills, p_losses, p_loot)
  on conflict (user_id) do update set
    kills_total  = public.imperium_stats.kills_total  + p_kills,
    losses_total = public.imperium_stats.losses_total + p_losses,
    loot_total   = public.imperium_stats.loot_total   + p_loot,
    updated_at   = now()
  returning kills_total into new_kills;

  -- Achievements à seuil cumulés
  if new_kills >= 1000  then perform public.imperium_grant_achievement(p_user_id, 'ach_butcher'); end if;
  if new_kills >= 10000 then perform public.imperium_grant_achievement(p_user_id, 'ach_massacre'); end if;

  -- Loot cumulé
  declare loot_now bigint;
  begin
    select loot_total into loot_now from public.imperium_stats where user_id = p_user_id;
    if loot_now >= 100000  then perform public.imperium_grant_achievement(p_user_id, 'ach_loot_100k'); end if;
    if loot_now >= 1000000 then perform public.imperium_grant_achievement(p_user_id, 'ach_loot_1m'); end if;
  end;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 2. TRIGGER — achievements automatiques sur upgrade hôtel
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_check_hall_achievements()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if new.kind <> 'town_hall' then return new; end if;
  select user_id into uid from public.imperium_villages where id = new.village_id;
  if uid is null then return new; end if;
  if new.level >= 5  then perform public.imperium_grant_achievement(uid, 'ach_hall_5');  end if;
  if new.level >= 10 then perform public.imperium_grant_achievement(uid, 'ach_hall_10'); end if;
  if new.level >= 15 then perform public.imperium_grant_achievement(uid, 'ach_hall_15'); end if;
  if new.level >= 20 then perform public.imperium_grant_achievement(uid, 'ach_hall_20'); end if;
  if new.level >= 25 then perform public.imperium_grant_achievement(uid, 'ach_hall_25'); end if;
  return new;
end;
$$;

drop trigger if exists imperium_hall_ach_trigger on public.imperium_buildings;
create trigger imperium_hall_ach_trigger
after insert or update of level on public.imperium_buildings
for each row execute function public.imperium_check_hall_achievements();

-- Trigger : achievement "centre complet" (12 bâtiments du centre construits)
create or replace function public.imperium_check_center_complete()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid; nb int;
begin
  if new.kind in ('wood_field','clay_field','iron_field','wheat_field','wonder') then return new; end if;
  select user_id into uid from public.imperium_villages where id = new.village_id;
  select count(distinct kind) into nb from public.imperium_buildings
    where village_id = new.village_id and slot >= 0 and kind <> 'wonder';
  if nb >= 12 then perform public.imperium_grant_achievement(uid, 'ach_center_complete'); end if;
  return new;
end;
$$;

drop trigger if exists imperium_center_trigger on public.imperium_buildings;
create trigger imperium_center_trigger
after insert on public.imperium_buildings
for each row execute function public.imperium_check_center_complete();

-- ══════════════════════════════════════════════════════════════════════
-- 3. COMBAT RESOLVER avec forge bonuses (refactor)
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_combat_resolve(
  p_units_attacker jsonb,
  p_faction_attacker text,
  p_units_defender jsonb,
  p_faction_defender text,
  p_wall_level int,
  p_attacker_forge jsonb default '{}'::jsonb,
  p_defender_forge jsonb default '{}'::jsonb
) returns jsonb language plpgsql immutable as $$
declare
  att_kind text; def_kind text;
  att_count int; def_count int;
  ub jsonb;
  power_att numeric := 0;
  power_def_inf numeric := 0;
  power_def_cav numeric := 0;
  total_att_inf numeric := 0;
  total_att_all numeric := 0;
  ratio_inf_att numeric;
  power_def numeric;
  wall_bonus numeric;
  ratio numeric;
  att_loss numeric;
  def_loss numeric;
  forge_att numeric;
  forge_def numeric;
begin
  for att_kind, att_count in select * from jsonb_each_text(p_units_attacker) loop
    if att_count::int = 0 then continue; end if;
    ub := public.imperium_unit_base(p_faction_attacker, att_kind);
    if ub is null then continue; end if;
    forge_att := coalesce((p_attacker_forge->att_kind->>'attack')::numeric, 0);
    power_att := power_att + att_count::int * (ub->>'att')::int * (1 + forge_att);
    total_att_all := total_att_all + att_count::int;
    if (ub->>'cat') = 'inf' then total_att_inf := total_att_inf + att_count::int; end if;
  end loop;

  for def_kind, def_count in select * from jsonb_each_text(p_units_defender) loop
    if def_count::int = 0 then continue; end if;
    ub := public.imperium_unit_base(p_faction_defender, def_kind);
    if ub is null then continue; end if;
    forge_def := coalesce((p_defender_forge->def_kind->>'defense')::numeric, 0);
    power_def_inf := power_def_inf + def_count::int * (ub->>'di')::int * (1 + forge_def);
    power_def_cav := power_def_cav + def_count::int * (ub->>'dc')::int * (1 + forge_def);
  end loop;

  if total_att_all = 0 then ratio_inf_att := 0;
  else ratio_inf_att := total_att_inf / total_att_all; end if;

  power_def := ratio_inf_att * power_def_inf + (1 - ratio_inf_att) * power_def_cav;
  wall_bonus := public.imperium_wall_bonus(p_faction_defender, p_wall_level);
  power_def := power_def * (1 + wall_bonus);
  ratio := power_att / greatest(power_def, 1);

  if ratio >= 1 then
    att_loss := power(1.0 / ratio, 1.5);
    def_loss := 1.0;
  else
    att_loss := 1.0;
    def_loss := power(ratio, 1.5);
  end if;

  return jsonb_build_object(
    'attacker_power', floor(power_att),
    'defense_power', floor(power_def),
    'ratio', round(ratio::numeric, 3),
    'att_loss_pct', round(att_loss::numeric, 4),
    'def_loss_pct', round(def_loss::numeric, 4),
    'wall_bonus', wall_bonus
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 4. RESOLVE_ONE_MARCH refactor : forge + achievements + leaderboard + stats
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_resolve_one_march(p_march_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m record;
  src record;
  target_map record;
  target_village record;
  combat jsonb;
  defender_units jsonb := '{}'::jsonb;
  wall_level int := 0;
  defender_faction text;
  defender_user uuid;
  loot_w int := 0; loot_c int := 0; loot_i int := 0; loot_wh int := 0;
  visible_w numeric; visible_c numeric; visible_i numeric; visible_wh numeric;
  hideout_lvl int := 0; hideout_cap int := 0;
  loot_capacity int := 0;
  k text; cnt int;
  ub jsonb;
  surviving_units jsonb := '{}'::jsonb;
  remaining int;
  return_seconds int;
  src_speed numeric := 1000;
  attacker_forge jsonb := '{}'::jsonb;
  defender_forge jsonb := '{}'::jsonb;
  total_kills int := 0;
  total_losses int := 0;
  total_loot int := 0;
  rams_alive int := 0;
  catapults_alive int := 0;
  oasis_count int;
begin
  select * into m from public.imperium_marches where id = p_march_id for update;
  if m.id is null or m.state <> 'outbound' or m.arrives_at > now() then return null; end if;

  select * into src from public.imperium_villages where id = m.from_village_id;
  select * into target_map from public.imperium_map where x = m.to_x and y = m.to_y;

  -- ESPIONNAGE : retour direct avec rapport
  if m.kind = 'spy' then
    update public.imperium_marches set state = 'returning',
      returns_at = m.arrives_at + (m.arrives_at - m.created_at)
    where id = p_march_id;
    insert into public.imperium_reports (attacker_user_id, defender_user_id, march_id, kind, data)
    values (
      src.user_id,
      case when target_map.kind = 'player_village'
        then (select user_id from public.imperium_villages where id = target_map.village_id) end,
      p_march_id, 'spy',
      jsonb_build_object('target_x', m.to_x, 'target_y', m.to_y, 'spotted', false)
    );
    return jsonb_build_object('ok', true, 'kind', 'spy');
  end if;

  -- Récupérer composition défense + faction + wall + forge bonuses
  if target_map.kind = 'player_village' then
    select * into target_village from public.imperium_villages where id = target_map.village_id for update;
    defender_faction := target_village.faction;
    defender_user := target_village.user_id;
    select coalesce(jsonb_object_agg(unit_kind, count), '{}'::jsonb)
      into defender_units
      from public.imperium_units where village_id = target_village.id and count > 0;
    -- Soutiens
    for k, cnt in
      select sub.unit_kind, sum(sub.cnt)::int from (
        select e.key as unit_kind, e.value::int as cnt
        from public.imperium_supports s, lateral jsonb_each_text(s.units) e
        where s.host_village_id = target_village.id and s.recalled_at is null
      ) sub group by sub.unit_kind
    loop
      defender_units := jsonb_set(defender_units, array[k],
        to_jsonb(coalesce((defender_units->>k)::int, 0) + cnt));
    end loop;
    select coalesce(level, 0) into wall_level
      from public.imperium_buildings where village_id = target_village.id and kind = 'wall';
    -- Forge défenseur
    select coalesce(jsonb_object_agg(unit_kind,
        jsonb_build_object('attack', attack_level * 0.01, 'defense', defense_level * 0.01)
      ), '{}'::jsonb)
      into defender_forge
      from public.imperium_forge where village_id = target_village.id;
  elsif target_map.kind = 'barbarian' then
    defender_faction := 'legion';
    defender_units := coalesce(target_map.data->'garrison', '{}'::jsonb);
  elsif target_map.kind = 'oasis' then
    defender_faction := 'horde';
    defender_units := coalesce(target_map.data->'garrison', '{}'::jsonb);
  elsif target_map.kind = 'wonder' then
    defender_faction := 'legion';
    defender_units := coalesce(target_map.data->'garrison', '{}'::jsonb);
  else
    defender_units := '{}'::jsonb;
    defender_faction := 'legion';
  end if;

  -- Forge attaquant
  select coalesce(jsonb_object_agg(unit_kind,
      jsonb_build_object('attack', attack_level * 0.01, 'defense', defense_level * 0.01)
    ), '{}'::jsonb)
    into attacker_forge
    from public.imperium_forge where village_id = m.from_village_id;

  -- Combat
  combat := public.imperium_combat_resolve(
    m.units, src.faction, defender_units, defender_faction, wall_level,
    attacker_forge, defender_forge
  );

  -- Survivants attaquant + comptage pertes & loot capacity
  for k, cnt in select * from jsonb_each_text(m.units) loop
    if cnt::int = 0 then continue; end if;
    remaining := floor(cnt::int * (1.0 - (combat->>'att_loss_pct')::numeric))::int;
    total_losses := total_losses + (cnt::int - remaining);
    if remaining > 0 then
      surviving_units := jsonb_set(surviving_units, array[k], to_jsonb(remaining));
      ub := public.imperium_unit_base(src.faction, k);
      loot_capacity := loot_capacity + remaining * coalesce((ub->>'loot')::int, 0);
      if (ub->>'vit')::numeric < src_speed then src_speed := (ub->>'vit')::numeric; end if;
      if k = 'ram' then rams_alive := rams_alive + remaining; end if;
      if k in ('catapult','trebuchet') then catapults_alive := catapults_alive + remaining; end if;
    end if;
  end loop;

  -- Pertes défenseur (count)
  for k, cnt in select * from jsonb_each_text(defender_units) loop
    total_kills := total_kills + (cnt::int * (combat->>'def_loss_pct')::numeric)::int;
  end loop;

  -- Loot si attaquant gagne
  if (combat->>'def_loss_pct')::numeric >= 0.99 and m.kind in ('raid','attack','conquest') then
    if target_map.kind = 'player_village' then
      select coalesce(level, 0) into hideout_lvl
        from public.imperium_buildings where village_id = target_village.id and kind = 'hideout';
      hideout_cap := public.imperium_hideout_cap(hideout_lvl);
      visible_w  := greatest(0, target_village.wood  - hideout_cap);
      visible_c  := greatest(0, target_village.clay  - hideout_cap);
      visible_i  := greatest(0, target_village.iron  - hideout_cap);
      visible_wh := greatest(0, target_village.wheat - hideout_cap);
      loot_w  := least(floor(visible_w  * 0.30)::int, loot_capacity);
      loot_capacity := loot_capacity - loot_w;
      loot_c  := least(floor(visible_c  * 0.30)::int, loot_capacity);
      loot_capacity := loot_capacity - loot_c;
      loot_i  := least(floor(visible_i  * 0.30)::int, loot_capacity);
      loot_capacity := loot_capacity - loot_i;
      loot_wh := least(floor(visible_wh * 0.30)::int, loot_capacity);
      update public.imperium_villages
        set wood = wood - loot_w, clay = clay - loot_c, iron = iron - loot_i, wheat = wheat - loot_wh,
            shield_until = now() + interval '12 hours'
        where id = target_village.id;
    elsif target_map.kind = 'barbarian' then
      visible_w  := coalesce((target_map.data->>'wood')::numeric, 0);
      visible_c  := coalesce((target_map.data->>'clay')::numeric, 0);
      visible_i  := coalesce((target_map.data->>'iron')::numeric, 0);
      visible_wh := coalesce((target_map.data->>'wheat')::numeric, 0);
      loot_w  := least(floor(visible_w  * 0.50)::int, loot_capacity);
      loot_capacity := loot_capacity - loot_w;
      loot_c  := least(floor(visible_c  * 0.50)::int, loot_capacity);
      loot_capacity := loot_capacity - loot_c;
      loot_i  := least(floor(visible_i  * 0.50)::int, loot_capacity);
      loot_capacity := loot_capacity - loot_i;
      loot_wh := least(floor(visible_wh * 0.50)::int, loot_capacity);
      -- Reset 24h sur la ferme barbare
      update public.imperium_map
        set data = data || jsonb_build_object('wood', 0, 'clay', 0, 'iron', 0, 'wheat', 0, 'reset_at', now() + interval '24 hours')
        where x = m.to_x and y = m.to_y;
    end if;
    total_loot := loot_w + loot_c + loot_i + loot_wh;
  end if;

  -- Sièges (béliers + catapultes) — si attaquant gagne et attack
  if (combat->>'def_loss_pct')::numeric >= 0.99
     and m.kind = 'attack'
     and target_map.kind = 'player_village' then
    -- Béliers : 1 niveau de muraille perdu par batch de 4 béliers survivants
    if rams_alive >= 4 and wall_level > 0 then
      update public.imperium_buildings
        set level = greatest(0, level - floor(rams_alive / 4)::int)
        where village_id = target_village.id and kind = 'wall';
    end if;
    -- Catapultes : 20% chance par catapulte de détruire 1 niveau du target_building
    if catapults_alive > 0 and m.target_building is not null then
      if random() < (1.0 - power(0.8, catapults_alive)) then
        update public.imperium_buildings
          set level = greatest(0, level - 1)
          where village_id = target_village.id and kind = m.target_building;
      end if;
    end if;
  end if;

  -- Conquête (si conquest et défense écrasée)
  if m.kind = 'conquest'
     and (combat->>'def_loss_pct')::numeric >= 0.99
     and target_map.kind = 'player_village'
     and (surviving_units ? 'senator' or surviving_units ? 'khan' or surviving_units ? 'grand_master')
  then
    -- Vérifie cooldown
    if not exists (
      select 1 from public.imperium_conquests_log
      where user_id = src.user_id and conquered_at > now() - interval '30 days'
    ) and (
      select count(*) from public.imperium_villages where user_id = src.user_id
    ) < 3 then
      update public.imperium_villages
        set user_id = src.user_id, is_secondary = true,
            shield_until = now() + interval '48 hours'
        where id = target_village.id;
      insert into public.imperium_conquests_log (user_id, village_id)
        values (src.user_id, target_village.id);
      perform public.imperium_grant_achievement(src.user_id, 'ach_conquest_first');
    end if;
  end if;

  -- Appliquer pertes défenseur (joueur seulement, garnison NPC stockée dans data)
  if target_map.kind = 'player_village' and (combat->>'def_loss_pct')::numeric > 0 then
    for k, cnt in select * from jsonb_each_text(defender_units) loop
      remaining := floor(cnt::int * (1.0 - (combat->>'def_loss_pct')::numeric))::int;
      update public.imperium_units set count = remaining
        where village_id = target_village.id and unit_kind = k;
    end loop;
    -- Bouclier 12h pour le défenseur s'il a subi des pertes
    if total_kills > 0 then
      update public.imperium_villages
        set shield_until = now() + interval '12 hours' where id = target_village.id;
    end if;
  elsif target_map.kind in ('barbarian','oasis') and (combat->>'def_loss_pct')::numeric >= 0.99 then
    -- NPC : on vide la garrison
    update public.imperium_map set data = data || jsonb_build_object('garrison', '{}'::jsonb)
      where x = m.to_x and y = m.to_y;
  end if;

  -- ─── Achievements + leaderboard + stats
  if total_kills > 0 then
    perform public.imperium_grant_achievement(src.user_id, 'ach_first_blood');
    perform public.imperium_lb_add(src.user_id, 'attack', total_kills);
    if defender_user is not null then
      perform public.imperium_lb_add(defender_user, 'defense', total_losses);
    end if;
  end if;
  if total_loot > 0 and m.kind = 'raid' then
    perform public.imperium_grant_achievement(src.user_id, 'ach_first_raid');
  end if;
  if target_map.kind = 'barbarian' and total_loot > 0 then
    perform public.imperium_grant_achievement(src.user_id, 'ach_first_barbarian');
  end if;
  perform public.imperium_stats_inc(src.user_id, total_kills, 0, total_loot);
  if defender_user is not null then
    perform public.imperium_stats_inc(defender_user, 0, total_losses, 0);
  end if;

  -- ─── Conquête oasis (oasis_first + oasis_triple)
  if m.kind in ('raid','attack')
     and target_map.kind = 'oasis'
     and (combat->>'def_loss_pct')::numeric >= 0.99
     and public.imperium_distance(src.x, src.y, m.to_x, m.to_y) <= 1
  then
    -- Limite 3 oasis par village
    select count(*) into oasis_count
      from public.imperium_oasis_ownership where village_id = m.from_village_id;
    if oasis_count < 3 then
      delete from public.imperium_oasis_ownership where oasis_x = m.to_x and oasis_y = m.to_y;
      insert into public.imperium_oasis_ownership (village_id, oasis_x, oasis_y)
        values (m.from_village_id, m.to_x, m.to_y);
      perform public.imperium_grant_achievement(src.user_id, 'ach_oasis_first');
      if oasis_count + 1 >= 3 then
        perform public.imperium_grant_achievement(src.user_id, 'ach_oasis_triple');
      end if;
    end if;
  end if;

  -- Rapport
  insert into public.imperium_reports (
    attacker_user_id, defender_user_id, march_id, kind, data
  ) values (
    src.user_id, defender_user, p_march_id, m.kind,
    jsonb_build_object(
      'target_x', m.to_x, 'target_y', m.to_y, 'target_kind', target_map.kind,
      'attacker_units', m.units, 'defender_units', defender_units,
      'combat', combat, 'survivors', surviving_units,
      'loot', jsonb_build_object('wood', loot_w, 'clay', loot_c, 'iron', loot_i, 'wheat', loot_wh)
    )
  );

  -- Lance retour
  if src_speed >= 1000 then src_speed := 5; end if;
  return_seconds := ceil((public.imperium_distance(src.x, src.y, m.to_x, m.to_y) / src_speed) * 3600)::int;
  update public.imperium_marches set state = 'returning',
    returns_at = now() + (return_seconds * interval '1 second'),
    loot = jsonb_build_object('wood', loot_w, 'clay', loot_c, 'iron', loot_i, 'wheat', loot_wh),
    units = surviving_units
    where id = p_march_id;

  return jsonb_build_object('ok', true, 'combat', combat,
    'kills', total_kills, 'losses', total_losses, 'loot', total_loot);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 5. HOOKS achievements dans alliances
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_join_alliance(p_alliance_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cap int;
  current_count int;
  chief_embassy_lvl int := 0;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if exists (select 1 from public.imperium_alliance_members where user_id = caller) then
    raise exception 'Déjà dans une alliance.';
  end if;
  select coalesce(max(b.level), 0) into chief_embassy_lvl
    from public.imperium_alliances a
    join public.imperium_villages v on v.user_id = a.chief_id
    join public.imperium_buildings b on b.village_id = v.id and b.kind = 'embassy'
    where a.id = p_alliance_id;
  cap := 9 + 3 * chief_embassy_lvl;
  select count(*) into current_count from public.imperium_alliance_members where alliance_id = p_alliance_id;
  if current_count >= cap then raise exception 'Alliance pleine.'; end if;
  insert into public.imperium_alliance_members (alliance_id, user_id, role)
    values (p_alliance_id, caller, 'member');
  perform public.imperium_grant_achievement(caller, 'ach_alliance_join');
  return true;
end;
$$;

-- Hook chef d'alliance dans create_alliance
create or replace function public.imperium_create_alliance(
  p_name text, p_tag text, p_color text default '#888888'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  new_id uuid;
  embassy_lvl int := 0;
  main_v record;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if exists (select 1 from public.imperium_alliance_members where user_id = caller) then
    raise exception 'Tu es déjà dans une alliance.';
  end if;
  select coalesce(max(b.level), 0) into embassy_lvl
    from public.imperium_villages v
    join public.imperium_buildings b on b.village_id = v.id and b.kind = 'embassy'
    where v.user_id = caller;
  if embassy_lvl < 3 then raise exception 'Ambassade niveau 3 requise.'; end if;
  select * into main_v from public.imperium_villages
    where user_id = caller and is_secondary = false limit 1;
  if main_v.id is null then raise exception 'Pas de village principal.'; end if;
  perform public.imperium_tick(main_v.id);
  select * into main_v from public.imperium_villages where id = main_v.id for update;
  if main_v.wood < 5000 or main_v.clay < 5000 or main_v.iron < 5000 or main_v.wheat < 2000 then
    raise exception 'Ressources insuffisantes (5000/5000/5000/2000).';
  end if;
  update public.imperium_villages
    set wood = wood - 5000, clay = clay - 5000, iron = iron - 5000, wheat = wheat - 2000
    where id = main_v.id;
  insert into public.imperium_alliances (name, tag, color, chief_id)
    values (p_name, upper(p_tag), p_color, caller) returning id into new_id;
  insert into public.imperium_alliance_members (alliance_id, user_id, role)
    values (new_id, caller, 'chief');
  perform public.imperium_grant_achievement(caller, 'ach_alliance_chief');
  perform public.imperium_grant_achievement(caller, 'ach_alliance_join');
  return new_id;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 6. TICK refactor : tracking économie leaderboard
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_tick(p_village_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v record;
  elapsed_sec bigint;
  wood_rate numeric := 5; clay_rate numeric := 5; iron_rate numeric := 5; wheat_rate numeric := 5;
  wood_cap int := 800; wheat_cap int := 800;
  wood_lvl int := 0; clay_lvl int := 0; iron_lvl int := 0; wheat_lvl int := 0;
  oasis_bonus_wood numeric := 0; oasis_bonus_clay numeric := 0; oasis_bonus_iron numeric := 0; oasis_bonus_wheat numeric := 0;
  wheat_drain numeric := 0;
  net_wheat numeric;
  rec record;
  produced numeric;
begin
  select * into v from public.imperium_villages where id = p_village_id for update;
  if v.id is null then raise exception 'Village introuvable.'; end if;

  elapsed_sec := greatest(0, extract(epoch from now() - v.last_tick)::bigint);

  select coalesce(max(case when kind = 'wood_field' then level end), 0),
         coalesce(max(case when kind = 'clay_field' then level end), 0),
         coalesce(max(case when kind = 'iron_field' then level end), 0),
         coalesce(max(case when kind = 'wheat_field' then level end), 0)
    into wood_lvl, clay_lvl, iron_lvl, wheat_lvl
    from public.imperium_buildings where village_id = p_village_id;

  select coalesce(sum(public.imperium_storage_cap(level)) filter (where kind = 'warehouse'), 800),
         coalesce(sum(public.imperium_storage_cap(level)) filter (where kind = 'granary'), 800)
    into wood_cap, wheat_cap
    from public.imperium_buildings where village_id = p_village_id;

  for rec in select data from public.imperium_map m
             join public.imperium_oasis_ownership o on o.oasis_x = m.x and o.oasis_y = m.y
             where o.village_id = p_village_id loop
    oasis_bonus_wood  := oasis_bonus_wood  + coalesce((rec.data->>'bonus_wood')::numeric, 0);
    oasis_bonus_clay  := oasis_bonus_clay  + coalesce((rec.data->>'bonus_clay')::numeric, 0);
    oasis_bonus_iron  := oasis_bonus_iron  + coalesce((rec.data->>'bonus_iron')::numeric, 0);
    oasis_bonus_wheat := oasis_bonus_wheat + coalesce((rec.data->>'bonus_wheat')::numeric, 0);
  end loop;

  wood_rate  := public.imperium_field_rate(wood_lvl)  * (1 + oasis_bonus_wood);
  clay_rate  := public.imperium_field_rate(clay_lvl)  * (1 + oasis_bonus_clay);
  iron_rate  := public.imperium_field_rate(iron_lvl)  * (1 + oasis_bonus_iron);
  wheat_rate := public.imperium_field_rate(wheat_lvl) * (1 + oasis_bonus_wheat);

  select coalesce(sum(u.count * coalesce((public.imperium_unit_base(v.faction, u.unit_kind)->>'wheat_h')::numeric, 0)), 0)
    into wheat_drain from public.imperium_units u where u.village_id = p_village_id;

  net_wheat := wheat_rate - wheat_drain;

  update public.imperium_villages
    set wood  = least(wood  + wood_rate  * elapsed_sec / 3600.0, wood_cap),
        clay  = least(clay  + clay_rate  * elapsed_sec / 3600.0, wood_cap),
        iron  = least(iron  + iron_rate  * elapsed_sec / 3600.0, wood_cap),
        wheat = greatest(0, least(wheat + net_wheat * elapsed_sec / 3600.0, wheat_cap)),
        last_tick = now()
    where id = p_village_id;

  -- Famine
  if net_wheat < 0 then
    declare
      kills int := floor(elapsed_sec / 1800.0);
      victim record;
    begin
      while kills > 0 loop
        select unit_kind into victim
          from public.imperium_units u
          where u.village_id = p_village_id and u.count > 0
          order by coalesce((public.imperium_unit_base(v.faction, u.unit_kind)->>'wheat_h')::numeric, 0) desc
          limit 1;
        exit when victim.unit_kind is null;
        update public.imperium_units set count = count - 1
          where village_id = p_village_id and unit_kind = victim.unit_kind;
        kills := kills - 1;
      end loop;
    end;
  end if;

  -- Termine constructions/recherches/forge
  for rec in select * from public.imperium_construction_queue
             where village_id = p_village_id and finishes_at <= now() loop
    if rec.kind = 'building' then
      insert into public.imperium_buildings (village_id, slot, kind, level)
        values (p_village_id, rec.target_slot, rec.target_kind, rec.target_level)
        on conflict (village_id, slot) do update set kind = excluded.kind, level = excluded.level;
    elsif rec.kind = 'research' then
      insert into public.imperium_research (village_id, unit_kind, researched)
        values (p_village_id, rec.target_kind, true)
        on conflict (village_id, unit_kind) do update set researched = true;
    elsif rec.kind = 'forge' then
      declare
        axis text := split_part(rec.target_kind, '/', 2);
        unit text := split_part(rec.target_kind, '/', 1);
      begin
        if axis = 'attack' then
          insert into public.imperium_forge (village_id, unit_kind, attack_level, defense_level)
            values (p_village_id, unit, rec.target_level, 0)
            on conflict (village_id, unit_kind) do update set attack_level = rec.target_level;
        else
          insert into public.imperium_forge (village_id, unit_kind, attack_level, defense_level)
            values (p_village_id, unit, 0, rec.target_level)
            on conflict (village_id, unit_kind) do update set defense_level = rec.target_level;
        end if;
        if rec.target_level >= 20 then
          perform public.imperium_grant_achievement(v.user_id, 'ach_forge_max');
        end if;
      end;
    end if;
    delete from public.imperium_construction_queue where id = rec.id;
  end loop;

  -- Termine recrutements
  for rec in select * from public.imperium_units
             where village_id = p_village_id and recruiting_count > 0 and recruiting_finishes_at is not null loop
    declare
      sec_since_start int;
      finished int;
    begin
      if rec.per_unit_seconds is null or rec.per_unit_seconds <= 0 then continue; end if;
      sec_since_start := greatest(0, extract(epoch from now() - (rec.recruiting_finishes_at - (rec.recruiting_count * rec.per_unit_seconds * interval '1 second')))::int);
      finished := least(rec.recruiting_count, sec_since_start / rec.per_unit_seconds);
      if finished > 0 then
        update public.imperium_units
          set count = count + finished,
              recruiting_count = recruiting_count - finished,
              recruiting_finishes_at = case when recruiting_count - finished <= 0 then null else recruiting_finishes_at end
          where village_id = p_village_id and unit_kind = rec.unit_kind;
      end if;
    end;
  end loop;

  -- Tracking économie leaderboard (tranche d'1 minute de prod, pour limiter les updates)
  if elapsed_sec >= 60 then
    produced := (wood_rate + clay_rate + iron_rate + greatest(0, wheat_rate)) * elapsed_sec / 3600.0;
    perform public.imperium_lb_add(v.user_id, 'economy', floor(produced)::bigint);
  end if;

  -- Stats puissance max + achievements puissance
  declare
    cur_power bigint;
  begin
    cur_power := public.imperium_compute_power(v.user_id);
    update public.imperium_stats set power_max = greatest(power_max, cur_power), updated_at = now()
      where user_id = v.user_id;
    if not found then
      insert into public.imperium_stats (user_id, power_max) values (v.user_id, cur_power)
        on conflict (user_id) do update set power_max = greatest(public.imperium_stats.power_max, cur_power);
    end if;
    if cur_power >= 100000 then perform public.imperium_grant_achievement(v.user_id, 'ach_power_100k'); end if;
    if cur_power >= 500000 then perform public.imperium_grant_achievement(v.user_id, 'ach_power_500k'); end if;
  end;

  return jsonb_build_object('ok', true, 'elapsed_sec', elapsed_sec);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 7. GÉNÉRATION INITIALE DES NPC SUR LA CARTE
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_generate_npcs() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cx int; cy int;
  spawned_barbarians int := 0;
  spawned_oasis int := 0;
  dist_to_center int;
  barb_level int;
  oasis_type text;
  garrison jsonb;
  total_cells int := 0;
  roll numeric;
begin
  for cx in -50..50 loop
    for cy in -50..50 loop
      total_cells := total_cells + 1;
      -- Skip cases déjà occupées (villages joueurs, merveilles, NPC existants)
      if exists (select 1 from public.imperium_map m where m.x = cx and m.y = cy and m.kind <> 'empty') then
        continue;
      end if;
      -- Skip trop proche de villages joueurs (distance < 3)
      if exists (
        select 1 from public.imperium_villages v
        where greatest(abs(v.x - cx), abs(v.y - cy)) < 3
      ) then continue; end if;
      -- Skip cases merveilles (-2..2 hors 0,0)
      if cx between -2 and 2 and cy between -2 and 2 and not (cx = 0 and cy = 0) then
        continue;
      end if;

      dist_to_center := greatest(abs(cx), abs(cy));
      roll := random();

      if roll < 0.10 then
        -- Ferme barbare : niveau 1 (loin) à 10 (proche centre)
        barb_level := greatest(1, least(10, 11 - floor(dist_to_center / 5.0)::int));
        garrison := jsonb_build_object(
          'legionnaire', 5 + barb_level * 8,
          'pretorien',   2 + barb_level * 4,
          'equite_legati', greatest(0, barb_level - 3) * 2
        );
        insert into public.imperium_map (x, y, kind, data)
          values (cx, cy, 'barbarian', jsonb_build_object(
            'level', barb_level,
            'wood',  1000 * barb_level, 'clay', 1000 * barb_level,
            'iron',  1000 * barb_level, 'wheat', 500 * barb_level,
            'garrison', garrison
          )) on conflict (x, y) do nothing;
        spawned_barbarians := spawned_barbarians + 1;
      elsif roll < 0.16 then
        -- Oasis (~5.5%)
        oasis_type := (array['wood','clay','iron','wheat'])[1 + floor(random() * 4)::int];
        garrison := jsonb_build_object(
          'marauder', 20 + dist_to_center,
          'spearman', 10 + dist_to_center / 2
        );
        insert into public.imperium_map (x, y, kind, data)
          values (cx, cy, 'oasis', jsonb_build_object(
            'type', oasis_type,
            'bonus_wood',  case when oasis_type = 'wood'  then 0.25 else 0 end,
            'bonus_clay',  case when oasis_type = 'clay'  then 0.25 else 0 end,
            'bonus_iron',  case when oasis_type = 'iron'  then 0.25 else 0 end,
            'bonus_wheat', case when oasis_type = 'wheat' then 0.25 else 0 end,
            'garrison', garrison
          )) on conflict (x, y) do nothing;
        spawned_oasis := spawned_oasis + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'total_cells', total_cells,
    'barbarians', spawned_barbarians,
    'oasis', spawned_oasis
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 8. DISTRIBUTION QUOTIDIENNE DES QUÊTES
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_assign_daily_quests() returns int
language plpgsql security definer set search_path = public as $$
declare
  user_rec record;
  pool text[] := array[
    'daily_builder','daily_recruiter','daily_marcher','daily_pillager',
    'daily_trader','daily_spy','daily_researcher','daily_hoarder',
    'daily_warrior','daily_smith'
  ];
  targets jsonb := jsonb_build_object(
    'daily_builder',    3,
    'daily_recruiter',  20,
    'daily_marcher',    2,
    'daily_pillager',   1,
    'daily_trader',     2000,
    'daily_spy',        1,
    'daily_researcher', 1,
    'daily_hoarder',    5000,
    'daily_warrior',    50,
    'daily_smith',      1
  );
  picked text[];
  assigned int := 0;
  i int;
begin
  -- Purge anciennes quêtes expirées
  delete from public.imperium_quests where expires_at < now();

  for user_rec in
    select distinct user_id from public.imperium_villages
      where last_login > now() - interval '7 days'
  loop
    -- Skip si déjà 3 quêtes actives aujourd'hui
    if (
      select count(*) from public.imperium_quests
        where user_id = user_rec.user_id and expires_at > now()
    ) >= 3 then continue; end if;

    -- Pioche 3 quêtes random
    select array_agg(q) into picked from (
      select unnest(pool) q order by random() limit 3
    ) sub;

    for i in 1..3 loop
      insert into public.imperium_quests (user_id, quest_id, progress, target, expires_at)
        values (
          user_rec.user_id, picked[i], 0,
          (targets->>picked[i])::int,
          date_trunc('day', now()) + interval '1 day'
        ) on conflict do nothing;
    end loop;
    assigned := assigned + 3;
  end loop;
  return assigned;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 9. CRONS — résolution marches, leaderboard hebdo, quêtes journalières
-- ══════════════════════════════════════════════════════════════════════

-- (Si pas déjà fait à l'étape 0, dé-commente et exécute :)
-- select cron.schedule('imperium-resolve-marches', '*/5 * * * *',
--   $$select public.imperium_resolve_marches()$$);
-- select cron.schedule('imperium-leaderboard-weekly', '0 23 * * 0',
--   $$select public.imperium_finalize_weekly_leaderboard()$$);

-- Cron quêtes journalières (00:00 UTC) — idempotent
do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'imperium-quests-daily') then
    perform cron.schedule(
      'imperium-quests-daily', '0 0 * * *',
      'select public.imperium_assign_daily_quests()'
    );
  end if;
end $do$;

-- ══════════════════════════════════════════════════════════════════════
-- 10. APPELS INITIAUX (à exécuter une fois)
-- ══════════════════════════════════════════════════════════════════════

-- Génère les NPC sur la carte. ⚠ Peut prendre 10-30 secondes.
select public.imperium_generate_npcs();

-- Distribue les premières quêtes aux joueurs déjà inscrits
select public.imperium_assign_daily_quests();
