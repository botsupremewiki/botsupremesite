-- Decks de TCG (Pokémon Gen 1 pour l'instant). Les RPCs valident les
-- contraintes côté DB pour qu'aucun client malicieux ne puisse stocker
-- un deck illégal (≠ 60 cartes, > 4 doublons d'un non-énergie).

create table if not exists public.tcg_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  name text not null,
  -- cards: tableau d'objets { card_id, count } sérialisé en JSONB.
  --   Ex : [{"card_id":"g1-006","count":4}, ...]
  cards jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tcg_decks_user_game_idx
  on public.tcg_decks (user_id, game_id);

alter table public.tcg_decks enable row level security;

drop policy if exists "tcg_decks_read_own" on public.tcg_decks;
create policy "tcg_decks_read_own"
  on public.tcg_decks
  for select
  using (auth.uid() = user_id);

-- Les écritures passent par les RPCs ci-dessous (service_role).

-- ───────────────────── Save deck ─────────────────────
-- p_id = NULL → création; sinon update du deck si l'utilisateur en est
-- propriétaire.  Vérifie aussi les contraintes officielles :
--   • exactement 60 cartes au total
--   • max 4 copies d'une même carte non-énergie de base
--   • toutes les card_id existent côté client (pas vérifié ici)
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
  if total_count <> 60 then
    raise exception 'Le deck doit contenir exactement 60 cartes (actuellement %)', total_count;
  end if;

  -- Max copies of any single non-basic-energy card. The client passes a
  -- card_id like "g1-energy-fire" for energies — we recognise them by the
  -- "energy" substring in the id and let them through unbounded.
  select coalesce(max((c->>'count')::int), 0)
  into max_dupes
  from jsonb_array_elements(p_cards) as c
  where (c->>'card_id') not like '%energy%';
  if max_dupes > 4 then
    raise exception 'Pas plus de 4 copies par carte non-énergie (actuellement %)', max_dupes;
  end if;

  if p_id is null then
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

-- ───────────────────── Delete deck ─────────────────────
create or replace function public.delete_tcg_deck(
  p_user_id uuid,
  p_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.tcg_decks
  where id = p_id and user_id = p_user_id;
end;
$$;
