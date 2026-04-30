-- TCG : tracking de la complétion du tutoriel + petite récompense
-- one-shot par game_id (50 OS).
--
-- Run après supabase/tcg.sql.
-- ──────────────────────────────────────────────────────────────────────

create table if not exists public.tcg_tutorial_completion (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
alter table public.tcg_tutorial_completion enable row level security;
drop policy if exists "tcg_tutorial_completion_read_own" on public.tcg_tutorial_completion;
create policy "tcg_tutorial_completion_read_own"
  on public.tcg_tutorial_completion for select
  using (auth.uid() = user_id);

-- RPC : marque le tutoriel comme complété et crédite 50 OS si c'était la
-- première fois pour ce game_id. Idempotent.
create or replace function public.complete_tcg_tutorial(p_game_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_first boolean := false;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  insert into public.tcg_tutorial_completion (user_id, game_id)
  values (v_user_id, p_game_id)
  on conflict (user_id, game_id) do nothing;
  -- Si l'INSERT a réellement créé une ligne (RPC returns affected rows),
  -- crédite 50 OS.
  get diagnostics v_first = row_count;
  if v_first then
    update public.profiles
    set gold = coalesce(gold, 0) + 50,
        updated_at = now()
    where id = v_user_id;
  end if;
  return jsonb_build_object(
    'first_time', v_first,
    'reward_gold', case when v_first then 50 else 0 end
  );
end;
$$;

-- RPC : indique si le user a déjà complété le tutoriel.
create or replace function public.has_completed_tcg_tutorial(p_game_id text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tcg_tutorial_completion
    where user_id = auth.uid() and game_id = p_game_id
  );
$$;

grant execute on function public.complete_tcg_tutorial(text) to authenticated;
grant execute on function public.has_completed_tcg_tutorial(text) to authenticated;
