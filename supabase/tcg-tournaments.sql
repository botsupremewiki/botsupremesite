-- TCG : mode tournoi (brackets élimination simple).
--
-- Concept :
--  • Un user crée un tournoi (8 places, single elimination) avec un
--    cashprize en OS et boosters mis en pool.
--  • Les autres rejoignent en choisissant un deck.
--  • Quand 8 joueurs sont inscrits, le créateur lance → bracket aléatoire
--    + premiers matches générés (round 1).
--  • Les joueurs jouent en PvP custom (room dédiée) puis le gagnant
--    déclare le résultat via report_match_result. Le serveur valide que
--    l'appelant est bien l'un des deux et avance le bracket.
--  • À la fin, distribution des rewards selon placement (1, 2, 3-4).
--
-- v1 minimaliste : 8 joueurs, single-elim, pas de ranking points.
-- Run après supabase/tcg.sql et supabase/tcg-decks.sql.
-- ──────────────────────────────────────────────────────────────────────

-- ─── 1) Table tcg_tournaments ─────────────────────────────────────────
create table if not exists public.tcg_tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  game_id text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  size int not null default 8 check (size in (4, 8)),
  status text not null default 'open' check (status in ('open','running','finished','cancelled')),
  prize_gold int not null default 0,
  prize_packs int not null default 0,
  winner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists tcg_tournaments_game_status_idx
  on public.tcg_tournaments (game_id, status, created_at desc);
alter table public.tcg_tournaments enable row level security;
drop policy if exists "tcg_tournaments_read_all" on public.tcg_tournaments;
create policy "tcg_tournaments_read_all"
  on public.tcg_tournaments for select using (true);

-- ─── 2) Table tcg_tournament_entries ──────────────────────────────────
create table if not exists public.tcg_tournament_entries (
  tournament_id uuid not null references public.tcg_tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid references public.tcg_decks(id) on delete set null,
  deck_name text,
  seed int,
  placement int,
  created_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);
create index if not exists tcg_tournament_entries_user_idx
  on public.tcg_tournament_entries (user_id, created_at desc);
alter table public.tcg_tournament_entries enable row level security;
drop policy if exists "tcg_tournament_entries_read_all" on public.tcg_tournament_entries;
create policy "tcg_tournament_entries_read_all"
  on public.tcg_tournament_entries for select using (true);

-- ─── 3) Table tcg_tournament_matches ──────────────────────────────────
create table if not exists public.tcg_tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tcg_tournaments(id) on delete cascade,
  round int not null,                          -- 1 = quart, 2 = demi, 3 = finale
  bracket_position int not null,               -- 0..N pour ce round
  player_a uuid references auth.users(id) on delete set null,
  player_b uuid references auth.users(id) on delete set null,
  deck_a_id uuid,
  deck_b_id uuid,
  winner_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','reported','done')),
  reported_by uuid references auth.users(id) on delete set null,
  reported_at timestamptz,
  finished_at timestamptz,
  unique (tournament_id, round, bracket_position)
);
create index if not exists tcg_tournament_matches_tournament_idx
  on public.tcg_tournament_matches (tournament_id, round, bracket_position);
alter table public.tcg_tournament_matches enable row level security;
drop policy if exists "tcg_tournament_matches_read_all" on public.tcg_tournament_matches;
create policy "tcg_tournament_matches_read_all"
  on public.tcg_tournament_matches for select using (true);

-- ─── 4) RPC : create_tournament ───────────────────────────────────────
create or replace function public.create_tournament(
  p_name text,
  p_game_id text,
  p_size int,
  p_prize_gold int,
  p_prize_packs int
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_gold int;
  v_user_packs int;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  if p_size not in (4, 8) then
    raise exception 'Taille de tournoi invalide (doit être 4 ou 8)';
  end if;
  if length(trim(p_name)) < 3 then
    raise exception 'Nom de tournoi trop court';
  end if;
  if p_prize_gold < 0 or p_prize_packs < 0 then
    raise exception 'Cashprize invalide';
  end if;

  -- Le créateur paye le cashprize d'avance (escrow).
  select coalesce(gold, 0),
         coalesce((tcg_free_packs->>p_game_id)::int, 0)
    into v_user_gold, v_user_packs
  from public.profiles where id = v_user_id for update;
  if v_user_gold < p_prize_gold then
    raise exception 'OS insuffisants pour ce cashprize (% requis)', p_prize_gold;
  end if;
  if v_user_packs < p_prize_packs then
    raise exception 'Boosters insuffisants pour ce cashprize (% requis)', p_prize_packs;
  end if;

  if p_prize_gold > 0 then
    update public.profiles
    set gold = gold - p_prize_gold,
        updated_at = now()
    where id = v_user_id;
  end if;
  if p_prize_packs > 0 then
    update public.profiles
    set tcg_free_packs = jsonb_set(
      coalesce(tcg_free_packs, '{}'::jsonb),
      array[p_game_id],
      to_jsonb(v_user_packs - p_prize_packs)
    ),
    updated_at = now()
    where id = v_user_id;
  end if;

  insert into public.tcg_tournaments (
    name, game_id, created_by, size, prize_gold, prize_packs
  ) values (
    trim(p_name), p_game_id, v_user_id, p_size, p_prize_gold, p_prize_packs
  ) returning id into v_id;

  -- Le créateur s'inscrit automatiquement (sans deck — il choisira plus tard).
  insert into public.tcg_tournament_entries (tournament_id, user_id)
  values (v_id, v_user_id)
  on conflict do nothing;

  return v_id;
end;
$$;

-- ─── 5) RPC : join_tournament ─────────────────────────────────────────
create or replace function public.join_tournament(
  p_tournament_id uuid,
  p_deck_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_t record;
  v_count int;
  v_deck record;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  select * into v_t from public.tcg_tournaments where id = p_tournament_id for update;
  if v_t is null then
    raise exception 'Tournoi introuvable';
  end if;
  if v_t.status <> 'open' then
    raise exception 'Inscriptions fermées';
  end if;
  -- Vérifie le deck.
  select id, user_id, game_id, name into v_deck
  from public.tcg_decks where id = p_deck_id;
  if v_deck is null or v_deck.user_id <> v_user_id then
    raise exception 'Deck invalide';
  end if;
  if v_deck.game_id <> v_t.game_id then
    raise exception 'Le deck ne correspond pas au jeu du tournoi';
  end if;
  -- Vérifie qu'il reste de la place.
  select count(*) into v_count
  from public.tcg_tournament_entries where tournament_id = p_tournament_id;
  if v_count >= v_t.size then
    raise exception 'Tournoi complet';
  end if;

  insert into public.tcg_tournament_entries (
    tournament_id, user_id, deck_id, deck_name
  ) values (
    p_tournament_id, v_user_id, p_deck_id, v_deck.name
  ) on conflict (tournament_id, user_id) do update
    set deck_id = excluded.deck_id, deck_name = excluded.deck_name;

  return true;
end;
$$;

-- ─── 6) RPC : leave_tournament ────────────────────────────────────────
create or replace function public.leave_tournament(p_tournament_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_t record;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  select * into v_t from public.tcg_tournaments where id = p_tournament_id for update;
  if v_t is null then
    raise exception 'Tournoi introuvable';
  end if;
  if v_t.status <> 'open' then
    raise exception 'Trop tard pour se désinscrire';
  end if;
  if v_t.created_by = v_user_id then
    raise exception 'Le créateur ne peut pas quitter (annule plutôt le tournoi)';
  end if;
  delete from public.tcg_tournament_entries
  where tournament_id = p_tournament_id and user_id = v_user_id;
  return true;
end;
$$;

-- ─── 7) RPC : start_tournament ────────────────────────────────────────
-- Le créateur (et lui seul) lance le tournoi quand il est plein.
-- Génère bracket aléatoire + matches du round 1.
create or replace function public.start_tournament(p_tournament_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_t record;
  v_count int;
  v_seeded record;
  v_pos int := 0;
  v_pair_a uuid;
  v_pair_a_deck uuid;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  select * into v_t from public.tcg_tournaments where id = p_tournament_id for update;
  if v_t is null then
    raise exception 'Tournoi introuvable';
  end if;
  if v_t.created_by <> v_user_id then
    raise exception 'Seul le créateur peut lancer';
  end if;
  if v_t.status <> 'open' then
    raise exception 'Tournoi déjà lancé';
  end if;
  select count(*) into v_count
  from public.tcg_tournament_entries
  where tournament_id = p_tournament_id and deck_id is not null;
  if v_count <> v_t.size then
    raise exception 'Tournoi pas plein (% / %)', v_count, v_t.size;
  end if;

  -- Affecte un seed aléatoire à chaque inscrit (1..size).
  with shuffled as (
    select user_id,
           row_number() over (order by random()) as new_seed
    from public.tcg_tournament_entries
    where tournament_id = p_tournament_id
  )
  update public.tcg_tournament_entries e
  set seed = s.new_seed
  from shuffled s
  where e.tournament_id = p_tournament_id and e.user_id = s.user_id;

  -- Génère les matches du round 1 : seed N vs seed (size+1-N) classique.
  -- Pour 8 → (1v8)(4v5)(3v6)(2v7) ; pour 4 → (1v4)(2v3).
  v_pair_a := null;
  v_pair_a_deck := null;
  v_pos := 0;
  for v_seeded in
    select e.user_id, e.deck_id, e.seed
    from public.tcg_tournament_entries e
    where e.tournament_id = p_tournament_id
    order by case
      when v_t.size = 8 then array[1,8,4,5,3,6,2,7]
      when v_t.size = 4 then array[1,4,2,3]
    end[e.seed]
  loop
    if v_pair_a is null then
      v_pair_a := v_seeded.user_id;
      v_pair_a_deck := v_seeded.deck_id;
    else
      insert into public.tcg_tournament_matches (
        tournament_id, round, bracket_position,
        player_a, player_b, deck_a_id, deck_b_id, status
      ) values (
        p_tournament_id, 1, v_pos,
        v_pair_a, v_seeded.user_id,
        v_pair_a_deck, v_seeded.deck_id, 'pending'
      );
      v_pos := v_pos + 1;
      v_pair_a := null;
      v_pair_a_deck := null;
    end if;
  end loop;

  update public.tcg_tournaments
  set status = 'running', started_at = now()
  where id = p_tournament_id;
  return true;
end;
$$;

-- ─── 8) RPC : report_match_result ─────────────────────────────────────
-- L'un des deux joueurs déclare le gagnant. Si la branche suivante existe,
-- on y place le gagnant ; sinon on crée le match du round suivant.
create or replace function public.report_match_result(
  p_match_id uuid,
  p_winner_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_match record;
  v_t record;
  v_next_round int;
  v_next_pos int;
  v_next record;
  v_total_round_matches int;
  v_round_done int;
  v_other uuid;
  v_other_deck uuid;
  v_winner_deck uuid;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  select * into v_match from public.tcg_tournament_matches where id = p_match_id for update;
  if v_match is null then
    raise exception 'Match introuvable';
  end if;
  if v_user_id <> v_match.player_a and v_user_id <> v_match.player_b then
    raise exception 'Tu n''es pas dans ce match';
  end if;
  if p_winner_id <> v_match.player_a and p_winner_id <> v_match.player_b then
    raise exception 'Gagnant invalide';
  end if;
  if v_match.status = 'done' then
    raise exception 'Match déjà terminé';
  end if;

  select * into v_t from public.tcg_tournaments where id = v_match.tournament_id;
  if v_t.status <> 'running' then
    raise exception 'Tournoi non en cours';
  end if;

  -- Détermine le deck du gagnant pour le round suivant.
  if p_winner_id = v_match.player_a then
    v_winner_deck := v_match.deck_a_id;
  else
    v_winner_deck := v_match.deck_b_id;
  end if;

  update public.tcg_tournament_matches
  set winner_id = p_winner_id,
      status = 'done',
      reported_by = v_user_id,
      reported_at = now(),
      finished_at = now()
  where id = p_match_id;

  -- Met à jour le placement du perdant : pos = position du round courant
  -- (ex round 1 → top size/2 + 1 ; round 2 → 3-4 ; round 3 → 2)
  -- Pour la simplicité : on note le placement = "perdu au round X".
  v_other := case when p_winner_id = v_match.player_a then v_match.player_b else v_match.player_a end;
  update public.tcg_tournament_entries
  set placement = case
    when v_t.size = 8 and v_match.round = 1 then 5  -- élimination quart → top 5-8
    when v_t.size = 8 and v_match.round = 2 then 3  -- élimination demi → top 3-4
    when v_t.size = 8 and v_match.round = 3 then 2  -- finaliste → 2
    when v_t.size = 4 and v_match.round = 1 then 3  -- élimination demi → top 3-4
    when v_t.size = 4 and v_match.round = 2 then 2
    else placement
  end
  where tournament_id = v_match.tournament_id and user_id = v_other;

  -- Vérifie si tous les matches du round actuel sont done → progression.
  select count(*) into v_total_round_matches
  from public.tcg_tournament_matches
  where tournament_id = v_match.tournament_id and round = v_match.round;
  select count(*) into v_round_done
  from public.tcg_tournament_matches
  where tournament_id = v_match.tournament_id and round = v_match.round and status = 'done';

  if v_round_done = v_total_round_matches then
    if v_total_round_matches = 1 then
      -- C'était la finale.
      update public.tcg_tournament_entries
      set placement = 1
      where tournament_id = v_match.tournament_id and user_id = p_winner_id;
      update public.tcg_tournaments
      set status = 'finished',
          winner_id = p_winner_id,
          finished_at = now()
      where id = v_match.tournament_id;

      -- Distribue le cashprize : winner = 60%, finaliste = 25%, demis = 7.5% chacun.
      perform public._distribute_tournament_prizes(v_match.tournament_id);
    else
      -- Génère les matches du round suivant en pairant les gagnants
      -- selon bracket_position (gagnants pos 0+1 → next pos 0, etc.).
      v_next_round := v_match.round + 1;
      insert into public.tcg_tournament_matches (
        tournament_id, round, bracket_position,
        player_a, player_b, deck_a_id, deck_b_id, status
      )
      select
        v_match.tournament_id,
        v_next_round,
        floor(m1.bracket_position / 2)::int,
        m1.winner_id, m2.winner_id,
        case when m1.winner_id = m1.player_a then m1.deck_a_id else m1.deck_b_id end,
        case when m2.winner_id = m2.player_a then m2.deck_a_id else m2.deck_b_id end,
        'pending'
      from public.tcg_tournament_matches m1
      join public.tcg_tournament_matches m2
        on m2.tournament_id = m1.tournament_id
       and m2.round = m1.round
       and m2.bracket_position = m1.bracket_position + 1
      where m1.tournament_id = v_match.tournament_id
        and m1.round = v_match.round
        and m1.bracket_position % 2 = 0
      on conflict do nothing;
    end if;
  end if;

  return true;
end;
$$;

-- ─── 9) Helper : distribue le cashprize ───────────────────────────────
create or replace function public._distribute_tournament_prizes(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t record;
  v_winner uuid;
  v_runner_up uuid;
  v_demis uuid[];
  v_demis_n int;
  v_gold_w int;
  v_gold_r int;
  v_gold_d int;
  v_packs_w int;
  v_packs_r int;
  v_packs_d int;
  v_user uuid;
begin
  select * into v_t from public.tcg_tournaments where id = p_tournament_id;
  if v_t.size = 8 then
    v_gold_w := floor(v_t.prize_gold * 0.60);
    v_gold_r := floor(v_t.prize_gold * 0.25);
    v_gold_d := floor(v_t.prize_gold * 0.075);
    v_packs_w := floor(v_t.prize_packs * 0.60);
    v_packs_r := floor(v_t.prize_packs * 0.25);
    v_packs_d := floor(v_t.prize_packs * 0.075);
  else  -- size = 4
    v_gold_w := floor(v_t.prize_gold * 0.70);
    v_gold_r := floor(v_t.prize_gold * 0.20);
    v_gold_d := floor(v_t.prize_gold * 0.05);
    v_packs_w := floor(v_t.prize_packs * 0.70);
    v_packs_r := floor(v_t.prize_packs * 0.20);
    v_packs_d := floor(v_t.prize_packs * 0.05);
  end if;

  select user_id into v_winner
  from public.tcg_tournament_entries
  where tournament_id = p_tournament_id and placement = 1;
  select user_id into v_runner_up
  from public.tcg_tournament_entries
  where tournament_id = p_tournament_id and placement = 2;

  if v_winner is not null then
    update public.profiles
    set gold = coalesce(gold, 0) + v_gold_w,
        tcg_free_packs = jsonb_set(
          coalesce(tcg_free_packs, '{}'::jsonb),
          array[v_t.game_id],
          to_jsonb(coalesce((tcg_free_packs->>v_t.game_id)::int, 0) + v_packs_w)
        ),
        updated_at = now()
    where id = v_winner;
  end if;
  if v_runner_up is not null then
    update public.profiles
    set gold = coalesce(gold, 0) + v_gold_r,
        tcg_free_packs = jsonb_set(
          coalesce(tcg_free_packs, '{}'::jsonb),
          array[v_t.game_id],
          to_jsonb(coalesce((tcg_free_packs->>v_t.game_id)::int, 0) + v_packs_r)
        ),
        updated_at = now()
    where id = v_runner_up;
  end if;

  for v_user in
    select user_id from public.tcg_tournament_entries
    where tournament_id = p_tournament_id and placement = 3
  loop
    update public.profiles
    set gold = coalesce(gold, 0) + v_gold_d,
        tcg_free_packs = jsonb_set(
          coalesce(tcg_free_packs, '{}'::jsonb),
          array[v_t.game_id],
          to_jsonb(coalesce((tcg_free_packs->>v_t.game_id)::int, 0) + v_packs_d)
        ),
        updated_at = now()
    where id = v_user;
  end loop;
end;
$$;

-- ─── 10) RPC : list_tournaments ───────────────────────────────────────
create or replace function public.list_tournaments(
  p_game_id text,
  p_status text default null
) returns table (
  id uuid,
  name text,
  game_id text,
  created_by uuid,
  creator_username text,
  size int,
  status text,
  prize_gold int,
  prize_packs int,
  winner_id uuid,
  winner_username text,
  entries_count int,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    t.id, t.name, t.game_id, t.created_by,
    pc.username as creator_username,
    t.size, t.status, t.prize_gold, t.prize_packs,
    t.winner_id, pw.username as winner_username,
    (select count(*)::int from public.tcg_tournament_entries where tournament_id = t.id) as entries_count,
    t.created_at
  from public.tcg_tournaments t
  left join public.profiles pc on pc.id = t.created_by
  left join public.profiles pw on pw.id = t.winner_id
  where t.game_id = p_game_id
    and (p_status is null or t.status = p_status)
  order by
    case t.status when 'running' then 0 when 'open' then 1 else 2 end,
    t.created_at desc
  limit 50;
$$;

-- ─── 11) Grants ───────────────────────────────────────────────────────
grant execute on function public.create_tournament(text, text, int, int, int) to authenticated;
grant execute on function public.join_tournament(uuid, uuid) to authenticated;
grant execute on function public.leave_tournament(uuid) to authenticated;
grant execute on function public.start_tournament(uuid) to authenticated;
grant execute on function public.report_match_result(uuid, uuid) to authenticated;
grant execute on function public.list_tournaments(text, text) to authenticated, anon;
revoke execute on function public._distribute_tournament_prizes(uuid) from public, authenticated, anon;
