-- Patch idempotent : étend la récompense du tutoriel TCG.
-- Avant : +50 OS uniquement.
-- Après : +50 OS + 10 boosters gratuits (uniquement Pokemon TCG, pour
-- aider le nouveau joueur à constituer rapidement une collection).
--
-- Pour les autres jeux (LoR, OnePiece) on garde uniquement les +50 OS
-- — leurs free packs viennent d'autres canaux (signup OnePiece, battle
-- pass…).
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
    -- 50 OS pour tous les jeux.
    update public.profiles
    set gold = coalesce(gold, 0) + 50,
        updated_at = now()
    where id = v_user_id;
    -- 10 boosters Pokemon en plus (uniquement game_id = pokemon).
    if p_game_id = 'pokemon' then
      v_packs := 10;
      -- tcg_free_packs est un jsonb { game_id: int }. On incrémente la
      -- clé pour pokemon en partant de la valeur courante (0 si absente).
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
  return jsonb_build_object(
    'first_time', v_first,
    'reward_gold', case when v_first then 50 else 0 end,
    'reward_packs', v_packs
  );
end;
$$;

grant execute on function public.complete_tcg_tutorial(text) to authenticated;
