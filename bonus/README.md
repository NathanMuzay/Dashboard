# Modules additionnels de Lumi

Ce dossier contient les sources des bonus autonomes : habitudes, administration et notifications. Voir [l’inventaire](../BONUS.md).

- `frontend/habits/` : composant React, modèle de dates et historique, styles.
- `backend/habits.rs` : validation serveur du JSON des habitudes.
- `frontend/AdminUsers.jsx` et `backend/admin.rs` : interface et contrôles serveur d’administration.
- `frontend/Notifications.jsx` : notifications locales, limitées à vingt entrées en mémoire.

Les modules utilisent le même build et les mêmes dépendances que le socle. Ne pas lancer un second serveur ici. `npm run test -w frontend`, les tests Cargo et Playwright couvrent leur intégration. `package.json` déclare uniquement le format ES modules des sources JavaScript ; ce n’est pas un workspace à installer séparément.
