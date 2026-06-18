# Revue des captures d'ecran - EcoFoodStock

## Verdict global

Les captures confirment que la maquette est coherente et exploitable pour lancer le developpement. Le parcours est comprehensible, l'identite visuelle est deja stable, et les ecrans principaux sont presents.

Le point principal a corriger avant developpement : la maquette affiche encore plusieurs fonctionnalites hors MVP 1, notamment recettes, notifications, sante avancee et suggestions nutritionnelles. Il faut soit les masquer, soit les garder en etat "bientot disponible", mais ne pas les developper maintenant.

## 1. Authentification

Ecran observe :

- Connexion Google
- Connexion Apple
- Email / mot de passe
- Mot de passe oublie
- Creation de compte

Avis :

- Tres clair.
- Friction faible.
- La promesse produit est sobre et comprehensible.

Points a garder :

- SSO visible en premier.
- Email / mot de passe en alternative.
- Lien creation de compte discret mais visible.

Points a ajouter plus tard :

- Etats d'erreur : email invalide, mauvais mot de passe, compte inexistant.
- Etat chargement pendant connexion.
- Message de confirmation pour mot de passe oublie.

## 2. Onboarding - Foyer

Ecran observe :

- Etape 1 sur 4
- Choix 1, 2, 3, 4, 5+
- Bouton continuer

Avis :

- Tres bon ecran.
- La question est simple.
- La selection est visuelle et rapide.

Point UX :

- Sur mobile, les cartes devront probablement passer en grille 2 colonnes ou en liste compacte.

## 3. Onboarding - Regime alimentaire

Ecran observe :

- Omnivore
- Vegetarien
- Vegan
- Pescetarien

Avis :

- Clair et agreable.
- Bonne logique de choix simple.

Point a corriger :

- Le cahier des charges mentionne aussi "Sans Gluten" et les allergies.
- Pour le MVP 1, on peut rester simple, mais il faudrait au moins prevoir un bouton "Autre / allergies" ou "Sans gluten" si on veut rester fidele au cadrage initial.

Decision recommandee MVP 1 :

- Garder les 4 regimes actuels.
- Ajouter "Sans gluten" si l'effort est faible.
- Reporter la gestion detaillee des allergies.

## 4. Onboarding - Choix du mode

Ecran observe :

- Mode Grand Public
- Mode Sportif / Macros
- Libelles explicatifs
- Badge Recommande / Avance

Avis :

- Bon ecran, tres lisible.
- La difference de promesse est claire.
- Le badge "Recommande" aide a orienter l'utilisateur.

Point important :

- Si le MVP 1 ne developpe pas encore les dashboards sante complets, il faut quand meme stocker ce choix pour preparer la suite.

## 5. Onboarding sportif - Donnees physiques

Ecran observe :

- Sexe
- Age
- Taille
- Poids
- Bouton calculer les objectifs

Avis :

- Tres pertinent.
- L'ajout de l'age est utile pour calculer les objectifs.

Point a corriger :

- L'indicateur affiche encore "Etape 3 sur 5", alors que cet ecran devrait probablement etre "Etape 4 sur 5" dans le parcours sportif.

Decision :

- Conserver age, sexe, taille, poids.
- En base, ajouter `birthdate` ou `age`. `birthdate` est plus juste a long terme, mais `age` est plus simple pour MVP.

## 6. Onboarding sportif - Objectifs calcules

Ecran observe :

- Calories
- Proteines
- Glucides
- Lipides
- IMC
- Boutons Ajuster / Valider

Avis :

- Tres bon ecran.
- Le bouton Ajuster est important car certains utilisateurs auront des objectifs coach/medecin.

Point a corriger :

- L'indicateur d'etape semble encore incoherent.
- Il faut prevoir l'etat "calcul impossible" si une donnee est manquante ou invalide.

## 7. Onboarding - Notifications

Ecran observe :

- Alertes de peremption
- Rappels nutritionnels
- Suggestions de recettes
- Boutons Plus tard / Activer

Avis :

- Visuellement bon.
- Mais cet ecran est hors MVP 1 si on repousse les notifications.

Decision recommandee MVP 1 :

- Retirer cet ecran du parcours initial, ou garder uniquement une option non bloquante "Plus tard".
- Ne pas promettre les suggestions de recettes dans le MVP 1.

## 8. Layout applicatif

Ecrans observes :

- Sidebar verte a gauche
- Header avec nom du foyer
- Toggle mode Sportif
- Icones notification et profil
- Bouton scanner produit permanent
- Lien ajout manuel

Avis :

- Tres coherent sur desktop.
- Le scanner est bien visible, ce qui est excellent pour la feature principale.
- L'identite "pantry/stock" est claire.

Point mobile-first critique :

- Il faudra adapter la sidebar en navigation basse mobile ou drawer.
- Le bouton "Scanner un produit" doit devenir une action flottante ou un bouton principal en bas.

Decision recommandee :

- Desktop : garder sidebar.
- Mobile : bottom navigation + bouton scan central ou flottant.

## 9. Dashboard

Ecran observe :

- Alertes intelligentes
- Inventaire compact
- Avis nutritionnels
- Suggestions de recettes

Avis :

- Bon tableau de bord de vision produit.
- Mais trop riche pour MVP 1.

Decision MVP 1 :

- Garder : alertes DLC simples, resume inventaire, acces scan.
- Masquer ou repousser : recettes, avis nutritionnels avances, suggestions anti-gaspi complexes.

## 10. Inventaire

Ecran observe :

- Recherche produit
- Filtres : Tous, Frais, Surgeles, Sec, DLC Proche
- Liste compacte
- Checkbox
- Miniatures
- Quantite
- Date d'expiration
- Badges DLC aujourd'hui / demain
- Editer / supprimer

Avis :

- C'est l'ecran le plus important, et il est bien pose.
- Il correspond tres bien au MVP 1.

Points a ajouter pour le MVP 1 :

- Action claire apres selection par checkbox : consommer, jeter, supprimer, changer categorie.
- Gestion de quantite partielle : reduire une quantite sans supprimer tout l'article.
- Confirmation quand on supprime : consomme ou jete.
- Etat vide : "Votre inventaire est vide, scannez un produit".

## 11. Historique

Ecran observe :

- Filtres : Tout, Entrees, Consommes, Jetes, Recettes
- Groupes : Aujourd'hui, Hier, Cette semaine, Plus ancien
- Actions Annuler / Refaire
- Timeline visuelle

Avis :

- Tres bon ecran.
- La logique "droit a l'erreur" est visible.

Point MVP 1 :

- Le filtre "Recettes" et le bouton "Refaire" sont hors MVP 1 si les recettes sont repoussees.

Decision recommandee MVP 1 :

- Garder : Tout, Entrees, Consommes, Jetes.
- Masquer : Recettes, Refaire.
- Conserver l'architecture pour les reintroduire en MVP 2.

## 12. Recettes

Ecran observe :

- Cartes recettes avec image
- Like / dislike
- Tags anti-gaspi
- Ingredients manquants
- Ajouter aux courses

Avis :

- Tres bonne direction pour MVP 2.
- Pas a developper en MVP 1.

Decision MVP 1 :

- Retirer du menu principal ou afficher "Bientot disponible".
- Ne pas brancher d'API recette maintenant.

## 13. Sante

Ecran observe :

- Mode Sportif
- Analyse de la semaine
- Graphique 7 jours
- Bilan macros
- Palmares ingredients

Avis :

- La version sportive est bien differenciee.
- Elle correspond au cahier des charges, mais elle est trop avancee pour MVP 1.

Decision MVP 1 :

- Garder le choix du mode dans le profil.
- Reporter l'onglet Sante complet.
- Eventuellement afficher une page simple "Votre mode actuel" avec objectifs si mode sportif.

## 14. Courses

Ecran observe :

- Onglets Ma Liste / Suggestions
- Regroupement par categories
- Cases a cocher
- Articles dans le panier
- Bouton Terminer les courses
- Suggestions avec priorites

Avis :

- Bon ecran pour le MVP 1 cote "Ma Liste".
- Les suggestions sont plutot MVP 2.

Decision MVP 1 :

- Garder Ma Liste.
- Garder categories et check-off.
- Garder bouton Terminer les courses si transfert vers inventaire faisable simplement.
- Reporter Suggestions ou les rendre statiques/minimales.

Point UX :

- La barre flottante "2 articles dans le panier" est tres bonne.
- Sur mobile, elle devra etre collee en bas, au-dessus de la navigation.

## 15. Parametres

Ecran observe :

- Profil & foyer
- Taille du foyer
- Regime alimentaire
- Mode actuel
- Changer de mode
- Objectifs & donnees physiques
- Preferences alertes
- Gestion interface
- Export donnees
- Supprimer compte

Avis :

- Tres complet.
- Bon emplacement pour reprendre les choix d'onboarding.

Point MVP 1 :

- Il faut eviter de rendre actives les fonctions non developpees.

Decision MVP 1 :

- Garder : profil, foyer, regime, mode, donnees physiques si sportif.
- Garder visuellement mais desactiver ou reporter : alertes, export, suppression complete RGPD si non implementee.
- Supprimer compte peut exister en version simple si auth le permet, mais doit etre fiable avant d'etre visible.

## Decisions finales avant developpement

Pour lancer le developpement sans surcharger :

1. Garder l'auth et l'onboarding.
2. Garder le choix Grand Public / Sportif, mais ne pas developper toute la sante avancee en MVP 1.
3. Garder l'inventaire comme ecran central.
4. Garder scan + ajout manuel.
5. Garder courses simples.
6. Garder historique detaille et annulation.
7. Masquer recettes, notifications, suggestions avancees et sante avancee jusqu'au MVP 2.

## Corrections UX prioritaires

- Corriger les numeros d'etapes dans l'onboarding sportif.
- Retirer les promesses hors MVP 1 du parcours initial.
- Adapter la navigation au mobile-first.
- Ajouter l'action de decrement partiel dans l'inventaire.
- Ajouter les etats d'erreur et etats vides.
- Clarifier les actions apres selection de produits.

