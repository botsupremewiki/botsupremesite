-- TCG : système de cosmétiques (titres + bordures d'avatar).
--
-- Concept simple :
--  • Le user peut choisir un "titre" (text affiché sous son pseudo) parmi
--    ceux qu'il a débloqués via achievements / placements en saison.
--  • Idem pour la bordure d'avatar (8 couleurs, certaines bonus par tier).
--  • Les déblocages sont calculés à la volée côté serveur (lecture des
--    achievements + season_results existants), pas de table dédiée.
--
-- Run après supabase/tcg-achievements.sql et tcg-seasons.sql.
-- ──────────────────────────────────────────────────────────────────────

-- Ajout des champs sur profiles (en supplément de gold, tcg_elo, etc.).
alter table public.profiles
  add column if not exists cosmetic_title text;
alter table public.profiles
  add column if not exists cosmetic_avatar_border text;

-- ─── RPC : titres + bordures débloquées pour le user courant ──────────
-- Le résultat liste les options possibles avec un flag `unlocked`.
create or replace function public.get_my_cosmetics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_unlocked_ach text[];
  v_best_tier text;
  v_titles jsonb := '[]'::jsonb;
  v_borders jsonb := '[]'::jsonb;
  v_current_title text;
  v_current_border text;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;

  -- Achievements TCG débloqués (toutes saisons confondues, tous jeux).
  select array_agg(distinct achievement_id)
    into v_unlocked_ach
  from public.tcg_achievements_unlocked
  where user_id = v_user_id;

  -- Meilleur tier obtenu en saison (tous jeux).
  select max(case tier
    when 'master' then 6
    when 'diamond' then 5
    when 'platinum' then 4
    when 'gold' then 3
    when 'silver' then 2
    else 1
  end) into v_best_tier
  from public.tcg_season_results
  where user_id = v_user_id;
  -- v_best_tier est un int représentant le tier max ; on le traduit.

  select cosmetic_title, cosmetic_avatar_border
    into v_current_title, v_current_border
  from public.profiles where id = v_user_id;

  -- Catalogue des titres disponibles. id, label, condition.
  v_titles := jsonb_build_array(
    jsonb_build_object('id', 'novice', 'label', 'Novice', 'unlocked', true),
    jsonb_build_object('id', 'duelist', 'label', 'Duelliste',
      'unlocked', 'first_win' = any(coalesce(v_unlocked_ach, '{}'::text[]))),
    jsonb_build_object('id', 'master', 'label', 'Maître',
      'unlocked', 'fifty_wins' = any(coalesce(v_unlocked_ach, '{}'::text[]))),
    jsonb_build_object('id', 'champion', 'label', 'Champion',
      'unlocked', coalesce(v_best_tier, 0) >= 5),
    jsonb_build_object('id', 'legend', 'label', 'Légende',
      'unlocked', coalesce(v_best_tier, 0) >= 6),
    jsonb_build_object('id', 'collector', 'label', 'Collectionneur',
      'unlocked', 'collection_50' = any(coalesce(v_unlocked_ach, '{}'::text[])))
  );

  -- Catalogue des bordures (8 couleurs ; les 4 dernières sont premium).
  v_borders := jsonb_build_array(
    jsonb_build_object('id', 'classic', 'label', 'Classique', 'color', '#3f3f46', 'unlocked', true),
    jsonb_build_object('id', 'azure', 'label', 'Azur', 'color', '#3b82f6', 'unlocked', true),
    jsonb_build_object('id', 'crimson', 'label', 'Cramoisi', 'color', '#ef4444', 'unlocked', true),
    jsonb_build_object('id', 'emerald', 'label', 'Émeraude', 'color', '#10b981', 'unlocked', true),
    jsonb_build_object('id', 'violet', 'label', 'Violet',  'color', '#8b5cf6',
      'unlocked', 'first_win' = any(coalesce(v_unlocked_ach, '{}'::text[]))),
    jsonb_build_object('id', 'gold',   'label', 'Or',      'color', '#fbbf24',
      'unlocked', coalesce(v_best_tier, 0) >= 3),
    jsonb_build_object('id', 'platinum','label','Platine', 'color', '#e5e7eb',
      'unlocked', coalesce(v_best_tier, 0) >= 4),
    jsonb_build_object('id', 'rainbow','label', 'Arc-en-ciel', 'color', 'rainbow',
      'unlocked', coalesce(v_best_tier, 0) >= 6)
  );

  return jsonb_build_object(
    'titles', v_titles,
    'borders', v_borders,
    'current_title', v_current_title,
    'current_border', v_current_border
  );
end;
$$;

-- ─── RPC : applique le choix du user ──────────────────────────────────
create or replace function public.set_my_cosmetics(
  p_title text default null,
  p_border text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  -- Note : pas de revalidation des unlocks ici. Un user qui passerait par
  -- le RPC direct pourrait set un title qu'il n'a pas. Comme c'est juste
  -- cosmétique et que la liste UI est déjà filtrée, c'est acceptable
  -- pour la v1. À durcir si besoin en revalidant côté serveur.
  update public.profiles
  set cosmetic_title = coalesce(p_title, cosmetic_title),
      cosmetic_avatar_border = coalesce(p_border, cosmetic_avatar_border),
      updated_at = now()
  where id = v_user_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.get_my_cosmetics() to authenticated;
grant execute on function public.set_my_cosmetics(text, text) to authenticated;
