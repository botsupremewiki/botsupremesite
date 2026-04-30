-- TCG : decks publics + code de partage.
-- Run après supabase/tcg-decks.sql.
-- ──────────────────────────────────────────────────────────────────────

-- ─── 1) Champs pour le partage ────────────────────────────────────────
alter table public.tcg_decks
  add column if not exists is_public boolean not null default false;
alter table public.tcg_decks
  add column if not exists share_code text;
-- Index pour rechercher rapidement un deck par code (unique parmi les non-null).
create unique index if not exists tcg_decks_share_code_unique
  on public.tcg_decks (share_code) where share_code is not null;
-- Index pour lister les decks publics rapidement.
create index if not exists tcg_decks_public_idx
  on public.tcg_decks (game_id, is_public, updated_at desc) where is_public = true;

-- Policy ajustée : on peut lire ses propres decks OU les decks publics.
drop policy if exists "tcg_decks_read_own" on public.tcg_decks;
drop policy if exists "tcg_decks_read_public_or_own" on public.tcg_decks;
create policy "tcg_decks_read_public_or_own"
  on public.tcg_decks
  for select
  using (auth.uid() = user_id or is_public = true);

-- ─── 2) RPC : génère un code court unique (6 caractères ABCXYZ123) ────
create or replace function public.tcg_generate_share_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- exclut 0/O/1/I/L pour lisibilité
  code text;
  attempt int := 0;
  exists_row int;
begin
  loop
    attempt := attempt + 1;
    code := '';
    for i in 1..6 loop
      code := code || substr(
        alphabet,
        1 + floor(random() * length(alphabet))::int,
        1
      );
    end loop;
    select 1 into exists_row from public.tcg_decks where share_code = code limit 1;
    if exists_row is null then
      return code;
    end if;
    if attempt > 50 then
      raise exception 'Impossible de générer un code unique';
    end if;
  end loop;
end;
$$;

-- ─── 3) RPC : rendre un deck public + récupérer/générer son code ──────
create or replace function public.publish_deck(p_deck_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner uuid;
  v_existing text;
  v_new_code text;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  select user_id, share_code into v_owner, v_existing
  from public.tcg_decks where id = p_deck_id for update;
  if v_owner is null then
    raise exception 'Deck introuvable';
  end if;
  if v_owner != v_user_id then
    raise exception 'Tu n''es pas le propriétaire de ce deck';
  end if;

  if v_existing is null then
    v_new_code := public.tcg_generate_share_code();
  else
    v_new_code := v_existing;
  end if;

  update public.tcg_decks
  set is_public = true,
      share_code = v_new_code,
      updated_at = now()
  where id = p_deck_id;

  return v_new_code;
end;
$$;

-- ─── 4) RPC : repasser un deck en privé (le code reste réservé pour le user) ──
create or replace function public.unpublish_deck(p_deck_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner uuid;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  select user_id into v_owner from public.tcg_decks where id = p_deck_id for update;
  if v_owner is null or v_owner != v_user_id then
    raise exception 'Tu n''es pas le propriétaire de ce deck';
  end if;
  update public.tcg_decks
  set is_public = false, updated_at = now()
  where id = p_deck_id;
  return true;
end;
$$;

-- ─── 5) RPC : importer un deck public via son code ────────────────────
-- Copie le deck dans la collection du user avec un nouveau nom (« Copie de »)
-- et un nouveau id. Ne vérifie PAS que le user possède les cartes — l'import
-- est juste un template, le deck ne sera utilisable en combat que si le
-- user a effectivement les cartes (validé dans handlePlayBasic etc.).
create or replace function public.import_deck_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_source record;
  v_new_id uuid;
  v_new_name text;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  select * into v_source
  from public.tcg_decks
  where share_code = upper(trim(p_code))
    and is_public = true
  limit 1;
  if v_source is null then
    raise exception 'Code invalide ou deck non public';
  end if;

  v_new_name := substring(('Copie de ' || v_source.name) from 1 for 40);

  insert into public.tcg_decks (
    user_id, game_id, name, cards, energy_types, leader_id, regions,
    is_public, share_code
  ) values (
    v_user_id, v_source.game_id, v_new_name, v_source.cards,
    v_source.energy_types, v_source.leader_id, v_source.regions,
    false, null
  ) returning id into v_new_id;

  return v_new_id;
end;
$$;

-- ─── 6) RPC : récupère un deck public par code (pour preview avant import) ──
create or replace function public.get_deck_by_code(p_code text)
returns table (
  id uuid,
  game_id text,
  name text,
  cards jsonb,
  energy_types text[],
  sender_username text
)
language sql
security definer
set search_path = public
as $$
  select d.id, d.game_id, d.name, d.cards, d.energy_types, p.username
  from public.tcg_decks d
  join public.profiles p on p.id = d.user_id
  where d.share_code = upper(trim(p_code))
    and d.is_public = true
  limit 1;
$$;
