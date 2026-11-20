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
  - `/api/tournois` sert la clé KV `calendrier` (liste + fiches assemblées par `publier()`), ou une liste vide avec `t: 0` tant qu'aucun cycle n'a abouti ;
  - `/api/cron` donne l'état de la tâche planifiée ;
  - `/manifest.webmanifest` est généré depuis `config.js`, lu par expressions régulières (`config()`), d'où des clés au nom unique et des valeurs littérales simples.
- `src/ffe.js` — `decode`, `cells`, `champsForm` (champs du formulaire ASP.NET pour un postback).
- `public/` — page sans framework ni build. `app.js` garde la dernière réponse dans `localStorage` (clés `calendrier`, `ligue`, `jeunes`) pour un affichage immédiat, puis interroge le relais. `sw.js` : coquille hors ligne, réseau d'abord.

## Source FFE

- Liste : `ListeTournois.aspx?Action=ANNONCE&Level=1` (bouton « Cadence lente » de `Tournois.aspx`), liste **nationale** des tournois à venir, 40 par page (5 pages, 194 tournois en novembre 2026). Pages suivantes : postback `PagerFooter` avec le numéro de page en `__EVENTARGUMENT`, possible directement depuis le formulaire de la page 1 ; la flèche `PagerFooter','d'` manque sur la dernière page. Les dates « 21 nov. » prennent l'année des lignes `RowRupture` (« novembre 2026 »).
- La FFE ne filtre pas ces annonces par ligue (`Ligue=` est ignoré ; les listes `TOURNOICOMITE` mélangent cadences et tournois passés) : tri sur la colonne département, table `LIGUES` dans `src/worker.js` (codes à deux caractères : `01`, `2A`).
- Fiche `FicheTournoi.aspx?Ref=` (sans formulaire `aspnetForm` : une page complète se reconnaît à `id="ctl00_divfooter"`) : `LabelDates`, puis des lignes `Row<Champ>` libellé / valeur (cadence `1h30 + [30'']`, rondes, prix, inscriptions, contact…), parfois un lien relatif (`RowPdf` : annonce de l'organisateur en PDF, règlement intérieur), et `RowAnnonce` (HTML libre : liens d'inscription, emojis `&#x1F3C6;`).
- Chaque page met ~30 s : les lire une par une, jamais en parallèle.

## Tâche planifiée

- Cron toutes les 5 min (`wrangler.jsonc`), mais `recharger()` ne lance qu'un cycle par nuit (00h00-01h55 UTC), plus un tout premier dès le déploiement (pas d'état `cron:etat`). Hors cycle, un passage se limite à une lecture KV, sans écriture (quota gratuit : 1000 écritures par jour).
- Un cycle : pages de la liste, puis fiches nouvelles ou de plus de 7 jours (clés `f:<ref>`, expiration 120 jours), 4 pages par passage. Page en échec : remise en fin de file, 3 essais au plus. Une liste incomplète ne remplace pas la précédente (clé `liste`).
- Le KV est provisionné automatiquement (pas d'`id` dans `wrangler.jsonc`) ; un redéploiement réutilise celui du Worker déployé (`calendrier-ffe-cache`).

## Tournois jeunes

Environ un tiers des annonces. Repérés côté client par leur nom (`JEUNES` dans `public/app.js` : catégorie `U10`, `U18-U20`… ou mot « jeunes », comme « Open Jeunes » ; les départements ne mettent pas tous « Jeunes » dans le nom, et `U1600` ne compte pas). Masqués par défaut (`jeunes: false` dans `config.js`) ; une case les affiche, choix gardé dans `localStorage`.
