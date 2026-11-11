use sqlx::postgres::PgPoolOptions;
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    match dotenvy::dotenv() {
        Ok(_) => {}
        Err(dotenvy::Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Configuration .env invalide : vérifiez la syntaxe et placez les valeurs contenant des espaces entre guillemets.",
            ).into());
        }
    }
    let url =
        std::env::var("DATABASE_URL").expect("DATABASE_URL doit être configurée (PostgreSQL)");
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&url)
        .await?;
    lumi_backend::MIGRATOR.run(&pool).await?;
    if std::env::var("LUMI_SEED_DEMO").as_deref() == Ok("true") {
        let email =
            std::env::var("LUMI_DEMO_EMAIL").unwrap_or_else(|_| lumi_backend::DEMO_EMAIL.into());
        let hash = std::env::var("LUMI_DEMO_PASSWORD_HASH")
            .ok()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| lumi_backend::DEMO_PASSWORD_HASH.into());
        lumi_backend::auth::seed_demo(&pool, &email, &hash).await?;
    }
    let address = std::env::var("BIND_ADDRESS").unwrap_or_else(|_| "127.0.0.1:3001".into());
    let mailer = lumi_backend::mail::Mailer::from_env()?;
    let listener = TcpListener::bind(&address).await?;
    println!("Backend Rust disponible sur http://{address}");
    axum::serve(
        listener,
        lumi_backend::app_with_mailer(pool, mailer)
            .into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await?;
    Ok(())
}
