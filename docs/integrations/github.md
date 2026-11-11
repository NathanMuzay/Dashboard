# Widgets GitHub

Ajouter « GitHub · Push » ou « GitHub · Graphe » depuis le dashboard. Indiquer `propriétaire/dépôt` ou l'URL HTTPS GitHub. Le widget Push accepte de 1 à 20 événements.

Les dépôts publics sont consultés directement via l'API REST GitHub, sans configuration serveur. Pour les dépôts privés, ouvrir « Dépôt privé / connexion GitHub » dans chaque widget et saisir un personal access token autorisé pour le dépôt (fine-grained : Contents et Metadata en lecture ; les organisations peuvent exiger une approbation). Le jeton est conservé uniquement en mémoire, lié à la session Lumi, et partagé entre ses widgets GitHub dans cet onglet. Il est perdu au rechargement et supprimé à la déconnexion de Lumi. Il n'est jamais inscrit dans les paramètres des widgets, le localStorage ou une variable VITE. Déconnecter GitHub déconnecte tous les widgets de cet utilisateur dans l'onglet. Déconnecter le widget n'invalide pas le jeton sur GitHub.

## Push

Lecture de trois pages maximum de 100 événements du dépôt, filtrées sur `PushEvent`. La liste peut donc contenir moins de push que demandé. GitHub ne fournit pas un historique exhaustif ni instantané dans son API Events. Chaque ligne indique la personne ayant poussé, la branche et la date de l'événement. Le « nom » est le sujet du commit en tête après le push ; un push peut contenir plusieurs commits. Si ce commit a disparu après réécriture de l'historique, le SHA sert de titre.

## Graphe

Chargement des 8 premières branches renvoyées par GitHub et de 40 commits par branche. Les commits sont dédupliqués par SHA et ordonnés topologiquement (enfants avant parents). Les liens suivent les parents réels, y compris les fusions. Les étiquettes identifient les têtes des branches chargées. Les ancêtres hors de l'aperçu sont représentés par un trait pointillé. L'aperçu n'inclut pas les tags ni les branches supprimées non accessibles depuis les branches chargées.

Actualisation manuelle et périodique configurable de 300 à 3600 secondes, lorsque la page est visible. Un cache mémoire de 30 secondes, isolé par jeton, réduit les appels répétés ; il est vidé lors des changements de connexion. Une erreur de quota suspend les appels jusqu’au délai annoncé (entre une minute et une heure). Les changements de dépôt annulent les requêtes précédentes. Les erreurs d'accès et de quota sont affichées dans le widget.

Documentation :
- https://docs.github.com/en/rest/activity/events
- https://docs.github.com/en/rest/using-the-rest-api/github-event-types
- https://docs.github.com/en/rest/commits/commits
