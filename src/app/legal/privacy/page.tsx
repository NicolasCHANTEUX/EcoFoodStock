import Link from "next/link";

const versionLabel = "Version du 3 juillet 2026";
const controllerPlaceholder = "A COMPLETER : identité du responsable de traitement, adresse, email vie privée / DPO le cas échéant";

export const metadata = {
  title: "Politique de confidentialité"
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-brand-50 px-4 py-10">
      <article className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
        <header className="border-b border-slate-100 pb-6">
          <p className="text-sm font-semibold text-brand-700">EcoFoodStock</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-slate-950">
            Politique de confidentialité
          </h1>
          <p className="mt-3 text-sm text-slate-500">{versionLabel}</p>
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
            {controllerPlaceholder}
          </p>
        </header>

        <div className="mt-8 space-y-8 text-sm leading-6 text-slate-700">
          <LegalSection title="1. Résumé">
            <p>
              EcoFoodStock traite les données nécessaires pour fournir un compte utilisateur, gérer un foyer alimentaire,
              synchroniser un inventaire, préparer des courses, conserver un historique, proposer des réglages
              nutritionnels et permettre l'export ou la suppression du compte.
            </p>
            <p>
              L'application ne vend pas les données personnelles, ne les utilise pas pour du ciblage publicitaire et ne
              prend pas de décision médicale automatisée. Les données physiques et nutritionnelles sont considérées comme
              sensibles dans l'organisation technique du projet et doivent être limitées au strict nécessaire.
            </p>
          </LegalSection>

          <LegalSection title="2. Responsable de traitement">
            <p>
              Le responsable de traitement est l'éditeur d'EcoFoodStock, dont l'identité et les coordonnées doivent être
              complétées avant mise en production publique. C'est ce responsable qui détermine les finalités et moyens
              des traitements décrits dans cette politique.
            </p>
            <p>
              Pour exercer un droit ou poser une question sur les données personnelles, l'utilisateur doit pouvoir
              contacter l'éditeur à l'adresse de contact indiquée en tête de page, une fois complétée.
            </p>
          </LegalSection>

          <LegalSection title="3. Données traitées">
            <p>Selon l'utilisation réelle du service, EcoFoodStock peut traiter les catégories suivantes :</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>compte : identifiant, email, nom et prénom, fournisseur de connexion, dates techniques liées au compte ;</li>
              <li>consentement légal : date d'acceptation, version des CGU et version de la politique de confidentialité ;</li>
              <li>foyer : foyer créé ou rejoint, rôle, invitation, taille du foyer ;</li>
              <li>inventaire : produits, lots, quantités, unités, zones de stockage, dates de consommation, statut des lots ;</li>
              <li>courses : listes, articles, quantités, catégories, articles cochés ou archivés ;</li>
              <li>historique : actions sur le stock, les courses, les paramètres et annulations possibles ;</li>
              <li>préférences : régime alimentaire, mode Grand public ou Sportif, thème, préférences d'application ;</li>
              <li>données physiques ou nutritionnelles : âge dérivé de la date de naissance, poids, taille, sexe, objectif calorique ;</li>
              <li>données techniques : adresse IP, identifiants de requête, logs de sécurité, erreurs, informations de navigateur ;</li>
              <li>données locales : cache PWA, préférences, brouillons d'onboarding, état d'installation et données temporaires.</li>
            </ul>
          </LegalSection>

          <LegalSection title="4. Sources des données">
            <p>
              Les données proviennent principalement de l'utilisateur lorsqu'il crée un compte, configure son profil,
              scanne ou ajoute un produit, modifie son inventaire, prépare des courses ou utilise les paramètres.
            </p>
            <p>
              Certaines informations produit proviennent d'Open Food Facts après scan ou recherche : nom, marque,
              catégorie, image, quantité commerciale et données nutritionnelles disponibles. Les fournisseurs de connexion
              Google ou Apple peuvent transmettre les informations nécessaires à l'authentification lorsque l'utilisateur
              choisit ce mode de connexion.
            </p>
          </LegalSection>

          <LegalSection title="5. Finalités et bases légales">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-900">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Finalité</th>
                    <th className="px-4 py-3 font-semibold">Données concernées</th>
                    <th className="px-4 py-3 font-semibold">Base légale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <TableRow
                    basis="Exécution du contrat"
                    data="Compte, authentification, session"
                    purpose="Créer le compte, connecter l'utilisateur et sécuriser l'accès"
                  />
                  <TableRow
                    basis="Exécution du contrat"
                    data="Inventaire, lots, courses, historique, foyer"
                    purpose="Fournir les fonctionnalités principales de gestion du stock et du foyer"
                  />
                  <TableRow
                    basis="Exécution du contrat et consentement lorsque requis"
                    data="Date et version d'acceptation"
                    purpose="Enregistrer l'acceptation des CGU et de la politique"
                  />
                  <TableRow
                    basis="Exécution du contrat"
                    data="Préférences, régime, mode, données physiques et objectif calorique"
                    purpose="Personnaliser l'expérience et calculer des indicateurs affichés à l'utilisateur"
                  />
                  <TableRow
                    basis="Intérêt légitime"
                    data="Logs techniques, IP, identifiants de requête, rate limit"
                    purpose="Sécuriser le service, prévenir les abus, diagnostiquer les erreurs"
                  />
                  <TableRow
                    basis="Obligation légale et intérêt légitime"
                    data="Demandes de droits, export, suppression, traces de sécurité"
                    purpose="Répondre aux demandes RGPD et défendre les droits de l'éditeur"
                  />
                </tbody>
              </table>
            </div>
          </LegalSection>

          <LegalSection title="6. Données santé et nutrition">
            <p>
              Les informations relatives au poids, à la taille, au sexe, à l'âge, au régime alimentaire ou aux objectifs
              nutritionnels peuvent révéler des éléments sensibles. EcoFoodStock les utilise uniquement pour les réglages
              de l'application et les calculs affichés à l'utilisateur. Ces données ne sont pas destinées à établir un
              diagnostic, fournir un traitement, remplacer un professionnel de santé ou être partagées à des fins
              publicitaires.
            </p>
            <p>
              L'historique des paramètres évite de stocker les valeurs sensibles détaillées dans les métadonnées des
              événements. Il conserve plutôt une indication générale des champs modifiés.
            </p>
          </LegalSection>

          <LegalSection title="7. Destinataires et sous-traitants">
            <p>
              Les données sont accessibles uniquement aux personnes et services qui en ont besoin pour exploiter,
              maintenir, sécuriser ou héberger EcoFoodStock. Selon la configuration de production, les destinataires
              peuvent inclure :
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Supabase, pour l'authentification, la base PostgreSQL, les règles d'accès et les comptes ;</li>
              <li>l'hébergeur de l'application, par exemple Vercel si ce choix est retenu en production ;</li>
              <li>Open Food Facts, lorsque l'application interroge son API ou récupère des images produit ;</li>
              <li>Sentry, uniquement si le suivi d'erreurs est activé par configuration ;</li>
              <li>Google ou Apple, uniquement si l'utilisateur choisit l'authentification correspondante ;</li>
              <li>les autorités ou conseils professionnels, lorsque la loi l'exige ou pour défendre des droits.</li>
            </ul>
            <p>
              Les membres d'un même foyer peuvent voir les données communes du foyer. Ils ne sont pas censés accéder aux
              données physiques et objectifs nutritionnels strictement personnels d'un autre membre.
            </p>
          </LegalSection>

          <LegalSection title="8. Transferts hors Union européenne">
            <p>
              Certains prestataires techniques peuvent traiter ou héberger des données hors de l'Union européenne,
              notamment lorsqu'ils s'appuient sur une infrastructure internationale. Dans ce cas, l'éditeur doit s'assurer
              que des garanties appropriées existent, par exemple des clauses contractuelles types, un accord de
              traitement de données ou tout autre mécanisme reconnu par le RGPD.
            </p>
          </LegalSection>

          <LegalSection title="9. Durées de conservation">
            <p>Les durées exactes doivent être confirmées avant mise en production. A ce stade, les principes sont :</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>compte et profil : pendant la durée d'utilisation du compte, puis suppression ou anonymisation après suppression ;</li>
              <li>données de foyer : pendant l'appartenance au foyer, ou tant que le foyer existe avec d'autres membres ;</li>
              <li>inventaire, courses et historique : pendant la durée nécessaire à l'usage du foyer et à la traçabilité ;</li>
              <li>exports : une trace d'export peut être enregistrée avec une date d'expiration indicative de 7 jours ;</li>
              <li>logs techniques : durée courte et proportionnée à la sécurité, au diagnostic et à la prévention des abus ;</li>
              <li>stockage local : jusqu'à suppression par l'utilisateur, nettoyage du cache, désinstallation ou expiration navigateur.</li>
            </ul>
          </LegalSection>

          <LegalSection title="10. Sécurité">
            <p>
              EcoFoodStock met en place des mesures techniques visant à limiter les accès non autorisés : authentification,
              Row Level Security Supabase, contrôles d'accès par foyer, rate limit, routes serveur pour les actions
              sensibles, politique de sécurité des contenus, masquage des secrets et données sensibles dans les logs, et
              séparation des clés publiques et serveur.
            </p>
            <p>
              Aucun système n'est totalement exempt de risque. En cas de violation de données susceptible d'engendrer un
              risque pour les droits et libertés des personnes, l'éditeur doit appliquer les obligations de notification
              prévues par le RGPD.
            </p>
          </LegalSection>

          <LegalSection title="11. Cookies, localStorage et PWA">
            <p>
              EcoFoodStock utilise des mécanismes nécessaires au fonctionnement du service : session d'authentification,
              préférences de thème, cache local, service worker, état d'installation PWA, cache de réponses applicatives
              et données temporaires d'onboarding ou de suggestions. Ces éléments servent à fournir le service, améliorer
              l'expérience mobile, fonctionner partiellement hors ligne et éviter de répéter certaines requêtes.
            </p>
            <p>
              A ce stade, l'application ne prévoit pas de cookies publicitaires ni de traceurs de mesure d'audience non
              nécessaires. Si de tels traceurs sont ajoutés, ils devront faire l'objet d'une information dédiée et, le cas
              échéant, d'un consentement séparé aussi simple à refuser qu'à accepter.
            </p>
          </LegalSection>

          <LegalSection title="12. Export et suppression">
            <p>
              Depuis les paramètres, l'utilisateur peut télécharger un export CSV comprenant ses données de compte, ses
              préférences, son profil, ses objectifs nutritionnels, ses foyers, l'inventaire, les lots, les listes de
              courses, les articles et l'historique associés aux foyers auxquels il appartient.
            </p>
            <p>
              La suppression du compte retire les données personnelles du compte et supprime le foyer si l'utilisateur
              en est le dernier membre. Si le foyer comporte d'autres membres, les données communes nécessaires à ces
              membres peuvent être conservées, tandis que l'utilisateur est retiré du foyer.
            </p>
          </LegalSection>

          <LegalSection title="13. Droits des utilisateurs">
            <p>
              Conformément au RGPD, l'utilisateur peut demander l'accès à ses données, leur rectification, leur
              effacement, la limitation du traitement, la portabilité, l'opposition à certains traitements et le retrait
              d'un consentement lorsque le traitement repose sur le consentement.
            </p>
            <p>
              Certaines demandes peuvent nécessiter une vérification d'identité. L'utilisateur peut également introduire
              une réclamation auprès de la CNIL s'il estime que ses droits ne sont pas respectés.
            </p>
          </LegalSection>

          <LegalSection title="14. Mineurs">
            <p>
              EcoFoodStock n'est pas conçu spécifiquement pour les enfants. Avant une ouverture publique, l'éditeur doit
              confirmer l'âge minimal d'utilisation et les règles applicables lorsque des mineurs utilisent le service ou
              apparaissent indirectement dans les données d'un foyer.
            </p>
          </LegalSection>

          <LegalSection title="15. Mise à jour de la politique">
            <p>
              Cette politique peut être modifiée lorsque l'application évolue, lorsqu'un nouveau prestataire est ajouté,
              lorsqu'une nouvelle finalité apparaît ou lorsque la réglementation change. En cas de modification
              substantielle, l'utilisateur doit être informé et une nouvelle acceptation peut être demandée.
            </p>
          </LegalSection>
        </div>

        <footer className="mt-10 flex flex-col gap-3 border-t border-slate-100 pt-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <Link className="font-semibold text-brand-700 underline-offset-2 hover:underline" href="/legal/terms">
            Lire les conditions générales
          </Link>
          <Link className="font-semibold text-brand-700 underline-offset-2 hover:underline" href="/login">
            Retour à la connexion
          </Link>
        </footer>
      </article>
    </main>
  );
}

function LegalSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section>
      <h2 className="text-lg font-bold tracking-normal text-slate-950">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

function TableRow({ basis, data, purpose }: { basis: string; data: string; purpose: string }) {
  return (
    <tr className="align-top">
      <td className="px-4 py-3 text-slate-700">{purpose}</td>
      <td className="px-4 py-3 text-slate-700">{data}</td>
      <td className="px-4 py-3 text-slate-700">{basis}</td>
    </tr>
  );
}
