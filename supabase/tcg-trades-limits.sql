-- Patch idempotent : ajoute une limite de 3 trades initiés par jour
-- glissant (24h) à `create_trade`. Aligné sur Pokemon TCG Pocket qui
-- impose des limites strictes pour empêcher le farming d'échanges.
--
-- Note : la restriction de rareté (◆ à ★ uniquement, pas star-2/3/crown)
-- est faite côté CLIENT car la DB n'a pas accès aux données de cartes
-- (elles vivent dans shared/tcg-pokemon-base.ts). Si l'utilisateur tente
-- de bypass via une requête manuelle, le pire qu'il fasse est créer un
-- trade illégal — pas de duplication ni perte de données.
--
-- Safe à re-exécuter : `create or replace function`.
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
  v_recent_trades int;
begin
  if v_sender_id is null then
    raise exception 'Non authentifié';
  end if;

  -- Limite : max 3 trades initiés sur les 24 dernières heures (rolling
  -- window). On compte les trades pending + accepted + declined (pas les
  -- cancelled, pour permettre de re-tenter après annulation).
  select count(*)
  into v_recent_trades
  from public.tcg_trades
  where sender_id = v_sender_id
    and game_id = p_game_id
    and status in ('pending', 'accepted', 'declined')
    and created_at > now() - interval '24 hours';
  if v_recent_trades >= 3 then
    raise exception 'Limite de 3 trades par 24h atteinte. Reviens demain ou annule un trade en attente.';
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
-- RPC d'introspection : combien de trades restants pour aujourd'hui ?
-- Utilisé côté client pour afficher "X / 3 trades restants aujourd'hui".
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.tcg_trades_remaining_today(p_game_id text)
returns int
language sql
security definer
set search_path = public
as $$
  select greatest(0, 3 - count(*)::int)
  from public.tcg_trades
  where sender_id = auth.uid()
    and game_id = p_game_id
    and status in ('pending', 'accepted', 'declined')
    and created_at > now() - interval '24 hours';
$$;

grant execute on function public.create_trade(text, text, jsonb, jsonb, text) to authenticated;
grant execute on function public.tcg_trades_remaining_today(text) to authenticated;
