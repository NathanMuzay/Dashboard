# Organisation du dépôt

La racine contient les commandes du workspace, la configuration Docker et le guide de démarrage. Les guides fonctionnels, contrats API et supports du projet sont regroupés dans `docs/`.

## Frontend

- `src/App.jsx` : restauration de session, connexion, déconnexion et choix de la page.
- `src/pages/` : accueil, tableau de bord et compte utilisateur.
- `src/components/` : composants partagés et interfaces de gestion des comptes/services. `DashboardWorkspace` gère la synchronisation des dashboards avec le serveur.
- `src/dashboard/` : composition du dashboard, cartes, formulaire de configuration, placement et widgets initiaux. `layout.js` calcule le placement sans dépendre de React.
- `src/widgets/catalog.js` : métadonnées et clés de configuration des widgets.
- `src/widgets/WidgetContent.jsx` : sélection du composant selon le type de widget.
- `src/widgets/WidgetEditorFields.jsx` : champs de configuration propres à chaque type.
- `src/components/AccessibilitySettings.jsx` : préférences locales de texte agrandi et de contraste renforcé.
- `src/widgets/weather/weatherClient.js` : géocodage et conditions actuelles Open-Meteo, sans clé fournisseur.
- `src/widgets/<service>/` : affichage, clients et sessions propres à chaque intégration.
- `src/hooks/` : comportements React réutilisables.
- `src/dashboardModel.js` : validation et import/export des dashboards.
- `src/styles/` : styles par domaine, importés depuis `src/style.css`.
- `tests/` : tests unitaires ; `e2e/` : parcours navigateur Playwright.

## Backend

- `src/main.rs` : démarrage du serveur et initialisation.
- `src/lib.rs` : état partagé, assemblage des routes et documentation OpenAPI.
- `src/middleware.rs` : journalisation HTTP et en-têtes de réponse.
- Les modules `auth`, `email_auth`, `google_auth`, `admin`, `workspace`, `openai` et `about` portent leurs API respectives ; `mail` et `error` fournissent les services communs.
- `migrations/` conserve l’historique SQL nécessaire aux bases existantes et aux nouvelles installations.
- `tests/fixtures/` contient les clés de test OIDC ; elles sont nécessaires aux tests de signature.

## Vérification

```bash
npm run services
npm test
npm run build -w frontend
npm run test:e2e -w frontend
```

Les prérequis des tests navigateur sont dans le [README](../README.md#tests-navigateur-reproductibles). `npm run check:clean` effectue une installation et un démarrage Docker dans un répertoire temporaire, nettoyé automatiquement après exécution.

## Livraison et preuves de soutenance

- `docker-compose.yml` reste à la racine ; `deploy/nginx.conf` porte la CSP, les limites par IP, le plafond des corps et les délais proxy.
- `bonus/` contient les modules additionnels autonomes ; `BONUS.md` identifie leurs raccordements ; `docs/BONUS.md` conserve un lien de compatibilité.
- `poc/` contient une configuration partagée entre Front et Back, son test frontend et le protocole ; `scripts/poc.mjs` exécute `npm run poc`.
- [CHOIX_TECHNOLOGIQUES.md](CHOIX_TECHNOLOGIQUES.md) compare trois solutions par couche ; [REMEDIATION_SOUTENANCE.md](REMEDIATION_SOUTENANCE.md) explique les modifications, leur impact, les menaces, les limites et les alternatives.
- `frontend/src/styles/accessibility.css` est chargé en dernier pour préserver la lisibilité mobile et les préférences de lecture.

## Assistant IA Mistral

Le module historique `backend/src/openai.rs` appelle l’API Mistral (`/v1/models` et `/v1/chat/completions`) avec une clé privée côté serveur. Les routes `/api/ai/status` et `/api/ai/ask`, le type `openai_chat` et l’abonnement `openai` restent compatibles. Le catalogue annonce `mistral`.

Le modèle par défaut est `ministral-3b-2512`, configurable par `MISTRAL_MODEL`. `MISTRAL_API_KEY` est transmis au backend par Docker ou `.env`. Le backend valide la session, l’abonnement, la longueur et le quota (cinq demandes/minute), puis autorise une génération à la fois. L’interface demande un envoi explicite et indique le transfert des questions à Mistral. Voir [le guide Mistral](ASSISTANT_MISTRAL.md).

Les expressions arithmétiques sont évaluées par `backend/src/calculator.rs`. Une phrase est traduite en JSON par Mistral, vérifiée pour conserver les nombres puis calculée localement. Les autres réponses sont bornées à 384 tokens avec une température de 0,1 et des consignes sur les informations non vérifiables en direct.
