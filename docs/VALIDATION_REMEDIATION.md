# Vérification des corrections de soutenance

Date : 5 octobre 2026. Résultats observés pendant la modification du dépôt, sans commit ni publication externe.

| Vérification | Résultat constaté |
| --- | --- |
| `npm run test -w frontend` | 10 fichiers de tests passent, dont les nouveaux cas météo : deux villes, 0 °C, ville absente, quota, réponse incomplète et validation d’intervalle |
| Tests Rust complets avec PostgreSQL local | 24 tests passent lors de la première suite complète ; un test supplémentaire du catalogue météo a ensuite été ajouté et validé (4 tests `about` passent) |
| `npm run poc` | Réussite : jeu de données partagé, import/export frontend, compilation React, contrat public, rejet 413, création/lecture PostgreSQL de deux météos et rejet d’un intervalle invalide |
| Build frontend de production | Réussite ; mêmes sources compilées dans l’image Docker |
| Suite Playwright complète finale | 13 tests passent ; 1 démonstration vidéo volontairement ignorée par défaut |
| Nouveaux parcours Playwright | Deux météos à valeurs simulées distinctes, panne explicite, 320/390/768 px, texte agrandi, contraste, Tab/Échap, restauration des préférences et page des données |
| Inspection visuelle | Captures dashboard et compte mobile examinées ; commandes en colonne, villes et source météo lisibles ; réglage d’accessibilité placé dans le flux pour éviter de couvrir les commandes |
| Appels Open-Meteo réels | Deux appels du client avec géocodage réussissent : Paris, Île-de-France et Lyon, Rhône-Alpes ; températures numériques, horodatage et fuseau `Europe/Paris` reçus |
| Test du proxy Docker sur 18080 | Réussite : accueil/about 200, 7 services/12 widgets, corps 413, session absente 401, quotas API/auth 429, CSP météo et version Nginx masquée |
| Chromium sur le frontend Docker | Réussite : accès réel au géocodage et aux conditions météo avec la CSP, texte agrandi actif et accueil à 390 px sans débordement |
| Images Docker | Compilation frontend et backend réussie avec les Dockerfiles du projet |
| Contrôle des différences | `git diff --check` sans erreur |

## Corrections révélées par les essais

Le premier parcours clavier pouvait envoyer le focus hors du dialogue après la dernière case. `Dialog.jsx` boucle désormais explicitement Tab et Maj+Tab entre ses contrôles ; Échap et le retour au déclencheur passent dans les nouveaux tests.

Le test existant de panne GitHub restaurait des widgets avant d’installer sa simulation. Un quota réseau réel pouvait donc remplacer le message de panne attendu. La simulation est désormais installée avant la connexion ; la suite complète finale passe.

L’essai de déploiement a détecté un doublon des en-têtes `X-Content-Type-Options`, `X-Frame-Options` et `Referrer-Policy` entre Axum et Nginx. Le proxy masque les valeurs amont puis émet une seule valeur ; l’API directe conserve ses propres protections.

## Déploiement local et portée des preuves

Le port 8080 était déjà occupé : le démarrage de la stack à ce port a échoué sans arrêter le service existant. La configuration livrée conserve bien `127.0.0.1:8080:80`. Un frontend temporaire accessible sur `http://127.0.0.1:18080` a été utilisé sur `127.0.0.1:18080` avec le backend du projet, afin de vérifier le proxy sans modifier ce port.

Le script [deployment-smoke.mjs](../poc/deployment-smoke.mjs) vérifie, sur une origine locale uniquement : accueil public, CSP météo, version Nginx masquée, contrat `about.json`, rejet 413, route privée 401 et limitations 429 API/authentification. Il déclenche des rafales de GET sans création de compte ni modification de dashboard. Attendre le renouvellement des quotas ou redémarrer le proxy de test avant de le rejouer immédiatement.

```bash
node poc/deployment-smoke.mjs http://127.0.0.1:8080
```

Les tests frontend et fournisseur Playwright utilisent des réponses simulées ; le POC SQL utilise PostgreSQL réel avec bases isolées. Les appels Open-Meteo réels vérifient le client et le fournisseur au moment de l’essai, sans garantir leur disponibilité future. Les températures ne sont pas copiées dans le code.

Les consentements OAuth réels, les mails reçus par une boîte externe, l’appel OpenAI payant, les tests de charge et les audits complets d’accessibilité/sécurité ne sont pas déclarés validés par ces travaux. La recette correspondante reste dans [RECETTE.md](RECETTE.md).

## Complément sur les doublons

Après la correction de la comparaison des textes, les tests frontend et le build de production passent. Le parcours navigateur dédié passe : doublons insensibles à la casse bloqués à la création/modification et édition du widget lui-même autorisée. Il a été exécuté avec un serveur frontend isolé sur 5185 et des API simulées, car le port backend habituel était occupé.


## Complément sur OpenAI

Le lecteur dotenvy a confirmé qu’une ligne `MAIL_FROM` mal formée interrompait le chargement avant `OPENAI_API_KEY`. Après correction, le fichier se charge entièrement et la clé est présente, sans affichage de sa valeur. Les identifiants SMTP ont été conservés commentés pour le mode Mailpit local, puis les serveurs de développement ont été relancés.

Les tests dédiés vérifient la syntaxe du modèle `.env.example`, le refus d’un fichier mal formé sans fuite de valeurs et la distinction entre crédit épuisé, limites de dépenses et limitation temporaire. L’appel OpenAI de diagnostic réel a reçu HTTP 429 / `credit_balance_exhausted` ; aucune réponse générée n’est donc déclarée validée et aucun crédit n’a été acheté.

## Assistant local Ollama — 5 octobre 2026

- Modèle final installé : `qwen2.5:3b` (environ 1,9 Go), dans le volume propre à Lumi. Le modèle d’essai Qwen3 4B a été retiré de ce volume ; le service préexistant sur 11434 a été conservé.
- Test réel direct sur CPU : « Quelle est la somme des entiers de 1 à 10 ? » → « La somme des entiers de 1 à 10 est 55. », environ 11 secondes avec chargement du modèle.
- Parcours réel navigateur → API Rust authentifiée → Ollama → widget : réponse 55 affichée ; HTTP 200 pour disponibilité et génération. Le widget a été monté temporairement, sans enregistrer ni modifier les dashboards.
- Tests Rust complets : **30 réussis**, dont contrôle des requêtes locales sans clé, erreurs, modèle sélectionné, validation des prompts, autorisations et migration des titres (ordre et titres personnalisés préservés, réexécution sans changement).
- Frontend : **10 fichiers de tests réussis**, build Vite réussi.
- Playwright complet : **15 réussis**, 1 scénario de démonstration ignoré. Après sélection du modèle final, les **4 scénarios assistant/activation** ont été relancés et réussis, ainsi que les **3 tests Rust du client local**.
- `docker compose config --quiet` et `nginx -t` : réussis. Services Ollama/PostgreSQL/Mailpit sains. Démarrage `npm run dev` réussi avec un modèle déjà présent : l’initialisation consulte le modèle local et évite de le retélécharger.

Le frontend et le backend sont relancés sur les ports de développement 5174 et 3001. Les images applicatives Docker n’ont pas été reconstruites dans cette vérification : la configuration Compose et la syntaxe Nginx ont été contrôlées, et Ollama fonctionne réellement en conteneur. La qualité générale du modèle n’a pas fait l’objet d’un benchmark ; l’essai de calcul confirme le fonctionnement de l’intégration.

## Correction du calcul erroné — 5 octobre 2026

Cas réel signalé : « fais moi la multiplication des nombres 12 3.1 et 2 puis tu soustrait 31.4 ». La réponse initiale annonçait 91,7 malgré une multiplication intermédiaire à 74,4. Résultat attendu : **43**.

Après correction, la phrase exacte a été envoyée depuis le widget au backend temporaire sur 3002, avec authentification Lumi et Ollama réel. Résultat affiché : `Expression interprétée : 12 × 3,1 × 2 - 31,4` puis `Résultat calculé : 43`. L’essai a réussi avec Qwen2.5 7B (~24 secondes) et avec le modèle 3B conservé (~17 secondes, incluant son rechargement). Le modèle 7B d’essai a été retiré pour libérer l’espace disque. Les serveurs ouverts par l’utilisateur sur 3001/5174 n’ont pas été redémarrés ; il faut les relancer pour charger le correctif backend.

Vérifications ciblées après ce correctif :

- **10 tests de bibliothèque Rust réussis** : précision décimale, cas exact, précédence, parenthèses, arrondis, division par zéro, caractères interdits, profondeur, débordements, rejet de nombres inventés et traduction structurée. Les expressions explicites fonctionnent sans serveur Ollama dans le test.
- **7 tests workspace réussis**, dont le nouveau parcours API : abonnement obligatoire, résultat 43 et quota de cinq demandes conservé.
- **4 tests navigateur assistant/activation réussis** avec le serveur frontend déjà ouvert ; build Vite réussi.
- Configuration Docker valide ; modèle 3B installé et conservé. Aucun appel à un service IA cloud.

Quatre questions générales ont aussi été essayées sur 3B et 7B : `17 × 23` → 391 ; capitale australienne → Canberra ; définition cohérente d’une API ; météo actuelle → refus d’inventer une valeur sans données en direct. Ces essais ne constituent pas une mesure générale de précision et ne garantissent pas les réponses aux autres questions. La traduction d’une phrase arithmétique en expression reste une étape effectuée par le modèle ; le résultat numérique de cette expression est calculé par Rust.

## Nettoyage de l’espace disque — 5 octobre 2026

Les fichiers générés du backend ont été supprimés avec `cargo clean --manifest-path backend/Cargo.toml`. Deux caches privés de build Docker correspondant à `cargo build --locked --release --manifest-path backend/Cargo.toml` ont ensuite été supprimés par leurs identifiants exacts, sans nettoyage global de Docker.

Espace disponible mesuré avec `df -B1` : **5,06 Go avant**, **10,69 Go après**, soit environ **5,63 Go récupérés**. Les sources, `.env`, historique Git, volumes PostgreSQL/Ollama et images actives ont été conservés. Les serveurs utilisateur sur 3001/5174 et les services Docker sont toujours actifs. Le prochain build Rust/Docker recréera ses fichiers et prendra davantage de temps.

Docker annonce encore environ **7,65 Go de cache de build récupérable**, partagé avec les autres projets. Ce cache n’a pas été supprimé ; il est présenté uniquement comme une possibilité supplémentaire, sans promettre le gain exact. Aucun modèle plus gros n’a été installé à cette étape.

## Passage au modèle Qwen2.5 14B — 5 octobre 2026

Modèle `qwen2.5:14b` réellement téléchargé dans le volume Ollama : environ 9 Go, empreinte `7cdf5a0187d5`. Ollama indique environ 9,9 Go pour le modèle chargé, contexte de 4 096 tokens, exécution CPU. Le modèle 3B reste disponible pour un éventuel retour manuel. Les configurations `.env` locale, `.env.example`, Compose et Rust sélectionnent désormais 14B.

| Question testée directement avec Ollama | Résultat observé | Durée |
|---|---|---|
| Capitale de l’Australie | Canberra | 62.9 s |
| Différence HTTP/HTTPS | HTTP sans chiffrement ; HTTPS avec chiffrement SSL/TLS | 22.6 s |
| Paul > Sarah > Luc : le plus jeune | Luc | 10.7 s |
| Météo actuelle à Lyon | Indique ne pas pouvoir vérifier la météo en direct | 33.7 s |

La première demande inclut le chargement du modèle ; les suivantes ne donnent pas une mesure générale de performance. Ces quelques essais ne constituent pas un benchmark comparatif avec 3B et ne garantissent pas l’exactitude des autres réponses.

Essai final navigateur → backend authentifié temporaire sur 3002 → modèle 14B → calculateur : la phrase exacte `fais moi la multiplication des nombres 12 3.1 et 2 puis tu soustrait 31.4` affiche `Expression interprétée : 12 × 3,1 × 2 - 31,4` puis `Résultat calculé : 43`, en environ 38 secondes. Aucun dashboard n’a été enregistré ou modifié par cet essai.

Vérifications : **10 tests de bibliothèque Rust réussis**, **4 tests navigateur assistant/activation réussis**, build Vite réussi, `docker compose config --quiet` et `nginx -t` réussis. Le service `ollama-init` sort avec le code 0 quand le modèle est déjà présent, sans nouveau téléchargement.

Pour adapter le widget au CPU : plafond de réponse générale de 384 tokens (256 pour la traduction des calculs), délai backend de 300 secondes, proxy de 305 secondes et frontend de 310 secondes. Le quota et la limite de génération simultanée sont conservés. Ces délais sont des plafonds et ne déclenchent aucun nouvel envoi automatique.

Le serveur temporaire de test a été arrêté ; les serveurs de l’utilisateur sur 3001/5174 restent ouverts avec leur configuration de démarrage. **Relancer `npm run dev` après Ctrl+C pour activer 14B dans cette instance.** Les images applicatives Docker existantes n’ont pas été reconstruites ; les nouvelles valeurs s’appliquent lors du prochain build/démarrage Compose.
