-- IMPERIUM FIX 2 — Étape 2 : finir P5-P8 (espionnage, famine, respawn, achievements).
-- Run this in Supabase SQL Editor (idempotent, additif sur imperium-fix.sql).

-- ══════════════════════════════════════════════════════════════════════
-- 1. ESPIONNAGE avec détection (helper + refactor resolve_one_march)
-- ══════════════════════════════════════════════════════════════════════

-- Calcule le résultat d'espionnage : sum éclaireurs attaque vs sum éclaireurs défense.
-- Retourne { outcome: 'undetected'|'partial'|'failed', losses_pct, target_info }
create or replace function public.imperium_compute_spy_outcome(
  p_units_attacker jsonb,
  p_faction_attacker text,
  p_defender_units jsonb,
  p_faction_defender text
) returns jsonb language plpgsql immutable as $$
declare
  k text; cnt int;
  ub jsonb;
  att_scouts numeric := 0;
  def_scouts numeric := 0;
begin
  for k, cnt in select * from jsonb_each_text(p_units_attacker) loop
    if cnt::int = 0 then continue; end if;
    ub := public.imperium_unit_base(p_faction_attacker, k);
    if ub is null then continue; end if;
    if (ub->>'cat') = 'cav_scout' then
      att_scouts := att_scouts + cnt::int;
    end if;
  end loop;

  for k, cnt in select * from jsonb_each_text(p_defender_units) loop
    if cnt::int = 0 then continue; end if;
    ub := public.imperium_unit_base(p_faction_defender, k);
    if ub is null then continue; end if;
    if (ub->>'cat') = 'cav_scout' then
      def_scouts := def_scouts + cnt::int;
    end if;
  end loop;

  if att_scouts = 0 then
    return jsonb_build_object('outcome', 'failed', 'losses_pct', 1.0,
      'att_scouts', 0, 'def_scouts', def_scouts);
  end if;

  if att_scouts > def_scouts * 1.5 then
    return jsonb_build_object('outcome', 'undetected', 'losses_pct', 0,
      'att_scouts', att_scouts, 'def_scouts', def_scouts);
  elsif att_scouts > def_scouts then
    return jsonb_build_object('outcome', 'partial', 'losses_pct', 0.3,
      'att_scouts', att_scouts, 'def_scouts', def_scouts);
  else
    return jsonb_build_object('outcome', 'failed', 'losses_pct', 1.0,
      'att_scouts', att_scouts, 'def_scouts', def_scouts);
  end if;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 2. RESOLVE_ONE_MARCH refactor : espionnage propre
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_resolve_one_march(p_march_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m record;
  src record;
  target_map record;
  target_village record;
  combat jsonb;
  spy_outcome jsonb;
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
  spy_loss numeric;
  spy_data jsonb;
begin
  select * into m from public.imperium_marches where id = p_march_id for update;
  if m.id is null or m.state <> 'outbound' or m.arrives_at > now() then return null; end if;

  select * into src from public.imperium_villages where id = m.from_village_id;
  select * into target_map from public.imperium_map where x = m.to_x and y = m.to_y;

  -- ─── ESPIONNAGE avec détection
  if m.kind = 'spy' then
    -- Charge composition défenseur (joueur uniquement, pour récupérer scouts adverses)
    if target_map.kind = 'player_village' then
      select * into target_village from public.imperium_villages where id = target_map.village_id;
      defender_user := target_village.user_id;
      defender_faction := target_village.faction;
      select coalesce(jsonb_object_agg(unit_kind, count), '{}'::jsonb)
        into defender_units
        from public.imperium_units where village_id = target_village.id and count > 0;
    elsif target_map.kind in ('barbarian','oasis') then
      defender_faction := case when target_map.kind = 'oasis' then 'horde' else 'legion' end;
      defender_units := coalesce(target_map.data->'garrison', '{}'::jsonb);
    else
      defender_units := '{}'::jsonb;
      defender_faction := 'legion';
    end if;

    spy_outcome := public.imperium_compute_spy_outcome(
      m.units, src.faction, defender_units, defender_faction
    );

    -- Calcule survivants éclaireurs attaquant
    spy_loss := (spy_outcome->>'losses_pct')::numeric;
    for k, cnt in select * from jsonb_each_text(m.units) loop
      if cnt::int = 0 then continue; end if;
      remaining := floor(cnt::int * (1.0 - spy_loss))::int;
      if remaining > 0 then
        surviving_units := jsonb_set(surviving_units, array[k], to_jsonb(remaining));
      end if;
    end loop;

    -- Si undetected ou partial, attache info récolté
    if (spy_outcome->>'outcome') in ('undetected','partial') and target_map.kind = 'player_village' then
      spy_data := jsonb_build_object(
        'wood', target_village.wood, 'clay', target_village.clay,
        'iron', target_village.iron, 'wheat', target_village.wheat,
        'units', case when (spy_outcome->>'outcome') = 'undetected' then defender_units else null end
      );
    elsif (spy_outcome->>'outcome') in ('undetected','partial') and target_map.kind in ('barbarian','oasis') then
      spy_data := jsonb_build_object(
        'wood', coalesce((target_map.data->>'wood')::numeric, 0),
        'clay', coalesce((target_map.data->>'clay')::numeric, 0),
        'iron', coalesce((target_map.data->>'iron')::numeric, 0),
        'wheat', coalesce((target_map.data->>'wheat')::numeric, 0),
        'units', defender_units
      );
    else
      spy_data := jsonb_build_object('detected', true);
    end if;

    -- Rapport pour attaquant + (si détecté) défenseur
    insert into public.imperium_reports (attacker_user_id, defender_user_id, march_id, kind, data)
    values (
      src.user_id, defender_user, p_march_id, 'spy',
      jsonb_build_object(
        'target_x', m.to_x, 'target_y', m.to_y, 'target_kind', target_map.kind,
        'spy', spy_outcome, 'info', spy_data, 'survivors', surviving_units
      )
    );

    -- Lance retour
    return_seconds := greatest(60, extract(epoch from m.arrives_at - m.created_at)::int);
    update public.imperium_marches set state = 'returning',
      returns_at = now() + (return_seconds * interval '1 second'),
      units = surviving_units
      where id = p_march_id;

    return jsonb_build_object('ok', true, 'kind', 'spy', 'spy', spy_outcome);
  end if;

  -- ─── COMBAT NORMAL (raid/attack/support/conquest)
  if target_map.kind = 'player_village' then
    select * into target_village from public.imperium_villages where id = target_map.village_id for update;
    defender_faction := target_village.faction;
    defender_user := target_village.user_id;
    select coalesce(jsonb_object_agg(unit_kind, count), '{}'::jsonb)
      into defender_units
      from public.imperium_units where village_id = target_village.id and count > 0;
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

  select coalesce(jsonb_object_agg(unit_kind,
      jsonb_build_object('attack', attack_level * 0.01, 'defense', defense_level * 0.01)
    ), '{}'::jsonb)
    into attacker_forge
    from public.imperium_forge where village_id = m.from_village_id;

  combat := public.imperium_combat_resolve(
    m.units, src.faction, defender_units, defender_faction, wall_level,
    attacker_forge, defender_forge
  );

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

  for k, cnt in select * from jsonb_each_text(defender_units) loop
    total_kills := total_kills + (cnt::int * (combat->>'def_loss_pct')::numeric)::int;
  end loop;

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
      update public.imperium_map
        set data = data || jsonb_build_object('wood', 0, 'clay', 0, 'iron', 0, 'wheat', 0, 'reset_at', now() + interval '24 hours')
        where x = m.to_x and y = m.to_y;
    end if;
    total_loot := loot_w + loot_c + loot_i + loot_wh;
  end if;

  if (combat->>'def_loss_pct')::numeric >= 0.99
     and m.kind = 'attack' and target_map.kind = 'player_village' then
    if rams_alive >= 4 and wall_level > 0 then
      update public.imperium_buildings
        set level = greatest(0, level - floor(rams_alive / 4)::int)
        where village_id = target_village.id and kind = 'wall';
    end if;
    if catapults_alive > 0 and m.target_building is not null then
      if random() < (1.0 - power(0.8, catapults_alive)) then
        update public.imperium_buildings
          set level = greatest(0, level - 1)
          where village_id = target_village.id and kind = m.target_building;
      end if;
    end if;
  end if;

  if m.kind = 'conquest'
     and (combat->>'def_loss_pct')::numeric >= 0.99
     and target_map.kind = 'player_village'
     and (surviving_units ? 'senator' or surviving_units ? 'khan' or surviving_units ? 'grand_master')
  then
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

  if target_map.kind = 'player_village' and (combat->>'def_loss_pct')::numeric > 0 then
    for k, cnt in select * from jsonb_each_text(defender_units) loop
      remaining := floor(cnt::int * (1.0 - (combat->>'def_loss_pct')::numeric))::int;
      update public.imperium_units set count = remaining
        where village_id = target_village.id and unit_kind = k;
    end loop;
    if total_kills > 0 then
      update public.imperium_villages
        set shield_until = now() + interval '12 hours' where id = target_village.id;
    end if;
  elsif target_map.kind in ('barbarian','oasis') and (combat->>'def_loss_pct')::numeric >= 0.99 then
    update public.imperium_map set data = data || jsonb_build_object('garrison', '{}'::jsonb)
      where x = m.to_x and y = m.to_y;
  end if;

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

  if m.kind in ('raid','attack')
     and target_map.kind = 'oasis'
     and (combat->>'def_loss_pct')::numeric >= 0.99
     and public.imperium_distance(src.x, src.y, m.to_x, m.to_y) <= 1
  then
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
-- 3. TICK refactor : famine bétonnée (gère stock blé + soutiens)
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
  starvation_seconds numeric := 0; -- temps depuis lequel on est à wheat=0 avec drain négatif
  new_wheat numeric;
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

  -- Drain blé : unités stationnées + soutiens qu'on héberge
  select coalesce(sum(u.count * coalesce((public.imperium_unit_base(v.faction, u.unit_kind)->>'wheat_h')::numeric, 0)), 0)
    into wheat_drain
    from public.imperium_units u where u.village_id = p_village_id;
  -- Soutiens hébergés (drain compté ici, pas chez l'envoyeur)
  declare
    support_drain numeric := 0;
  begin
    select coalesce(sum(
        (e.value::int) * coalesce((public.imperium_unit_base(s_src.faction, e.key)->>'wheat_h')::numeric, 0)
      ), 0)
      into support_drain
      from public.imperium_supports s, lateral jsonb_each_text(s.units) e
      join public.imperium_villages s_src on s_src.id = s.from_village_id
      where s.host_village_id = p_village_id and s.recalled_at is null;
    wheat_drain := wheat_drain + support_drain;
  end;

  net_wheat := wheat_rate - wheat_drain;

  -- Calcul du nouveau stock blé en intégrant la chute à 0 si net négatif
  new_wheat := v.wheat + net_wheat * elapsed_sec / 3600.0;

  -- Si on tomberait sous 0, on calcule depuis combien de temps on est à 0
  if new_wheat < 0 then
    -- v.wheat + net_wheat * t / 3600 = 0 → t = -v.wheat * 3600 / net_wheat
    -- temps en secondes pour atteindre 0
    starvation_seconds := elapsed_sec - (- v.wheat * 3600.0 / net_wheat);
    new_wheat := 0;
  else
    starvation_seconds := 0;
  end if;

  update public.imperium_villages
    set wood  = least(wood  + wood_rate  * elapsed_sec / 3600.0, wood_cap),
        clay  = least(clay  + clay_rate  * elapsed_sec / 3600.0, wood_cap),
        iron  = least(iron  + iron_rate  * elapsed_sec / 3600.0, wood_cap),
        wheat = least(new_wheat, wheat_cap),
        last_tick = now()
    where id = p_village_id;

  -- Famine : 1 unité tuée toutes les 30 min DEPUIS la chute à 0
  if starvation_seconds > 0 then
    declare
      kills int := floor(starvation_seconds / 1800.0)::int;
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
        -- Tracking ach_elite_100 (cumul des unités d'élite recrutées)
        declare
          cat text := coalesce(public.imperium_unit_base(v.faction, rec.unit_kind)->>'cat', '');
        begin
          if cat in ('cav','siege','special') then
            insert into public.imperium_stats (user_id, units_recruited_elite)
              values (v.user_id, finished)
              on conflict (user_id) do update set
                units_recruited_elite = public.imperium_stats.units_recruited_elite + finished;
            if (select units_recruited_elite from public.imperium_stats where user_id = v.user_id) >= 100 then
              perform public.imperium_grant_achievement(v.user_id, 'ach_elite_100');
            end if;
          end if;
        end;
        update public.imperium_units
          set count = count + finished,
              recruiting_count = recruiting_count - finished,
              recruiting_finishes_at = case when recruiting_count - finished <= 0 then null else recruiting_finishes_at end
          where village_id = p_village_id and unit_kind = rec.unit_kind;
      end if;
    end;
  end loop;

  if elapsed_sec >= 60 then
    produced := (wood_rate + clay_rate + iron_rate + greatest(0, wheat_rate)) * elapsed_sec / 3600.0;
    perform public.imperium_lb_add(v.user_id, 'economy', floor(produced)::bigint);
  end if;

  declare
    cur_power bigint;
  begin
    cur_power := public.imperium_compute_power(v.user_id);
    insert into public.imperium_stats (user_id, power_max) values (v.user_id, cur_power)
      on conflict (user_id) do update set
        power_max = greatest(public.imperium_stats.power_max, cur_power),
        updated_at = now();
    if cur_power >= 100000 then perform public.imperium_grant_achievement(v.user_id, 'ach_power_100k'); end if;
    if cur_power >= 500000 then perform public.imperium_grant_achievement(v.user_id, 'ach_power_500k'); end if;
  end;

  return jsonb_build_object('ok', true, 'elapsed_sec', elapsed_sec,
    'starvation_seconds', starvation_seconds);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 4. RESPAWN AUTOMATIQUE DES FERMES BARBARES (24h après destruction)
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_respawn_barbarians() returns int
language plpgsql security definer set search_path = public as $$
declare
  rec record;
  barb_level int;
  dist_to_center int;
  garrison jsonb;
  respawned int := 0;
begin
  for rec in
    select * from public.imperium_map
    where kind = 'barbarian'
      and (data->>'reset_at')::timestamptz <= now()
  loop
    dist_to_center := greatest(abs(rec.x), abs(rec.y));
    barb_level := greatest(1, least(10, 11 - floor(dist_to_center / 5.0)::int));
    garrison := jsonb_build_object(
      'legionnaire', 5 + barb_level * 8,
      'pretorien',   2 + barb_level * 4,
      'equite_legati', greatest(0, barb_level - 3) * 2
    );
    update public.imperium_map
      set data = jsonb_build_object(
        'level', barb_level,
        'wood',  1000 * barb_level, 'clay', 1000 * barb_level,
        'iron',  1000 * barb_level, 'wheat', 500 * barb_level,
        'garrison', garrison
      )
      where x = rec.x and y = rec.y;
    respawned := respawned + 1;
  end loop;
  return respawned;
end;
$$;

-- Cron : respawn barbares toutes les 5 min (en même temps que resolve marches)
do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'imperium-respawn-barbarians') then
    perform cron.schedule(
      'imperium-respawn-barbarians', '*/5 * * * *',
      'select public.imperium_respawn_barbarians()'
    );
  end if;
end $do$;

-- ══════════════════════════════════════════════════════════════════════
-- 5. HOOKS achievements diplomatie + classement
-- ══════════════════════════════════════════════════════════════════════

-- Trigger : ach_nap_first / ach_war_first sur création de relation
create or replace function public.imperium_check_diplomacy_achievements()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid_a uuid; uid_b uuid;
begin
  -- Récupère les chefs des 2 alliances
  select chief_id into uid_a from public.imperium_alliances where id = new.alliance_a_id;
  select chief_id into uid_b from public.imperium_alliances where id = new.alliance_b_id;
  if new.kind = 'nap' then
    perform public.imperium_grant_achievement(uid_a, 'ach_nap_first');
    perform public.imperium_grant_achievement(uid_b, 'ach_nap_first');
  elsif new.kind = 'war' then
    perform public.imperium_grant_achievement(uid_a, 'ach_war_first');
    perform public.imperium_grant_achievement(uid_b, 'ach_war_first');
  end if;
  return new;
end;
$$;

drop trigger if exists imperium_diplomacy_trigger on public.imperium_alliance_relations;
create trigger imperium_diplomacy_trigger
after insert on public.imperium_alliance_relations
for each row execute function public.imperium_check_diplomacy_achievements();

-- finalize_weekly_leaderboard refactor : ajoute hooks ach_top10_* et ach_crown_weekly
create or replace function public.imperium_finalize_weekly_leaderboard()
returns int language plpgsql security definer set search_path = public as $$
declare
  rec record;
  reward int;
  rank int;
  total int := 0;
  cat text;
  current_week date;
  ach_top text;
begin
  current_week := date_trunc('week', now())::date - interval '7 days';
  for cat in select unnest(array['attack','defense','economy']) loop
    rank := 1;
    for rec in select user_id, score from public.imperium_leaderboard_weekly
               where week_start = current_week and category = cat
               order by score desc limit 10 loop
      reward := case rank
        when 1 then 2000 when 2 then 1500 when 3 then 1000 when 4 then 700
        when 5 then 500  when 6 then 400  when 7 then 300  when 8 then 200
        when 9 then 150  when 10 then 100 else 0
      end;
      if reward > 0 then
        update public.profiles set gold = gold + reward, updated_at = now() where id = rec.user_id;
        total := total + reward;
      end if;
      -- Achievements top 10 par catégorie
      ach_top := 'ach_top10_' || case cat
        when 'attack' then 'atk'
        when 'defense' then 'def'
        when 'economy' then 'eco'
      end;
      perform public.imperium_grant_achievement(rec.user_id, ach_top);
      -- Rang 1 = couronne hebdo
      if rank = 1 then
        perform public.imperium_grant_achievement(rec.user_id, 'ach_crown_weekly');
      end if;
      rank := rank + 1;
    end loop;
  end loop;
  return total;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 6. INIT IMPERIUM_STATS automatique sur création de village
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_init_stats_on_village()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.imperium_stats (user_id) values (new.user_id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists imperium_init_stats_trigger on public.imperium_villages;
create trigger imperium_init_stats_trigger
after insert on public.imperium_villages
for each row execute function public.imperium_init_stats_on_village();

-- Backfill pour les villages déjà créés
insert into public.imperium_stats (user_id)
select distinct user_id from public.imperium_villages
on conflict (user_id) do nothing;
