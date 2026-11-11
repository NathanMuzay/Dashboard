# Widgets Gmail

Deux widgets sont disponibles : non lus (1 à 20 messages de la boîte de réception) et rédaction dans une fenêtre Lumi avec envoi via Gmail.

## Configuration

1. Dans Google Cloud, activer Gmail API et configurer l'écran de consentement OAuth. En mode test, ajouter les comptes autorisés comme utilisateurs de test.
2. Créer un client OAuth de type **Application Web** et ajouter l'origine exacte du frontend dans les origines JavaScript autorisées, par exemple `http://localhost:5174`.
3. Copier `.env.example` vers `.env` à la racine, renseigner `VITE_GOOGLE_CLIENT_ID`, puis redémarrer Vite. Le Client ID peut aussi être saisi dans les paramètres de chaque widget. Aucun secret client n'est nécessaire.
4. Ajouter « Gmail · Non lus », choisir le nombre de messages, puis cliquer sur « Connecter Gmail » et autoriser l'accès.

Le widget utilise Google Identity Services et le scope `gmail.modify`. Les jetons et messages restent en mémoire du composant, sont effacés au démontage/déconnexion, et ne sont pas sauvegardés avec les widgets. Une reconnexion est nécessaire après rechargement ou expiration du jeton. Chaque widget peut être connecté à un compte distinct. « Déconnecter » ferme la session locale ; la révocation des autorisations se fait dans le compte Google.

Lu, archive et spam modifient uniquement le message sélectionné. L'affichage est actualisé selon l’intervalle configuré (60 secondes par défaut), au retour dans la fenêtre et après une action. Les mails archivés sont exclus de la liste. Le nombre affiché correspond aux messages chargés, pas au total de la boîte.

L'API Gmail ne fournit pas d'action native de blocage d'expéditeur : « Bloquer dans Gmail » ouvre la conversation et indique d'utiliser son menu ⋮ → Bloquer l'expéditeur. Aucun filtre de suppression n'est créé à sa place.

Le widget de rédaction ouvre une fenêtre dans Lumi, inspirée de Gmail : À, Cc/Cci, Objet, corps en texte brut, agrandissement et réduction. Le bouton utilise les couleurs du thème Lumi et passe en icône seule dans les petits widgets. Les pièces jointes et la mise en forme enrichie ne sont pas encore prises en charge.

Il utilise le même Client ID Google (global ou configuré dans le widget) et le scope `gmail.modify`, qui autorise également l'envoi. Cliquez sur « Connecter Gmail » dans la fenêtre : le compte réellement connecté est affiché dans le champ De. L'adresse facultative des paramètres est indicative ; elle ne change pas le compte autorisé. « Envoyer » appelle `users.messages.send` avec un message MIME UTF-8 encodé en base64url. Le mail est envoyé par Gmail et figure dans ses messages envoyés.

Fermer ou réduire conserve le texte en mémoire jusqu'au démontage du widget ou au rechargement de la page ; ce n'est pas un brouillon synchronisé avec Gmail. Une erreur conserve le texte. Aucun envoi n'est relancé automatiquement pour éviter les doublons après une interruption réseau. La session Google reste uniquement en mémoire. L'envoi et le changement de compte sont verrouillés pendant une requête.

Avant diffusion publique, suivre les exigences Google de consentement et de vérification du scope restreint Gmail.

Documentation : https://developers.google.com/identity/oauth2/web/guides/use-token-model et https://developers.google.com/workspace/gmail/api/reference/rest
