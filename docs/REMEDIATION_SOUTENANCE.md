# Bilan des corrections après soutenance

État actuel : 11 octobre 2026. Bilan initial établi le 5 octobre. Document de suivi des remarques du jury et des modifications du dépôt. Les changements améliorent les preuves disponibles ; l’attribution des points appartient au jury. Les fonctionnalités déjà présentes sont distinguées des nouveaux travaux.

## Correspondance avec la grille

| Critère et note reçue | Travail effectué ou constat | Preuve / démonstration |
| --- | --- | --- |
| Containerization & deployment — 2/2 | Compose conservé à la racine ; protections Nginx ajoutées | `docker-compose.yml`, `deploy/nginx.conf` ; port 8080 |
| Service coverage — 3/3 | Météo fictive remplacée par Open-Meteo ; fournisseurs privés continuent à exiger une autorisation | `frontend/src/widgets/weather/weatherClient.js` ; deux villes et panne |
| Widget implementation — 3/3 | Treize types disponibles, dont le suivi des habitudes ; météo configurable par ville et intervalle, instances indépendantes | `frontend/tests/weather.test.mjs`, POC partagé |
| Timer mechanism — 2/2 | Timers existants conservés ; météo actualisée de 300 à 3 600 s, 900 s par défaut | `useRefresh`, formulaire et validation Front/Back |
| Repository structure — 1/1 | Front et back restent séparés ; modules bonus autonomes regroupés dans `bonus/` à la racine | `BONUS.md`, `docs/ARCHITECTURE.md` ; Compose reste à la racine |
| UI/UX design — 3/5 | Ajustements mobile, textes et formulaires plus lisibles ; réglages texte agrandi/contraste ; focus visible renforcé | `AccessibilitySettings.jsx`, `styles/accessibility.css`, tests 320/390/768 px |
| About.json — 1/3 | Contrat existant confirmé, service météo identifié, description fictive supprimée, intervalle ajouté | `backend/src/about.rs`, `backend/tests/about.rs`, `GET :8080/about.json` |
| Dashboard management — 6/6 | Sauvegarde, import/export et instances préservés ; deux météos testées en PostgreSQL | `backend/tests/workspace.rs`, `poc/dashboard.json` |
| API Security — 1/2 | Limite JSON 1 Mio ; Nginx limite les API et l’authentification par IP, délais bornés et version masquée | Test 413, configuration Nginx et tests existants d’autorisation |
| User authentication — 3/3 | Connexion et vérification e-mail existantes conservées | Tests Rust auth/e-mail |
| Third-party integration — 3/3 | Intégrations existantes conservées ; nouvelle intégration météo | Guide météo et recette fournisseurs |
| Secrets management — 3/3 | IA locale sans clé API ; météo sans clé ; aucun secret ajouté à l’export | Tests de sessions et `.env.example` |
| Technology choices — 1/6 | Trois alternatives par couche sur cinq critères communs ; POC exécutable | [Comparaison](CHOIX_TECHNOLOGIQUES.md), `npm run poc` |
| Technology documentation — 6/6 | Guides existants actualisés, nouvelles preuves reliées au code | README, architecture, guide météo, ce bilan |
| Choice impact assessment — 2/4 | Stockage réel explicité, menaces et risques résiduels étudiés ; panneau « Vos données » | Sections suivantes, page Mon compte |
| Choice justification — 0/3 | Limites fonctionnelles et opérationnelles justifiées | Section « Limites et justification » |
| Alternative proposal — 0/3 | Alternatives proposées avec déclencheurs et impacts de migration | Comparaison et tableau des limites |

## Modifications fonctionnelles

### Météo

Le widget n’affiche plus de valeur fictive par défaut. Il résout la ville via le géocodage Open-Meteo, puis demande la température actuelle et le code météo aux coordonnées retournées. La localisation sélectionnée, le fuseau, l’horodatage et la source sont visibles. En cas d’homonyme, préciser le pays, par exemple `Paris, France`.

Chaque instance garde son propre chargement et ses réglages. Un changement de ville annule la requête précédente ; une réponse tardive ne remplace pas les nouvelles données. Un délai de 15 secondes termine un appel bloqué. Les erreurs de ville, quota, réseau et données incomplètes sont affichées avec une action pour réessayer. Les anciennes propriétés `temperature`/`condition` des exports restent acceptées pour compatibilité mais ne servent plus à l’affichage.

L’actualisation utilise le timer existant, ne pollue pas un onglet masqué et reprend au focus. L’intervalle est configurable entre 300 et 3 600 secondes, avec défaut 900 secondes. Les validations Front/Back et le catalogue public sont cohérents. La CSP autorise uniquement les deux nouveaux domaines météo nécessaires.

L’API retourne des conditions issues de modèles météo, pas une mesure de station garantie. L’intégration suit la [documentation officielle Open-Meteo](https://open-meteo.com/en/docs) et son [géocodage](https://open-meteo.com/en/docs/geocoding-api).

### Mobile et accessibilité

Le bouton **Accessibilité** est disponible sur l’accueil et dans l’espace connecté. Une fenêtre propose le texte agrandi et le contraste renforcé, conservés localement. Le texte agrandi utilise une colonne pour éviter de compresser le contenu. Les boutons ont un état accessible ; les cases portent leurs libellés et le dialogue natif conserve le focus puis le rend à son déclencheur.

Les adaptations mobile passent après les styles compacts : titres pouvant revenir à la ligne, cartes sans hauteur fixe, commandes pouvant se répartir sur plusieurs lignes, formulaires à 16 px et fenêtre défilable. Les informations météo restent dans la carte. Le contour de focus utilise une couleur plus visible.

Les fonctions préexistantes restent utiles : lien d’évitement, commandes Monter/Descendre au clavier, libellés des boutons et prise en compte du mouvement réduit. Ce travail constitue une amélioration vérifiée sur les parcours ciblés, pas une certification WCAG ni un audit complet avec lecteurs d’écran.

### Sécurité serveur

Axum limite les corps JSON à 1 Mio au lieu du plafond implicite de 2 Mio. Le test envoie un corps dépassant cette taille à l’inscription et vérifie 413 avant accès PostgreSQL.

Nginx limite les API à 10 requêtes/seconde/IP avec rafale de 30, et `/api/auth/` à 10 requêtes/minute/IP avec rafale de 10. Les rejets retournent 429. Les corps sont limités à 1 Mio, le délai de lecture du corps à 15 secondes, la connexion proxy à 5 secondes et la lecture proxy à 60 secondes. La version Nginx n’est plus publiée. Les en-têtes de sécurité ne sont plus émis en double par le proxy et l’API. Ces mécanismes complètent les limites existantes par adresse e-mail et par compte pour l’assistant IA. Paramètres fondés sur le [module officiel Nginx](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html).

Les limites par IP s’appliquent au chemin Docker/Nginx. En développement, l’accès direct Rust reste lié à 127.0.0.1. Une exposition publique du port backend contournerait les limites Nginx ; le backend n’est donc pas publié par Compose. Un NAT partagé peut produire des 429 légitimes : ajuster après observation, sans retirer la limite d’authentification.

## Données, conservation et impact

« Aucun cookie » ne signifie pas « aucune donnée conservée ». Lumi stocke déjà les comptes, configurations, notes et abonnements dans PostgreSQL. Le panneau **Mon compte → Vos données** explique ce comportement.

| Données | Emplacement et durée actuelle | Impact et maîtrise |
| --- | --- | --- |
| Compte, adresse, nom, rôles, associations d’entreprise | PostgreSQL ; jusqu’à suppression administrative | Identité personnelle ; autorisation serveur, requêtes paramétrées, aucune conservation automatique bornée actuellement |
| Mot de passe | Hachage bcrypt en PostgreSQL | Ne pas exposer la base ; coût du hachage n’empêche pas un mot de passe faible |
| Session Lumi | Cookie HttpOnly, SameSite=Lax, Path=/api, Secure en HTTPS ; hachage en base ; validité fixe de 7 jours | Fermeture du navigateur ou redémarrage serveur ne déconnecte pas ; expiration, suppression des cookies ou révocation déconnectent ; XSS reste un risque |
| Dashboards, notes, habitudes, configuration | PostgreSQL, volume Docker ; jusqu’à suppression du dashboard/compte | Persistance entre appareils ; export et suppression d’un dashboard disponibles ; sauvegarde externe à prévoir |
| Jetons Google/Spotify/GitHub | Mémoire navigateur ; matériel PKCE temporaire en `sessionStorage` | Rechargement/déconnexion nécessitent une reconnexion ; la révocation fournisseur est distincte |
| Thème et confort de lecture | `localStorage`, jusqu’à effacement navigateur | Préférences locales ; ne contiennent pas de jeton fournisseur |
| Conversation IA | Saisie/réponse en mémoire ; prompt transmis lors de l’envoi | Aucun historique Lumi en base ; inférence sur Ollama local, sans appel OpenAI ; journaux et accès à la machine restent à encadrer |
| Météo | Ville/intervalle en base ; réponse en mémoire | Open-Meteo reçoit ville, coordonnées et IP du navigateur ; pas de géolocalisation automatique |
| Journaux HTTP | JSON sur stdout ; rétention dépend de l’exploitation Docker | Pas de corps ni de jeton dans le logger applicatif ; Nginx a ses propres journaux d’accès à encadrer |
| Liens e-mail et nonce OIDC | Hachages en base avec expiration ; consommation à usage unique | Expiration empêche l’utilisation ; nettoyage physique et sauvegardes à gérer séparément |

**Décision** : conserver le stockage serveur des dashboards est nécessaire à la restauration après connexion. Limiter les jetons fournisseurs à la mémoire réduit leur persistance, au prix d’une reconnexion. Le cookie HttpOnly fournit désormais une reconnexion automatique jusqu’à expiration, avec une protection des mutations par en-tête client et contrôle de provenance. Le marqueur sessionStorage ne permet pas de s’authentifier. La suppression du compte, la politique de sauvegarde et la rétention globale doivent être définies par l’exploitant avant un usage public. Elles ne sont pas déclarées implémentées.

## Analyse des menaces

Périmètre : navigateur, Nginx, API, PostgreSQL, SMTP, fournisseurs OAuth/IA/météo, Docker, dépendances et exploitation. Les actifs sont les comptes, notes, jetons, disponibilité et budget des appels IA. Cette analyse couvre les principales familles de menaces ; elle ne garantit pas l’absence de vulnérabilités.

| Menace / scénario | Protection présente ou ajoutée | Risque résiduel / action proposée |
| --- | --- | --- |
| Usurpation et brute force | Vérification e-mail, bcrypt, sessions expirantes ; limites e-mail existantes, limite IP Nginx ajoutée | Identifiants volés ; proposer MFA et alertes ; ne pas exposer le compte de démonstration en public |
| Accès au dashboard d’un autre utilisateur / escalade de rôle | Propriétaire extrait de la session ; contrôle admin ; inscription admin interdite ; tests d’isolation | Revoir chaque nouvelle route ; comptes administrateurs protégés séparément |
| Injection SQL / paramètres malveillants | Requêtes paramétrées, validation des widgets et types, champs inconnus refusés | Une future requête SQL construite par interpolation pourrait rouvrir le risque |
| XSS et abus de session | Échappement React, CSP, jetons externes en mémoire, absence de scripts arbitraires | Le cookie Lumi est HttpOnly ; un XSS peut encore agir au nom du compte et lire les données affichées ; auditer les dépendances |
| CSRF / OAuth détourné / rejeu | Cookie + X-Lumi-Client et contrôle Fetch Metadata ; Bearer pour clients API ; PKCE Spotify ; nonce OIDC à usage unique, signature/audience/issuer | Tests CSRF présents ; tester aussi le vrai consentement fournisseur |
| Corps énormes / saturation / coût IA | Nouveau plafond 1 Mio et quotas Nginx ; limites par utilisateur pour l’IA ; pool SQL borné ; timers | DDoS distribué, réponse fournisseur lente ; proxy public/WAF, budgets et supervision nécessaires |
| SSRF / fuite vers une URL arbitraire | Hôtes fixes météo/IA et clients fournisseurs restreints ; jetons exclus des exports | Revoir toute future URL configurable ; filtrer les sorties réseau en production |
| Perte ou écrasement de données | Volume PostgreSQL, migrations, contrôle de révision, export ; tests de conflit | Volume détruit ou serveur perdu ; sauvegarde chiffrée et restauration testée restent à organiser |
| Divulgation de secrets / logs | `.env` exclu, IA locale sans clé, mots de passe/tokens hachés, logger sans corps | Fichier .env, accès Docker et logs proxy sensibles ; permissions, rotation et rétention à définir |
| Altération réseau / interception | Appels fournisseurs HTTPS ; services locaux liés à loopback | Entrée Lumi en HTTP local ; terminaison TLS nécessaire pour déploiement public |
| Panne fournisseur / révocation / quota | États d’erreur, réessai, polling borné ; aucune météo fictive en secours | Dépendance externe ; prévoir cache identifié comme ancien, suivi des quotas et mode dégradé |
| Supply chain et images compromises | Lockfiles, séparation des couches, tests reproductibles | Pas d’audit exhaustif ici ; proposer scan de dépendances/images et mises à jour contrôlées |
| Mauvaise configuration / accès à la base ou au SMTP | Backend non publié ; PostgreSQL et Mailpit liés à localhost | Stack locale, SMTP de test et secret PostgreSQL par défaut inadaptés au public ; profil production dédié |
| Répudiation / impossibilité de diagnostiquer | Identifiant requête, route, statut et durée | Pas de journal d’audit des changements admin ; proposer audit minimal avec rétention bornée |

## Limites et justification des choix

| Limite assumée | Justification et impact | Alternative et déclencheur |
| --- | --- | --- |
| Google/Spotify exigent une connexion fournisseur | Les données privées demandent un consentement ; aucun faux contenu ne peut remplacer une boîte mail réelle | Fournir un mode démonstration clairement identifié pour une soutenance hors ligne |
| Reconnexion fournisseur après rechargement | Limite la persistance des jetons ; moins pratique mais réduit leur exposition durable | BFF et refresh tokens chiffrés côté serveur si la continuité devient prioritaire ; nécessite rotation/révocation |
| Session Lumi fixe de sept jours | Cookie HttpOnly et session révocable en PostgreSQL ; pas de prolongation indéfinie | Réauthentification des actions sensibles et MFA si le périmètre public l’exige |
| Météo par recherche de ville, premier résultat | Intégration légère sans clé ; affichage de la localisation et pays pour vérifier le choix | Sélecteur de résultats/coordonnées si les homonymes deviennent fréquents ; cache serveur pour mutualiser les appels |
| Gratuité et disponibilité météo dépendantes du fournisseur | Convient à une démonstration étudiante non commerciale ; pas de SLA promis | Offre commerciale ou autre fournisseur si exploitation payante/quotas élevés ; vérifier les conditions avant publication |
| Pas de collaboration instantanée | Révisions et rechargement limitent la complexité et protègent des écrasements | WebSocket/SSE et stratégie de fusion si édition simultanée nécessaire |
| Mobile en une colonne | Favorise la lisibilité et le toucher ; positions de grille conservées pour desktop | Layout mobile indépendant si l’utilisateur exige une composition mobile dédiée |
| Accessibilité ciblée | Contraste, lecture, clavier et responsive améliorés ; couverture partielle | Audit complet lecteur d’écran, zoom 200/400 %, contraste et formulaires avant engagement de conformité |
| Graphe GitHub et notifications bornés | Limite les appels et la quantité stockée ; ce n’est pas un historique exhaustif | Historique serveur avec rétention et pagination si analyse longue nécessaire |
| Déploiement de démonstration local | Mailpit simplifie la recette e-mail et Compose reste reproductible | TLS, SMTP réel, secrets dédiés, sauvegardes, supervision et tests de charge pour production |
| Suppression de compte non disponible dans l’UI | Périmètre actuel centré sur les dashboards ; demande administrative nécessaire | Endpoint de suppression avec confirmation/réauthentification et stratégie pour les sauvegardes |

Les alternatives de technologies et leurs impacts sont détaillés dans [CHOIX_TECHNOLOGIQUES.md](CHOIX_TECHNOLOGIQUES.md). Elles sont proposées sans prétendre avoir été implémentées.

## Abonnements et compatibilité

Le dashboard initial ne contient plus de Calendar sans activation. Les créations, imports et ajouts par API vérifient les abonnements. Après désactivation, les instances existantes sont conservées, éditables et supprimables mais leur contenu fournisseur est démonté dans l’interface. Les sauvegardes et les changements d’abonnement sont sérialisés par compte. L’activation Lumi ne remplace jamais le consentement OAuth du fournisseur. Les anciens widgets non activés du stockage local restent récupérables dans ce stockage mais ne sont pas automatiquement importés.

## Vérifications et soutenance

Les résultats actuels sont consignés dans [VERIFICATION_2026-10-11.md](VERIFICATION_2026-10-11.md) ; [VALIDATION_REMEDIATION.md](VALIDATION_REMEDIATION.md) conserve les essais historiques. Pour rejouer les preuves :

```bash
npm run services
npm run test -w frontend
DATABASE_URL=postgres://lumi:lumi-local@127.0.0.1:5432/lumi cargo test --manifest-path backend/Cargo.toml
npm run poc
npm run test:e2e -w frontend -- --grep remediation
docker compose up -d --build
curl http://127.0.0.1:8080/about.json
```

Préparer la base navigateur et Chromium selon le README. Pour la démonstration : afficher `about.json` sans connexion, montrer deux météos avec villes distinctes, modifier un intervalle, recharger la sauvegarde, passer à 320/390 px, activer les deux réglages de lecture puis parcourir au clavier. Expliquer ensuite la conservation PostgreSQL, les limites assumées et une alternative par couche.

Les essais OAuth avec des comptes réels, la qualité des réponses du modèle local et l’audit complet de sécurité/accessibilité restent des validations séparées. Aucun point supplémentaire n’est garanti par ce document.

## Historique des travaux antérieurs

Les compléments suivants retracent les changements successifs ; les tableaux ci-dessus décrivent l’état actuel. Les essais SMTP via Mailpit concernent la recette, pas le SMTP Gmail du développement courant.

### Doublons et majuscules/minuscules

La création et la modification comparent désormais les textes sans tenir compte de la casse ni des espaces au début/à la fin : titre, contenu des notes, ville, dépôt GitHub et adresse Gmail. La casse saisie reste conservée pour l’affichage. Les identifiants clients OAuth restent sensibles à la casse. La vérification exclut le widget en cours de modification et distingue toujours les configurations réellement différentes (par exemple deux villes). Les intervalles sans effet sur les widgets locaux ne créent plus une différence artificielle ; les valeurs de rafraîchissement implicites sont comparées à leur défaut effectif.

Preuves : `frontend/tests/layout.test.mjs` et `frontend/e2e/widget-duplicates.spec.js` vérifient le refus d’un doublon à la création et à la modification, ainsi que l’édition valide du widget lui-même.


## Complément : diagnostic OpenAI et configuration

Une valeur `MAIL_FROM` non entourée de guillemets interrompait la lecture du `.env` avant la clé OpenAI. Le fichier local a été corrigé, le doublon supprimé et les identifiants SMTP réels conservés commentés pour le mode Mailpit. Le modèle `.env.example` a également été corrigé. Le démarrage échoue désormais explicitement sur une syntaxe invalide, sans afficher les valeurs du fichier.

Un appel de diagnostic réel a atteint OpenAI mais a reçu HTTP 429 avec `credit_balance_exhausted`. La configuration est lisible ; les réponses restent bloquées par le crédit du compte API. Le serveur distingue maintenant le crédit épuisé, les limites de dépenses et les limites temporaires de requêtes avec des messages sûrs. Aucun réapprovisionnement du compte n’a été effectué.

## Complément : remplacement d’OpenAI par un modèle local

À la demande de l’utilisateur, l’intégration OpenAI décrite dans le diagnostic précédent a été remplacée par **Ollama + Qwen2.5 3B**. Le crédit API épuisé ne bloque plus le widget : aucun appel OpenAI et aucune clé API ne sont utilisés. Le premier lancement télécharge le modèle, puis les questions sont traitées sur le serveur Lumi.

Modifications : services Docker Ollama/initialisation et volume persistant, configuration `.env.example`, client Rust local avec contrôle de disponibilité et quota, textes et état du widget, activation du service, migration des seuls anciens titres par défaut, délai proxy dédié, information sur les données et tests. Les identifiants techniques historiques restent compatibles. Le [bilan détaillé](ASSISTANT_LOCAL.md) donne le choix du modèle, les commandes, les limites et les vérifications.

## Complément : réponse arithmétique erronée

Le cas utilisateur `12 × 3,1 × 2 − 31,4` retournait 91,7 au lieu de 43. Le serveur dispose maintenant d’un calculateur décimal qui exécute les quatre opérations de base et affiche l’expression interprétée. Une phrase est traduite par le modèle en JSON contraint, puis les nombres et l’expression sont validés avant calcul ; aucun résultat numérique final n’est rédigé par le modèle pour ce parcours. Le modèle 3B est conservé avec consignes renforcées et température de 0,1 ; la fiabilité des opérations prises en charge repose sur le calculateur. Les limites de traduction et de couverture sont détaillées dans [ASSISTANT_LOCAL.md](ASSISTANT_LOCAL.md).

## Complément : passage au modèle 14B après nettoyage

À la demande de l’utilisateur, le modèle par défaut passe à **Qwen2.5 14B**, en local sans clé API. Le nettoyage du répertoire personnel a libéré l’espace nécessaire au téléchargement d’environ 9 Go. La configuration locale `.env`, le modèle `.env.example`, les valeurs par défaut Rust/Docker et la documentation sont alignés. Le calculateur décimal, les quotas, l’authentification et les contrôles sur les demandes restent actifs. Le guide [ASSISTANT_LOCAL.md](ASSISTANT_LOCAL.md) présente le choix et les limites ; les essais effectifs sont ajoutés au journal de validation.
