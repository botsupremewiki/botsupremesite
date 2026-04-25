-- Marché de cartes TCG : annonces (listings) + favoris.
-- Run after supabase/tcg.sql.

-- ──────────────────────────────────────────────────────────────────────
-- tcg_card_listings : 1 ligne par carte mise en vente.
-- Quand seller crée une annonce, 1 copie est *décrémentée* de sa
-- collection (escrow simple). Si l'annonce est annulée, la copie
-- revient. Si elle est vendue, elle est créditée à l'acheteur.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.tcg_card_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  card_id text not null,
  price_os bigint not null check (price_os >= 100),
  status text not null default 'active' check (status in ('active', 'sold', 'cancelled')),
  buyer_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists tcg_listings_active_idx
  on public.tcg_card_listings (game_id, status, price_os)
  where status = 'active';
create index if not exists tcg_listings_seller_idx
  on public.tcg_card_listings (seller_id, status, created_at desc);

alter table public.tcg_card_listings enable row level security;

drop policy if exists "listings_read_active" on public.tcg_card_listings;
create policy "listings_read_active"
  on public.tcg_card_listings
  for select
  using (status = 'active');

drop policy if exists "listings_read_own_seller" on public.tcg_card_listings;
create policy "listings_read_own_seller"
  on public.tcg_card_listings
  for select
  using (auth.uid() = seller_id);

drop policy if exists "listings_read_own_buyer" on public.tcg_card_listings;
create policy "listings_read_own_buyer"
  on public.tcg_card_listings
  for select
  using (auth.uid() = buyer_id);

-- ──────────────────────────────────────────────────────────────────────
-- tcg_card_favorites : un user marque des cartes en favoris.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.tcg_card_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  card_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id, card_id)
);

alter table public.tcg_card_favorites enable row level security;

drop policy if exists "favs_read_own" on public.tcg_card_favorites;
create policy "favs_read_own"
  on public.tcg_card_favorites
  for select
  using (auth.uid() = user_id);

drop policy if exists "favs_insert_own" on public.tcg_card_favorites;
create policy "favs_insert_own"
  on public.tcg_card_favorites
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "favs_delete_own" on public.tcg_card_favorites;
create policy "favs_delete_own"
  on public.tcg_card_favorites
  for delete
  using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- create_tcg_listing : décrémente la collection du seller, insère listing.
-- Erreurs PL/pgSQL remontées au client via PostgREST {message:"…"}.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.create_tcg_listing(
  p_game_id text,
  p_card_id text,
  p_price_os bigint
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owned int;
  new_id uuid;
begin
  if caller is null then raise exception 'Connecte-toi pour vendre.'; end if;
  if p_price_os < 100 then raise exception 'Prix minimum : 100 OS.'; end if;

  select count into owned
  from public.tcg_cards_owned
  where user_id = caller and game_id = p_game_id and card_id = p_card_id
  for update;

  if coalesce(owned, 0) < 1 then
    raise exception 'Tu ne possèdes pas cette carte.';
  end if;

  update public.tcg_cards_owned
  set count = count - 1, updated_at = now()
  where user_id = caller and game_id = p_game_id and card_id = p_card_id;

  insert into public.tcg_card_listings (seller_id, game_id, card_id, price_os)
  values (caller, p_game_id, p_card_id, p_price_os)
  returning id into new_id;

  return new_id;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- cancel_tcg_listing : annule, rend la carte au seller.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.cancel_tcg_listing(
  p_listing_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  r record;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;

  select * into r
  from public.tcg_card_listings
  where id = p_listing_id and status = 'active' and seller_id = caller
  for update;
  if not found then return false; end if;

  update public.tcg_card_listings
  set status = 'cancelled', closed_at = now()
  where id = p_listing_id;

  perform public.add_cards_to_tcg_collection(
    caller,
    r.game_id,
    jsonb_build_array(jsonb_build_object('card_id', r.card_id, 'count', 1))
  );

  return true;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- buy_tcg_listing : transaction atomique OS + carte.
-- Retourne {ok, error?, price?} pour message client.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.buy_tcg_listing(
  p_listing_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  r record;
  buyer_gold bigint;
begin
  if caller is null then return jsonb_build_object('ok', false, 'error', 'Connecte-toi.'); end if;

  select * into r
  from public.tcg_card_listings
  where id = p_listing_id and status = 'active'
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Annonce indisponible.');
  end if;
  if r.seller_id = caller then
    return jsonb_build_object('ok', false, 'error', 'C''est ta propre annonce.');
  end if;

  select gold into buyer_gold from public.profiles where id = caller for update;
  if coalesce(buyer_gold, 0) < r.price_os then
    return jsonb_build_object('ok', false, 'error', 'Or Suprême insuffisant.');
  end if;

  update public.profiles set gold = gold - r.price_os, updated_at = now() where id = caller;
  update public.profiles set gold = gold + r.price_os, updated_at = now() where id = r.seller_id;

  perform public.add_cards_to_tcg_collection(
    caller,
    r.game_id,
    jsonb_build_array(jsonb_build_object('card_id', r.card_id, 'count', 1))
  );

  update public.tcg_card_listings
  set status = 'sold', buyer_id = caller, closed_at = now()
  where id = p_listing_id;

  return jsonb_build_object('ok', true, 'price', r.price_os);
end;
$$;
