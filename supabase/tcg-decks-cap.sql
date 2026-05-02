-- Patch idempotent : ajoute un cap à 20 decks par user/game_id côté
-- serveur dans `save_tcg_deck`. Sans ce cap, un client malicieux pourrait
-- créer un nombre arbitraire de decks (DB bloat).
--
-- Le check se déclenche uniquement à la création (p_id is null) — les
-- updates de decks existants ne sont pas concernés.
--
-- Safe à re-exécuter : `create or replace function` remplace l'existant.
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.save_tcg_deck(
  p_user_id uuid,
  p_game_id text,
  p_id uuid,
  p_name text,
  p_cards jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  total_count int;
  max_dupes int;
  trimmed_name text;
  new_id uuid;
  current_deck_count int;
begin
  trimmed_name := trim(p_name);
  if trimmed_name is null or length(trimmed_name) = 0 then
    raise exception 'Nom de deck vide';
  end if;
  if length(trimmed_name) > 40 then
    trimmed_name := substring(trimmed_name from 1 for 40);
  end if;

  -- Total count = sum of all "count" fields.
  select coalesce(sum((c->>'count')::int), 0)
  into total_count
  from jsonb_array_elements(p_cards) as c;
  if total_count <> 20 then
    raise exception 'Le deck doit contenir exactement 20 cartes (actuellement %)', total_count;
  end if;

  -- Pocket : pas plus de 2 copies de la même carte.
  select coalesce(max((c->>'count')::int), 0)
  into max_dupes
  from jsonb_array_elements(p_cards) as c;
  if max_dupes > 2 then
    raise exception 'Pas plus de 2 copies par carte (actuellement %)', max_dupes;
  end if;

  if p_id is null then
    -- Cap 20 decks par game_id pour ce user (uniquement à la création).
    select count(*)
    into current_deck_count
    from public.tcg_decks
    where user_id = p_user_id and game_id = p_game_id;
    if current_deck_count >= 20 then
      raise exception 'Limite de 20 decks atteinte pour ce jeu. Supprime un deck existant pour en créer un nouveau.';
    end if;

    insert into public.tcg_decks (user_id, game_id, name, cards)
    values (p_user_id, p_game_id, trimmed_name, p_cards)
    returning id into new_id;
  else
    update public.tcg_decks
    set
      name = trimmed_name,
      cards = p_cards,
      updated_at = now()
    where id = p_id and user_id = p_user_id and game_id = p_game_id
    returning id into new_id;
    if new_id is null then
      raise exception 'Deck introuvable';
    end if;
  end if;
  return new_id;
end;
$$;
