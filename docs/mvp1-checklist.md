# Checklist manuelle MVP1 EcoFoodStock

Cette checklist sert de passe finale avant de considérer le MVP1 comme validé.

## Accès et compte

- [ ] Créer un compte avec email / mot de passe.
- [ ] Se connecter avec un compte existant.
- [ ] Utiliser "mot de passe oublié" et vérifier l'email de réinitialisation.
- [ ] Vérifier que les pages protégées redirigent vers la connexion si l'utilisateur est déconnecté.
- [ ] Accepter les conditions lors de l'inscription.

## Onboarding

- [ ] Choisir la taille du foyer.
- [ ] Choisir un régime alimentaire.
- [ ] Choisir le mode Grand Public.
- [ ] Refaire le parcours en mode Sportif.
- [ ] Vérifier que les données du mode Sportif sont bien reprises dans les paramètres.

## Inventaire

- [ ] Ajouter un produit manuellement.
- [ ] Ajouter un produit avec code-barres Open Food Facts.
- [ ] Scanner un code-barres sur mobile.
- [ ] Vérifier le cas produit inconnu.
- [ ] Vérifier le cas image manquante.
- [ ] Modifier quantité, unité, zone et DLC avant ajout.
- [ ] Réduire partiellement un produit.
- [ ] Consommer totalement un produit.
- [ ] Jeter un produit.
- [ ] Vérifier qu'un produit présent en plusieurs lots se décrémente sur plusieurs lots si nécessaire.

## Historique

- [ ] Voir les actions regroupées par date.
- [ ] Annuler un ajout de produit.
- [ ] Annuler une consommation.
- [ ] Annuler un jet.
- [ ] Vérifier qu'une annulation ne peut pas être rejouée deux fois.
- [ ] Vérifier la modale de confirmation sur mobile.

## Courses

- [ ] Ajouter un article manuel.
- [ ] Ajouter une suggestion directement avec le bouton plus.
- [ ] Supprimer une suggestion et vérifier son remplacement.
- [ ] Vérifier que les suggestions respectent le régime alimentaire.
- [ ] Cocher un article.
- [ ] Tout cocher.
- [ ] Terminer les courses.
- [ ] Masquer le bloc "courses terminées".

## Paramètres

- [ ] Modifier taille du foyer et régime, quitter puis revenir.
- [ ] Basculer le mode Grand Public / Sportif.
- [ ] Modifier les données physiques.
- [ ] Modifier les objectifs nutritionnels.
- [ ] Modifier les préférences d'alertes.
- [ ] Exporter ses données.
- [ ] Supprimer son compte.

## PWA mobile

- [ ] Ouvrir l'application sur Chrome Android.
- [ ] Vérifier que l'installation PWA est proposée.
- [ ] Installer l'application.
- [ ] Ouvrir l'application installée.
- [ ] Vérifier navigation, inventaire, scan, courses et historique dans l'application installée.

## Responsive et thèmes

- [ ] Tester mobile étroit.
- [ ] Tester desktop.
- [ ] Tester thème clair.
- [ ] Tester thème sombre.
- [ ] Vérifier que les modales restent centrées.
- [ ] Vérifier que les longs libellés ne provoquent pas de scroll horizontal.

## Validation technique

- [ ] Lancer `npm run typecheck`.
- [ ] Lancer `npm run lint`.
- [ ] Lancer `npm test`.
- [ ] Lancer `npm run build`.
- [ ] Appliquer les scripts SQL nécessaires dans Supabase.
