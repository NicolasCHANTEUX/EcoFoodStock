# Securite production

Ce document complete les controles applicatifs par les operations indispensables avant une exposition publique.

## Secrets et service role Supabase

- `SUPABASE_SERVICE_ROLE_KEY` doit exister uniquement dans les variables serveur de l'hebergeur.
- Ne jamais prefixer cette cle par `NEXT_PUBLIC_`.
- Ne jamais l'utiliser dans un composant React client, un service worker ou du JavaScript livre au navigateur.
- Regenerer la cle si elle a ete collee dans un ticket, un chat, un log ou une capture.
- Garder les RPC critiques reservees au role `service_role` et continuer a verifier l'appartenance foyer dans chaque RPC.
- L'application refuse au runtime une cle `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`, une cle placeholder ou une cle `service_role` identique a l'anon key.
- Chaque mois, verifier les scopes Vercel/GitHub, l'absence de la cle dans les logs et l'historique Git, puis renseigner `ECOFOODSTOCK_SERVICE_ROLE_REVIEWED_AT`.

## Auth et URLs

- Configurer `APP_BASE_URL` avec l'origine canonique de production, par exemple `https://ecofoodstock.example`.
- Dans Supabase Auth > URL Configuration, utiliser cette origine comme Site URL.
- Autoriser uniquement les chemins necessaires sous l'origine canonique, par exemple `https://ecofoodstock.example/**`. Retirer les domaines de preview et localhost du projet production.
- En production, l'application refuse de construire les redirections auth depuis l'origin entrant.
- Apres verification, renseigner `ECOFOODSTOCK_AUTH_REDIRECTS_VERIFIED_AT` avec la date ISO du controle.

## Variables obligatoires en production

| Variable | Stockage recommande | Regle |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + GitHub variable | URL du projet Supabase production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + GitHub variable | Cle anon publique, differente du service role |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret Vercel + secret GitHub Environment | Jamais de prefixe `NEXT_PUBLIC_` |
| `APP_BASE_URL` | Vercel + GitHub variable | Origine HTTPS canonique sans chemin |
| `ECOFOODSTOCK_STRICT_CSP` | Vercel + GitHub variable | `true` |
| `ECOFOODSTOCK_CLIENT_IP_STRATEGY` | Vercel | `auto` ou proxy explicitement approuve |
| `ECOFOODSTOCK_BACKUPS_ENABLED` | GitHub variable | `true` uniquement apres verification reelle |
| `ECOFOODSTOCK_BACKUP_VERIFIED_AT` | GitHub variable | Date ISO de moins de 8 jours |
| `ECOFOODSTOCK_RESTORE_TESTED_AT` | GitHub variable | Date ISO d'un test staging de moins de 31 jours |
| `ECOFOODSTOCK_AUTH_REDIRECTS_VERIFIED_AT` | GitHub variable | Date ISO d'une revue de moins de 31 jours |
| `ECOFOODSTOCK_SERVICE_ROLE_REVIEWED_AT` | GitHub variable | Date ISO d'une revue de moins de 31 jours |

Ne pas inventer les dates d'attestation : elles representent des controles humains effectivement realises.

## Sauvegardes et restauration

Avant mise en production :

- activer les backups Supabase adaptes au niveau de service choisi ;
- documenter une restauration testee sur un projet Supabase de staging ;
- exporter regulierement le schema et verifier que les migrations rejouent depuis zero ;
- tester au moins une restauration avant d'ouvrir l'application a des utilisateurs reels.
- suivre la procedure detaillee dans [procedure-backup-restauration-supabase.md](./procedure-backup-restauration-supabase.md).
- executer `npm run security:prod-check` dans le pipeline de deploiement apres avoir renseigne les attestations de backup et de restauration.

## Workflow pre-production et audit dynamique

Le workflow `.github/workflows/production-security-check.yml` est manuel (`workflow_dispatch`) et reutilisable (`workflow_call`). Il utilise le GitHub Environment protege `production`.

Configurer dans cet Environment les variables du tableau ci-dessus et le secret `SUPABASE_SERVICE_ROLE_KEY`, puis lancer le workflow avant chaque deploiement production. Il execute :

- `npm run security:prod-check` pour la configuration et les attestations ;
- `npm run security:deployed-check` contre `APP_BASE_URL` pour verifier CSP, HSTS, headers navigateur, nonces HTML et refus anonyme de `/api/health/summary`.

Le workflow doit etre protege par des reviewers GitHub afin qu'une attestation ou un secret ne puisse pas etre modifie sans validation.

## CSP et headers

Les headers actuels incluent CSP, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, Permissions-Policy et HSTS en production.

La CSP stricte est activee par defaut en production et `ECOFOODSTOCK_STRICT_CSP=true` est la valeur recommandee en staging et production :

- le middleware genere un nonce par requete ;
- le nonce est propage au layout via `x-nonce` ;
- `script-src` et `style-src` utilisent `nonce-...` et retirent `unsafe-inline` ;
- verifier Sentry, service worker, PWA, installation mobile et hydration sur mobile avant de garder le flag actif.

Les anciens styles React inline ont ete remplaces par des classes CSS et des attributs SVG. Le mode compatible avec `unsafe-inline` ne reste disponible que si la CSP stricte est explicitement desactivee pour un diagnostic local.

Le mode nonce lit les headers de requete dans le layout et rend donc les pages dynamiques. Valider l'impact performance et cache sur staging avant activation definitive.

## Checklist avant production

- [ ] `APP_BASE_URL` configure.
- [ ] Redirect URLs Supabase verrouillees.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` regeneree et stockee uniquement cote serveur.
- [ ] Backups actives.
- [ ] Restauration testee.
- [ ] Alertes Sentry actives.
- [ ] Workflow GitHub vert, y compris integration Supabase.
- [ ] `ECOFOODSTOCK_STRICT_CSP=true` valide en staging et configure en production.
- [ ] `npm run security:prod-check` vert avec des dates d'attestation reelles.
- [ ] Workflow `Production security check` vert contre l'URL reellement deployee.
