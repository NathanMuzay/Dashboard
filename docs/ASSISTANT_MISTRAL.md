# Assistant Mistral

L’intégration actuelle remplace Ollama par l’API HTTPS Mistral. Le module Rust conserve son nom historique `openai.rs`, les routes `/api/ai/status` et `/api/ai/ask`, le type `openai_chat` et l’abonnement `openai` pour préserver les dashboards.

## Configuration

Créer une clé sur https://console.mistral.ai, dans API Keys → Create new key. Ajouter à `.env` :

```dotenv
MISTRAL_API_KEY=votre_cle_privee
MISTRAL_MODEL=ministral-3b-2512
```

Le backend utilise exclusivement `https://api.mistral.ai/v1`. La clé est transmise dans l’en-tête Authorization côté serveur, jamais au navigateur. Le statut vérifie l’accès au modèle avec `/models`, sans génération de texte. Une clé absente, invalide ou un quota atteint produit un message explicite sans exposer les détails internes du fournisseur.

Relancer `npm run dev` en développement. Pour Docker : `docker compose up -d --build --wait --remove-orphans`. PostgreSQL et Mailpit sont les seuls services auxiliaires nécessaires. Les anciens volumes Ollama ne sont pas supprimés automatiquement.

## Modèle et coût

Ministral 3 3B (`ministral-3b-2512`) est le modèle de conversation le moins cher affiché au tarif standard consulté le 19 octobre 2026 : 0,10 $/million de tokens en entrée et en sortie. Sources : https://docs.mistral.ai/inference/pricing et https://docs.mistral.ai/models/ministral-3-3b-25-12. Studio propose aussi un mode Free soumis à des limites. Le modèle peut être modifié via MISTRAL_MODEL.

## Données et limites

Chaque envoi transmet la question à Mistral. Lumi ne stocke ni question ni réponse en base ; l’affichage reste dans la session du widget. Le traitement distant relève aussi des conditions et politiques de Mistral. Il n’y a pas d’accès aux autres widgets ni d’historique conversationnel transmis.

La session et l’abonnement sont obligatoires. Les demandes sont bornées à 8 000 caractères et cinq par minute par utilisateur. Une seule génération peut être active par processus backend. La réponse est limitée à 384 tokens (256 pour un calcul), avec un délai HTTP de 60 secondes et sans réessai automatique. Les expressions arithmétiques explicites sont évaluées localement ; les phrases sont converties en JSON par Mistral puis vérifiées et calculées en Rust.

Les tests Rust utilisent un serveur Mistral simulé pour vérifier l’authentification, les réponses tronquées, les erreurs et les calculs. Un essai réel nécessite une clé et des quotas disponibles.

Les sommes d’intervalles entiers avec exclusions sont aussi calculées en Rust après interprétation par Mistral : « somme des nombres de 1 à 12 en excluant 11 » donne **67**. Le plan est vérifié pour conserver les nombres de la demande ; les intervalles sont bornés à 10 000 entiers et 100 exclusions distinctes.
