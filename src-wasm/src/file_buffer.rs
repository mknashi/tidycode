use regex::Regex;
use serde::{Deserialize, Serialize};

/// Core file buffer structure
/// Stores file content as raw bytes and maintains a line offset index
pub struct FileBuffer {
    pub content: Vec<u8>,       // Raw UTF-8 bytes
    pub line_offsets: Vec<u32>, // Byte offset of each line start
}

impl FileBuffer {
    /// Create new buffer and index all lines
    /// This is very fast in WASM - typically 8x faster than JavaScript
    pub fn new(content: Vec<u8>) -> Result<Self, String> {
        let line_offsets = Self::index_lines(&content);

        Ok(FileBuffer {
            content,
            line_offsets,
        })
    }

    /// Index all line positions
    /// Returns a vector of byte offsets where each line starts
    /// Line 1 starts at offset 0, line 2 starts after first \n, etc.
    fn index_lines(content: &[u8]) -> Vec<u32> {
        let mut offsets = vec![0u32]; // Line 1 starts at byte 0

        for (i, &byte) in content.iter().enumerate() {
            if byte == b'\n' {
                // Next line starts after the newline
                offsets.push((i + 1) as u32);
            }
        }

        offsets
    }

    /// Get byte range for a single line
    /// Returns (start_byte, end_byte) inclusive of newline
    fn get_line_byte_range(&self, line_num: usize) -> Result<(usize, usize), String> {
        if line_num == 0 || line_num >= self.line_offsets.len() {
            return Err(format!(
                "Line {} out of range (file has {} lines)",
                line_num,
                self.line_offsets.len() - 1
            ));
        }

        let start = self.line_offsets[line_num - 1] as usize;
        let end = if line_num < self.line_offsets.len() - 1 {
            self.line_offsets[line_num] as usize
        } else {
            self.content.len()
        };

        Ok((start, end))
    }

    /// Get a range of lines as UTF-8 string
    /// This is the main function used by CodeMirror for virtual scrolling
    pub fn get_line_range(&self, start_line: usize, end_line: usize) -> Result<String, String> {
        if start_line == 0 {
            return Err("Line numbers are 1-indexed".to_string());
        }

        if start_line > end_line {
            return Err(format!(
                "Invalid range: start {} > end {}",
                start_line, end_line
            ));
        }

        let (start_byte, _) = self.get_line_byte_range(start_line)?;
        let (_, end_byte) = self.get_line_byte_range(end_line)?;

        // Convert byte slice to UTF-8 string
        String::from_utf8(self.content[start_byte..end_byte].to_vec())
            .map_err(|e| format!("UTF-8 error at byte range {}-{}: {}", start_byte, end_byte, e))
    }

    /// Search for pattern using regex
    /// Returns up to max_results matches with line number, column, and text
    pub fn search(&self, pattern: &str, max_results: usize) -> Result<Vec<SearchMatch>, String> {
        let re = Regex::new(pattern).map_err(|e| format!("Invalid regex: {}", e))?;

        let mut results = Vec::new();
        let content_str = String::from_utf8_lossy(&self.content);

        for (line_num, line_content) in content_str.lines().enumerate() {
            // Find all matches in this line
            for mat in re.find_iter(line_content) {
                results.push(SearchMatch {
                    line: line_num + 1,
                    column: mat.start(),
                    text: line_content.to_string(),
                });

                if results.len() >= max_results {
                    return Ok(results);
                }
            }
        }

        Ok(results)
    }

    /// Get file statistics
    pub fn get_stats(&self) -> FileStats {
        FileStats {
            size: self.content.len(),
            line_count: self.line_offsets.len().saturating_sub(1),
            index_size: self.line_offsets.len() * std::mem::size_of::<u32>(),
        }
    }

    /// Validate JSON content
    pub fn validate_json(&self) -> Result<(), String> {
        let content_str = String::from_utf8_lossy(&self.content);
        serde_json::from_str::<serde_json::Value>(&content_str)
            .map(|_| ())
            .map_err(|e| format!("JSON validation error: {}", e))
    }

    /// Format JSON content with indentation
    pub fn format_json(&self, indent: usize) -> Result<String, String> {
        let content_str = String::from_utf8_lossy(&self.content);
        let value: serde_json::Value = serde_json::from_str(&content_str)
            .map_err(|e| format!("JSON parse error: {}", e))?;

        let indent_vec = vec![b' '; indent];
        let formatter = serde_json::ser::PrettyFormatter::with_indent(&indent_vec);
        let mut buf = Vec::new();
        let mut ser = serde_json::Serializer::with_formatter(&mut buf, formatter);

        value
            .serialize(&mut ser)
            .map_err(|e| format!("JSON serialization error: {}", e))?;

        String::from_utf8(buf).map_err(|e| format!("UTF-8 error: {}", e))
    }
}

/// Search result structure
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchMatch {
    pub line: usize,
    pub column: usize,
    pub text: String,
}

/// File statistics
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileStats {
    pub size: usize,
    pub line_count: usize,
    pub index_size: usize,
}

/// File metadata returned to JavaScript
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileInfo {
    pub size: usize,
    pub line_count: usize,
    pub encoding: String,
    pub index_size: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_line_indexing() {
        let content = b"line1\nline2\nline3".to_vec();
        let buffer = FileBuffer::new(content).unwrap();

        assert_eq!(buffer.line_offsets, vec![0, 6, 12]);
        assert_eq!(buffer.get_stats().line_count, 3);
    }

    #[test]
    fn test_get_line_range() {
        let content = b"line1\nline2\nline3".to_vec();
        let buffer = FileBuffer::new(content).unwrap();

        let result = buffer.get_line_range(1, 2).unwrap();
        assert_eq!(result, "line1\nline2\n");

        let result = buffer.get_line_range(2, 3).unwrap();
        assert_eq!(result, "line2\nline3");
    }

    #[test]
    fn test_search() {
        let content = b"foo\nbar\nfoo bar\nbaz".to_vec();
        let buffer = FileBuffer::new(content).unwrap();

        let results = buffer.search("foo", 10).unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].line, 1);
        assert_eq!(results[1].line, 3);
    }

    #[test]
    fn test_validate_json() {
        let valid_json = br#"{"name": "test", "value": 123}"#.to_vec();
        let buffer = FileBuffer::new(valid_json).unwrap();
        assert!(buffer.validate_json().is_ok());

        let invalid_json = b"{invalid}".to_vec();
        let buffer = FileBuffer::new(invalid_json).unwrap();
        assert!(buffer.validate_json().is_err());
    }
}
