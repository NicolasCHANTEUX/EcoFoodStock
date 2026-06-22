# Procedure backup et restauration Supabase

Objectif : pouvoir restaurer EcoFoodStock sans improviser le jour ou la production est indisponible.

## Frequence recommandee

- Avant ouverture publique : au moins un test complet de restauration sur un projet Supabase de staging.
- Chaque semaine : verifier que les backups automatiques Supabase sont actifs.
- Chaque changement de schema : rejouer les migrations sur une base vierge.
- Chaque mois : faire un exercice de restauration et noter la duree reelle.

## Sauvegarde

1. Verifier dans le dashboard Supabase que les backups automatiques sont actifs pour le projet de production.
2. Exporter le schema applicatif avec la CLI Supabase ou via le dashboard.
3. Conserver les fichiers de migration du repo comme source de verite du schema.
4. Stocker les exports manuels dans un espace chiffre avec acces limite.
5. Ne jamais stocker `SUPABASE_SERVICE_ROLE_KEY`, tokens d'invitation ou dumps contenant des donnees personnelles dans le repo.

## Restauration de test

1. Creer ou reinitialiser un projet Supabase de staging.
2. Appliquer les migrations depuis `supabase/migrations`.
3. Restaurer le dump choisi sur staging, jamais directement sur production.
4. Configurer des variables serveur dediees au staging.
5. Lancer les tests d'integration Supabase contre staging.
6. Verifier manuellement : inscription, connexion, ajout produit, consommation, undo, invitation foyer et suppression de compte.
7. Documenter la date, le dump utilise, les commandes executees, les erreurs et la duree.
8. Renseigner `ECOFOODSTOCK_RESTORE_TESTED_AT` avec la date ISO de cet exercice.

## Restauration production

1. Declarer l'incident et figer les deploiements.
2. Identifier le point de restauration voulu.
3. Restaurer d'abord sur staging et verifier les donnees critiques.
4. Planifier une fenetre de maintenance si la restauration production implique une indisponibilite.
5. Restaurer via les outils Supabase approuves.
6. Regenerer les secrets si l'incident implique une fuite potentielle.
7. Relancer les tests smoke : auth, inventaire, courses, invitations, export, suppression.
8. Noter le retour d'experience dans le journal d'incident.

## Critere de validation pre-production

La checklist securite peut passer a "restauration testee" uniquement si une restauration staging a ete effectuee avec succes dans les 30 derniers jours et si la duree de reprise est connue.

Apres verification hebdomadaire des backups, renseigner `ECOFOODSTOCK_BACKUPS_ENABLED=true` et `ECOFOODSTOCK_BACKUP_VERIFIED_AT` avec la date ISO du controle. `npm run security:prod-check` refuse une verification de backup vieille de plus de 8 jours ou un test de restauration vieux de plus de 31 jours.
