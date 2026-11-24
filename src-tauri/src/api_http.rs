//! API-client transport only. No listener, cookie jar, implicit redirects, or filesystem access.
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    redirect::Policy,
    Client, Method, Url,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::State;
use tokio::sync::watch;
const LIMIT: usize = 20 * 1024 * 1024;
#[derive(Default)]
pub struct ApiHttpState {
    active: Mutex<HashMap<String, watch::Sender<bool>>>,
    cancelled: Mutex<HashMap<String, Instant>>,
}
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NetworkSettings {
    origin: String,
    verify_tls: bool,
    #[serde(default)]
    ca_pem: String,
    #[serde(default)]
    proxy_url: String,
    #[serde(default)]
    proxy_username: String,
    #[serde(default)]
    proxy_password: String,
    #[serde(default)]
    insecure_confirmed: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRequest {
    request_id: String,
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    body_base64: Option<String>,
    timeout_ms: u64,
    #[serde(default)]
    network: Option<NetworkSettings>,
}
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NativeResponse {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
    body_base64: String,
    size: usize,
    total_ms: f64,
    headers_ms: f64,
    content_type: String,
}
#[derive(Serialize, Debug)]
pub struct NativeError {
    code: &'static str,
    message: &'static str,
}
fn error(code: &'static str, message: &'static str) -> NativeError {
    NativeError { code, message }
}
fn network_error(e: reqwest::Error) -> NativeError {
    // Native error strings can include URLs and credentials. Never serialize them.
    if e.is_timeout() {
        error(
            "timeout",
            "Request timed out. The server may already have processed it.",
        )
    } else {
        error("network","Native HTTP request failed. Check the destination, network and TLS certificate. The request was not retried.")
    }
}
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 100 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}
struct ActiveGuard<'a> {
    state: &'a ApiHttpState,
    id: String,
}
impl Drop for ActiveGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut map) = self.state.active.lock() {
            map.remove(&self.id);
        }
    }
}
fn register<'a>(
    state: &'a ApiHttpState,
    id: &str,
) -> Result<(ActiveGuard<'a>, watch::Receiver<bool>), NativeError> {
    if !valid_id(id) {
        return Err(error("validation", "Invalid execution identifier."));
    }
    let mut active = state
        .active
        .lock()
        .map_err(|_| error("internal", "Native transport unavailable."))?;
    let mut cancelled = state
        .cancelled
        .lock()
        .map_err(|_| error("internal", "Native transport unavailable."))?;
    cancelled.retain(|_, time| time.elapsed() < Duration::from_secs(60));
    if cancelled.remove(id).is_some() {
        return Err(error("cancelled", "Request cancelled before execution."));
    }
    if active.len() >= 4 || active.contains_key(id) {
        return Err(error(
            "limit",
            "Four native requests are already running, or this execution is already active.",
        ));
    }
    let (tx, rx) = watch::channel(false);
    active.insert(id.to_owned(), tx);
    Ok((
        ActiveGuard {
            state,
            id: id.to_owned(),
        },
        rx,
    ))
}
fn cancel(state: &ApiHttpState, id: &str) -> Result<(), NativeError> {
    if !valid_id(id) {
        return Err(error("validation", "Invalid execution identifier."));
    }
    let active = state
        .active
        .lock()
        .map_err(|_| error("internal", "Native transport unavailable."))?;
    if let Some(tx) = active.get(id) {
        let _ = tx.send(true);
    } else {
        let mut cancelled = state
            .cancelled
            .lock()
            .map_err(|_| error("internal", "Native transport unavailable."))?;
        cancelled.retain(|_, time| time.elapsed() < Duration::from_secs(60));
        if cancelled.len() < 128 {
            cancelled.insert(id.to_owned(), Instant::now());
        }
    }
    Ok(())
}
fn configured_client(url: &Url, network: Option<&NetworkSettings>) -> Result<Client, NativeError> {
    let mut builder = Client::builder().redirect(Policy::none()).no_proxy();
    if let Some(settings) = network {
        if settings.origin != url.origin().ascii_serialization() {
            return Err(error(
                "network_settings",
                "Destination changed. Review network settings.",
            ));
        }
        if !settings.verify_tls {
            if !settings.insecure_confirmed {
                return Err(error(
                    "network_settings",
                    "Explicit TLS confirmation is required.",
                ));
            }
            builder = builder
                .danger_accept_invalid_certs(true)
                .danger_accept_invalid_hostnames(true);
        }
        if !settings.ca_pem.is_empty() {
            if settings.ca_pem.len() > 128 * 1024 || settings.ca_pem.contains("PRIVATE KEY") {
                return Err(error("network_settings", "Invalid CA certificate bundle."));
            }
            let certs = reqwest::Certificate::from_pem_bundle(settings.ca_pem.as_bytes())
                .map_err(|_| error("network_settings", "Invalid CA certificate PEM."))?;
            if certs.is_empty() || certs.len() > 16 {
                return Err(error("network_settings", "Use 1–16 CA certificates."));
            }
            for cert in certs {
                builder = builder.add_root_certificate(cert);
            }
        }
        if settings.proxy_username.len() > 65536
            || settings.proxy_password.len() > 65536
            || settings.proxy_username.contains(['\r', '\n'])
            || settings.proxy_password.contains(['\r', '\n'])
        {
            return Err(error("network_settings", "Invalid proxy credentials."));
        }
        if !settings.proxy_url.is_empty() {
            let proxy = Url::parse(&settings.proxy_url)
                .map_err(|_| error("network_settings", "Invalid HTTP(S) proxy URL."))?;
            if !matches!(proxy.scheme(), "http" | "https")
                || !proxy.username().is_empty()
                || proxy.password().is_some()
                || proxy.path() != "/"
                || proxy.query().is_some()
                || proxy.fragment().is_some()
            {
                return Err(error(
                    "network_settings",
                    "Use a proxy host and port without embedded credentials or paths.",
                ));
            }
            let mut config = reqwest::Proxy::all(proxy.as_str())
                .map_err(|_| error("network_settings", "Invalid proxy URL."))?;
            if !settings.proxy_username.is_empty() || !settings.proxy_password.is_empty() {
                config = config.basic_auth(&settings.proxy_username, &settings.proxy_password);
            }
            builder = builder.proxy(config);
        } else if !settings.proxy_username.is_empty() || !settings.proxy_password.is_empty() {
            return Err(error(
                "network_settings",
                "Proxy credentials require a proxy URL.",
            ));
        }
    }
    builder.build().map_err(|_| {
        error(
            "network_settings",
            "Could not initialize the reviewed TLS/proxy settings.",
        )
    })
}
async fn execute(request: NativeRequest) -> Result<NativeResponse, NativeError> {
    let started = Instant::now();
    let url = Url::parse(&request.url)
        .map_err(|_| error("validation", "Use a valid HTTP or HTTPS URL."))?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(error(
            "validation",
            "Use HTTP(S) without credentials embedded in the URL.",
        ));
    }
    if !["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
        .contains(&request.method.as_str())
    {
        return Err(error("validation", "Unsupported HTTP method."));
    }
    if request.headers.len() > 200 {
        return Err(error("limit", "Use at most 200 request headers."));
    }
    let mut headers = HeaderMap::new();
    let mut header_size = 0;
    for (key, value) in request.headers {
        header_size += key.len() + value.len();
        if header_size > 128 * 1024 {
            return Err(error("limit", "Request headers exceed 128 KiB."));
        }
        if [
            "content-length",
            "transfer-encoding",
            "connection",
            "upgrade",
            "proxy-authorization",
            "proxy-connection",
        ]
        .contains(&key.to_ascii_lowercase().as_str())
        {
            return Err(error(
                "validation",
                "This header is managed by the native transport.",
            ));
        }
        let name = HeaderName::from_bytes(key.as_bytes())
            .map_err(|_| error("validation", "Invalid HTTP header name."))?;
        let value = HeaderValue::from_str(&value)
            .map_err(|_| error("validation", "Invalid HTTP header value."))?;
        headers.append(name, value);
    }
    let mut body = Vec::new();
    if let Some(encoded) = request.body_base64 {
        if encoded.len() > LIMIT.div_ceil(3) * 4 {
            return Err(error("size", "Request body exceeds 20 MiB."));
        }
        body = STANDARD
            .decode(encoded)
            .map_err(|_| error("validation", "Invalid request body encoding."))?;
        if body.len() > LIMIT {
            return Err(error("size", "Request body exceeds 20 MiB."));
        }
    }
    let client = configured_client(&url, request.network.as_ref())?;
    let method = Method::from_bytes(request.method.as_bytes())
        .map_err(|_| error("validation", "Invalid HTTP method."))?;
    let mut builder = client
        .request(method, url)
        .headers(headers)
        .timeout(Duration::from_millis(request.timeout_ms.clamp(100, 120000)));
    if !["GET", "HEAD"].contains(&request.method.as_str()) {
        builder = builder.body(body);
    }
    let mut response = builder.send().await.map_err(network_error)?;
    let headers_ms = started.elapsed().as_secs_f64() * 1000.;
    let status = response.status();
    let response_headers = response
        .headers()
        .iter()
        .map(|(k, v)| {
            (
                k.to_string(),
                String::from_utf8_lossy(v.as_bytes()).into_owned(),
            )
        })
        .collect();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_owned();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        if bytes.len() + chunk.len() > LIMIT {
            return Err(error("size", "Response exceeds the 20 MiB receive limit."));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(NativeResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_owned(),
        headers: response_headers,
        body_base64: STANDARD.encode(&bytes),
        size: bytes.len(),
        total_ms: started.elapsed().as_secs_f64() * 1000.,
        headers_ms,
        content_type,
    })
}
async fn send(request: NativeRequest, state: &ApiHttpState) -> Result<NativeResponse, NativeError> {
    let (_guard, mut cancel) = register(state, &request.request_id)?;
    tokio::select! {biased;
        _=cancel.changed()=>Err(error("cancelled","Request cancelled. The server may still have processed it.")),
        result=execute(request)=>result,
    }
}
#[tauri::command]
pub async fn api_http_request(
    request: NativeRequest,
    state: State<'_, ApiHttpState>,
) -> Result<NativeResponse, NativeError> {
    send(request, state.inner()).await
}
#[tauri::command]
pub fn api_http_cancel(
    request_id: String,
    state: State<'_, ApiHttpState>,
) -> Result<(), NativeError> {
    cancel(state.inner(), &request_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    fn request(url: String) -> NativeRequest {
        NativeRequest {
            request_id: "test-request".into(),
            url,
            method: "POST".into(),
            headers: vec![(
                "Content-Type".into(),
                "application/x-www-form-urlencoded".into(),
            )],
            body_base64: Some(STANDARD.encode("grant_type=client_credentials")),
            timeout_ms: 2000,
            network: None,
        }
    }
    async fn fixture(
        status: &str,
        extra: &str,
        body: &[u8],
    ) -> (String, tokio::task::JoinHandle<Vec<u8>>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/token", listener.local_addr().unwrap());
        let response = [
            format!(
                "HTTP/1.1 {}\r\nContent-Length: {}\r\nConnection: close\r\n{}\r\n",
                status,
                body.len(),
                extra
            )
            .into_bytes(),
            body.to_vec(),
        ]
        .concat();
        let handle = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut input = Vec::new();
            loop {
                let mut chunk = [0; 4096];
                let count = stream.read(&mut chunk).await.unwrap();
                if count == 0 {
                    break;
                }
                input.extend_from_slice(&chunk[..count]);
                if let Some(end) = input.windows(4).position(|w| w == b"\r\n\r\n") {
                    let header = String::from_utf8_lossy(&input[..end]);
                    let length = header
                        .lines()
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .and_then(|v| v.trim().parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if input.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            let _ = stream.write_all(&response).await;
            input
        });
        (url, handle)
    }
    #[tokio::test]
    async fn raw_error_without_cors_and_binary_bytes() {
        let (url, server) = fixture(
            "400 Bad Request",
            "Content-Type: application/octet-stream\r\nSet-Cookie: native=test\r\n",
            &[0, 255, 1],
        )
        .await;
        let response = send(request(url), &ApiHttpState::default()).await.unwrap();
        assert_eq!(response.status, 400);
        assert_eq!(
            STANDARD.decode(response.body_base64).unwrap(),
            vec![0, 255, 1]
        );
        assert!(response.headers.iter().any(|(k, _)| k == "set-cookie"));
        let input = String::from_utf8_lossy(&server.await.unwrap()).into_owned();
        assert!(input.contains("grant_type=client_credentials"));
        assert!(!input.to_lowercase().contains("origin:"));
    }
    #[tokio::test]
    async fn redirects_are_returned_without_following() {
        let (url, server) = fixture(
            "302 Found",
            "Location: http://127.0.0.1:1/forbidden\r\n",
            b"",
        )
        .await;
        assert_eq!(
            send(request(url), &ApiHttpState::default())
                .await
                .unwrap()
                .status,
            302
        );
        server.await.unwrap();
    }
    #[tokio::test]
    async fn validates_and_cancels_before_start() {
        let state = ApiHttpState::default();
        cancel(&state, "test-request").unwrap();
        assert_eq!(
            send(request("http://127.0.0.1:1/".into()), &state)
                .await
                .unwrap_err()
                .code,
            "cancelled"
        );
        assert_eq!(
            send(request("file:///etc/passwd".into()), &state)
                .await
                .unwrap_err()
                .code,
            "validation"
        );
        assert!(state.active.lock().unwrap().is_empty());
    }
    #[tokio::test]
    async fn cancellation_drops_in_flight_io() {
        let state = ApiHttpState::default();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let req = request(format!("http://{}/", listener.local_addr().unwrap()));
        let run = send(req, &state);
        let cancel_run = async {
            listener.accept().await.unwrap();
            cancel(&state, "test-request").unwrap();
        };
        let (result, _) = tokio::join!(run, cancel_run);
        assert_eq!(result.unwrap_err().code, "cancelled");
        assert!(state.active.lock().unwrap().is_empty());
    }
    #[test]
    fn native_concurrency_is_bounded_and_released() {
        let state = ApiHttpState::default();
        let mut guards = Vec::new();
        for i in 0..4 {
            guards.push(register(&state, &format!("test-{}", i)).unwrap());
        }
        assert_eq!(register(&state, "fifth").err().unwrap().code, "limit");
        guards.clear();
        assert!(state.active.lock().unwrap().is_empty());
        assert!(register(&state, "next").is_ok());
    }
    #[tokio::test]
    async fn timeout_covers_waiting_for_response() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut req = request(format!("http://{}/", listener.local_addr().unwrap()));
        req.timeout_ms = 100;
        let server = tokio::spawn(async move {
            let (_socket, _) = listener.accept().await.unwrap();
            tokio::time::sleep(Duration::from_millis(400)).await;
        });
        let state = ApiHttpState::default();
        assert_eq!(send(req, &state).await.unwrap_err().code, "timeout");
        assert!(state.active.lock().unwrap().is_empty());
        server.await.unwrap();
    }
    #[tokio::test]
    async fn response_size_is_bounded() {
        let (url, server) = fixture("200 OK", "", &vec![b'x'; LIMIT + 1]).await;
        assert_eq!(
            send(request(url), &ApiHttpState::default())
                .await
                .unwrap_err()
                .code,
            "size"
        );
        let _ = server.await;
    }
    fn settings(origin: String) -> NetworkSettings {
        NetworkSettings {
            origin,
            verify_tls: true,
            ..Default::default()
        }
    }
    async fn tls_fixture() -> (String, tokio::task::JoinHandle<()>) {
        let identity = native_tls::Identity::from_pkcs8(
            include_bytes!("../tests/fixtures/localhost-test-cert.pem"),
            include_bytes!("../tests/fixtures/localhost-test-key.pem"),
        )
        .unwrap();
        let acceptor =
            tokio_native_tls::TlsAcceptor::from(native_tls::TlsAcceptor::new(identity).unwrap());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!(
            "https://localhost:{}/",
            listener.local_addr().unwrap().port()
        );
        let task = tokio::spawn(async move {
            let (socket, _) = listener.accept().await.unwrap();
            if let Ok(mut stream) = acceptor.accept(socket).await {
                let mut bytes = [0; 8192];
                let _ = stream.read(&mut bytes).await;
                let _ = stream
                    .write_all(
                        b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK",
                    )
                    .await;
            }
        });
        (url, task)
    }
    #[tokio::test]
    async fn tls_verification_is_default_and_custom_ca_is_request_scoped() {
        let (url, server) = tls_fixture().await;
        let mut req = request(url);
        req.timeout_ms = 5000;
        assert!(send(req, &ApiHttpState::default()).await.is_err());
        server.await.unwrap();
        let (url, server) = tls_fixture().await;
        let origin = Url::parse(&url).unwrap().origin().ascii_serialization();
        let mut network = settings(origin);
        network.ca_pem = include_str!("../tests/fixtures/localhost-test-ca.pem").to_owned();
        let mut req = request(url);
        req.timeout_ms = 5000;
        req.network = Some(network);
        assert_eq!(
            send(req, &ApiHttpState::default()).await.unwrap().status,
            200
        );
        server.await.unwrap();
        let (url, server) = tls_fixture().await;
        let mut req = request(url);
        req.timeout_ms = 5000;
        assert!(send(req, &ApiHttpState::default()).await.is_err());
        server.await.unwrap();
    }
    #[tokio::test]
    async fn insecure_tls_requires_explicit_confirmation_and_origin() {
        let url = Url::parse("https://localhost:4443/").unwrap();
        let mut network = settings(url.origin().ascii_serialization());
        network.verify_tls = false;
        assert!(configured_client(&url, Some(&network)).is_err());
        network.insecure_confirmed = true;
        assert!(configured_client(&url, Some(&network)).is_ok());
        network.origin = "https://other.invalid".into();
        assert!(configured_client(&url, Some(&network)).is_err());
        let (url, server) = tls_fixture().await;
        network.origin = Url::parse(&url).unwrap().origin().ascii_serialization();
        let mut req = request(url);
        req.network = Some(network);
        req.timeout_ms = 5000;
        assert_eq!(
            send(req, &ApiHttpState::default()).await.unwrap().status,
            200
        );
        server.await.unwrap();
    }
    #[tokio::test]
    async fn explicit_proxy_receives_request_and_auth_without_target_dns() {
        let (proxy, server) = fixture("200 OK", "", b"OK").await;
        let mut req = request("http://does-not-resolve.invalid/token".into());
        let mut network = settings("http://does-not-resolve.invalid".into());
        network.proxy_url = proxy.trim_end_matches("/token").to_owned();
        network.proxy_username = "synthetic".into();
        network.proxy_password = "proxy-secret".into();
        req.network = Some(network);
        assert_eq!(
            send(req, &ApiHttpState::default()).await.unwrap().status,
            200
        );
        let raw = String::from_utf8(server.await.unwrap()).unwrap();
        assert!(raw.starts_with("POST http://does-not-resolve.invalid/token HTTP/1.1"));
        assert!(raw.to_lowercase().contains("proxy-authorization: basic "));
    }
    #[test]
    fn rejects_private_keys_and_proxy_credential_urls() {
        let url = Url::parse("https://example.test/").unwrap();
        let mut network = settings("https://example.test".into());
        network.ca_pem = "-----BEGIN PRIVATE KEY-----".into();
        assert!(configured_client(&url, Some(&network)).is_err());
        network.ca_pem.clear();
        network.proxy_url = "http://user:secret@localhost:8080".into();
        assert!(configured_client(&url, Some(&network)).is_err());
    }
    #[tokio::test]
    async fn https_proxy_connect_tunnels_with_verified_custom_ca() {
        let (url, tls_server) = tls_fixture().await;
        let port = Url::parse(&url).unwrap().port().unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let proxy_url = format!("http://{}", listener.local_addr().unwrap());
        let proxy = tokio::spawn(async move {
            let (mut downstream, _) = listener.accept().await.unwrap();
            let mut header = Vec::new();
            loop {
                let mut byte = [0; 1];
                downstream.read_exact(&mut byte).await.unwrap();
                header.push(byte[0]);
                if header.ends_with(b"\r\n\r\n") {
                    break;
                }
                assert!(header.len() < 8192);
            }
            let text = String::from_utf8(header).unwrap();
            assert!(text.starts_with(&format!("CONNECT localhost:{} HTTP/1.1", port)));
            assert!(text.to_lowercase().contains("proxy-authorization: basic "));
            let mut upstream = tokio::net::TcpStream::connect(("127.0.0.1", port))
                .await
                .unwrap();
            downstream
                .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                .await
                .unwrap();
            let _ = tokio::io::copy_bidirectional(&mut downstream, &mut upstream).await;
        });
        let mut network = settings(Url::parse(&url).unwrap().origin().ascii_serialization());
        network.ca_pem = include_str!("../tests/fixtures/localhost-test-ca.pem").into();
        network.proxy_url = proxy_url;
        network.proxy_username = "synthetic".into();
        network.proxy_password = "synthetic-password".into();
        let mut req = request(url);
        req.network = Some(network);
        req.timeout_ms = 5000;
        assert_eq!(
            send(req, &ApiHttpState::default()).await.unwrap().status,
            200
        );
        tls_server.await.unwrap();
        proxy.await.unwrap();
    }
}
