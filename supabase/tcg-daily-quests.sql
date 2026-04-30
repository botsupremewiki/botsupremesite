-- TCG : quêtes journalières par jeu.
--
-- Concept :
--  • Chaque jour (UTC), 5 quêtes sont disponibles par jeu pour chaque
--    joueur. La progression s'incrémente automatiquement via un trigger
--    AFTER INSERT sur battle_history.
--  • Quand le joueur atteint le target, il vient claim sa récompense
--    sur la page Quêtes (/play/tcg/<game>/quests). Récompenses non
--    cumulatives : si tu oublies un jour, tu perds ce jour.
--
-- Run après supabase/tcg-battles.sql.
-- ──────────────────────────────────────────────────────────────────────

-- ─── 1) Table tcg_daily_quest_progress ────────────────────────────────
create table if not exists public.tcg_daily_quest_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  quest_date date not null default (now() at time zone 'utc')::date,
  quest_id text not null,
  progress int not null default 0,
  claimed boolean not null default false,
  claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id, quest_date, quest_id)
);
create index if not exists tcg_daily_quest_progress_user_idx
  on public.tcg_daily_quest_progress (user_id, quest_date);
alter table public.tcg_daily_quest_progress enable row level security;
drop policy if exists "tcg_daily_quest_progress_read_own" on public.tcg_daily_quest_progress;
create policy "tcg_daily_quest_progress_read_own"
  on public.tcg_daily_quest_progress for select
  using (auth.uid() = user_id);

-- ─── 2) Catalogue des quêtes (target + reward) ────────────────────────
-- Returns { target int, gold int, packs int, label text } pour quest_id.
create or replace function public.tcg_quest_definition(p_quest_id text)
returns jsonb
language sql
immutable
as $$
  select case p_quest_id
    when 'play_3'         then jsonb_build_object('target', 3, 'gold', 100, 'packs', 0, 'label', 'Joue 3 matchs PvP')
    when 'play_5'         then jsonb_build_object('target', 5, 'gold', 200, 'packs', 0, 'label', 'Joue 5 matchs PvP')
    when 'win_2'          then jsonb_build_object('target', 2, 'gold', 200, 'packs', 0, 'label', 'Gagne 2 matchs PvP')
    when 'play_1_ranked'  then jsonb_build_object('target', 1, 'gold', 100, 'packs', 0, 'label', 'Joue 1 match classé')
    when 'win_1_ranked'   then jsonb_build_object('target', 1, 'gold', 250, 'packs', 1, 'label', 'Gagne 1 match classé')
    else null
  end;
$$;

-- ─── 3) Helper interne : incrémente progress (idempotent par row) ─────
create or replace function public._tcg_quest_inc(
  p_user_id uuid,
  p_game_id text,
  p_quest_id text,
  p_amount int default 1
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target int;
  v_def jsonb := public.tcg_quest_definition(p_quest_id);
begin
  if v_def is null then return; end if;
  v_target := (v_def->>'target')::int;
  insert into public.tcg_daily_quest_progress (
    user_id, game_id, quest_id, progress
  ) values (
    p_user_id, p_game_id, p_quest_id, least(p_amount, v_target)
  )
  on conflict (user_id, game_id, quest_date, quest_id) do update
    set progress = least(
          public.tcg_daily_quest_progress.progress + p_amount,
          v_target
        ),
        updated_at = now();
end;
$$;

-- ─── 4) Trigger sur battle_history pour incrémenter automatiquement ───
create or replace function public._tcg_quest_on_battle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Compte le match pour les deux joueurs.
  perform public._tcg_quest_inc(new.winner_id, new.game_id, 'play_3', 1);
  perform public._tcg_quest_inc(new.winner_id, new.game_id, 'play_5', 1);
  perform public._tcg_quest_inc(new.loser_id,  new.game_id, 'play_3', 1);
  perform public._tcg_quest_inc(new.loser_id,  new.game_id, 'play_5', 1);
  -- Victoire pour le winner.
  perform public._tcg_quest_inc(new.winner_id, new.game_id, 'win_2', 1);
  -- Spécifique ranked.
  if new.ranked then
    perform public._tcg_quest_inc(new.winner_id, new.game_id, 'play_1_ranked', 1);
    perform public._tcg_quest_inc(new.loser_id,  new.game_id, 'play_1_ranked', 1);
    perform public._tcg_quest_inc(new.winner_id, new.game_id, 'win_1_ranked', 1);
  end if;
  return new;
end;
$$;

drop trigger if exists tcg_quest_battle_trigger on public.battle_history;
create trigger tcg_quest_battle_trigger
  after insert on public.battle_history
  for each row execute function public._tcg_quest_on_battle();

-- ─── 5) RPC : get_my_daily_quests ─────────────────────────────────────
-- Retourne les 5 quêtes du jour avec progression + reward.
create or replace function public.get_my_daily_quests(p_game_id text)
returns table (
  quest_id text,
  label text,
  progress int,
  target int,
  gold int,
  packs int,
  claimed boolean
)
language sql
security definer
set search_path = public
as $$
  with quest_ids(qid) as (values
    ('play_3'), ('play_5'), ('win_2'), ('play_1_ranked'), ('win_1_ranked')
  )
  select
    q.qid as quest_id,
    (public.tcg_quest_definition(q.qid)->>'label')::text as label,
    coalesce(p.progress, 0) as progress,
    (public.tcg_quest_definition(q.qid)->>'target')::int as target,
    (public.tcg_quest_definition(q.qid)->>'gold')::int as gold,
    (public.tcg_quest_definition(q.qid)->>'packs')::int as packs,
    coalesce(p.claimed, false) as claimed
  from quest_ids q
  left join public.tcg_daily_quest_progress p
    on p.user_id = auth.uid()
   and p.game_id = p_game_id
   and p.quest_date = (now() at time zone 'utc')::date
   and p.quest_id = q.qid
  order by case q.qid
    when 'play_3' then 1
    when 'play_5' then 2
    when 'win_2' then 3
    when 'play_1_ranked' then 4
    when 'win_1_ranked' then 5
  end;
$$;

-- ─── 6) RPC : claim_daily_quest ───────────────────────────────────────
create or replace function public.claim_daily_quest(
  p_game_id text,
  p_quest_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_def jsonb := public.tcg_quest_definition(p_quest_id);
  v_progress int;
  v_target int;
  v_gold int;
  v_packs int;
  v_claimed boolean;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  if v_def is null then
    raise exception 'Quête inconnue';
  end if;
  v_target := (v_def->>'target')::int;
  v_gold   := (v_def->>'gold')::int;
  v_packs  := (v_def->>'packs')::int;

  select progress, claimed into v_progress, v_claimed
  from public.tcg_daily_quest_progress
  where user_id = v_user_id
    and game_id = p_game_id
    and quest_date = (now() at time zone 'utc')::date
    and quest_id = p_quest_id
  for update;
  if v_progress is null then
    raise exception 'Aucune progression sur cette quête';
  end if;
  if v_claimed then
    raise exception 'Déjà réclamée';
  end if;
  if v_progress < v_target then
    raise exception 'Quête non terminée (% / %)', v_progress, v_target;
  end if;

  -- Crédite OS et boosters.
  update public.profiles
  set gold = coalesce(gold, 0) + v_gold,
      updated_at = now()
  where id = v_user_id;
  if v_packs > 0 then
    update public.profiles
    set tcg_free_packs = jsonb_set(
      coalesce(tcg_free_packs, '{}'::jsonb),
      array[p_game_id],
      to_jsonb(coalesce((tcg_free_packs->>p_game_id)::int, 0) + v_packs)
    ),
    updated_at = now()
    where id = v_user_id;
  end if;

  update public.tcg_daily_quest_progress
  set claimed = true, claimed_at = now()
  where user_id = v_user_id
    and game_id = p_game_id
    and quest_date = (now() at time zone 'utc')::date
    and quest_id = p_quest_id;

  return jsonb_build_object('gold', v_gold, 'packs', v_packs);
end;
$$;

-- ─── 7) Grants ────────────────────────────────────────────────────────
grant execute on function public.get_my_daily_quests(text) to authenticated;
grant execute on function public.claim_daily_quest(text, text) to authenticated;
revoke execute on function public._tcg_quest_inc(uuid, text, text, int) from public, authenticated, anon;
revoke execute on function public._tcg_quest_on_battle() from public, authenticated, anon;
