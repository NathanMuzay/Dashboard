# Vérification du projet contre le sujet — 9 octobre 2026

## Conclusion

Le code est synchronisé avec `origin/main` au commit `a930ca7` (`[Update] Ollama instead of Openai`). Les modifications locales préexistantes de `.env.example` et du README, concernant Gmail SMTP, ont été préservées et réintégrées. Les corrections de cette revue restent locales, sans commit ni push.

Les fonctionnalités principales sont présentes et les tests automatisés passent. La conformité complète au sujet n’est toutefois pas acquise : recette OAuth réelle incomplète, sources bonus hors du dossier imposé et activation des services contournable par les widgets initiaux/importés. Les points ouverts sont détaillés ci-dessous.

Référence lue intégralement : [sujet Dashboard](dashboard-project.pdf), dix pages PDF, notamment les pages 3 à 8 pour les exigences.

## Exigences et preuves

Équipe documentée : Milo Bousquet et Nathan Muzay, soit X = 2. Minimum demandé : 3 services et 6 widgets configurables.

| Exigence | Constat |
| --- | --- |
| Inscription et confirmation avant connexion | Tests Rust réussis : confirmation à usage unique, expiration, refus avant confirmation, renvoi limité, récupération du mot de passe |
| Authentification et données par compte | Sessions, rôles, accès intercomptes et persistance vérifiés avec PostgreSQL réel et bases de test isolées |
| Services et widgets | 7 groupes dans le catalogue public, 12 types ; détail ci-dessous. Quantité implémentée suffisante, essais fournisseurs encore incomplets |
| Abonnement avant utilisation | Activation présente dans Mon compte et le formulaire d’ajout. Réserve sur les widgets initiaux/importés et le contrôle serveur, décrite ci-dessous |
| Paramètres et timer | Ville, dépôt, limites, périodes, titre et intervalles configurables. Polling par instance pour les widgets de données ; envois Gmail/IA explicites |
| Ajout, édition, déplacement, suppression | Parcours Playwright réussi, y compris suppression/annulation et persistance après rechargement |
| Instances distinctes | Notes indépendantes vérifiées ; deux météos simulées distinctes en navigateur et configurations persistées en PostgreSQL |
| Responsive et accessibilité | Parcours 320/390/768 px réussis, sans débordement horizontal ; texte agrandi, contraste, focus et Échap ; captures mobile inspectées |
| README et justification technique | README, architecture, comparaison de trois solutions par couche, POC et scénario oral présents ; informations obsolètes actualisées |
| Docker et port 8080 | Construction et démarrage complets réussis sur `http://localhost:8080`, contrôles HTTP et navigateur réussis |
| `/about.json` | Tests Rust : IP client, horodatage Unix, services/widgets et paramètres `string`/`integer`, cohérence avec le catalogue frontend |
| Livraison des sources et bonus | Aucun `node_modules`, `target`, `dist` ou rapport de tests suivi par Git. Dossier `bonus/` absent : écart formel au sujet |

### Inventaire actuel

| Service | Widgets | Nombre |
| --- | --- | --- |
| GitHub | Push, graphe des commits | 2 |
| Spotify | Lecture en cours, top titres | 2 |
| Gmail | Non lus, rédaction | 2 |
| Google Calendar | Échéances, planning semaine/jour | 2 |
| Open-Meteo | Météo par ville | 1 |
| Ollama local | Assistant IA | 1 |
| Local | Notes, Focus | 2 |

Les cinq fournisseurs externes représentent neuf widgets, dont huit widgets de consultation avec polling. Le seuil peut donc être atteint sans compter Notes, Focus, Ollama ou l’envoi Gmail. Cela ne remplace pas les essais réels des fournisseurs OAuth.

## Vérifications exécutées

| Commande ou contrôle | Résultat |
| --- | --- |
| `git pull --ff-only origin main` | Mise à jour de `953064a` vers `a930ca7`, changements locaux restaurés |
| `npm ci` | Installation reproductible réussie ; Playwright et Chromium installés pour les tests |
| `npm run test -w frontend` | 45 tests réussis, rejoués après correction des dépendances |
| `cargo test --locked --manifest-path backend/Cargo.toml` | 35 tests réussis : 10 bibliothèque, 4 about, 5 comptes, 7 e-mails, 2 démarrage, 7 workspace |
| `npm run build -w frontend` | Compilation de production réussie |
| `npm run test:e2e -w frontend` | 15 réussis, 1 scénario vidéo ignoré volontairement, après correction des attentes GitHub |
| `node --test poc/frontend.test.mjs` | 1 test réussi ; tests POC backend inclus dans la suite Rust |
| `docker compose config --quiet` | Configuration valide |
| `docker compose build` | Frontend et backend compilés ; images reconstruites après correction du verrou npm |
| `docker compose up -d --wait` | Réussite ; modèle `qwen2.5:14b` installé (9,0 Go), initialisation terminée avec succès |
| `node poc/deployment-smoke.mjs http://127.0.0.1:8080` | Accueil/about 200, 7 groupes/12 widgets, corps trop grand 413, session absente 401, limites API/auth 429, CSP météo et version Nginx masquée |
| Chromium sur le frontend Docker | Accueil réel à 390 px : HTTP 200, aucun débordement horizontal, aucune erreur JavaScript non interceptée |
| `npm audit` | 0 vulnérabilité signalée après correction, toutes dépendances npm incluses |
| Appels Open-Meteo réels | Paris et Lyon : géocodage, températures numériques, horodatage et fuseau reçus |
| `git diff --check` | Sans erreur |

Les tests navigateur utilisent la base `lumi_e2e` et un compte de démonstration. Les identifiants SMTP sont vidés dans l’environnement des tests pour conserver Mailpit local ; aucun e-mail externe n’a été envoyé. Les scénarios fournisseurs du navigateur utilisent des réponses simulées.

## Corrections apportées

- README, TODO et présentation : cinq intégrations externes, Ollama, météo réelle, démarrage et initialisation du modèle, décompte des widgets et état de la vidéo.
- Verrou npm : `concurrently` 9.2.4 → 9.2.5, `shell-quote` 1.9.0 → 1.12.0, `source-map-js` 1.2.1 → 1.2.2. Trois alertes npm initiales (deux critiques, une élevée, dans les outils de développement) supprimées sans migration majeure.
- Tests navigateur GitHub et scénario vidéo : attendre le bouton d’abonnement avant d’inspecter `aria-pressed`. L’ancien `count()` pouvait renvoyer zéro pendant le chargement, sauter l’activation et faire échouer le test. Les assertions fonctionnelles restent présentes.

## Points restant ouverts

1. **Recette OAuth réelle.** [RECETTE.md](RECETTE.md) ne contient toujours pas de résultats validés pour Gmail, Google Calendar et Spotify. Les tests simulés ne prouvent ni les consentements, ni les données des comptes réels, ni l’envoi Gmail. GitHub public dispose de preuves historiques ; Open-Meteo a été retesté aujourd’hui.
2. **Dossier `bonus/`.** Le sujet exige les fichiers bonus dans ce dossier. Un inventaire dans `BONUS.md` ne remplit pas cette contrainte : les sources restent intégrées à `frontend/` et `backend/`. Une séparation réelle doit préserver les imports, le build et les tests ; créer uniquement un README dans `bonus/` ne suffirait pas.
3. **Abonnement préalable incomplet.** `frontend/src/dashboard/defaultWidgets.js` ajoute un widget Calendar au premier dashboard avant abonnement. `backend/src/workspace.rs` valide les configurations mais ne vérifie pas les abonnements lors de la création/mise à jour des dashboards ; un import peut donc inclure ces widgets. Les jetons OAuth restent nécessaires à l’accès aux données privées, mais la règle fonctionnelle du sujet n’est pas appliquée à tous les chemins. La désactivation conserve également les instances existantes, comme annoncé par l’interface.
4. **Connexion Google à Lumi non configurée localement.** `GOOGLE_OIDC_CLIENT_ID` est absent du `.env` local. Le backend refuse alors le challenge OIDC. Les Client IDs frontend ne remplacent pas cette configuration serveur ; aucune valeur privée n’a été affichée ou modifiée.
5. **Livraison et preuves historiques.** `work/visualizations/espace-disque.html` n’est pas lié à l’application et devrait être écarté de la livraison finale. La vidéo existe, mais n’a pas été réenregistrée ni revue intégralement aujourd’hui. Le contrôle de clone propre du 29 septembre précède Ollama ; `npm run check:clean` n’a pas été rejoué pendant cette revue.
6. **Versions disponibles.** `npm outdated` signale Playwright 1.64.0 (installé 1.63.0), Vite 6.4.4 dans la plage actuelle (installé 6.4.3), ainsi que des versions majeures Vite 8 et concurrently 10. Elles n’ont pas été imposées à ce contrôle de conformité. Aucun audit de vulnérabilités Rust ou des images Docker n’a été effectué ; le résultat npm ne les couvre pas.

Les rapports [VALIDATION.md](VALIDATION.md) et [VALIDATION_REMEDIATION.md](VALIDATION_REMEDIATION.md) sont conservés comme historique. Aucune validation complète de sécurité, d’accessibilité ou de qualité des réponses du modèle n’est déduite de cette vérification.

## État local laissé après la revue

L’application Docker reste disponible sur **http://localhost:8080**, avec PostgreSQL, Mailpit et Ollama. Les processus frontend/backend temporaires de Playwright sont arrêtés. Le modèle 14B est installé dans le volume du projet ; aucune génération IA réelle n’a été relancée pendant cette revue. Les tests de l’assistant sont automatisés et simulés ; les essais réels antérieurs restent décrits dans le rapport du 5 octobre.

Le stash nommé `codex-preserve-local-docs-before-main-2026-10-09` reste conservé comme sauvegarde des deux fichiers locaux avant le pull. Leurs ajouts Gmail sont également présents dans les fichiers de travail. Les fichiers temporaires de lecture du PDF ont été supprimés ; les rapports navigateur sont ignorés par Git.
