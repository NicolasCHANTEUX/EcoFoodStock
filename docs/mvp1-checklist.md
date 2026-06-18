# Checklist manuelle MVP 1 - EcoFoodStock

Derniere mise a jour : 2026-06-18

Cette checklist sert de passe finale avant de considerer le MVP 1 comme valide.

## 1. Environnement

- [ ] Le serveur demarre avec `npm run dev`.
- [ ] La page `http://localhost:3000` charge sans boucle de refresh.
- [ ] Le terminal ne montre pas d'erreur recurrente.
- [ ] Les variables `.env` sont coherentes avec `.env.example`.
- [ ] Les migrations Supabase recentes sont appliquees.
- [ ] La RPC `check_rate_limit` ne remonte plus `function digest(text, unknown) does not exist`.

## 2. Acces et compte

- [ ] Creer un compte email / mot de passe.
- [ ] Verifier que le consentement legal est obligatoire a l'inscription.
- [ ] Se connecter avec un compte existant.
- [ ] Se deconnecter puis se reconnecter.
- [ ] Verifier que les pages protegees redirigent vers `/login` si deconnecte.
- [ ] Verifier que le nom/prenom s'affiche dans la topbar si disponible.
- [ ] Verifier que l'email n'est utilise qu'en fallback.
- [ ] Tester "mot de passe oublie" si le flux Supabase est configure.
- [ ] Tester OAuth Google si configure.
- [ ] Tester OAuth Apple si configure.

## 3. Onboarding

- [ ] Choisir la taille du foyer.
- [ ] Choisir un regime alimentaire.
- [ ] Choisir le mode Grand Public.
- [ ] Refaire le parcours en mode Sportif.
- [ ] Verifier que les choix sont visibles en theme sombre.
- [ ] Verifier que les donnees Sportif sont reprises dans les parametres.
- [ ] Verifier qu'aucun objectif absurde n'est cree par defaut.
- [ ] Verifier que le theme par defaut suit le mode systeme.

## 4. Inventaire

- [ ] Ajouter un produit manuellement.
- [ ] Ajouter un produit avec code-barres Open Food Facts.
- [ ] Scanner un code-barres sur mobile.
- [ ] Verifier le cas produit inconnu.
- [ ] Verifier le cas image manquante.
- [ ] Modifier quantite, unite, zone et DLC avant ajout.
- [ ] Reduire partiellement un produit.
- [ ] Consommer totalement un produit.
- [ ] Jeter un produit.
- [ ] Verifier qu'un produit present en plusieurs lots se decremente sur plusieurs lots si necessaire.
- [ ] Verifier les animations d'apparition sur inventaire et accueil.

## 5. Open Food Facts et images

- [ ] Verifier qu'un produit connu pre-remplit nom, marque, categorie, image et quantite si disponibles.
- [ ] Verifier que `products.off_*` est renseigne apres lookup authentifie.
- [ ] Recharger la page et verifier que le cache persistant evite les appels inutiles.
- [ ] Verifier que `/api/images` retourne les images sans `503`.
- [ ] Verifier que les images ont un fallback propre si Open Food Facts est lent.
- [ ] Verifier que les retries image ne spamment pas indefiniment.
- [ ] Verifier les headers cache image si besoin dans l'inspecteur reseau.

## 6. Historique

- [ ] Voir les actions regroupees par date.
- [ ] Voir les ajouts de produit.
- [ ] Voir les consommations.
- [ ] Voir les produits jetes.
- [ ] Voir les finalisations de courses.
- [ ] Voir les modifications de parametres.
- [ ] Voir le changement de mot de passe sans option undo.
- [ ] Annuler un ajout de produit.
- [ ] Annuler une consommation.
- [ ] Annuler un jet.
- [ ] Verifier qu'une annulation ne peut pas etre rejouee deux fois.
- [ ] Verifier que les donnees sensibles ne sont pas exposees dans l'historique.

## 7. Courses

- [ ] Ajouter un article manuel.
- [ ] Ajouter une suggestion directement avec le bouton plus.
- [ ] Supprimer une suggestion et verifier son remplacement.
- [ ] Verifier que les suggestions respectent le regime alimentaire.
- [ ] Cocher un article.
- [ ] Tout cocher.
- [ ] Terminer les courses.
- [ ] Verifier que la finalisation cree un evenement d'historique.
- [ ] Masquer le bloc "courses terminees".
- [ ] Confirmer que les articles coches ne sont pas ajoutes automatiquement au stock en MVP 1.

## 8. Parametres

- [ ] Modifier taille du foyer et regime, quitter puis revenir.
- [ ] Basculer le mode Grand Public / Sportif.
- [ ] Modifier les donnees physiques.
- [ ] Modifier les objectifs nutritionnels.
- [ ] Modifier les preferences d'alertes.
- [ ] Modifier le theme : clair, sombre, systeme.
- [ ] Changer le mot de passe et voir un message de confirmation.
- [ ] Exporter ses donnees.
- [ ] Supprimer son compte sur environnement de test uniquement.

## 9. Foyer

- [ ] Generer une invitation foyer.
- [ ] Rejoindre un foyer avec un token valide.
- [ ] Tester un token invalide ou expire.
- [ ] Verifier que l'utilisateur ne peut pas agir sur un foyer auquel il n'appartient pas.

## 10. PWA mobile

- [ ] Ouvrir l'application sur Chrome Android.
- [ ] Verifier que l'installation PWA est proposee.
- [ ] Installer l'application.
- [ ] Ouvrir l'application installee.
- [ ] Verifier navigation, inventaire, scan, courses et historique dans l'application installee.
- [ ] Verifier l'aide iOS si test possible.
- [ ] Verifier la page offline minimale.

## 11. Responsive et themes

- [ ] Tester mobile etroit.
- [ ] Tester desktop.
- [ ] Tester theme clair.
- [ ] Tester theme sombre.
- [ ] Tester theme systeme.
- [ ] Verifier les contrastes des boutons au survol.
- [ ] Verifier que les modales restent centrees.
- [ ] Verifier que les longs libelles ne provoquent pas de scroll horizontal.

## 12. Validation technique

- [ ] Lancer `npm run typecheck`.
- [ ] Lancer `npm run lint`.
- [ ] Lancer `npm test`.
- [ ] Lancer `npm run build`.
- [ ] Lancer `npm run test:integration:supabase` si Supabase locale est disponible.
- [ ] Verifier `git diff --check`.
- [ ] Verifier que `tsconfig.tsbuildinfo` n'est pas modifie uniquement par un check local.

## 13. Decision finale MVP 1

- [ ] Aucun bug bloquant sur les parcours compte, inventaire, courses, historique.
- [ ] Aucun `500` ou `503` recurrent dans le terminal.
- [ ] Les migrations sont appliquees.
- [ ] Le mobile est utilisable.
- [ ] Les fonctionnalites hors MVP 1 sont masquees, neutres ou clairement non prioritaires.
- [ ] Le document `ToDo.md` ne contient plus de tache bloquante MVP 1.
