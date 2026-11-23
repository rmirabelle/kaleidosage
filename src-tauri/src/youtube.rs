use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncReadExt, AsyncSeekExt};

/**
 * Upload to YouTube. The user signs in to Google in the normal browser (Google
 * does not allow its sign-in inside an app's web view): the app waits on a
 * local port for Google's answer, with PKCE, as Google asks of desktop apps.
 * The long-lived sign-in (the refresh token) stays in Windows Credential
 * Manager. Videos go up in parts (YouTube's resumable upload), so a large
 * file continues after a network failure. The Google key is in the program,
 * hidden (see build.rs).
 */
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const UPLOAD_URL: &str = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const THUMBNAIL_URL: &str = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set";
const SCOPE: &str = "https://www.googleapis.com/auth/youtube.upload";
/** The error text when the user must sign in (again); the page knows it. */
const SIGN_IN_NEEDED: &str = "SIGN_IN_NEEDED";
/** The error text when the user stopped the upload or the sign-in. */
const CANCELED: &str = "CANCELED";
/** How long the app waits for the user to sign in in the browser. */
const SIGN_IN_WAIT: Duration = Duration::from_secs(300);
/** One part of the upload: a multiple of 256 KiB, as YouTube asks. */
const CHUNK: u64 = 16 * 1024 * 1024;
/** Tries for one part after a network failure or a server error, with waits of 1, 2, 4 ... seconds. */
const RETRIES: u32 = 8;
/** YouTube's music category. */
const MUSIC_CATEGORY: &str = "10";

#[cfg(youtube_embedded)]
fn client_key() -> Option<(String, String)> {
    Some((
        obfstr::obfstr!(env!("YOUTUBE_CLIENT_ID")).to_string(),
        obfstr::obfstr!(env!("YOUTUBE_CLIENT_SECRET")).to_string(),
    ))
}
#[cfg(not(youtube_embedded))]
fn client_key() -> Option<(String, String)> {
    None
}

const NO_KEY: &str = "This build of Kaleido Sage has no Google key, so it cannot upload to YouTube.";

/** The access token in memory, and a flag that stops the sign-in wait or the upload. */
#[derive(Default)]
pub struct YouTube {
    token: Mutex<Option<(String, Instant)>>,
    cancel: Arc<AtomicBool>,
}

#[cfg(windows)]
mod vault {
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Security::Credentials::{CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC};

    const TARGET: &str = "Kaleido Sage/YouTube";
    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    pub fn save(secret: &str) -> Result<(), String> {
        let mut target = wide(TARGET);
        let mut user = wide("YouTube");
        let mut blob = secret.as_bytes().to_vec();
        let credential = CREDENTIALW {
            Type: CRED_TYPE_GENERIC,
            TargetName: PWSTR(target.as_mut_ptr()),
            UserName: PWSTR(user.as_mut_ptr()),
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            ..Default::default()
        };
        unsafe { CredWriteW(&credential, 0) }.map_err(|error| format!("Could not keep the YouTube sign-in: {error}"))
    }

    pub fn load() -> Option<String> {
        let target = wide(TARGET);
        let mut credential: *mut CREDENTIALW = std::ptr::null_mut();
        unsafe { CredReadW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, None, &mut credential) }.ok()?;
        let text = unsafe {
            let found = &*credential;
            String::from_utf8(std::slice::from_raw_parts(found.CredentialBlob, found.CredentialBlobSize as usize).to_vec()).ok()
        };
        unsafe { CredFree(credential as *const _) };
        text.filter(|text| !text.is_empty())
    }

    pub fn delete() {
        let target = wide(TARGET);
        let _ = unsafe { CredDeleteW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, None) };
    }
}

#[cfg(not(windows))]
mod vault {
    pub fn save(_secret: &str) -> Result<(), String> {
        Err("Upload to YouTube works only on Windows".into())
    }
    pub fn load() -> Option<String> {
        None
    }
    pub fn delete() {}
}

/** Opens "url" in the user's browser. */
fn open_in_browser(url: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::core::{w, PCWSTR};
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let wide: Vec<u16> = url.encode_utf16().chain(Some(0)).collect();
        let result = unsafe { ShellExecuteW(None, w!("open"), PCWSTR(wide.as_ptr()), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
        /* ShellExecute gives a value above 32 when it works. */
        if result.0 as isize <= 32 {
            return Err("Could not open the browser".into());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = url;
        Err("Upload to YouTube works only on Windows".into())
    }
}

/** Percent-encodes "text" for a URL query. */
fn encode(text: &str) -> String {
    text.bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => (byte as char).to_string(),
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

/** Decodes a percent-encoded query value ("+" is a space). */
fn decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        let byte = bytes[index];
        let hex = bytes.get(index + 1..index + 3).and_then(|pair| std::str::from_utf8(pair).ok()).and_then(|pair| u8::from_str_radix(pair, 16).ok());
        match (byte, hex) {
            (b'+', _) => out.push(b' '),
            (b'%', Some(value)) => {
                out.push(value);
                index += 2;
            }
            _ => out.push(byte),
        }
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/** Random text for the sign-in's PKCE code and its "state". */
fn random_text(bytes: usize) -> Result<String, String> {
    let mut buffer = vec![0u8; bytes];
    getrandom::fill(&mut buffer).map_err(|error| format!("Could not make a sign-in code: {error}"))?;
    Ok(URL_SAFE_NO_PAD.encode(buffer))
}

/** Google's error message in a reply body, else the body. */
fn google_error(body: &str) -> String {
    let json: Option<serde_json::Value> = serde_json::from_str(body).ok();
    json.as_ref()
        .and_then(|json| {
            json.pointer("/error/message")
                .or_else(|| json.get("error_description"))
                .or_else(|| json.get("error"))
                .and_then(|value| value.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| body.chars().take(300).collect())
}

/** The page the browser shows after the sign-in. */
fn answer_page(stream: &mut TcpStream, title: &str, text: &str) {
    let page = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Kaleido Sage</title><style>\
         body{{margin:0;height:100vh;display:grid;place-items:center;background:#1b1e26;color:#e6e8ee;font:15px 'Segoe UI',sans-serif}}\
         div{{padding:32px 40px;border:1px solid #3a3e4d;border-radius:10px;background:#262a34;text-align:center}}\
         h1{{margin:0 0 10px;color:#a9ddf8;font-size:22px}}p{{margin:0;color:#b9bdc8}}</style></head>\
         <body><div><h1>{title}</h1><p>{text}</p></div></body></html>"
    );
    let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{page}", page.len());
}

/** Waits for Google's answer on the local port; returns the sign-in code. */
fn wait_for_code(listener: TcpListener, state: &str, cancel: &AtomicBool) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|error| error.to_string())?;
    let deadline = Instant::now() + SIGN_IN_WAIT;
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err(CANCELED.into());
        }
        if Instant::now() > deadline {
            return Err("The sign-in took too long. Try again.".into());
        }
        let mut stream = match listener.accept() {
            Ok((stream, _)) => stream,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            Err(error) => return Err(error.to_string()),
        };
        let _ = stream.set_nonblocking(false);
        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
        let mut request = Vec::new();
        let mut buffer = [0u8; 2048];
        while !request.windows(4).any(|end| end == b"\r\n\r\n") && request.len() < 16384 {
            match stream.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(count) => request.extend_from_slice(&buffer[..count]),
            }
        }
        let request = String::from_utf8_lossy(&request);
        let target = request.lines().next().and_then(|line| line.split(' ').nth(1)).unwrap_or("");
        let Some(query) = target.strip_prefix("/?") else {
            /* The browser also asks for an icon. */
            let _ = write!(stream, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            continue;
        };
        let value = |name: &str| {
            query
                .split('&')
                .find_map(|pair| pair.strip_prefix(name).and_then(|rest| rest.strip_prefix('=')))
                .map(decode)
        };
        if value("state").as_deref() != Some(state) {
            answer_page(&mut stream, "Sign-in failed", "The answer did not come from this sign-in. Try again in Kaleido Sage.");
            return Err("The sign-in answer did not match. Try again.".into());
        }
        if let Some(error) = value("error") {
            answer_page(&mut stream, "Not signed in", "You can close this tab and go back to Kaleido Sage.");
            return Err(if error == "access_denied" { CANCELED.into() } else { format!("Google refused the sign-in: {error}") });
        }
        let Some(code) = value("code") else {
            answer_page(&mut stream, "Sign-in failed", "Google gave no sign-in code. Try again in Kaleido Sage.");
            return Err("Google gave no sign-in code".into());
        };
        answer_page(&mut stream, "Kaleido Sage is signed in to YouTube", "You can close this tab and go back to Kaleido Sage.");
        return Ok(code);
    }
}

#[derive(Deserialize)]
struct TokenReply {
    access_token: String,
    expires_in: u64,
    refresh_token: Option<String>,
}

fn http() -> reqwest::Client {
    reqwest::Client::builder().connect_timeout(Duration::from_secs(20)).build().unwrap_or_default()
}

impl YouTube {
    fn keep_token(&self, reply: &TokenReply) {
        *self.token.lock().unwrap() = Some((reply.access_token.clone(), Instant::now() + Duration::from_secs(reply.expires_in)));
    }

    /** A valid access token: the one in memory, else a new one from the kept sign-in. */
    async fn access_token(&self) -> Result<String, String> {
        if let Some((token, until)) = self.token.lock().unwrap().clone() {
            if until > Instant::now() + Duration::from_secs(120) {
                return Ok(token);
            }
        }
        let (id, secret) = client_key().ok_or(NO_KEY)?;
        let refresh = vault::load().ok_or(SIGN_IN_NEEDED)?;
        let response = http()
            .post(TOKEN_URL)
            .form(&[("client_id", id.as_str()), ("client_secret", secret.as_str()), ("refresh_token", refresh.as_str()), ("grant_type", "refresh_token")])
            .send()
            .await
            .map_err(|error| format!("Could not reach Google: {error}"))?;
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        if status.as_u16() == 400 || status.as_u16() == 401 {
            /* The sign-in ended (Google ends a test app's sign-in after 7 days), or the user took it back. */
            vault::delete();
            return Err(SIGN_IN_NEEDED.into());
        }
        if !status.is_success() {
            return Err(format!("Google refused the sign-in: {}", google_error(&body)));
        }
        let reply: TokenReply = serde_json::from_str(&body).map_err(|error| format!("Google's answer was not readable: {error}"))?;
        self.keep_token(&reply);
        Ok(reply.access_token)
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YouTubeStatus {
    /** This build has a Google key. */
    available: bool,
    signed_in: bool,
}

#[tauri::command]
pub fn youtube_status() -> YouTubeStatus {
    YouTubeStatus { available: client_key().is_some(), signed_in: client_key().is_some() && vault::load().is_some() }
}

/** Signs in through the browser; returns when the user has signed in, or with an error ("CANCELED" when stopped). */
#[tauri::command]
pub async fn youtube_sign_in(youtube: State<'_, YouTube>) -> Result<(), String> {
    let (id, secret) = client_key().ok_or(NO_KEY)?;
    youtube.cancel.store(false, Ordering::Relaxed);
    let verifier = random_text(48)?;
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = random_text(16)?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| format!("Could not wait for the sign-in: {error}"))?;
    let redirect = format!("http://127.0.0.1:{}", listener.local_addr().map_err(|error| error.to_string())?.port());
    let url = format!(
        "{AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={challenge}&code_challenge_method=S256&state={state}&access_type=offline&prompt=consent",
        encode(&id),
        encode(&redirect),
        encode(SCOPE)
    );
    open_in_browser(&url)?;
    let cancel = youtube.cancel.clone();
    let code = tauri::async_runtime::spawn_blocking(move || wait_for_code(listener, &state, &cancel))
        .await
        .map_err(|error| error.to_string())??;
    let response = http()
        .post(TOKEN_URL)
        .form(&[
            ("client_id", id.as_str()),
            ("client_secret", secret.as_str()),
            ("code", code.as_str()),
            ("code_verifier", verifier.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect.as_str()),
        ])
        .send()
        .await
        .map_err(|error| format!("Could not reach Google: {error}"))?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Google refused the sign-in: {}", google_error(&body)));
    }
    let reply: TokenReply = serde_json::from_str(&body).map_err(|error| format!("Google's answer was not readable: {error}"))?;
    let refresh = reply.refresh_token.clone().ok_or("Google gave no lasting sign-in. Try again.")?;
    vault::save(&refresh)?;
    youtube.keep_token(&reply);
    Ok(())
}

/** Signs out: Google takes the sign-in back, and the app forgets it. */
#[tauri::command]
pub async fn youtube_sign_out(youtube: State<'_, YouTube>) -> Result<(), String> {
    if let Some(refresh) = vault::load() {
        let _ = http().post(REVOKE_URL).form(&[("token", refresh.as_str())]).send().await;
    }
    vault::delete();
    *youtube.token.lock().unwrap() = None;
    Ok(())
}

/** Stops the sign-in wait or the upload. */
#[tauri::command]
pub fn youtube_cancel(youtube: State<'_, YouTube>) {
    youtube.cancel.store(true, Ordering::Relaxed);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadRequest {
    path: String,
    title: String,
    description: String,
    tags: Vec<String>,
    /** "private", "unlisted" or "public". */
    privacy: String,
}

/** YouTube refuses "<" and ">" in titles and descriptions, a title over 100 characters, and a description over 5000 bytes. */
fn clean(text: &str, limit_chars: usize) -> String {
    text.replace(['<', '>'], "").chars().take(limit_chars).collect()
}

/** Where the upload is, after a part: the next byte to send, or the video's id when YouTube has the whole file. */
enum Progress {
    At(u64),
    Done(String),
}

async fn read_progress(response: reqwest::Response) -> Result<Progress, String> {
    let status = response.status().as_u16();
    if status == 308 {
        /* "Range: bytes=0-N" says YouTube has bytes 0 to N; with no Range it has none. */
        let next = response
            .headers()
            .get("range")
            .and_then(|value| value.to_str().ok())
            .and_then(|range| range.rsplit('-').next())
            .and_then(|end| end.parse::<u64>().ok())
            .map_or(0, |end| end + 1);
        return Ok(Progress::At(next));
    }
    let body = response.text().await.unwrap_or_default();
    if status == 200 || status == 201 {
        let json: serde_json::Value = serde_json::from_str(&body).map_err(|error| format!("YouTube's answer was not readable: {error}"))?;
        let id = json.get("id").and_then(|id| id.as_str()).ok_or("YouTube gave no video id")?;
        return Ok(Progress::Done(id.to_string()));
    }
    if status == 404 || status == 410 {
        return Err("YouTube ended the upload. Start it again.".into());
    }
    Err(format!("RETRY:{status}:{}", google_error(&body)))
}

/** Uploads a video; returns its YouTube id. Sends "youtube-upload-progress" ({ sent, total }) as it goes. */
#[tauri::command]
pub async fn youtube_upload(app: AppHandle, youtube: State<'_, YouTube>, request: UploadRequest) -> Result<String, String> {
    youtube.cancel.store(false, Ordering::Relaxed);
    let total = tokio::fs::metadata(&request.path).await.map_err(|error| format!("Could not read {}: {error}", request.path))?.len();
    let privacy = match request.privacy.as_str() {
        "public" | "unlisted" => request.privacy.as_str(),
        _ => "private",
    };
    let metadata = serde_json::json!({
        "snippet": {
            "title": clean(&request.title, 100),
            "description": clean(&request.description, 4900),
            "tags": request.tags.iter().map(|tag| clean(tag, 100)).filter(|tag| !tag.trim().is_empty()).collect::<Vec<_>>(),
            "categoryId": MUSIC_CATEGORY
        },
        "status": { "privacyStatus": privacy, "selfDeclaredMadeForKids": false }
    });
    let client = http();
    let token = youtube.access_token().await?;
    let response = client
        .post(UPLOAD_URL)
        .bearer_auth(&token)
        .header("X-Upload-Content-Type", "video/mp4")
        .header("X-Upload-Content-Length", total)
        .json(&metadata)
        .send()
        .await
        .map_err(|error| format!("Could not reach YouTube: {error}"))?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        if status == 401 {
            vault::delete();
            return Err(SIGN_IN_NEEDED.into());
        }
        return Err(format!("YouTube refused the upload: {}", google_error(&body)));
    }
    let session = response
        .headers()
        .get("location")
        .and_then(|value| value.to_str().ok())
        .ok_or("YouTube gave no upload address")?
        .to_string();

    let mut file = tokio::fs::File::open(&request.path).await.map_err(|error| format!("Could not open {}: {error}", request.path))?;
    let mut offset = 0u64;
    let mut failures = 0u32;
    let mut buffer = vec![0u8; CHUNK as usize];
    loop {
        if youtube.cancel.load(Ordering::Relaxed) {
            let _ = client.delete(&session).send().await;
            return Err(CANCELED.into());
        }
        let _ = app.emit("youtube-upload-progress", serde_json::json!({ "sent": offset, "total": total }));
        let token = youtube.access_token().await?;
        let result = if failures == 0 {
            let length = CHUNK.min(total - offset) as usize;
            file.seek(std::io::SeekFrom::Start(offset)).await.map_err(|error| error.to_string())?;
            file.read_exact(&mut buffer[..length]).await.map_err(|error| format!("Could not read the video: {error}"))?;
            let range = if length == 0 { format!("bytes */{total}") } else { format!("bytes {offset}-{}/{total}", offset + length as u64 - 1) };
            client
                .put(&session)
                .bearer_auth(&token)
                .header("Content-Range", range)
                .timeout(Duration::from_secs(600))
                .body(buffer[..length].to_vec())
                .send()
                .await
        } else {
            /* After a failure: ask YouTube how much it has. */
            client
                .put(&session)
                .bearer_auth(&token)
                .header("Content-Range", format!("bytes */{total}"))
                .header("Content-Length", 0)
                .timeout(Duration::from_secs(60))
                .send()
                .await
        };
        let outcome = match result {
            Ok(response) => read_progress(response).await,
            Err(error) => Err(format!("RETRY:0:{error}")),
        };
        match outcome {
            Ok(Progress::Done(id)) => {
                let _ = app.emit("youtube-upload-progress", serde_json::json!({ "sent": total, "total": total }));
                return Ok(id);
            }
            Ok(Progress::At(next)) => {
                offset = next.min(total);
                failures = 0;
            }
            Err(error) => {
                let Some(detail) = error.strip_prefix("RETRY:") else { return Err(error) };
                let (status, message) = detail.split_once(':').unwrap_or(("0", detail));
                let status: u16 = status.parse().unwrap_or(0);
                /* A network failure or a server error is tried again; any other refusal ends the upload. */
                if status != 0 && status < 500 {
                    return Err(format!("YouTube refused the upload: {message}"));
                }
                failures += 1;
                if failures > RETRIES {
                    return Err(format!("The upload failed: {message}"));
                }
                tokio::time::sleep(Duration::from_secs(1 << (failures - 1).min(5))).await;
            }
        }
    }
}

/** Sets a video's thumbnail: the raw request body is the JPEG or PNG, and the "video-id" header names the video. */
#[tauri::command]
pub async fn youtube_set_thumbnail(youtube: State<'_, YouTube>, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The thumbnail is missing".into());
    };
    let id = request.headers().get("video-id").and_then(|value| value.to_str().ok()).ok_or("The video id is missing")?;
    let kind = if bytes.starts_with(b"\x89PNG") { "image/png" } else { "image/jpeg" };
    let token = youtube.access_token().await?;
    let response = http()
        .post(format!("{THUMBNAIL_URL}?videoId={}&uploadType=media", encode(id)))
        .bearer_auth(token)
        .header("Content-Type", kind)
        .body(bytes.clone())
        .send()
        .await
        .map_err(|error| format!("Could not reach YouTube: {error}"))?;
    if response.status().is_success() {
        return Ok(());
    }
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    if status == 403 {
        return Err(format!("YouTube refused the thumbnail. A custom thumbnail needs a channel confirmed with a phone number (youtube.com/verify). {}", google_error(&body)));
    }
    Err(format!("YouTube refused the thumbnail: {}", google_error(&body)))
}

/** Opens a YouTube page (the uploaded video) in the browser. */
#[tauri::command]
pub fn youtube_open(url: String) -> Result<(), String> {
    if !(url.starts_with("https://www.youtube.com/") || url.starts_with("https://studio.youtube.com/") || url.starts_with("https://youtu.be/")) {
        return Err("Only YouTube pages open from here".into());
    }
    open_in_browser(&url)
}
