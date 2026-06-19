# Securite production

Ce document complete les controles applicatifs par les operations indispensables avant une exposition publique.

## Secrets et service role Supabase

- `SUPABASE_SERVICE_ROLE_KEY` doit exister uniquement dans les variables serveur de l'hebergeur.
- Ne jamais prefixer cette cle par `NEXT_PUBLIC_`.
- Ne jamais l'utiliser dans un composant React client, un service worker ou du JavaScript livre au navigateur.
- Regenerer la cle si elle a ete collee dans un ticket, un chat, un log ou une capture.
- Garder les RPC critiques reservees au role `service_role` et continuer a verifier l'appartenance foyer dans chaque RPC.

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

## CSP et headers

Les headers actuels incluent CSP, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, Permissions-Policy et HSTS en production.

La CSP garde encore `unsafe-inline` pour les scripts/styles afin de ne pas casser Next.js App Router sans strategie de nonce. Avant un lancement public large, prevoir une passe dediee :

- generer un nonce par requete ;
- le propager aux scripts/styles compatibles ;
- retirer progressivement `unsafe-inline` ;
- verifier Sentry, service worker, PWA et hydration sur mobile.

## Checklist avant production

- [ ] `APP_BASE_URL` configure.
- [ ] Redirect URLs Supabase verrouillees.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` regeneree et stockee uniquement cote serveur.
- [ ] Backups actives.
- [ ] Restauration testee.
- [ ] Alertes Sentry actives.
- [ ] Workflow GitHub vert, y compris integration Supabase.
- [ ] CSP stricte planifiee ou validee avec nonces.
