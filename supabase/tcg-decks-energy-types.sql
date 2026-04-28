-- Migration : ajoute le choix manuel des types d'énergies par deck.
--
-- Pocket : à la création de deck, le joueur sélectionne 1 à 3 types
-- d'énergies que le système va auto-générer durant le combat. Le choix
-- est manuel — un deck Pikachu (Pokémon Électrique) peut avoir uniquement
-- des énergies Eau si le joueur le souhaite, etc.
--
-- À lancer une seule fois dans le SQL editor Supabase. Re-runnable :
-- ALTER TABLE est `if not exists`, le DROP FUNCTION/CREATE remplace
-- la version précédente.

alter table public.tcg_decks
  add column if not exists energy_types text[] not null default '{}';

-- Recrée save_tcg_deck avec le nouveau paramètre p_energy_types.
-- Validations Pocket :
--   • 20 cartes total
--   • max 2 copies par carte
--   • 1 à 3 types d'énergie sélectionnés
drop function if exists public.save_tcg_deck(uuid, text, uuid, text, jsonb);
create or replace function public.save_tcg_deck(
  p_user_id uuid,
  p_game_id text,
  p_id uuid,
  p_name text,
  p_cards jsonb,
  p_energy_types text[] default '{}'
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
  energy_count int;
begin
  trimmed_name := trim(p_name);
  if trimmed_name is null or length(trimmed_name) = 0 then
    raise exception 'Nom de deck vide';
  end if;
  if length(trimmed_name) > 40 then
    trimmed_name := substring(trimmed_name from 1 for 40);
  end if;

  -- Total cartes = 20.
  select coalesce(sum((c->>'count')::int), 0)
  into total_count
  from jsonb_array_elements(p_cards) as c;
  if total_count <> 20 then
    raise exception 'Le deck doit contenir exactement 20 cartes (actuellement %)', total_count;
  end if;

  -- Max 2 copies par carte (la limite "par nom" est validée côté serveur
  -- PartyKit qui a accès aux noms des cartes — ici on reste sur la limite
  -- minimale par cardId).
  select coalesce(max((c->>'count')::int), 0)
  into max_dupes
  from jsonb_array_elements(p_cards) as c;
  if max_dupes > 2 then
    raise exception 'Pas plus de 2 copies par carte (actuellement %)', max_dupes;
  end if;

  -- 1 à 3 types d'énergie sélectionnés (Pocket).
  energy_count := coalesce(array_length(p_energy_types, 1), 0);
  if energy_count < 1 or energy_count > 3 then
    raise exception 'Sélectionne entre 1 et 3 types d''énergie (actuellement %)', energy_count;
  end if;

  if p_id is null then
    insert into public.tcg_decks (user_id, game_id, name, cards, energy_types)
    values (p_user_id, p_game_id, trimmed_name, p_cards, p_energy_types)
    returning id into new_id;
  else
    update public.tcg_decks
    set
      name = trimmed_name,
      cards = p_cards,
      energy_types = p_energy_types,
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
