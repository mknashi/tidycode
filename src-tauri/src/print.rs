use std::process::Command;
use tauri::AppHandle;

/// Save PDF data to a temporary file
#[tauri::command]
pub async fn save_temp_pdf(
    _app: AppHandle,
    data: Vec<u8>,
    filename: String,
) -> Result<String, String> {
    // Sanitize filename to prevent path traversal
    let safe_filename = sanitize_filename(&filename);

    // Get temp directory
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("tidycode_{}", safe_filename));

    // Write PDF to temp file
    std::fs::write(&temp_path, data)
        .map_err(|e| format!("Failed to save temp file: {}", e))?;

    // Return absolute path as string
    temp_path.to_str()
        .ok_or_else(|| "Invalid path".to_string())
        .map(|s| s.to_string())
}

/// Print PDF using native OS commands
#[tauri::command]
pub async fn print_pdf_native(file_path: String) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        print_pdf_macos(file_path).await
    }

    #[cfg(target_os = "windows")]
    {
        print_pdf_windows(file_path).await
    }

    #[cfg(target_os = "linux")]
    {
        print_pdf_linux(file_path).await
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err("Printing not supported on this platform".to_string())
    }
}

/// Clean up temporary PDF file
#[tauri::command]
pub async fn cleanup_temp_pdf(file_path: String) -> Result<(), String> {
    std::fs::remove_file(&file_path)
        .map_err(|e| format!("Failed to cleanup temp file: {}", e))
}

/// macOS: Use Preview.app with AppleScript
#[cfg(target_os = "macos")]
async fn print_pdf_macos(file_path: String) -> Result<String, String> {
    // Enhanced AppleScript with proper cleanup for both Print and Cancel scenarios
    let applescript = format!(
        r#"tell application "Preview"
            set theDoc to open (POSIX file "{}")
            delay 0.3
            activate

            -- Trigger print dialog (blocks until user clicks Print or Cancel)
            try
                print theDoc with print dialog
            end try

            -- Wait a bit for dialog to fully dismiss
            delay 0.5

            -- Close the document (works for both Print and Cancel)
            try
                close theDoc saving no
            on error
                -- If close fails, try closing by window
                try
                    close window 1 saving no
                end try
            end try

            -- Small delay before checking windows
            delay 0.2

            -- If Preview has no other windows, quit it
            if (count of windows) is 0 then
                quit
            end if
        end tell"#,
        file_path.replace("\"", "\\\"").replace("'", "\\'")
    );

    // Spawn async to avoid blocking the UI
    // The AppleScript will handle cleanup automatically
    Command::new("osascript")
        .arg("-e")
        .arg(&applescript)
        .spawn()
        .map_err(|e| format!("Failed to execute AppleScript: {}", e))?;

    Ok("Print dialog opened".to_string())
}

/// Windows: Open PDF with default viewer and use automation to trigger print
#[cfg(target_os = "windows")]
async fn print_pdf_windows(file_path: String) -> Result<String, String> {
    // Method 1: Try SumatraPDF if available (it has better command-line print support)
    // SumatraPDF -print-dialog <file.pdf> opens the file and immediately shows print dialog
    let sumatra_result = Command::new("SumatraPDF")
        .arg("-print-dialog")
        .arg(&file_path)
        .spawn();

    if sumatra_result.is_ok() {
        return Ok("Print dialog opened via SumatraPDF".to_string());
    }

    // Method 2: Use AcroRd32.exe (Adobe Reader) with /p flag for printing
    let adobe_paths = [
        r"C:\Program Files\Adobe\Acrobat Reader DC\Reader\AcroRd32.exe",
        r"C:\Program Files (x86)\Adobe\Acrobat Reader DC\Reader\AcroRd32.exe",
        r"C:\Program Files\Adobe\Acrobat DC\Acrobat\Acrobat.exe",
        r"C:\Program Files (x86)\Adobe\Acrobat DC\Acrobat\Acrobat.exe",
    ];

    for adobe_path in &adobe_paths {
        if std::path::Path::new(adobe_path).exists() {
            let result = Command::new(adobe_path)
                .arg("/t")  // /t = print to default printer with print dialog
                .arg(&file_path)
                .spawn();

            if result.is_ok() {
                return Ok("Print dialog opened via Adobe Reader".to_string());
            }
        }
    }

    // Method 3: Try Microsoft Edge (built into Windows 10/11) as PDF viewer
    // Edge can open PDFs and has better programmatic control
    let edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ];

    for edge_path in &edge_paths {
        if std::path::Path::new(edge_path).exists() {
            // Use Edge in app mode with auto-print
            let ps_script = format!(
                r#"
$process = Start-Process -FilePath '{}' -ArgumentList '--app=file:///{}','--kiosk-printing' -PassThru
Start-Sleep -Seconds 2
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("^p")
"#,
                edge_path.replace("'", "''"),
                file_path.replace("'", "''").replace("\\", "/")
            );

            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;

                let result = Command::new("powershell")
                    .arg("-WindowStyle")
                    .arg("Hidden")
                    .arg("-Command")
                    .arg(&ps_script)
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn();

                if result.is_ok() {
                    return Ok("Opening with Edge PDF viewer".to_string());
                }
            }
        }
    }

    // Method 4: Ultimate fallback - just open with default handler (user presses Ctrl+P)
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new("cmd")
            .arg("/C")
            .arg("start")
            .arg("")
            .arg(&file_path)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to open PDF: {}", e))?;
    }

    #[cfg(not(windows))]
    {
        Command::new("cmd")
            .arg("/C")
            .arg("start")
            .arg("")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("Failed to open PDF: {}", e))?;
    }

    Ok("PDF opened - use Ctrl+P to print".to_string())
}

/// Linux: Try multiple PDF viewers with fallback strategy
#[cfg(target_os = "linux")]
async fn print_pdf_linux(file_path: String) -> Result<String, String> {
    // Method 1: Try Evince (GNOME PDF viewer) with print preview
    if let Ok(_) = Command::new("evince")
        .arg("--preview")
        .arg(&file_path)
        .spawn()
    {
        return Ok("Print preview opened (Evince)".to_string());
    }

    // Method 2: Try Okular (KDE PDF viewer) with print flag
    if let Ok(_) = Command::new("okular")
        .arg("--print")
        .arg(&file_path)
        .spawn()
    {
        return Ok("Print dialog opened (Okular)".to_string());
    }

    // Method 3: Fallback to xdg-open (opens with default PDF viewer)
    Command::new("xdg-open")
        .arg(&file_path)
        .spawn()
        .map_err(|e| format!("Failed to open PDF: {}", e))?;

    Ok("PDF opened (use Ctrl+P to print)".to_string())
}

/// Sanitize filename to prevent path traversal attacks
fn sanitize_filename(filename: &str) -> String {
    filename
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("normal-file_123.pdf"), "normal-file_123.pdf");
        assert_eq!(sanitize_filename("../../etc/passwd"), "etcpasswd");
        assert_eq!(sanitize_filename("file with spaces.pdf"), "filewithspaces.pdf");
        assert_eq!(sanitize_filename("file@#$%.pdf"), "file.pdf");
    }
}
