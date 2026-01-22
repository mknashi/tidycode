# Tauri Plugin: Native PDF Print

This plugin prints PDF files through OS-native spoolers without invoking external PDF viewer apps.

## Notes
- macOS/Linux: uses CUPS via `lp` and expects the system PDF filter chain to handle the file.
- Windows: sends the PDF bytes as RAW data to the print spooler. This works when the target printer or driver supports PDF natively. If not, a PDF rendering pipeline (PDFium/Poppler) is required.

## Commands
- `print_pdf(options)`
- `print_pdf_bytes(options)`
- `get_printers()`
- `get_default_printer()`
- `get_printer_media(printer_name)`

## Media lookup
- macOS/Linux: parsed from `lpoptions -l` for the selected printer.
- Windows: uses `System.Drawing.Printing.PrinterSettings` to list PaperSizes.

## Required permissions
Add `native-pdf-print:default` to your Tauri capabilities.

## TODO
- Optional PDF render pipeline for Windows printers that do not accept raw PDFs.
- Printer settings support (copies, duplex, color).
- Extend paper size support beyond macOS and add tray selection.
