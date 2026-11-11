# Design system — Lumi

Direction proche de Nothing : palette monochrome, typographie en matrice de points pour l'identité et certains repères, boutons sobres, traits fins et angles peu arrondis. Le mode nuit s'inspire du contraste de SpaceX : fond noir profond, texte blanc et surfaces anthracite.

## Thèmes

| Usage | Jour | Nuit |
| --- | --- | --- |
| Fond | `#F5F5F5` | `#000000` |
| Surface | `#FFFFFF` | `#0B0B0B` |
| Surface secondaire | `#EAEAEA` | `#171717` |
| Texte | `#121212` | `#F4F4F4` |
| Texte secondaire | `#626262` | `#A1A1A1` |
| Bordures | `#D9D9D9` | `#282828` |

Les couleurs sont définies par variables CSS et partagées par les widgets, dialogues, formulaires et états interactifs. Le rouge est réservé aux erreurs et aux actions destructrices. Les images de services externes conservent leurs couleurs.

Le bouton **Jour / Nuit** est disponible dans la barre supérieure, sur l'accueil et après connexion. Le choix est conservé dans `localStorage` sous `lumi_theme`, appliqué avant le premier affichage et synchronisé entre onglets. Sans choix explicite, le thème suit la préférence du système. Si le stockage est indisponible, le bouton reste fonctionnel pour la page courante.

## Typographie et composition

- Police système pour le texte courant, les formulaires et les contrôles.
- Police locale **Nothing 5x7** pour le logo, la seconde ligne du titre d'accueil, les métadonnées et les grands chiffres.
- Titres d'accueil en capitales ; chiffres et petits détails évoquant un instrument de mesure.
- Rayons de 2–3 px et bordures fines. Les titres et les notes restent lisibles dans les deux thèmes.

La navigation du dashboard est **horizontale, en haut** : logo, tableau de bord, compte, thème et déconnexion. Elle reste visible au défilement. Sur mobile, elle se répartit sur deux lignes et les widgets s'affichent dans une colonne sans débordement horizontal.

## Interactions conservées

La connexion demande uniquement l'e-mail et le mot de passe. Le profil est choisi à l'inscription. Les fenêtres utilisent un dialogue natif avec fermeture par Échap et restauration du focus. Les onglets répondent aux flèches, à Début et à Fin.

Les notes sont éditables directement. Le minuteur peut être démarré, mis en pause et réinitialisé. **Organiser** active le déplacement par l'en-tête et le redimensionnement sur ordinateur. **Modifier** propose également les champs de taille et de position. La dernière suppression peut être annulée.

La disposition et les notes sont sauvegardées localement, par compte. Les contenus d'exemple sont distingués des services synchronisés. Les animations respectent `prefers-reduced-motion`.

## Organisation du frontend

- `frontend/src/main.jsx` démarre React et importe `style.css`.
- `frontend/src/App.jsx` gère la session ; `frontend/src/pages/` contient les écrans et `frontend/src/dashboard/` la composition des widgets.
- `frontend/src/api.js` centralise les requêtes vers le backend.
- `frontend/src/config.js` partage les libellés des rôles, les rôles proposés à l'inscription et la clé de session.
- `frontend/src/style.css` importe les modules de `frontend/src/styles/` dans l’ordre de la cascade.

Pour personnaliser le thème, modifier les variables de `:root` dans `styles/tokens.css` : couleurs, `--font-body`, `--font-display`, `--font-mono`, `--radius-control` et `--radius-panel`. Les couleurs du mode nuit sont dans `:root[data-theme='dark']`. Les paramètres propres au lecteur Spotify restent sur `.main-music-card`, et les valeurs calculées (position des widgets, progression) restent pilotées par React. Les états interactifs restent locaux à leurs composants.

### Modules CSS

| Fichier dans `frontend/src/styles/` | Contenu |
| --- | --- |
| `tokens.css` | Police locale, variables globales et palettes jour/nuit |
| `base.css` | Éléments HTML, typographie, accessibilité et utilitaires |
| `components.css` | Identité, boutons et liens partagés |
| `landing.css` | Accueil, aperçu et présentation des fonctionnalités |
| `dashboard.css` | Structure et introduction du tableau de bord |
| `widgets.css` | Grille, cartes, contenus des widgets et organisation |
| `forms.css` | Dialogues, authentification et éditeur de widget |
| `account.css` | Page du compte et informations utilisateur |
| `session.css` | Chargement, messages de session et éléments masqués |
| `responsive.css` | Adaptations communes aux écrans et réduction des animations |
| `spotify.css` | États partagés de Spotify et meilleurs titres |
| `theme.css` | Ajustements monochromes et navigation, avec leur responsive |
| `email.css` | Vérification et actions par e-mail |
| `spotify-player.css` | Lecteur Spotify, contrôles et formats compacts |

Les imports de `style.css` conservent l’ordre historique des règles : ne pas les trier alphabétiquement. Certaines règles de `theme.css` complètent celles des modules ; vérifier ce fichier pour modifier leur apparence finale. Les chemins des ressources CSS sont relatifs au module qui les déclare. Importer uniquement `style.css` depuis React pour éviter les chargements multiples.

### Widgets adaptatifs

`hooks/useWidgetSize.js` observe la taille réelle de chaque carte (y compris après redimensionnement ou changement de largeur de fenêtre). Les seuils sont centralisés : largeur étroite sous 300 px, très étroite sous 180 px ; hauteur compacte sous 240 px, très basse sous 160 px. Aucun contenu utilisateur n’est supprimé et les éléments masqués réapparaissent à l’agrandissement.

`styles/widget-adaptive.css`, importé en dernier, adapte les six types de widgets : texte et contrôles flexibles, notes éditables, détails secondaires masqués, liste Spotify défilante, lecteur réduit jusqu’au titre et à lecture/pause. Les actions Modifier / Supprimer restent disponibles ; aux tailles extrêmes, le défilement permet d’atteindre les commandes qui ne peuvent pas tenir. Les données et états React sont conservés pendant le changement de format.

Vérification des seuils et du nettoyage de l’observateur : `node --test frontend/tests/widget-size.test.mjs`.

## Direction produit — emploi du temps

Lumi vise un outil de productivité technologique et sobre, intuitif sans sacrifier les fonctions utiles. Trois usages restent distincts : emploi du temps (cours et activités, notamment récurrents), événements et gestion de tâches. Une connexion Notion pour les tâches est envisagée ultérieurement.

L’emploi du temps affiche uniquement les créneaux horaires dont le début et la fin tombent le même jour dans le fuseau du navigateur. La vue événements affiche uniquement les éléments de 7 jours minimum, triés par échéance croissante (date de fin en l’absence d’échéance explicite), sur le mois sélectionné. Les éléments plus courts qui passent minuit et les journées entières de moins de 7 jours ne figurent dans aucune de ces deux vues ; ils restent dans Google Calendar. Le gestionnaire de tâches est prévu ultérieurement.

La vue semaine est compacte : les créneaux sont empilés chronologiquement dans chaque jour, sans espaces pour les heures libres. Leur hauteur dépend de leur durée et de la place disponible, avec un minimum lisible. Le widget observe sa taille : sept colonnes sur grande largeur, quatre puis deux sur les formats étroits. Le défilement vertical reste possible quand la densité dépasse la place disponible. Les détails sont accessibles au clic ; les priorités, labels et échéances ne chargent pas cette vue. Le nouveau widget utilise par défaut toute la largeur et six lignes de hauteur ; les dimensions déjà enregistrées restent personnalisables via Modifier. Les styles sont dans `styles/calendar.css`.
