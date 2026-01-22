use crate::{
    get_default_printer as core_default_printer,
    get_printer_media as core_get_printer_media,
    get_printers as core_get_printers,
    print_pdf as core_print,
    print_pdf_bytes as core_print_bytes,
    Error,
    MediaOption,
    PrintBytesOptions,
    PrintOptions,
    PrintResult,
    PrinterInfo,
    Result,
};
use std::time::Instant;

#[tauri::command(rename_all = "snake_case")]
pub async fn print_pdf(options: PrintOptions) -> Result<PrintResult> {
    let start = Instant::now();
    println!(
        "[native-pdf-print] command print_pdf start (path: {}, printer: {:?}, copies: {:?}, duplex: {:?}, paper: {:?})",
        options.path,
        options.printer_name,
        options.copies,
        options.duplex,
        options.paper_size
    );
    let result = tauri::async_runtime::spawn_blocking(move || core_print(options))
        .await
        .map_err(|e| Error::PrintCommandFailed(format!("Print task failed: {}", e)))?;
    println!(
        "[native-pdf-print] command print_pdf done (elapsed: {:?})",
        start.elapsed()
    );
    result
}

#[tauri::command(rename_all = "snake_case")]
pub async fn print_pdf_bytes(options: PrintBytesOptions) -> Result<PrintResult> {
    let start = Instant::now();
    println!(
        "[native-pdf-print] command print_pdf_bytes start (base64_len: {}, printer: {:?}, copies: {:?}, duplex: {:?}, paper: {:?})",
        options.data_base64.len(),
        options.printer_name,
        options.copies,
        options.duplex,
        options.paper_size
    );
    let result = tauri::async_runtime::spawn_blocking(move || core_print_bytes(options))
        .await
        .map_err(|e| Error::PrintCommandFailed(format!("Print task failed: {}", e)))?;
    println!(
        "[native-pdf-print] command print_pdf_bytes done (elapsed: {:?})",
        start.elapsed()
    );
    result
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_printers() -> Result<Vec<PrinterInfo>> {
    tauri::async_runtime::spawn_blocking(|| core_get_printers())
        .await
        .map_err(|e| Error::PrinterLookupFailed(format!("Printer lookup task failed: {}", e)))?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_default_printer() -> Result<Option<String>> {
    tauri::async_runtime::spawn_blocking(|| core_default_printer())
        .await
        .map_err(|e| Error::PrinterLookupFailed(format!("Printer lookup task failed: {}", e)))?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_printer_media(printer_name: Option<String>) -> Result<Vec<MediaOption>> {
    tauri::async_runtime::spawn_blocking(move || core_get_printer_media(printer_name))
        .await
        .map_err(|e| Error::PrinterLookupFailed(format!("Media lookup task failed: {}", e)))?
}
