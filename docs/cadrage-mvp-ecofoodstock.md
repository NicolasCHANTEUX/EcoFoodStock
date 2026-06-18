# Cadrage MVP - EcoFoodStock

Derniere mise a jour : 2026-06-18

## Verdict

Le MVP 1 est maintenant proche de la validation finale.

La version actuelle couvre le coeur utile du produit : compte utilisateur, onboarding, inventaire, scan code-barres, liste de courses simple, historique, annulation, parametres, PWA, theme sombre et securisation Supabase.

Le travail restant n'est plus un gros developpement produit, mais une passe de stabilisation :

- appliquer les dernieres migrations Supabase ;
- verifier les parcours manuels sur mobile et desktop ;
- confirmer que le terminal serveur reste propre ;
- lancer les checks techniques avant gel MVP1.

## Objectif MVP 1

EcoFoodStock MVP 1 doit permettre a un utilisateur reel de :

- creer un compte ;
- configurer son foyer et son profil ;
- gerer un stock alimentaire domestique ;
- ajouter un produit manuellement ou via code-barres ;
- suivre quantites, zones de stockage et DLC ;
- preparer une liste de courses simple ;
- consulter l'historique des actions ;
- annuler les actions critiques quand cela a du sens ;
- utiliser l'application confortablement sur mobile.

Le MVP 1 ne cherche pas encore a etre un coach nutritionnel complet, un moteur de recettes ou une application multi-foyer avancee.

## Perimetre MVP 1

Inclus dans le MVP 1 :

- Authentification email / mot de passe.
- Preparation OAuth Google / Apple via Supabase.
- Consentement legal a l'inscription.
- Onboarding profil : foyer, regime, mode Grand Public / Sportif, informations utiles.
- Theme clair, sombre et systeme.
- Dashboard d'accueil avec donnees utiles.
- Inventaire mobile-first.
- Ajout manuel de produit.
- Scan camera et lookup Open Food Facts.
- Cache Open Food Facts persistant en base dans `products.off_*`.
- Proxy image Open Food Facts avec timeout, cache CDN et rate limit.
- Gestion des DLC.
- Recherche, filtres et zones de stockage.
- Gestion des quantites avec unites normalisees.
- Actions inventaire atomiques via RPC : ajout, consommation, jet, ajustement.
- Historique detaille des actions.
- Annulation des actions critiques depuis l'historique.
- Historisation des changements de parametres non sensibles.
- Changement de mot de passe avec retour utilisateur et trace historique non annulable.
- Liste de courses simple.
- Suggestions de courses basees sur Open Food Facts et le regime.
- Finalisation des courses avec archivage et trace historique.
- Invitation / rejoindre un foyer via token.
- Export et suppression de compte cote API.
- PWA : manifest, service worker, offline minimal, aide installation.
- Tests domaine, tests securite/RPC et harnais d'integration Supabase locale.

## Hors perimetre MVP 1

Repousse en MVP 2 ou plus :

- Recettes intelligentes.
- Mode cuisine avec deduction automatique des ingredients.
- Notifications push.
- Bilan hebdomadaire.
- Suggestions de courses predictives avec scoring avance.
- Gestion fine des allergies et incompatibilites par membre.
- Permissions complexes de foyer.
- Tableaux nutritionnels complets.
- Hydratation et meteo.
- Historisation avancee du poids.
- Macro-solver de fin de journee.
- Hub partenaires / affiliation.
- Internationalisation francais / anglais.
- Exports complets multi-formats.

## Decisions produit stabilisees

### Inventaire

L'inventaire reste le centre du MVP 1.

Les produits peuvent venir :

- d'un ajout manuel ;
- d'un scan code-barres ;
- d'un lookup Open Food Facts ;
- d'une suggestion de courses ajoutee manuellement au stock.

La finalisation des courses n'ajoute pas automatiquement les articles dans `inventory_batches` pour le MVP 1. Apres les courses, l'utilisateur ajoute les produits au stock depuis l'inventaire.

### Quantites

Regle technique :

- masses en grammes ;
- volumes en millilitres si utilises ;
- objets en pieces ;
- conversion uniquement a l'affichage.

Regle d'affichage :

- moins de 1 kg : afficher en grammes ;
- 1 kg ou plus : afficher en kilogrammes ;
- pieces : afficher au singulier/pluriel selon quantite.

### Open Food Facts

Le scan ne doit jamais bloquer l'utilisateur.

Cas prevus :

- produit connu : pre-remplir nom, marque, categorie, image, quantite et nutrition si disponibles ;
- produit inconnu : message clair, sans crash ;
- image manquante ou lente : fallback propre ;
- nutrition absente : ignorera pour le MVP 1 ;
- donnee incorrecte : l'utilisateur peut corriger avant ajout.

Decision technique :

- cache memoire court dans `src/lib/open-food-facts.ts` ;
- cache persistant en base dans `products.off_*` ;
- proxy image dedie `/api/images` avec timeout court, cache navigateur/CDN, cache negatif et rate limit distribue.

### Grand Public vs Sportif

Le choix du mode est conserve dans le profil.

Pour MVP 1 :

- le mode influence les parametres et certaines donnees d'objectifs ;
- les dashboards nutritionnels complets restent hors scope ;
- le mode Sportif ne doit pas creer d'objectif absurde ou de deficit extreme par defaut.

### Historique et annulation

Actions historisees :

- ajout de produit ;
- ajustement de quantite ;
- consommation ;
- jet ;
- suppression ;
- courses ;
- modification de parametres ;
- changement de mot de passe ;
- invitation / join household selon parcours.

Actions annulables :

- actions inventaire critiques ;
- certaines actions courses ;
- jamais les changements de mot de passe ;
- pas les changements de parametres personnels sensibles.

Principe :

- l'historique sert a la tracabilite et au droit a l'erreur ;
- les snapshots sensibles ne doivent pas etre stockes dans les metadonnees.

### Securite Supabase

Le backend doit rester verrouille :

- pas d'ecriture sans authentification reelle ;
- acces foyer verifie ;
- RPC critiques en `SECURITY DEFINER` defensif ;
- `revoke/grant execute` explicites ;
- RLS activee ;
- rate limit distribue via RPC ;
- `pgcrypto` accessible dans le `search_path` de la RPC rate limit ;
- mode demo strictement limite au local.

## Definition of Done MVP 1

Le MVP 1 peut etre considere termine quand :

- toutes les migrations Supabase necessaires sont appliquees ;
- le terminal serveur ne montre plus d'erreurs recurrentes ;
- `npm run typecheck` passe ;
- `npm run lint` passe ;
- `npm test` passe ;
- `npm run build` passe ;
- la checklist manuelle `mvp1-checklist.md` est validee sur mobile et desktop ;
- les principaux parcours sont utilisables sans intervention technique.

## Documents lies

- `ToDo.md`
- `mvp1-checklist.md`
- `architecture-ecofoodstock.md`
- `revue-captures-ecrans-ecofoodstock.md`
- `../supabase/README.md`
