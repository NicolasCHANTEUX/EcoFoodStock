# EcoFoodStock

Application web responsive mobile-first pour gerer un stock alimentaire domestique, suivre les DLC, preparer une liste de courses simple et conserver un historique detaille.

## Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase / PostgreSQL

## MVP 1

Inclus :

- authentification ;
- onboarding ;
- inventaire ;
- scan Open Food Facts ;
- ajout manuel ;
- DLC ;
- quantites simples ;
- courses simples ;
- historique ;
- parametres de base.

Note MVP 1 courses -> inventaire :

- la finalisation des courses archive la liste et cree un evenement d'activite ;
- le transfert automatique des articles coches vers `inventory_batches` n'est pas active dans ce MVP ;
- apres les courses, ajouter les produits au stock via l'ecran inventaire (scan code-barres ou saisie manuelle).

Repousse :

- recettes ;
- notifications ;
- sante avancee ;
- suggestions avancees ;
- exports/RGPD complets.

## Lancement local

Prerequis :

- Node.js 24 ou plus.

```bash
npm install
npm run dev
```

Puis ouvrir :

```text
http://localhost:3000
```

## Installation PWA

L'application est configuree comme PWA :

- manifeste web : `public/manifest.webmanifest` ;
- icones 192 / 512 : `public/icon-192.svg` et `public/icon-512.svg` ;
- service worker : `public/sw.js` ;
- page hors-ligne minimale : `public/offline.html` ;
- invite d'installation Chrome / Android quand `beforeinstallprompt` est disponible ;
- aide iOS pour l'ajout manuel a l'ecran d'accueil.

En local, Chrome peut proposer l'installation sur `localhost`. Si l'option n'apparait pas tout de suite, recharger une fois la page apres le premier chargement pour laisser le service worker s'enregistrer.

## Donnees et API

- Supabase est prepare via les clients dans `src/lib/supabase/`.
- Renseigner les variables dans `.env.local` a partir de `.env.example`.
- Le lookup code-barres passe par `GET /api/products/lookup/[barcode]`.
- Cette route interroge Open Food Facts, API gratuite de reference pour les produits alimentaires.
- Les enrichissements Open Food Facts trouves sont caches en base dans `products.off_*` pour eviter de rappeler l'API a chaque scan.
- Les images Open Food Facts passent par `/api/images` avec timeout court, cache navigateur/CDN, cache negatif bref et rate limit uniquement sur les MISS du proxy.
- Les migrations database versionnees sont dans `supabase/migrations/`.
- Pour une base Supabase neuve ou remise a zero, utiliser `supabase db push`.

Variables attendues :

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ECOFOODSTOCK_CLIENT_IP_STRATEGY=auto
```

`ECOFOODSTOCK_CLIENT_IP_STRATEGY` controle quels headers IP sont fiables pour le rate limit :

- `auto` : recommande par defaut. En dev, accepte les headers locaux. En prod Vercel, utilise `x-forwarded-for`. En autre prod, ne fait pas confiance aux headers IP.
- `vercel` : utilise `x-forwarded-for`, a reserver a un deploiement derriere Vercel.
- `cloudflare` : utilise `cf-connecting-ip`, a reserver a un trafic force derriere Cloudflare.
- `trusted-proxy` : utilise `x-forwarded-for` / `x-real-ip`, uniquement si un proxy de confiance nettoie ces headers.
- `none` : ignore les headers IP et groupe les requetes sous une cle inconnue.

En production, placer `/api/images` derriere le CDN de l'hebergeur. La route envoie `Cache-Control`, `CDN-Cache-Control` et `Vercel-CDN-Cache-Control` pour conserver les images Open Food Facts longtemps cote CDN, garder les erreurs seulement quelques minutes, et limiter les appels reseau au strict necessaire.

OAuth setup:

- Configure Google / Apple providers in the Supabase dashboard.
- Add the redirect URIs used by your app (e.g. `http://localhost:3000` for local dev and `https://your-domain.com` for production).
- Ensure the Supabase project's authentication settings allow the selected providers.

## Validation MVP 1

Checks techniques :

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

La checklist manuelle complete est dans `docs/mvp1-checklist.md`.

## Observabilite et dependances

- Les erreurs serveur sont journalisees en JSON avec un `requestId` et les champs sensibles masques.
- Sentry est prepare pour le suivi des erreurs et des traces ; il reste desactive sans `SENTRY_DSN`.
- La CI et le workflow hebdomadaire bloquent les vulnerabilites de production hautes ou critiques.
- Dependabot surveille chaque semaine les dependances npm et les GitHub Actions.
- La configuration production et les alertes recommandees sont documentees dans `docs/observabilite-production.md`.

## Documents de cadrage

- `docs/README.md`
- `docs/cadrage-mvp-ecofoodstock.md`
- `docs/ToDo.md`
- `docs/mvp1-checklist.md`
- `docs/architecture-ecofoodstock.md`
- `docs/revue-captures-ecrans-ecofoodstock.md`
- `docs/observabilite-production.md`
- `schema-bdd-ecofoodstock.sql`
