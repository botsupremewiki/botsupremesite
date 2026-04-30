-- Migration : grant 10 free One Piece TCG packs to every account.
--
-- Couvre :
--   1. Tous les comptes existants (s'ils n'ont pas déjà un compteur "onepiece").
--   2. Les nouveaux comptes via le trigger handle_new_user (mis à jour pour
--      donner 10 packs Pokémon + 10 packs One Piece au signup).
--
-- À lancer une seule fois dans le SQL editor Supabase. Re-runnable safe :
--   • la mise à jour des comptes existants ne touche que ceux sans clé.
--   • la fonction handle_new_user est `create or replace`.

-- 1. Existing users : ajoute "onepiece": 10 si la clé n'existe pas encore.
update public.profiles
set tcg_free_packs = jsonb_set(
  coalesce(tcg_free_packs, '{}'::jsonb),
  array['onepiece'],
  to_jsonb(10)
)
where not (coalesce(tcg_free_packs, '{}'::jsonb) ? 'onepiece');

-- 2. New users : trigger mis à jour pour pré-créer Pokémon + One Piece.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_url, tcg_free_packs)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'user_name',
      'Joueur-' || substring(new.id::text, 1, 6)
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    '{"pokemon": 10, "onepiece": 10}'::jsonb
  );
  return new;
end;
$$;
