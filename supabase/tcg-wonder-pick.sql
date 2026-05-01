-- TCG : Wonder Pick (Pioche Mystère).
--
-- Mécanique inspirée de Pokémon Pocket : tu dépenses un "Cristal de
-- Pioche" pour piocher 1 carte au hasard parmi 5 du dernier booster
-- ouvert par un autre joueur. La carte est ajoutée à ta collection.
--
-- Source du pool : on stocke les 100 derniers packs ouverts (cards[])
-- dans une table dédiée. Insertion via PartyKit après chaque ouverture.
-- Crystals : 1 cristal/match PvP joué (max 10 stock), gain auto via
-- trigger sur battle_history.
--
-- Run après supabase/tcg-battles.sql.
-- ──────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists wonder_pick_crystals int not null default 0;

create table if not exists public.tcg_wonder_pick_pool (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  opener_id uuid references auth.users(id) on delete cascade,
  opener_username text,
  pack_type text,
  cards text[] not null,
  created_at timestamptz not null default now()
);
create index if not exists tcg_wonder_pick_pool_idx
  on public.tcg_wonder_pick_pool (game_id, created_at desc);

alter table public.tcg_wonder_pick_pool enable row level security;
drop policy if exists "tcg_wonder_pick_pool_read_all" on public.tcg_wonder_pick_pool;
create policy "tcg_wonder_pick_pool_read_all"
  on public.tcg_wonder_pick_pool for select using (true);

-- Trigger : crédite +1 cristal au winner d'un match PvP (max 10 stock).
create or replace function public._tcg_wonder_pick_on_battle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- +1 cristal au gagnant.
  update public.profiles
  set wonder_pick_crystals = least(10, coalesce(wonder_pick_crystals, 0) + 1),
      updated_at = now()
  where id = new.winner_id;
  return new;
end;
$$;
drop trigger if exists tcg_wonder_pick_xp_trigger on public.battle_history;
create trigger tcg_wonder_pick_xp_trigger
  after insert on public.battle_history
  for each row execute function public._tcg_wonder_pick_on_battle();

-- Auto-cleanup du pool : on garde les 100 derniers par game_id.
create or replace function public._tcg_wonder_pick_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.tcg_wonder_pick_pool p
  where p.id in (
    select id from public.tcg_wonder_pick_pool
    where game_id = new.game_id
    order by created_at desc
    offset 100
  );
  return new;
end;
$$;
drop trigger if exists tcg_wonder_pick_cleanup_trigger on public.tcg_wonder_pick_pool;
create trigger tcg_wonder_pick_cleanup_trigger
  after insert on public.tcg_wonder_pick_pool
  for each row execute function public._tcg_wonder_pick_cleanup();

-- ─── RPC : wonder_pick_perform ─────────────────────────────────────
-- Pick aléatoire parmi le pool. Coût 1 cristal. Retourne la carte gagnée.
create or replace function public.wonder_pick_perform(p_game_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_crystals int;
  v_pool record;
  v_card text;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  select wonder_pick_crystals into v_crystals
  from public.profiles where id = v_user_id for update;
  if coalesce(v_crystals, 0) <= 0 then
    raise exception 'Pas de cristal de pioche disponible';
  end if;

  -- Sélectionne aléatoirement une entrée du pool (excluant les packs du
  -- user lui-même pour éviter le self-cycling).
  select id, opener_id, opener_username, pack_type, cards
    into v_pool
  from public.tcg_wonder_pick_pool
  where game_id = p_game_id
    and (opener_id is null or opener_id <> v_user_id)
  order by random()
  limit 1;
  if v_pool is null then
    raise exception 'Aucun pack disponible dans le pool. Reviens après quelques ouvertures par d''autres joueurs.';
  end if;

  -- Pick 1 carte au hasard parmi les 5.
  v_card := v_pool.cards[1 + floor(random() * array_length(v_pool.cards, 1))::int];

  -- Crédite la carte dans la collection.
  insert into public.tcg_cards_owned (user_id, game_id, card_id, count)
  values (v_user_id, p_game_id, v_card, 1)
  on conflict (user_id, game_id, card_id) do update
    set count = public.tcg_cards_owned.count + 1;

  -- Décrémente cristal.
  update public.profiles
  set wonder_pick_crystals = wonder_pick_crystals - 1,
      updated_at = now()
  where id = v_user_id;

  return jsonb_build_object(
    'card_id', v_card,
    'opener_username', v_pool.opener_username,
    'pack_type', v_pool.pack_type,
    'remaining_crystals', v_crystals - 1
  );
end;
$$;

-- ─── RPC : wonder_pick_pool_preview ─────────────────────────────────
-- Liste les 5 packs les plus récents pour donner un aperçu visuel
-- (pas de pick, juste pour la preview de la page).
create or replace function public.wonder_pick_pool_preview(p_game_id text)
returns table (
  id uuid,
  opener_username text,
  pack_type text,
  cards text[],
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, opener_username, pack_type, cards, created_at
  from public.tcg_wonder_pick_pool
  where game_id = p_game_id
    and (opener_id is null or opener_id <> auth.uid())
  order by created_at desc
  limit 5;
$$;

grant execute on function public.wonder_pick_perform(text) to authenticated;
grant execute on function public.wonder_pick_pool_preview(text) to authenticated;
revoke execute on function public._tcg_wonder_pick_on_battle() from public, authenticated, anon;
revoke execute on function public._tcg_wonder_pick_cleanup() from public, authenticated, anon;
