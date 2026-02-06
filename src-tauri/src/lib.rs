use std::process::{Command, Stdio};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use walkdir::WalkDir;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::sync::Arc;

// PDF Print Options
#[derive(Debug, Serialize, Deserialize)]
struct PrintPdfOptions {
    path: String,
    remove_after_print: bool,
    printer_name: Option<String>,
}

// Terminal shell process management with PTY
#[allow(dead_code)]
struct ShellProcess {
    pty_pair: Arc<Mutex<portable_pty::PtyPair>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    output_receiver: Arc<Mutex<Receiver<String>>>,
    child_pid: Option<u32>, // Store child PID for sending signals
}

// Global state for terminal shells
struct TerminalState {
    shells: Mutex<HashMap<u32, ShellProcess>>,
}

#[derive(Default)]
struct FileOpenState {
    pending: Mutex<Vec<String>>,
}

struct RecentFilesState {
    files: Mutex<Vec<String>>,
    store_path: PathBuf,
}

#[cfg(target_os = "macos")]
#[allow(unexpected_cfgs)]
mod macos_bookmarks {
    use base64::Engine;
    use cocoa::base::{id, nil};
    use cocoa::foundation::{NSData, NSString, NSUInteger, NSURL};
    use objc::runtime::BOOL;
    use objc::{msg_send, sel, sel_impl};
    use serde::{Deserialize, Serialize};
    use std::collections::HashMap;
    use std::fs;
    use std::path::PathBuf;
    use tauri::Manager;

    const BOOKMARK_SECURITY_SCOPE: usize = 1 << 11;
    const BOOKMARK_READ_ONLY: usize = 1 << 12;
    const RESOLVE_SECURITY_SCOPE: usize = 1 << 10;

    #[derive(Serialize, Deserialize, Default)]
    struct BookmarkStore {
        bookmarks: HashMap<String, String>,
    }

    fn store_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
        app_handle
            .path()
            .app_data_dir()
            .map(|p| p.join("security-bookmarks.json"))
            .map_err(|e| format!("Failed to resolve app data dir: {}", e))
    }

    fn load_store(app_handle: &tauri::AppHandle) -> Result<BookmarkStore, String> {
        let path = store_path(app_handle)?;
        if !path.exists() {
            return Ok(BookmarkStore::default());
        }
        let data = fs::read_to_string(&path).map_err(|e| format!("Failed to read bookmark store: {}", e))?;
        serde_json::from_str(&data).map_err(|e| format!("Failed to parse bookmark store: {}", e))
    }

    fn save_store(app_handle: &tauri::AppHandle, store: &BookmarkStore) -> Result<(), String> {
        let path = store_path(app_handle)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create bookmark dir: {}", e))?;
        }
        let data = serde_json::to_string_pretty(store).map_err(|e| format!("Failed to encode bookmark store: {}", e))?;
        fs::write(&path, data).map_err(|e| format!("Failed to write bookmark store: {}", e))
    }

    fn remove_bookmark(app_handle: &tauri::AppHandle, path: &str) -> Result<(), String> {
        let mut store = load_store(app_handle)?;
        if store.bookmarks.remove(path).is_some() {
            save_store(app_handle, &store)?;
        }
        Ok(())
    }

    fn create_bookmark(path: &str) -> Result<Vec<u8>, String> {
        unsafe {
            let ns_path = NSString::alloc(nil).init_str(path);
            let url = NSURL::fileURLWithPath_(nil, ns_path);
            let mut error: id = nil;
            let options = BOOKMARK_SECURITY_SCOPE | BOOKMARK_READ_ONLY;
            let data: id = msg_send![
                url,
                bookmarkDataWithOptions: options
                includingResourceValuesForKeys: nil
                relativeToURL: nil
                error: &mut error
            ];
            if data == nil {
                return Err("Failed to create security-scoped bookmark".to_string());
            }
            let bytes: *const u8 = msg_send![data, bytes];
            let length: usize = msg_send![data, length];
            Ok(std::slice::from_raw_parts(bytes, length).to_vec())
        }
    }

    fn resolve_bookmark(data: &[u8]) -> Result<id, String> {
        unsafe {
            let ns_data =
                NSData::dataWithBytes_length_(nil, data.as_ptr() as *const _, data.len() as NSUInteger);
            let mut stale: BOOL = Default::default();
            let mut error: id = nil;
            let options = RESOLVE_SECURITY_SCOPE;
            let cls = objc::runtime::Class::get("NSURL")
                .ok_or_else(|| "Failed to resolve NSURL class".to_string())?;
            let url: id = msg_send![
                cls,
                URLByResolvingBookmarkData: ns_data
                options: options
                relativeToURL: nil
                bookmarkDataIsStale: &mut stale
                error: &mut error
            ];
            if url == nil {
                return Err("Failed to resolve security-scoped bookmark".to_string());
            }
            Ok(url)
        }
    }

    pub fn store_bookmark(app_handle: &tauri::AppHandle, path: &str) -> Result<bool, String> {
        let mut store = load_store(app_handle)?;
        if store.bookmarks.contains_key(path) {
            return Ok(true);
        }
        let bookmark = create_bookmark(path)?;
        store
            .bookmarks
            .insert(path.to_string(), base64::engine::general_purpose::STANDARD.encode(bookmark));
        save_store(app_handle, &store)?;
        Ok(true)
    }

    pub struct SecurityScopeGuard {
        url: id,
    }

    impl Drop for SecurityScopeGuard {
        fn drop(&mut self) {
            unsafe {
                let _: () = msg_send![self.url, stopAccessingSecurityScopedResource];
            }
        }
    }

    pub fn start_access(
        app_handle: &tauri::AppHandle,
        path: &str,
    ) -> Result<Option<SecurityScopeGuard>, String> {
        let store = load_store(app_handle)?;
        let Some(encoded) = store.bookmarks.get(path) else {
            return Ok(None);
        };
        let data = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|e| format!("Failed to decode bookmark: {}", e))?;
        let url = match resolve_bookmark(&data) {
            Ok(url) => url,
            Err(error) => {
                let _ = remove_bookmark(app_handle, path);
                return Err(error);
            }
        };
        unsafe {
            let started: BOOL = msg_send![url, startAccessingSecurityScopedResource];
            let zero: BOOL = Default::default();
            if started == zero {
                return Err("Failed to start security-scoped access".to_string());
            }
        }
        Ok(Some(SecurityScopeGuard { url }))
    }

    pub fn with_bookmark_access<T, F>(
        app_handle: &tauri::AppHandle,
        path: &str,
        action: F,
    ) -> Result<T, String>
    where
        F: FnOnce() -> Result<T, String>,
    {
        match start_access(app_handle, path) {
            Ok(_guard) => action(),
            Err(error) => {
                // Fall back to direct access; may still succeed if user granted access.
                match action() {
                    Ok(result) => Ok(result),
                    Err(_) => Err(error),
                }
            }
        }
    }
}

impl RecentFilesState {
    fn load(app_handle: &tauri::AppHandle) -> Self {
        let store_path = app_handle
            .path()
            .app_data_dir()
            .map(|p| p.join("recent-files.json"))
            .unwrap_or_else(|_| PathBuf::from("recent-files.json"));

        let files = if store_path.exists() {
            fs::read_to_string(&store_path)
                .ok()
                .and_then(|contents| serde_json::from_str::<Vec<String>>(&contents).ok())
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        RecentFilesState {
            files: Mutex::new(files),
            store_path,
        }
    }

    fn list(&self) -> Vec<String> {
        self.files
            .lock()
            .map(|f| f.clone())
            .unwrap_or_default()
    }

    fn save(&self) -> Result<(), String> {
        let files = self
            .files
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?
            .clone();
        if let Some(parent) = self.store_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create recent files dir: {}", e))?;
        }
        fs::write(&self.store_path, serde_json::to_string(&files).unwrap_or_default())
            .map_err(|e| format!("Failed to write recent files: {}", e))
    }

    fn add(&self, path: &str) -> Result<(bool, Vec<String>), String> {
        let mut files = self
            .files
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        let normalized = path.trim();
        if normalized.is_empty() {
            return Ok((false, files.clone()));
        }

        let needle = normalize_recent_path_for_compare(normalized);
        // Build a de-duplicated list using normalized comparison
        let mut new_list: Vec<String> = Vec::with_capacity(16);
        new_list.push(normalized.to_string());
        for existing in files.iter() {
            let existing_norm = normalize_recent_path_for_compare(existing);
            if existing_norm == needle {
                continue; // skip duplicates
            }
            new_list.push(existing.clone());
            if new_list.len() >= 15 {
                break;
            }
        }

        let changed = new_list != *files;
        if changed {
            *files = new_list;
        }
        Ok((changed, files.clone()))
    }

    fn clear(&self) -> Result<(), String> {
        let mut files = self
            .files
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        files.clear();
        Ok(())
    }

}

fn normalize_recent_path_for_compare(path: &str) -> String {
    let mut normalized = path.replace('\\', "/");
    if normalized.starts_with("//?/") {
        normalized = normalized.trim_start_matches("//?/").to_string();
    }
    while normalized.contains("//") {
        normalized = normalized.replace("//", "/");
    }
    if normalized.len() > 1 && normalized.ends_with('/') {
        normalized = normalized.trim_end_matches('/').to_string();
    }
    if cfg!(windows) {
        normalized = normalized.to_lowercase();
    }
    normalized
}

fn strip_extended_prefix(path: &str) -> String {
    if path.starts_with("\\\\?\\") {
        return path.trim_start_matches("\\\\?\\").to_string();
    }
    if path.starts_with("//?/") {
        return path.trim_start_matches("//?/").to_string();
    }
    path.to_string()
}

fn show_native_about(app: &tauri::AppHandle) {
    let pkg = app.package_info();
    let title = format!("About {}", pkg.name);
    let body = format!(
        "{}\nVersion: {}\nTauri: {}\nOS: {}\nArch: {}\n\nA powerful code, text editor & formatter with syntax highlighting, AI-assisted error fixing, and more.",
        pkg.name,
        pkg.version,
        tauri::VERSION,
        std::env::consts::OS,
        std::env::consts::ARCH
    );

    app.dialog()
        .message(body)
        .title(title)
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::Ok)
        .show(|_| {});
}

/// Get the user's home directory
#[tauri::command]
async fn get_home_directory() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}

/// Canonicalize a filesystem path (resolve symlinks/relative segments)
#[tauri::command]
async fn canonicalize_path(path: String) -> Result<String, String> {
    let pb = PathBuf::from(&path);
    fs::canonicalize(&pb)
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to canonicalize path {}: {}", path, e))
}

#[tauri::command]
async fn get_app_info(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let pkg = app.package_info();
    Ok(json!({
        "name": pkg.name.clone(),
        "version": pkg.version.to_string(),
        "tauriVersion": tauri::VERSION,
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH
    }))
}

#[tauri::command]
async fn record_recent_file(path: String, app: tauri::AppHandle, state: State<'_, RecentFilesState>) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed.starts_with("virtual:") {
        println!("[RecentFiles] Skipping non-persistable path: {}", trimmed);
        return Ok(());
    }

    let candidate = PathBuf::from(trimmed);
    if !candidate.exists() {
        println!("[RecentFiles] Skipping missing path: {}", trimmed);
        return Ok(());
    }

    // Canonicalize to keep list stable across variants
    let canonical = if let Ok(canon) = fs::canonicalize(&candidate) {
        strip_extended_prefix(&canon.to_string_lossy())
    } else {
        strip_extended_prefix(&candidate.to_string_lossy())
    };

    let inner = state.inner();
    let (changed, updated) = inner.add(&canonical)?;
    if !changed {
        println!("[RecentFiles] No change to recent list for {}", canonical);
        return Ok(());
    }

    inner.save()?;
    println!("[RecentFiles] Added: {}. Updated list: {:?}", canonical, updated);
    build_native_menu(&app, inner).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn remove_recent_file(path: String, app: tauri::AppHandle, state: State<'_, RecentFilesState>) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    let needle = normalize_recent_path_for_compare(trimmed);
    let inner = state.inner();
    {
        let mut files = inner
            .files
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        files.retain(|p| normalize_recent_path_for_compare(p) != needle);
    }
    inner.save()?;
    build_native_menu(&app, inner).map_err(|e| e.to_string())?;
    println!("[RecentFiles] Removed missing entry: {}", trimmed);
    Ok(())
}

#[tauri::command]
async fn take_pending_file_opens(state: State<'_, FileOpenState>) -> Result<Vec<String>, String> {
    let mut pending = state.pending.lock().map_err(|e| format!("Lock error: {}", e))?;
    let files = pending.drain(..).collect();
    Ok(files)
}

#[derive(Debug, Serialize, Deserialize)]
struct ErrorDetail {
    line: Option<u32>,
    column: Option<u32>,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ErrorDetails {
    #[serde(rename = "type")]
    error_type: String,
    message: String,
    #[serde(rename = "allErrors")]
    all_errors: Option<Vec<ErrorDetail>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: Option<u64>,
    modified: Option<u64>,
}

// File System Commands
#[tauri::command]
async fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let dir_path = PathBuf::from(&path);

    if !dir_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let mut entries = Vec::new();

    match fs::read_dir(&dir_path) {
        Ok(read_dir) => {
            for entry in read_dir {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    let metadata = entry.metadata().ok();

                    entries.push(FileEntry {
                        name: entry.file_name().to_string_lossy().to_string(),
                        path: path.to_string_lossy().to_string(),
                        is_dir: path.is_dir(),
                        size: metadata.as_ref().map(|m| m.len()),
                        modified: metadata.and_then(|m| {
                            m.modified().ok()
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs())
                        }),
                    });
                }
            }

            // Sort: directories first, then files, alphabetically
            entries.sort_by(|a, b| {
                match (a.is_dir, b.is_dir) {
                    (true, false) => std::cmp::Ordering::Less,
                    (false, true) => std::cmp::Ordering::Greater,
                    _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                }
            });

            Ok(entries)
        }
        Err(e) => Err(format!("Failed to read directory: {}", e)),
    }
}

#[tauri::command]
async fn create_file(path: String, content: String) -> Result<String, String> {
    let file_path = PathBuf::from(&path);

    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directories: {}", e))?;
    }

    fs::write(&file_path, content)
        .map_err(|e| format!("Failed to create file: {}", e))?;

    Ok(format!("File created: {}", path))
}

#[tauri::command]
async fn create_directory(path: String) -> Result<String, String> {
    let dir_path = PathBuf::from(&path);

    fs::create_dir_all(&dir_path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    Ok(format!("Directory created: {}", path))
}

#[tauri::command]
async fn delete_path(path: String) -> Result<String, String> {
    let target_path = PathBuf::from(&path);

    if !target_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if target_path.is_dir() {
        fs::remove_dir_all(&target_path)
            .map_err(|e| format!("Failed to delete directory: {}", e))?;
    } else {
        fs::remove_file(&target_path)
            .map_err(|e| format!("Failed to delete file: {}", e))?;
    }

    Ok(format!("Deleted: {}", path))
}

#[tauri::command]
async fn rename_path(old_path: String, new_path: String) -> Result<String, String> {
    let old = PathBuf::from(&old_path);
    let new = PathBuf::from(&new_path);

    if !old.exists() {
        return Err(format!("Source path does not exist: {}", old_path));
    }

    fs::rename(&old, &new)
        .map_err(|e| format!("Failed to rename: {}", e))?;

    Ok(format!("Renamed {} to {}", old_path, new_path))
}

#[tauri::command]
async fn get_file_stats(app_handle: tauri::AppHandle, path: String) -> Result<serde_json::Value, String> {
    let file_path = PathBuf::from(&path);

    if !file_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let metadata = {
        #[cfg(target_os = "macos")]
        {
            macos_bookmarks::with_bookmark_access(&app_handle, &path, || {
                fs::metadata(&file_path).map_err(|e| format!("Failed to get metadata: {}", e))
            })?
        }
        #[cfg(not(target_os = "macos"))]
        {
            fs::metadata(&file_path).map_err(|e| format!("Failed to get metadata: {}", e))?
        }
    };

    Ok(serde_json::json!({
        "path": path,
        "is_dir": metadata.is_dir(),
        "is_file": metadata.is_file(),
        "size": metadata.len(),
        "readonly": metadata.permissions().readonly(),
        "modified": metadata.modified().ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs()),
    }))
}

#[tauri::command]
async fn search_files(root_path: String, pattern: String, max_depth: Option<usize>) -> Result<Vec<String>, String> {
    let root = PathBuf::from(&root_path);

    if !root.exists() {
        return Err(format!("Path does not exist: {}", root_path));
    }

    let mut results = Vec::new();
    let walker = if let Some(depth) = max_depth {
        WalkDir::new(&root).max_depth(depth)
    } else {
        WalkDir::new(&root)
    };

    for entry in walker.into_iter().filter_map(|e| e.ok()) {
        if let Some(file_name) = entry.file_name().to_str() {
            if file_name.contains(&pattern) {
                results.push(entry.path().to_string_lossy().to_string());
            }
        }
    }

    Ok(results)
}

fn resolve_bundled_lsp(app_handle: &tauri::AppHandle, language: &str, server_command: &str) -> Option<String> {
    let resource_dir = app_handle
        .path()
        .resource_dir()
        .map(|p| std::path::PathBuf::from(p))
        .ok()?;

    let platform_dir = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };

    let mut candidate = resource_dir
        .join("lsp")
        .join(language)
        .join(platform_dir)
        .join(server_command);

    // Try .exe variant for Windows
    if cfg!(target_os = "windows") {
        let exe_path = candidate.with_extension("exe");
        if exe_path.exists() {
            candidate = exe_path;
        }
    }

    if candidate.exists() {
        return Some(candidate.to_string_lossy().to_string());
    }

    None
}

// Terminal Commands

/// Spawn a new shell process for a terminal with PTY
#[tauri::command]
async fn spawn_shell(terminal_id: u32, rows: u16, cols: u16, pixel_width: Option<u16>, pixel_height: Option<u16>, working_dir: Option<String>, state: State<'_, TerminalState>) -> Result<u32, String> {
    println!("[Terminal] Spawning PTY shell for terminal {} with size {}x{} (px {}x{})",
        terminal_id, cols, rows, pixel_width.unwrap_or(0), pixel_height.unwrap_or(0));
    println!("[Terminal] Received working_dir parameter: {:?}", working_dir);

    // Get the PTY system
    let pty_system = native_pty_system();

    // Create a new PTY with the correct size from the start
    let pty_pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: pixel_width.unwrap_or(0),
            pixel_height: pixel_height.unwrap_or(0),
        })
        .map_err(|e| format!("Failed to create PTY: {}", e))?;

    // Determine shell based on platform
    let shell_path = if cfg!(target_os = "windows") {
        "cmd.exe".to_string()
    } else {
        // Try to use user's default shell
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    };

    println!("[Terminal] Using shell: {}", shell_path);

    // Create command builder
    let mut cmd = CommandBuilder::new(&shell_path);

    // Set working directory with priority: working_dir parameter > HOME directory > fallback to "/"
    let cwd = if let Some(dir) = working_dir {
        let path = PathBuf::from(&dir);
        if path.exists() && path.is_dir() {
            println!("[Terminal] Using provided working directory: {:?}", path);
            path
        } else {
            println!("[Terminal] Provided directory {:?} doesn't exist, falling back to HOME", dir);
            if let Some(home) = std::env::var_os("HOME") {
                PathBuf::from(home)
            } else {
                PathBuf::from("/")
            }
        }
    } else {
        // No working_dir provided, use HOME directory
        if let Some(home) = std::env::var_os("HOME") {
            println!("[Terminal] Using HOME directory: {:?}", home);
            PathBuf::from(home)
        } else {
            println!("[Terminal] HOME not found, using root directory");
            PathBuf::from("/")
        }
    };
    println!("[Terminal] Final working directory: {:?}", cwd);
    cmd.cwd(cwd);

    // Set environment variables for proper terminal behavior
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    // Remove any pre-existing LINES/COLUMNS exported by the parent so shells/apps can't pick up stale values
    cmd.env_remove("LINES");
    cmd.env_remove("COLUMNS");
    println!("[Terminal] Set environment: TERM=xterm-256color, COLORTERM=truecolor (LINES/COLUMNS cleared)");

    // Spawn the command in the PTY
    let child = pty_pair.slave.spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    println!("[Terminal] PTY shell process spawned with PID: {:?}", child.process_id());

    // Get reader and writer
    let mut reader = pty_pair.master.try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;
    let writer = pty_pair.master.take_writer()
        .map_err(|e| format!("Failed to take writer: {}", e))?;

    // Create channel for output
    let (output_sender, output_receiver): (Sender<String>, Receiver<String>) = mpsc::channel();

    // Spawn background thread to read from PTY
    thread::spawn(move || {
        println!("[Terminal] Reader thread started for terminal {}", terminal_id);
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(n) if n > 0 => {
                    let output = String::from_utf8_lossy(&buffer[..n]).to_string();
                    println!("[Terminal] Reader thread got {} bytes for terminal {}: {:?}", n, terminal_id, &output[..std::cmp::min(50, output.len())]);
                    if output_sender.send(output).is_err() {
                        // Receiver dropped, exit thread
                        println!("[Terminal] Receiver dropped for terminal {}", terminal_id);
                        break;
                    }
                }
                Ok(_) => {
                    // EOF reached
                    println!("[Terminal] EOF reached for terminal {}", terminal_id);
                    break;
                }
                Err(e) => {
                    eprintln!("[Terminal] Read error for terminal {}: {}", terminal_id, e);
                    break;
                }
            }
        }
        println!("[Terminal] Reader thread exiting for terminal {}", terminal_id);
    });

    let process = ShellProcess {
        pty_pair: Arc::new(Mutex::new(pty_pair)),
        writer: Arc::new(Mutex::new(writer)),
        output_receiver: Arc::new(Mutex::new(output_receiver)),
        child_pid: child.process_id(),
    };

    // Store in state
    let mut shells = state.shells.lock().map_err(|e| format!("Lock error: {}", e))?;
    shells.insert(terminal_id, process);

    println!("[Terminal] PTY shell spawned successfully for terminal {}", terminal_id);

    // Send a newline to trigger the initial prompt
    std::thread::sleep(std::time::Duration::from_millis(100));
    if let Some(proc) = shells.get(&terminal_id) {
        if let Ok(mut w) = proc.writer.lock() {
            let _ = w.write_all(b"\n");
            let _ = w.flush();
            println!("[Terminal] Sent initial newline to trigger prompt");
        }
    }

    Ok(terminal_id)
}

/// Write data to shell PTY
#[tauri::command]
async fn write_to_shell(terminal_id: u32, data: String, state: State<'_, TerminalState>) -> Result<(), String> {
    let shells = state.shells.lock().map_err(|e| format!("Lock error: {}", e))?;

    if let Some(process) = shells.get(&terminal_id) {
        let mut writer = process.writer.lock().map_err(|e| format!("Writer lock error: {}", e))?;
        writer.write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        writer.flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        Ok(())
    } else {
        Err(format!("Terminal {} not found", terminal_id))
    }
}

/// Read output from shell PTY (non-blocking)
#[tauri::command]
async fn read_from_shell(terminal_id: u32, state: State<'_, TerminalState>) -> Result<String, String> {
    let shells = state.shells.lock().map_err(|e| format!("Lock error: {}", e))?;

    // Debug: Log available terminal IDs
    if !shells.contains_key(&terminal_id) {
        let available_ids: Vec<u32> = shells.keys().copied().collect();
        eprintln!("[Terminal] Terminal {} not found. Available terminals: {:?}", terminal_id, available_ids);
    }

    if let Some(process) = shells.get(&terminal_id) {
        let receiver = process.output_receiver.lock().map_err(|e| format!("Receiver lock error: {}", e))?;
        let mut output = String::new();

        // Try to receive all available messages without blocking
        loop {
            match receiver.try_recv() {
                Ok(data) => {
                    output.push_str(&data);
                }
                Err(std::sync::mpsc::TryRecvError::Empty) => {
                    // No more data available
                    break;
                }
                Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                    // Sender dropped, terminal closed
                    eprintln!("[Terminal] Channel disconnected for terminal {}", terminal_id);
                    break;
                }
            }
        }

        if !output.is_empty() {
            println!("[Terminal] Read {} bytes from terminal {}", output.len(), terminal_id);
        }

        Ok(output)
    } else {
        Err(format!("Terminal {} not found", terminal_id))
    }
}

/// Resize PTY terminal
#[tauri::command]
async fn resize_shell(terminal_id: u32, rows: u16, cols: u16, pixel_width: Option<u16>, pixel_height: Option<u16>, state: State<'_, TerminalState>) -> Result<(), String> {
    let shells = state.shells.lock().map_err(|e| format!("Lock error: {}", e))?;

    if let Some(process) = shells.get(&terminal_id) {
        let pty_pair = process.pty_pair.lock().map_err(|e| format!("PTY lock error: {}", e))?;
        pty_pair.master.resize(PtySize {
            rows,
            cols,
            pixel_width: pixel_width.unwrap_or(0),
            pixel_height: pixel_height.unwrap_or(0),
        }).map_err(|e| format!("Failed to resize PTY: {}", e))?;

        // portable-pty should send SIGWINCH automatically, but let's ensure it happens
        // by sending it to the process group manually on Unix systems
        #[cfg(target_family = "unix")]
        if let Some(pid) = process.child_pid {
            // Send SIGWINCH (signal 28 on most Unix systems) to the process group
            // Use negative PID to send to the process group
            unsafe {
                let result = libc::kill(-(pid as i32), libc::SIGWINCH);
                if result == 0 {
                    println!("[Terminal] Sent SIGWINCH to process group {}", pid);
                } else {
                    eprintln!("[Terminal] Failed to send SIGWINCH to process group {}: {}", pid, std::io::Error::last_os_error());
                }
            }
        }

        println!(
            "[Terminal] Resized terminal {} to {}x{} (px {}x{})",
            terminal_id,
            cols,
            rows,
            pixel_width.unwrap_or(0),
            pixel_height.unwrap_or(0)
        );
        Ok(())
    } else {
        Err(format!("Terminal {} not found", terminal_id))
    }
}

/// Kill a PTY shell process
#[tauri::command]
async fn kill_shell(terminal_id: u32, state: State<'_, TerminalState>) -> Result<(), String> {
    println!("[Terminal] Killing PTY shell for terminal {}", terminal_id);

    let mut shells = state.shells.lock().map_err(|e| format!("Lock error: {}", e))?;

    if shells.remove(&terminal_id).is_some() {
        println!("[Terminal] PTY shell removed for terminal {}", terminal_id);
        // PTY will be automatically cleaned up when dropped
        Ok(())
    } else {
        Err(format!("Terminal {} not found", terminal_id))
    }
}

// Check if Ollama is installed and running
#[tauri::command]
async fn check_ollama_status() -> Result<serde_json::Value, String> {
    // Try to run ollama list to check if it's installed
    let output = Command::new("ollama")
        .arg("list")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    match output {
        Ok(result) => {
            if result.status.success() {
                let stdout = String::from_utf8_lossy(&result.stdout);
                let models: Vec<String> = stdout
                    .lines()
                    .skip(1) // Skip header
                    .filter_map(|line| {
                        line.split_whitespace().next().map(|s| s.to_string())
                    })
                    .collect();

                Ok(serde_json::json!({
                    "available": true,
                    "models": models
                }))
            } else {
                Ok(serde_json::json!({
                    "available": false,
                    "models": []
                }))
            }
        }
        Err(_) => Ok(serde_json::json!({
            "available": false,
            "models": [],
            "error": "Ollama not installed"
        })),
    }
}

// Progress event payload for Ollama model download
#[derive(Clone, Serialize)]
struct OllamaPullProgress {
    model: String,
    status: String,         // "downloading", "verifying", "completed", "error"
    progress: f64,          // 0.0 to 100.0
    completed_bytes: u64,
    total_bytes: u64,
    speed: String,          // e.g., "15 MB/s"
    message: String,        // Human-readable status message
}

// Pull an Ollama model with streaming progress
#[tauri::command]
async fn pull_ollama_model(app: tauri::AppHandle, model: String) -> Result<String, String> {
    use std::io::BufRead;

    let mut child = Command::new("ollama")
        .args(&["pull", &model])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start ollama pull: {}", e))?;

    // Ollama outputs progress to stderr
    let stderr = child.stderr.take()
        .ok_or_else(|| "Failed to capture stderr".to_string())?;

    let model_clone = model.clone();
    let app_clone = app.clone();

    // Spawn a thread to read stderr and emit progress events
    let progress_thread = thread::spawn(move || {
        let reader = std::io::BufReader::new(stderr);

        for line in reader.lines() {
            if let Ok(line) = line {
                // Parse ollama pull output
                // Format examples:
                // "pulling manifest"
                // "pulling 8fbd8b2a7e50... 45% ▏██████████████                    ▏ 2.1 GB/4.7 GB  15 MB/s"
                // "verifying sha256 digest"
                // "writing manifest"
                // "success"

                let progress = parse_ollama_progress(&line);

                let event = OllamaPullProgress {
                    model: model_clone.clone(),
                    status: progress.status,
                    progress: progress.percentage,
                    completed_bytes: progress.completed_bytes,
                    total_bytes: progress.total_bytes,
                    speed: progress.speed,
                    message: line.clone(),
                };

                // Emit progress event to frontend
                let _ = app_clone.emit("ollama-pull-progress", event);
            }
        }
    });

    // Wait for the process to complete
    let status = child.wait()
        .map_err(|e| format!("Failed to wait for ollama: {}", e))?;

    // Wait for progress thread to finish
    let _ = progress_thread.join();

    if status.success() {
        // Emit completion event
        let completion = OllamaPullProgress {
            model: model.clone(),
            status: "completed".to_string(),
            progress: 100.0,
            completed_bytes: 0,
            total_bytes: 0,
            speed: "".to_string(),
            message: format!("Successfully pulled {}", model),
        };
        let _ = app.emit("ollama-pull-progress", completion);

        Ok(format!("Successfully pulled model: {}", model))
    } else {
        // Emit error event
        let error_event = OllamaPullProgress {
            model: model.clone(),
            status: "error".to_string(),
            progress: 0.0,
            completed_bytes: 0,
            total_bytes: 0,
            speed: "".to_string(),
            message: "Download failed".to_string(),
        };
        let _ = app.emit("ollama-pull-progress", error_event);

        Err(format!("Failed to pull model: {}", model))
    }
}

// Helper struct for parsed progress
struct ParsedProgress {
    status: String,
    percentage: f64,
    completed_bytes: u64,
    total_bytes: u64,
    speed: String,
}

// Parse ollama pull output line
fn parse_ollama_progress(line: &str) -> ParsedProgress {
    let line_lower = line.to_lowercase();

    // Check for specific status messages
    if line_lower.contains("pulling manifest") {
        return ParsedProgress {
            status: "downloading".to_string(),
            percentage: 0.0,
            completed_bytes: 0,
            total_bytes: 0,
            speed: "".to_string(),
        };
    }

    if line_lower.contains("verifying") {
        return ParsedProgress {
            status: "verifying".to_string(),
            percentage: 99.0,
            completed_bytes: 0,
            total_bytes: 0,
            speed: "".to_string(),
        };
    }

    if line_lower.contains("writing manifest") {
        return ParsedProgress {
            status: "verifying".to_string(),
            percentage: 99.5,
            completed_bytes: 0,
            total_bytes: 0,
            speed: "".to_string(),
        };
    }

    if line_lower.contains("success") {
        return ParsedProgress {
            status: "completed".to_string(),
            percentage: 100.0,
            completed_bytes: 0,
            total_bytes: 0,
            speed: "".to_string(),
        };
    }

    // Try to parse progress percentage (format: "pulling abc123... 45%")
    if let Some(pct_idx) = line.find('%') {
        // Find the number before the %
        let before_pct = &line[..pct_idx];
        let mut num_start = pct_idx;
        for (i, c) in before_pct.char_indices().rev() {
            if c.is_ascii_digit() || c == '.' {
                num_start = i;
            } else {
                break;
            }
        }

        if num_start < pct_idx {
            if let Ok(percentage) = before_pct[num_start..].trim().parse::<f64>() {
                // Try to parse bytes and speed
                // Format: "2.1 GB/4.7 GB  15 MB/s"
                let (completed_bytes, total_bytes) = parse_bytes(line);
                let speed = parse_speed(line);

                return ParsedProgress {
                    status: "downloading".to_string(),
                    percentage,
                    completed_bytes,
                    total_bytes,
                    speed,
                };
            }
        }
    }

    // Default fallback
    ParsedProgress {
        status: "downloading".to_string(),
        percentage: 0.0,
        completed_bytes: 0,
        total_bytes: 0,
        speed: "".to_string(),
    }
}

// Parse bytes from ollama output (e.g., "2.1 GB/4.7 GB")
fn parse_bytes(line: &str) -> (u64, u64) {
    // Look for pattern like "2.1 GB/4.7 GB"
    let re_pattern = regex_lite_match(line);
    re_pattern
}

// Simple regex-free parsing for bytes
fn regex_lite_match(line: &str) -> (u64, u64) {
    // Find the "/" that separates completed/total
    if let Some(slash_idx) = line.rfind('/') {
        // Look backwards for the completed bytes
        let before_slash = &line[..slash_idx];
        let after_slash = &line[slash_idx + 1..];

        if let Some(completed) = parse_size_string(before_slash) {
            if let Some(total) = parse_size_string(after_slash) {
                return (completed, total);
            }
        }
    }
    (0, 0)
}

// Parse a size string like "2.1 GB" into bytes
fn parse_size_string(s: &str) -> Option<u64> {
    let s = s.trim();

    // Find the last number and unit
    let units = ["GB", "MB", "KB", "B"];
    let multipliers: [u64; 4] = [1_000_000_000, 1_000_000, 1_000, 1];

    for (unit, mult) in units.iter().zip(multipliers.iter()) {
        if let Some(idx) = s.to_uppercase().rfind(unit) {
            // Get the number before the unit
            let num_part = s[..idx].trim();
            // Find the start of the number (going backwards from the end)
            let mut start = 0;
            for (i, c) in num_part.char_indices().rev() {
                if c.is_ascii_digit() || c == '.' {
                    start = i;
                } else if !c.is_whitespace() {
                    break;
                }
            }

            if let Ok(num) = num_part[start..].trim().parse::<f64>() {
                return Some((num * (*mult as f64)) as u64);
            }
        }
    }
    None
}

// Parse speed from ollama output (e.g., "15 MB/s")
fn parse_speed(line: &str) -> String {
    // Look for pattern like "15 MB/s" or "1.2 GB/s"
    let units = ["GB/s", "MB/s", "KB/s", "B/s"];

    for unit in units {
        if let Some(idx) = line.find(unit) {
            // Find the number before the unit
            let before = &line[..idx];
            let mut start = idx;
            for (i, c) in before.char_indices().rev() {
                if c.is_ascii_digit() || c == '.' {
                    start = i;
                } else if c.is_whitespace() {
                    continue;
                } else {
                    break;
                }
            }

            if start < idx {
                let speed_str = line[start..idx + unit.len()].trim();
                return speed_str.to_string();
            }
        }
    }

    "".to_string()
}

// Fix JSON/XML errors using Ollama
#[tauri::command]
async fn fix_with_ollama(
    content: String,
    error_details: String,
    model: String,
) -> Result<String, String> {
    // Parse error details
    let details: ErrorDetails = serde_json::from_str(&error_details)
        .map_err(|e| format!("Failed to parse error details: {}", e))?;

    // Build error list
    let error_list = if let Some(ref errors) = details.all_errors {
        errors
            .iter()
            .map(|e| {
                if let Some(line) = e.line {
                    format!("Line {}: {}", line, e.message)
                } else {
                    e.message.clone()
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        details.message.clone()
    };

    // Build prompt - emphasize outputting complete content
    let prompt = format!(
        r#"Fix the syntax errors in this {}. Output ONLY the corrected {} with NO explanations.

Errors to fix:
{}

IMPORTANT: You MUST output the ENTIRE corrected content from start to finish. Do not truncate or summarize.

Content:
{}

Output the complete fixed {} now:"#,
        details.error_type,
        details.error_type,
        error_list,
        content,
        details.error_type
    );

    // Use Ollama API instead of CLI for better control over parameters
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(300))  // 5 minute timeout for large files
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let api_url = "http://localhost:11434/api/generate";

    let request_body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
        "options": {
            "num_ctx": 32768,  // Increase context window to 32K tokens
            "num_predict": -1,  // Unlimited output - let model decide when to stop
            "temperature": 0.1,
            "top_p": 0.9,
            "repeat_penalty": 1.0,
            "stop": []  // No stop sequences
        }
    });

    let response = client
        .post(api_url)
        .json(&request_body)
        .send()
        .map_err(|e| format!("Failed to call Ollama API: {}", e))?;

    if response.status().is_success() {
        let response_json: serde_json::Value = response
            .json()
            .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

        let mut fixed = response_json["response"]
            .as_str()
            .unwrap_or("")
            .to_string();

        // DeepSeek R1 outputs reasoning in <think> tags - remove them
        // Find the last closing </think> tag and take everything after it
        if let Some(think_end) = fixed.rfind("</think>") {
            fixed = fixed[think_end + 8..].to_string();
        }

        // Remove markdown code block markers but preserve content
        // Handle cases like ```json\n{...}\n```
        if fixed.contains("```") {
            let mut in_code_block = false;
            let mut code_lines = Vec::new();

            for line in fixed.lines() {
                if line.trim().starts_with("```") {
                    in_code_block = !in_code_block;
                } else if in_code_block {
                    code_lines.push(line);
                }
            }

            // If we found code block content, use it; otherwise keep original
            if !code_lines.is_empty() {
                fixed = code_lines.join("\n");
            } else {
                // No code block markers found, just remove the ``` lines
                fixed = fixed
                    .lines()
                    .filter(|line| !line.trim().starts_with("```"))
                    .collect::<Vec<_>>()
                    .join("\n");
            }
        }

        // Try to extract JSON/XML content more intelligently
        // For JSON: find the outermost { or [ and matching closing brace
        // For XML: find the first < and last >
        let trimmed = fixed.trim();
        if details.error_type == "JSON" {
            // Find first { or [
            if let Some(start_idx) = trimmed.find(|c| c == '{' || c == '[') {
                let start_char = trimmed.chars().nth(start_idx).unwrap();
                let end_char = if start_char == '{' { '}' } else { ']' };

                // Find matching closing brace
                let mut depth = 0;
                let mut end_idx = start_idx;
                for (i, c) in trimmed[start_idx..].char_indices() {
                    if c == start_char {
                        depth += 1;
                    } else if c == end_char {
                        depth -= 1;
                        if depth == 0 {
                            end_idx = start_idx + i + 1;
                            break;
                        }
                    }
                }

                if end_idx > start_idx {
                    fixed = trimmed[start_idx..end_idx].to_string();
                }
            }
        } else if details.error_type == "XML" {
            // For XML, find first < and last >
            if let Some(start_idx) = trimmed.find('<') {
                if let Some(end_idx) = trimmed.rfind('>') {
                    if end_idx > start_idx {
                        fixed = trimmed[start_idx..=end_idx].to_string();
                    }
                }
            }
        }

        // Final trim
        fixed = fixed.trim().to_string();

        Ok(fixed)
    } else {
        Err(format!("Ollama API error: HTTP {}", response.status()))
    }
}

// Check if a specific model is available
#[tauri::command]
async fn check_model_available(model: String) -> Result<bool, String> {
    let output = Command::new("ollama")
        .arg("list")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to check models: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.contains(&model))
    } else {
        Ok(false)
    }
}

// Save file content to a specific path
#[tauri::command]
async fn save_file_to_path(file_path: String, content: String) -> Result<String, String> {
    let path = Path::new(&file_path);

    // Use async file I/O to prevent blocking the event loop
    // This is especially important on Windows for large files
    tokio::fs::write(path, content)
        .await
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(format!("Successfully saved to {}", file_path))
}

#[tauri::command]
async fn store_security_bookmark(app_handle: tauri::AppHandle, file_path: String) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        return macos_bookmarks::store_bookmark(&app_handle, &file_path);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app_handle;
        let _ = file_path;
        Ok(false)
    }
}

// Read file content from a specific path
#[tauri::command]
async fn read_file_from_path(app_handle: tauri::AppHandle, file_path: String) -> Result<Vec<u8>, String> {
    let path = Path::new(&file_path);

    // Use async file I/O to prevent blocking the event loop
    // This is especially important on Windows where file reads can be slow
    #[cfg(target_os = "macos")]
    {
        return macos_bookmarks::with_bookmark_access(&app_handle, &file_path, || {
            std::fs::read(path).map_err(|e| format!("Failed to read file: {}", e))
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        tokio::fs::read(path)
            .await
            .map_err(|e| format!("Failed to read file: {}", e))
    }
}

// Read large file in chunks with progress updates
#[tauri::command]
async fn read_large_file_chunked(
    app_handle: tauri::AppHandle,
    file_path: String,
    chunk_size: Option<usize>,
) -> Result<Vec<u8>, String> {
    #[cfg(target_os = "macos")]
    {
        let chunk_size = chunk_size.unwrap_or(512 * 1024); // 512KB default chunks
        let app_handle = app_handle.clone();
        let file_path = file_path.clone();
        return tokio::task::spawn_blocking(move || {
            use std::io::Read;
            let path = PathBuf::from(&file_path);
            let _guard = macos_bookmarks::start_access(&app_handle, &file_path)?;
            let metadata = std::fs::metadata(&path)
                .map_err(|e| format!("Failed to get file metadata: {}", e))?;
            let file_size = metadata.len() as usize;
            let mut file = std::fs::File::open(&path)
                .map_err(|e| format!("Failed to open file: {}", e))?;

            let mut buffer = Vec::with_capacity(file_size);
            let mut temp_chunk = vec![0u8; chunk_size];
            let mut bytes_read = 0usize;
            loop {
                let n = file
                    .read(&mut temp_chunk)
                    .map_err(|e| format!("Failed to read chunk: {}", e))?;
                if n == 0 {
                    break;
                }
                buffer.extend_from_slice(&temp_chunk[..n]);
                bytes_read += n;

                if bytes_read % (1024 * 1024) == 0 || bytes_read == file_size {
                    let progress = (bytes_read as f64 / file_size as f64 * 100.0) as u32;
                    let _ = app_handle.emit("file-read-progress", json!({
                        "path": file_path,
                        "bytesRead": bytes_read,
                        "totalBytes": file_size,
                        "progress": progress
                    }));
                }
            }

            Ok(buffer)
        })
        .await
        .map_err(|e| format!("Failed to read file: {}", e))?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        use tokio::io::AsyncReadExt;
        let path = Path::new(&file_path);
        let chunk_size = chunk_size.unwrap_or(512 * 1024); // 512KB default chunks

    // Get file size first
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;

    let file_size = metadata.len() as usize;

    // Open file for reading
    let mut file = tokio::fs::File::open(&path)
        .await
        .map_err(|e| format!("Failed to open file: {}", e))?;

    // Allocate buffer for entire file
    let mut buffer = Vec::with_capacity(file_size);
    let mut temp_chunk = vec![0u8; chunk_size];
    let mut bytes_read = 0;

    // Read file in chunks
    loop {
        let n = file.read(&mut temp_chunk)
            .await
            .map_err(|e| format!("Failed to read chunk: {}", e))?;

        if n == 0 {
            break; // EOF
        }

        buffer.extend_from_slice(&temp_chunk[..n]);
        bytes_read += n;

        // Emit progress event every 1MB
        if bytes_read % (1024 * 1024) == 0 || bytes_read == file_size {
            let progress = (bytes_read as f64 / file_size as f64 * 100.0) as u32;
            let _ = app_handle.emit("file-read-progress", json!({
                "path": file_path,
                "bytesRead": bytes_read,
                "totalBytes": file_size,
                "progress": progress
            }));
        }

        // Yield to allow other tasks to run every 2MB
        if bytes_read % (2 * 1024 * 1024) == 0 {
            tokio::task::yield_now().await;
        }
    }

    Ok(buffer)
    }
}

// Get command line arguments (for file associations)
#[tauri::command]
async fn get_cli_args() -> Result<Vec<String>, String> {
    let args: Vec<String> = std::env::args().collect();
    // Skip the first argument (the executable path)
    Ok(args.into_iter().skip(1).collect())
}

// Check if an LSP server is installed
#[tauri::command]
async fn check_lsp_server(
    app_handle: tauri::AppHandle,
    language: String,
    mode: Option<String>,
    custom_command: Option<String>,
) -> Result<serde_json::Value, String> {
    let server_command = match language.as_str() {
        "javascript" | "typescript" | "jsx" | "tsx" => "typescript-language-server",
        "python" => "pyright-langserver",
        "rust" => "rust-analyzer",
        "java" => "jdtls",
        "cpp" => "clangd",
        "php" => "intelephense",
        _ => {
            return Ok(serde_json::json!({
                "installed": false,
                "message": format!("LSP not supported for language: {}", language)
            }));
        }
    };

    // Respect UI-chosen source
    if let Some(mode_value) = mode.clone() {
        if mode_value == "custom" {
            if let Some(custom) = custom_command.clone() {
                let trimmed = custom.trim();
                if trimmed.is_empty() {
                    return Ok(serde_json::json!({
                        "installed": false,
                        "language": language,
                        "server": server_command,
                        "message": "Custom command/path is empty"
                    }));
                }

                if Path::new(trimmed).exists() {
                    return Ok(serde_json::json!({
                        "installed": true,
                        "language": language,
                        "server": trimmed,
                        "path": trimmed,
                        "source": "custom"
                    }));
                } else {
                    return Ok(serde_json::json!({
                        "installed": false,
                        "language": language,
                        "server": server_command,
                        "source": "custom",
                        "message": format!("Custom command/path not found: {}", trimmed)
                    }));
                }
            }
        } else if mode_value == "bundled" {
            if let Some(bundled_path) = resolve_bundled_lsp(&app_handle, &language, server_command) {
                return Ok(serde_json::json!({
                    "installed": true,
                    "language": language,
                    "server": server_command,
                    "path": bundled_path,
                    "source": "bundled"
                }));
            }
        }
    }

    // Check if the server is available in PATH
    let check_result = if cfg!(target_os = "windows") {
        Command::new("where")
            .arg(server_command)
            .output()
    } else {
        Command::new("which")
            .arg(server_command)
            .output()
    };

    match check_result {
        Ok(output) => {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                Ok(serde_json::json!({
                    "installed": true,
                    "server": server_command,
                    "path": path,
                    "language": language,
                    "source": "system"
                }))
            } else {
                Ok(serde_json::json!({
                    "installed": false,
                    "server": server_command,
                    "language": language,
                    "message": format!("{} is not installed or not in PATH", server_command),
                    "source": "system"
                }))
            }
        }
        Err(e) => {
            Err(format!("Failed to check LSP server: {}", e))
        }
    }
}

// Get installation instructions for LSP servers
#[tauri::command]
async fn get_lsp_install_instructions(language: String) -> Result<serde_json::Value, String> {
    let instructions = match language.as_str() {
        "javascript" | "typescript" | "jsx" | "tsx" => serde_json::json!({
            "language": language,
            "server": "typescript-language-server",
            "install": "npm install -g typescript-language-server typescript",
            "description": "TypeScript/JavaScript language server with IntelliSense support"
        }),
        "python" => serde_json::json!({
            "language": language,
            "server": "pyright-langserver",
            "install": "npm install -g pyright",
            "description": "Fast, feature-rich language server for Python"
        }),
        "rust" => serde_json::json!({
            "language": language,
            "server": "rust-analyzer",
            "install": "Install via rustup: rustup component add rust-analyzer",
            "description": "Official Rust language server"
        }),
        "java" => serde_json::json!({
            "language": language,
            "server": "jdtls",
            "install": "Download from https://download.eclipse.org/jdtls/snapshots/",
            "description": "Eclipse JDT Language Server for Java"
        }),
        "cpp" => serde_json::json!({
            "language": language,
            "server": "clangd",
            "install": "Install via your package manager (e.g., brew install llvm or sudo apt-get install clangd)",
            "description": "Clangd language server for C and C++"
        }),
        "php" => serde_json::json!({
            "language": language,
            "server": "intelephense",
            "install": "npm install -g intelephense",
            "description": "Intelephense language server for PHP"
        }),
        _ => serde_json::json!({
            "language": language,
            "error": format!("No LSP server available for {}", language)
        })
    };

    Ok(instructions)
}

// Fix with Claude API
#[tauri::command]
async fn fix_with_claude(
    content: String,
    error_details: String,
    api_key: String,
    model: String,
) -> Result<String, String> {
    let details: ErrorDetails = serde_json::from_str(&error_details)
        .map_err(|e| format!("Failed to parse error details: {}", e))?;

    let error_list = if let Some(ref errors) = details.all_errors {
        errors
            .iter()
            .map(|e| {
                if let Some(line) = e.line {
                    format!("Line {}: {}", line, e.message)
                } else {
                    e.message.clone()
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        details.message.clone()
    };

    let prompt = format!(
        r#"You are a {} syntax error fixer. Your task is to fix ONLY the syntax errors in the provided content.

Errors found:
{}

Content to fix:
{}

Instructions:
1. Fix ONLY the syntax errors listed above
2. Preserve all data and structure
3. Do not add explanations or comments
4. Return ONLY the complete corrected {}
5. Ensure the output is valid {}

Fixed {}:"#,
        details.error_type,
        error_list,
        content,
        details.error_type,
        details.error_type,
        details.error_type
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let request_body = serde_json::json!({
        "model": model,
        "max_tokens": 16000,
        "system": format!("You are a {} syntax error fixing assistant. Only output valid {}, nothing else.", details.error_type, details.error_type),
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.1
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to call Claude API: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        let error_message = if let Ok(error_data) = serde_json::from_str::<serde_json::Value>(&error_text) {
            error_data["error"]["message"].as_str()
                .or(error_data["message"].as_str())
                .unwrap_or(&error_text)
                .to_string()
        } else {
            format!("Claude API error: {}", error_text)
        };
        return Err(error_message);
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Claude response: {}", e))?;

    let mut fixed = data["content"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // Remove markdown code block markers
    if fixed.contains("```") {
        let mut in_code_block = false;
        let mut code_lines = Vec::new();

        for line in fixed.lines() {
            if line.trim().starts_with("```") {
                in_code_block = !in_code_block;
            } else if in_code_block {
                code_lines.push(line);
            }
        }

        if !code_lines.is_empty() {
            fixed = code_lines.join("\n");
        } else {
            fixed = fixed
                .lines()
                .filter(|line| !line.trim().starts_with("```"))
                .collect::<Vec<_>>()
                .join("\n");
        }
    }

    // Extract content based on type
    fixed = extract_content(fixed.trim(), &details.error_type);

    Ok(fixed.trim().to_string())
}

// Fix with Groq API
#[tauri::command]
async fn fix_with_groq(
    content: String,
    error_details: String,
    api_key: String,
    model: String,
) -> Result<String, String> {
    let details: ErrorDetails = serde_json::from_str(&error_details)
        .map_err(|e| format!("Failed to parse error details: {}", e))?;

    let error_list = if let Some(ref errors) = details.all_errors {
        errors
            .iter()
            .map(|e| {
                if let Some(line) = e.line {
                    format!("Line {}: {}", line, e.message)
                } else {
                    e.message.clone()
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        details.message.clone()
    };

    let prompt = format!(
        r#"You are a {} syntax error fixer. Your task is to fix ONLY the syntax errors in the provided content.

Errors found:
{}

Content to fix:
{}

Instructions:
1. Fix ONLY the syntax errors listed above
2. Preserve all data and structure
3. Do not add explanations or comments
4. Return ONLY the complete corrected {}
5. Ensure the output is valid {}

Fixed {}:"#,
        details.error_type,
        error_list,
        content,
        details.error_type,
        details.error_type,
        details.error_type
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let request_body = serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": format!("You are a {} syntax error fixing assistant. Only output valid {}, nothing else.", details.error_type, details.error_type)
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.1,
        "max_tokens": 16000
    });

    let response = client
        .post("https://api.groq.com/openai/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to call Groq API: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        let error_message = if let Ok(error_data) = serde_json::from_str::<serde_json::Value>(&error_text) {
            error_data["error"]["message"].as_str()
                .unwrap_or(&error_text)
                .to_string()
        } else {
            format!("Groq API error: {}", error_text)
        };
        return Err(error_message);
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Groq response: {}", e))?;

    let mut fixed = data["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // Remove markdown code block markers
    if fixed.contains("```") {
        let mut in_code_block = false;
        let mut code_lines = Vec::new();

        for line in fixed.lines() {
            if line.trim().starts_with("```") {
                in_code_block = !in_code_block;
            } else if in_code_block {
                code_lines.push(line);
            }
        }

        if !code_lines.is_empty() {
            fixed = code_lines.join("\n");
        } else {
            fixed = fixed
                .lines()
                .filter(|line| !line.trim().starts_with("```"))
                .collect::<Vec<_>>()
                .join("\n");
        }
    }

    // Extract content based on type
    fixed = extract_content(fixed.trim(), &details.error_type);

    Ok(fixed.trim().to_string())
}

// Fix with OpenAI API
#[tauri::command]
async fn fix_with_openai(
    content: String,
    error_details: String,
    api_key: String,
    model: String,
) -> Result<String, String> {
    let details: ErrorDetails = serde_json::from_str(&error_details)
        .map_err(|e| format!("Failed to parse error details: {}", e))?;

    let error_list = if let Some(ref errors) = details.all_errors {
        errors
            .iter()
            .map(|e| {
                if let Some(line) = e.line {
                    format!("Line {}: {}", line, e.message)
                } else {
                    e.message.clone()
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        details.message.clone()
    };

    let prompt = format!(
        r#"You are a {} syntax error fixer. Your task is to fix ONLY the syntax errors in the provided content.

Errors found:
{}

Content to fix:
{}

Instructions:
1. Fix ONLY the syntax errors listed above
2. Preserve all data and structure
3. Do not add explanations or comments
4. Return ONLY the complete corrected {}
5. Ensure the output is valid {}

Fixed {}:"#,
        details.error_type,
        error_list,
        content,
        details.error_type,
        details.error_type,
        details.error_type
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let request_body = serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": format!("You are a {} syntax error fixing assistant. Only output valid {}, nothing else.", details.error_type, details.error_type)
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.1,
        "max_tokens": 16000
    });

    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to call OpenAI API: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        let error_message = if let Ok(error_data) = serde_json::from_str::<serde_json::Value>(&error_text) {
            error_data["error"]["message"].as_str()
                .unwrap_or(&error_text)
                .to_string()
        } else {
            format!("OpenAI API error: {}", error_text)
        };
        return Err(error_message);
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

    let mut fixed = data["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // Remove markdown code block markers
    if fixed.contains("```") {
        let mut in_code_block = false;
        let mut code_lines = Vec::new();

        for line in fixed.lines() {
            if line.trim().starts_with("```") {
                in_code_block = !in_code_block;
            } else if in_code_block {
                code_lines.push(line);
            }
        }

        if !code_lines.is_empty() {
            fixed = code_lines.join("\n");
        } else {
            fixed = fixed
                .lines()
                .filter(|line| !line.trim().starts_with("```"))
                .collect::<Vec<_>>()
                .join("\n");
        }
    }

    // Extract content based on type
    fixed = extract_content(fixed.trim(), &details.error_type);

    Ok(fixed.trim().to_string())
}

// Get Claude completion for code suggestions
#[tauri::command]
async fn get_claude_completion(
    prompt: String,
    api_key: String,
    model: String,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let request_body = serde_json::json!({
        "model": model,
        "max_tokens": 50,
        "system": "You are a code completion assistant. Return only the completion text, no explanations or markdown.",
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.2
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to call Claude API: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        let error_message = if let Ok(error_data) = serde_json::from_str::<serde_json::Value>(&error_text) {
            error_data["error"]["message"].as_str()
                .or(error_data["message"].as_str())
                .unwrap_or(&error_text)
                .to_string()
        } else {
            format!("Claude API error: {}", error_text)
        };
        return Err(error_message);
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Claude response: {}", e))?;

    let completion = data["content"][0]["text"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();

    Ok(completion)
}

// Helper function to extract JSON/XML content
fn extract_content(text: &str, error_type: &str) -> String {
    let trimmed = text.trim();

    if error_type == "JSON" {
        // Find first { or [
        if let Some(start_idx) = trimmed.find(|c| c == '{' || c == '[') {
            let start_char = trimmed.chars().nth(start_idx).unwrap();
            let end_char = if start_char == '{' { '}' } else { ']' };

            // Find matching closing brace
            let mut depth = 0;
            let mut end_idx = start_idx;
            for (i, c) in trimmed[start_idx..].char_indices() {
                if c == start_char {
                    depth += 1;
                } else if c == end_char {
                    depth -= 1;
                    if depth == 0 {
                        end_idx = start_idx + i + 1;
                        break;
                    }
                }
            }

            if end_idx > start_idx {
                return trimmed[start_idx..end_idx].to_string();
            }
        }
    } else if error_type == "XML" {
        // For XML, find first < and last >
        if let Some(start_idx) = trimmed.find('<') {
            if let Some(end_idx) = trimmed.rfind('>') {
                if end_idx > start_idx {
                    return trimmed[start_idx..=end_idx].to_string();
                }
            }
        }
    }

    trimmed.to_string()
}

// ===== PDF Print Commands =====

/// Save PDF data to a temporary file
#[tauri::command]
async fn save_pdf_temp(data: Vec<u8>, filename: String) -> Result<String, String> {
    let safe_filename: String = filename
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
        .collect();

    let safe_filename = if safe_filename.is_empty() {
        "document.pdf".to_string()
    } else {
        safe_filename
    };

    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("tidycode_{}", safe_filename));

    fs::write(&temp_path, data)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    temp_path.to_str()
        .ok_or_else(|| "Invalid path".to_string())
        .map(|s| s.to_string())
}

/// Print a PDF file using native OS print dialog
#[tauri::command]
async fn print_pdf_native(options: PrintPdfOptions) -> Result<String, String> {
    // Verify file exists
    if !Path::new(&options.path).exists() {
        return Err(format!("File not found: {}", options.path));
    }

    #[cfg(target_os = "macos")]
    {
        // macOS: Use Preview.app with AppleScript
        let applescript = format!(
            r#"
            tell application "Preview"
                set theDoc to open (POSIX file "{}")
                delay 0.3
                activate

                try
                    print theDoc with print dialog
                end try

                delay 0.5

                try
                    close theDoc saving no
                on error
                    try
                        close window 1 saving no
                    end try
                end try

                delay 0.2

                if (count of windows) is 0 then
                    quit
                end if
            end tell
            "#,
            options.path.replace("\"", "\\\"").replace("'", "\\'")
        );

        Command::new("osascript")
            .arg("-e")
            .arg(&applescript)
            .spawn()
            .map_err(|e| format!("Failed to run print command: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        // Windows: Use PowerShell Start-Process -Verb Print
        Command::new("powershell")
            .args(&[
                "-NoProfile",
                "-Command",
                &format!(
                    "Start-Process -FilePath '{}' -Verb Print -Wait",
                    options.path.replace("'", "''")
                ),
            ])
            .spawn()
            .map_err(|e| format!("Failed to run print command: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // Linux: Try various PDF viewers with print functionality
        let viewers = [
            ("evince", vec!["--preview", &options.path]),
            ("okular", vec!["--print", &options.path]),
            ("atril", vec!["--preview", &options.path]),
            ("xdg-open", vec![&options.path]),
        ];

        let mut printed = false;
        for (viewer, args) in viewers.iter() {
            if Command::new("which")
                .arg(viewer)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
            {
                if Command::new(viewer)
                    .args(args)
                    .spawn()
                    .is_ok()
                {
                    printed = true;
                    break;
                }
            }
        }

        if !printed {
            return Err("No suitable PDF viewer found for printing".to_string());
        }
    }

    // Schedule file cleanup if requested
    if options.remove_after_print {
        let path = options.path.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(60));
            let _ = fs::remove_file(&path);
        });
    }

    Ok("Print dialog opened".to_string())
}

fn build_native_menu(app: &tauri::AppHandle, recent_state: &RecentFilesState) -> tauri::Result<()> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

    let handle = app;
    let is_macos = cfg!(target_os = "macos");
    let is_windows = cfg!(target_os = "windows");
    let app_name = app.package_info().name.clone();

    // Filter out missing files from the stored list (best-effort)
    let recent_files = recent_state
        .files
        .lock()
        .map(|mut files| {
            files.retain(|p| Path::new(p).exists());
            files.clone()
        })
        .unwrap_or_default();
    if let Err(err) = recent_state.save() {
        eprintln!("[RecentFiles] Failed to persist recent files: {}", err);
    }
    println!("[RecentFiles] Building menu with {} entries", recent_files.len());

    // Shared items
    let new_file = MenuItemBuilder::with_id("new_file", "New File")
        .accelerator("CmdOrCtrl+N")
        .build(handle)?;
    let open_file = MenuItemBuilder::with_id("open_file", "Open File...")
        .accelerator("CmdOrCtrl+O")
        .build(handle)?;
    let save_file = MenuItemBuilder::with_id("save_file", "Save")
        .accelerator("CmdOrCtrl+S")
        .build(handle)?;
    let save_as = MenuItemBuilder::with_id("save_as", "Save As...")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(handle)?;
    let close_tab = MenuItemBuilder::with_id("close_tab", "Close Tab")
        .accelerator("CmdOrCtrl+W")
        .build(handle)?;
    let close_window = MenuItemBuilder::with_id("close_window", "Close Window")
        .accelerator(if is_macos { "Cmd+Shift+W" } else { "CmdOrCtrl+Shift+W" })
        .build(handle)?;

    let redo_accelerator = if is_macos { "Cmd+Shift+Z" } else { "Ctrl+Y" };

    let undo = MenuItemBuilder::with_id("undo", "Undo")
        .accelerator("CmdOrCtrl+Z")
        .build(handle)?;
    let redo = MenuItemBuilder::with_id("redo", "Redo")
        .accelerator(redo_accelerator)
        .build(handle)?;
    let cut = MenuItemBuilder::with_id("cut", "Cut")
        .accelerator("CmdOrCtrl+X")
        .build(handle)?;
    let copy = MenuItemBuilder::with_id("copy", "Copy")
        .accelerator("CmdOrCtrl+C")
        .build(handle)?;
    let paste = MenuItemBuilder::with_id("paste", "Paste")
        .accelerator("CmdOrCtrl+V")
        .build(handle)?;
    let delete_item = MenuItemBuilder::with_id("delete", "Delete")
        .accelerator("Delete")
        .build(handle)?;
    let select_all = MenuItemBuilder::with_id("select_all", "Select All")
        .accelerator("CmdOrCtrl+A")
        .build(handle)?;
    let find = MenuItemBuilder::with_id("find", "Find")
        .accelerator("CmdOrCtrl+F")
        .build(handle)?;
    let replace = MenuItemBuilder::with_id("replace", "Replace")
        .accelerator("CmdOrCtrl+H")
        .build(handle)?;

    let toggle_explorer = MenuItemBuilder::with_id("toggle_explorer", "Toggle File Explorer")
        .accelerator("CmdOrCtrl+B")
        .build(handle)?;
    let toggle_sidebar = MenuItemBuilder::with_id("toggle_sidebar", "Toggle Sidebar")
        .accelerator("CmdOrCtrl+\\")
        .build(handle)?;
    let full_screen = MenuItemBuilder::with_id("toggle_fullscreen", "Enter Full Screen")
        .accelerator(if is_macos { "Ctrl+Cmd+F" } else { "F11" })
        .build(handle)?;
    let increase_font = MenuItemBuilder::with_id("increase_font", "Increase Font Size")
        .accelerator("CmdOrCtrl+Plus")
        .build(handle)?;
    let decrease_font = MenuItemBuilder::with_id("decrease_font", "Decrease Font Size")
        .accelerator("CmdOrCtrl+-")
        .build(handle)?;

    let new_terminal = MenuItemBuilder::with_id("new_terminal", "New Terminal")
        .accelerator("CmdOrCtrl+Shift+`")
        .build(handle)?;
    let toggle_terminal = MenuItemBuilder::with_id("toggle_terminal", "Toggle Terminal Panel")
        .accelerator("CmdOrCtrl+`")
        .build(handle)?;

    let about = MenuItemBuilder::with_id("about", format!("About {}", app_name))
        .build(handle)?;
    let preferences = MenuItemBuilder::with_id(
        "preferences",
        if is_macos { "Preferences..." } else { "Settings" },
    )
    .accelerator(if is_macos { "Cmd+," } else { "Ctrl+," })
    .build(handle)?;

    // Help menu items
    let help_welcome = MenuItemBuilder::with_id("help_welcome", "Welcome")
        .build(handle)?;
    let help_tips = MenuItemBuilder::with_id("help_tips", "Tips & Tricks")
        .build(handle)?;
    let help_docs = MenuItemBuilder::with_id("help_docs", "Help Documentation")
        .build(handle)?;
    let help_releases = MenuItemBuilder::with_id("help_releases", "Release Notes")
        .build(handle)?;

    // Platform-specific items
    let mut app_menu = None;
    if is_macos {
        let hide_app = MenuItemBuilder::with_id("hide_app", format!("Hide {}", app_name))
            .accelerator("Cmd+H")
            .build(handle)?;
        let hide_others = MenuItemBuilder::with_id("hide_others", "Hide Others")
            .accelerator("Cmd+Alt+H")
            .build(handle)?;
        let show_all = MenuItemBuilder::with_id("show_all", "Show All")
            .build(handle)?;
        let quit = MenuItemBuilder::with_id("quit", format!("Quit {}", app_name))
            .accelerator("Cmd+Q")
            .build(handle)?;

        app_menu = Some(
            SubmenuBuilder::new(handle, &app_name)
                .item(&about)
                .separator()
                .item(&preferences)
                .separator()
                .item(&hide_app)
                .item(&hide_others)
                .item(&show_all)
                .separator()
                .item(&quit)
                .build()?,
        );
    }

    let exit_item = MenuItemBuilder::with_id("exit", "Exit")
        .accelerator("Alt+F4")
        .build(handle)?;

    // Recent files submenu (only populate existing entries)
    let mut recent_submenu = SubmenuBuilder::new(handle, "Open Recent");
    if recent_files.is_empty() {
        let empty = MenuItemBuilder::with_id("recent_empty", "No Recent Files")
            .enabled(false)
            .build(handle)?;
        recent_submenu = recent_submenu.item(&empty);
    } else {
        for (idx, path) in recent_files.iter().enumerate() {
            let id = format!("recent_slot_{}", idx);
            let clean = strip_extended_prefix(path);
            let display = Path::new(&clean)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&clean)
                .to_string();
            let label = format!("{}    {}", display, clean);
            let item = MenuItemBuilder::with_id(&id, label).build(handle)?;
            recent_submenu = recent_submenu.item(&item);
        }
        let clear_item = MenuItemBuilder::with_id("recent_clear", "Clear Recent Files").build(handle)?;
        recent_submenu = recent_submenu.separator().item(&clear_item);
    }
    let recent_submenu = recent_submenu.build()?;

    // File menu
    let mut file_menu_builder = SubmenuBuilder::new(handle, "File")
        .item(&new_file)
        .item(&open_file)
        .item(&recent_submenu)
        .separator()
        .item(&save_file)
        .item(&save_as)
        .separator()
        .item(&close_tab)
        .item(&close_window);

    if is_windows {
        file_menu_builder = file_menu_builder.separator().item(&preferences);
        file_menu_builder = file_menu_builder.separator().item(&exit_item);
    }

    let file_menu = file_menu_builder.build()?;

    // Edit menu
    let edit_menu = SubmenuBuilder::new(handle, "Edit")
        .item(&undo)
        .item(&redo)
        .separator()
        .item(&cut)
        .item(&copy)
        .item(&paste)
        .item(&delete_item)
        .item(&select_all)
        .separator()
        .item(&find)
        .item(&replace)
        .build()?;

    // View menu
    let view_menu = SubmenuBuilder::new(handle, "View")
        .item(&toggle_explorer)
        .item(&toggle_sidebar)
        .separator()
        .item(&full_screen)
        .separator()
        .item(&increase_font)
        .item(&decrease_font)
        .build()?;

    // Terminal menu
    let terminal_menu = SubmenuBuilder::new(handle, "Terminal")
        .item(&new_terminal)
        .item(&toggle_terminal)
        .build()?;

    // Window menu (macOS only)
    let mut window_menu = None;
    if is_macos {
        let minimize = MenuItemBuilder::with_id("minimize_window", "Minimize")
            .accelerator("Cmd+M")
            .build(handle)?;
        let zoom = MenuItemBuilder::with_id("zoom_window", "Zoom")
            .build(handle)?;
        let bring_all_to_front =
            MenuItemBuilder::with_id("bring_all_to_front", "Bring All to Front")
                .build(handle)?;

        window_menu = Some(
            SubmenuBuilder::new(handle, "Window")
                .item(&minimize)
                .item(&zoom)
                .separator()
                .item(&bring_all_to_front)
                .build()?,
        );
    }

    // Help menu (About lives in app menu on macOS)
    let mut help_builder = SubmenuBuilder::new(handle, "Help")
        .item(&help_welcome)
        .item(&help_tips)
        .item(&help_docs)
        .item(&help_releases);

    if !is_macos {
        help_builder = help_builder.separator().item(&about);
    }
    let help_menu = help_builder.build()?;

    // Build complete menu
    let mut menu_builder = MenuBuilder::new(handle);
    if let Some(app_menu) = app_menu.as_ref() {
        menu_builder = menu_builder.item(app_menu);
    }

    menu_builder = menu_builder
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&terminal_menu);

    if let Some(window_menu) = window_menu.as_ref() {
        menu_builder = menu_builder.item(window_menu);
    }

    let menu = menu_builder.item(&help_menu).build()?;

    app.set_menu(menu)?;
    Ok(())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_native_pdf_print::init())
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // Forward file open requests to the running instance
            let _ = app.emit(
                "single-instance",
                json!({
                    "args": argv,
                    "cwd": cwd
                }),
            );
        }))
        .setup(|app| {
            // Recent files state and initial menu build
            let recent_state = RecentFilesState::load(&app.handle());
            app.manage(recent_state);
            build_native_menu(&app.handle(), app.state::<RecentFilesState>().inner())?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Handle menu events
            app.on_menu_event(|app, event| {
                // Handle dynamic recent file items
                match event.id().as_ref() {
                    id if id.starts_with("recent_slot_") => {
                        let slot = id.trim_start_matches("recent_slot_");
                        let index: usize = slot.parse().unwrap_or(usize::MAX);
                        let files = app
                            .state::<RecentFilesState>()
                            .list();
                        if index < files.len() {
                            let _ = app.emit("menu:open_recent_item", files[index].clone());
                        }
                    },
                    "recent_empty" => {},
                    "recent_clear" => {
                        if let Some(state) = app.try_state::<RecentFilesState>() {
                            let _ = state.clear();
                            let inner = state.inner();
                            let _ = inner.save();
                            let _ = build_native_menu(app, inner);
                        }
                    },
                    "quit" | "exit" => { app.exit(0); },
                    "new_file" => { let _ = app.emit("menu:new_file", ()); },
                    "open_file" => { let _ = app.emit("menu:open_file", ()); },
                    "save_file" => { let _ = app.emit("menu:save_file", ()); },
                    "save_as" => { let _ = app.emit("menu:save_as", ()); },
                    "close_tab" => { let _ = app.emit("menu:close_tab", ()); },
                    "close_window" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.close();
                        }
                    },
                    "preferences" => { let _ = app.emit("menu:preferences", ()); },
                    "undo" => { let _ = app.emit("menu:undo", ()); },
                    "redo" => { let _ = app.emit("menu:redo", ()); },
                    "cut" => { let _ = app.emit("menu:cut", ()); },
                    "copy" => { let _ = app.emit("menu:copy", ()); },
                    "paste" => { let _ = app.emit("menu:paste", ()); },
                    "delete" => { let _ = app.emit("menu:delete", ()); },
                    "select_all" => { let _ = app.emit("menu:select_all", ()); },
                    "find" => { let _ = app.emit("menu:find", ()); },
                    "replace" => { let _ = app.emit("menu:replace", ()); },
                    "toggle_explorer" => { let _ = app.emit("menu:toggle_explorer", ()); },
                    "toggle_sidebar" => { let _ = app.emit("menu:toggle_sidebar", ()); },
                    "toggle_fullscreen" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if let Ok(is_fullscreen) = window.is_fullscreen() {
                                let _ = window.set_fullscreen(!is_fullscreen);
                            }
                        }
                    },
                    "new_terminal" => { let _ = app.emit("menu:new_terminal", ()); },
                    "toggle_terminal" => { let _ = app.emit("menu:toggle_terminal", ()); },
                    "increase_font" => { let _ = app.emit("menu:increase_font", ()); },
                    "decrease_font" => { let _ = app.emit("menu:decrease_font", ()); },
                    "about" => {
                        let pkg = app.package_info();
                        let payload = json!({
                            "name": pkg.name.clone(),
                            "version": pkg.version.to_string(),
                            "tauriVersion": tauri::VERSION,
                            "os": std::env::consts::OS,
                            "arch": std::env::consts::ARCH
                        });
                        let _ = app.emit("menu:about", payload.clone());
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("menu:about", payload);
                        }
                    },
                    "help_welcome" => { let _ = app.emit("menu:help_welcome", ()); },
                    "help_tips" => { let _ = app.emit("menu:help_tips", ()); },
                    "help_docs" => { let _ = app.emit("menu:help_docs", ()); },
                    "help_releases" => { let _ = app.emit("menu:help_releases", ()); },
                    "hide_app" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    },
                    "hide_others" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    },
                    "show_all" | "bring_all_to_front" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    },
                    "minimize_window" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.minimize();
                        }
                    },
                    "zoom_window" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if let Ok(is_maximized) = window.is_maximized() {
                                if is_maximized {
                                    let _ = window.unmaximize();
                                } else {
                                    let _ = window.maximize();
                                }
                            }
                        }
                    },
                    _ => {}
                }
            });

            // Setup system tray
            use tauri::tray::TrayIconBuilder;

            let tray_menu = tauri::menu::MenuBuilder::new(app)
                .item(&tauri::menu::MenuItemBuilder::with_id("show", "Show Window").build(app)?)
                .item(&tauri::menu::MenuItemBuilder::with_id("new_file_tray", "New File").build(app)?)
                .item(&tauri::menu::MenuItemBuilder::with_id("open_file_tray", "Open File...").build(app)?)
                .separator()
                .item(&tauri::menu::MenuItemBuilder::with_id("quit_tray", "Quit").build(app)?)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        },
                        "new_file_tray" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = app.emit("menu:new_file", ());
                            }
                        },
                        "open_file_tray" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = app.emit("menu:open_file", ());
                            }
                        },
                        "quit_tray" => {
                            app.exit(0);
                        },
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Handle tray icon click - toggle window visibility
                    if matches!(event, tauri::tray::TrayIconEvent::Click { .. }) {
                        if let Some(app) = tray.app_handle().get_webview_window("main") {
                            if app.is_visible().unwrap_or(false) {
                                let _ = app.hide();
                            } else {
                                let _ = app.show();
                                let _ = app.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Handle window close event - minimize to tray instead of closing
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // Prevent window from closing
                        api.prevent_close();
                        // Hide window instead
                        let _ = window_clone.hide();
                    }
                });

                // Enable DevTools - open automatically in debug, allow manual open in production
                #[cfg(debug_assertions)]
                window.open_devtools();

                // Note: In production builds, DevTools can be accessed via right-click context menu
                // or through the window's webview inspector if enabled in the window configuration
            }

            Ok(())
        })
        .manage(TerminalState {
            shells: Mutex::new(HashMap::new()),
        })
        .manage(FileOpenState::default())
        .invoke_handler(tauri::generate_handler![
            check_ollama_status,
            pull_ollama_model,
            fix_with_ollama,
            fix_with_claude,
            fix_with_groq,
            fix_with_openai,
            get_claude_completion,
            check_model_available,
            save_file_to_path,
            store_security_bookmark,
            read_file_from_path,
            read_large_file_chunked,
            get_cli_args,
            canonicalize_path,
            get_home_directory,
            get_app_info,
            record_recent_file,
            remove_recent_file,
            take_pending_file_opens,
            check_lsp_server,
            get_lsp_install_instructions,
            read_directory,
            create_file,
            create_directory,
            delete_path,
            rename_path,
            get_file_stats,
            search_files,
            spawn_shell,
            write_to_shell,
            read_from_shell,
            resize_shell,
            kill_shell,
            save_pdf_temp,
            print_pdf_native
        ])
        .build(context)
        .expect("error while building tauri application");

    app.run(move |app_handle, event| match event {
        tauri::RunEvent::Ready => {
            // Handle initial file open when launched via "Open with" / CLI args
            let paths: Vec<String> = std::env::args().skip(1).collect();

            if !paths.is_empty() {
                // Queue for later pickup in case the frontend isn't ready yet
                let state: State<FileOpenState> = app_handle.state();
                if let Ok(mut pending) = state.pending.lock() {
                    pending.extend(paths.clone());
                }

                // Emit to frontend using the same channel the UI already listens to
                let _ = app_handle.emit("tauri://file-open", paths.clone());

                // Ensure main window is visible/focused
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }
        // File-open events are only emitted on macOS/iOS; guard so Windows/Linux builds compile.
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        tauri::RunEvent::Opened { urls } => {
            let paths: Vec<String> = urls
                .iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|p| p.to_string_lossy().to_string())
                .collect();

            if !paths.is_empty() {
                // Queue for later pickup in case the frontend isn't ready yet
                let state: State<FileOpenState> = app_handle.state();
                if let Ok(mut pending) = state.pending.lock() {
                    pending.extend(paths.clone());
                }

                // Emit to frontend using the same channel the UI already listens to
                let _ = app_handle.emit("tauri://file-open", paths.clone());

                // Ensure main window is visible/focused
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }
        _ => {}
    });
}
