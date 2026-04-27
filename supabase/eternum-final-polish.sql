-- Eternum FINAL POLISH : équipement power, notifications, achievements,
-- onboarding. Idempotent.

-- ──────────────────────────────────────────────────────────────────────
-- 1) ÉQUIPEMENT — power inclut les items équipés.
-- Multiplicateur par rareté (sans avoir à connaître chaque item individuellement).
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.eternum_player_power(p_user_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  hero_lv int;
  team_total bigint := 0;
  items_bonus bigint := 0;
begin
  select level into hero_lv from public.eternum_heroes where user_id = p_user_id;
  if hero_lv is null then return 0; end if;

  team_total := hero_lv * 100;

  select team_total + coalesce(sum(level * 50), 0) into team_total
  from public.eternum_familiers_owned
  where user_id = p_user_id and team_slot is not null;

  -- Bonus items équipés sur le héros : selon rareté extraite du item_id
  -- (format: "{class}-{rarity}-{slot}" ex: "warrior-rare-helmet")
  select items_bonus + coalesce(sum(case
    when item_id like '%-prismatic-%' then 800
    when item_id like '%-legendary-%' then 400
    when item_id like '%-epic-%' then 200
    when item_id like '%-rare-%' then 100
    when item_id like '%-common-%' then 50
    else 0
  end), 0) into items_bonus
  from public.eternum_items_owned
  where user_id = p_user_id and equipped_on_hero = true;

  -- Bonus items sur familiers actifs (50% du bonus, car équipés sur fams).
  select items_bonus + coalesce(sum(case
    when item_id like '%-prismatic-%' then 400
    when item_id like '%-legendary-%' then 200
    when item_id like '%-epic-%' then 100
    when item_id like '%-rare-%' then 50
    when item_id like '%-common-%' then 25
    else 0
  end), 0) into items_bonus
  from public.eternum_items_owned i
  where i.user_id = p_user_id
    and i.equipped_on_familier in (
      select id from public.eternum_familiers_owned
      where user_id = p_user_id and team_slot is not null
    );

  return team_total + items_bonus;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 2) NOTIFICATIONS — table + RPCs.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,            -- "friend_request" | "friend_accept" | "quest_complete" | "achievement_unlocked" | "guild_invite" | "pvp_attacked" | "system"
  title text not null,
  body text,
  link text,                     -- URL optionnelle pour cliquer
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;
drop policy if exists "notifications_read_own" on public.notifications;
create policy "notifications_read_own" on public.notifications
  for select using (auth.uid() = user_id);

create or replace function public.notify(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text default null,
  p_link text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, title, body, link)
  values (p_user_id, p_kind, p_title, p_body, p_link);
end;
$$;

create or replace function public.notifications_mark_read(
  p_ids uuid[]
) returns void language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return; end if;
  update public.notifications
  set read_at = now()
  where user_id = caller and (id = any(p_ids) or p_ids is null);
end;
$$;

create or replace function public.notifications_mark_all_read()
returns void language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return; end if;
  update public.notifications set read_at = now()
  where user_id = caller and read_at is null;
end;
$$;

-- Hook : friend request → notification.
create or replace function public.eternum_friend_request(p_target uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  caller_name text;
begin
  if caller is null or caller = p_target then return false; end if;
  insert into public.eternum_friendships (user_a, user_b) values (caller, p_target)
  on conflict (user_a, user_b) do nothing;
  if found then
    select username into caller_name from public.profiles where id = caller;
    perform public.notify(
      p_target, 'friend_request',
      caller_name || ' veut être ton ami',
      'Va dans Eternum > Social > Amis pour répondre.',
      '/play/rpg/social'
    );
  end if;
  return true;
end;
$$;

create or replace function public.eternum_friend_accept(p_requester uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  caller_name text;
begin
  if caller is null then return false; end if;
  update public.eternum_friendships set status = 'accepted'
  where user_a = p_requester and user_b = caller;
  if found then
    select username into caller_name from public.profiles where id = caller;
    perform public.notify(
      p_requester, 'friend_accept',
      caller_name || ' a accepté ton invitation',
      null, '/play/rpg/social'
    );
  end if;
  return true;
end;
$$;

-- Hook : quête claim → notification.
create or replace function public.eternum_quest_claim(
  p_quest_id text,
  p_required int,
  p_os_reward bigint,
  p_xp_reward bigint
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cur int;
  done timestamptz;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  select progress, claimed_at into cur, done
  from public.eternum_quest_progress
  where user_id = caller and quest_id = p_quest_id for update;
  if cur is null then return jsonb_build_object('ok', false, 'error', 'Aucun progrès.'); end if;
  if done is not null then return jsonb_build_object('ok', false, 'error', 'Déjà claim.'); end if;
  if cur < p_required then return jsonb_build_object('ok', false, 'error', 'Pas terminée.'); end if;
  update public.eternum_quest_progress set claimed_at = now()
  where user_id = caller and quest_id = p_quest_id;
  update public.profiles set gold = gold + p_os_reward, updated_at = now() where id = caller;
  update public.eternum_heroes set xp = xp + p_xp_reward, updated_at = now() where user_id = caller;
  perform public.notify(
    caller, 'quest_complete',
    'Quête complétée : ' || p_quest_id,
    '+' || p_os_reward || ' OS · +' || p_xp_reward || ' XP',
    '/play/rpg/personnage/quetes'
  );
  return jsonb_build_object('ok', true, 'os_gained', p_os_reward, 'xp_gained', p_xp_reward);
end;
$$;

-- Hook : PvP attaqué → notification au défenseur.
create or replace function public.eternum_attempt_pvp(
  p_defender_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  caller_name text;
  a_pwr int; d_pwr int;
  a_elo int; d_elo int;
  k int := 32;
  exp_a numeric; a_score numeric;
  a_new int; d_new int;
  winner uuid;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if caller = p_defender_id then return jsonb_build_object('ok', false, 'error', 'Tu ne peux pas te défier toi-même.'); end if;

  a_pwr := public.eternum_player_power(caller);
  d_pwr := public.eternum_player_power(p_defender_id);
  if a_pwr <= 0 or d_pwr <= 0 then return jsonb_build_object('ok', false, 'error', 'Joueur sans héros/équipe.'); end if;

  declare a_roll numeric := a_pwr * (0.85 + random() * 0.30);
          d_roll numeric := d_pwr * (0.85 + random() * 0.30);
  begin
    winner := case when a_roll >= d_roll then caller else p_defender_id end;
  end;

  select pvp_elo into a_elo from public.eternum_heroes where user_id = caller for update;
  select pvp_elo into d_elo from public.eternum_heroes where user_id = p_defender_id for update;

  exp_a := 1.0 / (1.0 + power(10.0, (d_elo - a_elo) / 400.0));
  a_score := case when winner = caller then 1 else 0 end;
  a_new := a_elo + round(k * (a_score - exp_a));
  d_new := d_elo + round(k * ((1 - a_score) - (1 - exp_a)));

  update public.eternum_heroes set pvp_elo = greatest(0, a_new) where user_id = caller;
  update public.eternum_heroes set pvp_elo = greatest(0, d_new) where user_id = p_defender_id;
  insert into public.eternum_pvp_matches (
    attacker_id, defender_id, winner_id,
    attacker_elo_before, attacker_elo_after,
    defender_elo_before, defender_elo_after
  ) values (caller, p_defender_id, winner, a_elo, a_new, d_elo, d_new);

  -- Notif au défenseur
  select username into caller_name from public.profiles where id = caller;
  perform public.notify(
    p_defender_id, 'pvp_attacked',
    caller_name || ' t''a attaqué en PvP',
    case when winner = p_defender_id then 'Tu as gagné ! ELO ' || d_elo || ' → ' || d_new
         else 'Tu as perdu. ELO ' || d_elo || ' → ' || d_new end,
    '/play/rpg/combats/pvp'
  );

  if winner = caller then
    perform public.eternum_pass_grant_xp(100);
    perform public.eternum_quest_progress('weekly-pvp', 1);
  else
    perform public.eternum_pass_grant_xp(40);
  end if;

  return jsonb_build_object(
    'ok', true,
    'won', winner = caller,
    'attacker_elo_after', greatest(0, a_new),
    'defender_elo_after', greatest(0, d_new),
    'attacker_power', a_pwr,
    'defender_power', d_pwr
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 3) ACHIEVEMENTS — système cross-jeux (Casino, Eternum, Imperium, Skyline).
-- Catalogue côté shared/, progression DB.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.achievements_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  progress bigint not null default 0,
  unlocked_at timestamptz,
  primary key (user_id, achievement_id)
);

alter table public.achievements_progress enable row level security;
drop policy if exists "achievements_read_own" on public.achievements_progress;
create policy "achievements_read_own" on public.achievements_progress
  for select using (auth.uid() = user_id);

create or replace function public.achievement_progress(
  p_achievement_id text,
  p_amount int,
  p_required int,
  p_os_reward bigint default 0
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cur bigint;
  was_unlocked timestamptz;
begin
  if caller is null then return jsonb_build_object('ok', false); end if;
  insert into public.achievements_progress (user_id, achievement_id, progress)
  values (caller, p_achievement_id, p_amount)
  on conflict (user_id, achievement_id) do update
    set progress = public.achievements_progress.progress + p_amount;

  select progress, unlocked_at into cur, was_unlocked
  from public.achievements_progress
  where user_id = caller and achievement_id = p_achievement_id;

  if was_unlocked is null and cur >= p_required then
    update public.achievements_progress
    set unlocked_at = now()
    where user_id = caller and achievement_id = p_achievement_id;
    if p_os_reward > 0 then
      update public.profiles set gold = gold + p_os_reward, updated_at = now() where id = caller;
    end if;
    perform public.notify(
      caller, 'achievement_unlocked',
      'Achievement débloqué !',
      p_achievement_id || ' · +' || p_os_reward || ' OS',
      '/play/profil'
    );
    return jsonb_build_object('ok', true, 'unlocked', true, 'os_gained', p_os_reward);
  end if;

  return jsonb_build_object('ok', true, 'unlocked', false, 'progress', cur);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 4) ONBOARDING — flag "première fois" par feature.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.onboarding_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  steps_done text[] not null default array[]::text[],
  updated_at timestamptz not null default now()
);

alter table public.onboarding_state enable row level security;
drop policy if exists "onboarding_read_own" on public.onboarding_state;
create policy "onboarding_read_own" on public.onboarding_state
  for select using (auth.uid() = user_id);

create or replace function public.onboarding_done(p_step text)
returns void language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return; end if;
  insert into public.onboarding_state (user_id, steps_done)
  values (caller, array[p_step])
  on conflict (user_id) do update
    set steps_done = array(select distinct unnest(public.onboarding_state.steps_done || array[p_step])),
        updated_at = now();
end;
$$;
