-- Tracking de l'onboarding global du site (≠ tutoriel TCG qui est par jeu).
--
-- Run après les autres migrations.
-- ──────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

create or replace function public.complete_onboarding()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return; end if;
  update public.profiles
  set onboarded_at = coalesce(onboarded_at, now()),
      updated_at = now()
  where id = v_user_id;
end;
$$;

grant execute on function public.complete_onboarding() to authenticated;
