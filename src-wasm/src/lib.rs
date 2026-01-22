use wasm_bindgen::prelude::*;
use std::collections::HashMap;
use std::sync::Mutex;

mod file_buffer;
use file_buffer::{FileBuffer, FileInfo};

// Global file storage: file_id -> FileBuffer
// Using lazy_static pattern for global state in WASM
static FILE_BUFFERS: Mutex<Option<HashMap<u32, FileBuffer>>> = Mutex::new(None);
static NEXT_FILE_ID: Mutex<u32> = Mutex::new(1);

/// Initialize the global storage
fn ensure_initialized() {
    let mut buffers = FILE_BUFFERS.lock().unwrap();
    if buffers.is_none() {
        *buffers = Some(HashMap::new());
    }
}

/// Initialize WASM module (called once on load)
#[wasm_bindgen(start)]
pub fn init() {
    // Better panic messages in browser console
    console_error_panic_hook::set_once();

    // Initialize storage
    ensure_initialized();

    // Log initialization
    web_sys::console::log_1(&"Tidy Code WASM module initialized ✓".into());
}

/// Create a new file buffer from content
/// Returns a unique file ID that can be used to reference this buffer
#[wasm_bindgen]
pub fn create_file_buffer(content: &[u8]) -> Result<u32, JsValue> {
    ensure_initialized();

    // Generate unique file ID
    let file_id = {
        let mut next_id = NEXT_FILE_ID.lock().unwrap();
        let id = *next_id;
        *next_id += 1;
        id
    };

    // Create buffer and index lines
    let buffer = FileBuffer::new(content.to_vec())
        .map_err(|e| JsValue::from_str(&format!("Failed to create buffer: {}", e)))?;

    // Store in global map
    let mut buffers = FILE_BUFFERS.lock().unwrap();
    if let Some(map) = buffers.as_mut() {
        map.insert(file_id, buffer);
    }

    Ok(file_id)
}

/// Get file metadata
#[wasm_bindgen]
pub fn get_file_info(file_id: u32) -> Result<JsValue, JsValue> {
    ensure_initialized();

    let buffers = FILE_BUFFERS.lock().unwrap();
    if let Some(map) = buffers.as_ref() {
        let buffer = map
            .get(&file_id)
            .ok_or_else(|| JsValue::from_str(&format!("File {} not found", file_id)))?;

        let stats = buffer.get_stats();
        let info = FileInfo {
            size: stats.size,
            line_count: stats.line_count,
            encoding: "UTF-8".to_string(),
            index_size: stats.index_size,
        };

        serde_wasm_bindgen::to_value(&info)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    } else {
        Err(JsValue::from_str("Storage not initialized"))
    }
}

/// Get a range of lines
/// Lines are 1-indexed (line 1 is the first line)
#[wasm_bindgen]
pub fn get_line_range(file_id: u32, start_line: u32, end_line: u32) -> Result<String, JsValue> {
    ensure_initialized();

    let buffers = FILE_BUFFERS.lock().unwrap();
    if let Some(map) = buffers.as_ref() {
        let buffer = map
            .get(&file_id)
            .ok_or_else(|| JsValue::from_str(&format!("File {} not found", file_id)))?;

        buffer
            .get_line_range(start_line as usize, end_line as usize)
            .map_err(|e| JsValue::from_str(&e))
    } else {
        Err(JsValue::from_str("Storage not initialized"))
    }
}

/// Search file for pattern (supports regex)
/// Returns up to max_results matches
#[wasm_bindgen]
pub fn search_file(file_id: u32, pattern: &str, max_results: usize) -> Result<JsValue, JsValue> {
    ensure_initialized();

    let buffers = FILE_BUFFERS.lock().unwrap();
    if let Some(map) = buffers.as_ref() {
        let buffer = map
            .get(&file_id)
            .ok_or_else(|| JsValue::from_str(&format!("File {} not found", file_id)))?;

        let results = buffer
            .search(pattern, max_results)
            .map_err(|e| JsValue::from_str(&e))?;

        serde_wasm_bindgen::to_value(&results)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    } else {
        Err(JsValue::from_str("Storage not initialized"))
    }
}

/// Validate JSON content of a file
#[wasm_bindgen]
pub fn validate_json(file_id: u32) -> Result<bool, JsValue> {
    ensure_initialized();

    let buffers = FILE_BUFFERS.lock().unwrap();
    if let Some(map) = buffers.as_ref() {
        let buffer = map
            .get(&file_id)
            .ok_or_else(|| JsValue::from_str(&format!("File {} not found", file_id)))?;

        match buffer.validate_json() {
            Ok(_) => Ok(true),
            Err(e) => Err(JsValue::from_str(&e)),
        }
    } else {
        Err(JsValue::from_str("Storage not initialized"))
    }
}

/// Format JSON content with specified indentation
#[wasm_bindgen]
pub fn format_json(file_id: u32, indent: usize) -> Result<String, JsValue> {
    ensure_initialized();

    let buffers = FILE_BUFFERS.lock().unwrap();
    if let Some(map) = buffers.as_ref() {
        let buffer = map
            .get(&file_id)
            .ok_or_else(|| JsValue::from_str(&format!("File {} not found", file_id)))?;

        buffer
            .format_json(indent)
            .map_err(|e| JsValue::from_str(&e))
    } else {
        Err(JsValue::from_str("Storage not initialized"))
    }
}

/// Free a file buffer from memory
/// Call this when closing a tab to prevent memory leaks
#[wasm_bindgen]
pub fn free_file_buffer(file_id: u32) -> Result<(), JsValue> {
    ensure_initialized();

    let mut buffers = FILE_BUFFERS.lock().unwrap();
    if let Some(map) = buffers.as_mut() {
        map.remove(&file_id);
        Ok(())
    } else {
        Err(JsValue::from_str("Storage not initialized"))
    }
}

/// Get memory usage statistics
#[wasm_bindgen]
pub fn get_memory_stats() -> Result<JsValue, JsValue> {
    ensure_initialized();

    let buffers = FILE_BUFFERS.lock().unwrap();
    if let Some(map) = buffers.as_ref() {
        let mut total_size = 0usize;
        let mut total_index_size = 0usize;

        for buffer in map.values() {
            let stats = buffer.get_stats();
            total_size += stats.size;
            total_index_size += stats.index_size;
        }

        let stats = serde_json::json!({
            "file_count": map.len(),
            "total_content_size": total_size,
            "total_index_size": total_index_size,
            "total_size": total_size + total_index_size,
        });

        serde_wasm_bindgen::to_value(&stats)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    } else {
        Err(JsValue::from_str("Storage not initialized"))
    }
}

/// Get full file content as string
/// This is used when saving the file - content is stored in WASM, not React state
#[wasm_bindgen]
pub fn get_content(file_id: u32) -> Result<String, JsValue> {
    ensure_initialized();

    let buffers = FILE_BUFFERS.lock().unwrap();
    if let Some(map) = buffers.as_ref() {
        let buffer = map
            .get(&file_id)
            .ok_or_else(|| JsValue::from_str(&format!("File {} not found", file_id)))?;

        // Convert UTF-8 bytes to string
        String::from_utf8(buffer.content.clone())
            .map_err(|e| JsValue::from_str(&format!("UTF-8 decode error: {}", e)))
    } else {
        Err(JsValue::from_str("Storage not initialized"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::*;

    #[wasm_bindgen_test]
    fn test_create_and_get_info() {
        init();
        let content = b"Hello\nWorld\n".to_vec();
        let file_id = create_file_buffer(&content).unwrap();

        let info_js = get_file_info(file_id).unwrap();
        let info: FileInfo = serde_wasm_bindgen::from_value(info_js).unwrap();

        assert_eq!(info.line_count, 2);
        assert_eq!(info.size, 12);
    }

    #[wasm_bindgen_test]
    fn test_get_line_range() {
        init();
        let content = b"Line1\nLine2\nLine3\n".to_vec();
        let file_id = create_file_buffer(&content).unwrap();

        let result = get_line_range(file_id, 1, 2).unwrap();
        assert_eq!(result, "Line1\nLine2\n");
    }

    #[wasm_bindgen_test]
    fn test_search() {
        init();
        let content = b"foo\nbar\nfoo bar\n".to_vec();
        let file_id = create_file_buffer(&content).unwrap();

        let results_js = search_file(file_id, "foo", 10).unwrap();
        let results: Vec<SearchMatch> = serde_wasm_bindgen::from_value(results_js).unwrap();

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].line, 1);
        assert_eq!(results[1].line, 3);
    }
}
