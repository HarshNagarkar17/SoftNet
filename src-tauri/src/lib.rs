mod http;

use futures_util::future::{abortable, AbortHandle};
use http::{build_client, execute, HttpResult, OutgoingRequest};
use reqwest::Client;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{AboutMetadata, Menu, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager, State};

struct AppState {
    client: Client,
    inflight: Mutex<HashMap<String, AbortHandle>>,
}

#[tauri::command]
async fn send_http(
    state: State<'_, AppState>,
    request: OutgoingRequest,
    request_id: String,
) -> Result<HttpResult, String> {
    let client = state.client.clone();
    let (future, handle) = abortable(async move { execute(&client, request).await });
    state
        .inflight
        .lock()
        .unwrap()
        .insert(request_id.clone(), handle);
    let outcome = future.await;
    state.inflight.lock().unwrap().remove(&request_id);
    outcome.unwrap_or_else(|_| Err("Request cancelled.".into()))
}

#[tauri::command]
fn cancel_http(state: State<'_, AppState>, request_id: String) {
    if let Some(handle) = state.inflight.lock().unwrap().remove(&request_id) {
        handle.abort();
    }
}

fn valid_store_name(name: &str) -> Result<(), String> {
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        Err("Invalid store name.".into())
    } else {
        Ok(())
    }
}

fn looks_like_project(dir: &std::path::Path) -> bool {
    dir.join("package.json").is_file() && dir.join("src-tauri").is_dir()
}

fn walk_to_project(start: PathBuf) -> Option<PathBuf> {
    let mut dir = start;
    // The bundled app sits many levels under the repo:
    // SoftNet.app/Contents/MacOS -> macos -> bundle -> release -> target -> src-tauri.
    for _ in 0..16 {
        if looks_like_project(&dir) {
            return Some(dir);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
}

/// Project root when the app is running from this repo.
/// A Finder launch uses `/` as the working directory, so the fallback is the home directory.
fn data_root() -> PathBuf {
    if let Ok(root) = std::env::var("SOFTNET_ROOT") {
        if !root.is_empty() {
            return PathBuf::from(root);
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        if let Some(found) = walk_to_project(cwd) {
            return found;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if let Some(found) = walk_to_project(dir.to_path_buf()) {
                return found;
            }
        }
    }
    home_dir().unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

fn store_path(name: &str) -> Result<PathBuf, String> {
    valid_store_name(name)?;
    Ok(data_root().join(".softnet").join(format!("{name}.json")))
}

fn legacy_store_path(app: &AppHandle, name: &str) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join(format!("{name}.json")))
}

fn read_optional(path: &PathBuf) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Could not read {}: {error}", path.display())),
    }
}

#[tauri::command]
async fn load_store(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = store_path(&name)?;
    if let Some(contents) = read_optional(&path)? {
        return Ok(Some(contents));
    }
    if let Some(legacy) = legacy_store_path(&app, &name) {
        return read_optional(&legacy);
    }
    Ok(None)
}

#[tauri::command]
async fn save_store(_app: AppHandle, name: String, contents: String) -> Result<(), String> {
    let path = store_path(&name)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|error| format!("Could not create {}: {error}", dir.display()))?;
    }
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, contents).map_err(|error| format!("Could not write {}: {error}", temp.display()))?;
    fs::rename(&temp, &path).map_err(|error| format!("Could not save {}: {error}", path.display()))
}

fn install_menu(app: &AppHandle) -> tauri::Result<()> {
    let pkg = app.package_info();
    let about = AboutMetadata {
        name: Some(pkg.name.clone()),
        version: Some(pkg.version.to_string()),
        ..Default::default()
    };
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
        ],
    )?;

    #[cfg(target_os = "macos")]
    let menu = Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                pkg.name.clone(),
                true,
                &[
                    &PredefinedMenuItem::about(app, None, Some(about))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?,
            &edit,
            &Submenu::with_items(app, "View", true, &[&PredefinedMenuItem::fullscreen(app, None)?])?,
            &window,
        ],
    )?;

    #[cfg(not(target_os = "macos"))]
    let menu = Menu::with_items(
        app,
        &[
            &Submenu::with_items(app, "File", true, &[&PredefinedMenuItem::quit(app, None)?])?,
            &edit,
            &window,
        ],
    )?;

    app.set_menu(menu)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            install_menu(app.handle())?;
            let dir = data_root().join(".softnet");
            fs::create_dir_all(&dir).map_err(|error| {
                std::io::Error::new(error.kind(), format!("Could not create {}: {error}", dir.display()))
            })?;
            Ok(())
        })
        .manage(AppState {
            client: build_client(Duration::from_secs(30)),
            inflight: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![send_http, cancel_http, load_store, save_store])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
