//! Byte-offset <-> (line, column) conversion. Coverage reports use 1-based
//! lines and 0-based UTF-16 columns (babel convention); oxc spans are UTF-8
//! byte offsets. All matching happens in the report's coordinate system.

pub type LinePos = (u32, u32);

pub struct LineTable {
    line_starts: Vec<usize>,
}

impl LineTable {
    #[must_use]
    pub fn new(source: &str) -> Self {
        let mut line_starts = vec![0];
        for (i, b) in source.bytes().enumerate() {
            if b == b'\n' {
                line_starts.push(i + 1);
            }
        }
        Self { line_starts }
    }

    /// # Panics
    ///
    /// Panics if the line number or column exceeds `u32` (source files are
    /// far smaller than 4 GiB).
    #[must_use]
    pub fn pos_of(&self, source: &str, offset: usize) -> LinePos {
        let line_idx = match self.line_starts.binary_search(&offset) {
            Ok(i) => i,
            Err(i) => i - 1,
        };
        let line_start = self.line_starts[line_idx];
        let col: usize = source[line_start..offset]
            .chars()
            .map(char::len_utf16)
            .sum();
        (
            u32::try_from(line_idx + 1).expect("line number fits in u32"),
            u32::try_from(col).expect("column fits in u32"),
        )
    }

    /// Byte offset of a (line, col) position, if it exists in the source.
    #[must_use]
    pub fn offset_of(&self, source: &str, pos: LinePos) -> Option<usize> {
        let (line, col) = pos;
        let col = usize::try_from(col).ok()?;
        let line_start = *self
            .line_starts
            .get(usize::try_from(line).ok()?.checked_sub(1)?)?;
        let mut utf16_col = 0usize;
        for (i, c) in source[line_start..].char_indices() {
            if utf16_col == col {
                return Some(line_start + i);
            }
            if c == '\n' {
                return None;
            }
            utf16_col += c.len_utf16();
        }
        (utf16_col == col).then_some(source.len())
    }
}
