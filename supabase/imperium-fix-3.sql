-- IMPERIUM FIX 3 — Étape 4 : achats premium cosmétiques + notifs attaques.
-- Run this in Supabase SQL Editor (idempotent).

-- ══════════════════════════════════════════════════════════════════════
-- 1. RENAME VILLAGE (5 000 OS)
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_rename_village(
  p_village_id uuid, p_new_name text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  v record;
  cost int := 5000;
  cur_gold bigint;
  trimmed text;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  trimmed := trim(coalesce(p_new_name, ''));
  if length(trimmed) < 1 or length(trimmed) > 30 then
    raise exception 'Nom invalide (1-30 caractères).';
  end if;
  select * into v from public.imperium_villages where id = p_village_id;
  if v.id is null then raise exception 'Village introuvable.'; end if;
  if v.user_id <> caller then raise exception 'Pas ton village.'; end if;

  select gold into cur_gold from public.profiles where id = caller for update;
  if coalesce(cur_gold, 0) < cost then
    raise exception 'OS insuffisants (% requis).', cost;
  end if;
  update public.profiles set gold = gold - cost, updated_at = now() where id = caller;
  update public.imperium_villages set name = trimmed where id = p_village_id;

  return jsonb_build_object('ok', true, 'os_spent', cost, 'new_name', trimmed);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 2. BANNIÈRE CUSTOM ALLIANCE (50 000 OS, chef uniquement)
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_set_alliance_banner(
  p_alliance_id uuid, p_color text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cost int := 50000;
  cur_gold bigint;
  is_chief boolean;
  embassy_lvl int := 0;
begin
  if caller is null then raise exception 'Connecte-toi.'; end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Couleur invalide (format hex #rrggbb).';
  end if;

  select chief_id = caller into is_chief from public.imperium_alliances
    where id = p_alliance_id;
  if not coalesce(is_chief, false) then
    raise exception 'Réservé au chef d''alliance.';
  end if;

  -- Niveau ambassade chef ≥ 5 requis
  select coalesce(max(b.level), 0) into embassy_lvl
    from public.imperium_villages v
    join public.imperium_buildings b on b.village_id = v.id and b.kind = 'embassy'
    where v.user_id = caller;
  if embassy_lvl < 5 then
    raise exception 'Niveau ambassade 5 requis.';
  end if;

  select gold into cur_gold from public.profiles where id = caller for update;
  if coalesce(cur_gold, 0) < cost then
    raise exception 'OS insuffisants (% requis).', cost;
  end if;
  update public.profiles set gold = gold - cost, updated_at = now() where id = caller;
  update public.imperium_alliances set color = p_color where id = p_alliance_id;

  return jsonb_build_object('ok', true, 'os_spent', cost, 'new_color', p_color);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 3. ATTAQUES ENTRANTES (RLS bypass via security definer)
-- Retourne uniquement les infos non sensibles : kind + arrives_at + coords cible
-- (pas qui attaque ni avec quoi — secret tant que pas arrivé)
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_get_incoming_attacks()
returns table (
  march_id    uuid,
  to_village_id uuid,
  to_x        int,
  to_y        int,
  kind        text,
  arrives_at  timestamptz,
  is_alliance_member boolean  -- true si l'attaquant est dans une alliance alliée (NAP/conf)
) language plpgsql security definer set search_path = public stable as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then return; end if;
  return query
    select m.id, v.id, m.to_x, m.to_y, m.kind, m.arrives_at,
           false as is_alliance_member
    from public.imperium_marches m
    join public.imperium_villages v on v.x = m.to_x and v.y = m.to_y
    where v.user_id = caller
      and m.state = 'outbound'
      and m.kind in ('raid','attack','conquest')
      and m.from_village_id <> v.id
    order by m.arrives_at asc
    limit 20;
end;
$$;
