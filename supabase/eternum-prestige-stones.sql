-- Eternum F2 : Système de Pierres de Prestige (10 paliers, bitmask, croissants)
--
-- Concept :
-- - 10 paliers : level 100, 200, 300, ..., 1000
-- - Une pierre par palier, jamais ré-acquisable (collection unique)
-- - Bonus croissants : pierre 100 = +5% XP / pierre 200 = +6% / ... / pierre 1000 = +14%
-- - Total possible : 5+6+7+8+9+10+11+12+13+14 = +95% XP perpétuel via 10 pierres
-- - Pas de condition pour prestige : le joueur peut prestige quand il veut
-- - Au prestige : tu prends toutes les pierres des paliers atteints que tu n'as pas
-- - Reset au prestige : level, xp, idle_stage, evolution_stage,
--   progression donjons/tour. Garde : familiers, items, OS, pass, achievements.
--
-- Idempotent.

-- ──────────────────────────────────────────────────────────────────────
-- 1) Colonne prestige_stones (bitmask 10 bits)
-- ──────────────────────────────────────────────────────────────────────
alter table public.eternum_heroes
  add column if not exists prestige_stones int not null default 0;

-- ──────────────────────────────────────────────────────────────────────
-- 2) Helper : calcule le multiplicateur XP selon les pierres possédées
-- Pierre 100 = +5%, 200 = +6%, ..., 1000 = +14%.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_xp_multiplier(p_user_id uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  stones int;
  mult numeric := 1.0;
  -- Bonuses croissants en % par palier
  bonuses int[] := array[5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  i int;
begin
  select prestige_stones into stones from public.eternum_heroes
  where user_id = p_user_id;
  if stones is null then return 1.0; end if;
  for i in 0..9 loop
    if (stones >> i) & 1 = 1 then
      mult := mult + bonuses[i + 1] * 0.01;
    end if;
  end loop;
  return mult;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 3) Trigger eternum_check_level_up — applique aussi le multiplier XP
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_check_level_up()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  delta bigint;
  mult numeric;
  needed bigint;
  new_level int := new.level;
  new_evol int := new.evolution_stage;
begin
  -- Étape 1 : appliquer le multiplicateur XP via les pierres prestige.
  -- Ne s'applique que sur les UPDATE qui ajoutent de l'XP (pas sur les
  -- update internes de level-up qui consomment de l'XP).
  if new.xp > old.xp then
    delta := new.xp - old.xp;
    mult := public.eternum_xp_multiplier(old.user_id);
    new.xp := old.xp + round(delta * mult);
  end if;

  -- Étape 2 : level-up si XP suffisant. Boucle pour multiples niveaux.
  loop
    needed := round(100 * power(new_level, 1.2));
    exit when new.xp < needed or new_level >= 1000;
    new.xp := new.xp - needed;
    new_level := new_level + 1;
  end loop;

  -- Étape 3 : évolutions automatiques (paliers 200/400/600/800).
  if new_level >= 200 and new_evol < 1 then new_evol := 1; end if;
  if new_level >= 400 and new_evol < 2 then new_evol := 2; end if;
  if new_level >= 600 and new_evol < 3 then new_evol := 3; end if;
  if new_level >= 800 and new_evol < 4 then new_evol := 4; end if;

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
-- 4) RPC eternum_prestige — version refondue
--
-- Plus de condition de level / évolution / classe à choisir.
-- Tu peux appeler n'importe quand. La logique attribue les pierres
-- des paliers atteints que tu n'avais pas, puis reset.
-- ──────────────────────────────────────────────────────────────────────
drop function if exists public.eternum_prestige(text, text, text);
drop function if exists public.eternum_prestige();

create function public.eternum_prestige() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cur_level int;
  cur_stones int;
  new_stones int;
  stones_gained int := 0;
  i int;
  palier int;
  multiplier numeric;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  select level, prestige_stones into cur_level, cur_stones
  from public.eternum_heroes where user_id = caller for update;
  if cur_level is null then raise exception 'Crée un héros d''abord.'; end if;

  -- Calcule les nouvelles pierres acquises (10 paliers : 100, 200, ..., 1000)
  new_stones := cur_stones;
  for i in 0..9 loop
    palier := (i + 1) * 100;
    if cur_level >= palier and ((new_stones >> i) & 1) = 0 then
      new_stones := new_stones | (1 << i);
      stones_gained := stones_gained + 1;
    end if;
  end loop;

  -- Reset hero (level, xp, idle stage, évolution, count++)
  update public.eternum_heroes set
    level = 1,
    xp = 0,
    idle_stage = 1,
    idle_updated_at = now(),
    evolution_stage = 0,
    prestige_count = prestige_count + 1,
    prestige_stones = new_stones,
    updated_at = now()
  where user_id = caller;

  -- Reset progressions contenus (sauf achievements/bestiaire/items/familiers/OS/pass)
  update public.eternum_dungeon_progress
    set best_floor = 0, last_run_at = now()
    where user_id = caller;
  update public.eternum_tower_progress
    set best_floor = 0, runs_today = 0, runs_date = current_date, updated_at = now()
    where user_id = caller;
  delete from public.eternum_world_boss_attempts where user_id = caller;

  -- Dream / Challenges si tables existent : à reset proprement.
  -- (Si la table n'existe pas, ces commandes seront ignorées car wrappées en exception.)
  begin
    delete from public.eternum_dream_progress where user_id = caller;
  exception when others then null;
  end;
  begin
    delete from public.eternum_weekly_challenge_done where user_id = caller;
  exception when others then null;
  end;

  -- Calcule le multiplicateur final
  multiplier := public.eternum_xp_multiplier(caller);

  return jsonb_build_object(
    'ok', true,
    'stones_gained', stones_gained,
    'total_stones_count', (
      select count(*) from generate_series(0, 9) g
      where ((new_stones >> g) & 1) = 1
    ),
    'stones_bitmask', new_stones,
    'multiplier', multiplier,
    'multiplier_pct', round((multiplier - 1.0) * 100)
  );
end;
$$;
