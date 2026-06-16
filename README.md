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

- Node.js 20 ou plus.

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
- Les migrations database versionnees sont dans `supabase/migrations/`.
- Pour une base Supabase neuve ou remise a zero, utiliser `supabase db push`.

Variables attendues :

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

OAuth setup:

- Configure Google / Apple providers in the Supabase dashboard.
- Add the redirect URIs used by your app (e.g. `http://localhost:3000` for local dev and `https://your-domain.com` for production).
- Ensure the Supabase project's authentication settings allow the selected providers.

## Validation MVP 1

Checks techniques :

```bash
npm run typecheck
npm run lint
npm run build
```

Checklist manuelle :

- inscription ;
- connexion (email + Google) ;
- onboarding ;
- ajout manuel ;
- recherche Open Food Facts (code-barres) ;
- scan camera ;
- ajout au stock ;
- reduction / consommation / jet ;
- historique ;
- annulation ;
- liste de courses ;
- finalisation des courses ;
- affichage mobile des modales.


## Documents de cadrage

- `architecture-ecofoodstock.md`
- `cadrage-mvp-ecofoodstock.md`
- `revue-captures-ecrans-ecofoodstock.md`
- `schema-bdd-ecofoodstock.sql`
