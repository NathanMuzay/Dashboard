# Comptes et authentification

Le périmètre actuel est limité aux utilisateurs, à leurs rôles et aux sessions. Axum expose les routes REST ; SQLx effectue directement les requêtes, le mapping `FromRow` et les migrations PostgreSQL. Aucun Prisma, repository ou service supplémentaire.

## Modèle

- `users` : UUID, e-mail unique sans distinction de casse, nom, hash bcrypt, date de création.
- `roles` et `user_roles` : rôles cumulables `perso`, `employe`, `entreprise`, `admin`.
- `companies` et `company_memberships` : entreprises et relations avec les comptes. Une inscription entreprise crée l'entreprise et son premier membre dans la même transaction.
- `sessions` : hash SHA-256 du jeton, utilisateur, rôle actif et expiration après sept jours.

Une inscription employé déclare un profil ; elle ne donne pas automatiquement accès à une entreprise existante. L'association à une entreprise sera gérée ultérieurement. Les rôles supplémentaires sont attribués en base par une personne autorisée. Le rôle admin ne peut pas être choisi à l'inscription publique.

Chaque session référence une association `user_roles` par clé étrangère. Retirer cette association révoque automatiquement les sessions correspondantes. Le rôle est vérifié côté serveur, pas déduit de l'interface. `AuthUser::require_admin()` permet de protéger les futures opérations administrateur ; l’interface d’administration permet de gérer les rôles et de révoquer les sessions.

## Routes

| Méthode | Route | Fonction |
| --- | --- | --- |
| POST | `/api/auth/register` | Créer un compte (`201`), confirmer l’adresse e-mail, puis se connecter |
| POST | `/api/auth/login` | Vérifier les identifiants, déterminer le rôle et créer une session |
| GET | `/api/auth/me` | Lire le compte et le rôle actif de la session |
| POST | `/api/auth/logout` | Révoquer la session |

Les routes privées acceptent `Authorization: Bearer <token>` pour les clients API, ou le cookie navigateur `lumi_session`. Les mutations utilisant le cookie nécessitent `X-Lumi-Client: web` ; les requêtes intersites sont refusées. Le frontend envoie aussi `X-Lumi-Account` pour empêcher une opération sur le compte d’un autre onglet après changement de session.

Inscription :

```json
{
  "email": "alice@example.com",
  "name": "Alice",
  "password": "mot-de-passe-exemple",
  "role": "perso"
}
```

Rôles publics : `perso`, `employe`, `entreprise`. Pour `entreprise`, ajouter `"company_name": "Mon entreprise"`. Le nom est obligatoire (100 caractères maximum), le mot de passe doit contenir au moins 8 caractères et au plus 72 octets (limite bcrypt). L'adresse est normalisée et vérifiée sommairement ; la confirmation par e-mail est obligatoire avant connexion.

Connexion :

```json
{
  "email": "alice@example.com",
  "password": "mot-de-passe-exemple"
}
```

Le serveur choisit automatiquement un rôle attribué au compte, dans l’ordre `admin`, `entreprise`, `employe`, `perso`. Le corps de connexion contient uniquement `email` et `password` ; un champ `role` est rejeté (`422`). Le rôle reste requis lors de l’inscription.

La réponse contient `token` et `user` : `id`, `email`, `name`, `role` actif, `roles` attribués et `companies` (`id`, `name`), ainsi que `email_verified` et `session_tag` (empreinte non secrète, inutilisable pour s’authentifier). Aucun hash de mot de passe n'est exposé. Le frontend affiche l'espace correspondant au rôle validé par le serveur.

Erreurs : `400` données invalides, `401` identifiants/session invalides ou expirés, `403` rôle non attribué ou inscription admin interdite, `409` e-mail déjà utilisé, `422` JSON incompatible. Les erreurs métier utilisent `{ "message": "…" }`.

Attribution admin par un opérateur autorisé (remplacer l'adresse) :

```sql
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin' FROM users WHERE lower(email) = lower('alice@example.com')
ON CONFLICT DO NOTHING;
```

L’utilisateur doit ensuite se reconnecter ; le serveur choisit automatiquement `admin`. L'inscription ne permet jamais d'envoyer une liste de rôles ou de permissions arbitraires.

## Démarrage et migrations

Depuis la racine :

```bash
cp .env.example .env
docker compose up -d --wait postgres
npm run dev
```

`DATABASE_URL` est obligatoire. `.env` est chargé au démarrage ; SQLx applique les migrations avant d'ouvrir le port HTTP. `LUMI_SEED_DEMO=true` crée une fois le compte personnel `demo@lumi.local` / `lumi-demo`, sans modifier un compte existant. Désactiver cette option hors développement.

La première migration est conservée pour ne pas invalider les bases où elle a déjà été appliquée. La seconde supprime les tables widgets/dashboard, convertit les anciens profils `personal`/`client` en `perso`, les permissions `administrator` en `admin`, et attribue `employe` aux membres d'entreprises existantes. Les anciennes sessions sont supprimées afin d'imposer une connexion avec rôle. Les comptes et les entreprises sont conservés.

Swagger est disponible sur `/api/docs`. Le profil est choisi uniquement à l’inscription. Les widgets sont sauvegardés par compte via les API de tableaux de bord ; voir [le contrat workspace](workspace.md). Les quatre comptes de test sont décrits dans [Comptes de test](../COMPTES.md) et créés explicitement via `npm run seed:test`.

## Vérifications

```bash
npm test
cargo clippy --manifest-path backend/Cargo.toml --all-targets -- -D warnings
npm run build -w frontend
```

Les tests SQLx utilisent `DATABASE_URL` (environnement ou `.env`) et créent des bases isolées : le compte PostgreSQL de test doit disposer du droit de créer des bases. Ils vérifient les inscriptions, les rôles, la persistance et la révocation des sessions, les validations et les inscriptions concurrentes avec le même e-mail.


## Persistance navigateur

Les connexions par mot de passe, lien magique et Google définissent un cookie `lumi_session`, `Path=/api`, `HttpOnly`, `SameSite=Lax`, `Max-Age=604800`. `Secure` est ajouté lorsque `APP_URL` commence par `https://`. En production, cette URL doit donc utiliser HTTPS.

`GET /api/auth/me` restaure le cookie pour la durée restante de la session en base, sans prolongation automatique. Cela migre aussi un ancien jeton Bearer stocké dans l’onglet. Le frontend conserve uniquement un marqueur non secret pour isoler les connexions fournisseurs entre sessions ; le jeton d’authentification n’est plus écrit dans le stockage web. `POST /api/auth/logout` révoque la session et supprime le cookie.

Les protections suivent les principes [OWASP de gestion des sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) et [d’en-tête personnalisé contre les requêtes intersites](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). Ne pas ajouter une politique CORS autorisant arbitrairement des origines avec credentials.
