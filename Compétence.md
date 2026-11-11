# Compétences développées - Dashboard / Lumi

Bilan établi le 11 novembre 2026 à partir des sources, configurations, tests et documents présents dans ce dépôt.

## Présentation

Conception d’un tableau de bord web personnalisable : comptes, espaces de travail, widgets, services externes et assistant conversationnel. Projet collectif ; le README cite Milo Bousquet et Nathan Muzay.

## Durée du projet

- Début du calendrier pédagogique : **14/09/2026**.
- Échéance indiquée : **11/10/2026**.
- Fenêtre prévue, dates incluses : **28 jours calendaires, soit 4 semaines** (27 jours d’écart entre les deux dates).
- Source : capture du tableau « Projets terminés » fournie par Nathan ; lecture de la date au pictogramme vert comme début et du drapeau rouge comme échéance. La date orange n’est pas utilisée comme début de développement.
- Historique du dépôt source local consulté : premier commit listé le **2026-09-14**, dernier commit listé le **2026-10-19**. Ces dates peuvent inclure des travaux après l’échéance et ne mesurent pas le temps de travail effectif.
- Heures investies, répartition individuelle et date exacte de fin de travail : **non renseignées**. Le commit d’import du portfolio ne représente pas la durée du projet.

## Lecture des niveaux de maîtrise

Ce bilan inventorie les compétences mobilisées et étayées par les livrables. Une analyse de dépôt ne permet pas de certifier l’acquisition individuelle, l’autonomie ni l’auteur de chaque réalisation. Les niveaux ci-dessous qualifient la profondeur d’utilisation visible **dans ce projet**, pas une certification ou un pourcentage de maîtrise personnelle de Nathan. Leur attribution individuelle reste à confirmer par ses contributions et une démonstration orale/pratique.

| Niveau | Signification dans ce document |
| --- | --- |
| Ciblé | Utilisation circonscrite à une fonction ou un outil ; expérience générale non établie. |
| Opérationnel | Utilisation concrète dans plusieurs tâches ou dans une fonctionnalité intégrée. |
| Approfondi | Plusieurs mécanismes internes sont implémentés ou articulés, avec des éléments de test ou d’analyse ; cela ne signifie pas expert du domaine. |

## Technologies et profondeur d’utilisation

| Technologie ou domaine | Niveau observé | Utilisation démontrée | Preuve dans le dépôt |
| --- | --- | --- | --- |
| Rust, Cargo | Approfondi | API typée, gestion des erreurs, modules, état partagé et traitements asynchrones | [backend/src](backend/src) |
| Axum, Tokio, Tower | Opérationnel | Routage HTTP, extracteurs, middleware et tests de service | [backend/Cargo.toml](backend/Cargo.toml) |
| JavaScript, JSX, React 19 | Approfondi | Composants, hooks, formulaires, état, interactions et synchronisation serveur | [frontend/src](frontend/src) |
| HTML, CSS | Opérationnel | Mise en page adaptative, grille et préférences d’accessibilité | [frontend/src/styles](frontend/src/styles) |
| PostgreSQL, SQL, SQLx | Approfondi | Modèle relationnel, requêtes, migrations et persistance des sessions | [backend/migrations](backend/migrations) |
| Serde, JSON, UUID | Opérationnel | Contrats de données, validation, sérialisation et identifiants | [backend/src/lib.rs](backend/src/lib.rs) |
| HTTP, REST, reqwest | Opérationnel | API internes et externes, statuts, erreurs et délais | [backend/src/openai.rs](backend/src/openai.rs) |
| OAuth 2, PKCE, OpenID Connect, JWT/JWKS | Opérationnel | Connexions fournisseurs et vérification de jetons ; recette fournisseur distincte | [backend/src/google_auth.rs](backend/src/google_auth.rs) |
| bcrypt, SHA-256, cookies de session | Opérationnel | Protection des mots de passe et parcours de connexion | [backend/src/auth.rs](backend/src/auth.rs) |
| SMTP, Lettre, Mailpit | Opérationnel | Envoi et test local d’e-mails transactionnels | [backend/src/mail.rs](backend/src/mail.rs) |
| API Mistral | Opérationnel | Intégration de génération distante, contrôle des requêtes et réponse bornée | [backend/src/openai.rs](backend/src/openai.rs) |
| rust_decimal, analyse syntaxique | Opérationnel | Calcul déterministe décimal après validation d’une expression | [backend/src/calculator.rs](backend/src/calculator.rs) |
| Vite, Node.js, npm workspaces | Opérationnel | Outils de développement, scripts, proxy et compilation frontend | [package.json](package.json) |
| Docker, Compose, Nginx | Opérationnel | Assemblage des services, images et reverse proxy | [docker-compose.yml](docker-compose.yml) |
| Playwright, node:test, tests Rust | Opérationnel | Tests unitaires, API et parcours navigateur | [frontend/playwright.config.js](frontend/playwright.config.js) |
| OpenAPI, Utoipa, Swagger UI | Opérationnel | Documentation de contrats et exploration interactive de l’API | [backend/src/lib.rs](backend/src/lib.rs) |
| Python et scripts shell/Node.js | Ciblé | Automatisation de vérification et lancement | [scripts](scripts) |

## Inventaire détaillé des compétences

### Architecture et conception

- Séparer présentation React, API Rust, stockage PostgreSQL et services tiers.
- Découper les responsabilités en modules et concevoir des contrats d’API.
- Concevoir un catalogue de widgets paramétrables et des composants réutilisables.
- Comparer des solutions techniques et documenter les compromis.
- Distinguer préférences d’abonnement internes et consentements OAuth externes.

### Interface et expérience utilisateur

- Gérer les formulaires, erreurs, chargements et états de connexion.
- Créer, modifier, supprimer, sélectionner et sauvegarder des dashboards.
- Configurer, déplacer et redimensionner les widgets ; offrir une alternative au clavier et au toucher.
- Valider des imports JSON et exporter les configurations sans jetons.
- Gérer la sauvegarde différée et les conflits de versions sans écrasement silencieux.
- Restaurer une session et migrer des données locales vers un espace serveur.
- Adapter le rendu mobile, la taille du texte, le contraste et les commandes accessibles.
- Implémenter notes, habitudes, historique et minuteur ; afficher les notifications.

### Backend, données et sécurité

- Créer des comptes, attribuer et vérifier des rôles cumulables côté serveur.
- Contrôler le propriétaire de chaque ressource et gérer les permissions administrateur.
- Persister les utilisateurs, sessions, dashboards et abonnements avec des migrations SQL.
- Hacher les mots de passe ; révoquer les sessions et limiter les tentatives de connexion.
- Construire les parcours de confirmation, connexion par lien et réinitialisation avec expiration et usage unique.
- Vérifier signature, audience, émetteur, expiration et nonce des jetons Google.
- Gérer une association explicite entre compte local et identité Google.
- Limiter les requêtes intersites, ajouter les en-têtes de sécurité et configurer une CSP.
- Garder les secrets API côté serveur et limiter la persistance des jetons fournisseurs.
- Journaliser statut, durée et identifiant de requête sans recopier les corps ni jetons.

### Intégrations et IA

- Consommer GitHub, Spotify, Gmail, Google Calendar et Open-Meteo.
- Gérer autorisations, fenêtres OAuth, retour PKCE et invalidation de session.
- Rafraîchir des widgets, mettre en cache certaines réponses et traiter les indisponibilités.
- Lire et créer des événements ; lire des messages et déclencher explicitement leur envoi.
- Intégrer un LLM distant avec quotas, limites d’entrée et contrôle de concurrence.
- Séparer interprétation linguistique et calcul déterministe.
- Valider les nombres d’un plan de calcul et borner l’expression, les intervalles et les exclusions.

### Qualité, livraison et travail collectif

- Écrire des tests unitaires frontend et des tests d’intégration backend.
- Tester rôles, sessions, erreurs, import/export et conflits de sauvegarde.
- Automatiser des parcours navigateur et vérifier un viewport mobile.
- Utiliser des réponses simulées sans les confondre avec une recette OAuth réelle.
- Organiser une installation reproductible, une base isolée pour les tests et des services Docker.
- Rédiger architecture, contrats, guides d’intégration, recette et supports de soutenance.
- Collaborer via Git et partager les conventions d’un projet frontend/backend.

## Limites et compétences non attestées

- L’intégration de Mistral démontre une compétence d’utilisation d’API de LLM, pas d’entraînement de modèle.
- La présence des intégrations ne certifie pas leur validation réelle avec tous les comptes fournisseurs ; le README distingue les recettes restantes.
- Le déploiement public, HTTPS, exploitation à grande échelle et audit de sécurité ne sont pas attestés par ce bilan.

## Compétences transversales

- Traduire un sujet en fonctionnalités et organiser un livrable exécutable.
- Décomposer un problème, isoler les responsabilités et rechercher les causes d’erreurs.
- Lire et produire une documentation technique, des exemples et des commandes reproductibles.
- Utiliser Git pour versionner et livrer le travail.
- Relier un choix technique à ses contraintes et expliquer ses limites.

La gestion personnelle du temps, la répartition des tâches, le leadership et l’autonomie ne peuvent pas être déduits des seuls fichiers ; ils demandent un retour d’expérience individuel.

## Vérification et preuves

Les niveaux reposent sur une inspection des sources et sur les tests/rapports déjà présents. Aucun résultat d’exécution nouveau, taux de couverture ou succès de CI n’est revendiqué dans ce document. Les liens ci-dessus permettent de retrouver les implémentations. Les rapports historiques doivent être lus avec leur date, leurs conditions et leurs limites.

## Points à préciser pour une présentation individuelle

- Modules conçus, codés, testés ou documentés personnellement par Nathan.
- Contributions réalisées en autonomie, en binôme ou avec accompagnement.
- Difficulté rencontrée, diagnostic et solution qu’il peut expliquer sans support.
- Capacité actuelle à reproduire ou adapter les réalisations dans un autre projet.
- Temps réellement consacré et résultats officiellement évalués, si disponibles.
