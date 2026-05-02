-- Friend status RPC : utilisée par la popup profil pour afficher l'état
-- de la relation entre l'user courant et le profil affiché (none /
-- pending_outgoing / pending_incoming / accepted).
--
-- Permet d'afficher le bon bouton :
--   none → "🤝 Demander en ami"
--   pending_outgoing → "⏳ Demande envoyée"
--   pending_incoming → "✓ Accepter la demande"
--   accepted → "Ami ✓"
--
-- Run après supabase/meta-systems.sql.
-- Safe à re-exécuter.
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.friend_status_with(p_target_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_row record;
begin
  if v_self is null or p_target_id is null or v_self = p_target_id then
    return 'self';
  end if;
  -- Cherche la ligne friendships peu importe l'ordre.
  select status, requester into v_row
  from public.friendships
  where (user_a = v_self and user_b = p_target_id)
     or (user_a = p_target_id and user_b = v_self);
  if v_row is null then
    return 'none';
  end if;
  if v_row.status = 'accepted' then
    return 'accepted';
  end if;
  -- pending : déterminer si je suis l'expéditeur ou le destinataire.
  if v_row.requester = v_self then
    return 'pending_outgoing';
  else
    return 'pending_incoming';
  end if;
end;
$$;

grant execute on function public.friend_status_with(uuid) to authenticated;
