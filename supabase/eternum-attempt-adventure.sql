-- Eternum aventure : nouvelle RPC pour le combat auto-continu.
-- Remplace eternum_advance_stage (suppression du bouton manuel).
-- Server-authoritative : check power vs composition du stage actuel.
-- Si won → stage += 1 (cap 1000). Si lost → reste.
-- Idempotent.

drop function if exists public.eternum_attempt_adventure(uuid);

create or replace function public.eternum_attempt_adventure(
  p_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  current_stage int;
  level_enemy int;
  -- Composition par phase (cf. shared/eternum-adventure.ts)
  commons int := 0;
  rares int := 0;
  epics int := 0;
  legends int := 0;
  prismatics int := 0;
  -- Multiplicateurs power par rareté ennemie
  -- (calibré pour matcher eternum_player_power : hero_lv*100 + fams*level*50 + items_bonus)
  pwr_per_common bigint := 40;
  pwr_per_rare bigint := 70;
  pwr_per_epic bigint := 130;
  pwr_per_legendary bigint := 240;
  pwr_per_prismatic bigint := 450;
  required_power bigint;
  player_power int;
begin
  if caller is null or caller <> p_user_id then
    raise exception 'Accès refusé.';
  end if;

  select idle_stage into current_stage
  from public.eternum_heroes
  where user_id = p_user_id
  for update;

  if current_stage is null then
    raise exception 'Aucun héros — crée-en un d''abord.';
  end if;

  level_enemy := least(current_stage, 100);

  -- Détermine la composition selon le stage (mêmes bornes que TS)
  if current_stage >= 1000 then
    prismatics := 5;
  elsif current_stage <= 50 then
    -- Phase A : palier 10
    commons := least(5, ((current_stage - 1) / 10) + 1);
  elsif current_stage <= 150 then
    -- Phase B : palier 20
    rares := least(5, ((current_stage - 51) / 20) + 1);
    commons := 5 - rares;
  elsif current_stage <= 300 then
    -- Phase C : palier 30
    epics := least(5, ((current_stage - 151) / 30) + 1);
    rares := 5 - epics;
  elsif current_stage <= 550 then
    -- Phase D : palier 50
    legends := least(5, ((current_stage - 301) / 50) + 1);
    epics := 5 - legends;
  else
    -- Phase E : palier 90
    prismatics := least(5, ((current_stage - 551) / 90) + 1);
    legends := 5 - prismatics;
  end if;

  -- Power requis = niveau ennemi × somme(nombre × multi rareté)
  required_power := level_enemy * (
    commons * pwr_per_common +
    rares * pwr_per_rare +
    epics * pwr_per_epic +
    legends * pwr_per_legendary +
    prismatics * pwr_per_prismatic
  );

  player_power := public.eternum_player_power(caller);

  -- Défaite : retourne sans avancer
  if player_power < required_power then
    return jsonb_build_object(
      'won', false,
      'capped', false,
      'player_power', player_power,
      'required_power', required_power,
      'stage', current_stage
    );
  end if;

  -- Cap au stage 1000 : on bat mais on n'avance pas
  if current_stage >= 1000 then
    return jsonb_build_object(
      'won', true,
      'capped', true,
      'player_power', player_power,
      'required_power', required_power,
      'stage', 1000
    );
  end if;

  -- Avance d'un stage. On NE reset PAS idle_updated_at — la récolte passive
  -- continue indépendamment du combat.
  update public.eternum_heroes
  set idle_stage = idle_stage + 1,
      updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object(
    'won', true,
    'capped', false,
    'player_power', player_power,
    'required_power', required_power,
    'stage', current_stage + 1
  );
end;
$$;
