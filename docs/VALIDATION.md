# Validation du 29 septembre 2026

Les comptes OAuth et leurs autorisations réelles sont suivis séparément dans [RECETTE.md](RECETTE.md).

## Vérifications automatisées

- 35 tests frontend : modèles Calendar/Gmail/GitHub, isolation des jetons, cache, import/export, tailles et validation des widgets.
- 20 tests backend : comptes, e-mails, permissions, `/about.json`, cohérence du catalogue, dashboards, conflits, abonnements, administration, limitation des connexions, signature et nonce OIDC.
- 4 parcours navigateur : édition et persistance, mobile 390 px, conflits, indisponibilité GitHub. La vidéo est un scénario distinct, exécuté volontairement.
- Compilation Vite et compilation Rust.
- GitHub public : deux widgets interrogés réellement, état vide Push valide et graphe de 5 commits / 3 branches.
- 29 septembre 2026 : `npm run check:clean` réussi depuis un clone temporaire, avec stack Docker isolée et contrôles HTTP sur le port 18080.

## Installation propre

`scripts/check-clean.py` copie les sources suivies et les nouveaux fichiers non ignorés dans un dépôt temporaire, y crée un commit local puis en fait un clone. Il ne modifie ni les commits ni l’index du dépôt de travail. Ainsi, la vérification couvre aussi les changements non encore commités.

Le script exécute `npm ci`, les tests frontend, la compilation frontend, `docker compose build`, `docker compose up -d --wait` et les contrôles HTTP. Le projet Compose utilise ses propres volumes, n’expose pas PostgreSQL/Mailpit et utilise le port 18080 pour ne pas interférer avec la stack de développement. Il supprime uniquement ses propres conteneurs et volumes à la fin.

```bash
python3 scripts/check-clean.py
```

La stack habituelle conserve le port attendu 8080. `.env` et les dépendances locales ne sont pas copiés dans le clone ; `.env.example` sert de point de départ. Docker conserve éventuellement les couches de construction en cache.

## Limites de la validation

Les tests navigateur ne constituent pas un audit exhaustif d’accessibilité. Les tests cryptographiques ne prouvent pas que le client Google est correctement configuré chez le fournisseur. Les essais réels Gmail/Calendar/Spotify et GitHub privé doivent être consignés par l’équipe avec ses comptes de test. Aucune validation réelle n’est déduite des données simulées.

## Vérifications après soutenance

Les résultats actuels et leurs limites sont détaillés dans [VALIDATION_REMEDIATION.md](VALIDATION_REMEDIATION.md). Ce complément actualise les comptes de tests et ajoute le POC, la météo réelle, les essais mobile et les protections Nginx.
