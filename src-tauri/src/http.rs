use futures_util::StreamExt;
use reqwest::header::{HeaderName, HeaderValue};
use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

pub const MAX_BODY_BYTES: usize = 5 * 1024 * 1024;

pub fn build_client(timeout: Duration) -> Client {
    Client::builder()
        .timeout(timeout)
        .connect_timeout(Duration::from_secs(10).min(timeout))
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent("SoftNet/1.0.0")
        .build()
        .expect("HTTP client")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutgoingRequest {
    pub method: String,
    pub url: String,
    pub headers: Vec<OutgoingHeader>,
    pub body: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct OutgoingHeader {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HttpResult {
    pub status: u16,
    pub status_text: String,
    pub final_url: String,
    pub headers: Vec<ResponseHeader>,
    pub body: String,
    pub binary: bool,
    pub truncated: bool,
    pub time_ms: u64,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ResponseHeader {
    pub key: String,
    pub value: String,
}

pub fn describe_error(err: &reqwest::Error) -> String {
    if err.is_timeout() {
        return "The request timed out.".into();
    }
    if err.is_redirect() {
        return "Stopped after 10 redirects.".into();
    }

    let message = err.to_string();
    let lower = message.to_lowercase();
    if lower.contains("certificate") || lower.contains("tls") || lower.contains("ssl") {
        return format!("The TLS certificate could not be verified. {message}");
    }
    if err.is_connect() {
        return format!("Could not connect to the server. {message}");
    }
    if err.is_builder() || err.is_request() {
        return format!("The request could not be sent. {message}");
    }
    format!("The request failed. {message}")
}

pub fn interpret_body(bytes: &[u8]) -> (String, bool) {
    match std::str::from_utf8(bytes) {
        Ok(text) => (text.to_string(), false),
        Err(_) => (
            "This response is not text, so SoftNet did not display the bytes.".into(),
            true,
        ),
    }
}

pub async fn execute(client: &Client, request: OutgoingRequest) -> Result<HttpResult, String> {
    let url = request.url.trim();
    if url.is_empty() {
        return Err("Enter a URL.".into());
    }
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Enter a URL that starts with http:// or https://.".into());
    }
    let parsed = reqwest::Url::parse(url).map_err(|_| "That URL is not valid.".to_string())?;
    if parsed.host_str().is_none() {
        return Err("That URL is not valid.".into());
    }

    let method = Method::from_bytes(request.method.as_bytes()).map_err(|_| {
        format!(
            "SoftNet does not support the {} method.",
            request.method
        )
    })?;

    let mut builder = client.request(method, parsed);
    for header in &request.headers {
        let name = header.key.trim();
        if name.is_empty() {
            continue;
        }
        let header_name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| format!("Header name \"{name}\" is not valid."))?;
        let header_value = HeaderValue::from_str(&header.value)
            .map_err(|_| format!("Header \"{name}\" has a value SoftNet cannot send."))?;
        builder = builder.header(header_name, header_value);
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }

    let started = Instant::now();
    let response = builder.send().await.map_err(|err| describe_error(&err))?;
    let status = response.status();
    let final_url = response.url().to_string();
    let content_length = response.content_length();
    let headers = response
        .headers()
        .iter()
        .map(|(name, value)| ResponseHeader {
            key: name.as_str().to_string(),
            value: String::from_utf8_lossy(value.as_bytes()).into_owned(),
        })
        .collect();

    let mut buf = Vec::new();
    let mut truncated = false;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|err| describe_error(&err))?;
        if buf.len() >= MAX_BODY_BYTES {
            truncated = true;
            break;
        }
        let room = MAX_BODY_BYTES - buf.len();
        if chunk.len() > room {
            buf.extend_from_slice(&chunk[..room]);
            truncated = true;
            break;
        }
        buf.extend_from_slice(&chunk);
    }

    let (body, binary) = interpret_body(&buf);
    let size_bytes = if truncated {
        content_length.unwrap_or(buf.len() as u64).max(buf.len() as u64)
    } else {
        buf.len() as u64
    };

    Ok(HttpResult {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        final_url,
        headers,
        body,
        binary,
        truncated,
        time_ms: started.elapsed().as_millis() as u64,
        size_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;
    use std::time::Duration;

    fn serve_once(response: Vec<u8>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0_u8; 4096];
            let _ = stream.read(&mut buf);
            let _ = stream.write_all(&response);
        });
        format!("http://{addr}/item")
    }

    fn http_response(status_line: &str, extra_headers: &str, body: &[u8]) -> Vec<u8> {
        let head = format!(
            "HTTP/1.1 {status_line}\r\n{extra_headers}Content-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        let mut bytes = head.into_bytes();
        bytes.extend_from_slice(body);
        bytes
    }

    fn get(url: String) -> OutgoingRequest {
        OutgoingRequest {
            method: "GET".into(),
            url,
            headers: vec![],
            body: None,
        }
    }

    #[tokio::test]
    async fn sends_a_post_body() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = vec![0_u8; 8192];
            let n = stream.read(&mut buf).unwrap();
            let received = String::from_utf8_lossy(&buf[..n]).to_string();
            let response = http_response(
                "200 OK",
                "Content-Type: application/json\r\n",
                br#"{"ok":true}"#,
            );
            let _ = stream.write_all(&response);
            received
        });

        let client = build_client(Duration::from_secs(5));
        let result = execute(
            &client,
            OutgoingRequest {
                method: "POST".into(),
                url: format!("http://{addr}/users"),
                headers: vec![OutgoingHeader {
                    key: "Content-Type".into(),
                    value: "application/json".into(),
                }],
                body: Some(r#"{"name":"Ada"}"#.into()),
            },
        )
        .await
        .unwrap();

        let received = handle.join().unwrap();
        assert!(received.starts_with("POST /users HTTP/1.1"), "{received}");
        assert!(received.contains(r#"{"name":"Ada"}"#), "{received}");
        assert_eq!(result.status, 200);
        assert_eq!(result.body, r#"{"ok":true}"#);
    }

    #[tokio::test]
    async fn returns_status_body_and_headers() {
        let body = br#"{"ok":true}"#;
        let url = serve_once(http_response(
            "201 Created",
            "Content-Type: application/json\r\nX-Softnet: yes\r\n",
            body,
        ));
        let client = build_client(Duration::from_secs(5));
        let result = execute(&client, get(url)).await.unwrap();

        assert_eq!(result.status, 201);
        assert_eq!(result.status_text, "Created");
        assert_eq!(result.body, r#"{"ok":true}"#);
        assert!(!result.binary);
        assert!(!result.truncated);
        assert_eq!(result.size_bytes, body.len() as u64);
        assert!(result
            .headers
            .iter()
            .any(|header| header.key == "x-softnet" && header.value == "yes"));
        assert!(result.final_url.contains("/item"));
    }

    #[tokio::test]
    async fn truncates_bodies_past_the_limit() {
        let mut body = vec![b'a'; MAX_BODY_BYTES + 128];
        let full_len = body.len();
        let url = serve_once(http_response("200 OK", "", &body));
        let client = build_client(Duration::from_secs(5));
        let result = execute(&client, get(url)).await.unwrap();

        body.truncate(MAX_BODY_BYTES);
        assert!(result.truncated);
        assert_eq!(result.body.len(), MAX_BODY_BYTES);
        assert_eq!(result.body, String::from_utf8(body).unwrap());
        assert_eq!(result.size_bytes, full_len as u64);
        assert!(!result.binary);
    }

    #[tokio::test]
    async fn reports_binary_responses() {
        let url = serve_once(http_response("200 OK", "", &[0xff, 0xfe, 0xfd]));
        let client = build_client(Duration::from_secs(5));
        let result = execute(&client, get(url)).await.unwrap();

        assert!(result.binary);
        assert!(result.body.contains("not text"));
        assert_eq!(result.size_bytes, 3);
    }

    #[tokio::test]
    async fn reports_timeouts() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0_u8; 1024];
            let _ = stream.read(&mut buf);
            thread::sleep(Duration::from_secs(2));
        });

        let client = build_client(Duration::from_millis(200));
        let error = execute(&client, get(format!("http://{addr}/slow")))
            .await
            .unwrap_err();
        assert!(error.contains("timed out"), "{error}");
    }

    #[tokio::test]
    async fn reports_connection_failures() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        drop(listener);

        let client = build_client(Duration::from_secs(2));
        let error = execute(&client, get(format!("http://{addr}/")))
            .await
            .unwrap_err();
        assert!(error.contains("Could not connect"), "{error}");
    }

    #[tokio::test]
    async fn rejects_urls_that_are_not_http() {
        let client = build_client(Duration::from_secs(2));
        let error = execute(
            &client,
            OutgoingRequest {
                method: "GET".into(),
                url: "ftp://example.com".into(),
                headers: vec![],
                body: None,
            },
        )
        .await
        .unwrap_err();
        assert!(error.contains("http://"), "{error}");
    }

    #[test]
    fn interpret_body_keeps_utf8() {
        let (text, binary) = interpret_body(b"hello");
        assert_eq!(text, "hello");
        assert!(!binary);
    }
}
