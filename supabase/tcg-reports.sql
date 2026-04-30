-- Site Ultime : système de signalement (anti-cheat / toxic / autre).
--
-- Concept simple :
--  • N'importe quel user peut signaler un autre user (ou un match) avec
--    une raison + commentaire libre.
--  • Rate-limit : max 5 signalements par user par jour.
--  • Pas de modération automatique : c'est une queue à traiter par
--    l'admin via le SQL Editor (select * from reports order by created_at desc).
--
-- Utilisable cross-jeux (pas spécifique TCG). Run après tcg-battles.sql.
-- ──────────────────────────────────────────────────────────────────────

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,                        -- 'cheat' | 'toxic' | 'spam' | 'other'
  context_kind text,                           -- 'tcg_match' | 'chat' | 'trade' | null
  context_id text,                             -- id de l'élément concerné (battle_history.id, trade.id…)
  comment text,                                -- texte libre court
  status text not null default 'open' check (status in ('open','reviewed','dismissed','actioned')),
  reviewed_at timestamptz,
  reviewer_note text,
  created_at timestamptz not null default now()
);
create index if not exists user_reports_target_idx
  on public.user_reports (target_id, created_at desc);
create index if not exists user_reports_status_idx
  on public.user_reports (status, created_at desc);

alter table public.user_reports enable row level security;
-- Le reporter peut lire ses propres signalements (pour avoir un feedback).
drop policy if exists "user_reports_read_own" on public.user_reports;
create policy "user_reports_read_own"
  on public.user_reports for select
  using (auth.uid() = reporter_id);

-- ─── RPC : create_report ──────────────────────────────────────────────
create or replace function public.create_user_report(
  p_target_id uuid,
  p_reason text,
  p_context_kind text default null,
  p_context_id text default null,
  p_comment text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today_count int;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  if v_user_id = p_target_id then
    raise exception 'Tu ne peux pas te signaler toi-même';
  end if;
  if p_reason not in ('cheat', 'toxic', 'spam', 'other') then
    raise exception 'Raison invalide';
  end if;

  -- Rate limit : max 5 par jour.
  select count(*) into v_today_count
  from public.user_reports
  where reporter_id = v_user_id
    and created_at >= (now() at time zone 'utc')::date;
  if v_today_count >= 5 then
    raise exception 'Limite atteinte (5 signalements / jour)';
  end if;

  -- Anti-doublon : pas plus d'1 signalement actif par user×target×kind.
  if exists (
    select 1 from public.user_reports
    where reporter_id = v_user_id
      and target_id = p_target_id
      and status = 'open'
      and created_at > now() - interval '7 days'
  ) then
    raise exception 'Tu as déjà signalé ce joueur récemment';
  end if;

  insert into public.user_reports (
    reporter_id, target_id, reason, context_kind, context_id, comment
  ) values (
    v_user_id, p_target_id,
    p_reason,
    p_context_kind,
    p_context_id,
    nullif(trim(coalesce(p_comment, '')), '')
  ) returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_user_report(uuid, text, text, text, text) to authenticated;
