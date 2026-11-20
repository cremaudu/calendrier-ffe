// Lecture des pages HTML du site FFE (echecs.asso.fr) : texte des cellules et champs du formulaire ASP.NET.
// Repris du relais PV FFE (projet pv-ffe, src/worker.js).

const ENT = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', icirc: 'î', iuml: 'ï',
  ucirc: 'û', ugrave: 'ù', euml: 'ë', oelig: 'œ', Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Agrave: 'À', Ccedil: 'Ç',
  euro: '€', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', deg: '°', hellip: '…', ndash: '–', mdash: '—', bull: '•',
};
const car = (n) => { try { return String.fromCodePoint(n); } catch { return ''; } }; // emojis compris (&#x1F3C6;)

// HTML → texte sur une ligne : balises retirées, entités décodées, espaces resserrés
export const decode = (s) =>
  s.replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => car(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => car(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, n) => ENT[n] ?? m)
    .replace(/\s+/g, ' ')
    .trim();

// Contenu HTML brut des cellules <td> d'une ligne de tableau
export const cells = (row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);

const attr = (tag, n) => tag.match(new RegExp('\\s' + n + '="([^"]*)"', 'i'))?.[1];

// Champs du formulaire ASP.NET (aspnetForm) tels qu'un navigateur les enverrait : base d'un postback
export function champsForm(html) {
  const i = html.indexOf('id="aspnetForm"');
  const h = i < 0 ? '' : html.slice(i);
  const champs = {};
  for (const m of h.matchAll(/<input\b[^>]*>/gi)) {
    const t = m[0], name = attr(t, 'name'), type = (attr(t, 'type') ?? 'text').toLowerCase();
    if (!name || /\sdisabled/i.test(t) || !['hidden', 'text'].includes(type)) continue;
    champs[name] = name.startsWith('__') ? attr(t, 'value') ?? '' : decode(attr(t, 'value') ?? '');
  }
  // Les attributs d'un textarea peuvent contenir « > » : le contenu est ce qui suit le dernier « > »
  for (const m of h.matchAll(/<textarea\b([\s\S]*?)<\/textarea>/gi)) {
    const name = attr(m[1], 'name'), fin = m[1].lastIndexOf('>');
    if (name && fin >= 0) champs[name] = decode(m[1].slice(fin + 1));
  }
  for (const m of h.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const name = attr(m[1], 'name');
    if (!name || /\sdisabled/i.test(m[1])) continue;
    const opts = [...m[2].matchAll(/<option\b([^>]*)>/gi)].map((o) => ({ v: decode(attr(o[1], 'value') ?? ''), s: /selected/i.test(o[1]) }));
    champs[name] = (opts.find((o) => o.s) ?? opts[0])?.v ?? '';
  }
  return champs;
}
