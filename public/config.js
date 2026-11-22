// Configuration du calendrier. Après modification : npx wrangler deploy
// Les textes s'écrivent entre apostrophes ; s'ils en contiennent une, utiliser des guillemets ("L'Échiquier").
window.CONFIG = {
  // Nom de l'appli (titre de la page et nom une fois installée sur le téléphone)
  appli: 'Calendrier FFE',
  // Ligues affichées, par leur code FFE. Codes possibles : ARA, BFC, BRE, CRS, CVL, EST, HDF, IDF, NAQ, NOR, OCC, PAC, PDL
  ligues: ['BRE', 'PDL', 'NOR'],
  // Tournois jeunes (championnats U10, U12…, « Open Jeunes ») affichés à la première visite : false = masqués (chaque visiteur peut les afficher)
  jeunes: false,
  // Club suivi dans les tournois en cours : numéro FFE (ListeJoueurs.aspx?Action=JOUEURCLUBREF&ClubRef=…) et nom court.
  // Les joueurs sont repérés par leur nom (liste du club) ou par la colonne club du classement (qui doit contenir clubNom).
  club: 1918,
  clubNom: 'Domloup',
  // Début de saison (MM-JJ) : la section « Terminés » (tournois du club de la saison) repart alors à zéro
  debutSaison: '09-01',
  // Image du dossier public/ affichée devant le titre ('' pour ne pas en afficher)
  logo: 'logo.png',
  // Couleurs : bandeau du haut, couleur d'accent, liens et boutons
  couleurs: { entete: '#161616', accent: '#f6c500', bouton: '#0070c0' },
};
