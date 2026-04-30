-- TCG : hooks de notifications pour les événements importants.
--
-- Repose sur la table `notifications` + RPC `notify()` définis dans
-- supabase/eternum-final-polish.sql. Branche les triggers sur tcg_trades,
-- tcg_tournaments, tcg_season_results pour envoyer une notif quand
-- l'utilisateur doit être au courant.
--
-- Run après les migrations correspondantes.
-- ──────────────────────────────────────────────────────────────────────

-- ─── 1) Trade reçue par un utilisateur ────────────────────────────────
create or replace function public._tcg_notify_trade_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_name text;
begin
  if new.status = 'pending' then
    select username into v_sender_name
    from public.profiles where id = new.sender_id;
    perform public.notify(
      new.recipient_id,
      'tcg_trade_received',
      'Nouvelle proposition d''échange',
      coalesce(v_sender_name, '?') || ' veut échanger des cartes avec toi.',
      '/play/tcg/' || new.game_id || '/trade'
    );
  end if;
  return new;
end;
$$;
drop trigger if exists tcg_trades_notify_received on public.tcg_trades;
create trigger tcg_trades_notify_received
  after insert on public.tcg_trades
  for each row execute function public._tcg_notify_trade_received();

-- ─── 2) Trade acceptée / déclinée → notifie l'offerer ─────────────────
create or replace function public._tcg_notify_trade_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_name text;
begin
  if new.status in ('accepted', 'declined') and old.status = 'pending' then
    select username into v_recipient_name
    from public.profiles where id = new.recipient_id;
    if new.status = 'accepted' then
      perform public.notify(
        new.sender_id,
        'tcg_trade_accepted',
        'Échange accepté !',
        coalesce(v_recipient_name, '?') || ' a accepté ta proposition.',
        '/play/tcg/' || new.game_id || '/trade'
      );
    else
      perform public.notify(
        new.sender_id,
        'tcg_trade_declined',
        'Échange refusé',
        coalesce(v_recipient_name, '?') || ' a refusé ta proposition.',
        '/play/tcg/' || new.game_id || '/trade'
      );
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists tcg_trades_notify_resolved on public.tcg_trades;
create trigger tcg_trades_notify_resolved
  after update on public.tcg_trades
  for each row execute function public._tcg_notify_trade_resolved();

-- ─── 3) Tournoi démarre → notifie tous les inscrits ───────────────────
create or replace function public._tcg_notify_tournament_started()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if new.status = 'running' and old.status = 'open' then
    for v_user in
      select user_id from public.tcg_tournament_entries
      where tournament_id = new.id
    loop
      perform public.notify(
        v_user,
        'tcg_tournament_started',
        'Le tournoi "' || new.name || '" démarre !',
        'Va voir le bracket et joue ton premier match.',
        '/play/tcg/' || new.game_id || '/tournaments/' || new.id::text
      );
    end loop;
  end if;
  if new.status = 'finished' and old.status = 'running' then
    for v_user in
      select user_id from public.tcg_tournament_entries
      where tournament_id = new.id
    loop
      perform public.notify(
        v_user,
        'tcg_tournament_finished',
        'Tournoi "' || new.name || '" terminé',
        'Va voir le podium et tes récompenses.',
        '/play/tcg/' || new.game_id || '/tournaments/' || new.id::text
      );
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists tcg_tournaments_notify_status on public.tcg_tournaments;
create trigger tcg_tournaments_notify_status
  after update on public.tcg_tournaments
  for each row execute function public._tcg_notify_tournament_started();

-- ─── 4) Saison clôturée → notifie chaque joueur snapshotté ────────────
create or replace function public._tcg_notify_season_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_number int;
begin
  select season_number into v_season_number
  from public.tcg_seasons where id = new.season_id;
  perform public.notify(
    new.user_id,
    'tcg_season_ended',
    'Saison #' || coalesce(v_season_number, 0) || ' terminée',
    'Tu finis #' || coalesce(new.final_rank, 0) ||
      ' (' || new.tier || '). ' ||
      new.gold_reward || ' OS' ||
      case when new.pack_reward > 0 then ' + ' || new.pack_reward || ' booster(s)' else '' end ||
      ' à réclamer.',
    '/play/tcg/' || new.game_id || '/seasons'
  );
  return new;
end;
$$;
drop trigger if exists tcg_season_results_notify on public.tcg_season_results;
create trigger tcg_season_results_notify
  after insert on public.tcg_season_results
  for each row execute function public._tcg_notify_season_result();

-- Pas de grant : ces triggers sont SECURITY DEFINER et appellent notify()
-- qui est lui-même DEFINER. Aucun client n'appelle ces fonctions
-- directement.
revoke execute on function public._tcg_notify_trade_received() from public, authenticated, anon;
revoke execute on function public._tcg_notify_trade_resolved() from public, authenticated, anon;
revoke execute on function public._tcg_notify_tournament_started() from public, authenticated, anon;
revoke execute on function public._tcg_notify_season_result() from public, authenticated, anon;
