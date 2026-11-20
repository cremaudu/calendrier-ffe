# Calendrier FFE

Calendrier des tournois d'échecs à cadence lente de quelques ligues (Bretagne, Pays de la Loire et Normandie par défaut), lisible instantanément sur téléphone, sans attendre le site de la FFE (echecs.asso.fr), qui met jusqu'à 30 secondes par page.

Adresse : <https://calendrier-ffe.domloup.workers.dev>

> Projet indépendant, sans lien avec la Fédération Française des Échecs. Il lit uniquement les pages publiques du site fédéral.

## Ce que fait l'appli

- **Contenu** : les annonces de tournois à cadence lente du site FFE, avec pour chacun le détail de sa fiche : dates, cadence, nombre de rondes, inscription, prix, contact, règlement en PDF et annonce de l'organisateur avec ses liens d'inscription.
- **Recherche** par ville, tournoi ou organisateur, et **filtre** par ligue.
- **Tournois jeunes** (championnats U10, U12…, « Open Jeunes ») masqués sauf si on coche la case qui les affiche. Le choix est gardé sur le téléphone.
- **Installable** sur l'écran d'accueil du téléphone, et lisible hors ligne avec la dernière liste reçue.

## Fonctionnement

Le projet tient en deux parties, sans framework ni étape de construction :

- `public/` : la page (JavaScript simple).
- `src/worker.js` : un relais hébergé sur Cloudflare Workers, qui lit les pages FFE et en garde une copie.

**Le site FFE n'est jamais lu à la demande d'un visiteur** : tout est préparé la nuit et s'affiche instantanément.

- **Chaque nuit**, de 1h00 à 2h55 en hiver et de 2h00 à 3h55 en été (heure de Paris), le relais relit la liste nationale des tournois à cadence lente (5 pages en novembre 2026) et garde ceux des ligues choisies. Il lit ensuite les fiches des tournois nouveaux et celles lues il y a plus d'une semaine. Il travaille à 4 pages par passage, toutes les 5 minutes.
- **Une liste incomplète** (page FFE en échec trois fois) ne remplace pas celle de la veille.
- **Le téléphone** garde la dernière liste reçue, l'affiche tout de suite, puis demande au relais sa version, qui arrive en une fraction de seconde. Les tournois terminés disparaissent de l'affichage même si la liste n'a pas encore été relue.
- **Suivi** : <https://calendrier-ffe.domloup.workers.dev/api/cron> donne l'heure de début du dernier cycle, les pages faites, le reste à faire et les échecs.

## Installation

Il faut [Node.js](https://nodejs.org) et un compte [Cloudflare](https://dash.cloudflare.com/sign-up) (l'offre gratuite suffit).

```sh
npm install
npx wrangler login
npx wrangler deploy
```

Le premier déploiement crée l'espace de stockage des copies et affiche l'adresse, du type `https://calendrier-ffe.<votre-compte>.workers.dev`. La liste apparaît en un quart d'heure environ et le détail des fiches en moins d'une heure. Ensuite, tout se met à jour chaque nuit.

Pour travailler en local :

```sh
node dev.mjs          # http://localhost:8788
```

Le serveur local part d'un stockage vide : chaque appel à <http://localhost:8788/api/dev-cron> exécute un passage de la recharge (4 pages FFE, une à deux minutes).

## Réglages

Tout se règle dans `public/config.js` :

| Réglage | Rôle |
| --- | --- |
| `appli` | nom de l'appli (titre et nom une fois installée) |
| `ligues` | ligues affichées, par leur code : ARA, BFC, BRE, CRS, CVL, EST, HDF, IDF, NAQ, NOR, OCC, PAC, PDL |
| `jeunes` | tournois jeunes affichés à la première visite (`false` : masqués) |
| `couleurs` | bandeau du haut, couleur d'accent, liens et boutons |

Le nom du déploiement (`name` dans `wrangler.jsonc`) donne le début de l'adresse.

## Limites connues

- L'appli lit le site FFE en analysant ses pages : une refonte du site fédéral la casserait.
- Un tournoi annoncé dans la journée n'apparaît que le lendemain matin.
- Les tournois jeunes sont repérés par leur nom (catégorie d'âge ou mot « jeunes ») : un nom inhabituel peut échapper au filtre.

## Origine

Le calendrier a d'abord été écrit dans le projet [pv-ffe](https://github.com/cremaudu/pv-ffe) (dossier `calendrier/`, jusqu'au commit `309a53d`), puis en a été séparé.
