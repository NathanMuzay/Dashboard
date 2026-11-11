# Comparaison et justification des technologies

Date : 5 octobre 2026. Cette étude complète les choix déjà implémentés. Les appréciations sont celles de l’équipe pour Lumi ; elles ne constituent pas des résultats de benchmark. Trois solutions sont comparées pour chaque couche, sur les mêmes cinq critères : adéquation fonctionnelle, développement, fiabilité/sécurité, exploitation, évolution. Le [POC](../poc/README.md) vérifie la faisabilité de la stack retenue ; il ne mesure pas les performances des alternatives.

## Frontend : React, Vue, Angular

| Critère | React (retenu) | Vue | Angular |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | Composants indépendants et hooks pour widgets, OAuth et timers | Composants et réactivité adaptés aux mêmes widgets | Composants et services adaptés ; framework plus prescriptif |
| Développement | Réutilise les composants existants ; état à organiser explicitement | Templates et réactivité facilitent une petite interface ; réécriture nécessaire | Conventions, formulaires et outillage intégrés ; apprentissage et migration plus importants ici |
| Fiabilité/sécurité | Échappement du texte JSX ; validation serveur, CSP et gestion des secrets restent nécessaires | Échappement des templates ; mêmes obligations pour OAuth et API | Conventions et protections de templates ; mêmes obligations serveur |
| Exploitation | Build Vite statique servi par Nginx | Build statique possible avec Vite et Nginx | Build statique possible ; chaîne Angular à maintenir |
| Évolution | Catalogue de composants extensible ; attention à la dispersion de l’état | Bon candidat pour une petite équipe ; migration du modèle de composants | Bon candidat pour une équipe plus grande recherchant des conventions fortes |

**Décision** : conserver React permet de compléter la météo et l’accessibilité avec les composants et tests déjà présents. L’impact principal est la nécessité de conventions internes pour les clients fournisseurs, les états de chargement et le stockage. Le frontend ne remplace jamais l’autorisation serveur.

**Alternative proposée** : Vue si l’équipe préfère les templates et accepte une réécriture contrôlée ; Angular si le projet devient un portail porté par une équipe plus grande avec formulaires complexes. Déclencheur de réexamen : coût récurrent de maintenance de l’état et divergence des conventions entre widgets. Une migration devrait préserver le contrat JSON et les parcours Playwright.

Sources primaires : [React, composants et état](https://react.dev/learn/thinking-in-react), [Vue, introduction](https://vuejs.org/guide/introduction.html), [Angular, documentation](https://angular.dev/docs).

## Backend : Rust/Axum, Python/FastAPI, Node.js/Express

| Critère | Rust / Axum (retenu) | Python / FastAPI | Node.js / Express |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | API JSON, extracteurs typés, Tokio, SQLx, tâches asynchrones | API JSON, validation typée et OpenAPI intégrée | API JSON et routage ; validation et OpenAPI à assembler |
| Développement | Compilation exigeante ; code existant et tests réutilisables | POC rapide pour équipe Python ; intégrations Python disponibles | JavaScript partagé avec le frontend ; TypeScript conseillé pour les contrats |
| Fiabilité/sécurité | Typage et sûreté mémoire ; règles métier, quotas et permissions à écrire | Validation de modèles ; règles métier, quotas et permissions à écrire | Validation, permissions et middleware à choisir explicitement |
| Exploitation | Binaire compilé ; build initial plus coûteux ; pool PostgreSQL | Runtime Python et serveur ASGI à administrer | Runtime Node et dépendances à administrer |
| Évolution | Modules API séparés ; apprentissage Rust à prévoir pour nouveaux membres | Facile à étendre si équipe Python ; vérifier les appels bloquants | Large écosystème ; maintenir une architecture et maîtriser le graphe de dépendances |

**Décision** : conserver Axum pour ses extracteurs, le typage et l’intégration existante avec SQLx. Les vérifications SQL, les jetons expirants, la limitation des connexions et les tests d’isolation apportent la sécurité applicative ; choisir Rust seul ne suffit pas. Le coût assumé est la compilation et la compétence nécessaire.

**Alternative proposée** : FastAPI si la vitesse d’itération d’une équipe Python devient prioritaire ; Express/TypeScript si la mutualisation des compétences JavaScript réduit le coût total. Déclencheur : indisponibilité durable de compétences Rust. Reprendre le même contrat HTTP et les scénarios d’authentification avant toute migration. Aucune supériorité chiffrée de débit n’est revendiquée sans charge mesurée.

Sources primaires : [Axum](https://docs.rs/axum/latest/axum/), [FastAPI, fonctionnalités](https://fastapi.tiangolo.com/features/), [Express, serveur et routes](https://expressjs.com/en/starter/hello-world/).

## Base de données : PostgreSQL, SQLite, MongoDB

| Critère | PostgreSQL (retenu) | SQLite | MongoDB |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | Relations comptes/rôles/sessions ; widgets flexibles en JSONB | Relations et transactions ; bon candidat pour une instance locale | Documents adaptés aux dashboards ; relations comptes/rôles à modéliser autrement |
| Développement | Migrations SQLx existantes ; contraintes et requêtes paramétrées | Installation simple ; adaptation des migrations et types nécessaire | Schéma documentaire flexible ; adaptation des requêtes et validations nécessaire |
| Fiabilité/sécurité | Contraintes, transactions, verrous et révisions applicatives | Transactions ; un seul écrivain à la fois ; permissions fichier à protéger | Transactions disponibles ; contraintes relationnelles à remplacer par règles adaptées |
| Exploitation | Service Docker, sauvegardes et restauration à organiser | Fichier embarqué ; sauvegarde cohérente et volume persistant indispensables | Service et sauvegardes à organiser ; topologie à prévoir pour transactions |
| Évolution | Plusieurs connexions ; JSONB évite une table par type de widget | Adapté à une petite instance ; limites de concurrence d’écriture à considérer | Bon candidat si la structure documentaire domine ; complexité supplémentaire pour les liens entre comptes |

**Décision** : PostgreSQL correspond au modèle relationnel de Lumi tout en conservant une configuration JSON par dashboard. Les mises à jour comparent une révision pour éviter l’écrasement silencieux entre appareils. Impact : un service supplémentaire, des migrations et une responsabilité de sauvegarde. Un volume Docker assure la persistance après redémarrage, mais ne constitue pas une sauvegarde.

**Alternative proposée** : SQLite pour une édition autonome avec peu d’écritures concurrentes ; MongoDB si le produit devient principalement documentaire et que le modèle relationnel diminue. Déclencheurs : besoin d’une installation sans serveur SQL, ou transformation substantielle du modèle. Prévoir une migration réversible, vérifier l’isolation et conserver les identifiants avant de basculer.

Sources primaires : [PostgreSQL, isolation des transactions](https://www.postgresql.org/docs/current/transaction-iso.html), [SQLite, cas d’utilisation et concurrence](https://www.sqlite.org/whentouse.html), [MongoDB, transactions](https://www.mongodb.com/docs/manual/core/transactions/).

## Décision transversale

La stack actuelle reste retenue parce que son intégration est démontrée par un POC reproductible et que sa migration ne répondrait pas directement aux défauts observés par le jury. Les améliorations ciblent les comportements : données météo réelles, lisibilité, protection des entrées et preuves. Les alternatives ci-dessus sont des propositions documentées ; elles n’ont pas été développées ni benchmarkées.
