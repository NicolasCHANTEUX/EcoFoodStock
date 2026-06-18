# Observabilite production

EcoFoodStock dispose de deux niveaux complementaires d'observabilite :

- des logs JSON sur la sortie standard, exploitables par Vercel ou tout agregateur de logs ;
- Sentry pour le suivi des erreurs, les traces, les alertes et le dashboard de production.

Sentry reste totalement desactive tant qu'aucun DSN n'est configure.

## Logs structures

Le logger `src/lib/observability/logger.ts` produit une ligne JSON par evenement avec :

- `timestamp` ;
- `level` ;
- `service` ;
- `environment` ;
- `event` ;
- `message` ;
- `requestId` quand le log est lie a une requete ;
- `context` nettoye ;
- l'erreur serialisee pour les niveaux `error`.

Le middleware ajoute un identifiant `x-request-id` aux requetes et reponses API. Cet identifiant peut etre recherche dans les logs et dans les tags Sentry.

Les champs sensibles sont masques recursivement avant journalisation : mots de passe, cookies, headers d'autorisation, tokens, cles, emails et donnees de sante. Ne jamais contourner le logger avec un `console.log` contenant un payload utilisateur.

## Activation Sentry

Creer un projet Next.js dans Sentry puis configurer les variables suivantes dans l'environnement de deploiement :

```text
SENTRY_DSN=<dsn du projet>
NEXT_PUBLIC_SENTRY_DSN=<meme dsn public>
SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
```

Pour obtenir des stack traces lisibles apres minification, ajouter aussi :

```text
SENTRY_ORG=<slug organisation>
SENTRY_PROJECT=<slug projet>
SENTRY_AUTH_TOKEN=<token CI secret>
```

`SENTRY_AUTH_TOKEN` doit rester un secret du fournisseur de CI/deploiement et ne doit jamais etre expose au navigateur ou commite.

La collecte PII par defaut est desactivee. Les replays de session ne sont pas actives, afin de limiter la collecte sur une application qui manipule des donnees personnelles et de sante.

## Alertes recommandees

Dans Sentry, creer au minimum :

- une alerte immediate sur toute nouvelle erreur en production ;
- une alerte de regression sur une erreur resolue qui reapparait ;
- une alerte de volume si le nombre d'erreurs depasse 10 sur 5 minutes ;
- une alerte de taux d'erreur HTTP si le seuil depasse 5 % sur 10 minutes.

Router les alertes vers l'email du mainteneur, puis vers Slack ou Teams si le projet devient collaboratif.

## Verification apres deploiement

1. Verifier qu'une navigation produit une trace dans Sentry.
2. Declencher une erreur controlee sur un environnement de staging.
3. Verifier l'apparition de l'erreur, de l'environnement et du `request_id`.
4. Verifier que l'alerte est recue.
5. Rechercher le meme `requestId` dans les logs JSON de l'hebergeur.
6. Confirmer qu'aucun email, token, cookie ou donnee de sante n'apparait dans l'evenement.

## Dependances

- La CI bloque les vulnerabilites de production hautes ou critiques.
- `.github/workflows/dependency-audit.yml` relance cet audit chaque lundi et a la demande.
- Dependabot verifie chaque semaine npm et GitHub Actions et groupe les mises a jour mineures/correctives.
- Les vulnerabilites moderees restent a examiner avant chaque mise en production, meme si elles ne bloquent pas automatiquement la CI.
