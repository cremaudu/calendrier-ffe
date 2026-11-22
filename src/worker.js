// Relais du calendrier (Cloudflare Worker calendrier-ffe) : tournois à cadence lente annoncés sur echecs.asso.fr
// dans les ligues de public/config.js, avec le détail de leur fiche.
// Le site FFE met ~30 s par page : tout est préparé par la tâche planifiée et servi depuis KV, jamais lu à la demande.
// Lecture seule : aucune page authentifiée, aucune écriture vers la FFE.
import { decode, cells, champsForm } from './ffe.js';

const FFE = 'https://www.echecs.asso.fr/';
const UA = 'Mozilla/5.0 (calendrier FFE relais)';
// Annonces « cadence lente » de toute la France (Tournois.aspx, bouton OK de « Cadence ») : tournois à venir, 40 par page
const LISTE = 'ListeTournois.aspx?Action=ANNONCE&Level=1';
const pFiche = (ref) => 'FicheTournoi.aspx?Ref=' + ref;

// Départements des ligues métropolitaines (régions de 2016), écrits comme dans la liste FFE.
// La FFE ne filtre pas ses annonces par ligue : le tri se fait ici, sur la colonne département.
export const LIGUES = {
  ARA: ['Auvergne-Rhône-Alpes', '01 03 07 15 26 38 42 43 63 69 73 74'],
  BFC: ['Bourgogne-Franche-Comté', '21 25 39 58 70 71 89 90'],
  BRE: ['Bretagne', '22 29 35 56'],
  CRS: ['Corse', '2A 2B'],
  CVL: ['Centre-Val de Loire', '18 28 36 37 41 45'],
  EST: ['Grand Est', '08 10 51 52 54 55 57 67 68 88'],
  HDF: ['Hauts-de-France', '02 59 60 62 80'],
  IDF: ['Île-de-France', '75 77 78 91 92 93 94 95'],
  NAQ: ['Nouvelle-Aquitaine', '16 17 19 23 24 33 40 47 64 79 86 87'],
  NOR: ['Normandie', '14 27 50 61 76'],
  OCC: ['Occitanie', '09 11 12 30 31 32 34 46 48 65 66 81 82'],
  PAC: ["Provence-Alpes-Côte d'Azur", '04 05 06 13 83 84'],
  PDL: ['Pays de la Loire', '44 49 53 72 85'],
};

const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// « 21 », « novembre », « 2026 » → « 2026-11-21 » ('' si illisible)
const dateIso = (j, mois, annee) => {
  const m = MOIS.indexOf(sansAccent(mois ?? '')) + 1;
  return m && +j && annee ? `${annee}-${String(m).padStart(2, '0')}-${String(+j).padStart(2, '0')}` : '';
};
// Texte libre (annonce) : garde les retours à la ligne
const texte = (s) => s.split(/<br\s*\/?>|<\/p>|<\/div>/i).map(decode).join('\n').replace(/\n{3,}/g, '\n\n').trim();

// Une page de la liste des annonces. Les lignes « mois année » (RowRupture) donnent l'année des dates « 21 nov. ».
export function parseListe(html) {
  const tournois = [];
  let mois = [];
  for (const m of html.matchAll(/<tr id="[^"]*RowRupture"[^>]*>([\s\S]*?)<\/tr>|<tr class=liste_(?:clair|fonce)>([\s\S]*?)<\/tr>/g)) {
    if (m[1] != null) { mois = decode(m[1]).split(' '); continue; }
    const raw = cells(m[2]), c = raw.map(decode);
    const ref = +(raw[3]?.match(/FicheTournoi\.aspx\?Ref=(\d+)/)?.[1] ?? 0);
    if (ref) tournois.push({ ref, ville: c[1], dep: c[2], nom: c[3], debut: dateIso(c[4].match(/\d+/)?.[0], mois[0], mois[1]) });
  }
  // Flèche « page suivante » du bas de page : absente sur la dernière page
  return { tournois, suite: /PagerFooter','d'/.test(html) };
}

// Fiche d'un tournoi : dates, puis chaque ligne « libellé : valeur » dans l'ordre de la page (cadence, rondes, prix…)
export function parseFiche(html) {
  const span = (id) => html.match(new RegExp(`<span id="ctl00_ContentPlaceHolderMain_Label${id}"[^>]*>([\\s\\S]*?)</span>`))?.[1] ?? '';
  if (!html.includes('ContentPlaceHolderMain_LabelNom')) throw new Error('fiche illisible');
  const dates = decode(span('Dates'));
  const jours = [...dates.matchAll(/(\d{1,2}) (\p{L}+) (\d{4})/gu)].map((m) => dateIso(m[1], m[2], m[3])).filter(Boolean);
  const infos = [], champ = {};
  let annonce = '', liens = [];
  for (const m of html.matchAll(/<tr id="ctl00_ContentPlaceHolderMain_Row(\w+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const c = cells(m[2]);
    if (c.length !== 2) continue; // lignes sur deux colonnes seulement (pas les liens de résultats)
    if (m[1] === 'Annonce') {
      annonce = texte(c[1]);
      // Liens de l'annonce : [texte, adresse], pour les rendre cliquables à leur place dans le texte
      const vus = new Map();
      for (const l of c[1].matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const u = new URL(decode(l[1]), FFE).href;
        if (/^https?:/.test(u) && !vus.has(u)) vus.set(u, [decode(l[2]), u]);
      }
      liens = [...vus.values()];
      continue;
    }
    const valeur = decode(c[1]);
    if (!valeur) continue;
    champ[m[1]] = valeur;
    // Certaines lignes sont un lien (règlement, annonce de l'organisateur en PDF) : adresse relative au site FFE
    const lien = c[1].match(/<a\b[^>]*href="([^"]+)"/i)?.[1];
    infos.push([decode(c[0]).replace(/\s*:$/, ''), valeur, ...(lien ? [new URL(decode(lien), FFE).href] : [])]);
  }
  return {
    dates, debut: jours[0] ?? '', fin: jours.at(-1) ?? '',
    cadence: champ.Cadence ?? '', rondes: champ.NbrRondes ?? '',
    infos, annonce, liens,
  };
}

/* ---------- Résultats (tournois en cours) ----------
   Pages Papi du site FFE : Resultats.aspx?URL=Tournois/Id/<ref>/<ref>&Action=Cl (classement), 01, 02… (rondes).
   Sans résultats publiés : « Désolé, le fichier n'existe pas... » (pas de ligne papi_titre). */
const pResultats = (ref, action) => `Resultats.aspx?URL=Tournois/Id/${ref}/${ref}&Action=${action}`;
const pClub = (ref) => 'ListeJoueurs.aspx?Action=JOUEURCLUBREF&ClubRef=' + ref;
// Nom de joueur comparable entre pages (« BURESI-LANG Andréa » = « BURESI LANG Andrea »)
export const cle = (s) => sansAccent(String(s ?? '')).replace(/[^a-z]/g, '');

function papi(html) {
  const titre = html.match(/<tr class=papi_titre>([\s\S]*?)<\/tr>/)?.[1];
  if (titre == null) return null;
  return {
    ronde: +(decode(titre).match(/ronde (\d+)/i)?.[1] ?? 0),
    entetes: cells(html.match(/<tr class=papi_liste_t>([\s\S]*?)<\/tr>/)?.[1] ?? '').map(decode),
    lignes: [...html.matchAll(/<tr class=papi_liste_[fc]>([\s\S]*?)<\/tr>/g)].map((m) => cells(m[1]).map(decode)),
  };
}

// Classement : ronde jouée (« Classement après la ronde 2 »), colonnes utiles (sans drapeau, ligue ni club), toutes les lignes
export function parseClassement(html) {
  const p = papi(html);
  if (!p) return null;
  const garde = p.entetes.map((e, i) => (['', 'Fede', 'Ligue', 'Club'].includes(e) ? -1 : i)).filter((i) => i >= 0);
  const iNom = p.entetes.indexOf('Nom'), iClub = p.entetes.indexOf('Club');
  return {
    ronde: p.ronde, entetes: garde.map((i) => p.entetes[i]),
    lignes: p.lignes.map((c) => ({ nom: c[iNom] ?? '', club: c[iClub] ?? '', cols: garde.map((i) => c[i] ?? '') })),
  };
}

// Ronde : échiquier, blancs, Elo, résultat, noirs, Elo. Tableau vide : ronde pas encore appariée.
const joue = (r) => /[\d½F]/.test(r);
export function parseRonde(html) {
  const parties = (papi(html)?.lignes ?? []).filter((c) => c.length >= 7)
    .map((c) => ({ e: c[0], b: c[2], eb: c[3], r: c[4], n: c[5], en: c[6] }));
  const n = parties.filter((p) => joue(p.r)).length;
  return { etat: !parties.length ? 'avenir' : n === parties.length ? 'jouee' : n ? 'encours' : 'appariee', parties };
}

// Liste des joueurs d'un club (40 par page ; la flèche « page suivante » manque sur la dernière)
export function parseClub(html) {
  const noms = [...html.matchAll(/<tr class=liste_(?:clair|fonce)>([\s\S]*?)<\/tr>/g)].map((m) => decode(cells(m[1])[1] ?? '')).filter(Boolean);
  return { noms, suite: /PagerHeader','d'/.test(html) };
}

async function lireFFE(path, body) {
  const r = await fetch(FFE + path, {
    method: body ? 'POST' : 'GET', body, signal: AbortSignal.timeout(90000),
    headers: { 'User-Agent': UA, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
  });
  if (!r.ok) throw new Error('FFE ' + r.status);
  const html = await r.text();
  // Pied de page, présent sur toutes les pages (les fiches de tournoi n'ont pas de formulaire aspnetForm)
  if (!html.includes('id="ctl00_divfooter"')) throw new Error('page FFE tronquée');
  return html;
}

// Configuration lue dans public/config.js (clés au nom unique, valeurs littérales simples)
let cfgMemo;
function config(env) {
  return (cfgMemo ??= (async () => {
    const js = await (await env.ASSETS.fetch(new Request('https://assets/config.js'))).text();
    const chaine = (cle) => js.match(new RegExp('^\\s*' + cle + ':\\s*([\'"])(.*?)\\1', 'm'))?.[2];
    const ligues = (js.match(/^\s*ligues:\s*\[([^\]]*)\]/m)?.[1].match(/[A-Z]{3}/g) ?? []).filter((c) => LIGUES[c]);
    const ligueDe = {};
    for (const c of ligues) for (const d of LIGUES[c][1].split(' ')) ligueDe[d] = c;
    const club = +(js.match(/^\s*club:\s*(\d+)/m)?.[1] ?? 0);
    return { appli: chaine('appli') ?? 'Calendrier FFE', entete: chaine('entete') ?? '#161616', ligues, ligueDe, club, clubNom: chaine('clubNom') ?? '' };
  })());
}

/* ---------- Tâche planifiée ----------
   Déclenchée toutes les 5 min, elle ne lance qu'un cycle par nuit (00h00-01h55 UTC), plus un tout premier
   dès le déploiement. Un cycle : les pages de la liste (la 1re en lecture simple, les suivantes par postback
   sur le formulaire de la 1re), puis les fiches nouvelles ou lues il y a plus d'une semaine. 4 pages par passage. */
const PAR_PASSAGE = 4;
const FICHE_VALIDE = 7 * 86400000;
const JOURS_FICHE = 120; // une fiche non relue disparaît de KV au bout de 4 mois (tournoi passé)

export async function recharger(env, maintenant = Date.now()) {
  const cfg = await config(env);
  let e = await env.CACHE.get('cron:etat', 'json');
  const jour = (t) => new Date(t).toISOString().slice(0, 10);
  const nuit = new Date(maintenant).getUTCHours() < 2;
  if (!e || (nuit && jour(e.debut) !== jour(maintenant))) e = { debut: maintenant, file: ['liste:1'], lignes: [], faits: 0, echecs: {} };
  if (!e.file.length) return { reste: 0, faits: e.faits, actif: false }; // rien à faire : pas d'écriture KV
  let change = false;
  for (let i = 0; i < PAR_PASSAGE && e.file.length; i++) {
    const item = e.file[0];
    const [type, arg] = item.split(':');
    try {
      if (type === 'liste') {
        const n = +arg;
        let html;
        if (n === 1) {
          html = await lireFFE(LISTE);
          e.form = champsForm(html);
        } else {
          const body = new URLSearchParams(e.form);
          body.set('__EVENTTARGET', 'ctl00$ContentPlaceHolderMain$PagerFooter');
          body.set('__EVENTARGUMENT', String(n));
          html = await lireFFE(LISTE, body);
        }
        const { tournois, suite } = parseListe(html);
        if (!tournois.length) throw new Error('liste vide');
        e.lignes.push(...tournois.filter((t) => cfg.ligueDe[t.dep]));
        if (suite && n < 30) e.file.push('liste:' + (n + 1));
        else {
          // Liste complète : elle remplace la précédente (une liste incomplète ne remplace rien)
          await env.CACHE.put('liste', JSON.stringify(e.lignes), { metadata: { t: maintenant } });
          for (const t of e.lignes) {
            const f = await env.CACHE.getWithMetadata('f:' + t.ref);
            if (!f.value || maintenant - (f.metadata?.t ?? 0) > FICHE_VALIDE) e.file.push('fiche:' + t.ref);
          }
          e.lignes = [];
          delete e.form;
          change = true;
        }
      } else if (type === 'fiche') {
        const f = parseFiche(await lireFFE(pFiche(arg)));
        await env.CACHE.put('f:' + arg, JSON.stringify(f), { metadata: { t: Date.now() }, expirationTtl: JOURS_FICHE * 86400 });
        change = true;
      }
      e.file.shift();
      e.faits++;
    } catch (err) {
      // Page en échec : remise en fin de file, 3 essais au plus
      e.file.shift();
      e.echecs[item] = (e.echecs[item] ?? 0) + 1;
      if (e.echecs[item] < 3) e.file.push(item);
    }
  }
  if (change) await publier(env, cfg, maintenant);
  e.maj = maintenant;
  await env.CACHE.put('cron:etat', JSON.stringify(e));
  return { reste: e.file.length, faits: e.faits, actif: true };
}

// Date et heure à Paris (le suivi du soir suit l'heure légale)
function paris(t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { jour: `${p.year}-${p.month}-${p.day}`, heure: +p.hour };
}
const plus7 = (iso) => new Date(Date.parse(iso + 'T12:00:00Z') + 7 * 86400000).toISOString().slice(0, 10);
// En cours : du premier jour du tournoi au dernier + 7 jours (même règle que public/app.js)
export const enCours = (t, auj) => !!t.debut && t.debut <= auj && auj <= plus7(t.fiche?.fin || t.debut);

/* ---------- Suivi du soir ----------
   Chaque jour à 20h (Paris), un cycle relit les joueurs du club (config.js : club), puis pour chaque tournoi
   en cours le classement et les rondes pas encore terminées ; seules les lignes des joueurs du club sont gardées
   (clé r:<ref>). Même rythme que la nuit : 4 pages par passage, 3 essais par page. */
const JOURS_RESULTATS = 60;

export async function suivre(env, maintenant = Date.now()) {
  const cfg = await config(env);
  if (!cfg.club) return { reste: 0, actif: false };
  let e = await env.CACHE.get('cron:soir', 'json');
  const p = paris(maintenant);
  // Tout premier cycle dès le déploiement : jour laissé vide pour que celui de 20h ait lieu quand même
  if (!e || (p.heure >= 20 && p.heure < 22 && e.jour !== p.jour)) {
    e = { debut: maintenant, jour: e ? p.jour : '', file: ['club:1', 'suivi'], joueurs: [], res: {}, rondes: {}, faits: 0, echecs: {} };
  }
  if (!e.file.length) return { reste: 0, faits: e.faits, actif: false };
  const membres = (r) => new Set([...e.joueurs, ...(r?.noms ?? [])]);
  for (let i = 0; i < PAR_PASSAGE && e.file.length; i++) {
    const item = e.file[0];
    const [type, arg, n] = item.split(':');
    try {
      if (type === 'club') {
        // Page 1 en lecture simple, les suivantes par postback sur son formulaire
        let html;
        if (+arg === 1) { html = await lireFFE(pClub(cfg.club)); e.form = champsForm(html); e.lus = []; }
        else {
          const body = new URLSearchParams(e.form);
          body.set('__EVENTTARGET', 'ctl00$ContentPlaceHolderMain$PagerHeader');
          body.set('__EVENTARGUMENT', arg);
          html = await lireFFE(pClub(cfg.club), body);
        }
        const c = parseClub(html);
        if (!c.noms.length) throw new Error('liste du club vide');
        e.lus.push(...c.noms.map(cle));
        if (c.suite && +arg < 20) e.file.splice(1, 0, 'club:' + (+arg + 1));
        else { e.joueurs = e.lus; e.clubOk = true; delete e.form; delete e.lus; await env.CACHE.put('club', JSON.stringify(e.joueurs)); }
      } else if (type === 'suivi') {
        // Liste du club illisible ce soir : celle d'un soir précédent
        if (!e.clubOk) e.joueurs = (await env.CACHE.get('club', 'json')) ?? [];
        const cal = await env.CACHE.get('calendrier', 'json');
        for (const t of cal?.tournois ?? []) if (enCours(t, p.jour)) { e.file.push('cl:' + t.ref); e.rondes[t.ref] = +(t.fiche?.rondes ?? 0); }
      } else if (type === 'cl') {
        const c = parseClassement(await lireFFE(pResultats(arg, 'Cl')));
        const avant = await env.CACHE.get('r:' + arg, 'json');
        if (!c) { e.res[arg] = { t: Date.now(), absent: true }; }
        else {
          // Joueurs du club : par leur nom (liste du club) ou par la colonne club du classement
          const club = cle(cfg.clubNom), m = membres();
          const lignes = c.lignes.filter((l) => m.has(cle(l.nom)) || (club && cle(l.club).includes(club)));
          const total = Math.max(e.rondes[arg] || 0, c.ronde + 1, avant?.rondes?.length ?? 0);
          const r = {
            t: Date.now(), ronde: c.ronde, total, participants: c.lignes.length, noms: lignes.map((l) => cle(l.nom)),
            classement: { entetes: c.entetes, lignes: lignes.map((l) => l.cols) },
            rondes: Array.from({ length: total }, (_, k) => avant?.rondes?.[k] ?? { n: k + 1, etat: 'avenir', parties: [] }),
          };
          e.res[arg] = r;
          // Rondes à relire : jusqu'à celle qui suit la dernière jouée, sauf celles déjà terminées.
          // Classement publié sans joueur du club : rien à suivre (sauf avant la 1re ronde, où il est encore vide).
          if (lignes.length || !c.ronde) {
            const aLire = [];
            for (let k = 1; k <= Math.min(c.ronde + 1, total); k++) if (r.rondes[k - 1].etat !== 'jouee') aLire.push(`ronde:${arg}:${k}`);
            e.file.splice(1, 0, ...aLire);
          }
        }
      } else if (type === 'ronde') {
        const r = e.res[arg];
        const ronde = parseRonde(await lireFFE(pResultats(arg, String(n).padStart(2, '0'))));
        const m = membres(r);
        const parties = ronde.parties.map((x) => ({ ...x, db: m.has(cle(x.b)), dn: m.has(cle(x.n)) })).filter((x) => x.db || x.dn);
        r.rondes[n - 1] = { n: +n, etat: ronde.etat, parties };
        // Avant la 1re ronde, le classement est vide : les joueurs du club se repèrent dans les appariements
        for (const x of parties) for (const [d, nom] of [[x.db, x.b], [x.dn, x.n]]) if (d && !r.noms.includes(cle(nom))) r.noms.push(cle(nom));
      }
      e.file.shift();
      e.faits++;
    } catch (err) {
      e.file.shift();
      e.echecs[item] = (e.echecs[item] ?? 0) + 1;
      if (e.echecs[item] < 3) e.file.push(item);
    }
  }
  if (!e.file.length) {
    // Cycle terminé : résultats écrits une fois par tournoi, puis calendrier republié
    for (const [ref, r] of Object.entries(e.res)) await env.CACHE.put('r:' + ref, JSON.stringify(r), { expirationTtl: JOURS_RESULTATS * 86400 });
    await publier(env, cfg, maintenant);
    e.res = {};
  }
  e.maj = maintenant;
  await env.CACHE.put('cron:soir', JSON.stringify(e));
  return { reste: e.file.length, faits: e.faits, actif: true };
}

// Assemble liste, fiches et résultats en une seule réponse, servie telle quelle par /api/tournois.
// Un tournoi commencé peut quitter la liste FFE des annonces : il reste affiché tant qu'il est en cours.
async function publier(env, cfg, maintenant = Date.now()) {
  const l = await env.CACHE.getWithMetadata('liste', 'json');
  if (!l.value) return;
  const auj = paris(maintenant).jour;
  const refs = new Set(l.value.map((t) => t.ref));
  const ancien = (await env.CACHE.get('calendrier', 'json'))?.tournois ?? [];
  const restes = ancien.filter((t) => !refs.has(t.ref) && enCours(t, auj)).map(({ ref, ville, dep, nom, debut }) => ({ ref, ville, dep, nom, debut }));
  const tournois = [];
  for (const t of [...restes, ...l.value]) {
    const fiche = await env.CACHE.get('f:' + t.ref, 'json');
    const x = { ...t, ligue: cfg.ligueDe[t.dep] ?? '', ...(fiche ? { fiche } : {}) };
    const r = enCours(x, auj) ? await env.CACHE.get('r:' + t.ref, 'json') : null;
    if (r) x.resultats = r;
    tournois.push(x);
  }
  tournois.sort((a, b) => a.debut.localeCompare(b.debut));
  const t = l.metadata?.t ?? Date.now();
  await env.CACHE.put('calendrier', JSON.stringify({ t, ligues: liguesDe(cfg), tournois }), { metadata: { t } });
}

// Un passage de la tâche planifiée : le cycle de nuit d'abord, le suivi du soir s'il n'a rien fait
export async function passage(env, maintenant = Date.now()) {
  const nuit = await recharger(env, maintenant);
  return nuit.actif ? { nuit } : { nuit, soir: await suivre(env, maintenant) };
}
const liguesDe = (cfg) => cfg.ligues.map((code) => ({ code, nom: LIGUES[code][0] }));

const json = (data, status = 200) =>
  new Response(typeof data === 'string' ? data : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export default {
  async scheduled(ev, env, ctx) {
    ctx.waitUntil(passage(env));
  },
  async fetch(req, env) {
    const u = new URL(req.url);
    try {
      if (u.pathname === '/manifest.webmanifest') {
        const cfg = await config(env);
        return new Response(JSON.stringify({
          name: cfg.appli, short_name: 'Calendrier', start_url: '/', display: 'standalone', background_color: '#f4f4f2', theme_color: cfg.entete,
          icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
        }), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' } });
      }
      // Calendrier assemblé par la tâche planifiée ; tant qu'il n'existe pas : liste vide, t = 0
      if (u.pathname === '/api/tournois') {
        const c = await env.CACHE.get('calendrier');
        return json(c ?? { t: 0, ligues: liguesDe(await config(env)), tournois: [] });
      }
      // État des cycles planifiés, nuit (liste et fiches) et soir (résultats des tournois en cours) : diagnostic
      if (u.pathname === '/api/cron') {
        const resume = (e) => (e ? { debut: new Date(e.debut).toISOString(), maj: new Date(e.maj).toISOString(), faits: e.faits, reste: e.file.length, file: e.file.slice(0, 10), echecs: e.echecs } : { etat: 'jamais lancée' });
        return json({ nuit: resume(await env.CACHE.get('cron:etat', 'json')), soir: resume(await env.CACHE.get('cron:soir', 'json')) });
      }
      return json({ erreur: 'inconnu' }, 404);
    } catch (e) {
      return json({ erreur: String(e.message || e) }, 502);
    }
  },
};
