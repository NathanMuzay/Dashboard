# Météo Open-Meteo

Ajouter un widget **Météo** et saisir une ville, éventuellement suivie du pays (`Paris, France`). Chaque widget peut utiliser une ville et un intervalle différents. Aucun compte fournisseur ni clé API n’est requis pour la démonstration non commerciale. L’accès au dashboard lui-même utilise toujours un compte Lumi.

Le client appelle le [géocodage](https://open-meteo.com/en/docs/geocoding-api) puis les [conditions actuelles](https://open-meteo.com/en/docs). Le premier résultat est utilisé ; le nom, la région et le pays sont affichés pour permettre de vérifier le choix. La température est en degrés Celsius et la description est calculée à partir du code WMO fourni. L’horodatage utilise l’heure locale et le fuseau de la réponse. Ce sont des données de modèle météo.

Actualisation : 900 secondes par défaut, minimum 300, maximum 3 600. Le timer n’actualise pas un onglet masqué et déclenche une mise à jour au retour du focus. Le changement de ville annule l’appel précédent ; les requêtes sont abandonnées après 15 secondes. Une erreur ne remplace pas une réponse par des données fictives. **Réessayer la météo** déclenche une nouvelle demande.

La source est créditée dans le widget. L’API reçoit l’adresse IP du navigateur, la recherche de ville puis ses coordonnées. Aucune géolocalisation de l’appareil n’est demandée. La ville et l’intervalle sont conservés avec le dashboard ; la réponse météo reste en mémoire. Les propriétés historiques `temperature` et `condition` peuvent rester dans d’anciens exports mais ne sont plus lues pour l’affichage.

La [CSP de Nginx](../../deploy/nginx.conf) autorise les deux domaines météo. Ne pas élargir `connect-src` à tous les domaines pour résoudre une erreur de connexion. Les appels utilisent HTTPS, sans cookies ni envoi de jeton Lumi. Pour une exploitation commerciale ou un volume important, vérifier l’[offre et les conditions du fournisseur](https://open-meteo.com/en/pricing).

## Recette manuelle

1. Ajouter `Paris, France` et `Lyon, France`, avec titres et intervalles différents.
2. Vérifier les localisations et l’horodatage ; une température identique est possible et ne prouve pas une erreur.
3. Modifier uniquement Lyon et vérifier que Paris reste configuré sur Paris.
4. Attendre la sauvegarde puis recharger et retrouver les deux villes.
5. Passer le navigateur hors ligne et déclencher une nouvelle demande ; vérifier un message explicite. Revenir en ligne puis réessayer.
6. Réduire à 320/390 px et activer le texte agrandi ; lire la localisation et accéder aux commandes.

Tests : `frontend/tests/weather.test.mjs`, `frontend/e2e/remediation.spec.js`, POC de persistance dans `backend/tests/workspace.rs`. Les réponses fournisseur y sont simulées, contrairement à la sauvegarde PostgreSQL du POC.
