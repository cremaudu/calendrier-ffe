# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

Calendrier des tournois d'échecs à cadence lente annoncés sur le site de la FFE (echecs.asso.fr), pour quelques ligues (`ligues: ['BRE', 'PDL', 'NOR']` dans `public/config.js`), avec le détail de chaque fiche. Le site FFE est très lent : tout est préparé la nuit par un Cloudflare Worker (`calendrier-ffe`, adresse `calendrier-ffe.domloup.workers.dev`) et servi depuis KV. Lecture seule : aucune page authentifiée, aucune écriture vers la FFE. Tout ce qui est réglable vit dans `public/config.js`. L'interface et les échanges avec l'utilisateur sont en français.

Projet séparé de [pv-ffe](https://github.com/cremaudu/pv-ffe) (feuilles de match interclubs), dont il reprend les fonctions de lecture des pages FFE (`src/ffe.js`).

## Commandes

- `node dev.mjs [port]` — serveur local (port 8788 par défaut, faux KV en mémoire) ; `GET /api/dev-cron` exécute un passage de la tâche planifiée. À préférer à `wrangler dev`, dont les requêtes sortantes vers la FFE échouent sur ce poste (« internal error »).
- `npx wrangler deploy` — déploiement Cloudflare Workers (après `npx wrangler login`).
- `node --check src/worker.js` puis `node --check public/app.js` — vérification de syntaxe. Il n'y a ni tests ni linter.

## Architecture

- `src/worker.js` — relais :
  - `/api/tournois` sert la clé KV `calendrier` (liste + fiches + résultats des tournois en cours, assemblés par `publier()`), ou une liste vide avec `t: 0` tant qu'aucun cycle n'a abouti ;
  - `/api/cron` donne l'état des deux cycles planifiés (`nuit`, `soir`) ;
  - `POST /api/actualiser?ref=&ronde=` relit à la demande une ronde d'un tournoi en cours (`actualiser()`) et renvoie ses résultats (voir « Actualisation ») ; `/api/tournois` superpose les `r:<ref>` au calendrier pour servir ces lectures ;
  - `/manifest.webmanifest` est généré depuis `config.js`, lu par expressions régulières (`config()`), d'où des clés au nom unique et des valeurs littérales simples.
- `src/ffe.js` — `decode`, `cells`, `champsForm` (champs du formulaire ASP.NET pour un postback).
- `public/` — page sans framework ni build. `app.js` garde la dernière réponse dans `localStorage` (clés `calendrier`, `ligue`, `jeunes`) pour un affichage immédiat, puis interroge le relais. `sw.js` : coquille hors ligne, réseau d'abord.

## Source FFE

- Liste : `ListeTournois.aspx?Action=ANNONCE&Level=1` (bouton « Cadence lente » de `Tournois.aspx`), liste **nationale** des tournois à venir, 40 par page (5 pages, 194 tournois en novembre 2026). Pages suivantes : postback `PagerFooter` avec le numéro de page en `__EVENTARGUMENT`, possible directement depuis le formulaire de la page 1 ; la flèche `PagerFooter','d'` manque sur la dernière page. Les dates « 21 nov. » prennent l'année des lignes `RowRupture` (« novembre 2026 »).
- La FFE ne filtre pas ces annonces par ligue (`Ligue=` est ignoré ; les listes `TOURNOICOMITE` mélangent cadences et tournois passés) : tri sur la colonne département, table `LIGUES` dans `src/worker.js` (codes à deux caractères : `01`, `2A`).
- Fiche `FicheTournoi.aspx?Ref=` (sans formulaire `aspnetForm` : une page complète se reconnaît à `id="ctl00_divfooter"`) : `LabelDates`, puis des lignes `Row<Champ>` libellé / valeur (cadence `1h30 + [30'']`, rondes, prix, inscriptions, contact…), parfois un lien relatif (`RowPdf` : annonce de l'organisateur en PDF, règlement intérieur), et `RowAnnonce` (HTML libre : liens d'inscription, emojis `&#x1F3C6;`).
- Un tournoi commencé **quitte** cette liste : `publier()` garde ceux du calendrier précédent tant qu'ils sont en cours.
- Résultats : `Resultats.aspx?URL=Tournois/Id/<ref>/<ref>&Action=Cl` (classement, titre « Classement après la ronde N », colonnes Pl, Nom, Elo, Cat., Fede, Ligue, Club, Pts), `Action=01`, `02`… (rondes : « Résultats » ou « Appariements de la ronde N », tableau vide si pas encore appariée ; « EXEMPT », résultats `1 - F`, `&frac12;`). Lignes `papi_liste_f` / `papi_liste_c`. Sans résultats : « Désolé, le fichier n'existe pas... » (pas de `papi_titre`).
- Joueurs d'un club : `ListeJoueurs.aspx?Action=JOUEURCLUBREF&ClubRef=` (40 par page, postback `PagerHeader`, nom en 2e colonne).
- Chaque page met ~30 s : les lire une par une, jamais en parallèle.

## Tâche planifiée

- Cron toutes les 5 min (`wrangler.jsonc`), mais `recharger()` ne lance qu'un cycle par nuit (00h00-01h55 UTC), plus un tout premier dès le déploiement (pas d'état `cron:etat`). Hors cycle, un passage se limite à une lecture KV, sans écriture (quota gratuit : 1000 écritures par jour).
- Un cycle : pages de la liste, puis fiches nouvelles ou de plus de 7 jours (clés `f:<ref>`, expiration 120 jours), puis la liste des joueurs du club (`club`/`clubNom` dans `config.js`) si elle a plus de 7 jours (clé `club`, date en metadata), 4 pages par passage. Page en échec : remise en fin de file, 3 essais au plus. Une liste incomplète ne remplace pas la précédente (clé `liste`).
- Suivi du soir (`suivre()`, état `cron:soir`) : chaque jour à 20h, heure de Paris (fenêtre 20h00-21h55), plus un premier dès le déploiement. Il prend la liste du club dans la clé KV `club` (relue par le cycle de nuit quand elle a plus de 7 jours ; lue par le suivi seulement si elle n'existe pas), puis pour chaque tournoi **en cours** (du premier jour à la fin + 7 jours, règle `enCours` dupliquée dans `app.js`) le classement et les rondes pas encore terminées jusqu'à la suivante de la dernière jouée. Seules les lignes des joueurs du club sont gardées (nom normalisé par `cle()`, ou colonne club du classement contenant `clubNom`), écrites en fin de cycle dans `r:<ref>` (60 jours), puis `publier()`. `passage()` enchaîne nuit puis soir (le soir seulement si la nuit n'a rien fait).
- Actualisation (bouton « Actualiser ») : seulement une ronde appariée ou en cours, ou la première pas encore appariée, d'un tournoi en cours. Relit sa page FFE ; le classement (« après la ronde n-1 » tant que la ronde n n'est pas terminée) n'est relu que si une ronde terminée le dépasse. Au plus une lecture FFE toutes les 2 minutes par page (`lu` de la ronde, `clLu` du classement) : sinon la dernière lecture est renvoyée. Pas de verrou entre demandes simultanées (rares).
- Historique : quand `publier()` voit sortir de « En cours » un tournoi du calendrier précédent qui comptait des joueurs du club, il l'ajoute, avec ses derniers résultats, à la clé `historique` (`{ saison, tournois }`), servie dans `calendrier.termines`. Elle repart à zéro au changement de saison (`debutSaison` dans `config.js`, « 09-01 »). Un tournoi sorti avant la mise en place de l'historique n'y est pas.
- Le KV est provisionné automatiquement (pas d'`id` dans `wrangler.jsonc`) ; un redéploiement réutilise celui du Worker déployé (`calendrier-ffe-cache`).

## Tournois jeunes

Environ un tiers des annonces. Repérés côté client par leur nom (`JEUNES` dans `public/app.js` : catégorie `U10`, `U18-U20`… ou mot « jeunes », comme « Open Jeunes » ; les départements ne mettent pas tous « Jeunes » dans le nom, et `U1600` ne compte pas). Masqués par défaut (`jeunes: false` dans `config.js`) ; une case les affiche, choix gardé dans `localStorage`. Exception : un tournoi jeunes en cours avec des joueurs du club reste affiché.

## Affichage

Trois sections, toujours affichées avec leur compteur (même vides) et accessibles par les ancres de l'en-tête (`#en-cours`, `#a-venir`, `#termines`) :
- « En cours » : tournois avec des joueurs du club d'abord ; classement et parties de ces joueurs, rondes non commencées grisées, rondes et fiche repliées. Un tournoi dont les résultats publiés ne montrent aucun joueur du club est masqué (`sansClub`) ; avant toute publication, il reste affiché.
- « À venir », par mois.
- « Terminés » : historique de la saison, plus récents d'abord, même affichage que « En cours ».
