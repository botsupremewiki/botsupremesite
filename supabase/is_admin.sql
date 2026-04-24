-- Add an is_admin flag to profiles for role-based UI (ADMIN badge in chat, etc.)
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Example: promote your own account by substituting your uuid
-- (find it in Authentication → Users or via profiles table).
-- update public.profiles set is_admin = true where username = 'rimkidinki';
