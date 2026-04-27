-- IMPERIUM FIX 4 — Étape 5 : profil public + robustesse + tutoriel.
-- Run this in Supabase SQL Editor (idempotent).

-- ══════════════════════════════════════════════════════════════════════
-- 1. PROFIL JOUEUR PUBLIC (lecture combinée profile + villages + alliance + stats)
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_get_player_profile(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  prof record;
  alliance_id_v uuid;
  alliance_name text; alliance_tag text; alliance_color text; alliance_role text;
  village_count int;
begin
  if p_user_id is null then return null; end if;

  select id, username, avatar_url into prof
    from public.profiles where id = p_user_id;
  if prof.id is null then return null; end if;

  select count(*) into village_count
    from public.imperium_villages where user_id = p_user_id;
  if village_count = 0 then return null; end if;

  select a.id, a.name, a.tag, a.color, am.role
    into alliance_id_v, alliance_name, alliance_tag, alliance_color, alliance_role
    from public.imperium_alliance_members am
    join public.imperium_alliances a on a.id = am.alliance_id
    where am.user_id = p_user_id
    limit 1;

  return jsonb_build_object(
    'user_id', prof.id,
    'username', prof.username,
    'avatar_url', prof.avatar_url,
    'power', public.imperium_compute_power(p_user_id),
    'villages', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'name', v.name, 'x', v.x, 'y', v.y,
        'faction', v.faction, 'is_secondary', v.is_secondary
      )), '[]'::jsonb)
      from public.imperium_villages v where v.user_id = p_user_id
    ),
    'alliance', case when alliance_id_v is not null then jsonb_build_object(
      'id', alliance_id_v, 'name', alliance_name,
      'tag', alliance_tag, 'color', alliance_color, 'role', alliance_role
    ) else null end,
    'stats', coalesce((
      select jsonb_build_object(
        'kills_total', s.kills_total,
        'losses_total', s.losses_total,
        'loot_total', s.loot_total,
        'power_max', s.power_max,
        'oasis_owned', (select count(*) from public.imperium_oasis_ownership oo
          join public.imperium_villages v on v.id = oo.village_id
          where v.user_id = p_user_id)
      )
      from public.imperium_stats s where s.user_id = p_user_id
    ), '{}'::jsonb),
    'achievements_count', (
      select count(*) from public.imperium_achievements where user_id = p_user_id
    ),
    'last_login', (
      select max(last_login) from public.imperium_villages where user_id = p_user_id
    )
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 2. SEND_MARCH avec rate limit (5 marches/min/village max)
-- + débit unités atomique (UPDATE conditionnel au lieu de check-then-update)
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_send_march(
  p_village_id uuid,
  p_to_x int, p_to_y int,
  p_kind text,
  p_units jsonb,
  p_target_building text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  v record;
  target record;
  defender_user uuid;
  k text; cnt int;
  ub jsonb;
  min_speed numeric := 1000;
  total_units int := 0;
  distance int;
  travel_seconds int;
  march_id uuid;
  recent_marches int;
  rows_updated int;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if p_kind not in ('raid','attack','support','spy','conquest','settle') then raise exception 'Type marche invalide.'; end if;
  perform public.imperium_tick(p_village_id);
  select * into v from public.imperium_villages where id = p_village_id for update;
  if v.user_id <> caller then raise exception 'Pas ton village.'; end if;

  -- ─── RATE LIMIT : max 5 marches / min / village
  select count(*) into recent_marches
    from public.imperium_marches
    where from_village_id = p_village_id
      and created_at > now() - interval '1 minute';
  if recent_marches >= 5 then
    raise exception 'Trop de marches récentes (max 5 par minute).';
  end if;

  -- Bouclier saute si marche hostile
  if p_kind in ('raid','attack','conquest') and v.shield_until is not null and v.shield_until > now() then
    update public.imperium_villages set shield_until = null where id = p_village_id;
  end if;

  -- ─── Débit unités atomique (UPDATE avec garde, pas check-then-act)
  for k, cnt in select * from jsonb_each_text(p_units) loop
    if cnt::int <= 0 then continue; end if;
    ub := public.imperium_unit_base(v.faction, k);
    if ub is null then raise exception 'Unité inconnue : %', k; end if;
    update public.imperium_units
      set count = count - cnt::int
      where village_id = p_village_id and unit_kind = k and count >= cnt::int;
    get diagnostics rows_updated = row_count;
    if rows_updated = 0 then
      raise exception 'Troupes insuffisantes : %', k;
    end if;
    if (ub->>'vit')::numeric < min_speed then min_speed := (ub->>'vit')::numeric; end if;
    total_units := total_units + cnt::int;
  end loop;

  if total_units = 0 then raise exception 'Aucune unité.'; end if;
  if min_speed >= 1000 then raise exception 'Erreur calcul vitesse.'; end if;

  distance := public.imperium_distance(v.x, v.y, p_to_x, p_to_y);
  if distance < 1 then raise exception 'Cible identique au village d''origine.'; end if;
  travel_seconds := ceil((distance / min_speed) * 3600)::int;

  select * into target from public.imperium_map where x = p_to_x and y = p_to_y;
  if target.kind is null then
    if p_kind <> 'settle' then raise exception 'Case cible vide.'; end if;
  end if;

  if p_kind in ('raid','attack','conquest','spy') and target.kind = 'player_village' then
    select user_id into defender_user from public.imperium_villages where id = target.village_id;
    if defender_user = caller then raise exception 'Tu ne peux pas t''attaquer toi-même.'; end if;
    if exists (select 1 from public.imperium_villages where id = target.village_id and shield_until > now()) then
      raise exception 'Cible sous bouclier.';
    end if;
    if p_kind in ('raid','attack','conquest') then
      if not exists (select 1 from public.imperium_villages where id = target.village_id and last_login < now() - interval '7 days') then
        if not public.imperium_in_range(caller, defender_user) then
          raise exception 'Cible hors range de puissance (±30%%).';
        end if;
      end if;
    end if;
    if p_kind = 'conquest' then
      if not exists (select 1 from public.imperium_villages where id = target.village_id and last_login < now() - interval '30 days') then
        raise exception 'Conquête possible uniquement sur village inactif >30j.';
      end if;
      if not exists (select 1 from public.imperium_buildings where village_id = p_village_id and kind = 'town_hall' and level >= 20) then
        raise exception 'Hôtel niveau 20 requis pour conquête.';
      end if;
    end if;
    if exists (
      select 1 from public.imperium_alliance_members am1
      join public.imperium_alliance_members am2 on am1.alliance_id = am2.alliance_id
      where am1.user_id = caller and am2.user_id = defender_user
    ) then
      raise exception 'Pas d''attaque entre membres de la même alliance.';
    end if;
  end if;

  if p_kind = 'spy' and target.kind not in ('player_village','barbarian','oasis') then
    raise exception 'Espionnage impossible sur cette case.';
  end if;

  insert into public.imperium_marches (from_village_id, to_x, to_y, kind, units, target_building, arrives_at)
    values (p_village_id, p_to_x, p_to_y, p_kind, p_units, p_target_building, now() + (travel_seconds * interval '1 second'))
    returning id into march_id;
  return march_id;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 3. INDEX additionnels après audit
-- ══════════════════════════════════════════════════════════════════════

-- Speedup imperium_get_incoming_attacks (filtre sur to_x, to_y avec state outbound)
create index if not exists imperium_marches_to_outbound_idx
  on public.imperium_marches(to_x, to_y, state)
  where state = 'outbound';

-- Speedup pour les recherches de profil (compute_power somme groupé par user)
create index if not exists imperium_units_village_idx
  on public.imperium_units(village_id);

-- Speedup pour les leaderboards (déjà partiellement indexé, mais avec score desc)
create index if not exists imperium_lb_week_cat_score_idx
  on public.imperium_leaderboard_weekly(week_start, category, score desc);

