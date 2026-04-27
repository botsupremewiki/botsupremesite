-- Site Ultime — systèmes "méta" cross-jeux
-- À exécuter une fois dans le SQL editor de Supabase.
-- Crée :
--   • daily_rewards : streak quotidien (1000 × streak, capé à 30 jours)
--   • friendships  : amis cross-jeux (table générique, distincte de
--                     l'ancienne `eternum_friendships` qui reste intacte)
--   • RPCs associés et notifications déclenchées via le système existant

-- ─────────────────────────── Daily reward / streak ───────────────────────────

create table if not exists public.daily_rewards (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_claim_at timestamptz,
  streak_count int not null default 0,
  total_claimed bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.daily_rewards enable row level security;

drop policy if exists "daily_rewards_read_own" on public.daily_rewards;
create policy "daily_rewards_read_own"
  on public.daily_rewards for select
  using (auth.uid() = user_id);

-- Pas de policies INSERT/UPDATE/DELETE : tout passe par les RPCs.

-- Réclamer la récompense du jour. Reward = 1000 × streak (capé à 30).
-- Streak : +1 si claim entre 24h et 48h depuis le dernier ; reset à 1 sinon.
create or replace function public.claim_daily_reward()
returns table(reward bigint, streak int, next_claim_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  last_at timestamptz;
  current_streak int;
  hours_since numeric;
  new_streak int;
  out_reward bigint;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Non authentifié';
  end if;

  -- get-or-create row
  select last_claim_at, streak_count
    into last_at, current_streak
    from daily_rewards where user_id = uid;
  if not found then
    insert into daily_rewards (user_id) values (uid);
    last_at := null;
    current_streak := 0;
  end if;

  if last_at is not null then
    hours_since := extract(epoch from (now() - last_at)) / 3600;
    if hours_since < 24 then
      raise exception 'Récompense déjà réclamée. Reviens dans % h.',
        round(24 - hours_since, 1);
    end if;
    -- streak preservation : 24h-48h depuis le dernier = streak +1.
    -- Au-delà de 48h le streak retombe à 1.
    if hours_since < 48 then
      new_streak := least(current_streak + 1, 30);
    else
      new_streak := 1;
    end if;
  else
    new_streak := 1;
  end if;

  out_reward := new_streak::bigint * 1000;

  update daily_rewards
    set last_claim_at = now(),
        streak_count = new_streak,
        total_claimed = total_claimed + out_reward,
        updated_at = now()
    where user_id = uid;

  update profiles
    set gold = gold + out_reward,
        updated_at = now()
    where id = uid;

  return query select out_reward, new_streak, (now() + interval '24 hours');
end;
$$;

grant execute on function public.claim_daily_reward to authenticated;

-- État du daily reward pour l'UI : peut-on claim, prochain reward, etc.
create or replace function public.daily_reward_status()
returns table(
  can_claim boolean,
  current_streak int,
  next_reward bigint,
  next_claim_at timestamptz,
  total_claimed bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid;
  last_at timestamptz;
  current_streak int;
  total bigint;
  hours_since numeric;
  preview_streak int;
begin
  uid := auth.uid();
  if uid is null then
    return query select true, 0, 1000::bigint, now(), 0::bigint;
    return;
  end if;

  select last_claim_at, streak_count, total_claimed
    into last_at, current_streak, total
    from daily_rewards where user_id = uid;
  if not found then
    return query select true, 0, 1000::bigint, now(), 0::bigint;
    return;
  end if;

  if last_at is null then
    return query select true, 0, 1000::bigint, now(), total;
    return;
  end if;

  hours_since := extract(epoch from (now() - last_at)) / 3600;

  if hours_since < 24 then
    -- Pas claimable. Le prochain reward sera basé sur streak+1 (sauf cap).
    return query select
      false,
      current_streak,
      least(current_streak + 1, 30)::bigint * 1000,
      last_at + interval '24 hours',
      total;
  elsif hours_since < 48 then
    preview_streak := least(current_streak + 1, 30);
    return query select
      true,
      current_streak,
      preview_streak::bigint * 1000,
      now(),
      total;
  else
    -- Streak va se réinitialiser au prochain claim.
    return query select
      true,
      0,
      1000::bigint,
      now(),
      total;
  end if;
end;
$$;

grant execute on function public.daily_reward_status to authenticated;

-- ───────────────────── Friendships (cross-jeux) ─────────────────────
-- Distincte de `eternum_friendships` (qui reste, pour ne pas casser l'existant).
-- Cette table stocke une paire ordonnée (user_a < user_b) avec un statut
-- pending/accepted, et qui est l'auteur de la demande.

create table if not exists public.friendships (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  requester uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create index if not exists friendships_user_a_idx on public.friendships(user_a);
create index if not exists friendships_user_b_idx on public.friendships(user_b);
create index if not exists friendships_status_idx on public.friendships(status);

alter table public.friendships enable row level security;

drop policy if exists "friendships_read_self" on public.friendships;
create policy "friendships_read_self"
  on public.friendships for select
  using (auth.uid() = user_a or auth.uid() = user_b);

-- Pas de write direct : tout passe par les RPCs.

-- Helper : ordonne (u1, u2) en (a < b) pour respecter la PK.
create or replace function public._fp(u1 uuid, u2 uuid)
returns table(a uuid, b uuid)
language sql immutable as $$
  select case when u1 < u2 then u1 else u2 end,
         case when u1 < u2 then u2 else u1 end
$$;

create or replace function public.friend_request(p_target uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pair_a uuid; pair_b uuid; existing text;
begin
  if uid is null then raise exception 'Non authentifié'; end if;
  if p_target = uid then raise exception 'Tu ne peux pas être ami avec toi-même.'; end if;
  if not exists (select 1 from auth.users where id = p_target) then
    raise exception 'Utilisateur introuvable.';
  end if;

  select a, b into pair_a, pair_b from _fp(uid, p_target);
  select status into existing from friendships
    where user_a = pair_a and user_b = pair_b;

  if existing = 'pending' then raise exception 'Demande déjà envoyée.'; end if;
  if existing = 'accepted' then raise exception 'Vous êtes déjà amis.'; end if;

  insert into friendships (user_a, user_b, status, requester)
    values (pair_a, pair_b, 'pending', uid);

  perform notify(
    p_target,
    'friend_request',
    'Demande d''ami',
    coalesce((select username from profiles where id = uid), 'Quelqu''un')
      || ' veut être ton ami.',
    '/play/amis'
  );
end;
$$;
grant execute on function public.friend_request to authenticated;

create or replace function public.friend_accept(p_requester uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pair_a uuid; pair_b uuid;
  current_status text; current_req uuid;
begin
  if uid is null then raise exception 'Non authentifié'; end if;
  select a, b into pair_a, pair_b from _fp(uid, p_requester);
  select status, requester into current_status, current_req from friendships
    where user_a = pair_a and user_b = pair_b;

  if current_status is null then raise exception 'Aucune demande à accepter.'; end if;
  if current_status <> 'pending' then raise exception 'Vous êtes déjà amis.'; end if;
  if current_req <> p_requester then
    raise exception 'Tu ne peux pas accepter ta propre demande.';
  end if;

  update friendships
    set status = 'accepted', accepted_at = now()
    where user_a = pair_a and user_b = pair_b;

  perform notify(
    p_requester,
    'friend_accept',
    'Ami accepté',
    coalesce((select username from profiles where id = uid), 'Quelqu''un')
      || ' a accepté ta demande.',
    '/play/amis'
  );
end;
$$;
grant execute on function public.friend_accept to authenticated;

create or replace function public.friend_decline(p_requester uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pair_a uuid; pair_b uuid;
begin
  if uid is null then raise exception 'Non authentifié'; end if;
  select a, b into pair_a, pair_b from _fp(uid, p_requester);
  delete from friendships
    where user_a = pair_a and user_b = pair_b
      and status = 'pending' and requester = p_requester;
end;
$$;
grant execute on function public.friend_decline to authenticated;

create or replace function public.friend_remove(p_other uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pair_a uuid; pair_b uuid;
begin
  if uid is null then raise exception 'Non authentifié'; end if;
  select a, b into pair_a, pair_b from _fp(uid, p_other);
  delete from friendships where user_a = pair_a and user_b = pair_b;
end;
$$;
grant execute on function public.friend_remove to authenticated;

-- Liste des amis (et demandes) avec infos profil — pour l'UI de la page /amis.
create or replace function public.friend_list()
returns table(
  friend_id uuid,
  username text,
  avatar_url text,
  status text,
  is_outgoing boolean,
  created_at timestamptz
)
language plpgsql security definer set search_path = public stable
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  return query
    select
      case when f.user_a = uid then f.user_b else f.user_a end as friend_id,
      p.username,
      p.avatar_url,
      f.status,
      (f.requester = uid) as is_outgoing,
      f.created_at
    from friendships f
    join profiles p on p.id = (case when f.user_a = uid then f.user_b else f.user_a end)
    where f.user_a = uid or f.user_b = uid
    order by f.status desc, f.created_at desc;
end;
$$;
grant execute on function public.friend_list to authenticated;

-- Compte les demandes d'amis en attente (pour le badge "1" du menu).
create or replace function public.friend_pending_count()
returns int
language sql security definer set search_path = public stable
as $$
  select count(*)::int from friendships
    where status = 'pending'
      and requester <> auth.uid()
      and (user_a = auth.uid() or user_b = auth.uid())
$$;
grant execute on function public.friend_pending_count to authenticated;
