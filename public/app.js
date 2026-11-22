/* Calendrier FFE — tournois à cadence lente des ligues de config.js.
   Données : relais /api/tournois (préparé chaque nuit), copie dans localStorage pour un affichage immédiat. */
const CFG = window.CONFIG;
const $ = (id) => document.getElementById(id);
// Titre et couleurs (config.js)
{
  const c = CFG.couleurs ?? {}, r = document.documentElement.style;
  if (c.entete) { r.setProperty('--noir', c.entete); document.querySelector('meta[name="theme-color"]').content = c.entete; }
  if (c.accent) r.setProperty('--jaune', c.accent);
  if (c.bouton) r.setProperty('--bleu', c.bouton);
  document.title = $('titre').textContent = CFG.appli ?? 'Calendrier FFE';
  if (CFG.logo) { $('logo').src = CFG.logo; $('logo').alt = CFG.clubNom ?? ''; $('logo').hidden = false; }
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lire = (k, d = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let cal = lire('calendrier'); // dernière réponse du relais : { t, ligues, tournois }
let ligue = lire('ligue', '');
let jeunes = lire('jeunes', CFG.jeunes ?? false); // tournois jeunes affichés
let etat = '';
const ouverts = new Set();
const plisOuverts = new Set(); // rondes et fiches dépliées (« ref:ronde », « ref:fiche »), pour qu'un nouveau rendu ne les referme pas

// Dates ISO (AAAA-MM-JJ) en clair, à midi pour éviter tout décalage horaire
const jour = (iso, o = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', o);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const quand = (t) => {
  const d = new Date(t), h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const ecart = Math.round((new Date(iso(new Date()) + 'T12:00:00') - new Date(iso(d) + 'T12:00:00')) / 86400000);
  return (ecart === 0 ? "aujourd'hui" : ecart === 1 ? 'hier' : 'le ' + jour(iso(d), { day: 'numeric', month: 'long' })) + ' à ' + h;
};
// Notation FFE « 1h30 + [30''] » → « 1h30 + 30 s par coup »
const cadence = (s) => String(s ?? '').replace(/\[(\d+)''\]/g, '$1 s par coup');
// Tournoi jeunes : catégorie d'âge dans le nom (« Championnat Morbihan mixte 2026 U12 ») ou mot « jeunes »
// (« Manche Jeunes 2026 U10 », « Open FIDE de Sucé-sur-Erdre - Open Jeunes »). « Open U1600 » ou « -1700 » ne comptent pas.
const JEUNES = /\bU ?\d{1,2}\b|\bjeunes\b/i;
// Texte FFE échappé, avec adresses web et e-mails cliquables (le découpage capture les liens aux indices impairs)
const lier = (s) => String(s ?? '').split(/(https?:\/\/[^\s<>"]*[^\s<>".,;:)]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/)
  .map((p, i) => (i % 2 === 0 ? esc(p) : p.startsWith('http')
    ? `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(p)}</a>`
    : `<a href="mailto:${esc(p)}">${esc(p)}</a>`)).join('');

function fiche(t) {
  const f = t.fiche;
  let h = '';
  if (f) {
    const infos = [['Dates', f.dates], ...f.infos].filter(([, v]) => v);
    const valeur = (l, v, lien) => (/^https?:/.test(lien ?? '') ? `<a href="${esc(lien)}" target="_blank" rel="noopener">${esc(v)}</a>` : l === 'Cadence' ? esc(cadence(v)) : lier(v));
    h += `<table>${infos.map(([l, v, lien]) => `<tr><th>${esc(l)}</th><td>${valeur(l, v, lien)}</td></tr>`).join('')}</table>`;
    if (f.annonce) {
      // Liens de l'annonce ([texte, adresse]) : rendus cliquables à leur place, sinon listés à la suite
      let a = lier(f.annonce);
      const reste = [];
      for (const [t, u] of f.liens ?? []) {
        const lien = `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t || u)}</a>`;
        if (t && t !== u && a.includes(esc(t))) a = a.replace(esc(t), () => lien);
        else if (!f.annonce.includes(u)) reste.push(lien);
      }
      h += `<h3>Annonce</h3><p class="annonce">${a}</p>`;
      if (reste.length) h += `<h3>Liens</h3><p class="annonce">${reste.join('\n')}</p>`;
    }
  } else h += '<p class="note">Détails pas encore relus sur le site FFE.</p>';
  return h + `<p><a href="https://www.echecs.asso.fr/FicheTournoi.aspx?Ref=${t.ref}" target="_blank" rel="noopener">Fiche sur le site FFE ›</a></p>`;
}

// En cours : du premier jour du tournoi au dernier + 7 jours (même règle que src/worker.js)
const plus7 = (d) => iso(new Date(new Date(d + 'T12:00:00').getTime() + 7 * 86400000));
const enCours = (t, auj) => t.debut <= auj && auj <= plus7(t.fiche?.fin || t.debut);
const CLUB = CFG.clubNom || 'du club';
const DE_CLUB = /^[aeiouyh]/i.test(CLUB) ? "d'" + CLUB : 'de ' + CLUB;
const nbClub = (t) => t.resultats?.classement?.lignes?.length || t.resultats?.noms?.length || 0;
const ETATS = { jouee: 'terminée', encours: 'en cours', appariee: 'appariée, pas commencée', avenir: 'pas encore appariée' };
const ffe = (t, a) => `https://www.echecs.asso.fr/Resultats.aspx?URL=Tournois/Id/${t.ref}/${t.ref}&Action=${a}`;

// Tournoi en cours : classement et parties des joueurs du club (relus chaque soir à 20h)
function suivi(t) {
  const r = t.resultats;
  let h = `<h3>Joueurs ${esc(DE_CLUB)}</h3>`;
  if (!r) return h + '<p class="note">Résultats pas encore relus (chaque soir vers 20h).</p>';
  if (r.absent) return h + `<p class="note">Pas de résultats publiés sur le site FFE · relu ${esc(quand(r.t))}.</p>`;
  if (!nbClub(t)) return h + `<p class="note">Aucun joueur ${esc(DE_CLUB)} dans ce tournoi · relu ${esc(quand(r.t))}.</p>`;
  const c = r.classement;
  if (c?.lignes?.length && r.ronde) {
    h += `<h4>Classement après la ronde ${r.ronde}<small>${r.participants} joueurs · <a href="${esc(ffe(t, 'Cl'))}" target="_blank" rel="noopener">complet ›</a></small></h4>
      <table class="papi"><tr>${c.entetes.map((e) => `<th>${esc(e)}</th>`).join('')}</tr>
      ${c.lignes.map((l) => `<tr>${l.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table>`;
  }
  for (const ro of r.rondes ?? []) {
    const grise = ro.etat === 'avenir' || ro.etat === 'appariee';
    const np = ro.parties.length, cle = `${t.ref}:${ro.n}`;
    const titre = `<h4>Ronde ${ro.n}<small>${ETATS[ro.etat] ?? ''}${np ? ` · ${np} partie${np > 1 ? 's' : ''}` : ''}${ro.etat !== 'avenir' ? ` · <a href="${esc(ffe(t, String(ro.n).padStart(2, '0')))}" target="_blank" rel="noopener">toutes les parties ›</a>` : ''}</small></h4>`;
    if (!np) { h += `<div class="ronde${grise ? ' grise' : ''}">${titre}</div>`; continue; }
    // Rondes avec parties : repliées par défaut, ouvertes d'un clic sur leur titre
    const j = (nom, elo, d) => `<td class="${d ? 'club' : ''}">${esc(nom)}${elo ? ` <small>${esc(elo)}</small>` : ''}</td>`;
    h += `<details class="pli ronde${grise ? ' grise' : ''}" data-pli="${cle}" ${plisOuverts.has(cle) ? 'open' : ''}><summary>${titre}</summary>
      <table class="papi parties">${ro.parties.map((p) => `<tr><td class="ech">${esc(p.e)}</td>${j(p.b, p.eb, p.db)}<td class="res">${esc(p.r)}</td>${j(p.n, p.en, p.dn)}</tr>`).join('')}</table></details>`;
  }
  return h + `<p class="note">Résultats relus ${esc(quand(r.t))}.</p>`;
}

// Tournoi en cours : la fiche, moins utile une fois le tournoi commencé, est repliée par défaut
const plie = (cle, titre, contenu) => `<details class="pli" data-pli="${cle}" ${plisOuverts.has(cle) ? 'open' : ''}><summary>${titre}</summary>${contenu}</details>`;

function ligne(t, auj) {
  const f = t.fiche, r = t.resultats, cours = enCours(t, auj);
  const fin = f?.fin && f.fin !== t.debut ? f.fin : '';
  const n = nbClub(t);
  const resume = cours
    ? [`${t.ville} (${t.dep})`, r?.ronde ? `ronde ${r.ronde}/${r.total}` : f?.rondes && `${f.rondes} rondes`, n && `${n} joueur${n > 1 ? 's' : ''} ${DE_CLUB}`]
    : [`${t.ville} (${t.dep})`, f?.rondes && `${f.rondes} rondes`, f?.cadence && cadence(f.cadence)];
  const badge = cours ? ` <span class="badge${auj > (f?.fin || t.debut) ? ' fini' : ''}">${auj > (f?.fin || t.debut) ? 'terminé' : 'en cours'}</span>` : '';
  return `<details class="tournoi" data-ref="${t.ref}" ${ouverts.has(t.ref) ? 'open' : ''}>
    <summary><span class="date">${esc(jour(t.debut))}${fin ? `<small>au ${esc(jour(fin))}</small>` : ''}</span>
      <span class="titre"><b>${esc(t.nom)}</b>${badge}<small>${esc(resume.filter(Boolean).join(' · '))}</small></span></summary>
    <div class="fiche">${cours ? suivi(t) + plie(`${t.ref}:fiche`, '<h3>Fiche du tournoi</h3>', fiche(t)) : fiche(t)}</div></details>`;
}

function rendre() {
  const ligues = cal?.ligues?.length ? cal.ligues : CFG.ligues.map((code) => ({ code, nom: code }));
  $('sous-titre').textContent = 'Cadence lente · ' + ligues.map((l) => l.nom).join(', ');
  const auj = iso(new Date());
  // Tournois en cours (jusqu'à 7 jours après la fin) ou à venir (la liste FFE n'est relue qu'une fois par nuit).
  // Un tournoi jeunes en cours reste affiché s'il compte des joueurs du club.
  const actifs = (cal?.tournois ?? []).filter((t) => t.debut && (t.debut > auj || enCours(t, auj)));
  const tous = actifs.filter((t) => jeunes || !JEUNES.test(t.nom) || (enCours(t, auj) && nbClub(t)));
  if (ligue && !ligues.some((l) => l.code === ligue)) ligue = '';
  const compte = (code) => tous.filter((t) => t.ligue === code).length;
  $('ligues').innerHTML = (ligues.length > 1 ? [{ code: '', nom: 'Toutes', n: tous.length }, ...ligues] : ligues)
    .map((l) => `<button data-l="${l.code}" class="${l.code === ligue ? 'actif' : ''}">${esc(l.nom)} <small>${l.n ?? compte(l.code)}</small></button>`).join('');
  $('ligues').querySelectorAll('button').forEach((b) => (b.onclick = () => { ligue = b.dataset.l; ecrire('ligue', ligue); rendre(); }));

  const q = norm($('q').value.trim());
  const retenu = (t) => (!ligue || t.ligue === ligue)
    && (!q || norm([t.nom, t.ville, t.dep, t.fiche?.cadence, ...(t.fiche?.infos ?? []).map((x) => x[1])].join(' ')).includes(q));
  const visibles = tous.filter(retenu);
  // Case « tournois jeunes », avec le nombre de ceux masqués pour la ligue et la recherche en cours
  const masques = actifs.filter(retenu).length - visibles.length;
  $('jeunes-option').hidden = !actifs.some((t) => JEUNES.test(t.nom));
  $('jeunes').checked = jeunes;
  $('jeunes-txt').textContent = 'Afficher les tournois jeunes' +(masques ? ` (${masques})` : '');
  // Deux sections : en cours (ceux qui comptent des joueurs du club d'abord), puis à venir par mois
  const cours = visibles.filter((t) => enCours(t, auj)).sort((a, b) => (nbClub(b) > 0) - (nbClub(a) > 0) || a.debut.localeCompare(b.debut));
  const avenir = visibles.filter((t) => !enCours(t, auj));
  let h = '', mois = '';
  if (cours.length) h += `<h2 class="section">En cours <small>${cours.length}</small></h2>` + cours.map((t) => ligne(t, auj)).join('');
  if (avenir.length) h += `<h2 class="section">À venir <small>${avenir.length}</small></h2>`;
  for (const t of avenir) {
    const m = t.debut.slice(0, 7);
    if (m !== mois) { mois = m; h += `<h2 class="mois">${esc(jour(m + '-01', { month: 'long', year: 'numeric' }))}</h2>`; }
    h += ligne(t, auj);
  }
  $('liste').innerHTML = h;

  const n = visibles.length;
  $('etat').className = 'note' + (etat.startsWith('Erreur') ? ' err' : '');
  $('etat').textContent = !cal ? etat || 'Chargement…'
    : !cal.t ? "Calendrier en préparation : le relais lit le site FFE (environ 30 s par page). Revenez dans un quart d'heure."
    : `${n} tournoi${n > 1 ? 's' : ''}${q ? ' trouvé' + (n > 1 ? 's' : '') : ''} · liste FFE relue ${quand(cal.t)}${etat ? ' · ' + etat : ''}`;
}

async function charger() {
  try {
    const r = await fetch('/api/tournois');
    const d = await r.json();
    if (!r.ok) throw new Error(d.erreur || r.status);
    // Une réponse vide ne remplace pas un calendrier déjà affiché
    if (d.tournois.length || !cal?.tournois?.length) { cal = d; ecrire('calendrier', d); }
    etat = '';
  } catch (e) { etat = cal ? 'hors ligne' : 'Erreur : ' + (e.message || 'réseau indisponible'); }
  rendre();
}

$('q').oninput = rendre;
$('jeunes').onchange = (e) => { jeunes = e.target.checked; ecrire('jeunes', jeunes); rendre(); };
$('liste').addEventListener('toggle', (e) => {
  const ref = +e.target.dataset?.ref;
  if (ref) e.target.open ? ouverts.add(ref) : ouverts.delete(ref);
  const pli = e.target.dataset?.pli;
  if (pli) e.target.open ? plisOuverts.add(pli) : plisOuverts.delete(pli);
}, true);
rendre();
charger();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
