//! Explicit local fixtures: cargo run --manifest-path backend/Cargo.toml --example seed_test_accounts
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&std::env::var("DATABASE_URL")?)
        .await?;
    lumi_backend::MIGRATOR.run(&pool).await?;
    let accounts = [
        (
            "perso@lumi.local",
            "Camille Martin",
            "perso",
            "Lumi-Perso-2026!",
        ),
        (
            "employe@lumi.local",
            "Alex Moreau",
            "employe",
            "Lumi-Employe-2026!",
        ),
        (
            "entreprise@lumi.local",
            "Louise Bernard",
            "entreprise",
            "Lumi-Entreprise-2026!",
        ),
        (
            "admin@lumi.local",
            "Sam Laurent",
            "admin",
            "Lumi-Admin-2026!",
        ),
    ];
    let mut tx = pool.begin().await?;
    let mut members = Vec::new();
    for (email, name, role, password) in accounts {
        let existing: Option<(Uuid, String)> =
            sqlx::query_as("SELECT id, password_hash FROM users WHERE lower(email) = lower($1)")
                .bind(email)
                .fetch_optional(&mut *tx)
                .await?;
        let id = if let Some((id, hash)) = existing {
            let roles: Vec<String> =
                sqlx::query_scalar("SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role")
                    .bind(id)
                    .fetch_all(&mut *tx)
                    .await?;
            if !bcrypt::verify(password, &hash)? || roles != vec![role.to_owned()] {
                return Err(format!("Le compte {email} existe avec d'autres identifiants ou rôles. Aucun compte n'a été modifié.").into());
            }
            id
        } else {
            let id = Uuid::new_v4();
            let hash =
                tokio::task::spawn_blocking(move || bcrypt::hash(password, bcrypt::DEFAULT_COST))
                    .await??;
            sqlx::query("INSERT INTO users (id,email,name,password_hash,email_verified_at) VALUES ($1,$2,$3,$4,now())")
                .bind(id)
                .bind(email)
                .bind(name)
                .bind(hash)
                .execute(&mut *tx)
                .await?;
            sqlx::query("INSERT INTO user_roles (user_id,role) VALUES ($1,$2)")
                .bind(id)
                .bind(role)
                .execute(&mut *tx)
                .await?;
            id
        };
        sqlx::query(
            "UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1",
        )
        .bind(id)
        .execute(&mut *tx)
        .await?;
        if role == "entreprise" || role == "employe" {
            members.push(id);
        }
    }
    let company_id = Uuid::parse_str("adc3fdd0-43f6-43e7-b398-f331c96453b9")?;
    sqlx::query("INSERT INTO companies (id,name) VALUES ($1,'Atelier Lumi — Démonstration') ON CONFLICT (id) DO NOTHING")
        .bind(company_id).execute(&mut *tx).await?;
    for id in members {
        sqlx::query("INSERT INTO company_memberships (user_id,company_id) VALUES ($1,$2) ON CONFLICT DO NOTHING")
            .bind(id).bind(company_id).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    println!("Les 4 comptes de test sont prêts. Identifiants : docs/COMPTES.md");
    Ok(())
}
