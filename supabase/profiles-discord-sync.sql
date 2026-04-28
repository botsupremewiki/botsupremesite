-- Synchronisation Discord (Chunk A : nicknames, Chunk B : rôles).
--
-- On stocke à part le pseudo serveur et le nom global Discord pour que le
-- site puisse :
--   1. Afficher en priorité le nick serveur quand il existe
--   2. Retomber sur le nom global Discord sinon
--   3. Garder une trace du dernier sync pour invalider si besoin
--
-- Le champ `username` reste la source de vérité pour le reste du site
-- (chat, plaza, classements) — il est mis à jour à chaque login pour
-- refléter `discord_nick ?? discord_global_name ?? username`.
--
-- `discord_roles` stocke les IDs de rôles Discord du joueur. Le mapping
-- ID → fonctionnalité site (admin, booster, …) vit dans
-- `web/lib/discord-roles.ts`. La colonne `is_admin` reste alimentée
-- automatiquement à partir de l'appartenance au rôle ADMIN, donc plus
-- besoin de la modifier à la main.
--
-- Lance ce script une seule fois dans le SQL editor Supabase.
-- Re-runnable : tous les ALTER sont guardés par `if not exists`.

alter table public.profiles
  add column if not exists discord_id text,
  add column if not exists discord_nick text,
  add column if not exists discord_global_name text,
  add column if not exists discord_roles text[],
  add column if not exists discord_synced_at timestamptz;

-- Index pour pouvoir resync rapidement par Discord ID (l'admin peut
-- déclencher un refresh massif via /admin/sync-roles).
create index if not exists profiles_discord_id_idx
  on public.profiles (discord_id)
  where discord_id is not null;
