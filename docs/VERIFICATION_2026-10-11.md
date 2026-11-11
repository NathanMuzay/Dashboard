# Vérification de conformité — 11 octobre 2026

Cette vérification porte sur les sources locales après corrections, avant commit. Elle complète les constats historiques des 5 et 9 octobre ; elle ne prédit pas la note du jury.

## Corrections

- Contrôle serveur des abonnements lors des créations/imports et des nouvelles instances : refus 403 sans activation. Les modifications d’un type de widget sont également contrôlées.
- Conservation des instances désactivées : elles restent sauvegardables et supprimables, mais l’interface suspend leur contenu fournisseur. Une seule lecture des abonnements est partagée par les widgets du dashboard.
- Transactions et verrou par compte coordonnent sauvegardes et modifications des abonnements.
- Dashboard initial composé de météo et outils locaux ; plus de Calendar initial sans activation. Lors de la récupération d’un ancien stockage navigateur, seules les instances autorisées sont importées ; la copie locale d’origine est conservée.
- Modules bonus autonomes habitudes, administration et notifications déplacés dans `bonus/`. Imports, modules Rust et Dockerfiles adaptés. Le périmètre des améliorations intégrées au socle reste explicite dans `BONUS.md`.
- Documentation mise à jour : cookie persistant, habitudes, treize widgets, activation préalable, menaces, limites et alternatives.
- Visualisation personnelle d’espace disque retirée du livrable après archivage hors dépôt.
- Images Docker reconstruites et conteneurs remis à jour sans suppression des volumes. L’ancienne image annonçait douze widgets ; l’image actuelle en annonce treize.

## Résultats exécutés

| Vérification | Résultat |
| --- | --- |
| `npm run test -w frontend` | 48 réussis |
| Tests Cargo avec PostgreSQL et SMTP Mailpit explicite | 39 réussis |
| `npm run test:e2e -w frontend` avec SMTP de test | 18 réussis ; vidéo de démonstration ignorée par défaut |
| Build Vite | Réussi, y compris les imports hors du dossier frontend |
| `npm run poc` | Réussi : frontend, contrat public, persistance de deux météos |
| `docker compose build` | Images frontend et backend reconstruites |
| `docker compose up -d --wait` | Réussi ; services démarrés, init du modèle terminé |
| GET `/about.json` sur 8080 et 3001 | HTTP 200 ; 7 groupes, 13 widgets, IP et epoch présents |
| `git diff --check` | Aucun problème d’espacement |

Les tests utilisent Mailpit et des comptes de test, pas le SMTP Gmail personnel. Pour les tests Rust, définir explicitement `DATABASE_URL` vers un serveur PostgreSQL local de test, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, `SMTP_SECURITY=local`, `SMTP_USERNAME=''` et `SMTP_PASSWORD=''`. Les tests SQLx créent des bases isolées. Playwright utilise `lumi_e2e` et les ports 3001/5174 : arrêter le développement avant son exécution. Le développement a été redémarré après la recette.

Le test Rust ajouté couvre création interdite, activation, création autorisée, désactivation, sauvegarde de l’instance existante, refus d’une seconde instance ou d’un import et suppression autorisée. Le test navigateur ajouté vérifie pause, réactivation et conservation de la configuration.

## Limites des preuves

- Pas de nouveau consentement OAuth avec un compte réel ni d’envoi Gmail externe pendant cette intervention. La recette manuelle des fournisseurs reste distincte des simulations.
- Pas de certification d’accessibilité, d’audit de sécurité exhaustif ou de benchmark comparatif des technologies.
- La stack Docker est une démonstration locale. Un hébergement public nécessite une cible, un domaine/TLS, des secrets propres, SMTP réel, origines OAuth, sauvegardes restaurables et supervision.
- Le POC démontre la faisabilité de la stack retenue, pas la supériorité de ses performances sur les alternatives.
- Les bonus autonomes sont regroupés ; les points de raccordement et améliorations transversales restent dans le socle, comme détaillé dans l’inventaire.

Le guide de révision destiné au propriétaire est volontairement conservé hors dépôt. Aucun commit ni push n’a été effectué pendant cette intervention.
