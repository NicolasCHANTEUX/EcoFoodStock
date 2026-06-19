# Securite production

Ce document complete les controles applicatifs par les operations indispensables avant une exposition publique.

## Secrets et service role Supabase

- `SUPABASE_SERVICE_ROLE_KEY` doit exister uniquement dans les variables serveur de l'hebergeur.
- Ne jamais prefixer cette cle par `NEXT_PUBLIC_`.
- Ne jamais l'utiliser dans un composant React client, un service worker ou du JavaScript livre au navigateur.
- Regenerer la cle si elle a ete collee dans un ticket, un chat, un log ou une capture.
- Garder les RPC critiques reservees au role `service_role` et continuer a verifier l'appartenance foyer dans chaque RPC.
- L'application refuse au runtime une cle `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`, une cle placeholder ou une cle `service_role` identique a l'anon key.

## Auth et URLs

- Configurer `APP_BASE_URL` avec l'origine canonique de production, par exemple `https://ecofoodstock.example`.
- Configurer les Redirect URLs Supabase avec cette meme origine.
- En production, l'application refuse de construire les redirections auth depuis l'origin entrant.

## Sauvegardes et restauration

Avant mise en production :

- activer les backups Supabase adaptes au niveau de service choisi ;
- documenter une restauration testee sur un projet Supabase de staging ;
- exporter regulierement le schema et verifier que les migrations rejouent depuis zero ;
- tester au moins une restauration avant d'ouvrir l'application a des utilisateurs reels.
- suivre la procedure detaillee dans [procedure-backup-restauration-supabase.md](./procedure-backup-restauration-supabase.md).

## CSP et headers

Les headers actuels incluent CSP, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, Permissions-Policy et HSTS en production.

Par defaut, la CSP compatible garde `unsafe-inline` pour les scripts/styles afin de ne pas casser Next.js App Router et les scripts d'initialisation. Pour une validation pre-production plus stricte, activer `ECOFOODSTOCK_STRICT_CSP=true` au build et au runtime :

- le middleware genere un nonce par requete ;
- le nonce est propage au layout via `x-nonce` ;
- `script-src` utilise `nonce-...` et retire `unsafe-inline` ;
- verifier Sentry, service worker, PWA, installation mobile et hydration sur mobile avant de garder le flag actif.

`style-src 'unsafe-inline'` reste autorise pour les styles React dynamiques actuels. Si l'application doit viser une CSP encore plus stricte, il faudra remplacer les styles inline restants par des classes CSS ou des variables controlees.

Le mode nonce lit les headers de requete dans le layout et rend donc les pages dynamiques. Valider l'impact performance et cache sur staging avant activation definitive.

## Checklist avant production

- [ ] `APP_BASE_URL` configure.
- [ ] Redirect URLs Supabase verrouillees.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` regeneree et stockee uniquement cote serveur.
- [ ] Backups actives.
- [ ] Restauration testee.
- [ ] Alertes Sentry actives.
- [ ] Workflow GitHub vert, y compris integration Supabase.
- [ ] `ECOFOODSTOCK_STRICT_CSP=true` valide en staging si la CSP stricte est requise.
