# Comptes de test — Lumi

Quatre comptes locaux, un par rôle. Ils servent uniquement au développement : les mots de passe ci-dessous sont publics et ne doivent pas être utilisés en production.

| Rôle | Nom | Adresse e-mail | Mot de passe |
| --- | --- | --- | --- |
| Personnel | Camille Martin | `perso@lumi.local` | `Lumi-Perso-2026!` |
| Employé | Alex Moreau | `employe@lumi.local` | `Lumi-Employe-2026!` |
| Entreprise | Louise Bernard | `entreprise@lumi.local` | `Lumi-Entreprise-2026!` |
| Administrateur | Sam Laurent | `admin@lumi.local` | `Lumi-Admin-2026!` |

L'employé et le compte entreprise sont associés à **Atelier Lumi — Démonstration**. Les mots de passe sont stockés sous forme de hashes bcrypt dans PostgreSQL.

## Créer les comptes dans la base locale

Depuis la racine, avec `DATABASE_URL` configurée dans `.env` :

```bash
npm run services
npm run seed:test
npm run dev
```

La commande `seed:test` applique les migrations puis crée les quatre comptes et leurs associations dans une transaction. Elle peut être relancée sans doublon et sans changer les mots de passe. Si une adresse est déjà utilisée par un compte ayant un autre mot de passe ou d'autres rôles, elle s'arrête et annule la transaction pour préserver ce compte. Le chargement de ces données reste une action explicite ; le démarrage normal ne les crée pas.

## Se connecter

Ouvrir http://localhost:5174/, cliquer sur **Se connecter**, puis saisir l'e-mail et le mot de passe. Aucun rôle n'est demandé à la connexion. Ces comptes de démonstration sont prévalidés : aucune confirmation par e-mail n'est nécessaire.

Le serveur détermine le rôle depuis la base. Pour un compte ayant plusieurs rôles, la priorité est : administrateur, entreprise, employé, personnel. Les quatre comptes ci-dessus n'ont chacun qu'un rôle.

Le rôle se choisit uniquement à la création d'un compte public (personnel, employé ou entreprise). L'administrateur est créé par la commande locale, jamais par le formulaire public.

## Vérifier les parcours

- Se connecter avec chaque compte et vérifier le nom et le rôle dans **Mon compte**.
- Pour l'entreprise et l'employé, vérifier le rattachement à Atelier Lumi.
- Modifier une note, recharger la page et vérifier sa conservation sur ce navigateur.
- Ajouter, modifier et supprimer un widget ; utiliser **Annuler** pour restaurer la dernière suppression.
- Se déconnecter et ouvrir un autre compte : les tableaux de bord locaux sont séparés par identifiant utilisateur.

Les comptes, rôles, entreprises et sessions sont persistés dans PostgreSQL. Les tableaux de bord, leur disposition et les notes sont sauvegardés dans PostgreSQL par compte. La météo utilise Open-Meteo avec une ville et un intervalle propres à chaque instance, sans compte fournisseur. Les widgets agenda nécessitent une connexion Google Calendar (voir le guide dans `docs/integrations/google-calendar.md`). Les widgets Spotify nécessitent une connexion à Spotify. Le profil administrateur dispose d’une interface de gestion des comptes, des rôles et de révocation des sessions.
