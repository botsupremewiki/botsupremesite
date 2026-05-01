-- Migration : cosmétiques achetables One Piece TCG.
--
-- Trois catégories :
--   • avatar       : un cardId de Leader OnePiece (équipé sur le profil)
--   • sleeve       : couleur/style des dos de carte (ex. "rouge", "noir-or")
--   • playmat      : background du combat (ex. "default", "pirate-king")
--
-- Tous les cosmétiques sont stockés dans `tcg_cosmetics_owned` et le
-- joueur épingle ses cosmétiques actifs dans `profiles.tcg_cosmetics_active`
-- (jsonb : { avatar: cardId, sleeve: id, playmat: id }).
--
-- À lancer une seule fois dans le SQL editor Supabase. Re-runnable safe.

-- 1. Table de propriété : 1 row par (user, game, cosmetic_type, cosmetic_id).
create table if not exists public.tcg_cosmetics_owned (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  cosmetic_type text not null,  -- 'avatar' | 'sleeve' | 'playmat'
  cosmetic_id text not null,    -- id unique dans son type
  acquired_at timestamptz not null default now(),
  primary key (user_id, game_id, cosmetic_type, cosmetic_id)
);

create index if not exists tcg_cosmetics_user_idx
  on public.tcg_cosmetics_owned (user_id, game_id);

alter table public.tcg_cosmetics_owned enable row level security;

drop policy if exists "tcg_cosmetics_read_own" on public.tcg_cosmetics_owned;
create policy "tcg_cosmetics_read_own"
  on public.tcg_cosmetics_owned
  for select
  using (auth.uid() = user_id);

-- 2. Cosmétiques actifs par joueur (épinglés sur le profil).
alter table public.profiles
  add column if not exists tcg_cosmetics_active jsonb not null default '{}'::jsonb;

-- 3. RPC : achète un cosmétique (déduit gold + INSERT ON CONFLICT DO NOTHING).
create or replace function public.buy_tcg_cosmetic(
  p_user_id uuid,
  p_game_id text,
  p_cosmetic_type text,
  p_cosmetic_id text,
  p_price int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_gold int;
  already_owned boolean;
begin
  if p_price < 0 then
    raise exception 'Prix négatif interdit';
  end if;
  -- Vérifie déjà possédé.
  select exists (
    select 1 from public.tcg_cosmetics_owned
    where user_id = p_user_id
      and game_id = p_game_id
      and cosmetic_type = p_cosmetic_type
      and cosmetic_id = p_cosmetic_id
  ) into already_owned;
  if already_owned then
    return jsonb_build_object('ok', false, 'reason', 'already_owned');
  end if;
  -- Vérifie gold + déduit.
  select coalesce(gold, 0) into current_gold
  from public.profiles
  where id = p_user_id
  for update;
  if current_gold < p_price then
    return jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_gold',
      'gold', current_gold
    );
  end if;
  update public.profiles
  set gold = current_gold - p_price, updated_at = now()
  where id = p_user_id;
  insert into public.tcg_cosmetics_owned (user_id, game_id, cosmetic_type, cosmetic_id)
  values (p_user_id, p_game_id, p_cosmetic_type, p_cosmetic_id);
  return jsonb_build_object(
    'ok', true,
    'gold', current_gold - p_price,
    'cosmetic_type', p_cosmetic_type,
    'cosmetic_id', p_cosmetic_id
  );
end;
$$;

-- 4. RPC : équipe un cosmétique (vérifie possession + update profile).
create or replace function public.equip_tcg_cosmetic(
  p_user_id uuid,
  p_game_id text,
  p_cosmetic_type text,
  p_cosmetic_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owns boolean;
  current_active jsonb;
  game_active jsonb;
begin
  -- Vérifie possession (sauf cosmetic_id "default" qui est gratuit).
  if p_cosmetic_id <> 'default' then
    select exists (
      select 1 from public.tcg_cosmetics_owned
      where user_id = p_user_id
        and game_id = p_game_id
        and cosmetic_type = p_cosmetic_type
        and cosmetic_id = p_cosmetic_id
    ) into owns;
    if not owns then
      return jsonb_build_object('ok', false, 'reason', 'not_owned');
    end if;
  end if;
  -- Lit l'état actuel et update sub-key game_id → type → cosmetic_id.
  select coalesce(tcg_cosmetics_active, '{}'::jsonb) into current_active
  from public.profiles where id = p_user_id for update;
  game_active := coalesce(current_active -> p_game_id, '{}'::jsonb);
  game_active := jsonb_set(game_active, array[p_cosmetic_type], to_jsonb(p_cosmetic_id));
  current_active := jsonb_set(current_active, array[p_game_id], game_active);
  update public.profiles
  set tcg_cosmetics_active = current_active, updated_at = now()
  where id = p_user_id;
  return jsonb_build_object('ok', true, 'active', game_active);
end;
$$;
