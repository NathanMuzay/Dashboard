# API des dashboards, services et utilisateurs

Toutes les routes ci-dessous exigent une session Lumi (cookie navigateur ou `Authorization: Bearer <session Lumi>`), sauf `/about.json` et l’initialisation/connexion Google. Les routes figurent aussi dans `/api/docs`.

| Méthode | Route | Usage |
| --- | --- | --- |
| GET | `/api/dashboards` | Dashboards de l’utilisateur connecté |
| POST | `/api/dashboards` | Création avec `{name, widgets}` ; 201 |
| PUT | `/api/dashboards/{id}` | Sauvegarde avec `{name, widgets, revision}` ; 409 si version obsolète ou objet inaccessible |
| DELETE | `/api/dashboards/{id}` | Suppression dans le périmètre utilisateur ; 204 |
| GET | `/api/services` | Identifiants des abonnements du compte |
| PUT / DELETE | `/api/services/{service}` | Activation/désactivation ; 204 |
| GET | `/api/admin/users` | Liste des 500 premiers utilisateurs, admin uniquement |
| PUT | `/api/admin/users/{id}/roles` | `{roles:["perso",...]}` ; admin uniquement, interdiction de modifier ses propres rôles |
| DELETE | `/api/admin/users/{id}/sessions` | Révocation, admin uniquement |
| POST | `/api/auth/google/challenge` | Client ID et nonce à usage unique |
| POST | `/api/auth/google/login` | `{credential: <ID token Google>}` ; session Lumi |
| POST | `/api/auth/google/link` | Association explicite au compte connecté, même adresse requise |

Un dashboard contient au maximum 100 widgets et un compte 20 dashboards. Les paramètres sont limités à une liste autorisée par type, les positions et valeurs numériques sont validées. Aucun jeton fournisseur n’est accepté dans les paramètres. Les changements de rôle suppriment les sessions associées par la contrainte de clé étrangère.

La révision commence à zéro et augmente à chaque sauvegarde. Le client conserve ses modifications lors d’un conflit et propose export ou rechargement ; il ne force pas de remplacement. Les suppressions sont définitives et l’interface les confirme.


## Widget Habitudes

Le type `habits` ajoute un champ `habits` contenant jusqu’à 20 objets `{id, name, days}`. `id` est unique dans le tracker (1–64 caractères ASCII alphanumériques, tiret ou underscore), `name` contient 1–80 caractères, et `days` contient jusqu’à 3 660 dates uniques `YYYY-MM-DD`, entre 2000 et 2099. Les dates impossibles et les propriétés supplémentaires sont refusées. L’historique appartient au dashboard et conserve les mêmes contrôles de propriétaire et de révision ; aucune migration SQL n’est nécessaire pour ce contenu JSONB.

## Activation préalable

Créer/importer un dashboard ou ajouter une instance d’un service non activé renvoie **403**. L’activation passe par `PUT /api/services/{service}`. Changer le type d’une instance vers un autre service exige également son activation. Après désactivation, les instances existantes restent stockées et modifiables, mais l’interface suspend leur contenu fournisseur. Retirer ces instances reste possible. Les opérations sont sérialisées par compte avec une transaction PostgreSQL.
