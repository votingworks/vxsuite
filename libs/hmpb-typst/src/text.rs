use rustybuzz::{Face, UnicodeBuffer};
use typst_library::layout::{Abs, Em};
use typst_library::text::{Font, Glyph, TextItem};
use typst_library::visualize::Paint;

/// Pre-parsed font bundle: typst Font + owned font data for rustybuzz.
pub struct FontBundle {
    pub font: Font,
    face_data: Vec<u8>,
}

impl FontBundle {
    pub fn new(data: Vec<u8>) -> Result<Self, String> {
        let font_bytes = typst_library::foundations::Bytes::new(data.clone());
        let font = Font::new(font_bytes, 0)
            .ok_or_else(|| "Failed to load font".to_string())?;
        // Validate the face can be parsed
        Face::from_slice(&data, 0)
            .ok_or_else(|| "Failed to parse font face".to_string())?;
        Ok(Self { font, face_data: data })
    }

    /// Borrow a rustybuzz Face. Cheap — just parses headers.
    fn face(&self) -> Face<'_> {
        Face::from_slice(&self.face_data, 0).expect("face validated at construction")
    }

    /// Shape text and return typst Glyphs.
    pub fn shape(&self, text: &str, _size: Abs) -> Vec<Glyph> {
        let face = self.face();
        let mut buffer = UnicodeBuffer::new();
        buffer.push_str(text);

        let output = rustybuzz::shape(&face, &[], buffer);
        let infos = output.glyph_infos();
        let positions = output.glyph_positions();
        let units_per_em = f64::from(face.units_per_em());

        infos
            .iter()
            .zip(positions.iter())
            .map(|(info, pos)| Glyph {
                id: info.glyph_id.try_into().unwrap_or(0),
                x_advance: Em::new(f64::from(pos.x_advance) / units_per_em),
                x_offset: Em::new(f64::from(pos.x_offset) / units_per_em),
                y_advance: Em::new(f64::from(pos.y_advance) / units_per_em),
                y_offset: Em::new(f64::from(pos.y_offset) / units_per_em),
                range: 0..text.len() as u16,
                span: (typst_syntax::Span::detached(), 0),
            })
            .collect()
    }

    /// Measure the width of text at a given font size, in points.
    pub fn measure_width(&self, text: &str, size: Abs) -> Abs {
        let face = self.face();
        let mut buffer = UnicodeBuffer::new();
        buffer.push_str(text);

        let output = rustybuzz::shape(&face, &[], buffer);
        let units_per_em = f64::from(face.units_per_em());
        let total: f64 = output
            .glyph_positions()
            .iter()
            .map(|p| f64::from(p.x_advance))
            .sum();

        Abs::pt(total / units_per_em * size.to_pt())
    }

    /// Get the ascent of the font at a given size (distance from baseline to top).
    pub fn ascent(&self, size: Abs) -> Abs {
        let face = self.face();
        let units_per_em = f64::from(face.units_per_em());
        let ascender = f64::from(face.ascender());
        Abs::pt(ascender / units_per_em * size.to_pt())
    }

    /// Get the underline position (offset below baseline, positive = below) and thickness.
    pub fn underline_metrics(&self, size: Abs) -> (Abs, Abs) {
        let metrics = self.font.metrics();
        let pos = metrics.underline.position.at(size);
        let thickness = metrics.underline.thickness.at(size);
        // position is positive upward from baseline; we want downward offset from top
        (pos, thickness)
    }

    /// Get the strikethrough position and thickness.
    pub fn strikethrough_metrics(&self, size: Abs) -> (Abs, Abs) {
        let metrics = self.font.metrics();
        let pos = metrics.strikethrough.position.at(size);
        let thickness = metrics.strikethrough.thickness.at(size);
        (pos, thickness)
    }

    /// Create a TextItem for rendering.
    pub fn text_item(&self, text: &str, size: Abs, fill: Paint) -> TextItem {
        let glyphs = self.shape(text, size);
        TextItem {
            font: self.font.clone(),
            size,
            fill,
            stroke: None,
            lang: typst_library::text::Lang::ENGLISH,
            region: None,
            text: text.into(),
            glyphs,
        }
    }

    /// Word-wrap text to fit within max_width, returning lines.
    pub fn wrap_text(&self, text: &str, size: Abs, max_width: Abs) -> Vec<String> {
        let words: Vec<&str> = text.split_whitespace().collect();
        if words.is_empty() {
            return vec![];
        }

        let mut lines: Vec<String> = Vec::new();
        let mut current_line = String::new();
        let space_width = self.measure_width(" ", size);

        for word in &words {
            let word_width = self.measure_width(word, size);
            if current_line.is_empty() {
                current_line = (*word).to_string();
            } else {
                let line_width = self.measure_width(&current_line, size) + space_width + word_width;
                if line_width <= max_width {
                    current_line.push(' ');
                    current_line.push_str(word);
                } else {
                    lines.push(current_line);
                    current_line = (*word).to_string();
                }
            }
        }
        if !current_line.is_empty() {
            lines.push(current_line);
        }
        lines
    }
}

/// Collection of pre-loaded fonts for ballot rendering.
pub struct FontSet {
    pub regular: FontBundle,
    pub bold: FontBundle,
}

impl FontSet {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            regular: FontBundle::new(include_bytes!("../fonts/Roboto-Regular.ttf").to_vec())?,
            bold: FontBundle::new(include_bytes!("../fonts/Roboto-Bold.ttf").to_vec())?,
        })
    }
}
