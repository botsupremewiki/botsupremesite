-- TCG : échange realtime entre 2 joueurs (1 carte chacun)
--
-- Le flux est : les 2 joueurs se rejoignent dans une room PartyKit, posent
-- 1 carte chacun, et les 2 valident → cette RPC exécute l'échange
-- atomiquement. Différent du flow turn-based de tcg-trades.sql qui passe
-- par une proposition pending → accepted.
--
-- Les 2 joueurs doivent posséder ≥2 de leur carte (on garde toujours ≥1
-- en collection pour ne pas dépouiller). La RPC enregistre aussi une
-- ligne dans tcg_trades avec status='accepted' pour l'historique + le
-- décompte du cap 3 trades/jour.
--
-- Idempotent : create or replace.
-- ──────────────────────────────────────────────────────────────────────

-- RPC : execute_realtime_trade
-- Échange atomique : userA donne cardA × 1 à userB, userB donne cardB × 1
-- à userA. Vérifie que les 2 ont ≥2 de leur carte respective. Écrit une
-- ligne dans tcg_trades avec status='accepted' pour l'historique.
--
-- Cette RPC est appelée UNIQUEMENT par le serveur PartyKit avec la clé
-- service_role (pas par le client directement) — c'est PartyKit qui
-- contrôle le flow de validation côté room state.
--
-- Le check du cap 3/jour est fait côté PartyKit avant d'appeler la RPC
-- (via tcg_trades_remaining_today). Cette RPC ne re-check pas pour
-- éviter une double comptabilisation.
create or replace function public.execute_realtime_trade(
  p_user_a uuid,
  p_user_b uuid,
  p_game_id text,
  p_card_a text,
  p_card_b text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a_username text;
  v_b_username text;
  v_a_owned int;
  v_b_owned int;
  v_trade_id uuid;
begin
  if p_user_a is null or p_user_b is null then
    raise exception 'user_a et user_b requis';
  end if;
  if p_user_a = p_user_b then
    raise exception 'Tu ne peux pas échanger avec toi-même';
  end if;
  if p_card_a is null or p_card_b is null
     or length(p_card_a) = 0 or length(p_card_b) = 0 then
    raise exception 'Chacun doit poser une carte';
  end if;

  -- Récupère les usernames pour l'historique.
  select username into v_a_username from public.profiles where id = p_user_a;
  select username into v_b_username from public.profiles where id = p_user_b;
  if v_a_username is null or v_b_username is null then
    raise exception 'Profils introuvables';
  end if;

  -- Vérifie que userA a ≥2 de cardA (on garde 1 en collection).
  select count into v_a_owned
  from public.tcg_cards_owned
  where user_id = p_user_a and game_id = p_game_id and card_id = p_card_a
  for update;
  if coalesce(v_a_owned, 0) < 2 then
    raise exception 'Joueur A ne possède pas assez de la carte A (owned=%, needed=2)',
      coalesce(v_a_owned, 0);
  end if;

  -- Vérifie que userB a ≥2 de cardB.
  select count into v_b_owned
  from public.tcg_cards_owned
  where user_id = p_user_b and game_id = p_game_id and card_id = p_card_b
  for update;
  if coalesce(v_b_owned, 0) < 2 then
    raise exception 'Joueur B ne possède pas assez de la carte B (owned=%, needed=2)',
      coalesce(v_b_owned, 0);
  end if;

  -- ─── Échange atomique ────────────────────────────────────────────────
  -- userA : -1 cardA, +1 cardB
  update public.tcg_cards_owned
  set count = count - 1, updated_at = now()
  where user_id = p_user_a and game_id = p_game_id and card_id = p_card_a;
  insert into public.tcg_cards_owned (user_id, game_id, card_id, count)
  values (p_user_a, p_game_id, p_card_b, 1)
  on conflict (user_id, game_id, card_id)
  do update set
    count = public.tcg_cards_owned.count + 1,
    updated_at = now();

  -- userB : -1 cardB, +1 cardA
  update public.tcg_cards_owned
  set count = count - 1, updated_at = now()
  where user_id = p_user_b and game_id = p_game_id and card_id = p_card_b;
  insert into public.tcg_cards_owned (user_id, game_id, card_id, count)
  values (p_user_b, p_game_id, p_card_a, 1)
  on conflict (user_id, game_id, card_id)
  do update set
    count = public.tcg_cards_owned.count + 1,
    updated_at = now();

  -- ─── Historique ──────────────────────────────────────────────────────
  -- On enregistre dans tcg_trades avec status='accepted' pour que :
  --   1. Le décompte 3 trades/jour reste cohérent (tcg_trades_remaining_today)
  --   2. L'onglet "Mes échanges effectués" puisse les afficher
  insert into public.tcg_trades (
    game_id,
    sender_id, sender_username,
    recipient_id, recipient_username,
    offered_cards, requested_cards,
    status, message,
    created_at, updated_at
  ) values (
    p_game_id,
    p_user_a, v_a_username,
    p_user_b, v_b_username,
    jsonb_build_array(jsonb_build_object('cardId', p_card_a, 'count', 1)),
    jsonb_build_array(jsonb_build_object('cardId', p_card_b, 'count', 1)),
    'accepted',
    'Échange direct realtime',
    now(), now()
  ) returning id into v_trade_id;

  return jsonb_build_object(
    'ok', true,
    'trade_id', v_trade_id,
    'card_a_to_b', p_card_a,
    'card_b_to_a', p_card_b
  );
end;
$$;


-- ──────────────────────────────────────────────────────────────────────
-- RPC : list_my_market_history
-- Retourne mes achats + ventes (statut sold) avec card_id et prix pour
-- l'onglet "Mes achats" et "Mes ventes effectuées".
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.list_my_market_history(
  p_game_id text,
  p_kind text default 'all'  -- 'buys', 'sells', 'all'
) returns table (
  id uuid,
  card_id text,
  price_os bigint,
  seller_id uuid,
  buyer_id uuid,
  status text,
  created_at timestamptz,
  -- "sold_at" est en fait closed_at dans la table — alias pour matcher
  -- le type côté client.
  sold_at timestamptz,
  is_buyer boolean,
  is_seller boolean
)
language sql
security definer
set search_path = public
as $$
  select
    l.id,
    l.card_id,
    l.price_os,
    l.seller_id,
    l.buyer_id,
    l.status,
    l.created_at,
    l.closed_at as sold_at,
    l.buyer_id = auth.uid() as is_buyer,
    l.seller_id = auth.uid() as is_seller
  from public.tcg_card_listings l
  where l.game_id = p_game_id
    and (
      (p_kind = 'buys' and l.buyer_id = auth.uid())
      or (p_kind = 'sells' and l.seller_id = auth.uid() and l.status = 'sold')
      or (p_kind = 'all' and (l.buyer_id = auth.uid() or l.seller_id = auth.uid()))
    )
  order by coalesce(l.closed_at, l.created_at) desc
  limit 200;
$$;


grant execute on function public.execute_realtime_trade(uuid, uuid, text, text, text)
  to service_role;
grant execute on function public.list_my_market_history(text, text)
  to authenticated;
