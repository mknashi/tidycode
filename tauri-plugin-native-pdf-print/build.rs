const COMMANDS: &[&str] = &[
    "print_pdf",
    "print_pdf_bytes",
    "get_printers",
    "get_default_printer",
    "get_printer_media",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
