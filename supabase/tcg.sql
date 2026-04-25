-- Run this once in the Supabase SQL editor to set up the TCG collection
-- table plus an RPC for atomic count increments. The PartyKit servers
-- call the RPC with the service_role key.

create table if not exists public.tcg_cards_owned (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  card_id text not null,
  count int not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id, card_id)
);

alter table public.tcg_cards_owned enable row level security;

-- Players can read their own collection from the web app (anon key).
drop policy if exists "tcg_read_own" on public.tcg_cards_owned;
create policy "tcg_read_own"
  on public.tcg_cards_owned
  for select
  using (auth.uid() = user_id);

-- Writes go through the service role only — no direct insert/update from the
-- client. (Service role bypasses RLS by default.)

-- Atomic batch upsert: takes a JSONB array of {card_id, count} entries and
-- increments each row. Idempotent across retries.
create or replace function public.add_cards_to_tcg_collection(
  p_user_id uuid,
  p_game_id text,
  p_cards jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb;
begin
  for c in select * from jsonb_array_elements(p_cards)
  loop
    insert into public.tcg_cards_owned (user_id, game_id, card_id, count)
    values (
      p_user_id,
      p_game_id,
      c->>'card_id',
      (c->>'count')::int
    )
    on conflict (user_id, game_id, card_id)
    do update set
      count = public.tcg_cards_owned.count + (c->>'count')::int,
      updated_at = now();
  end loop;
end;
$$;

-- ───────────────────── Free starter packs ─────────────────────
-- A per-game counter of "free packs" stored as JSONB on the profile so we
-- can grant boosters to brand-new users (and existing ones, retroactively)
-- without bumping their gold balance.

alter table public.profiles
  add column if not exists tcg_free_packs jsonb not null default '{}'::jsonb;

-- Grant 10 free Pokémon packs to every account that doesn't already have
-- a counter (covers existing users on first migration; safe to re-run).
update public.profiles
set tcg_free_packs = jsonb_set(
  coalesce(tcg_free_packs, '{}'::jsonb),
  array['pokemon'],
  to_jsonb(10)
)
where not (coalesce(tcg_free_packs, '{}'::jsonb) ? 'pokemon');

-- Update the new-user trigger so freshly signed-up players get the same
-- 10 free Pokémon packs at signup.
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
    '{"pokemon": 10}'::jsonb
  );
  return new;
end;
$$;

-- Atomic consume helper: subtracts 1 from the counter when there's stock,
-- returns true if a free pack was used, false otherwise. The PartyKit
-- server calls this *before* deducting OS so we never burn both.
create or replace function public.consume_tcg_free_pack(
  p_user_id uuid,
  p_game_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  free_count int;
begin
  select coalesce((tcg_free_packs->>p_game_id)::int, 0) into free_count
  from public.profiles
  where id = p_user_id
  for update;

  if free_count > 0 then
    update public.profiles
    set
      tcg_free_packs = jsonb_set(
        coalesce(tcg_free_packs, '{}'::jsonb),
        array[p_game_id],
        to_jsonb(free_count - 1)
      ),
      updated_at = now()
    where id = p_user_id;
    return true;
  end if;
  return false;
end;
$$;
