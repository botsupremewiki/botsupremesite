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

-- ───────────────────── Daily bot quests ─────────────────────
-- Per-game quest state stored as JSONB :
--   {"pokemon": {"date": "2026-04-25", "bot_wins": 2, "rewarded": false}}
-- Each bot victory increments bot_wins for the day. Reaching 3 grants
-- +1 free booster of that game (once per day, then no more rewards
-- until the next calendar day).

alter table public.profiles
  add column if not exists tcg_quest_state jsonb not null default '{}'::jsonb;

-- Records a bot win and grants 1 free pack at the 3rd win of the day.
-- Returns {bot_wins, granted}. The PartyKit battle server calls this when
-- the human player wins a bot match.
create or replace function public.record_tcg_bot_win(
  p_user_id uuid,
  p_game_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  game_state jsonb;
  today_date date := current_date;
  state_date date;
  wins int;
  rewarded boolean;
  granted boolean := false;
begin
  select coalesce(tcg_quest_state -> p_game_id, '{}'::jsonb) into game_state
  from public.profiles
  where id = p_user_id
  for update;

  state_date := nullif(game_state->>'date', '')::date;
  wins := coalesce((game_state->>'bot_wins')::int, 0);
  rewarded := coalesce((game_state->>'rewarded')::boolean, false);

  if state_date is null or state_date <> today_date then
    -- Nouveau jour → reset.
    wins := 0;
    rewarded := false;
  end if;

  wins := wins + 1;

  if wins >= 3 and not rewarded then
    update public.profiles
    set tcg_free_packs = jsonb_set(
      coalesce(tcg_free_packs, '{}'::jsonb),
      array[p_game_id],
      to_jsonb(coalesce((tcg_free_packs->>p_game_id)::int, 0) + 1)
    )
    where id = p_user_id;
    granted := true;
    rewarded := true;
  end if;

  update public.profiles
  set
    tcg_quest_state = jsonb_set(
      coalesce(tcg_quest_state, '{}'::jsonb),
      array[p_game_id],
      jsonb_build_object(
        'date', today_date::text,
        'bot_wins', wins,
        'rewarded', rewarded
      )
    ),
    updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('bot_wins', wins, 'granted', granted);
end;
$$;
