-- TCG Tournois : extension du schema pour supporter Swiss et Double-Elim.
--
-- Modifications :
--  • tcg_tournaments : col `format` ('single_elim' | 'double_elim' | 'swiss')
--  • tcg_tournaments : col `swiss_rounds_total` int (N total pour Swiss)
--  • tcg_tournament_entries : cols `score`, `match_wins`, `match_losses`,
--      `tiebreaker_buchholz` pour Swiss
--  • tcg_tournament_matches : col `bracket` ('w' | 'l' | 'gf' pour double-elim)
--      ou null pour single/swiss. Col `swiss_round` int.
--
-- Implémentation Swiss : N = ceil(log2(size)) rounds. À chaque round on
-- pair les joueurs ayant le même score (random dans la bucket, pas de
-- rematch). Tie-breaker : Buchholz (somme des scores des adversaires).
--
-- L'implémentation côté UI / start_tournament reste TODO pour ces
-- formats — la migration prépare le schema seulement.
--
-- Run après supabase/tcg-tournaments.sql.
-- ──────────────────────────────────────────────────────────────────────

alter table public.tcg_tournaments
  add column if not exists format text not null default 'single_elim'
    check (format in ('single_elim', 'double_elim', 'swiss'));
alter table public.tcg_tournaments
  add column if not exists swiss_rounds_total int;

alter table public.tcg_tournament_entries
  add column if not exists score int not null default 0;
alter table public.tcg_tournament_entries
  add column if not exists match_wins int not null default 0;
alter table public.tcg_tournament_entries
  add column if not exists match_losses int not null default 0;
alter table public.tcg_tournament_entries
  add column if not exists tiebreaker_buchholz numeric not null default 0;

alter table public.tcg_tournament_matches
  add column if not exists bracket text
    check (bracket is null or bracket in ('w', 'l', 'gf'));
alter table public.tcg_tournament_matches
  add column if not exists swiss_round int;

-- ─── Pairing Swiss : génère les matches du round courant ──────────────
-- Algorithme :
--  1. Trie les inscrits par score desc.
--  2. Bucket par score (ex: tous les 2-0, tous les 1-1, tous les 0-2).
--  3. Dans chaque bucket, shuffle puis pair successivement, en évitant
--     les rematches (vérifie matches déjà joués).
--  4. Si bucket impair, le joueur du bas reçoit un "bye" (gain auto).
create or replace function public.swiss_pair_next_round(p_tournament_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t record;
  v_round int;
  v_total int;
  v_pos int := 0;
  v_left record;
  v_right record;
  v_existing int;
  v_paired uuid[] := '{}'::uuid[];
begin
  select * into v_t from public.tcg_tournaments where id = p_tournament_id for update;
  if v_t is null or v_t.format <> 'swiss' or v_t.status <> 'running' then
    raise exception 'Tournoi swiss non en cours';
  end if;

  -- Round suivant.
  select coalesce(max(swiss_round), 0) + 1 into v_round
  from public.tcg_tournament_matches
  where tournament_id = p_tournament_id;

  if v_round > v_t.swiss_rounds_total then
    raise exception 'Tous les rounds Swiss déjà joués';
  end if;

  -- Itère sur les inscrits, triés par score desc + buchholz desc, en
  -- pairant successivement les non-encore-pairés.
  for v_left in
    select e.user_id, e.deck_id, e.score, e.tiebreaker_buchholz
    from public.tcg_tournament_entries e
    where e.tournament_id = p_tournament_id
    order by e.score desc, e.tiebreaker_buchholz desc, random()
  loop
    if v_left.user_id = any(v_paired) then continue; end if;
    -- Cherche un adversaire non pairé avec score similaire (priorité
    -- même score, sinon rapproché) qui n'a pas encore joué contre.
    select e.user_id, e.deck_id into v_right
    from public.tcg_tournament_entries e
    where e.tournament_id = p_tournament_id
      and e.user_id <> v_left.user_id
      and not (e.user_id = any(v_paired))
      and not exists (
        select 1 from public.tcg_tournament_matches m
        where m.tournament_id = p_tournament_id
          and ((m.player_a = v_left.user_id and m.player_b = e.user_id)
               or (m.player_a = e.user_id and m.player_b = v_left.user_id))
      )
    order by abs(e.score - v_left.score), random()
    limit 1;

    if v_right is null then
      -- Bye : pas d'adversaire dispo, gain auto +1 score (pas de match).
      update public.tcg_tournament_entries
      set score = score + 1, match_wins = match_wins + 1
      where tournament_id = p_tournament_id and user_id = v_left.user_id;
      v_paired := array_append(v_paired, v_left.user_id);
      continue;
    end if;

    -- Crée le match.
    insert into public.tcg_tournament_matches (
      tournament_id, round, swiss_round, bracket_position,
      player_a, player_b, deck_a_id, deck_b_id, status
    ) values (
      p_tournament_id, v_round, v_round, v_pos,
      v_left.user_id, v_right.user_id, v_left.deck_id, v_right.deck_id,
      'pending'
    );
    v_pos := v_pos + 1;
    v_paired := array_append(v_paired, v_left.user_id);
    v_paired := array_append(v_paired, v_right.user_id);
  end loop;

  v_total := v_pos;
  return v_total;
end;
$$;

-- ─── Mise à jour score Swiss après chaque match ───────────────────────
-- Trigger sur tcg_tournament_matches : quand status passe à 'done',
-- crédite +1 score au winner. Recalcule Buchholz à la fin du tournoi.
create or replace function public._swiss_update_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t record;
begin
  if new.status <> 'done' or coalesce(old.status, 'pending') = 'done' then
    return new;
  end if;
  select format into v_t from public.tcg_tournaments where id = new.tournament_id;
  if v_t.format <> 'swiss' then return new; end if;

  -- +1 score au winner, +1 match_wins.
  update public.tcg_tournament_entries
  set score = score + 1, match_wins = match_wins + 1
  where tournament_id = new.tournament_id and user_id = new.winner_id;
  -- +1 match_losses au loser.
  update public.tcg_tournament_entries
  set match_losses = match_losses + 1
  where tournament_id = new.tournament_id
    and user_id = case when new.winner_id = new.player_a then new.player_b else new.player_a end;
  return new;
end;
$$;
drop trigger if exists swiss_score_trigger on public.tcg_tournament_matches;
create trigger swiss_score_trigger
  after update on public.tcg_tournament_matches
  for each row execute function public._swiss_update_score();

grant execute on function public.swiss_pair_next_round(uuid) to authenticated;
revoke execute on function public._swiss_update_score() from public, authenticated, anon;
