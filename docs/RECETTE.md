# Recette des fournisseurs

Équipe : Milo Bousquet et Nathan Muzay. Les deux membres interviennent sur l’ensemble du projet.

## Résultats observés le 29 septembre 2026

- GitHub public : appel réel réussi avec `octocat/Hello-World`, graphe de 5 commits sur 3 branches. Aucun PushEvent dans l’historique renvoyé ; état vide valide.
- Gmail, Google Calendar et Spotify : l’équipe confirme que les applications OAuth et comptes de test sont prêts. Aucun navigateur connecté aux comptes n’est accessible à l’agent ; essais ci-dessous à exécuter et à consigner.
- Connexion Google à Lumi : validation cryptographique et nonce testés automatiquement ; configuration `GOOGLE_OIDC_CLIENT_ID` et essai réel à confirmer.

## Préparation

Lancer `npm run services` puis `npm run dev`. Pour Gmail et Calendar, utiliser l’origine autorisée `http://localhost:5174`. Dans Mon compte, activer les services. Pour Spotify, autoriser exactement `http://127.0.0.1:5174/` dans les Redirect URIs de l’application Spotify, puis ouvrir cette origine et s’y connecter à Lumi avant de connecter Spotify. `localhost` n’est pas autorisé comme URI de retour par Spotify : [référence officielle](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri).

Les secrets et jetons ne doivent jamais être copiés dans ce document, dans une capture ni dans le dépôt. Un Client ID OAuth est public.

## Gmail

- [ ] Ajouter Non lus, choisir une limite, connecter le compte test et comparer aux messages non lus de sa boîte de réception.
- [ ] Ajouter une deuxième instance avec une limite différente ; vérifier les deux affichages.
- [ ] Modifier l’intervalle (30–3600 s), recevoir un message de test et constater l’actualisation.
- [ ] Sur un message de test identifié, vérifier marquer comme lu et archiver.
- [ ] Rédiger puis envoyer explicitement un message à une adresse de test autorisée ; vérifier sa réception. Ne jamais envoyer à un tiers sans son accord.
- [ ] Déconnecter/reconnecter, puis vérifier le comportement après rechargement et expiration.

## Google Calendar

- [ ] Connecter un compte test et comparer le planning semaine/jour à son agenda principal.
- [ ] Créer explicitement un événement de test avec des horaires sur la même journée ; vérifier son affichage.
- [ ] Créer un événement de sept jours minimum, avec priorité, labels et échéance ; vérifier le widget Échéances du mois.
- [ ] Tester le changement semaine/jour, une récurrence, puis deux intervalles de rafraîchissement différents sur deux instances.
- [ ] Déconnecter et reconnecter. Vérifier la perte du jeton au rechargement et l’absence de données d’un autre compte Lumi.

## Spotify

- [ ] Sur `127.0.0.1:5174`, connecter Spotify et vérifier le retour OAuth dans la session Lumi initiatrice.
- [ ] Lancer une lecture dans Spotify ; comparer le titre, l’artiste et l’avancement.
- [ ] Régler le polling à 5 puis 30 secondes et observer la fréquence des appels réseau.
- [ ] Ajouter Top titres avec deux périodes et deux limites distinctes ; comparer les résultats.
- [ ] Déconnecter Lumi pendant une autorisation en cours et vérifier que le retour tardif n’ouvre pas la session d’un autre compte.

## Google OIDC et GitHub privé

- [ ] Renseigner `GOOGLE_OIDC_CLIENT_ID`, redémarrer le backend et autoriser l’origine chez Google.
- [ ] Tester la création d’un compte perso via Google, puis sa reconnexion.
- [ ] Pour un compte Lumi existant, l’associer explicitement depuis Mon compte avec la même adresse, puis se reconnecter avec Google.
- [ ] Sur GitHub, utiliser un jeton de test limité à un dépôt privé, vérifier les deux widgets et déconnecter. Après rechargement, l’accès privé doit demander une nouvelle connexion.

Consigner pour chaque essai la date, le résultat et l’éventuel message d’erreur, sans données personnelles ni identifiants secrets. Les cases du TODO liées aux fournisseurs ne doivent être fermées qu’après ces essais.
