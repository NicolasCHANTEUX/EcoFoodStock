# ToDo EcoFoodStock

Derniere mise a jour : 2026-06-18

## Etat global

MVP 1 : quasi termine, en phase de stabilisation et validation.

Le code contient maintenant les principaux blocs attendus :

- auth, consentement legal et compte ;
- onboarding ;
- inventaire ;
- scan camera et lookup Open Food Facts ;
- cache Open Food Facts persistant ;
- proxy image avec timeout, cache CDN et rate limit ;
- courses simples ;
- historique et undo ;
- parametres ;
- PWA ;
- securisation Supabase / RLS / RPC ;
- tests domaine, securite et integration Supabase locale.

## Priorite immediate avant gel MVP 1

- [ ] Appliquer sur Supabase les migrations restantes, notamment :
  - `20260616_150_rate_limit_probabilistic_cleanup.sql`
  - `20260616_160_open_food_facts_persistent_cache.sql`
  - `20260618_170_rate_limit_pgcrypto_search_path.sql`
- [ ] Relancer le serveur et verifier que `/api/images` ne retourne plus de `503`.
- [ ] Verifier que les logs serveur ne contiennent plus `function digest(text, unknown) does not exist`.
- [ ] Faire un parcours complet avec un compte recent.
- [ ] Valider `mvp1-checklist.md`.
- [ ] Lancer les checks finaux :
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run build`
- [ ] Lancer `npm run test:integration:supabase` sur Supabase locale si l'environnement est pret.

## Stabilisation MVP 1

### Auth et onboarding

- [ ] Verifier creation compte email / mot de passe.
- [ ] Verifier connexion apres deconnexion.
- [ ] Verifier que le consentement legal est obligatoire a l'inscription.
- [ ] Verifier OAuth Google si le provider est configure.
- [ ] Verifier OAuth Apple si le provider est configure.
- [ ] Verifier que le nom affiche en topbar n'est pas remplace par l'email quand `display_name` existe.
- [ ] Verifier onboarding en theme clair, sombre et systeme.
- [ ] Verifier que le mode par defaut suit bien le theme systeme.

### Inventaire et scan

- [ ] Tester ajout manuel.
- [ ] Tester scan camera sur mobile reel.
- [ ] Tester lookup Open Food Facts produit connu.
- [ ] Tester produit inconnu.
- [ ] Tester image Open Food Facts absente ou lente.
- [ ] Verifier que le cache `products.off_*` est rempli apres lookup authentifie.
- [ ] Verifier que le proxy image sert ensuite les images sans spammer Open Food Facts.
- [ ] Verifier decrement multi-lots.
- [ ] Verifier les animations d'apparition.

### Courses

- [ ] Tester ajout manuel.
- [ ] Tester suggestions Open Food Facts.
- [ ] Tester suppression/remplacement d'une suggestion.
- [ ] Tester finalisation de courses.
- [ ] Verifier que la finalisation cree bien un evenement d'historique.
- [ ] Garder clair que les courses finalisees ne remplissent pas automatiquement l'inventaire en MVP 1.

### Historique et undo

- [ ] Verifier ajout produit.
- [ ] Verifier consommation.
- [ ] Verifier jet.
- [ ] Verifier action courses.
- [ ] Verifier annulation une seule fois.
- [ ] Verifier que les modifications de parametres apparaissent dans l'historique.
- [ ] Verifier que le changement de mot de passe apparait sans bouton undo.
- [ ] Verifier qu'aucun snapshot sensible n'est stocke.

### Parametres et compte

- [ ] Verifier sauvegarde des infos personnelles.
- [ ] Verifier sauvegarde objectifs.
- [ ] Verifier sauvegarde preferences application.
- [ ] Verifier confirmation de changement de mot de passe.
- [ ] Verifier export compte.
- [ ] Verifier suppression compte sur environnement de test uniquement.

### PWA et responsive

- [ ] Tester installation Chrome Android.
- [ ] Tester aide iOS.
- [ ] Tester mobile et desktop.
- [ ] Tester theme clair.
- [ ] Tester theme sombre.
- [ ] Verifier absence de texte qui deborde.
- [ ] Verifier camera en contexte HTTPS ou localhost.

## Dette technique a garder sous controle

- [ ] Migrer `next lint` vers ESLint CLI avant Next.js 16.
- [ ] Garder les routes API fines et les services metier separes.
- [ ] Continuer a eviter les snapshots sensibles dans l'historique.
- [ ] Ajouter davantage de tests API reels quand les parcours seront stabilises.
- [ ] Documenter la procedure de deploiement production.
- [ ] Documenter la procedure de rollback migration Supabase.

## MVP 2 - Produit

- [ ] Recettes intelligentes.
- [ ] Mode cuisine.
- [ ] Suggestions de courses predictives avec scoring.
- [ ] Gestion allergies et incompatibilites par membre.
- [ ] Permissions foyer plus fines.
- [ ] Notifications DLC.
- [ ] Bilan hebdomadaire.
- [ ] Dashboard nutrition plus complet.
- [ ] Internationalisation francais / anglais.

## MVP 2 - Technique

- [ ] Centraliser les libelles UI dans un systeme i18n.
- [ ] Ajouter tests end-to-end sur les parcours critiques.
- [ ] Ajouter monitoring d'erreurs production.
- [ ] Ajouter strategie de cache plus durable si besoin pour Open Food Facts.
- [ ] Revoir les limites de rate limit selon trafic reel.

## MVP 3 et plus

- [ ] Hydratation avec Open-Meteo.
- [ ] Historisation avancee du poids.
- [ ] Macro-solver de fin de journee.
- [ ] Diagnostic carentiel automatise.
- [ ] Hub partenaires / affiliation.
- [ ] Export avance multi-format.
- [ ] Application mobile native si la PWA ne suffit plus.

## Termine recemment

- [x] Durcissement Supabase : RLS, RPC defensives, grants explicites.
- [x] Rate limit distribue via RPC.
- [x] Strategie IP production pour rate limit.
- [x] Nettoyage probabiliste du rate limit.
- [x] Refactor shopping vers service + RPC transactionnelle.
- [x] Cache anti-spam Open Food Facts.
- [x] Cache Open Food Facts persistant en base.
- [x] Proxy image Open Food Facts : timeout, cache CDN, cache negatif, rate limit.
- [x] Correction `pgcrypto` / `digest(...)` pour la RPC rate limit.
- [x] Tests securite/RPC.
- [x] Harnais d'integration Supabase locale.
