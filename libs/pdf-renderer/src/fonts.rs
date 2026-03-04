use std::collections::HashMap;

use crate::style::{FontFace, FontStyle};

/// Key for looking up a font face
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct FontKey {
    pub family: String,
    pub weight: u16,
    pub style: FontStyle,
}

/// Loaded font collection with parsed face data
pub struct FontCollection {
    /// Raw font data kept alive for ttf-parser references
    font_data: Vec<FontFace>,
    /// Index from font key to position in font_data
    index: HashMap<FontKey, usize>,
}

impl FontCollection {
    pub fn font_data(&self) -> &[FontFace] {
        &self.font_data
    }

    /// Look up a font face by family, weight, style.
    /// Falls back to: closest weight → normal style → first font.
    pub fn find(&self, family: &str, weight: u16, style: FontStyle) -> Option<&FontFace> {
        // Exact match
        let key = FontKey {
            family: family.to_string(),
            weight,
            style,
        };
        if let Some(&idx) = self.index.get(&key) {
            return Some(&self.font_data[idx]);
        }

        // Try normal style with same weight
        if style != FontStyle::Normal {
            let fallback_key = FontKey {
                family: family.to_string(),
                weight,
                style: FontStyle::Normal,
            };
            if let Some(&idx) = self.index.get(&fallback_key) {
                return Some(&self.font_data[idx]);
            }
        }

        // Try weight 400 normal
        let default_key = FontKey {
            family: family.to_string(),
            weight: 400,
            style: FontStyle::Normal,
        };
        if let Some(&idx) = self.index.get(&default_key) {
            return Some(&self.font_data[idx]);
        }

        // Return any font in this family
        for (k, &idx) in &self.index {
            if k.family == family {
                return Some(&self.font_data[idx]);
            }
        }

        // Return the first font we have
        self.font_data.first()
    }

    /// Shape text and return total advance width in points
    pub fn measure_text(
        &self,
        text: &str,
        family: &str,
        weight: u16,
        style: FontStyle,
        font_size: f32,
    ) -> f32 {
        let Some(font_face) = self.find(family, weight, style) else {
            // No fonts loaded — estimate based on font size
            return text.len() as f32 * font_size * 0.6;
        };

        let Ok(face) = ttf_parser::Face::parse(&font_face.data, 0) else {
            return text.len() as f32 * font_size * 0.6;
        };

        let mut rb_face = rustybuzz::Face::from_face(face);
        rb_face.set_points_per_em(Some(font_size));

        let mut buffer = rustybuzz::UnicodeBuffer::new();
        buffer.push_str(text);

        let output = rustybuzz::shape(&rb_face, &[], buffer);
        let positions = output.glyph_positions();

        let units_per_em = rb_face.units_per_em() as f32;
        let scale = font_size / units_per_em;

        positions
            .iter()
            .map(|pos| pos.x_advance as f32 * scale)
            .sum()
    }

    /// Break text into lines that fit within max_width, returning line widths.
    /// Uses greedy line breaking with unicode-linebreak for break opportunities.
    pub fn break_text_into_lines(
        &self,
        text: &str,
        family: &str,
        weight: u16,
        style: FontStyle,
        font_size: f32,
        max_width: f32,
    ) -> Vec<f32> {
        if text.is_empty() {
            return vec![0.0];
        }

        // For nowrap, just return a single line
        if max_width <= 0.0 || max_width.is_infinite() {
            return vec![self.measure_text(text, family, weight, style, font_size)];
        }

        let break_opportunities: Vec<(usize, unicode_linebreak::BreakOpportunity)> =
            unicode_linebreak::linebreaks(text).collect();

        let mut lines: Vec<f32> = Vec::new();
        let mut line_start = 0;
        let mut last_break_pos = 0;
        let mut width_at_last_break = 0.0;

        for &(pos, _opportunity) in &break_opportunities {
            let segment = &text[line_start..pos];
            let segment_width = self.measure_text(segment, family, weight, style, font_size);

            if segment_width > max_width && last_break_pos > line_start {
                lines.push(width_at_last_break);
                line_start = last_break_pos;
                width_at_last_break = self.measure_text(
                    &text[line_start..pos],
                    family,
                    weight,
                    style,
                    font_size,
                );
            } else {
                width_at_last_break = segment_width;
            }

            last_break_pos = pos;
        }

        // Remaining text
        if line_start < text.len() {
            let remaining_width =
                self.measure_text(&text[line_start..], family, weight, style, font_size);
            lines.push(remaining_width);
        } else if lines.is_empty() {
            lines.push(0.0);
        }

        lines
    }
}

pub fn load_fonts(font_faces: &[FontFace]) -> FontCollection {
    let mut index = HashMap::new();
    let mut font_data = Vec::new();

    for face in font_faces {
        // Verify the TTF data is valid
        if ttf_parser::Face::parse(&face.data, 0).is_ok() {
            let key = FontKey {
                family: face.family.clone(),
                weight: face.weight,
                style: face.style,
            };
            let idx = font_data.len();
            font_data.push(face.clone());
            index.insert(key, idx);
        }
    }

    FontCollection { font_data, index }
}
