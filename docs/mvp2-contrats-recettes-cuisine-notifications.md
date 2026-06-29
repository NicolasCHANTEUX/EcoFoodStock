# MVP 2 - Contrats recettes, cuisine, allergies et notifications

Derniere mise a jour : 2026-06-29

## Objectif du lot 1

Ce document pose les contrats metier avant implementation technique du MVP 2.

Le lot 1 ne livre pas encore tout le module recettes. Il doit definir les fondations stables pour :

- suggestions de recettes intelligentes ;
- mode cuisine avec deduction du stock ;
- ingredients manquants et courses ;
- allergies, incompatibilites et ingredients exclus ;
- notifications DLC groupees ;
- historique et annulation des recettes cuisinees.

Le principe central est :

```text
Inventaire reel
-> recettes compatibles
-> ingredients manquants
-> courses
-> cuisine
-> deduction stock
-> historique
-> sante / anti-gaspillage
-> notifications
```

## Decisions actees

- Une recette est `Faisable` uniquement si tous les ingredients obligatoires sont disponibles en quantite suffisante.
- Les ingredients optionnels ne bloquent pas le mode cuisine.
- Les ingredients optionnels manquants doivent etre indiques clairement, par exemple avec un badge `Optionnel manquant`.
- En cas de quantite insuffisante, l'application propose une version partielle proportionnelle.
- L'utilisateur peut ensuite reaugmenter les portions ou les quantites si besoin.
- Le mode cuisine ne deduit jamais plus que le stock disponible.
- Les lots sont consommes en priorite par DLC la plus proche.
- Les suggestions de recettes doivent mettre en avant les produits avec DLC proche.
- Une recette cuisinee est annulable tant que les lots et mouvements peuvent etre restaures proprement.
- Une recette contenant une allergie reste visible, mais elle est grisee avec un badge rouge.
- Avant toute action sur une recette avec allergene, un modal d'alerte doit expliciter l'ingredient concerne.
- Les notifications DLC sont groupees quotidiennement pour eviter le spam.
- Les recettes creees par l'utilisateur sont une brique centrale du MVP 2, pas un bonus.
- L'utilisateur doit pouvoir creer une recette depuis les ingredients de son inventaire.
- L'utilisateur doit pouvoir ajouter un ingredient a une recette via une recherche alimentaire.
- La recherche alimentaire doit interroger Open Food Facts et retourner les 5 resultats les plus coherents.
- Le meme mecanisme de recherche doit ameliorer l'ajout d'aliments dans l'inventaire.
- Les macros nutritionnelles doivent etre importees quand la source les fournit, puis normalisees dans EcoFoodStock.
- Le coeur recette ne doit pas dependre directement d'une API recette externe unique.
- L'utilisateur doit avoir un suivi quotidien des macros, mis a jour au fil des consommations.
- La vue `Sante` devient l'endroit principal pour afficher l'avancement macro du jour.
- Ajouter un aliment au stock ne compte pas comme un apport nutritionnel.
- Les apports macro doivent venir des consommations, des recettes cuisinees et des ajouts nutritionnels manuels.
- Les donnees sante, poids, objectifs et macros sont toujours privees par utilisateur, meme dans un foyer partage, dans une logique RGPD.
- Si le foyer contient plusieurs utilisateurs, une recette cuisinee propose une repartition macro entre membres.
- Par defaut, la repartition propose les utilisateurs lies au foyer, puis l'utilisateur peut selectionner les personnes concernees.
- Les macros d'une recette cuisinee sont divisees entre les utilisateurs selectionnes.
- Les unites difficiles comme tranche, pot, cuillere ou boite sont estimees via Open Food Facts quand possible.
- Les donnees Open Food Facts incompletes ou incertaines doivent etre signalees et corrigeables manuellement.
- Le matching ingredient / produit doit etre confirme par l'utilisateur quand il existe une ambiguite.
- Les recettes externes et locales peuvent etre enregistrees dans `Mes recettes` et marquees en favoris.
- Les alertes allergenes ne bloquent pas l'action, mais elles doivent etre visibles, constantes et inevitables avant continuation.
- Le MVP 2 avance pas a pas : fondation macros d'abord, puis recettes et mode cuisine.

## Strategie sources externes

### Principe

EcoFoodStock doit rester maitre de ses recettes, de son inventaire et de ses calculs.

Les API externes servent a enrichir l'experience, mais elles ne doivent pas devenir la source de verite principale. Le MVP 2 doit donc passer par des adaptateurs internes :

- `products` pour les aliments, codes-barres, images, macros et allergenes ;
- `recipes` pour les suggestions externes ou l'import de recettes ;
- `nutrition` pour les macros et valeurs nutritionnelles normalisees.

### Open Food Facts

Open Food Facts est la source prioritaire pour :

- lookup code-barres ;
- recherche texte d'aliments et produits ;
- import nom, marque, image, categories, ingredients, allergenes ;
- import macros nutritionnelles quand elles sont presentes ;
- amelioration de l'ajout inventaire ;
- ajout manuel d'ingredients dans une recette.

Contrat UX :

- champ de recherche avec 3 caracteres minimum ;
- debounce cote client ;
- rate limit cote API ;
- 5 resultats maximum ;
- resultats classes par coherence ;
- affichage image, nom, marque, quantite, nutriscore si disponible et macros principales ;
- possibilite de choisir un resultat ou de continuer en saisie manuelle.

Contrat technique :

```text
GET /api/products/search?q=tomate&limit=5
```

La route doit :

- valider la requete avec Zod ;
- appliquer le rate limit distribue existant ;
- interroger le cache local avant Open Food Facts ;
- normaliser les resultats dans un format stable ;
- ne jamais exposer la reponse brute comme contrat frontend ;
- persister les produits selectionnes ou consultes selon la strategie cache existante.

Format cible simplifie :

```ts
type ProductSearchResult = {
  source: "open_food_facts";
  sourceProductId: string;
  barcode?: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  quantityLabel?: string;
  categories?: string[];
  allergens?: string[];
  nutriments?: {
    energyKcalPer100g?: number;
    proteinsPer100g?: number;
    carbsPer100g?: number;
    fatPer100g?: number;
    fibersPer100g?: number;
    saltPer100g?: number;
    sugarsPer100g?: number;
  };
}
```

### API recettes externes

La recommandation MVP 2 est :

1. construire d'abord les recettes locales et utilisateur ;
2. ajouter un adaptateur de fournisseur recette ;
3. brancher un fournisseur externe seulement quand le contrat interne est stable.

Fournisseur candidat principal : Spoonacular.

Raisons :

- recherche de recettes par ingredients disponibles ;
- endpoints adaptes aux suggestions depuis inventaire ;
- metadonnees recette riches ;
- bon candidat pour proposer des recettes quand l'utilisateur n'a pas encore cree ses propres recettes.

Limites a anticiper :

- API commerciale avec quotas ;
- donnees majoritairement anglophones ;
- contraintes de cache a verifier avant production ;
- mapping ingredient vers inventaire a garder sous controle.
- une recette externe sauvegardee doit conserver un snapshot local minimal pour rester retrouvable.

Alternative serieuse : Edamam Recipe API.

Raisons :

- nutrition, regimes et labels sante solides ;
- utile si la priorite devient le calcul nutritionnel externe ;
- bon complement possible pour enrichir les macros.

Limites :

- recettes souvent referencees vers une source externe ;
- peut etre moins directe pour le cas "qu'est-ce que je peux cuisiner avec mon stock".

Non retenu comme source principale : TheMealDB.

Raison :

- pratique pour prototyper, mais insuffisant pour les macros, allergies fines, matching inventaire et couverture produit.

### Sources nutrition generiques

Open Food Facts couvre tres bien les produits emballes, mais moins bien les ingredients bruts ou generiques.

Pour une phase ulterieure, on peut evaluer :

- Edamam Food Database pour recherche alimentaire et nutrition ;
- USDA FoodData Central pour base nutritionnelle large ;
- une source francaise type CIQUAL si le projet veut une reference nutritionnelle plus locale.

Decision MVP 2 :

- ne pas bloquer le lot 1 sur ces sources ;
- normaliser le modele nutrition maintenant ;
- prevoir un champ `source` et un identifiant externe ;
- permettre a l'utilisateur de corriger manuellement les macros.

## Creation de recettes utilisateur

Une recette utilisateur doit pouvoir etre creee sans API recette externe.

L'utilisateur doit pouvoir :

- saisir un titre ;
- ajouter une image plus tard, ou utiliser une image importee si disponible ;
- definir le nombre de portions ;
- definir un temps de preparation et cuisson ;
- ajouter des etapes ;
- ajouter des ingredients depuis l'inventaire ;
- ajouter des ingredients via la recherche Open Food Facts ;
- ajouter un ingredient libre si aucun resultat n'est satisfaisant ;
- marquer un ingredient comme optionnel ;
- renseigner ou corriger les quantites et unites ;
- voir les macros estimees de la recette ;
- sauvegarder en brouillon ou publier dans le foyer.

Statuts recette utilisateur :

- `draft` : brouillon modifiable par son createur ;
- `active` : recette utilisable dans les suggestions et le mode cuisine ;
- `archived` : recette masquee des suggestions, mais conservee pour l'historique.
- `saved_external` : recette externe sauvegardee dans `Mes recettes` avec source et snapshot local.

Regles importantes :

- une recette utilisateur appartient a un foyer ou a un utilisateur selon le modele retenu ;
- une recette utilise des ingredients normalises quand possible ;
- une recette peut garder un ingredient libre sans produit lie ;
- les macros sont estimees a partir des ingredients lies et des quantites ;
- les macros manquantes doivent etre indiquees comme estimation incomplete ;
- une recette locale ou externe peut etre ajoutee a `Mes recettes` ;
- une recette peut etre marquee comme favori pour la retrouver rapidement ;
- une recette externe sauvegardee doit garder le fournisseur et l'identifiant source ;
- si l'utilisateur modifie une recette externe, l'application doit creer une copie locale editable ;
- la suppression d'une recette deja cuisinee doit probablement devenir un archivage.

## Suivi macro quotidien

### Objectif

Le MVP 2 doit permettre a l'utilisateur de suivre l'avancement de ses macros quotidiennes en temps reel ou quasi temps reel.

La vue `Sante` est l'endroit principal pour ce suivi.

Elle doit afficher au minimum pour la journee en cours :

- calories ;
- proteines ;
- glucides ;
- lipides ;
- progression par rapport aux objectifs quotidiens ;
- reste a consommer ;
- depassements visibles mais non culpabilisants ;
- indication si les donnees sont incompletes ou estimees.

En mode Sportif, cette zone doit etre precise et chiffree.

En mode Grand Public, elle peut etre plus pedagogique :

- tendance de la journee ;
- equilibre global ;
- alertes douces si un macro est tres bas ou tres haut ;
- lien vers les produits ou recettes qui expliquent le total.

### Source de verite

Le stock ne doit pas etre confondu avec les apports nutritionnels.

Ne comptent pas dans les macros du jour :

- ajout d'un produit a l'inventaire ;
- correction de quantite ;
- finalisation d'une liste de courses ;
- presence d'un produit dans le stock.

Comptent dans les macros du jour :

- consommation d'un produit ;
- recette cuisinee ;
- entree manuelle ajoutee par l'utilisateur ;
- annulation d'une consommation ou d'une recette, en negatif ;
- plus tard, repartition d'une recette entre plusieurs membres du foyer.

### Journal nutritionnel

Pour eviter de recalculer toute la journee depuis des mouvements ambigus, le MVP 2 doit prevoir un journal nutritionnel explicite.

Concept recommande :

```text
nutrition_entries
```

Chaque entree represente un apport nutritionnel attribue a un utilisateur et a une date locale.

Les entrees sont personnelles : un autre membre du foyer ne doit pas pouvoir lire les macros, poids, objectifs ou donnees sportives d'un utilisateur sans autorisation explicite.

Ces donnees doivent etre traitees comme des donnees personnelles sensibles : acces minimal, logs nettoyes, export/suppression conformes au parcours RGPD du compte.

Champs cibles :

- `id`
- `user_id`
- `household_id`
- `entry_date`
- `entry_time`
- `source_type` : `inventory_consumption`, `cooked_recipe`, `manual`, `undo`
- `source_id`
- `product_id`
- `recipe_id`
- `cooked_recipe_id`
- `label`
- `quantity`
- `unit`
- `calories_kcal`
- `protein_g`
- `carbs_g`
- `fat_g`
- `fiber_g`
- `sugars_g`
- `salt_g`
- `estimated`
- `created_at`
- `undone_at`

Les macros doivent etre stockees en snapshot au moment de l'entree.

Raison :

- les donnees nutritionnelles d'un produit peuvent etre corrigees plus tard ;
- l'historique quotidien doit rester stable ;
- l'undo doit pouvoir inverser proprement l'apport ;
- les calculs de progression restent rapides.
- la confidentialite reste appliquee meme si la recette ou le stock appartiennent au foyer.

### Temps reel

Le suivi macro quotidien doit se mettre a jour apres chaque action qui change les apports.

Priorite MVP 2 :

- mise a jour immediate cote client apres une consommation ou une recette cuisinee ;
- revalidation de `/api/health/today` apres mutation ;
- support Realtime Supabase possible ensuite si plusieurs appareils ou membres modifient la meme journee.

Le terme "temps reel" signifie donc pour le MVP 2 :

- l'utilisateur voit l'avancement changer sans recharger manuellement ;
- les totaux restent coherents apres undo ;
- l'app peut retomber sur un fetch serveur si le temps reel natif n'est pas encore branche.

### Repartition foyer

Une consommation simple est attribuee par defaut a l'utilisateur qui effectue l'action.

Pour une recette cuisinee :

- l'application verifie combien d'utilisateurs sont lies au foyer ;
- si le foyer n'a qu'un utilisateur, les macros sont attribuees a cet utilisateur ;
- si le foyer a plusieurs utilisateurs, l'application propose une repartition ;
- par defaut, les membres du foyer sont proposes comme participants ;
- l'utilisateur peut selectionner ou deselectionner les membres concernes ;
- les macros totales de la recette sont divisees entre les utilisateurs selectionnes ;
- chaque utilisateur recoit sa propre entree `nutrition_entries` ;
- les objectifs nutritionnels restent par utilisateur, jamais par foyer.

Evolution possible apres MVP 2 :

- repartition par nombre de portions par personne ;
- repartition par pourcentage ;
- conservation de portions preparees pour plus tard.

## Statuts et badges recette

Statuts principaux :

- `Faisable` : tous les ingredients obligatoires sont disponibles en quantite suffisante.
- `Partiellement faisable` : une version reduite est possible en gardant les proportions.
- `Il manque X ingredients` : au moins un ingredient obligatoire est absent ou insuffisant.
- `Optionnel manquant` : seuls des ingredients optionnels sont absents.
- `Allergene detecte` : au moins un ingredient correspond a une allergie ou incompatibilite utilisateur.
- `A cuisiner vite` : la recette utilise un produit avec DLC proche.

Une recette peut cumuler plusieurs badges. Exemple :

```text
Faisable + Optionnel manquant + A cuisiner vite
```

ou :

```text
Partiellement faisable + Allergene detecte
```

## Faisabilite et quantites

### Ingredients obligatoires

Une recette est faisable si, pour chaque ingredient obligatoire :

- un produit compatible existe en stock ;
- la quantite disponible est superieure ou egale a la quantite requise pour les portions demandees ;
- l'unite est compatible ou convertible selon les regles du produit.

Si un ingredient obligatoire est absent, la recette n'est pas faisable.

Si un ingredient obligatoire est present mais insuffisant, la recette peut etre `Partiellement faisable`.

### Matching ingredient / produit

Le matching automatique ne doit jamais etre opaque.

Quand un ingredient peut correspondre a plusieurs produits, l'UI doit demander confirmation.

Exemples :

- `tomate` peut correspondre a tomate fraiche, tomates cerises, pulpe de tomate ou sauce tomate ;
- `lait` peut correspondre a lait entier, demi-ecreme, vegetal ou poudre ;
- `fromage` peut correspondre a des produits nutritionnellement tres differents.

Regles :

- afficher les meilleurs candidats issus de l'inventaire et d'Open Food Facts ;
- montrer nom, marque, image, quantite et macros si disponibles ;
- permettre de choisir un produit ;
- permettre de garder un ingredient libre ;
- marquer le resultat comme estime si le mapping reste imparfait.

### Unites difficiles

Les unites standard restent :

- grammes ;
- millilitres ;
- pieces.

Les unites comme `tranche`, `pot`, `cuillere`, `boite`, `sachet` ou `portion` doivent etre estimees avec Open Food Facts quand possible.

Regles :

- utiliser la quantite commerciale, la portion ou le serving size Open Food Facts si disponible ;
- afficher clairement que la conversion est estimee ;
- permettre a l'utilisateur de corriger la conversion ;
- conserver la correction pour les prochaines utilisations du produit si possible ;
- ne pas bloquer la recette uniquement parce qu'une unite est estimee.

### Ingredients optionnels

Un ingredient optionnel manquant :

- ne bloque pas le statut `Faisable` ;
- ne bloque pas le mode cuisine ;
- apparait dans une zone separee ou avec un badge `Optionnel manquant` ;
- ne doit pas etre deduit du stock.

### Portions partielles

Pour calculer une version partielle, l'application calcule le ratio possible pour chaque ingredient obligatoire :

```text
ratio_ingredient = quantite_disponible / quantite_requise
ratio_possible = minimum des ratios_ingredient
```

Exemple :

```text
Recette 4 portions :
- pates : 400 g requis
- sauce : 200 g requis

Stock :
- pates : 200 g
- sauce : 200 g

ratio_possible = min(200 / 400, 200 / 200) = 0,5
proposition = 2 portions
```

Toutes les quantites sont alors ajustees proportionnellement.

L'utilisateur doit pouvoir :

- accepter la proposition partielle ;
- reduire encore les portions ;
- reaugmenter les portions ;
- voir immediatement quels ingredients redeviennent insuffisants ;
- ajouter les manquants aux courses si la quantite souhaitee depasse le stock.

## Priorite DLC et scoring

Les suggestions de recettes doivent favoriser l'anti-gaspillage.

Le score d'une recette doit prendre en compte au minimum :

- presence d'ingredients disponibles en stock ;
- proximite DLC des lots utilises ;
- proportion d'ingredients obligatoires couverts ;
- ingredients manquants ;
- ingredients optionnels manquants ;
- compatibilite regime ;
- allergies et ingredients bloques ;
- feedback utilisateur : like, dislike, favoris.

Regle recommandee :

- un produit avec DLC proche augmente fortement le score ;
- un produit expire ne doit pas etre propose comme ingredient utilisable sans alerte dediee ;
- une recette avec allergene detecte reste visible mais doit etre de-priorisee et visuellement grisee ;
- un dislike doit reduire fortement le score ;
- un favori peut remonter dans les suggestions si faisable.

## Allergies et incompatibilites

Le MVP 2 doit distinguer :

- allergie declaree ;
- ingredient bloque ;
- ingredient simplement dislike ;
- regime alimentaire.

Comportement UI :

- la recette reste visible ;
- la carte est grisee ;
- un badge rouge indique l'ingredient concerne, par exemple `Allergene : arachide` ;
- le bouton d'action ouvre un modal d'alerte avant de continuer ;
- le modal rappelle que l'utilisateur doit verifier la recette avant toute action.
- l'alerte doit rester visible a chaque action sensible, meme si l'utilisateur a deja vu cette recette ;
- la continuation demande une confirmation explicite.

Comportement metier :

- une allergie ne doit jamais etre cachee dans les logs ou dans une erreur brute ;
- les donnees d'allergie sont sensibles ;
- une allergie ne bloque pas techniquement l'action ;
- l'application ne doit pas permettre de contourner silencieusement l'alerte ;
- l'accuse de lecture peut etre historise sans stocker le detail sensible de l'allergene en clair ;
- le scoring ne doit pas promouvoir une recette allergene ;
- les suggestions de courses ne doivent pas pousser un ingredient allergene ;
- les ingredients bloques doivent etre appliques au meme niveau que les recettes et les courses.

## Mode cuisine

Le mode cuisine doit etre transactionnel.

Quand l'utilisateur cuisine une recette :

1. L'application verifie que l'utilisateur appartient au foyer.
2. L'application verifie les allergies et affiche le modal si necessaire.
3. L'application calcule les portions ciblees.
4. L'application planifie les deductions par lot, en priorite DLC la plus proche.
5. L'application refuse toute deduction impossible.
6. L'application cree les mouvements de stock `cook`.
7. L'application cree une ligne `cooked_recipes`.
8. L'application propose ou applique la repartition macro entre membres concernes.
9. L'application cree les entrees `nutrition_entries` personnelles si la recette est consommee maintenant.
10. L'application cree un evenement `activity_events` de type `recipe_cooked`.
11. L'application renvoie un resume de ce qui a ete deduit et attribue.

Le mode cuisine ne doit pas :

- deduire des ingredients optionnels absents ;
- deduire plus que le stock disponible ;
- modifier le stock si une erreur survient au milieu de la transaction ;
- stocker de snapshots sensibles inutiles dans l'historique.

## Annulation

Une recette cuisinee est annulable si :

- l'evenement d'activite existe ;
- il n'a pas deja ete annule ;
- les mouvements de stock lies peuvent etre inverses ;
- les produits et lots logiques existent encore ;
- l'utilisateur appartient toujours au foyer.

L'annulation doit :

- restaurer les quantites deduites ;
- recreer ou reactiver les lots si necessaire selon le modele choisi ;
- creer un evenement `undo` ;
- marquer l'evenement original comme annule ;
- rester atomique.

## Notifications DLC

Les notifications DLC sont groupees quotidiennement.

Principe :

- un utilisateur configure le delai d'alerte : 1, 2, 3 jours ou desactivation ;
- un job serveur identifie les lots proches de DLC ;
- un seul resume quotidien est cree par utilisateur et par foyer ;
- le resume liste les produits a utiliser rapidement ;
- le systeme evite les doublons sur la meme journee.

Exemple de notification :

```text
3 produits a utiliser bientot
Yaourts, poulet et salade arrivent a DLC proche. Des recettes sont disponibles.
```

Les notifications doivent respecter :

- preferences utilisateur ;
- appartenance foyer ;
- rate limit / anti-spam ;
- logs sans donnees sensibles ;
- statut d'envoi : planifie, envoye, echoue, annule.

## Contrats base de donnees

Les tables existantes anticipent deja une partie du MVP 2 :

- `recipes`
- `recipe_ingredients`
- `recipe_feedback`
- `blocked_ingredients`
- `cooked_recipes`
- `notification_preferences`
- `push_subscriptions`
- `notification_events`

Table candidate a ajouter pour le suivi macro :

- `nutrition_entries` : journal des apports nutritionnels quotidiens par utilisateur.

Points a clarifier ou enrichir avant migrations :

- Ajouter ou formaliser un champ de statut recette si necessaire : cachee, active, archivee.
- Ajouter ou formaliser un champ `source` recette : `user`, `saved_external`, `imported`.
- Ajouter ou formaliser un identifiant fournisseur externe pour les recettes importees.
- Ajouter un champ favori ou s'appuyer sur `recipe_feedback` pour `favorite`.
- Ajouter une table ou vue `my_recipes` si `recipes` + `recipe_feedback` ne suffit pas.
- Ajouter une notion de brouillon pour les recettes utilisateur.
- Verifier que `recipe_ingredients.optional` suffit pour les ingredients optionnels.
- Ajouter une notion de nom normalise ingredient si le matching texte devient important.
- Ajouter une liaison optionnelle entre `recipe_ingredients` et les produits Open Food Facts importes.
- Ajouter une structure nutrition normalisee par ingredient et par recette si elle n'existe pas encore.
- Ajouter des champs de compatibilite regime si `diet_tags` ne suffit pas.
- Ajouter un champ `status` sur `notification_events` si absent : `scheduled`, `sent`, `failed`, `cancelled`.
- Ajouter un identifiant de regroupement quotidien pour eviter les doublons de notification.
- Verifier si `cooked_recipes` doit stocker un resume non sensible des deductions.
- Verifier si `activity_events.metadata` suffit pour l'undo cuisine ou si les mouvements de stock sont la source de verite.
- Verifier si le cache Open Food Facts actuel peut servir aussi la recherche texte, pas seulement le lookup code-barres.
- Ajouter un journal nutritionnel si les totaux macro ne doivent pas dependre uniquement des mouvements de stock.
- Verifier la timezone utilisateur pour calculer correctement la journee nutritionnelle.
- Verifier que les objectifs macro restent par utilisateur, meme dans un foyer partage.
- Verifier les politiques RLS pour garantir la confidentialite des donnees sante par utilisateur.
- Ajouter une structure pour les conversions estimees d'unites non standard si necessaire.

## Contrats RPC

Les operations critiques doivent passer par des RPC defensives `SECURITY DEFINER`, reservees au `service_role`, avec verification explicite du foyer.

RPC ciblees :

### `cook_recipe`

Responsabilites :

- verifier `p_user_id` ;
- verifier appartenance foyer ;
- verrouiller les lots candidats ;
- calculer les deductions par DLC ;
- refuser la surconsommation ;
- inserer `inventory_movements` ;
- inserer `cooked_recipes` ;
- inserer `activity_events` ;
- retourner un payload structure.

### Extension `undo_activity_event`

Responsabilites :

- accepter les evenements `recipe_cooked` ;
- restaurer les quantites deduites ;
- marquer l'evenement original comme annule ;
- creer un evenement `undo`.

### `apply_recipe_feedback`

Responsabilites :

- creer, remplacer ou supprimer un feedback ;
- gerer like, dislike, favori ;
- conserver une raison optionnelle de dislike ;
- eviter les doublons incoherents.

### `register_push_subscription`

Responsabilites :

- valider l'utilisateur ;
- upsert l'abonnement push ;
- eviter les doublons par endpoint ;
- ne jamais exposer les secrets de push dans les logs.

### `schedule_expiration_notifications`

Responsabilites :

- calculer les lots proches de DLC ;
- respecter les preferences ;
- creer un seul evenement groupe par jour ;
- eviter les doublons ;
- rester rejouable par un job planifie.

## Contrats API

Routes candidates :

```text
GET  /api/recipes/suggestions
GET  /api/recipes/my-recipes
GET  /api/recipes/[id]
POST /api/recipes
PATCH /api/recipes/[id]
POST /api/recipes/[id]/archive
POST /api/recipes/[id]/save
POST /api/recipes/[id]/favorite
POST /api/recipes/feedback
POST /api/recipes/cook
POST /api/shopping/from-recipe

GET  /api/products/search

GET  /api/health/today
GET  /api/health/summary
POST /api/nutrition/entries
POST /api/nutrition/entries/[id]/undo

GET  /api/notifications/preferences
POST /api/notifications/preferences
POST /api/notifications/push-subscription
```

Regles communes :

- validation Zod des payloads ;
- resolution foyer via les helpers existants ;
- rate limit distribue ;
- logs structures avec `requestId` ;
- aucune erreur brute renvoyee au client ;
- aucune donnee sensible dans les logs ;
- routes fines, logique metier dans `services/`.
- les contrats frontend consomment des DTO internes, jamais les payloads bruts des API externes.

### `GET /api/products/search`

Usage :

- ajout inventaire par recherche texte ;
- ajout ingredient dans une recette ;
- ajout manuel enrichi depuis Open Food Facts ;
- futures suggestions de courses.

Parametres :

```text
q: string, minimum 3 caracteres
limit: number, defaut 5, maximum 5
```

Reponse :

```ts
type ProductSearchResponse = {
  results: ProductSearchResult[];
  source: "cache" | "open_food_facts" | "mixed";
}
```

Regles :

- ne pas appeler Open Food Facts a chaque frappe ;
- dedupliquer les resultats ;
- degrader proprement vers la saisie manuelle si Open Food Facts est indisponible ;
- conserver les images via la strategie proxy/cache deja en place ;
- exposer les macros avec un flag d'estimation incomplete si necessaire.
- exposer les portions ou serving sizes Open Food Facts utiles aux conversions estimees.

### Adaptateur recette externe

Le fournisseur externe doit etre cache derriere une interface interne.

Contrat minimal :

```ts
type ExternalRecipeProvider = {
  searchByIngredients(input: {
    ingredients: Array<{ name: string; quantity?: number; unit?: string }>;
    limit: number;
    locale?: string;
  }): Promise<ExternalRecipeSuggestion[]>;
  getRecipeDetails(providerRecipeId: string): Promise<ExternalRecipeDetails>;
}
```

Le code applicatif ne doit jamais appeler Spoonacular ou Edamam directement depuis les composants UI.

### `GET /api/health/today`

Usage :

- afficher la progression macro de la journee dans la vue `Sante` ;
- alimenter un widget compact sur le dashboard si utile ;
- recalculer apres consommation, recette cuisinee ou undo.

Parametres :

```text
date: YYYY-MM-DD optionnel, defaut date locale utilisateur
```

Reponse cible :

```ts
type DailyMacroProgress = {
  date: string;
  timezone: string;
  estimated: boolean;
  totals: {
    caloriesKcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  goals: {
    caloriesKcal?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
  };
  remaining: {
    caloriesKcal?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
  };
  progress: {
    caloriesPct?: number;
    proteinPct?: number;
    carbsPct?: number;
    fatPct?: number;
  };
  topContributors: Array<{
    label: string;
    macro: "calories" | "protein" | "carbs" | "fat";
    value: number;
  }>;
}
```

Regles :

- les donnees sont personnelles a l'utilisateur ;
- un membre du foyer ne voit pas les donnees sante d'un autre membre par defaut ;
- les donnees de sante ne doivent pas etre loggees en clair ;
- les totaux doivent exclure les entrees annulees ;
- les objectifs absents doivent etre geres proprement ;
- les donnees estimees doivent etre signalees.

### `POST /api/nutrition/entries`

Usage :

- ajout manuel d'un apport ;
- correction d'un apport ;
- futur journal alimentaire rapide ;
- fallback quand un produit ou une recette n'a pas ete consomme via le stock.

Regles :

- validation Zod stricte ;
- attribution utilisateur obligatoire ;
- foyer verifie ;
- un utilisateur ne peut creer une entree nutritionnelle que pour lui-meme, sauf flux explicite de repartition recette ;
- macros en snapshot ;
- entree annulable ;
- pas d'ecrasement silencieux d'un historique deja cree.

### `POST /api/recipes/[id]/save`

Usage :

- sauvegarder une recette locale ou externe dans `Mes recettes` ;
- conserver une recette externe pour la retrouver meme si le fournisseur change ;
- preparer le mode favori et la reproduction rapide.

Regles :

- si la recette est externe, creer un snapshot local minimal ;
- conserver `provider` et `providerRecipeId` ;
- ne pas dupliquer inutilement une recette deja sauvegardee ;
- permettre ensuite de la marquer en favori ;
- si l'utilisateur modifie la recette, creer une copie locale editable.

### `POST /api/recipes/[id]/favorite`

Usage :

- ajouter ou retirer une recette des favoris ;
- fonctionner pour les recettes locales et sauvegardees externes ;
- influencer le scoring des suggestions sans masquer les contraintes stock/allergies.

## Contrats UI

### Recettes

Une carte recette doit afficher :

- image ;
- titre ;
- temps de preparation ;
- portions ;
- score de faisabilite ;
- ingredients manquants ;
- ingredients optionnels manquants ;
- badges DLC / allergie / favori ;
- actions : cuisiner, ajouter manquants aux courses, aimer, masquer.
- action : enregistrer dans `Mes recettes` si la recette vient d'une source externe.

### Mes recettes et favoris

`Mes recettes` doit regrouper :

- recettes creees par l'utilisateur ;
- recettes sauvegardees depuis un fournisseur externe ;
- recettes favorites ;
- recettes recemment cuisinees, si utile.

Une recette favorite doit rester facile a retrouver, mais elle ne doit pas ignorer :

- allergenes ;
- ingredients manquants ;
- DLC ;
- donnees nutritionnelles incompletes.

### Creation recette

L'ecran de creation recette doit proposer :

- saisie titre, portions, temps et image ;
- ajout d'ingredient depuis l'inventaire ;
- recherche Open Food Facts avec 5 resultats ;
- saisie libre si aucun resultat ne convient ;
- quantite, unite et optionnel/ou obligatoire ;
- etapes de preparation ;
- apercu faisabilite avec le stock actuel ;
- apercu macros avec indicateur si donnees incompletes ;
- sauvegarde brouillon ;
- activation de la recette pour le foyer.

L'UI doit rendre clair si un ingredient est :

- lie a un produit de l'inventaire ;
- lie a un produit Open Food Facts ;
- libre et non mappe ;
- sans macros ;
- converti avec une estimation ;
- optionnel.

### Ajout inventaire enrichi

Le parcours d'ajout inventaire doit proposer deux entrees equivalentes :

- scan code-barres ;
- recherche texte Open Food Facts.

Apres selection d'un resultat, l'utilisateur peut importer :

- nom ;
- marque ;
- image ;
- code-barres si disponible ;
- quantite commerciale ;
- categories ;
- allergenes ;
- macros ;
- donnees brutes modifiables par l'utilisateur.

### Sante et macros quotidiennes

La vue `Sante` doit devenir le centre de suivi nutritionnel.

Bloc prioritaire MVP 2 :

- `Aujourd'hui` ;
- calories consommees / objectif ;
- proteines, glucides, lipides consommes / objectifs ;
- reste a consommer ;
- indicateur `Estimation incomplete` si des produits manquent de macros ;
- dernieres entrees nutritionnelles de la journee ;
- action rapide pour ajouter une entree manuelle ;
- lien vers les produits ou recettes qui contribuent le plus.

En mode Sportif :

- chiffres precis ;
- barres de progression ;
- pourcentage de chaque objectif ;
- top contributeurs par macro ;
- historique 7 jours ensuite.

En mode Grand Public :

- langage plus simple ;
- progression globale ;
- conseils courts ;
- pas de pression excessive sur les chiffres.

Un widget compact peut apparaitre sur le dashboard, mais la source de verite visuelle reste `Sante`.

### Mode cuisine

Le mode cuisine doit afficher :

- portions ciblees ;
- proposition partielle si besoin ;
- quantites ajustees ;
- lots qui seront consommes ;
- produits a DLC proche ;
- avertissement allergene si concerne ;
- repartition macro entre membres si le foyer contient plusieurs utilisateurs ;
- membres selectionnes pour l'attribution des apports ;
- confirmation avant deduction.

### Notifications

L'utilisateur doit pouvoir configurer :

- notifications activees/desactivees ;
- delai DLC ;
- bilan hebdomadaire plus tard ;
- etat d'autorisation navigateur.

## Tests attendus

Tests domaine :

- calcul de faisabilite recette ;
- ingredients optionnels non bloquants ;
- ratio de portions partielles ;
- priorite DLC ;
- allergene detecte ;
- calcul macros recette avec donnees incompletes ;
- mapping ingredient libre / produit lie ;
- calcul totaux macro journaliers ;
- exclusion des entrees nutritionnelles annulees ;
- progression face aux objectifs macro ;
- repartition macro d'une recette entre plusieurs utilisateurs ;
- confidentialite des objectifs et macros par utilisateur ;
- conversion estimee d'unites non standard ;
- notification quotidienne non dupliquee.

Tests RPC / SQL :

- `cook_recipe` verifie user + foyer ;
- `cook_recipe` verrouille les lots ;
- `cook_recipe` refuse la surconsommation ;
- `cook_recipe` cree mouvements + cooked recipe + activity event ;
- `cook_recipe` cree des entrees nutritionnelles personnelles quand la recette est consommee maintenant ;
- undo restaure les quantites ;
- undo annule aussi les entrees nutritionnelles liees ;
- RPC reservees au `service_role`.

Tests API :

- recherche produit limitee a 5 resultats ;
- recherche produit degrade vers resultat vide ou saisie manuelle si Open Food Facts echoue ;
- import produit normalise sans exposer le payload brut ;
- `/api/health/today` respecte l'utilisateur courant ;
- `/api/health/today` ne permet pas de lire les macros d'un autre membre du foyer ;
- `/api/health/today` ne logge pas les donnees de sante en clair ;
- ajout entree nutritionnelle manuel valide les macros ;
- sauvegarde recette externe cree un snapshot local minimal ;
- favori recette influence la recuperation dans `Mes recettes` ;
- routes rate-limitees ;
- erreurs publiques generiques ;
- payloads invalides refuses ;
- allergie jamais loggee en clair.

Tests E2E :

- ajout inventaire par recherche Open Food Facts ;
- creation recette utilisateur depuis inventaire ;
- creation recette utilisateur avec ingredient recherche ;
- suivi macro du jour mis a jour apres consommation ;
- suivi macro du jour mis a jour apres recette cuisinee ;
- recette cuisinee repartie entre plusieurs membres selectionnes ;
- undo retire l'apport macro de la journee ;
- recette externe sauvegardee visible dans `Mes recettes` ;
- recette faisable cuisinee ;
- recette partiellement faisable ajustee ;
- optionnel manquant visible ;
- allergene visible avec modal ;
- ingredient manquant ajoute aux courses ;
- notification preference sauvegardee.

## Ordre recommande

1. Stabiliser le modele nutrition : produits, macros, estimations et corrections.
2. Ajouter la route commune `GET /api/products/search`.
3. Ameliorer l'ajout inventaire avec la recherche Open Food Facts.
4. Ajouter le modele de journal nutritionnel quotidien.
5. Brancher `/api/health/today` et les entrees nutritionnelles.
6. Ajouter le bloc `Aujourd'hui` dans la vue `Sante`.
7. Ajouter les tests domaine/API sur macros, confidentialite et estimations.
8. Ecrire les helpers domaine de faisabilite recette, scoring et nutrition estimee.
9. Completer les migrations DB pour recettes utilisateur, ingredients lies, favoris et notifications.
10. Ajouter les CRUD recettes utilisateur.
11. Ajouter `Mes recettes`, favoris et sauvegarde de recettes externes.
12. Ajouter les RPC `cook_recipe`, repartition macro et feedback.
13. Brancher les routes API recettes.
14. Construire l'UI recettes en lecture seule.
15. Ajouter l'ecran creation/modification recette.
16. Brancher le mode cuisine.
17. Ajouter notifications DLC groupees.
18. Ajouter les tests E2E critiques.
19. Evaluer puis brancher un fournisseur recette externe derriere adaptateur si necessaire.

## Questions a garder ouvertes

- Les recettes utilisateur sont-elles partagees par defaut avec tout le foyer ou privees par defaut ?
- Spoonacular est-il valide comme fournisseur recette principal apres test quota, cout et qualite en francais ?
- Faut-il supporter les substitutions d'ingredients des le MVP 2 ou les repousser ?
- Faut-il une estimation DLC automatique quand des ingredients manquants sont ajoutes aux courses ?
- Comment gerer le cas "je cuisine maintenant mais je mange plus tard" : plat prepare, portions stockees ou simple entree manuelle ?
