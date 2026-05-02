-- TCG Album : likes par user/jeu + accès public à la collection
--
-- Permet aux joueurs de "liker" l'album Pokemon d'un autre joueur
-- (1 like par user par album, toggleable). L'album devient une feature
-- sociale visible depuis le profil.
--
-- Inclut aussi une RPC `get_public_collection` qui contourne le RLS
-- restrictif sur tcg_cards_owned (lisible uniquement par le proprio
-- en RLS direct) — la RPC en `security definer` retourne juste la liste
-- des card_ids ownés (pas les counts détaillés, qui sont privés).
--
-- Run après supabase/tcg.sql et meta-systems.sql.
-- Safe à re-exécuter.
-- ──────────────────────────────────────────────────────────────────────

-- 1) Table : 1 row par (liker, target, game). Toggle = insert/delete.
create table if not exists public.tcg_collection_likes (
  liker_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  liked_at timestamptz not null default now(),
  primary key (liker_id, target_id, game_id),
  -- Empêche le self-like (un joueur qui se like lui-même).
  check (liker_id <> target_id)
);

create index if not exists tcg_collection_likes_target_idx
  on public.tcg_collection_likes (target_id, game_id);

alter table public.tcg_collection_likes enable row level security;

-- Lecture publique : tout le monde peut compter les likes d'un album.
drop policy if exists "tcg_collection_likes_read_all"
  on public.tcg_collection_likes;
create policy "tcg_collection_likes_read_all"
  on public.tcg_collection_likes for select using (true);

-- Les writes passent uniquement par la RPC toggle_collection_like
-- (security definer), donc pas de policy d'insert/update.

-- 2) RPC : toggle un like sur l'album d'un autre joueur.
--    Retourne { liked: bool, total: int } (état après toggle).
create or replace function public.toggle_collection_like(
  p_target_id uuid,
  p_game_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_liker_id uuid := auth.uid();
  v_already_liked boolean;
  v_total int;
begin
  if v_liker_id is null then
    raise exception 'Non authentifié';
  end if;
  if v_liker_id = p_target_id then
    raise exception 'Tu ne peux pas liker ton propre album';
  end if;
  -- Toggle.
  select exists (
    select 1 from public.tcg_collection_likes
    where liker_id = v_liker_id
      and target_id = p_target_id
      and game_id = p_game_id
  ) into v_already_liked;
  if v_already_liked then
    delete from public.tcg_collection_likes
    where liker_id = v_liker_id
      and target_id = p_target_id
      and game_id = p_game_id;
  else
    insert into public.tcg_collection_likes (liker_id, target_id, game_id)
    values (v_liker_id, p_target_id, p_game_id);
  end if;
  -- Compte total après toggle.
  select count(*) into v_total
  from public.tcg_collection_likes
  where target_id = p_target_id and game_id = p_game_id;
  return jsonb_build_object(
    'liked', not v_already_liked,
    'total', v_total
  );
end;
$$;

-- 3) RPC : retourne le statut d'un album du point de vue du caller :
--    { total: int, liked_by_me: bool }. Utilisé pour afficher l'état
--    initial du bouton like.
create or replace function public.get_collection_likes(
  p_target_id uuid,
  p_game_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_total int;
  v_liked boolean := false;
begin
  select count(*) into v_total
  from public.tcg_collection_likes
  where target_id = p_target_id and game_id = p_game_id;
  if v_caller is not null and v_caller <> p_target_id then
    select exists (
      select 1 from public.tcg_collection_likes
      where liker_id = v_caller
        and target_id = p_target_id
        and game_id = p_game_id
    ) into v_liked;
  end if;
  return jsonb_build_object(
    'total', v_total,
    'liked_by_me', v_liked
  );
end;
$$;

-- 4) RPC : retourne la collection PUBLIQUE d'un user (juste les card_ids
--    + counts agrégés). Contourne le RLS restrictif sur tcg_cards_owned.
--    Sert à afficher l'album d'un autre joueur dans la popup profil.
create or replace function public.get_public_collection(
  p_target_id uuid,
  p_game_id text
) returns table (
  card_id text,
  count int
)
language sql
security definer
set search_path = public
as $$
  select card_id, count
  from public.tcg_cards_owned
  where user_id = p_target_id
    and game_id = p_game_id
    and count > 0
  order by card_id asc;
$$;

grant execute on function public.toggle_collection_like(uuid, text) to authenticated;
grant execute on function public.get_collection_likes(uuid, text) to authenticated, anon;
grant execute on function public.get_public_collection(uuid, text) to authenticated, anon;
