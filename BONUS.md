# Bonus et périmètre de livraison

Les modules additionnels autonomes sont regroupés dans [`bonus/`](bonus/README.md), à la racine du dépôt. Ils sont compilés avec l’application ; leurs points de raccordement restent dans le catalogue, les routes et la validation partagée.

| Bonus autonome | Sources |
| --- | --- |
| Suivi des habitudes, historique et séries | `bonus/frontend/habits/`, `bonus/backend/habits.rs` |
| Administration des comptes, rôles et révocation des sessions | `bonus/frontend/AdminUsers.jsx`, `bonus/backend/admin.rs` |
| Centre de notifications de la session | `bonus/frontend/Notifications.jsx` |

La connexion à un fournisseur d’identité, le déplacement des widgets, le responsive et l’accessibilité répondent au sujet : ils ne sont pas présentés comme des bonus. Les thèmes, la recherche, les dashboards multiples, l’import/export et les caches sont des améliorations intégrées au socle commun. Ils restent dans les composants partagés ; cette organisation ne prétend pas isoler chaque amélioration de confort dans un paquet indépendant.

Les tests d’intégration restent dans les suites communes pour vérifier l’application complète. Les Dockerfiles copient `bonus/` explicitement ; les imports Vite et les chemins de modules Rust pointent vers ces sources uniques.

`node_modules`, `target`, `dist`, les rapports de tests et `.env` sont exclus de Git. Les clés de `backend/tests/fixtures` servent uniquement à signer/vérifier des jetons de test, jamais en production.
