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
