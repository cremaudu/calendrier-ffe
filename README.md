# Calendrier FFE

Calendrier des tournois d'échecs à cadence lente de quelques ligues (Bretagne, Pays de la Loire et Normandie par défaut), avec le suivi des joueurs d'un club (Domloup par défaut) dans les tournois en cours. Il est lisible instantanément sur téléphone, sans attendre le site de la FFE (echecs.asso.fr), qui met jusqu'à 30 secondes par page.

Adresse : <https://calendrier-ffe.domloup.workers.dev>

> Projet indépendant, sans lien avec la Fédération Française des Échecs. Il lit uniquement les pages publiques du site fédéral.

## Ce que fait l'appli

- **Trois sections**, accessibles par les liens de l'en-tête :
  - **En cours** : du premier jour du tournoi à une semaine après la fin, avec le classement et les parties des joueurs du club (rondes non commencées grisées) ;
  - **À venir** : les annonces, par mois, avec le détail de chaque fiche : dates, cadence, rondes, inscription, prix, contact, règlement et annonce de l'organisateur ;
  - **Terminés** : les tournois de la saison où des joueurs du club ont joué.
- **Bouton « Actualiser »** sur la ronde en cours d'un tournoi : relit tout de suite sa page FFE, pour suivre les résultats au fil de la journée.
- **Tournois des autres ligues** : affichés dans « En cours » s'ils comptent des joueurs du club.
- **Recherche** par ville, tournoi ou organisateur, et **filtre** par ligue.
- **Tournois jeunes** (championnats U10, U12…, « Open Jeunes ») masqués sauf si on coche la case qui les affiche. Le choix est gardé sur le téléphone.
- **Installable** sur l'écran d'accueil du téléphone, et lisible hors ligne avec la dernière liste reçue.

## Fonctionnement

Le projet tient en deux parties, sans framework ni étape de construction :

- `public/` : la page (JavaScript simple).
- `src/worker.js` : un relais hébergé sur Cloudflare Workers, qui lit les pages FFE et en garde une copie.

**Tout est préparé à l'avance** et s'affiche instantanément ; seul le bouton « Actualiser » fait lire le site FFE à la demande (une ronde, au plus une fois toutes les 2 minutes).

- **Chaque nuit**, de 1h00 à 2h55 en hiver et de 2h00 à 3h55 en été (heure de Paris), le relais relit la liste nationale des tournois à cadence lente (5 pages en novembre 2026) et garde ceux des ligues choisies. Il lit ensuite les fiches des tournois nouveaux et celles lues il y a plus d'une semaine, la liste des joueurs du club une fois par semaine, et vérifie si les tournois des autres ligues qui viennent de commencer comptent des joueurs du club. Il travaille à 4 pages par passage, toutes les 5 minutes.
- **Chaque soir à 20h**, il relit le classement et les rondes des tournois en cours, et n'en garde que les joueurs du club.
- **Une liste incomplète** (page FFE en échec trois fois) ne remplace pas celle de la veille.
- **Le téléphone** garde la dernière liste reçue, l'affiche tout de suite, puis demande au relais sa version, qui arrive en une fraction de seconde. Les tournois terminés disparaissent de l'affichage même si la liste n'a pas encore été relue.
- **Suivi** : <https://calendrier-ffe.domloup.workers.dev/api/cron> donne, pour le cycle de nuit et celui du soir, l'heure de début, les pages faites, le reste à faire et les échecs.

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

Le serveur local part d'un stockage vide : chaque appel à <http://localhost:8788/api/dev-cron> exécute un passage de la recharge (cycle de nuit, puis celui du soir ; 4 pages FFE par passage).

## Réglages

Tout se règle dans `public/config.js` :

| Réglage | Rôle |
| --- | --- |
| `appli` | nom de l'appli (titre et nom une fois installée) |
| `ligues` | ligues affichées, par leur code : ARA, BFC, BRE, CRS, CVL, EST, HDF, IDF, NAQ, NOR, OCC, PAC, PDL |
| `jeunes` | tournois jeunes affichés à la première visite (`false` : masqués) |
| `club`, `clubNom` | club suivi : numéro FFE (1918) et nom court (Domloup) |
| `horsLigues` | tournois des autres ligues avec des joueurs du club (`false` : ignorés) |
| `debutSaison` | jour où la section « Terminés » repart à zéro (`'09-01'`) |
| `logo` | image affichée devant le titre (`''` : aucune) |
| `couleurs` | bandeau du haut, couleur d'accent, liens et boutons |

Le nom du déploiement (`name` dans `wrangler.jsonc`) donne le début de l'adresse.

## Limites connues

- L'appli lit le site FFE en analysant ses pages : une refonte du site fédéral la casserait.
- Un tournoi annoncé dans la journée n'apparaît que le lendemain matin ; un tournoi d'une autre ligue, la nuit qui suit sa première journée.
- Les résultats n'arrivent que quand l'arbitre les publie sur le site FFE ; les inscriptions n'y sont pas visibles.
- Les tournois jeunes sont repérés par leur nom (catégorie d'âge ou mot « jeunes ») : un nom inhabituel peut échapper au filtre.

## Origine

Le calendrier a d'abord été écrit dans le projet [pv-ffe](https://github.com/cremaudu/pv-ffe) (dossier `calendrier/`, jusqu'au commit `309a53d`), puis en a été séparé.
