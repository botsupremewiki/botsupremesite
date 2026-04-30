-- TCG : système d'échange de cartes entre joueurs.
-- Run après supabase/tcg.sql et tcg-decks.sql.
-- ──────────────────────────────────────────────────────────────────────

-- Table : 1 row par proposition d'échange. Status flow :
--   pending → accepted | declined | cancelled
create table if not exists public.tcg_trades (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_username text not null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  recipient_username text not null,
  -- offered_cards / requested_cards : array de { cardId, count }.
  offered_cards jsonb not null default '[]'::jsonb,
  requested_cards jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tcg_trades_sender_idx
  on public.tcg_trades (sender_id, created_at desc);
create index if not exists tcg_trades_recipient_idx
  on public.tcg_trades (recipient_id, created_at desc);
create index if not exists tcg_trades_pending_idx
  on public.tcg_trades (game_id, status, created_at desc);

alter table public.tcg_trades enable row level security;

-- Policies : on ne peut voir que ses propres trades (sender ou recipient).
drop policy if exists "tcg_trades_read_own" on public.tcg_trades;
create policy "tcg_trades_read_own"
  on public.tcg_trades
  for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- ──────────────────────────────────────────────────────────────────────
-- RPC : create_trade
-- Crée une proposition. Vérifie que le sender possède bien les cartes
-- offered. Retourne l'id du trade ou raise si erreur.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.create_trade(
  p_game_id text,
  p_recipient_username text,
  p_offered jsonb,
  p_requested jsonb,
  p_message text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_sender_username text;
  v_recipient_id uuid;
  v_trade_id uuid;
  v_card record;
  v_owned int;
begin
  if v_sender_id is null then
    raise exception 'Non authentifié';
  end if;

  -- Récupère le sender username.
  select username into v_sender_username
  from public.profiles where id = v_sender_id;
  if v_sender_username is null then
    raise exception 'Profil sender introuvable';
  end if;

  -- Trouve le recipient par username.
  select id into v_recipient_id
  from public.profiles
  where lower(username) = lower(p_recipient_username);
  if v_recipient_id is null then
    raise exception 'Joueur "%" introuvable', p_recipient_username;
  end if;
  if v_recipient_id = v_sender_id then
    raise exception 'Tu ne peux pas t''envoyer un trade à toi-même';
  end if;

  -- Validation : offered doit être un array non vide, idem requested.
  if jsonb_array_length(p_offered) = 0 then
    raise exception 'Tu dois offrir au moins une carte';
  end if;
  if jsonb_array_length(p_requested) = 0 then
    raise exception 'Tu dois demander au moins une carte';
  end if;

  -- Vérification : le sender possède bien les cartes offered.
  for v_card in
    select (elem->>'cardId')::text as cid, (elem->>'count')::int as cnt
    from jsonb_array_elements(p_offered) elem
  loop
    select count into v_owned
    from public.tcg_collection
    where user_id = v_sender_id
      and game_id = p_game_id
      and card_id = v_card.cid;
    if v_owned is null or v_owned < v_card.cnt then
      raise exception 'Tu ne possèdes pas assez de la carte %', v_card.cid;
    end if;
  end loop;

  -- Insert le trade.
  insert into public.tcg_trades (
    game_id,
    sender_id, sender_username,
    recipient_id, recipient_username,
    offered_cards, requested_cards,
    message
  ) values (
    p_game_id,
    v_sender_id, v_sender_username,
    v_recipient_id, p_recipient_username,
    p_offered, p_requested,
    p_message
  ) returning id into v_trade_id;

  return v_trade_id;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- RPC : accept_trade
-- Exécute l'échange atomiquement. Vérifie que les 2 parties ont bien
-- les cartes au moment de l'accept (les collections peuvent avoir bougé
-- entre la création et l'acceptation). Met status = accepted.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.accept_trade(p_trade_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trade record;
  v_card record;
  v_owned int;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;

  select * into v_trade
  from public.tcg_trades where id = p_trade_id for update;
  if v_trade is null then
    raise exception 'Trade introuvable';
  end if;
  if v_trade.recipient_id != v_user_id then
    raise exception 'Seul le destinataire peut accepter';
  end if;
  if v_trade.status != 'pending' then
    raise exception 'Ce trade n''est plus en attente (%)', v_trade.status;
  end if;

  -- Vérifie que le SENDER a toujours les cartes offered.
  for v_card in
    select (elem->>'cardId')::text as cid, (elem->>'count')::int as cnt
    from jsonb_array_elements(v_trade.offered_cards) elem
  loop
    select count into v_owned
    from public.tcg_collection
    where user_id = v_trade.sender_id
      and game_id = v_trade.game_id
      and card_id = v_card.cid;
    if v_owned is null or v_owned < v_card.cnt then
      raise exception 'L''autre joueur ne possède plus assez de la carte %', v_card.cid;
    end if;
  end loop;

  -- Vérifie que le RECIPIENT a les cartes requested.
  for v_card in
    select (elem->>'cardId')::text as cid, (elem->>'count')::int as cnt
    from jsonb_array_elements(v_trade.requested_cards) elem
  loop
    select count into v_owned
    from public.tcg_collection
    where user_id = v_trade.recipient_id
      and game_id = v_trade.game_id
      and card_id = v_card.cid;
    if v_owned is null or v_owned < v_card.cnt then
      raise exception 'Tu ne possèdes pas assez de la carte %', v_card.cid;
    end if;
  end loop;

  -- Échange atomique.
  -- Pour chaque carte offerte par le sender : retire au sender, ajoute au recipient.
  for v_card in
    select (elem->>'cardId')::text as cid, (elem->>'count')::int as cnt
    from jsonb_array_elements(v_trade.offered_cards) elem
  loop
    update public.tcg_collection
    set count = count - v_card.cnt
    where user_id = v_trade.sender_id
      and game_id = v_trade.game_id
      and card_id = v_card.cid;
    -- Retire la ligne si count tombe à 0.
    delete from public.tcg_collection
    where user_id = v_trade.sender_id
      and game_id = v_trade.game_id
      and card_id = v_card.cid
      and count <= 0;
    insert into public.tcg_collection (user_id, game_id, card_id, count)
    values (v_trade.recipient_id, v_trade.game_id, v_card.cid, v_card.cnt)
    on conflict (user_id, game_id, card_id)
    do update set count = public.tcg_collection.count + excluded.count;
  end loop;
  -- Pour chaque carte demandée du recipient : retire au recipient, ajoute au sender.
  for v_card in
    select (elem->>'cardId')::text as cid, (elem->>'count')::int as cnt
    from jsonb_array_elements(v_trade.requested_cards) elem
  loop
    update public.tcg_collection
    set count = count - v_card.cnt
    where user_id = v_trade.recipient_id
      and game_id = v_trade.game_id
      and card_id = v_card.cid;
    delete from public.tcg_collection
    where user_id = v_trade.recipient_id
      and game_id = v_trade.game_id
      and card_id = v_card.cid
      and count <= 0;
    insert into public.tcg_collection (user_id, game_id, card_id, count)
    values (v_trade.sender_id, v_trade.game_id, v_card.cid, v_card.cnt)
    on conflict (user_id, game_id, card_id)
    do update set count = public.tcg_collection.count + excluded.count;
  end loop;

  update public.tcg_trades
  set status = 'accepted', updated_at = now()
  where id = p_trade_id;

  return true;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- RPC : decline_trade — le destinataire refuse.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.decline_trade(p_trade_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trade record;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  select * into v_trade from public.tcg_trades where id = p_trade_id for update;
  if v_trade is null then return false; end if;
  if v_trade.recipient_id != v_user_id then
    raise exception 'Seul le destinataire peut refuser';
  end if;
  if v_trade.status != 'pending' then return false; end if;

  update public.tcg_trades
  set status = 'declined', updated_at = now()
  where id = p_trade_id;
  return true;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- RPC : cancel_trade — l'expéditeur annule sa propre proposition.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.cancel_trade(p_trade_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trade record;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  select * into v_trade from public.tcg_trades where id = p_trade_id for update;
  if v_trade is null then return false; end if;
  if v_trade.sender_id != v_user_id then
    raise exception 'Seul l''expéditeur peut annuler';
  end if;
  if v_trade.status != 'pending' then return false; end if;

  update public.tcg_trades
  set status = 'cancelled', updated_at = now()
  where id = p_trade_id;
  return true;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- RPC : list_my_trades
-- Renvoie tous les trades pour le user (sent + received), filtrés
-- éventuellement par status (default = pending).
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.list_my_trades(
  p_game_id text,
  p_status text default 'pending'
) returns table (
  id uuid,
  sender_id uuid,
  sender_username text,
  recipient_id uuid,
  recipient_username text,
  offered_cards jsonb,
  requested_cards jsonb,
  message text,
  status text,
  created_at timestamptz,
  is_sender boolean
)
language sql
security definer
set search_path = public
as $$
  select
    id,
    sender_id, sender_username,
    recipient_id, recipient_username,
    offered_cards, requested_cards,
    message,
    status,
    created_at,
    sender_id = auth.uid() as is_sender
  from public.tcg_trades
  where game_id = p_game_id
    and (p_status is null or status = p_status)
    and (sender_id = auth.uid() or recipient_id = auth.uid())
  order by created_at desc;
$$;
