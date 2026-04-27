-- IMPERIUM FIX 4 — Étape 5 : profil public + robustesse + tutoriel.
-- Run this in Supabase SQL Editor (idempotent).

-- ══════════════════════════════════════════════════════════════════════
-- 1. PROFIL JOUEUR PUBLIC (lecture combinée profile + villages + alliance + stats)
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.imperium_get_player_profile(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  prof record;
  alliance_id_v uuid;
  alliance_name text; alliance_tag text; alliance_color text; alliance_role text;
  village_count int;
begin
  if p_user_id is null then return null; end if;

  select id, username, avatar_url into prof
    from public.profiles where id = p_user_id;
  if prof.id is null then return null; end if;

  select count(*) into village_count
    from public.imperium_villages where user_id = p_user_id;
  if village_count = 0 then return null; end if;

  select a.id, a.name, a.tag, a.color, am.role
    into alliance_id_v, alliance_name, alliance_tag, alliance_color, alliance_role
    from public.imperium_alliance_members am
    join public.imperium_alliances a on a.id = am.alliance_id
    where am.user_id = p_user_id
    limit 1;

  return jsonb_build_object(
    'user_id', prof.id,
    'username', prof.username,
    'avatar_url', prof.avatar_url,
    'power', public.imperium_compute_power(p_user_id),
    'villages', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'name', v.name, 'x', v.x, 'y', v.y,
        'faction', v.faction, 'is_secondary', v.is_secondary
      )), '[]'::jsonb)
      from public.imperium_villages v where v.user_id = p_user_id
    ),
    'alliance', case when alliance_id_v is not null then jsonb_build_object(
      'id', alliance_id_v, 'name', alliance_name,
      'tag', alliance_tag, 'color', alliance_color, 'role', alliance_role
    ) else null end,
    'stats', coalesce((
      select jsonb_build_object(
        'kills_total', s.kills_total,
        'losses_total', s.losses_total,
        'loot_total', s.loot_total,
        'power_max', s.power_max,
        'oasis_owned', (select count(*) from public.imperium_oasis_ownership oo
          join public.imperium_villages v on v.id = oo.village_id
          where v.user_id = p_user_id)
      )
      from public.imperium_stats s where s.user_id = p_user_id
    ), '{}'::jsonb),
    'achievements_count', (
      select count(*) from public.imperium_achievements where user_id = p_user_id
    ),
    'last_login', (
      select max(last_login) from public.imperium_villages where user_id = p_user_id
    )
  );
end;
$$;
