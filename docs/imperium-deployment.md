# IMPERIUM — Déploiement & monitoring

> Guide pour passer Imperium de la preview au prod. Suit l'ordre des étapes
> de bootstrap après avoir collé les 4 fichiers SQL.

---

## 1. Pré-requis

- Compte Supabase avec l'extension `pg_cron` activée (Database → Extensions).
- Compte Vercel avec le projet Site Suprême déjà déployé.
- Compte PartyKit (gratuit) — pour le chat alliance.
- Variables d'env Supabase déjà branchées sur Vercel : `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## 2. Bootstrap base de données (ordre strict)

Coller dans Supabase SQL Editor, dans cet ordre :

| # | Fichier | Effet |
|---|---|---|
| 1 | [supabase/imperium.sql](../supabase/imperium.sql) | Schéma initial (tables, RLS, RPCs principales, seed merveilles) |
| 2 | [supabase/imperium-fix.sql](../supabase/imperium-fix.sql) | NPC, forge, achievements, leaderboard, quêtes |
| 3 | [supabase/imperium-fix-2.sql](../supabase/imperium-fix-2.sql) | Espionnage, famine bétonnée, respawn barbares |
| 4 | [supabase/imperium-fix-3.sql](../supabase/imperium-fix-3.sql) | Rename village, bannière custom, notifs attaques |
| 5 | [supabase/imperium-fix-4.sql](../supabase/imperium-fix-4.sql) | Profil public, rate limit, index additionnels |

### Crons Supabase à programmer (une fois `pg_cron` actif)

```sql
select cron.schedule('imperium-resolve-marches', '*/5 * * * *',
  $$select public.imperium_resolve_marches()$$);
select cron.schedule('imperium-leaderboard-weekly', '0 23 * * 0',
  $$select public.imperium_finalize_weekly_leaderboard()$$);
-- les fix-2 et fix-1 ajoutent leurs propres crons (respawn barbares, quêtes)
```

Vérifier : `select jobid, schedule, command, active from cron.job where jobname like 'imperium%';`

Tu devrais voir 4 jobs actifs :
- `imperium-resolve-marches` (toutes les 5 min)
- `imperium-leaderboard-weekly` (dimanche 23h)
- `imperium-respawn-barbarians` (toutes les 5 min)
- `imperium-quests-daily` (00:00 quotidien)

---

## 3. Vercel — variables d'env

Aucune nouvelle variable Imperium côté Next.js si **pas de chat alliance**.

Si tu veux le chat alliance, ajoute dans Vercel → Project Settings → Environment Variables :

```
NEXT_PUBLIC_PARTYKIT_HOST = site-ultime.<ton-username>.partykit.dev
```

Redéploie après ajout (Vercel ne propage pas auto les nouvelles env).

---

## 4. PartyKit — déploiement chat alliance

### Première fois

```bash
cd party
npx partykit login          # OAuth GitHub
npx partykit deploy
```

Note l'URL retournée (ex: `site-ultime.eliot.partykit.dev`) → mets-la dans la
var d'env Vercel `NEXT_PUBLIC_PARTYKIT_HOST`.

### Configuration secrets PartyKit

```bash
npx partykit secret set SUPABASE_URL --value "https://xxx.supabase.co"
npx partykit secret set SUPABASE_SERVICE_ROLE_KEY --value "eyJ..."
```

Sans ces secrets, le chat alliance refusera toutes les connexions (la fonction
`checkMembership` ne pourra pas valider l'appartenance).

### Re-déploiement après changement code

```bash
cd party
npx partykit deploy
```

---

## 5. Génération initiale des NPC

Si pas déjà fait à l'étape 1 (`fix.sql` se termine par un `select
imperium_generate_npcs()`), le faire maintenant :

```sql
select public.imperium_generate_npcs();
```

Retour attendu : `{ "total_cells": 10000, "barbarians": ~1000, "oasis": ~500 }`.

Le respawn auto via cron `imperium-respawn-barbarians` regénère les fermes
détruites 24h après leur destruction. Pas besoin de re-run la génération.

---

## 6. Smoke test post-déploiement

| Étape | Vérification |
|---|---|
| 1 | `https://siteultime.com/play/imperium` charge sans erreur |
| 2 | Connexion Discord → redirect vers `/creation` (1er passage) |
| 3 | Création village (faction + nom) → arrive sur la vue village avec 750/750/750/750 |
| 4 | Tutoriel "Premiers pas" affiché en haut |
| 5 | Upgrade un champ → timer descend, ressources débitées |
| 6 | Vue carte → cases barbares ⚔ et oasis 🌳 visibles dans le rayon 7 |
| 7 | Recrute 5 légionnaires → apparaissent dans la file caserne, puis dans l'onglet militaire |
| 8 | Raid une ferme barbare niveau 1-2 → marche outbound, retour avec butin |
| 9 | `/play/imperium/quetes` → `ach_first_village`, `ach_first_blood` débloqués |
| 10 | Hub Imperium → badges "1 non lu" et "X/30" visibles |
| 11 | Si chat alliance déployé : `/play/imperium/alliance` → indicateur connexion vert après création |

---

## 7. Monitoring 1ère semaine

### Logs Supabase

```sql
-- Erreurs RPC dans les dernières 24h
select * from postgres_log
where log_time > now() - interval '24 hours'
  and error_severity in ('ERROR','FATAL')
order by log_time desc limit 50;

-- Cron jobs récents (succès / échec)
select jobid, runid, status, start_time, return_message
from cron.job_run_details
where job_pid > 0 and start_time > now() - interval '24 hours'
order by start_time desc limit 50;
```

### Métriques Imperium

```sql
-- Population
select count(*) as players from public.imperium_villages where is_secondary = false;
select count(*) as alliances from public.imperium_alliances;
select count(*) as active_marches from public.imperium_marches where state = 'outbound';

-- Activité 24h
select count(*) as raids_last_day
  from public.imperium_marches
  where kind in ('raid','attack') and created_at > now() - interval '24 hours';

-- Top puissance
select v.user_id, p.username, public.imperium_compute_power(v.user_id) as power
  from public.imperium_villages v
  join public.profiles p on p.id = v.user_id
  where v.is_secondary = false
  order by power desc limit 20;
```

### Vercel Analytics

- Dashboard `/play/imperium*` : taux d'erreur < 1%, latence p95 < 500ms.
- Watch out : `imperium_tick` peut être lent si trop de marches en attente.
  Si latence p95 dépasse 1s régulièrement → indexer plus.

### Quota free tier Supabase

- DB size : `select pg_size_pretty(pg_database_size(current_database()));`
- Plan free Supabase : limite 500 MB. Imperium devrait être bien en dessous
  pendant des mois (les marches/reports anciens peuvent être purgés en cron).

### Quota PartyKit

Plan free : 100 connexions concurrentes / 10 GB egress mensuel. Pour le chat
alliance d'un site avec <100 joueurs actifs, largement suffisant.

---

## 8. Purge périodique (à programmer plus tard)

Si la DB grossit, ajouter ces crons mensuels :

```sql
-- Marches complétées > 30 jours
delete from public.imperium_marches
where state = 'completed' and created_at < now() - interval '30 days';

-- Rapports lus > 30 jours
delete from public.imperium_reports
where read_by_attacker and read_by_defender and created_at < now() - interval '30 days';

-- Quêtes expirées > 7 jours
delete from public.imperium_quests where expires_at < now() - interval '7 days';

-- Leaderboard > 12 semaines
delete from public.imperium_leaderboard_weekly where week_start < now() - interval '12 weeks';
```

---

## 9. Rollback en urgence

### Désactiver une RPC qui boucle

```sql
-- Empêche les nouveaux appels (utilisateurs ont une erreur claire)
create or replace function public.imperium_send_march(...)
returns uuid language plpgsql as $$
begin raise exception 'Maintenance Imperium en cours.'; end;
$$;
```

### Désactiver les crons

```sql
update cron.job set active = false where jobname like 'imperium%';
```

### Pause complète d'Imperium (côté front)

Mettre une variable d'env Vercel `NEXT_PUBLIC_IMPERIUM_DISABLED=1` puis dans
`/play/imperium/page.tsx` faire un check et afficher un message de maintenance.
(Pas implémenté actuellement — à coder en cas de besoin.)

---

## 10. Annonce Discord — checklist

Quand tout est OK :

- [ ] Crons actifs et qui tournent (vérif `cron.job_run_details`)
- [ ] Smoke test complet passé
- [ ] Tutoriel premier raid testé
- [ ] Chat alliance fonctionnel (si déployé)
- [ ] Au moins 2 comptes test ont créé des villages dans des zones différentes
- [ ] Annonce préparée avec lien direct `/play/imperium`

---

## 11. Roadmap post-lancement (idées)

Pas urgent, mais à garder en tête pour itérations futures :

- Notifications push web pour attaques entrantes (PartyKit a un party de notif global)
- Skin alternatif village selon faction (visuel cosmétique)
- Système d'événements ponctuels (boss world, week-ends double XP)
- Saga story : événements scénarisés à l'arrivée à hôtel niveau 20
- Migration vers serveurs régionaux (EU/US) quand la pop dépasse 500 joueurs
