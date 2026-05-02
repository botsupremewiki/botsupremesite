-- TCG Pity System : garantit une carte ★ ou + tous les 10 packs Pokemon
-- ouverts SANS rareté ★+. Évite les "streaks" de poisse trop longues.
--
-- Fonctionnement :
--   • Compteur stocké dans profiles.tcg_pity_state[gameId] (int)
--   • À chaque pack ouvert :
--     - Si une carte ★/★★/★★★/👑 est tirée → compteur reset à 0
--     - Sinon → compteur +1
--   • Quand compteur >= 10 → le PROCHAIN pack force une carte ★+ au
--     dernier slot (= reset implicite après tirage)
--
-- Pour Pokemon uniquement en v1. Facilement extensible aux autres TCG
-- en passant un autre game_id.
--
-- Run après supabase/profiles-complete-idempotent.sql.
-- Safe à re-exécuter.
-- ──────────────────────────────────────────────────────────────────────

-- 1) Colonne dédiée pour le compteur de pity par jeu.
alter table public.profiles
  add column if not exists tcg_pity_state jsonb not null default '{}'::jsonb;

-- 2) RPC : retourne le compteur actuel pour un game.
--    Retour : int (nombre de packs ouverts sans star+ depuis le dernier reset).
create or replace function public.tcg_get_pity_counter(p_game_id text)
returns int
language sql
security definer
set search_path = public
as $$
  select coalesce((tcg_pity_state->>p_game_id)::int, 0)
  from public.profiles
  where id = auth.uid();
$$;

-- 3) RPC : update le compteur après ouverture d'un pack.
--    p_had_rare = true si le pack contenait au moins une ★/★★/★★★/👑
--    (= reset compteur). Sinon → increment.
--    Retourne le nouveau compteur (post-update).
create or replace function public.tcg_update_pity_counter(
  p_user_id uuid,
  p_game_id text,
  p_had_rare boolean
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current jsonb;
  v_old int;
  v_new int;
begin
  select coalesce(tcg_pity_state, '{}'::jsonb) into v_current
  from public.profiles
  where id = p_user_id
  for update;
  v_old := coalesce((v_current->>p_game_id)::int, 0);
  if p_had_rare then
    v_new := 0;
  else
    v_new := v_old + 1;
  end if;
  update public.profiles
  set tcg_pity_state = jsonb_set(
        v_current,
        array[p_game_id],
        to_jsonb(v_new),
        true
      ),
      updated_at = now()
  where id = p_user_id;
  return v_new;
end;
$$;

grant execute on function public.tcg_get_pity_counter(text) to authenticated;
grant execute on function public.tcg_update_pity_counter(uuid, text, boolean) to authenticated;
