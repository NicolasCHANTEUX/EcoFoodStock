# Documentation EcoFoodStock

Ce dossier regroupe les documents projet qui ne sont pas le README principal.

## Pilotage MVP

- `cadrage-mvp-ecofoodstock.md` : perimetre, decisions et Definition of Done du MVP 1.
- `ToDo.md` : backlog courant, priorites de stabilisation et pistes MVP 2+.
- `mvp1-checklist.md` : checklist manuelle de validation finale MVP 1.
- `mvp2-contrats-recettes-cuisine-notifications.md` : contrats metier MVP 2 pour recettes, mode cuisine, allergies et notifications.

## Conception

- `architecture-ecofoodstock.md` : architecture produit et base de donnees.
- `revue-captures-ecrans-ecofoodstock.md` : revue des captures et arbitrages UX initiaux.
- `prompt-reprise-codex-ecofoodstock.md` : contexte long de reprise pour un assistant de developpement.

## Documentation technique hors dossier

- `../README.md` : entree principale du projet.
- `../supabase/README.md` : migrations, Supabase locale et tests d'integration.
- `../schema-bdd-ecofoodstock.sql` : schema SQL de reference historique.

## Exploitation

- `observabilite-production.md` : logs JSON, Sentry, alertes et audit regulier des dependances.
- `securite-production.md` : secrets, service role Supabase, backups, restauration et CSP avant exposition publique.
- `procedure-backup-restauration-supabase.md` : runbook de sauvegarde, restauration staging et reprise production.
