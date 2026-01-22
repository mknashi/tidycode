use std::{fs, path::PathBuf, process::Command};

use crate::{Error, MediaOption, PrintOptions, PrintResult, PrinterInfo, Result};

pub fn print_pdf(options: PrintOptions) -> Result<PrintResult> {
    let path = PathBuf::from(&options.path);
    if !path.exists() {
        return Err(Error::PrintCommandFailed("PDF path does not exist".to_string()));
    }

    let mut cmd = Command::new("lp");
    if let Some(printer) = &options.printer_name {
        cmd.args(["-d", printer]);
    }
    if let Some(job_name) = &options.job_name {
        cmd.args(["-t", job_name]);
    }
    if let Some(copies) = options.copies {
        if copies > 1 {
            cmd.args(["-n", &copies.to_string()]);
        }
    }
    if let Some(duplex) = &options.duplex {
        let sides = match duplex.as_str() {
            "long" => Some("two-sided-long-edge"),
            "short" => Some("two-sided-short-edge"),
            _ => None,
        };
        if let Some(value) = sides {
            cmd.args(["-o", &format!("sides={}", value)]);
        }
    }
    if let Some(paper_size) = &options.paper_size {
        if !paper_size.is_empty() {
            cmd.args(["-o", &format!("media={}", paper_size)]);
        }
    }
    cmd.arg(&options.path);

    let output = cmd.output().map_err(|e| Error::PrintCommandFailed(e.to_string()))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(Error::PrintCommandFailed(stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let job_id = parse_lp_job_id(&stdout);
    let printer = options
        .printer_name
        .clone()
        .or_else(|| get_default_printer().ok().flatten())
        .unwrap_or_else(|| "unknown".to_string());

    if options.remove_after_print {
        let _ = fs::remove_file(&path);
    }

    Ok(PrintResult {
        job_id,
        printer,
        message: stdout.trim().to_string(),
    })
}

pub fn get_printers() -> Result<Vec<PrinterInfo>> {
    let printers_output = Command::new("lpstat")
        .arg("-p")
        .output()
        .map_err(|e| Error::PrinterLookupFailed(e.to_string()))?;

    if !printers_output.status.success() {
        let stderr = String::from_utf8_lossy(&printers_output.stderr).trim().to_string();
        return Err(Error::PrinterLookupFailed(stderr));
    }

    let default_name = get_default_printer().ok().flatten();
    let stdout = String::from_utf8_lossy(&printers_output.stdout);
    let mut printers = Vec::new();

    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix("printer ") {
            let mut parts = rest.split_whitespace();
            if let Some(name) = parts.next() {
                let is_default = default_name.as_deref() == Some(name);
                let status = if line.contains("disabled") {
                    "disabled"
                } else if line.contains("printing") {
                    "printing"
                } else {
                    "idle"
                };
                printers.push(PrinterInfo {
                    name: name.to_string(),
                    is_default,
                    status: status.to_string(),
                });
            }
        }
    }

    Ok(printers)
}

pub fn get_default_printer() -> Result<Option<String>> {
    let output = Command::new("lpstat")
        .arg("-d")
        .output()
        .map_err(|e| Error::PrinterLookupFailed(e.to_string()))?;

    if !output.status.success() {
        return Ok(None);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(name) = line.strip_prefix("system default destination: ") {
            return Ok(Some(name.trim().to_string()));
        }
    }

    Ok(None)
}

fn parse_lp_job_id(output: &str) -> Option<u32> {
    // Example: "request id is Printer_Name-123 (1 file(s))"
    let marker = "request id is ";
    let start = output.find(marker)? + marker.len();
    let remainder = &output[start..];
    let token = remainder.split_whitespace().next()?;
    let id_part = token.rsplit('-').next()?;
    id_part.parse().ok()
}

pub fn get_printer_media(printer_name: Option<String>) -> Result<Vec<MediaOption>> {
    let mut cmd = Command::new("lpoptions");
    if let Some(name) = printer_name.clone().or_else(|| get_default_printer().ok().flatten()) {
        cmd.args(["-p", &name]);
    }
    cmd.arg("-l");

    let output = cmd
        .output()
        .map_err(|e| Error::PrinterLookupFailed(e.to_string()))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(Error::PrinterLookupFailed(stderr));
    }

    Ok(parse_media_options(&String::from_utf8_lossy(&output.stdout)))
}

fn parse_media_options(output: &str) -> Vec<MediaOption> {
    for line in output.lines() {
        let is_media_line = line.starts_with("media/")
            || line.starts_with("PageSize/")
            || line.starts_with("PageSize")
            || line.starts_with("Media");
        if !is_media_line {
            continue;
        }
        let values = match line.splitn(2, ':').nth(1) {
            Some(rest) => rest,
            None => continue,
        };
        let mut options = Vec::new();
        for token in values.split_whitespace() {
            let is_default = token.starts_with('*');
            let raw = token.trim_start_matches('*');
            let (id, label) = match raw.split_once('/') {
                Some((id, label)) => (id.to_string(), label.to_string()),
                None => (raw.to_string(), raw.to_string()),
            };
            options.push(MediaOption {
                id,
                label,
                is_default,
            });
        }
        if !options.is_empty() {
            return options;
        }
    }
    Vec::new()
}
