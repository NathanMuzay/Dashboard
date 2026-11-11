# Nettoyage du répertoire personnel — 5 octobre 2026

Analyse des tailles sous `/home`, puis nettoyage ciblé des caches régénérables de `/home/nathan-muzay`. Les autres comptes de `/home` sont conservés. Aucun nettoyage global des profils ou des projets n’a été effectué.

Espace disponible : **10.64 Go avant**, **45.70 Go après**, soit **35.06 Go récupérés**. Ces mesures concernent ce nettoyage ; le nettoyage précédent de Lumi avait déjà libéré environ 5,6 Go.

## Caches supprimés

| Dossier sous le répertoire personnel | Taille allouée constatée avant suppression |
|---|---:|
| `.cache/pip` | 10.47 Go |
| `.cache/vscode-cpptools` | 10.14 Go |
| `.npm/_cacache` | 1.89 Go |
| `.gradle/caches` | 7.76 Go |
| `.config/Code/CachedExtensionVSIXs` | 1.40 Go |
| `.config/Code/CachedData` | 0.20 Go |
| `.config/Code/Cache` | 0.50 Go |
| `.config/Code/Code Cache` | 0.00 Go |
| `.config/Code/GPUCache` | 0.00 Go |
| `.cache/google-chrome/Default/Cache` | 0.93 Go |
| `.cache/google-chrome/Default/Code Cache` | 0.39 Go |
| `.cache/google-chrome/Profile 1/Cache` | 0.85 Go |
| `.cache/google-chrome/Profile 1/Code Cache` | 0.20 Go |
| `.cache/thumbnails` | 0.01 Go |
| `.cache/electron` | 0.23 Go |
| `.cache/mesa_shader_cache` | 0.07 Go |
| `.cache/mesa_shader_cache_db` | 0.01 Go |

Les tailles de dossiers sont indicatives. Le gain réel est mesuré sur le disque ; il peut différer légèrement de leur somme en raison des fichiers partagés et de l’activité des applications.

## Éléments conservés

- Projets et historique Git, fichiers personnels et téléchargements.
- Configurations, comptes, données et profils Chrome/VS Code, notamment `Code/User` et les informations de récupération d’édition.
- Extensions VS Code installées ; seuls leurs paquets téléchargés et les caches ont été retirés.
- Environnements Python et paquets installés, notamment `.venv` dans les projets et `.local/lib`.
- SDK Android, émulateurs, Flutter, Rust, Node, distributions Gradle et outils installés.
- Runtimes Codex, navigateurs Playwright et autres programmes stockés dans des dossiers nommés « cache » mais utilisés comme outils.
- Volumes Docker, PostgreSQL et modèle Ollama.

Le nom « cache » ne suffit pas à conclure qu’un dossier est inutile. Les historiques locaux Android Studio et les données d’applications n’ont pas été supprimés.

## Effet au prochain démarrage

Les caches d’analyse de code et de navigateur se reconstruiront. Les prochains builds Gradle et les installations pip/npm pourront nécessiter une connexion Internet et prendre davantage de temps pour retélécharger les dépendances. Les dépendances déjà installées dans les projets ont été conservées. Aucun build complet n’a été relancé, pour éviter de recréer immédiatement les caches supprimés.
