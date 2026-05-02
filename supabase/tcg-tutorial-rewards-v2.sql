-- Patch idempotent v2 : récompenses centralisées sur le tutoriel
--
-- Avant :
--   • Signup → +10 packs Pokemon + +10 packs OnePiece automatiquement
--     (via handle_new_user() trigger)
--   • Tutoriel Pokemon → +50 OS + +10 packs Pokemon (v1)
--
-- Après (cette migration) :
--   • Signup → AUCUN pack offert (le user doit faire le tuto pour les avoir)
--   • Tutoriel (Pokemon, OnePiece, LoR) → +50 OS + +10 packs du jeu concerné
--
-- Rationale : on incite le joueur à faire le tutoriel (qui lui apprend les
-- règles avant de claquer ses packs sans comprendre) plutôt que de
-- distribuer des packs gratuits "par défaut" sans contexte.
--
-- Safe à re-exécuter : `create or replace function`.
-- ──────────────────────────────────────────────────────────────────────

-- 1) handle_new_user : plus de packs au signup. On garde juste
--    username + avatar_url + le bonus 1000 OS de bienvenue (déjà en place
--    via la default value de profiles.gold = 1000).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'user_name',
      'Joueur-' || substring(new.id::text, 1, 6)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

-- 2) complete_tcg_tutorial : +50 OS + +10 packs pour les 3 jeux
--    (pokemon, onepiece, lol). L'ancienne version ne donnait des packs
--    que pour pokemon — maintenant c'est aligné sur les 3 TCG.
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
    -- 10 boosters gratuits pour les TCG supportés (pokemon, onepiece, lol).
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
  return jsonb_build_object(
    'first_time', v_first,
    'reward_gold', case when v_first then 50 else 0 end,
    'reward_packs', v_packs
  );
end;
$$;

grant execute on function public.complete_tcg_tutorial(text) to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- Note : les comptes EXISTANTS qui ont déjà reçu 10 packs Pokemon/OnePiece
-- via tcg-onepiece-free-packs.sql conservent leur stock actuel — on ne
-- leur RETIRE rien. Cette migration ne change que :
--   • Comportement futur des nouveaux signups (plus de packs auto)
--   • Étend le reward tutoriel à OnePiece + LoL
--
-- Pour reset les packs d'un user en dev (forcer le re-test du tuto) :
--   delete from public.tcg_tutorial_completion where user_id = auth.uid();
--   update public.profiles set tcg_free_packs = '{}'::jsonb where id = auth.uid();
-- ──────────────────────────────────────────────────────────────────────
