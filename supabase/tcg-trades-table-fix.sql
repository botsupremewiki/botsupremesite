-- Fix : `accept_trade` du fichier original tcg-trades.sql utilise une
-- table `tcg_collection` qui n'existe pas (la vraie table = `tcg_cards_owned`).
-- Sans ce patch, accepter un trade plante avec "relation tcg_collection
-- does not exist".
--
-- Note : le fichier `tcg-trades.sql` d'origine n'est PAS modifié — on
-- override juste la fonction ici. C'est idempotent (`create or replace`).
--
-- À exécuter APRÈS tcg-trades.sql + tcg-trades-limits.sql.
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
    from public.tcg_cards_owned
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
    from public.tcg_cards_owned
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
    update public.tcg_cards_owned
    set count = count - v_card.cnt
    where user_id = v_trade.sender_id
      and game_id = v_trade.game_id
      and card_id = v_card.cid;
    delete from public.tcg_cards_owned
    where user_id = v_trade.sender_id
      and game_id = v_trade.game_id
      and card_id = v_card.cid
      and count <= 0;
    insert into public.tcg_cards_owned (user_id, game_id, card_id, count)
    values (v_trade.recipient_id, v_trade.game_id, v_card.cid, v_card.cnt)
    on conflict (user_id, game_id, card_id)
    do update set count = public.tcg_cards_owned.count + excluded.count;
  end loop;
  -- Pour chaque carte demandée du recipient : retire au recipient, ajoute au sender.
  for v_card in
    select (elem->>'cardId')::text as cid, (elem->>'count')::int as cnt
    from jsonb_array_elements(v_trade.requested_cards) elem
  loop
    update public.tcg_cards_owned
    set count = count - v_card.cnt
    where user_id = v_trade.recipient_id
      and game_id = v_trade.game_id
      and card_id = v_card.cid;
    delete from public.tcg_cards_owned
    where user_id = v_trade.recipient_id
      and game_id = v_trade.game_id
      and card_id = v_card.cid
      and count <= 0;
    insert into public.tcg_cards_owned (user_id, game_id, card_id, count)
    values (v_trade.sender_id, v_trade.game_id, v_card.cid, v_card.cnt)
    on conflict (user_id, game_id, card_id)
    do update set count = public.tcg_cards_owned.count + excluded.count;
  end loop;

  update public.tcg_trades
  set status = 'accepted', updated_at = now()
  where id = p_trade_id;

  return true;
end;
$$;
