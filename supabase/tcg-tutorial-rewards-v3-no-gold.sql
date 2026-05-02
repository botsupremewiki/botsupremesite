-- Patch idempotent v3 : retire la récompense OS du tutoriel.
--
-- Avant (v2) :
--   • Tutoriel (Pokemon, OnePiece, LoR) → +50 OS + +10 boosters
--
-- Après (cette migration) :
--   • Tutoriel (Pokemon, OnePiece, LoR) → +10 boosters uniquement
--
-- Rationale : décision design pour ne pas distribuer d'OS gratuit lié au
-- tutoriel — les boosters offerts suffisent comme onboarding.
--
-- Safe à re-exécuter : `create or replace function`.
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.complete_tcg_tutorial(p_game_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_first boolean := false;
  v_packs int := 0;
  v_current_packs jsonb;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  insert into public.tcg_tutorial_completion (user_id, game_id)
  values (v_user_id, p_game_id)
  on conflict (user_id, game_id) do nothing;
  -- Si l'INSERT a réellement créé une ligne (= 1ère fois), récompense.
  get diagnostics v_first = row_count;
  if v_first then
    -- 10 boosters gratuits pour les TCG supportés (pokemon, onepiece, lol).
    -- Plus de bonus OS — la récompense est uniquement les boosters.
    if p_game_id in ('pokemon', 'onepiece', 'lol') then
      v_packs := 10;
      select coalesce(tcg_free_packs, '{}'::jsonb)
      into v_current_packs
      from public.profiles
      where id = v_user_id;
      update public.profiles
      set tcg_free_packs = jsonb_set(
            v_current_packs,
            array[p_game_id],
            to_jsonb(
              coalesce((v_current_packs->>p_game_id)::int, 0) + v_packs
            ),
            true
          ),
          updated_at = now()
      where id = v_user_id;
    end if;
  end if;
  -- reward_gold reste dans le JSON pour compatibilité avec le client v1/v2,
  -- mais vaut toujours 0 maintenant.
  return jsonb_build_object(
    'first_time', v_first,
    'reward_gold', 0,
    'reward_packs', v_packs
  );
end;
$$;

grant execute on function public.complete_tcg_tutorial(text) to authenticated;
