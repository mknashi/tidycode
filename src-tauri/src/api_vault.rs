//! Separate namespace from AI-provider keys. Values never enter a plaintext fallback.
const SERVICE: &str = "api.tidycode";
const MAX_SECRET_BYTES: usize = 64 * 1024;
fn valid_id(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
}
fn entry(id: &str) -> Result<keyring::Entry, &'static str> {
    if !valid_id(id) {
        return Err("Invalid vault identifier.");
    }
    keyring::Entry::new(SERVICE, id).map_err(|_| "OS credential storage is unavailable.")
}
fn validate_value(value: &str) -> Result<(), &'static str> {
    if value.is_empty() || value.len() > MAX_SECRET_BYTES {
        return Err("Use a nonempty credential no larger than 64 KiB.");
    }
    if value.contains("{{") {
        return Err("Store a literal credential, not a variable reference.");
    }
    Ok(())
}
#[tauri::command]
pub async fn api_vault_get(id: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || match entry(&id)?.get_password() {
        Ok(value) => {
            validate_value(&value)?;
            Ok(Some(value))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Could not read the OS credential store. Access may have been denied."),
    })
    .await
    .map_err(|_| "OS credential operation failed.".to_owned())?
    .map_err(str::to_owned)
}
#[tauri::command]
pub async fn api_vault_set(id: String, value: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_value(&value)?;
        entry(&id)?.set_password(&value).map_err(|_| {
            "Could not save to the OS credential store. No plaintext fallback was used."
        })
    })
    .await
    .map_err(|_| "OS credential operation failed.".to_owned())?
    .map_err(str::to_owned)
}
#[tauri::command]
pub async fn api_vault_delete(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || match entry(&id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove the OS credential."),
    })
    .await
    .map_err(|_| "OS credential operation failed.".to_owned())?
    .map_err(str::to_owned)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn namespace_ids_are_bounded_and_cannot_address_provider_keys() {
        assert!(valid_id("00000000-0000-4000-8000-000000000001"));
        for id in [
            "groqApiKey",
            "../secret",
            "",
            "00000000-0000-4000-8000-00000000000z",
        ] {
            assert!(!valid_id(id));
        }
    }
    #[test]
    fn literal_secret_limits() {
        assert!(validate_value("synthetic+secret&literal").is_ok());
        assert!(validate_value("").is_err());
        assert!(validate_value("{{token}}").is_err());
        assert!(validate_value(&"x".repeat(MAX_SECRET_BYTES + 1)).is_err());
    }
}
