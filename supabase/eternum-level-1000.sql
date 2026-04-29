-- Eternum Commit F1 : level max 100 → 1000 + formule XP croissante 100 × N^1.2
-- Idempotent. Niveau requis pour atteindre 1000 : extrême (prestiges nécessaires).

-- ──────────────────────────────────────────────────────────────────────
-- 1) Update constraints level <= 1000 (héros + familiers)
-- Drop puis re-create car ALTER CONSTRAINT n'existe pas en pg pour CHECK.
-- ──────────────────────────────────────────────────────────────────────

alter table public.eternum_heroes
  drop constraint if exists eternum_heroes_level_check;
alter table public.eternum_heroes
  add constraint eternum_heroes_level_check check (level >= 1 and level <= 1000);

alter table public.eternum_familiers_owned
  drop constraint if exists eternum_familiers_owned_level_check;
alter table public.eternum_familiers_owned
  add constraint eternum_familiers_owned_level_check check (level >= 1 and level <= 1000);

-- ──────────────────────────────────────────────────────────────────────
-- 2) Trigger eternum_check_level_up — formule XP croissante 100 × N^1.2
-- Cap à 1000 (au lieu de 100).
-- Évolutions ajustées : on garde 4 paliers, mais espacés sur 1000 niveaux.
-- 200 / 400 / 600 / 800 (au lieu de 20/40/60/80).
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
    needed := round(100 * power(new_level, 1.2));
    exit when new.xp < needed or new_level >= 1000;
    new.xp := new.xp - needed;
    new_level := new_level + 1;
  end loop;

  -- Évolutions automatiques (paliers 200/400/600/800 sur 1000 niveaux).
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
