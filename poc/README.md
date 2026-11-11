# POC Front / Back / BDD

## Hypothèse et critères d’acceptation

React/Vite, Axum et PostgreSQL permettent de représenter deux widgets d’un même type avec des configurations différentes, de les valider et de les conserver après une lecture API. La météo ne doit pas nécessiter de compte fournisseur. Ce POC utilise le même [jeu de données](dashboard.json) côté frontend et backend.

Le POC est accepté si :

1. Le modèle frontend conserve les villes, tailles et intervalles après import/export et distingue les deux configurations.
2. Le frontend React compile pour le déploiement statique.
3. `/about.json` expose le catalogue, l’IP et le temps Unix sans authentification ; un corps trop volumineux reçoit 413.
4. Un compte vérifié crée un dashboard via Axum ; une nouvelle lecture renvoie les deux configurations stockées dans PostgreSQL.
5. Le serveur refuse un intervalle météo inférieur à 300 secondes.

## Exécution

```bash
npm ci
npm run services
npm run poc
```

Rust/Cargo et Docker Compose sont nécessaires. Par défaut, le runner utilise `postgres://lumi:lumi-local@127.0.0.1:5432/lumi`. Pour une configuration différente, exporter `DATABASE_URL` vers une **base locale de test** dont le rôle peut créer des bases : les tests SQLx créent leurs bases isolées et appliquent les migrations. Ne pas cibler une base de production. Le runner ne démarre pas Docker implicitement et s’arrête au premier échec.

Le test backend crée deux configurations depuis `dashboard.json`, vérifie une nouvelle lecture API puis supprime le dashboard du test. Le parcours navigateur complémentaire est :

```bash
npm run test:e2e -w frontend -- --grep remediation
```

Les prérequis navigateur et la base `lumi_e2e` sont décrits dans le README racine. Les API fournisseur sont simulées dans ces tests navigateur ; les essais affichent notamment 0 °C à Paris, 22 °C à Lyon, puis une panne explicite. Cette simulation vérifie l’interface sans prétendre mesurer la température réelle.

## Portée

Ce POC vérifie la faisabilité de la stack retenue. Il ne compare pas les performances de React/Vue/Angular, Axum/FastAPI/Express ou PostgreSQL/SQLite/MongoDB. Les [comparaisons](../docs/CHOIX_TECHNOLOGIQUES.md) constituent une étude qualitative sur des critères identiques. La météo réelle, les OAuth et les quotas fournisseurs nécessitent une connexion réseau et une recette manuelle distincte.

## Contrôle du proxy Docker

Après démarrage de la stack locale :

```bash
node poc/deployment-smoke.mjs http://127.0.0.1:8080
```

Ce contrôle vérifie le catalogue public, les en-têtes, la CSP météo, le plafond 413 et les limites 429. Il est réservé à localhost, déclenche des rafales de GET et ne crée aucun compte. Ne pas le rejouer immédiatement sans renouvellement des quotas du proxy.
