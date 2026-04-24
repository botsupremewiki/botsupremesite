-- Table + policies for direct messages.
-- Run this once in the Supabase SQL editor.

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);

create index if not exists dm_messages_pair_idx
  on public.dm_messages (
    least(sender_id, recipient_id),
    greatest(sender_id, recipient_id),
    created_at desc
  );

create index if not exists dm_messages_recipient_unread_idx
  on public.dm_messages (recipient_id, read_at)
  where read_at is null;

alter table public.dm_messages enable row level security;

drop policy if exists "dm_read_own" on public.dm_messages;
create policy "dm_read_own"
  on public.dm_messages
  for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "dm_insert_as_sender" on public.dm_messages;
create policy "dm_insert_as_sender"
  on public.dm_messages
  for insert
  with check (auth.uid() = sender_id);

drop policy if exists "dm_mark_read" on public.dm_messages;
create policy "dm_mark_read"
  on public.dm_messages
  for update
  using (auth.uid() = recipient_id);
