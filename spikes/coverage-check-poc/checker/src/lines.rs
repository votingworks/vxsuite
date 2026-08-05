// Byte-offset <-> (line, column) conversion. Coverage reports use 1-based
// lines and 0-based UTF-16 columns (babel convention); oxc spans are UTF-8
// byte offsets. All matching happens in the report's coordinate system.

pub type LinePos = (u32, u32);

pub struct LineTable {
    line_starts: Vec<usize>,
}

impl LineTable {
    pub fn new(source: &str) -> Self {
        let mut line_starts = vec![0];
        for (i, b) in source.bytes().enumerate() {
            if b == b'\n' {
                line_starts.push(i + 1);
            }
        }
        Self { line_starts }
    }

    pub fn pos_of(&self, source: &str, offset: usize) -> LinePos {
        let line_idx = match self.line_starts.binary_search(&offset) {
            Ok(i) => i,
            Err(i) => i - 1,
        };
        let line_start = self.line_starts[line_idx];
        let col: usize = source[line_start..offset]
            .chars()
            .map(|c| c.len_utf16())
            .sum();
        (u32::try_from(line_idx + 1).unwrap(), u32::try_from(col).unwrap())
    }
}
