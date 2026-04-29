-- Migration : ajoute le champ regions pour les decks Legends of Runeterra.
--
-- LoR Set 1 : 40 cartes, max 3 copies par cardCode, 1-2 régions choisies.
-- Les cartes du deck doivent partager au moins une région avec celles
-- choisies (validation contenu côté serveur PartyKit qui a accès au pool).
-- Max 6 champions (validation côté serveur).
--
-- À lancer une seule fois dans le SQL editor Supabase. Re-runnable :
-- ALTER TABLE est `if not exists`, le DROP FUNCTION/CREATE remplace la
-- version précédente.

alter table public.tcg_decks
  add column if not exists regions text[] null;

-- Recrée save_tcg_deck avec un dispatch par game_id :
--   • pokemon  → 20 cartes, max 2 copies, 1-3 énergies
--   • onepiece → 50 cartes, max 4 copies, leader_id requis
--   • lol      → 40 cartes, max 3 copies, 1-2 régions
drop function if exists public.save_tcg_deck(uuid, text, uuid, text, jsonb, text[], text);
drop function if exists public.save_tcg_deck(uuid, text, uuid, text, jsonb, text[], text, text[]);
create or replace function public.save_tcg_deck(
  p_user_id uuid,
  p_game_id text,
  p_id uuid,
  p_name text,
  p_cards jsonb,
  p_energy_types text[] default '{}',
  p_leader_id text default null,
  p_regions text[] default '{}'
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
  region_count int;
begin
  trimmed_name := trim(p_name);
  if trimmed_name is null or length(trimmed_name) = 0 then
    raise exception 'Nom de deck vide';
  end if;
  if length(trimmed_name) > 40 then
    trimmed_name := substring(trimmed_name from 1 for 40);
  end if;

  select coalesce(sum((c->>'count')::int), 0)
  into total_count
  from jsonb_array_elements(p_cards) as c;

  select coalesce(max((c->>'count')::int), 0)
  into max_dupes
  from jsonb_array_elements(p_cards) as c;

  if p_game_id = 'pokemon' then
    if total_count <> 20 then
      raise exception 'Le deck doit contenir exactement 20 cartes (actuellement %)', total_count;
    end if;
    if max_dupes > 2 then
      raise exception 'Pas plus de 2 copies par carte (actuellement %)', max_dupes;
    end if;
    energy_count := coalesce(array_length(p_energy_types, 1), 0);
    if energy_count < 1 or energy_count > 3 then
      raise exception 'Sélectionne entre 1 et 3 types d''énergie (actuellement %)', energy_count;
    end if;
  elsif p_game_id = 'onepiece' then
    if total_count <> 50 then
      raise exception 'Le deck One Piece doit contenir exactement 50 cartes (actuellement %)', total_count;
    end if;
    if max_dupes > 4 then
      raise exception 'Pas plus de 4 copies par carte (actuellement %)', max_dupes;
    end if;
    if p_leader_id is null or length(trim(p_leader_id)) = 0 then
      raise exception 'Un Leader est requis pour un deck One Piece';
    end if;
  elsif p_game_id = 'lol' then
    if total_count <> 40 then
      raise exception 'Le deck Runeterra doit contenir exactement 40 cartes (actuellement %)', total_count;
    end if;
    if max_dupes > 3 then
      raise exception 'Pas plus de 3 copies par carte (actuellement %)', max_dupes;
    end if;
    region_count := coalesce(array_length(p_regions, 1), 0);
    if region_count < 1 or region_count > 2 then
      raise exception 'Sélectionne 1 ou 2 régions (actuellement %)', region_count;
    end if;
  else
    raise exception 'game_id non supporté : %', p_game_id;
  end if;

  if p_id is null then
    insert into public.tcg_decks (user_id, game_id, name, cards, energy_types, leader_id, regions)
    values (p_user_id, p_game_id, trimmed_name, p_cards, p_energy_types, p_leader_id, p_regions)
    returning id into new_id;
  else
    update public.tcg_decks
    set
      name = trimmed_name,
      cards = p_cards,
      energy_types = p_energy_types,
      leader_id = p_leader_id,
      regions = p_regions,
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
