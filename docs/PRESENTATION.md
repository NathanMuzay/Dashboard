# Soutenance Lumi — déroulé de 6 à 8 minutes

Milo Bousquet et Nathan Muzay ont travaillé ensemble sur la conception, le frontend, le backend, les intégrations et la validation.

## 1. Le projet — 45 secondes

« Lumi réunit des informations et des outils dans plusieurs dashboards personnalisables. Chaque utilisateur choisit ses services, configure ses widgets et retrouve ses dashboards après reconnexion. »

L’équipe compte deux personnes. Le seuil du sujet est de trois services et six widgets. Le catalogue contient treize types de widgets, dont une météo Open-Meteo réelle sans compte fournisseur. Notes, Focus et Habitudes sont locaux ; les données privées des autres fournisseurs nécessitent un consentement.

## 2. Le parcours utilisateur — 2 minutes

1. Montrer l’inscription, le message de confirmation et Mailpit. Expliquer la différence entre confirmation d’adresse, lien de connexion et réinitialisation du mot de passe.
2. Se connecter avec le compte de démonstration local.
3. Créer un dashboard « Travail », ajouter Notes et Focus, modifier le contenu puis leur position.
4. Recharger la page et montrer les paramètres conservés.
5. Exporter la configuration JSON et l’importer dans un nouveau dashboard.

La vidéo `demo/lumi-demo.mp4` illustre les fonctionnalités locales. Elle n’atteste pas les consentements OAuth privés.

## 3. Les services — 2 minutes

Dans Mon compte, montrer les cinq abonnements (quatre fournisseurs et l’assistant local). La météo est disponible sans abonnement. Distinguer activation dans le catalogue et consentement du fournisseur.

- GitHub : dépôt public, liste des push et graphe de commits. Montrer la fréquence d’actualisation et expliquer le cache de trente secondes.
- Gmail : messages non lus et rédaction ; n’envoyer qu’à une adresse de test autorisée.
- Calendar : agenda principal, planning et événements longs classés par échéance.
- Spotify : lecture courante et top titres avec des paramètres différents.
- Météo : deux villes, données Open-Meteo et intervalle configurable.
- Assistant local : Ollama/Qwen2.5 14B, demande explicite sans clé API ; prévoir le délai CPU.

Utiliser des comptes déjà autorisés avant la soutenance. Si un fournisseur est indisponible, montrer le message d’erreur et expliquer ce qui a réellement été vérifié. Les essais OAuth encore ouverts sont listés dans `RECETTE.md`.

## 4. Architecture et sécurité — 1 minute

Navigateur React, API Rust/Axum, PostgreSQL. En Docker, Nginx expose le port 8080 et transmet les routes API. Mailpit capture les e-mails locaux.

Les comptes, sessions, dashboards et abonnements résident dans PostgreSQL. Le serveur déduit le propriétaire depuis la session. Une révision de sauvegarde empêche un appareil d’écraser silencieusement les modifications d’un autre.

Les mots de passe sont hachés avec bcrypt. Les jetons fournisseurs restent en mémoire. Le serveur limite les tentatives de connexion et produit des logs sans corps ni jetons. Nginx applique une CSP. Le déploiement public doit utiliser HTTPS.

## 5. Validation et limites — 1 minute

Montrer les commandes `npm test`, `npm run test:e2e -w frontend`, `docker compose build`, `docker compose up -d --wait`, ainsi que `/about.json` et `/api/docs`.

Présenter les tests d’isolation des comptes, de conflits, de permissions administrateur, des jetons OIDC et de formats importés. Montrer le rendu mobile et les commandes de déplacement au toucher.

Limites assumées : la météo dépend d’Open-Meteo et du résultat de recherche de ville ; les jetons externes demandent une reconnexion après rechargement ; le graphe GitHub est un aperçu borné ; les notifications et observations GitHub sont limitées à la session ; la mise à jour entre appareils se fait au rechargement.

## Répartition orale proposée

Milo : présentation, parcours dashboard et organisation de l’interface.
Nathan : services, architecture et validation.
Cette répartition sert uniquement à la prise de parole ; les deux membres ont contribué à toutes les parties.

## Avant la soutenance

- Vérifier les cases fournisseur de `RECETTE.md` avec les comptes de test.
- Préparer les comptes, e-mails de test, événements et lecture Spotify.
- Ouvrir l’application, Mailpit, `/about.json` et Swagger avant de commencer.
- Tester la vidéo et couper les notifications personnelles du poste.

## Complément après soutenance

Présenter le [bilan](REMEDIATION_SOUTENANCE.md), les [trois comparaisons par couche](CHOIX_TECHNOLOGIQUES.md) et le [POC](../poc/README.md). Démontrer deux météos, la panne explicite, les réglages d’accessibilité et la conservation PostgreSQL. Distinguer les essais simulés des consentements fournisseurs réels.
