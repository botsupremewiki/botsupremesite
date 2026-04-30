-- Migration : récompenses de match PvP + bot One Piece TCG.
--
-- Étend record_battle_result pour distribuer du gold (Or Suprême) et un
-- éventuel free pack à la fin d'un match. Les montants dépendent du
-- mode :
--   • PvP fun (non ranked) : +500 OS gagnant, +100 OS perdant.
--   • PvP ranked         : +1000 OS gagnant + 1 free pack, +200 OS perdant.
-- Le bot mode utilise toujours `consume_tcg_free_pack` + `record_bot_win`
-- existants (3 wins → 1 pack), pas de gold.
--
-- À lancer une seule fois dans le SQL editor Supabase (re-runnable :
-- `create or replace`).

drop function if exists public.record_battle_result(text, uuid, uuid, text, text, text, text, boolean, text);

create or replace function public.record_battle_result(
  p_game_id text,
  p_winner_id uuid,
  p_loser_id uuid,
  p_winner_username text,
  p_loser_username text,
  p_winner_deck_name text,
  p_loser_deck_name text,
  p_ranked boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w_elo int;
  l_elo int;
  k int := 32;
  expected_w numeric;
  w_new int;
  l_new int;
  winner_gold_reward int;
  loser_gold_reward int;
  winner_pack_reward int;
begin
  select coalesce((tcg_elo->>p_game_id)::int, 1000) into w_elo
  from public.profiles where id = p_winner_id for update;
  select coalesce((tcg_elo->>p_game_id)::int, 1000) into l_elo
  from public.profiles where id = p_loser_id for update;

  if p_ranked then
    expected_w := 1.0 / (1.0 + power(10.0, (l_elo - w_elo) / 400.0));
    w_new := w_elo + round(k * (1 - expected_w));
    l_new := greatest(0, l_elo + round(k * (0 - (1 - expected_w))));

    update public.profiles
    set tcg_elo = jsonb_set(
      coalesce(tcg_elo, '{}'::jsonb),
      array[p_game_id],
      to_jsonb(w_new)
    ),
    updated_at = now()
    where id = p_winner_id;

    update public.profiles
    set tcg_elo = jsonb_set(
      coalesce(tcg_elo, '{}'::jsonb),
      array[p_game_id],
      to_jsonb(l_new)
    ),
    updated_at = now()
    where id = p_loser_id;

    winner_gold_reward := 1000;
    loser_gold_reward := 200;
    winner_pack_reward := 1;
  else
    w_new := w_elo;
    l_new := l_elo;
    winner_gold_reward := 500;
    loser_gold_reward := 100;
    winner_pack_reward := 0;
  end if;

  -- Distribue le gold (toujours pour PvP, jamais pour bot — qui n'appelle
  -- pas cette RPC).
  update public.profiles
  set gold = coalesce(gold, 0) + winner_gold_reward,
      updated_at = now()
  where id = p_winner_id;

  update public.profiles
  set gold = coalesce(gold, 0) + loser_gold_reward,
      updated_at = now()
  where id = p_loser_id;

  -- Distribue le free pack si applicable (ranked seulement).
  if winner_pack_reward > 0 then
    update public.profiles
    set tcg_free_packs = jsonb_set(
      coalesce(tcg_free_packs, '{}'::jsonb),
      array[p_game_id],
      to_jsonb(coalesce((tcg_free_packs->>p_game_id)::int, 0) + winner_pack_reward)
    ),
    updated_at = now()
    where id = p_winner_id;
  end if;

  insert into public.battle_history (
    game_id,
    winner_id, loser_id,
    winner_username, loser_username,
    winner_deck_name, loser_deck_name,
    ranked,
    winner_elo_before, winner_elo_after,
    loser_elo_before, loser_elo_after,
    reason
  ) values (
    p_game_id,
    p_winner_id, p_loser_id,
    p_winner_username, p_loser_username,
    p_winner_deck_name, p_loser_deck_name,
    p_ranked,
    w_elo, w_new,
    l_elo, l_new,
    p_reason
  );

  return jsonb_build_object(
    'winner_elo_before', w_elo,
    'winner_elo_after', w_new,
    'loser_elo_before', l_elo,
    'loser_elo_after', l_new,
    'winner_gold_reward', winner_gold_reward,
    'loser_gold_reward', loser_gold_reward,
    'winner_pack_reward', winner_pack_reward
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- record_tcg_bot_win : ajout de +100 OS par win bot (en plus du pack
-- déjà donné au 3e win quotidien).
-- ──────────────────────────────────────────────────────────────────────
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
  gold_reward int := 100;
begin
  select coalesce(tcg_quest_state -> p_game_id, '{}'::jsonb) into game_state
  from public.profiles
  where id = p_user_id
  for update;

  state_date := nullif(game_state->>'date', '')::date;
  wins := coalesce((game_state->>'bot_wins')::int, 0);
  rewarded := coalesce((game_state->>'rewarded')::boolean, false);

  if state_date is null or state_date <> today_date then
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

  -- +100 OS par win bot (toujours).
  update public.profiles
  set
    gold = coalesce(gold, 0) + gold_reward,
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

  return jsonb_build_object(
    'bot_wins', wins,
    'granted', granted,
    'gold_reward', gold_reward
  );
end;
$$;
