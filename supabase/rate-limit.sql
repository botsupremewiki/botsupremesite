-- Rate limit générique : table de tracking + helper RPC.
-- Toute RPC qui veut être rate-limitée appelle `check_rate_limit(...)`
-- au début et raise si dépassé.
--
-- Ex usage dans une RPC :
--   perform check_rate_limit('create_tournament', 5, '1 hour');
--   -- raise si > 5 appels en 1h pour ce user
--
-- Run après les autres migrations.
-- ──────────────────────────────────────────────────────────────────────

create table if not exists public.rate_limit_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  called_at timestamptz not null default now(),
  primary key (user_id, bucket, called_at)
);
create index if not exists rate_limit_log_lookup_idx
  on public.rate_limit_log (user_id, bucket, called_at desc);

-- Pas de RLS : seulement appelé par les RPCs security definer.

create or replace function public.check_rate_limit(
  p_bucket text,
  p_max int,
  p_window interval
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count int;
begin
  if v_user_id is null then return; end if;
  -- Compte les appels récents.
  select count(*) into v_count
  from public.rate_limit_log
  where user_id = v_user_id
    and bucket = p_bucket
    and called_at >= now() - p_window;
  if v_count >= p_max then
    raise exception 'Rate limit dépassé pour "%" (% appels max sur %)',
      p_bucket, p_max, p_window;
  end if;
  -- Enregistre l'appel.
  insert into public.rate_limit_log (user_id, bucket)
  values (v_user_id, p_bucket);
  -- Cleanup : delete les entrées > 24h pour éviter le bloat.
  delete from public.rate_limit_log
  where user_id = v_user_id
    and called_at < now() - interval '24 hours';
end;
$$;

revoke execute on function public.check_rate_limit(text, int, interval) from public, anon;
grant execute on function public.check_rate_limit(text, int, interval) to authenticated;
