-- Champion d'arène Pokemon TCG : 7 arènes (1 par jour de semaine).
-- Chaque arène vaincue donne :
--   • Un badge permanent (1 par arène distincte, max 7 badges au total)
--   • +1 booster gratuit (UNE FOIS par arène par jour, reset à minuit UTC)
--
-- Run après supabase/profiles-complete-idempotent.sql.
-- Safe à re-exécuter : `if not exists` + `create or replace`.
-- ──────────────────────────────────────────────────────────────────────

-- 1) Table : badges d'arène possédés (1 ligne par arène vaincue au moins
--    une fois). Pas de timestamp last_won car le reward "1 fois par jour"
--    est tracké séparément.
create table if not exists public.tcg_arena_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  arena_id text not null,
  first_won_at timestamptz not null default now(),
  primary key (user_id, arena_id)
);

create index if not exists tcg_arena_badges_user_idx
  on public.tcg_arena_badges (user_id);

alter table public.tcg_arena_badges enable row level security;

drop policy if exists "tcg_arena_badges_read_own" on public.tcg_arena_badges;
create policy "tcg_arena_badges_read_own"
  on public.tcg_arena_badges for select
  using (auth.uid() = user_id);

-- Lecture publique des badges : utilisé par les profils publics pour
-- afficher les badges d'un autre joueur.
drop policy if exists "tcg_arena_badges_read_public" on public.tcg_arena_badges;
create policy "tcg_arena_badges_read_public"
  on public.tcg_arena_badges for select
  using (true);

-- 2) Table : tracking quotidien des wins d'arène (pour cap reward 1/jour).
create table if not exists public.tcg_arena_daily_wins (
  user_id uuid not null references auth.users(id) on delete cascade,
  arena_id text not null,
  win_date date not null default current_date,
  rewarded boolean not null default false,
  primary key (user_id, arena_id, win_date)
);

create index if not exists tcg_arena_daily_wins_idx
  on public.tcg_arena_daily_wins (user_id, win_date);

alter table public.tcg_arena_daily_wins enable row level security;

drop policy if exists "tcg_arena_daily_wins_read_own" on public.tcg_arena_daily_wins;
create policy "tcg_arena_daily_wins_read_own"
  on public.tcg_arena_daily_wins for select
  using (auth.uid() = user_id);

-- 3) RPC : enregistre une victoire d'arène. Crédite badge + booster
--    SI première victoire de l'arène DU JOUR.
--    p_arena_id : "arena-grass", "arena-fire", etc.
--    Retourne { badge_unlocked: bool, pack_granted: bool }
create or replace function public.record_arena_win(p_arena_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_already_today boolean;
  v_badge_new boolean := false;
  v_current_packs jsonb;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;

  -- Check si déjà gagné aujourd'hui (sur la même arène).
  select exists (
    select 1 from public.tcg_arena_daily_wins
    where user_id = v_user_id
      and arena_id = p_arena_id
      and win_date = current_date
      and rewarded = true
  ) into v_already_today;

  if v_already_today then
    -- Déjà récompensé aujourd'hui : on enregistre juste la win mais pas
    -- de reward.
    insert into public.tcg_arena_daily_wins (user_id, arena_id, win_date, rewarded)
    values (v_user_id, p_arena_id, current_date, false)
    on conflict (user_id, arena_id, win_date) do nothing;
    return jsonb_build_object(
      'badge_unlocked', false,
      'pack_granted', false,
      'reason', 'already_rewarded_today'
    );
  end if;

  -- Première win du jour : insère badge si pas déjà acquis.
  insert into public.tcg_arena_badges (user_id, arena_id)
  values (v_user_id, p_arena_id)
  on conflict (user_id, arena_id) do nothing;
  -- get diagnostics row_count = 1 → badge nouveau.
  get diagnostics v_badge_new = row_count;

  -- Insère la win du jour comme rewarded (override si déjà row not-rewarded).
  insert into public.tcg_arena_daily_wins (user_id, arena_id, win_date, rewarded)
  values (v_user_id, p_arena_id, current_date, true)
  on conflict (user_id, arena_id, win_date) do update
    set rewarded = true;

  -- Crédite +1 booster gratuit Pokemon. Le booster est de type "free"
  -- (le joueur choisit son pack quand il l'ouvre, comme le tuto).
  select coalesce(tcg_free_packs, '{}'::jsonb)
  into v_current_packs
  from public.profiles
  where id = v_user_id;
  update public.profiles
  set tcg_free_packs = jsonb_set(
        v_current_packs,
        array['pokemon'],
        to_jsonb(coalesce((v_current_packs->>'pokemon')::int, 0) + 1),
        true
      ),
      updated_at = now()
  where id = v_user_id;

  return jsonb_build_object(
    'badge_unlocked', v_badge_new,
    'pack_granted', true,
    'arena_id', p_arena_id
  );
end;
$$;

-- 4) RPC : liste les badges d'arène d'un user (par défaut soi-même).
--    Public — utilisé par les profils.
create or replace function public.list_arena_badges(p_user_id uuid default null)
returns table (
  arena_id text,
  first_won_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select arena_id, first_won_at
  from public.tcg_arena_badges
  where user_id = coalesce(p_user_id, auth.uid())
  order by first_won_at asc;
$$;

-- 5) RPC : status du jour pour l'arène donnée. Permet au client de
--    savoir s'il a déjà gagné aujourd'hui (= bouton "Combattre" disabled).
create or replace function public.arena_today_status(p_arena_id text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'badge_owned', exists (
      select 1 from public.tcg_arena_badges
      where user_id = auth.uid() and arena_id = p_arena_id
    ),
    'won_today', exists (
      select 1 from public.tcg_arena_daily_wins
      where user_id = auth.uid()
        and arena_id = p_arena_id
        and win_date = current_date
        and rewarded = true
    )
  );
$$;

grant execute on function public.record_arena_win(text) to authenticated;
grant execute on function public.list_arena_badges(uuid) to authenticated;
grant execute on function public.arena_today_status(text) to authenticated;
