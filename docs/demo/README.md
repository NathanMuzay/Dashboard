# Démonstration locale Lumi

`lumi-demo.mp4` présente le parcours local : connexion de démonstration, création d’un dashboard, ajout/configuration, déplacement, persistance, catalogue des services, lecture d’un dépôt GitHub public, export et mobile.

La vidéo utilise la base isolée `lumi_e2e`, un compte de démonstration et un dépôt public. Elle ne montre aucun jeton privé et ne valide pas les consentements OAuth des comptes de l’équipe. Les chapitres sont sous-titrés à l’écran, sans piste audio.

Source reproductible : `frontend/e2e/demo.spec.js`. Lancer avec `DEMO_RECORD=1 npm run test:e2e -w frontend -- --grep @demo`, puis convertir le WebM Playwright en MP4 avec FFmpeg. `dashboard-exemple.json` est un export de démonstration importable, sans jetons.
