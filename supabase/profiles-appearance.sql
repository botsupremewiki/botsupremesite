-- Customisation visuelle du personnage de plaza.
-- Stocké en JSONB pour pouvoir étoffer les options sans migration.
-- Les clients qui n'envoient rien utilisent les défauts (couleur attribuée
-- côté serveur PartyKit + skin/cheveux générés depuis cette couleur).

alter table public.profiles
  add column if not exists appearance jsonb;

-- Pas de RLS spécifique : profiles_update_own (déjà en place) couvre la mise
-- à jour, profiles_read_all permet aux autres clients de voir le résultat.
