# Prompt de reprise pour Codex dans VS Code - EcoFoodStock

Tu reprends un projet appele EcoFoodStock. Le contexte vient d'une conversation precedente dans l'application Codex Desktop, qui n'est pas directement disponible ici. Tu dois continuer comme si tu avais suivi toute la discussion.

## Role attendu

Agis comme un assistant produit + UX + developpement frontend. Tu dois aider a transformer un cahier des charges fonctionnel en application web/mobile responsive, puis comparer les maquettes Figma aux exigences produit. Travaille en francais. Sois concret, critique de maniere constructive, et garde en tete qu'on construit un vrai produit utilisable, pas seulement une demo jolie.

## Projet

EcoFoodStock est une application web et mobile responsive qui agit comme un assistant domestique alimentaire intelligent. Elle vise a :

- reduire la charge mentale liee aux repas ;
- limiter le gaspillage alimentaire ;
- gerer un stock alimentaire domestique ;
- proposer des recettes selon les produits disponibles ;
- suivre l'equilibre nutritionnel ou les macros selon le profil ;
- faciliter les courses ;
- conserver un historique clair des actions.

L'application doit fonctionner pour deux grands profils :

- Mode Grand Public : economie, anti-gaspillage, simplicite, pedagogie, equilibre alimentaire global.
- Mode Sportif / Suivi Macro : precision, calories, proteines, glucides, lipides, objectifs quotidiens, historique chiffre.

## Parcours utilisateur attendu

L'onboarding doit etre simple et progressif :

1. Connexion ou inscription via Google, Apple, email/mot de passe.
2. Mot de passe oublie.
3. Configuration du foyer : nombre de personnes.
4. Preferences alimentaires/allergies : omnivore, vegetarien, vegan, pescetarien, sans gluten.
5. Choix du mode : Grand Public ou Sportif.
6. Si Sportif : sexe, taille, poids, puis calcul ou saisie d'objectifs nutritionnels.

## Fonctionnalites principales

### Gestion du stock

L'inventaire est le centre de l'application. Il doit permettre :

- scanner un code-barres via camera ;
- recuperer les informations produit via Open Food Facts : nom, marque, categorie, photo, valeurs nutritionnelles ;
- ajouter manuellement des produits sans code-barres ;
- saisir la quantite ;
- saisir une DLC facultative ;
- afficher une liste compacte avec miniature, nom, quantite, edition/suppression ;
- rechercher un produit ;
- filtrer par Tous, Frais, Surgeles, Sec, DLC proche ;
- decrementer partiellement une quantite, par exemple 50% d'un paquet.

### Recettes intelligentes

Le moteur de recettes doit croiser l'inventaire avec une base externe comme Spoonacular ou Edamam. Il doit :

- prioriser les produits proches de la DLC ;
- afficher des cartes de recettes avec photo, temps de preparation, faisabilite ;
- indiquer "100% ingredients dispo" ou "Il manque : X" ;
- proposer "Cuisiner" ou "Ajouter l'ingredient manquant aux courses" ;
- permettre Like / Dislike ;
- enregistrer les favoris ;
- masquer ou adapter les suggestions apres un dislike ;
- proposer une raison optionnelle de dislike ;
- entrer en "Mode Cuisine" : confirmation puis deduction automatique des ingredients utilises dans l'inventaire.

### Sante et nutrition

L'onglet Sante doit changer fortement selon le mode.

Mode Grand Public :

- ratio Frais vs Transforme sur 7 jours ;
- objectif ludique de plus de 70% de produits bruts/frais ;
- radar des familles alimentaires : fruits, legumes, feculents, laitages, proteines ;
- score de saisonnalite.

Mode Sportif :

- graphique mixte sur 7 jours glissants ;
- calories en courbe avec objectif quotidien ;
- proteines, glucides, lipides en barres empilees ;
- tooltip avec valeurs exactes ;
- top 3 des ingredients contributeurs par macro.

Commun :

- insights textuels intelligents en haut de l'onglet, positifs ou correctifs.

### Courses

La liste de courses doit etre separee en deux onglets :

- Suggestions : produits recurrentement epuises, boost nutritionnel, ingredients manquants de recettes.
- Ma Liste : mode supermarche minimaliste, regroupe par rayons, cases a cocher larges.

Quand un article est coche :

- texte barre ;
- ligne grisee ;
- article deplace en bas dans une section "Articles dans le panier".

Quand au moins un article est coche :

- bouton "Terminer les courses" ;
- confirmation ;
- transfert direct vers l'inventaire avec DLC estimee.

### Historique

Vue timeline dense :

- actions regroupees par jour : Aujourd'hui, Hier, etc. ;
- pastille verte : produit ajoute ;
- pastille bleue : recette cuisinee ;
- pastille grise : produit consomme ;
- pastille rouge : produit jete ;
- bouton Annuler sur actions recentes ;
- bouton Refaire sur recettes passees ;
- distinction stricte consomme vs jete pour calculer le score anti-gaspillage.

### Parametres et foyer

Les parametres doivent permettre :

- inviter un membre via lien securise ou QR code ;
- synchroniser inventaire et liste de courses en temps reel ;
- conserver un profil nutritionnel propre a chaque membre ;
- changer de mode Grand Public / Sportif sans perdre l'historique ;
- modifier poids, quotas, preferences alimentaires.

### Notifications

Notifications push :

- alertes DLC avec delai configurable : 1, 2 ou 3 jours ;
- regroupement quotidien pour eviter le spam ;
- rappel de courses geolocalise optionnel ;
- bilan hebdomadaire le dimanche soir.

### Confidentialite

L'utilisateur doit pouvoir :

- exporter ses donnees en CSV ou PDF ;
- supprimer definitivement son compte, inventaire, historiques et donnees physiologiques.

## Figma actuel

Lien Figma Make de la maquette :

https://www.figma.com/make/wBNf2MeGlhXwloRuDCrnmj/Responsive-Web-Application?fullscreen=1&t=kJSyp0rtBfWslgvK-1&code-node-id=0-9

Ce lien est une maquette Figma Make, pas un fichier Figma Design classique. Dans la conversation precedente, l'analyse s'est faite via la structure exposee par Figma Make.

La premiere version contenait deja :

- AuthScreen ;
- OnboardingScreen ;
- Dashboard ;
- HealthScreen ;
- HistoryScreen ;
- ShoppingScreen ;
- SettingsScreen ;
- graphiques : FreshVsProcessedChart, FoodFamiliesChart, WeeklyMacrosChart.

Avis sur la premiere version :

- la structure globale etait comprise ;
- elle correspondait deja au cahier des charges a haut niveau ;
- elle ressemblait davantage a une presentation fonctionnelle qu'a un produit vraiment actionnable ;
- il fallait verifier la presence du scanner, du mode cuisine, de la decrementations partielle, du foyer partage, des notifications et de l'export/suppression des donnees.

La nouvelle version a ajoute :

- InventoryScreen ;
- RecipesScreen ;
- AddProductDialog ;
- useInventory.

Avis sur la nouvelle version :

- c'est une nette amelioration ;
- la maquette passe d'un dashboard generaliste a une structure plus produit ;
- l'inventaire devient un vrai ecran central ;
- les recettes ont leur espace propre ;
- l'ajout produit devient un parcours identifie ;
- la separation sante, courses, historique et parametres reste coherente.

Points a surveiller encore :

- rendre tres visible le scanner, car c'est la fonctionnalite principale ;
- differencier fortement les interfaces Grand Public et Sportif dans l'onglet Sante ;
- representer clairement les etats DLC proche, quantite partielle, produit consomme ou jete ;
- mettre en avant le Mode Cuisine avec deduction automatique du stock ;
- ne pas cacher foyer partage, notifications et confidentialite uniquement dans les parametres ;
- verifier la lisibilite responsive et les parcours reels ecran par ecran.

## Objectif de la suite

Tu dois aider a faire une revue produit/UX/developpement de la maquette actuelle et/ou a l'implementer en code. La prochaine etape logique est :

1. Lire la structure du projet local si du code existe.
2. Comprendre les composants et routes existants.
3. Comparer la maquette Figma et le cahier des charges.
4. Identifier les ecarts : absent, partiellement fait, bien couvert.
5. Proposer ou implementer les ameliorations prioritaires.

## Methode de travail souhaitee

Priorite au concret :

- ne pas seulement dire "c'est bien" ;
- expliquer ce qui est clair, ce qui manque, ce qui doit etre priorise ;
- quand tu modifies le code, rester proche de l'architecture existante ;
- faire une verification visuelle si une app locale peut etre lancee ;
- donner un retour simple et exploitable.

Pour une revue Figma ou produit, structure la reponse ainsi :

1. Verdict global.
2. Ce qui marche bien.
3. Ce qui manque ou risque de coincer.
4. Priorites concretes pour la prochaine iteration.
5. Eventuellement, checklist cahier des charges vs maquette.

## Ton attendu

Reponds en francais. Sois chaleureux, direct et utile. L'utilisateur veut avancer vite et ne pas perdre le contexte de la conversation precedente.
