use std::{
    collections::HashMap,
    ffi::OsStr,
    fs,
    os::windows::ffi::OsStrExt,
    path::PathBuf,
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, Instant},
};

use windows::{
    core::{HSTRING, PCWSTR, PWSTR},
    Data::Pdf::{PdfDocument, PdfPage, PdfPageRenderOptions},
    Graphics::Imaging::{BitmapDecoder, BitmapPixelFormat, SoftwareBitmap},
    Storage::StorageFile,
    Storage::Streams::{Buffer, DataReader, InMemoryRandomAccessStream},
    UI::Color,
    Win32::Foundation::{GetLastError, HANDLE},
    Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED},
    Win32::Graphics::Gdi::{
        CreateDCW, DeleteDC, GetDeviceCaps, SetStretchBltMode, StretchDIBits, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HORZRES, LOGPIXELSX, LOGPIXELSY, PHYSICALHEIGHT,
        PHYSICALOFFSETX, PHYSICALOFFSETY, PHYSICALWIDTH, SRCCOPY, STRETCH_HALFTONE, VERTRES,
    },
    Win32::Graphics::Printing::{
        ClosePrinter, EnumFormsW, EnumPrintersW, GetDefaultPrinterW, OpenPrinterW, FORM_INFO_1W,
        PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_4W,
    },
    Win32::Storage::Xps::{EndDoc, EndPage, StartDocW, StartPage, DOCINFOW},
};

use crate::{Error, MediaOption, PrintOptions, PrintResult, PrinterInfo, Result};

const CACHE_TTL: Duration = Duration::from_secs(30);

struct Cache<T> {
    value: T,
    fetched_at: Instant,
}

static PRINTER_CACHE: OnceLock<Mutex<Option<Cache<Vec<PrinterInfo>>>>> = OnceLock::new();
static MEDIA_CACHE: OnceLock<Mutex<HashMap<String, Cache<Vec<MediaOption>>>>> = OnceLock::new();

struct ComGuard;

impl Drop for ComGuard {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

pub fn print_pdf(options: PrintOptions) -> Result<PrintResult> {
    let path = PathBuf::from(&options.path);
    if !path.exists() {
        return Err(Error::PrintCommandFailed("PDF path does not exist".to_string()));
    }

    let printer = if let Some(name) = options.printer_name.clone() {
        name
    } else {
        get_default_printer()?.ok_or_else(|| {
            Error::PrinterLookupFailed("No default printer configured".to_string())
        })?
    };

    let async_printer = printer.clone();
    let async_path = options.path.clone();
    let async_options = options;
    println!(
        "[native-pdf-print] print_pdf queued (path: {}, printer: {})",
        async_path, async_printer
    );
    thread::spawn(move || {
        println!(
            "[native-pdf-print] print_pdf async start (path: {}, printer: {})",
            async_path, async_printer
        );
        if let Err(error) = print_pdf_sync(async_options, async_printer.clone()) {
            println!(
                "[native-pdf-print] Print job failed (printer: {}): {}",
                async_printer, error
            );
        } else {
            println!(
                "[native-pdf-print] Print job completed (printer: {}, path: {})",
                async_printer, async_path
            );
        }
    });

    Ok(PrintResult {
        job_id: None,
        printer,
        message: "Print job submitted (async)".to_string(),
    })
}

fn print_pdf_sync(options: PrintOptions, printer: String) -> Result<PrintResult> {
    let start = Instant::now();
    let path = PathBuf::from(&options.path);
    println!(
        "[native-pdf-print] print_pdf start (path: {}, copies: {:?}, duplex: {:?}, paper: {:?})",
        path.to_string_lossy(),
        options.copies,
        options.duplex,
        options.paper_size
    );
    let file_size = std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
    println!(
        "[native-pdf-print] print_pdf file size (bytes: {}, elapsed: {:?})",
        file_size,
        start.elapsed()
    );

    let job_name = options
        .job_name
        .clone()
        .unwrap_or_else(|| path.file_name().and_then(|p| p.to_str()).unwrap_or("PDF Print Job").to_string());

    let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    if hr.is_err() {
        return Err(Error::PrintCommandFailed(format!("Failed to init COM: {}", hr)));
    }
    let _com_guard = ComGuard;
    println!(
        "[native-pdf-print] COM initialized (elapsed: {:?})",
        start.elapsed()
    );
    let document = load_pdf_document_from_path(&path)?;
    let page_count = document.PageCount().map_err(|e| Error::PrintCommandFailed(e.to_string()))?;
    println!(
        "[native-pdf-print] PDF loaded (pages: {}, elapsed: {:?})",
        page_count,
        start.elapsed()
    );

    let printer_wide = to_wide(&printer);
    let driver_wide = to_wide("WINSPOOL");
    let job_name_wide = to_wide(&job_name);

    let hdc = unsafe {
        CreateDCW(
            PCWSTR(driver_wide.as_ptr()),
            PCWSTR(printer_wide.as_ptr()),
            PCWSTR::null(),
            None,
        )
    };
    if hdc.0.is_null() {
        return Err(Error::PrintCommandFailed("Failed to create printer DC".to_string()));
    }
    println!(
        "[native-pdf-print] Printer DC created (printer: {}, elapsed: {:?})",
        printer,
        start.elapsed()
    );

    let dpi_x = unsafe { GetDeviceCaps(hdc, LOGPIXELSX) } as u32;
    let dpi_y = unsafe { GetDeviceCaps(hdc, LOGPIXELSY) } as u32;
    let printable_w = unsafe { GetDeviceCaps(hdc, HORZRES) } as i32;
    let printable_h = unsafe { GetDeviceCaps(hdc, VERTRES) } as i32;
    let offset_x = unsafe { GetDeviceCaps(hdc, PHYSICALOFFSETX) } as i32;
    let offset_y = unsafe { GetDeviceCaps(hdc, PHYSICALOFFSETY) } as i32;
    let physical_w = unsafe { GetDeviceCaps(hdc, PHYSICALWIDTH) } as i32;
    let physical_h = unsafe { GetDeviceCaps(hdc, PHYSICALHEIGHT) } as i32;
    println!(
        "[native-pdf-print] Printer caps printable {}x{}, offset {}x{}, physical {}x{}",
        printable_w, printable_h, offset_x, offset_y, physical_w, physical_h
    );
    const MAX_RENDER_DPI: u32 = 150;
    const MAX_RENDER_DIM: u32 = 2000;
    let render_dpi_x = dpi_x.min(MAX_RENDER_DPI);
    let render_dpi_y = dpi_y.min(MAX_RENDER_DPI);

    let doc_info = DOCINFOW {
        cbSize: std::mem::size_of::<DOCINFOW>() as i32,
        lpszDocName: PCWSTR(job_name_wide.as_ptr()),
        lpszOutput: PCWSTR::null(),
        lpszDatatype: PCWSTR::null(),
        fwType: 0,
    };

    let job_id = unsafe { StartDocW(hdc, &doc_info) };
    if job_id <= 0 {
        unsafe { DeleteDC(hdc) };
        let code = unsafe { GetLastError().0 };
        return Err(Error::PrintCommandFailed(format!(
            "Failed to start GDI print job (error {})",
            code
        )));
    }
    println!(
        "[native-pdf-print] StartDocW ok (job_id: {}, elapsed: {:?})",
        job_id,
        start.elapsed()
    );

    unsafe { SetStretchBltMode(hdc, STRETCH_HALFTONE) };

    for index in 0..page_count {
        println!(
            "[native-pdf-print] Rendering page {} of {} (elapsed: {:?})",
            index + 1,
            page_count,
            start.elapsed()
        );
        let page = document.GetPage(index).map_err(|e| Error::PrintCommandFailed(e.to_string()))?;
        let size = page.Size().map_err(|e| Error::PrintCommandFailed(e.to_string()))?;
        let mut target_w =
            ((size.Width / 72.0) * render_dpi_x as f32).round().max(1.0) as u32;
        let mut target_h =
            ((size.Height / 72.0) * render_dpi_y as f32).round().max(1.0) as u32;
        if target_w > MAX_RENDER_DIM || target_h > MAX_RENDER_DIM {
            let scale = (MAX_RENDER_DIM as f32 / target_w as f32)
                .min(MAX_RENDER_DIM as f32 / target_h as f32);
            target_w = (target_w as f32 * scale).round().max(1.0) as u32;
            target_h = (target_h as f32 * scale).round().max(1.0) as u32;
        }
        println!(
            "[native-pdf-print] Render size target {}x{} at {}x{} dpi",
            target_w,
            target_h,
            render_dpi_x,
            render_dpi_y
        );

        let (pixels, width, height) = render_page_to_bgra(&page, target_w, target_h)?;
        println!(
            "[native-pdf-print] Page {} rasterized ({}x{}, elapsed: {:?})",
            index + 1,
            width,
            height,
            start.elapsed()
        );
        let scale = (printable_w as f32 / width as f32)
            .min(printable_h as f32 / height as f32)
            .max(0.01);
        let dest_w = (width as f32 * scale).round() as i32;
        let dest_h = (height as f32 * scale).round() as i32;
        let dest_x = offset_x + (printable_w - dest_w) / 2;
        let dest_y = offset_y + (printable_h - dest_h) / 2;
        println!(
            "[native-pdf-print] Page {} output rect {}x{} at ({}, {})",
            index + 1,
            dest_w,
            dest_h,
            dest_x,
            dest_y
        );

        let mut info = BITMAPINFO::default();
        info.bmiHeader = BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width as i32,
            biHeight: -(height as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0 as u32,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        };

        let started = unsafe { StartPage(hdc) };
        if started <= 0 {
            unsafe { EndDoc(hdc) };
            unsafe { DeleteDC(hdc) };
            return Err(Error::PrintCommandFailed("Failed to start GDI page".to_string()));
        }
        println!(
            "[native-pdf-print] StartPage ok (page {}, elapsed: {:?})",
            index + 1,
            start.elapsed()
        );

        let result = unsafe {
            StretchDIBits(
                hdc,
                dest_x,
                dest_y,
                dest_w,
                dest_h,
                0,
                0,
                width as i32,
                height as i32,
                Some(pixels.as_ptr() as *const _),
                &info,
                DIB_RGB_COLORS,
                SRCCOPY,
            )
        };
        if result == 0 {
            unsafe { EndPage(hdc) };
            unsafe { EndDoc(hdc) };
            unsafe { DeleteDC(hdc) };
            let code = unsafe { GetLastError().0 };
            return Err(Error::PrintCommandFailed(format!(
                "Failed to render page to printer (error {})",
                code
            )));
        }
        println!(
            "[native-pdf-print] StretchDIBits ok (page {}, elapsed: {:?})",
            index + 1,
            start.elapsed()
        );

        let ended = unsafe { EndPage(hdc) };
        if ended <= 0 {
            unsafe { EndDoc(hdc) };
            unsafe { DeleteDC(hdc) };
            return Err(Error::PrintCommandFailed("Failed to end GDI page".to_string()));
        }
        println!(
            "[native-pdf-print] EndPage ok (page {}, elapsed: {:?})",
            index + 1,
            start.elapsed()
        );
    }

    let finished = unsafe { EndDoc(hdc) };
    unsafe { DeleteDC(hdc) };
    if finished <= 0 {
        let code = unsafe { GetLastError().0 };
        return Err(Error::PrintCommandFailed(format!(
            "Failed to finalize GDI print job (error {})",
            code
        )));
    }
    println!(
        "[native-pdf-print] EndDoc ok (elapsed: {:?})",
        start.elapsed()
    );

    if options.remove_after_print {
        let _ = fs::remove_file(&path);
    }

    let result = PrintResult {
        job_id: Some(job_id as u32),
        printer,
        message: "GDI print submitted".to_string(),
    };
    println!(
        "[native-pdf-print] print_pdf done (job_id: {:?}, elapsed: {:?})",
        result.job_id,
        start.elapsed()
    );
    Ok(result)
}

pub fn get_printers() -> Result<Vec<PrinterInfo>> {
    if let Some(cached) = get_cached_printers() {
        return Ok(cached);
    }

    let default_printer = get_default_printer()?.unwrap_or_default();
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut needed: u32 = 0;
    let mut returned: u32 = 0;
    unsafe {
        let _ = EnumPrintersW(
            flags,
            PCWSTR::null(),
            4,
            None,
            &mut needed,
            &mut returned,
        );
    }

    if needed == 0 {
        return Ok(Vec::new());
    }

    let mut buffer = vec![0u8; needed as usize];
    let success = unsafe {
        EnumPrintersW(
            flags,
            PCWSTR::null(),
            4,
            Some(buffer.as_mut_slice()),
            &mut needed,
            &mut returned,
        )
    };

    if success.is_err() {
        let code = unsafe { GetLastError().0 };
        return Err(Error::PrinterLookupFailed(format!(
            "Failed to enumerate printers (error {})",
            code
        )));
    }

    let mut result = Vec::with_capacity(returned as usize);
    let info_ptr = buffer.as_ptr() as *const PRINTER_INFO_4W;
    for index in 0..returned as usize {
        let info = unsafe { info_ptr.add(index).read() };
        let name = pwstr_to_string(info.pPrinterName);
        if name.is_empty() {
            continue;
        }
        let is_default = !default_printer.is_empty() && name == default_printer;
        result.push(PrinterInfo {
            name,
            is_default,
            status: "unknown".to_string(),
        });
    }

    set_cached_printers(result.clone());
    Ok(result)
}

pub fn get_default_printer() -> Result<Option<String>> {
    let mut needed: u32 = 0;
    unsafe {
        let _ = GetDefaultPrinterW(PWSTR::null(), &mut needed);
    }

    if needed == 0 {
        return Ok(None);
    }

    let mut buffer: Vec<u16> = vec![0; needed as usize];
    let success = unsafe { GetDefaultPrinterW(PWSTR(buffer.as_mut_ptr()), &mut needed) };
    if !success.as_bool() {
        return Ok(None);
    }

    let name = String::from_utf16_lossy(&buffer);
    Ok(Some(name.trim_end_matches('\0').to_string()))
}

pub fn get_printer_media(printer_name: Option<String>) -> Result<Vec<MediaOption>> {
    let mut target = printer_name;
    if target.is_none() {
        target = get_default_printer()?;
    }
    let name = match target {
        Some(value) => value,
        None => return Ok(Vec::new()),
    };

    if let Some(cached) = get_cached_media(&name) {
        return Ok(cached);
    }

    let printer_wide = to_wide(&name);
    let mut handle = HANDLE::default();
    let opened = unsafe {
        OpenPrinterW(
            PWSTR(printer_wide.as_ptr() as *mut _),
            &mut handle,
            None,
        )
    };
    if let Err(error) = opened {
        return Err(Error::PrinterLookupFailed(format!(
            "Failed to open printer for media enumeration: {}",
            error
        )));
    }

    let mut needed: u32 = 0;
    let mut returned: u32 = 0;
    unsafe {
        let _ = EnumFormsW(handle, 1, None, &mut needed, &mut returned);
    }

    if needed == 0 {
        unsafe { ClosePrinter(handle) };
        let defaults = default_media_options();
        set_cached_media(name, defaults.clone());
        return Ok(defaults);
    }

    let mut buffer = vec![0u8; needed as usize];
    let success = unsafe { EnumFormsW(handle, 1, Some(buffer.as_mut_slice()), &mut needed, &mut returned) };
    if !success.as_bool() {
        unsafe { ClosePrinter(handle) };
        let code = unsafe { GetLastError().0 };
        return Err(Error::PrinterLookupFailed(format!(
            "Failed to enumerate printer media (error {})",
            code
        )));
    }

    let mut options = Vec::with_capacity(returned as usize);
    let info_ptr = buffer.as_ptr() as *const FORM_INFO_1W;
    for index in 0..returned as usize {
        let info = unsafe { info_ptr.add(index).read() };
        let media_name = pwstr_to_string(info.pName);
        if media_name.is_empty() {
            continue;
        }
        options.push(MediaOption {
            id: media_name.clone(),
            label: media_name,
            is_default: false,
        });
    }

    unsafe { ClosePrinter(handle) };

    if options.is_empty() {
        options = default_media_options();
    }

    set_cached_media(name, options.clone());
    Ok(options)
}

fn default_media_options() -> Vec<MediaOption> {
    let defaults = [
        "Letter",
        "Legal",
        "A4",
        "A3",
        "A5",
        "Tabloid",
        "Executive",
    ];
    defaults
        .iter()
        .map(|name| MediaOption {
            id: (*name).to_string(),
            label: (*name).to_string(),
            is_default: false,
        })
        .collect()
}

fn map_printer_status(status: Option<u32>) -> String {
    match status {
        Some(3) => "idle".to_string(),
        Some(4) => "printing".to_string(),
        Some(7) => "offline".to_string(),
        Some(5) => "warming".to_string(),
        Some(6) => "stopped".to_string(),
        _ => "unknown".to_string(),
    }
}

fn to_wide(value: &str) -> Vec<u16> {
    OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

fn pwstr_to_string(value: PWSTR) -> String {
    if value.0.is_null() {
        return String::new();
    }
    unsafe {
        let mut len = 0usize;
        while *value.0.add(len) != 0 {
            len += 1;
        }
        let slice = std::slice::from_raw_parts(value.0, len);
        String::from_utf16_lossy(slice)
    }
}

fn load_pdf_document_from_path(path: &PathBuf) -> Result<PdfDocument> {
    let path_string = path.to_string_lossy().to_string();
    let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(path_string))
        .map_err(|e| Error::PrintCommandFailed(e.to_string()))?;
    let file = file
        .get()
        .map_err(|e| Error::PrintCommandFailed(e.to_string()))?;
    let op = PdfDocument::LoadFromFileAsync(&file)
        .map_err(|e| Error::PrintCommandFailed(e.to_string()))?;
    op.get().map_err(|e| Error::PrintCommandFailed(e.to_string()))
}

fn render_to_stream_with_options(
    page: &PdfPage,
    width: u32,
    height: u32,
) -> std::result::Result<InMemoryRandomAccessStream, String> {
    let stream = InMemoryRandomAccessStream::new().map_err(|e| e.to_string())?;
    let options = PdfPageRenderOptions::new().map_err(|e| e.to_string())?;
    options
        .SetDestinationWidth(width)
        .map_err(|e| e.to_string())?;
    options
        .SetDestinationHeight(height)
        .map_err(|e| e.to_string())?;
    options
        .SetBackgroundColor(Color { A: 255, R: 255, G: 255, B: 255 })
        .map_err(|e| e.to_string())?;

    let render = page
        .RenderWithOptionsToStreamAsync(&stream, &options)
        .map_err(|e| e.to_string())?;
    render.get().map_err(|e| e.to_string())?;
    stream.Seek(0).map_err(|e| e.to_string())?;
    Ok(stream)
}

fn render_to_stream_default(page: &PdfPage) -> std::result::Result<InMemoryRandomAccessStream, String> {
    let stream = InMemoryRandomAccessStream::new().map_err(|e| e.to_string())?;
    let render = page.RenderToStreamAsync(&stream).map_err(|e| e.to_string())?;
    render.get().map_err(|e| e.to_string())?;
    stream.Seek(0).map_err(|e| e.to_string())?;
    Ok(stream)
}

fn render_page_to_bgra(page: &PdfPage, width: u32, height: u32) -> Result<(Vec<u8>, u32, u32)> {
    println!(
        "[native-pdf-print] render_page_to_bgra start ({}x{})",
        width, height
    );
    let stream = match render_to_stream_with_options(page, width, height) {
        Ok(stream) => stream,
        Err(first_error) => {
            println!(
                "[native-pdf-print] RenderWithOptions failed at {}x{}: {}",
                width, height, first_error
            );
            let reduced_width = (width / 2).max(1);
            let reduced_height = (height / 2).max(1);
            match render_to_stream_with_options(page, reduced_width, reduced_height) {
                Ok(stream) => stream,
                Err(second_error) => {
                    println!(
                        "[native-pdf-print] RenderWithOptions retry failed at {}x{}: {}",
                        reduced_width, reduced_height, second_error
                    );
                    match render_to_stream_default(page) {
                        Ok(stream) => stream,
                        Err(third_error) => {
                            return Err(Error::PrintCommandFailed(format!(
                                "Render failed after retries: {}; {}; {}",
                                first_error, second_error, third_error
                            )));
                        }
                    }
                }
            }
        }
    };

    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|e| Error::PrintCommandFailed(e.to_string()))?;
    let decoder = decoder.get().map_err(|e| Error::PrintCommandFailed(e.to_string()))?;
    let software = decoder
        .GetSoftwareBitmapAsync()
        .map_err(|e| Error::PrintCommandFailed(e.to_string()))?;
    let mut software = software.get().map_err(|e| Error::PrintCommandFailed(e.to_string()))?;
    if software.BitmapPixelFormat().map_err(|e| Error::PrintCommandFailed(e.to_string()))?
        != BitmapPixelFormat::Bgra8
    {
        software = SoftwareBitmap::Convert(&software, BitmapPixelFormat::Bgra8)
            .map_err(|e| Error::PrintCommandFailed(e.to_string()))?;
    }

    let pixel_width = software
        .PixelWidth()
        .map_err(|e| Error::PrintCommandFailed(e.to_string()))? as usize;
    let pixel_height = software
        .PixelHeight()
        .map_err(|e| Error::PrintCommandFailed(e.to_string()))? as usize;
    let total_bytes = (pixel_width * pixel_height * 4) as u32;
    let buffer = Buffer::Create(total_bytes)
        .map_err(|e| Error::PrintCommandFailed(e.to_string()))?;
    software
        .CopyToBuffer(&buffer)
        .map_err(|e| Error::PrintCommandFailed(e.to_string()))?;
    let reader = DataReader::FromBuffer(&buffer)
        .map_err(|e| Error::PrintCommandFailed(e.to_string()))?;
    let mut out = vec![0u8; total_bytes as usize];
    reader
        .ReadBytes(&mut out)
        .map_err(|e| Error::PrintCommandFailed(e.to_string()))?;
    Ok((out, pixel_width as u32, pixel_height as u32))
}

fn get_cached_printers() -> Option<Vec<PrinterInfo>> {
    let cache = PRINTER_CACHE.get_or_init(|| Mutex::new(None));
    let mut guard = cache.lock().ok()?;
    if let Some(entry) = guard.as_ref() {
        if entry.fetched_at.elapsed() <= CACHE_TTL {
            return Some(entry.value.clone());
        }
    }
    *guard = None;
    None
}

fn set_cached_printers(value: Vec<PrinterInfo>) {
    let cache = PRINTER_CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = cache.lock() {
        *guard = Some(Cache {
            value,
            fetched_at: Instant::now(),
        });
    }
}

fn get_cached_media(printer: &str) -> Option<Vec<MediaOption>> {
    let cache = MEDIA_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let guard = cache.lock().ok()?;
    if let Some(entry) = guard.get(printer) {
        if entry.fetched_at.elapsed() <= CACHE_TTL {
            return Some(entry.value.clone());
        }
    }
    None
}

fn set_cached_media(printer: String, value: Vec<MediaOption>) {
    let cache = MEDIA_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(mut guard) = cache.lock() {
        guard.insert(
            printer,
            Cache {
                value,
                fetched_at: Instant::now(),
            },
        );
    }
}
