-- TCG : formats custom optionnels pour les decks.
--
-- Formats supportés (v1) :
--  • null / 'standard' — pas de contrainte (défaut)
--  • 'mono'            — toutes les cartes Pokémon partagent 1 type d'énergie
--  • 'no-ex'           — aucune carte EX
--
-- Validation côté client (helper TS), persistance côté serveur via
-- la nouvelle col `format`. Pas de check côté SQL — c'est purement
-- déclaratif pour l'instant.
--
-- Run après supabase/tcg-decks.sql.
-- ──────────────────────────────────────────────────────────────────────

alter table public.tcg_decks
  add column if not exists format text;
