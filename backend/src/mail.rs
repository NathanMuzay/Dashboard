use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor, message::Mailbox,
    transport::smtp::authentication::Credentials,
};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use url::Url;

#[derive(Clone)]
pub enum Delivery {
    Smtp(AsyncSmtpTransport<Tokio1Executor>),
    /// Explicit injection for isolated integration tests; never selected from environment.
    Capture(Arc<Mutex<Vec<SentMail>>>),
    Unavailable,
}
#[derive(Clone)]
pub struct SentMail {
    pub recipient: String,
    pub purpose: String,
    pub link: String,
}
#[derive(Clone)]
pub struct Mailer {
    delivery: Delivery,
    from: Mailbox,
    base_url: Url,
}
impl Mailer {
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let host = std::env::var("SMTP_HOST").unwrap_or_else(|_| "127.0.0.1".into());
        let mode = std::env::var("SMTP_SECURITY").unwrap_or_else(|_| "local".into());
        let base_url = Url::parse(
            &std::env::var("APP_URL").unwrap_or_else(|_| "http://localhost:5174".into()),
        )?;
        let loopback = matches!(
            base_url.host_str(),
            Some("localhost" | "127.0.0.1" | "[::1]")
        );
        if (!loopback && base_url.scheme() != "https")
            || !matches!(base_url.scheme(), "http" | "https")
            || base_url.host_str().is_none()
            || !base_url.username().is_empty()
            || base_url.password().is_some()
            || base_url.query().is_some()
            || base_url.fragment().is_some()
            || base_url.path() != "/"
        {
            return Err(
                "APP_URL doit être une origine HTTPS (HTTP autorisé uniquement en local).".into(),
            );
        }
        let (builder, default_port) = match mode.as_str() {
            "tls" => (AsyncSmtpTransport::<Tokio1Executor>::relay(&host)?, 465),
            "starttls" => (
                AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&host)?,
                587,
            ),
            "local"
                if loopback
                    && matches!(host.as_str(), "127.0.0.1" | "localhost" | "::1" | "mailpit") =>
            {
                (
                    AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&host),
                    1025,
                )
            }
            _ => {
                return Err(
                    "SMTP_SECURITY doit être tls/starttls, ou local pour Mailpit en développement."
                        .into(),
                );
            }
        };
        let port = std::env::var("SMTP_PORT")
            .ok()
            .map(|s| s.parse::<u16>())
            .transpose()?
            .unwrap_or(default_port);
        let mut builder = builder.port(port).timeout(Some(Duration::from_secs(5)));
        if let Ok(username) = std::env::var("SMTP_USERNAME") {
            if !username.is_empty() {
                if mode == "local" {
                    return Err(
                        "Les identifiants SMTP ne sont pas autorisés en mode local sans TLS."
                            .into(),
                    );
                }
                builder = builder
                    .credentials(Credentials::new(username, std::env::var("SMTP_PASSWORD")?));
            }
        }
        Ok(Self {
            delivery: Delivery::Smtp(builder.build()),
            from: std::env::var("MAIL_FROM")
                .unwrap_or_else(|_| "Lumi <noreply@lumi.local>".into())
                .parse()?,
            base_url,
        })
    }
    pub fn capture() -> (Self, Arc<Mutex<Vec<SentMail>>>) {
        let messages = Arc::new(Mutex::new(Vec::new()));
        (
            Self {
                delivery: Delivery::Capture(messages.clone()),
                from: "Lumi <noreply@lumi.local>".parse().unwrap(),
                base_url: Url::parse("http://localhost:5174").unwrap(),
            },
            messages,
        )
    }
    pub fn unavailable() -> Self {
        let (mut mailer, _) = Self::capture();
        mailer.delivery = Delivery::Unavailable;
        mailer
    }
    pub async fn send_link(
        &self,
        recipient: &str,
        purpose: &str,
        token: &str,
    ) -> Result<(), String> {
        let (subject, action, lifetime) = match purpose {
            "verify" => (
                "Lumi — Confirmez votre adresse e-mail",
                "Confirmer mon adresse",
                "24 heures",
            ),
            "magic" => (
                "Lumi — Votre lien de connexion",
                "Me connecter à Lumi",
                "15 minutes",
            ),
            "reset" => (
                "Lumi — Réinitialiser mon mot de passe",
                "Choisir un nouveau mot de passe",
                "30 minutes",
            ),
            _ => return Err("Type de courrier invalide".into()),
        };
        let mut url = self.base_url.clone();
        // Fragments are not transmitted in HTTP requests or Referer headers.
        url.set_fragment(Some(&format!("email-action={purpose}&token={token}")));
        let link = url.to_string();
        let message = Message::builder().from(self.from.clone()).to(recipient.parse().map_err(|_| "Destinataire invalide")?)
            .subject(subject).body(format!("Bonjour,\n\n{action} :\n{link}\n\nCe lien est valable {lifetime}, pour une seule utilisation. Seul le dernier lien envoyé pour cette action est valide.\n\nOuvrez le lien puis confirmez l’action dans Lumi. Si vous n’avez pas demandé cet e-mail, ignorez-le. Ne transmettez pas ce lien.\n\nL’équipe Lumi")).map_err(|_| "Courrier invalide")?;
        match &self.delivery {
            Delivery::Smtp(transport) => {
                tokio::time::timeout(Duration::from_secs(8), transport.send(message))
                    .await
                    .map_err(|_| "Délai SMTP dépassé")?
                    .map_err(|_| "Envoi SMTP impossible")?;
            }
            Delivery::Capture(messages) => messages
                .lock()
                .map_err(|_| "Capture indisponible")?
                .push(SentMail {
                    recipient: recipient.into(),
                    purpose: purpose.into(),
                    link,
                }),
            Delivery::Unavailable => return Err("Service mail indisponible".into()),
        }
        Ok(())
    }
}
