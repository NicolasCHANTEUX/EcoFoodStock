import Link from "next/link";

const versionLabel = "Version du 3 juillet 2026";
const publisherPlaceholder = "A COMPLETER : identité juridique de l'éditeur, adresse, email de contact";

export const metadata = {
  title: "Conditions générales d'utilisation"
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-brand-50 px-4 py-10">
      <article className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
        <header className="border-b border-slate-100 pb-6">
          <p className="text-sm font-semibold text-brand-700">EcoFoodStock</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-slate-950">
            Conditions générales d'utilisation
          </h1>
          <p className="mt-3 text-sm text-slate-500">{versionLabel}</p>
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
            {publisherPlaceholder}
          </p>
        </header>

        <div className="mt-8 space-y-8 text-sm leading-6 text-slate-700">
          <LegalSection title="1. Objet">
            <p>
              EcoFoodStock est une application web progressive destinée à aider un utilisateur ou un foyer à gérer un
              stock alimentaire domestique, suivre des dates de consommation, préparer une liste de courses, consulter
              un historique d'actions et paramétrer des préférences alimentaires ou nutritionnelles.
            </p>
            <p>
              Les présentes conditions encadrent l'accès et l'utilisation de l'application. En créant un compte ou en
              utilisant EcoFoodStock, l'utilisateur accepte ces conditions et la politique de confidentialité applicable.
            </p>
          </LegalSection>

          <LegalSection title="2. Accès au service">
            <p>
              L'application est fournie en version MVP et peut évoluer. Certaines fonctionnalités annoncées dans
              l'interface ou la documentation, comme les recettes avancées, les notifications ou les exports enrichis,
              peuvent être limitées, modifiées ou retirées pendant la phase de stabilisation.
            </p>
            <p>
              L'accès nécessite un compte personnel créé par email, Google ou Apple lorsque ces fournisseurs sont
              activés. L'utilisateur doit fournir des informations exactes, maintenir la confidentialité de ses
              identifiants et prévenir l'éditeur en cas d'accès non autorisé suspecté.
            </p>
          </LegalSection>

          <LegalSection title="3. Foyer partagé">
            <p>
              EcoFoodStock permet de gérer des données liées à un foyer : inventaire, lots, liste de courses,
              historique et invitations. Les membres d'un même foyer peuvent accéder à des informations communes et
              agir sur ces données selon les possibilités prévues par l'application.
            </p>
            <p>
              L'utilisateur qui invite une autre personne doit s'assurer qu'elle est autorisée à accéder aux données du
              foyer. Les informations strictement personnelles, comme les données physiques et objectifs nutritionnels,
              sont traitées comme des données propres au compte utilisateur.
            </p>
          </LegalSection>

          <LegalSection title="4. Données produit et Open Food Facts">
            <p>
              Le scan de code-barres et certaines suggestions s'appuient sur Open Food Facts, une base de données
              collaborative externe. Les informations récupérées peuvent inclure le nom du produit, la marque, la
              catégorie, l'image, la quantité commerciale ou des valeurs nutritionnelles lorsque disponibles.
            </p>
            <p>
              Ces données peuvent être incomplètes, obsolètes ou incorrectes. L'utilisateur doit vérifier les
              informations importantes avant de les utiliser, notamment les allergènes, ingrédients, valeurs
              nutritionnelles, dates ou quantités. EcoFoodStock ne garantit pas l'exactitude des données issues de
              sources externes.
            </p>
          </LegalSection>

          <LegalSection title="5. Informations nutritionnelles et santé">
            <p>
              Les indicateurs de calories, objectifs, IMC, préférences alimentaires, modes Grand public ou Sportif et
              autres informations nutritionnelles sont fournis à titre informatif pour aider l'organisation du foyer.
              Ils ne constituent pas un avis médical, un diagnostic, une prescription, un programme de soin ou un suivi
              diététique personnalisé.
            </p>
            <p>
              L'utilisateur reste responsable de ses choix alimentaires et doit consulter un médecin, diététicien ou
              professionnel de santé qualifié avant toute décision susceptible d'avoir un impact sur sa santé, en
              particulier en cas de pathologie, grossesse, trouble alimentaire, allergie, régime strict ou objectif
              sportif intensif.
            </p>
          </LegalSection>

          <LegalSection title="6. Utilisation acceptable">
            <p>L'utilisateur s'engage à ne pas :</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>utiliser EcoFoodStock de manière frauduleuse, abusive ou contraire à la loi ;</li>
              <li>tenter de contourner l'authentification, les droits d'accès ou les limites de sécurité ;</li>
              <li>charger volontairement des contenus illicites, dangereux, diffamatoires ou portant atteinte à des tiers ;</li>
              <li>perturber le service, automatiser des requêtes excessives ou exploiter une faille de sécurité ;</li>
              <li>utiliser l'application pour une activité professionnelle sans accord préalable de l'éditeur.</li>
            </ul>
          </LegalSection>

          <LegalSection title="7. Disponibilité et évolution">
            <p>
              L'éditeur fait ses meilleurs efforts pour maintenir l'application accessible et sécurisée. Le service peut
              toutefois être interrompu pour maintenance, incident technique, mise à jour, changement d'hébergeur ou
              contrainte externe. Certaines fonctionnalités peuvent être désactivées temporairement, notamment celles qui
              dépendent de Supabase, Open Food Facts, Google, Apple, Sentry ou de l'hébergeur.
            </p>
          </LegalSection>

          <LegalSection title="8. Compte, export et suppression">
            <p>
              L'utilisateur peut se déconnecter, modifier son mot de passe, exporter ses données en CSV et demander la
              suppression de son compte depuis les paramètres lorsque ces fonctionnalités sont disponibles. L'export peut
              contenir des données de foyer partagées avec d'autres membres, par exemple l'inventaire, les courses ou
              l'historique commun.
            </p>
            <p>
              La suppression de compte est définitive après confirmation. Si l'utilisateur est le dernier membre d'un
              foyer, les données du foyer peuvent être supprimées avec le compte. Si d'autres membres restent dans le
              foyer, l'utilisateur est retiré du foyer et les données communes peuvent être conservées pour les membres
              restants.
            </p>
          </LegalSection>

          <LegalSection title="9. Responsabilité">
            <p>
              EcoFoodStock est un outil d'aide à l'organisation domestique. L'éditeur ne peut pas être tenu responsable
              d'une perte alimentaire, d'une erreur de saisie, d'une mauvaise interprétation d'une date, d'une donnée
              Open Food Facts inexacte, d'une interruption de service ou d'une décision alimentaire prise par
              l'utilisateur.
            </p>
            <p>
              L'utilisateur demeure responsable de vérifier l'état réel des produits, les dates visibles sur les
              emballages, les conditions de conservation, les allergies, les recommandations sanitaires et la pertinence
              des informations enregistrées dans l'application.
            </p>
          </LegalSection>

          <LegalSection title="10. Propriété intellectuelle">
            <p>
              L'application, son interface, son code, ses textes, sa marque et ses éléments graphiques appartiennent à
              l'éditeur ou à leurs titulaires respectifs, sauf mention contraire. Les données Open Food Facts restent
              soumises à leurs licences propres, notamment les licences ouvertes applicables à la base, aux contenus et
              aux images.
            </p>
            <p>
              L'utilisateur conserve les droits sur les informations qu'il saisit, tout en accordant à l'éditeur les
              droits nécessaires pour les héberger, synchroniser, afficher, sauvegarder, exporter et traiter dans le
              cadre du fonctionnement normal d'EcoFoodStock.
            </p>
          </LegalSection>

          <LegalSection title="11. Données personnelles">
            <p>
              Les traitements de données personnelles sont décrits dans la politique de confidentialité. L'acceptation
              des présentes conditions ne vaut pas consentement à des cookies ou traceurs non nécessaires ; lorsqu'un tel
              consentement est requis, il doit être demandé séparément.
            </p>
          </LegalSection>

          <LegalSection title="12. Modification des conditions">
            <p>
              Les présentes conditions peuvent être modifiées pour tenir compte de l'évolution du service, de la loi, de
              l'architecture technique ou des partenaires utilisés. En cas de modification importante, une nouvelle
              acceptation peut être demandée à l'utilisateur.
            </p>
          </LegalSection>

          <LegalSection title="13. Droit applicable et contact">
            <p>
              Sauf règle impérative contraire, les présentes conditions sont régies par le droit français. Pour toute
              question relative au service, à un compte ou à ces conditions, l'utilisateur peut contacter l'éditeur aux
              coordonnées indiquées en tête de page, une fois complétées.
            </p>
          </LegalSection>
        </div>

        <footer className="mt-10 flex flex-col gap-3 border-t border-slate-100 pt-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <Link className="font-semibold text-brand-700 underline-offset-2 hover:underline" href="/legal/privacy">
            Lire la politique de confidentialité
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
