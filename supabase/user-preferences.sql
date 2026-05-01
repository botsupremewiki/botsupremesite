-- Préférences utilisateur stockées en JSONB sur profiles.
--
-- Forme : {
--   "notifications_enabled": true,
--   "notifications_trades": true,
--   "notifications_tournaments": true,
--   "notifications_seasons": true,
--   "sounds_enabled": true,
--   "compact_mode": false,
--   ...
-- }
--
-- Run après les migrations existantes.
-- ──────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;

-- RPC simple pour update partiel des préférences (merge JSONB).
create or replace function public.set_my_preferences(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_new jsonb;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  update public.profiles
  set preferences = coalesce(preferences, '{}'::jsonb) || p_patch,
      updated_at = now()
  where id = v_user_id
  returning preferences into v_new;
  return v_new;
end;
$$;

grant execute on function public.set_my_preferences(jsonb) to authenticated;
