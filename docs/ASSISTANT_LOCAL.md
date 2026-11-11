> Document historique : Ollama a été remplacé par Mistral. Consulter [le guide actuel](ASSISTANT_MISTRAL.md).

# Assistant IA local — bilan des modifications

Le widget fonctionne avec **Ollama et Qwen2.5 14B**, sans clé API et sans crédit OpenAI. Le modèle répond aux questions courantes, aux demandes de rédaction et aux explications générales en français. Il s’exécute sur le serveur de l’instance Lumi, qui peut être cette machine ou un serveur de déploiement.

## Choix du modèle

[Qwen2.5 14B](https://ollama.com/library/qwen2.5:14b) est un modèle multilingue de 14,8 milliards de paramètres, distribué en quantification Q4_K_M d’environ **9 Go**. Il prend en charge le français et les sorties structurées utilisées pour traduire les calculs. Le nettoyage préalable du disque permet désormais son installation. La machine dispose de 30 Gio de RAM, dont environ 13 disponibles au diagnostic ; cette configuration utilise le CPU, sans GPU dédié.

| Alternative | Compromis |
|---|---|
| Qwen2.5 3B, ancien modèle | Plus léger et plus rapide, environ 1,9 Go ; réponses jugées insuffisantes par l’utilisateur |
| Qwen2.5 7B | Taille intermédiaire, environ 4,7 Go ; moins de ressources que 14B |
| Qwen2.5 14B, retenu | Davantage de capacité, environ 9 Go ; consommation mémoire et temps CPU plus élevés |

Le choix privilégie la capacité du modèle pour les explications, la rédaction et la compréhension des demandes. Ce tableau n’est pas un benchmark de précision. La famille Qwen2.5 conserve le format de chat déjà validé ; le modèle 14B est sous licence Apache 2.0 selon sa fiche officielle. Le calculateur reste responsable des opérations numériques prises en charge. Un modèle plus grand peut encore produire des erreurs et n’accède pas aux informations en direct.


## Ce qui a changé

- **Docker** : Ollama 0.35.1, cloud désactivé, volume `ollama_data`, contrôle de santé et téléchargement automatique par `ollama-init`. Le backend attend la fin de l’installation. Si le modèle est déjà présent, l’initialisation n’effectue pas de nouveau téléchargement.
- **Développement** : `npm run services` démarre Ollama et télécharge le modèle ; cette commande précède automatiquement `npm run dev`.
- **Calculs** : opérations arithmétiques exécutées par un calculateur décimal Rust. Les phrases sont traduites en expression structurée par le modèle, puis validées ; les expressions explicites sont évaluées directement.
- **Backend** : appels `/api/tags` et `/api/chat` locaux sans authentification fournisseur ; validation de session, abonnement, maximum 8 000 caractères, cinq demandes/minute et une génération simultanée. Les erreurs fournisseur brutes ne sont pas exposées.
- **Widget** : nouveaux libellés, nom du modèle, vérification de disponibilité, bouton pour revérifier après installation et conservation de la question en cas d’erreur. Aucun envoi automatique ni rendu HTML des réponses.
- **Compatibilité** : conservation du type `openai_chat`, de l’abonnement `openai` et des routes `/api/ai/*`. Le fichier Rust et le chemin React historiques restent inchangés ; ils utilisent Ollama. Seuls les anciens titres par défaut sont migrés, sans changer les titres personnalisés ni l’ordre des widgets. Le catalogue `/about.json` annonce `ollama`.
- **Proxy** : délai de lecture de 305 secondes sur `/api/ai/ask`, pour laisser au backend son délai de 300 secondes. Les autres routes gardent leur délai habituel.
- **Données** : texte traité sur le serveur de l’instance, sans transmission à OpenAI ; Lumi ne stocke pas les questions/réponses en PostgreSQL. Ollama garde temporairement son modèle chargé, pas un historique partagé entre questions. Le widget conserve l’affichage jusqu’à l’effacement ou son démontage.

## Correction des calculs faux

L’utilisateur a signalé la demande « fais moi la multiplication des nombres 12 3.1 et 2 puis tu soustrait 31.4 ». Le modèle annonçait 91,7 alors que l’expression correcte donne **43**.

`backend/src/calculator.rs` évalue les opérateurs `+`, `-`, `*`, `/`, les parenthèses et les nombres décimaux avec `rust_decimal`. Il n’exécute jamais du code ni une commande. L’analyse est limitée à 512 caractères et 32 niveaux d’imbrication ; la division par zéro, les expressions invalides et les débordements sont refusés.

Pour une expression explicite (`12 * 3.1 * 2 - 31.4`), le modèle n’intervient pas. Pour une phrase contenant une demande arithmétique et au moins deux nombres, le modèle fournit seulement une expression dans un JSON contraint. Le backend vérifie qu’elle contient les mêmes nombres, sans ajout ni omission, puis la calcule. Le widget affiche **Expression interprétée** et **Résultat calculé**. La réponse finale du calculateur n’est pas reformulée par le modèle.

Les décimales utilisent une précision bornée à 28 chiffres décimaux. Les divisions non terminantes peuvent être arrondies ; le résultat l’indique. Les consignes générales évitent les inventions de sources/données actuelles, et la température est fixée à 0,1 pour limiter la variabilité.

Limites : la traduction des mots en opérations dépend encore du modèle ; l’ordre ou le sens de la phrase peuvent être mal interprétés. L’expression affichée permet de le contrôler. La détection automatique couvre des formulations courantes, pas toutes les questions mathématiques. Les puissances, fonctions, unités et conversions avancées ne sont pas couvertes par ce calculateur ; préférer une expression explicite pour les quatre opérations prises en charge.

## Démarrage et diagnostic

```bash
npm run dev
# Ou déploiement complet :
docker compose up --build
```

Au premier démarrage, attendre le téléchargement. Dans Lumi, recharger la page, activer **Assistant IA local** dans **Mon compte → Mes services** si nécessaire et envoyer une question depuis le widget existant ou un nouveau widget.

```bash
docker compose ps ollama ollama-init
docker compose exec ollama ollama list
docker compose logs --tail 20 ollama-init
```

Configuration hôte :

```dotenv
OLLAMA_URL=http://127.0.0.1:11435
OLLAMA_PORT=11435
OLLAMA_MODEL=qwen2.5:14b
```

Le port 11435 évite le service déjà présent sur 11434. Dans le réseau Docker, l’adresse reste `http://ollama:11434`, indépendante du port hôte. En cas de changement de port, modifier aussi `OLLAMA_URL` pour le développement. Le port n’est publié que sur localhost : l’API Ollama locale ne nécessite pas de clé et ne doit pas devenir l’entrée publique de l’application. Les utilisateurs passent par l’API authentifiée de Lumi.

Pour changer de modèle, modifier `OLLAMA_MODEL`, relancer `npm run services`, puis redémarrer le backend. Ne pas utiliser un modèle cloud pour cette configuration locale. Les anciennes variables `OPENAI_*` présentes dans un `.env` existant ne sont plus utilisées et peuvent être retirées.

## Limites

Le téléchargement initial nécessite Internet et environ 9 Go pour les poids du modèle, en plus de l’image Docker et des autres fichiers du projet. Après installation, l’assistant peut fonctionner hors ligne, mais les autres widgets externes restent dépendants de leurs fournisseurs. Le modèle n’accède pas au Web, aux comptes externes ou aux autres widgets et peut fournir une réponse erronée ou datée. Les performances dépendent du processeur ; le premier chargement est plus lent. Lors des essais de cette machine, la première réponse a pris environ 63 secondes et les suivantes 11 à 34 secondes ; ces durées ne sont pas garanties. Le modèle chargé a occupé environ 9,9 Go d’après Ollama. La réponse est limitée à 384 tokens avec un contexte de 4 096 tokens ; le widget signale une réponse tronquée. Une question est indépendante des précédentes.

Sur un serveur partagé, une seule génération peut être en cours pour l’instance entière : les autres utilisateurs reçoivent un message pour réessayer. Cette limite privilégie la stabilité de la machine ; une file d’attente ou un serveur GPU constituerait une évolution pour davantage d’utilisateurs.

## Vérifications

Les résultats effectifs des tests et de l’essai réel sont consignés dans [VALIDATION_REMEDIATION.md](VALIDATION_REMEDIATION.md).
