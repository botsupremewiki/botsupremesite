-- Profile pins : épingler jusqu'à 3 achievements préférés sur son
-- profil public. Cosmétique, n'impacte pas les stats.
--
-- Run après supabase/eternum-final-polish.sql (qui a créé profiles).
-- ──────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists pinned_achievements text[] not null default '{}'::text[];

create or replace function public.set_pinned_achievements(p_ids text[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  if array_length(p_ids, 1) > 3 then
    raise exception 'Maximum 3 achievements épinglés';
  end if;
  update public.profiles
  set pinned_achievements = coalesce(p_ids, '{}'::text[]),
      updated_at = now()
  where id = v_user_id;
  return true;
end;
$$;

grant execute on function public.set_pinned_achievements(text[]) to authenticated;
