/**
 * The Google sign-in key for YouTube uploads (see youtube.rs) comes from the
 * environment (YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET), else from the
 * git-ignored youtube-client.json in the project folder, as Google gives it.
 * The program keeps it hidden with obfstr. Without a key the app builds,
 * and Upload to YouTube says that this build cannot upload.
 */
fn main() {
    println!("cargo:rerun-if-env-changed=YOUTUBE_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=YOUTUBE_CLIENT_SECRET");
    println!("cargo:rerun-if-changed=../youtube-client.json");
    println!("cargo::rustc-check-cfg=cfg(youtube_embedded)");
    let from_env = |name: &str| std::env::var(name).ok().filter(|value| !value.trim().is_empty());
    let key = match (from_env("YOUTUBE_CLIENT_ID"), from_env("YOUTUBE_CLIENT_SECRET")) {
        (Some(id), Some(secret)) => Some((id, secret)),
        _ => key_file(),
    };
    if let Some((id, secret)) = key {
        println!("cargo:rustc-env=YOUTUBE_CLIENT_ID={id}");
        println!("cargo:rustc-env=YOUTUBE_CLIENT_SECRET={secret}");
        println!("cargo:rustc-cfg=youtube_embedded");
    }
    tauri_build::build()
}

/** The client id and secret in youtube-client.json ("installed" or "web" client). */
fn key_file() -> Option<(String, String)> {
    let text = std::fs::read_to_string("../youtube-client.json").ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    let client = json.get("installed").or_else(|| json.get("web"))?;
    let id = client.get("client_id")?.as_str()?.trim().to_string();
    let secret = client.get("client_secret")?.as_str()?.trim().to_string();
    (!id.is_empty() && !secret.is_empty()).then_some((id, secret))
}
