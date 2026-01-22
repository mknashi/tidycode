mod commands;
mod error;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(windows)]
mod windows;

use tauri::{plugin::{Builder, TauriPlugin}, Runtime};
use std::{fs, path::PathBuf, time::{Instant, SystemTime, UNIX_EPOCH}};
use base64::Engine;

pub use error::{Error, Result};

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintOptions {
    pub path: String,
    pub printer_name: Option<String>,
    pub job_name: Option<String>,
    pub copies: Option<u32>,
    pub duplex: Option<String>,
    pub paper_size: Option<String>,
    pub remove_after_print: bool,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintBytesOptions {
    pub data_base64: String,
    pub printer_name: Option<String>,
    pub job_name: Option<String>,
    pub copies: Option<u32>,
    pub duplex: Option<String>,
    pub paper_size: Option<String>,
    pub remove_after_print: bool,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintResult {
    pub job_id: Option<u32>,
    pub printer: String,
    pub message: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInfo {
    pub name: String,
    pub is_default: bool,
    pub status: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaOption {
    pub id: String,
    pub label: String,
    pub is_default: bool,
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("native-pdf-print")
        .invoke_handler(tauri::generate_handler![
            commands::print_pdf,
            commands::print_pdf_bytes,
            commands::get_printers,
            commands::get_default_printer,
            commands::get_printer_media,
        ])
        .build()
}

pub fn print_pdf(options: PrintOptions) -> Result<PrintResult> {
    #[cfg(target_os = "macos")]
    {
        return macos::print_pdf(options);
    }
    #[cfg(target_os = "linux")]
    {
        return linux::print_pdf(options);
    }
    #[cfg(windows)]
    {
        return windows::print_pdf(options);
    }

    #[allow(unreachable_code)]
    Err(Error::UnsupportedPlatform)
}

pub fn print_pdf_bytes(options: PrintBytesOptions) -> Result<PrintResult> {
    let start = Instant::now();
    let data = base64::engine::general_purpose::STANDARD
        .decode(options.data_base64.as_bytes())
        .map_err(|e| Error::ReadFailed(e.to_string()))?;
    println!(
        "[native-pdf-print] decoded base64 (bytes: {}, elapsed: {:?})",
        data.len(),
        start.elapsed()
    );

    let temp_path = create_temp_pdf_path();
    fs::write(&temp_path, data).map_err(|e| Error::WriteFailed(e.to_string()))?;
    let file_size = fs::metadata(&temp_path)
        .map(|meta| meta.len())
        .unwrap_or(0);
    println!(
        "[native-pdf-print] wrote temp PDF (path: {}, bytes: {}, elapsed: {:?})",
        temp_path.to_string_lossy(),
        file_size,
        start.elapsed()
    );

    let print_options = PrintOptions {
        path: temp_path.to_string_lossy().to_string(),
        printer_name: options.printer_name,
        job_name: options.job_name,
        copies: options.copies,
        duplex: options.duplex,
        paper_size: options.paper_size,
        remove_after_print: options.remove_after_print,
    };

    let result = print_pdf(print_options);
    println!(
        "[native-pdf-print] print_pdf_bytes complete (elapsed: {:?})",
        start.elapsed()
    );
    result
}

pub fn get_printers() -> Result<Vec<PrinterInfo>> {
    #[cfg(target_os = "macos")]
    {
        return macos::get_printers();
    }
    #[cfg(target_os = "linux")]
    {
        return linux::get_printers();
    }
    #[cfg(windows)]
    {
        return windows::get_printers();
    }

    #[allow(unreachable_code)]
    Err(Error::UnsupportedPlatform)
}

pub fn get_default_printer() -> Result<Option<String>> {
    #[cfg(target_os = "macos")]
    {
        return macos::get_default_printer();
    }
    #[cfg(target_os = "linux")]
    {
        return linux::get_default_printer();
    }
    #[cfg(windows)]
    {
        return windows::get_default_printer();
    }

    #[allow(unreachable_code)]
    Err(Error::UnsupportedPlatform)
}

pub fn get_printer_media(printer_name: Option<String>) -> Result<Vec<MediaOption>> {
    #[cfg(target_os = "macos")]
    {
        return macos::get_printer_media(printer_name);
    }
    #[cfg(target_os = "linux")]
    {
        return linux::get_printer_media(printer_name);
    }
    #[cfg(windows)]
    {
        return windows::get_printer_media(printer_name);
    }

    #[allow(unreachable_code)]
    Err(Error::UnsupportedPlatform)
}

fn create_temp_pdf_path() -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let filename = format!("native-pdf-print-{}.pdf", now);
    std::env::temp_dir().join(filename)
}
