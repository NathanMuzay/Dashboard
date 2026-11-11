use std::{fs, process::Command};

#[test]
fn malformed_env_stops_startup_without_logging_values() {
    let directory = std::env::temp_dir().join(format!("lumi-startup-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&directory).unwrap();
    fs::write(directory.join(".env"), "MAIL_FROM=Lumi <private@example.test>\nOPENAI_API_KEY=test-secret-never-log\n").unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_lumi-backend"))
        .current_dir(&directory)
        .env_clear()
        .output()
        .unwrap();
    fs::remove_dir_all(directory).unwrap();
    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Configuration .env invalide"), "{stderr}");
    assert!(!stderr.contains("private@example.test"));
    assert!(!stderr.contains("test-secret-never-log"));
    assert!(!stderr.contains("DATABASE_URL"));
}

#[test]
fn provided_env_template_has_valid_syntax() {
    for item in dotenvy::from_read_iter(&include_bytes!("../../.env.example")[..]) {
        assert!(item.is_ok(), "Le modèle .env.example doit être lisible par dotenvy.");
    }
}
