use std::cell::RefCell;
use std::collections::HashMap;

use crate::style::{FontFace, FontStyle};

/// Key for looking up a font face
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct FontKey {
    pub family: String,
    pub weight: u16,
    pub style: FontStyle,
}

/// Pre-computed font metrics to avoid re-parsing ttf_parser::Face
struct FontMetrics {
    units_per_em: f32,
    ascender: f32,
    descender: f32,
    line_gap: f32,
}

/// Cache key for text measurement results
#[derive(Hash, Eq, PartialEq)]
struct MeasureCacheKey {
    text: String,
    font_idx: usize,
    font_size_bits: u32,
}

/// Loaded font collection with parsed face data and measurement caches
pub struct FontCollection {
    /// Raw font data kept alive for ttf-parser references
    font_data: Vec<FontFace>,
    /// Index from font key to position in font_data
    index: HashMap<FontKey, usize>,
    /// Pre-computed metrics per font (parallel to font_data)
    metrics: Vec<FontMetrics>,
    /// Cache: font lookup results (family, weight, style) → font_data index
    find_cache: RefCell<HashMap<FontKey, Option<usize>>>,
    /// Cache: text shaping results
    measure_cache: RefCell<HashMap<MeasureCacheKey, f32>>,
}

impl FontCollection {
    pub fn font_data(&self) -> &[FontFace] {
        &self.font_data
    }

    /// Look up a font face index by family, weight, style.
    /// Falls back to: closest weight → normal style → first font.
    fn find_idx(&self, family: &str, weight: u16, style: FontStyle) -> Option<usize> {
        let key = FontKey {
            family: family.to_string(),
            weight,
            style,
        };

        if let Some(&cached) = self.find_cache.borrow().get(&key) {
            return cached;
        }

        let result = self.find_idx_uncached(family, weight, style);
        self.find_cache.borrow_mut().insert(key, result);
        result
    }

    fn find_idx_uncached(&self, family: &str, weight: u16, style: FontStyle) -> Option<usize> {
        // Exact match
        let key = FontKey {
            family: family.to_string(),
            weight,
            style,
        };
        if let Some(&idx) = self.index.get(&key) {
            return Some(idx);
        }

        // Try normal style with same weight
        if style != FontStyle::Normal {
            let fallback_key = FontKey {
                family: family.to_string(),
                weight,
                style: FontStyle::Normal,
            };
            if let Some(&idx) = self.index.get(&fallback_key) {
                return Some(idx);
            }
        }

        // Try weight 400 normal
        let default_key = FontKey {
            family: family.to_string(),
            weight: 400,
            style: FontStyle::Normal,
        };
        if let Some(&idx) = self.index.get(&default_key) {
            return Some(idx);
        }

        // Return any font in this family
        for (k, &idx) in &self.index {
            if k.family == family {
                return Some(idx);
            }
        }

        // Return the first font we have
        if self.font_data.is_empty() {
            None
        } else {
            Some(0)
        }
    }

    /// Look up a font face by family, weight, style.
    pub fn find(&self, family: &str, weight: u16, style: FontStyle) -> Option<&FontFace> {
        self.find_idx(family, weight, style)
            .map(|idx| &self.font_data[idx])
    }

    /// Get the ascender ratio (ascender / units_per_em) for a font.
    pub fn ascender_ratio(&self, family: &str, weight: u16, style: FontStyle) -> f32 {
        let Some(idx) = self.find_idx(family, weight, style) else {
            return 0.8;
        };
        let m = &self.metrics[idx];
        m.ascender / m.units_per_em
    }

    /// Get the content area height ratio ((ascender - descender) / units_per_em).
    /// This is the height of the font's content area relative to font_size,
    /// used for CSS half-leading calculation.
    pub fn content_area_ratio(&self, family: &str, weight: u16, style: FontStyle) -> f32 {
        let Some(idx) = self.find_idx(family, weight, style) else {
            return 1.2;
        };
        let m = &self.metrics[idx];
        (m.ascender - m.descender) / m.units_per_em
    }

    /// Get the line height ratio for a font.
    pub fn line_height_ratio(&self, family: &str, weight: u16, style: FontStyle) -> f32 {
        let Some(idx) = self.find_idx(family, weight, style) else {
            return 1.2;
        };
        let m = &self.metrics[idx];
        (m.ascender - m.descender + m.line_gap) / m.units_per_em
    }

    /// Shape text and return total advance width in points.
    /// Results are cached by (text, font, size).
    pub fn measure_text(
        &self,
        text: &str,
        family: &str,
        weight: u16,
        style: FontStyle,
        font_size: f32,
    ) -> f32 {
        let Some(font_idx) = self.find_idx(family, weight, style) else {
            return text.len() as f32 * font_size * 0.6;
        };

        let cache_key = MeasureCacheKey {
            text: text.to_string(),
            font_idx,
            font_size_bits: font_size.to_bits(),
        };

        if let Some(&cached) = self.measure_cache.borrow().get(&cache_key) {
            return cached;
        }

        let width = self.shape_text(text, font_idx, font_size);
        self.measure_cache.borrow_mut().insert(cache_key, width);
        width
    }

    /// Run text shaping (uncached) and return total advance width in points.
    fn shape_text(&self, text: &str, font_idx: usize, font_size: f32) -> f32 {
        let font_face = &self.font_data[font_idx];
        let Ok(face) = ttf_parser::Face::parse(&font_face.data, 0) else {
            return text.len() as f32 * font_size * 0.6;
        };

        let mut rb_face = rustybuzz::Face::from_face(face);
        rb_face.set_points_per_em(Some(font_size));

        let mut buffer = rustybuzz::UnicodeBuffer::new();
        buffer.push_str(text);

        // Disable ligatures to match CSS `font-variant-ligatures: none`
        let features = [
            rustybuzz::Feature::new(ttf_parser::Tag::from_bytes(b"liga"), 0, ..),
            rustybuzz::Feature::new(ttf_parser::Tag::from_bytes(b"clig"), 0, ..),
        ];
        let output = rustybuzz::shape(&rb_face, &features, buffer);
        let positions = output.glyph_positions();

        let units_per_em = rb_face.units_per_em() as f32;
        let scale = font_size / units_per_em;

        positions
            .iter()
            .map(|pos| pos.x_advance as f32 * scale)
            .sum()
    }

    /// Shape text and return KrillaGlyph objects for use with draw_glyphs.
    /// Uses the same shaping features (liga=0, clig=0) as measure_text.
    pub fn shape_glyphs(
        &self,
        text: &str,
        family: &str,
        weight: u16,
        style: FontStyle,
        font_size: f32,
    ) -> Vec<krilla::text::KrillaGlyph> {
        let Some(font_idx) = self.find_idx(family, weight, style) else {
            return Vec::new();
        };
        let font_face = &self.font_data[font_idx];
        let Ok(face) = ttf_parser::Face::parse(&font_face.data, 0) else {
            return Vec::new();
        };

        let mut rb_face = rustybuzz::Face::from_face(face);
        rb_face.set_points_per_em(Some(font_size));

        let mut buffer = rustybuzz::UnicodeBuffer::new();
        buffer.push_str(text);

        let features = [
            rustybuzz::Feature::new(ttf_parser::Tag::from_bytes(b"liga"), 0, ..),
            rustybuzz::Feature::new(ttf_parser::Tag::from_bytes(b"clig"), 0, ..),
        ];
        let output = rustybuzz::shape(&rb_face, &features, buffer);
        let positions = output.glyph_positions();
        let infos = output.glyph_infos();
        let units_per_em = rb_face.units_per_em() as f32;

        let mut glyphs = Vec::with_capacity(output.len());
        for i in 0..output.len() {
            let pos = &positions[i];
            let info = &infos[i];
            let start = info.cluster as usize;
            let end = if i + 1 < output.len() {
                infos[i + 1].cluster as usize
            } else {
                text.len()
            };
            glyphs.push(krilla::text::KrillaGlyph::new(
                krilla::text::GlyphId::new(info.glyph_id),
                pos.x_advance as f32 / units_per_em,
                pos.x_offset as f32 / units_per_em,
                pos.y_offset as f32 / units_per_em,
                pos.y_advance as f32 / units_per_em,
                start..end,
                None,
            ));
        }
        glyphs
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
            // Per CSS Text Level 3 §4.2, trailing whitespace at a line break
            // "hangs" and is not measured for line-breaking purposes. Measure
            // the segment without trailing whitespace for the overflow check.
            let segment = &text[line_start..pos];
            let trimmed = segment.trim_end();
            let trimmed_width = self.measure_text(trimmed, family, weight, style, font_size);

            if trimmed_width > max_width && last_break_pos > line_start {
                lines.push(width_at_last_break);
                line_start = last_break_pos;
                let new_segment = text[line_start..pos].trim_end();
                width_at_last_break =
                    self.measure_text(new_segment, family, weight, style, font_size);
            } else {
                width_at_last_break = trimmed_width;
            }

            last_break_pos = pos;
        }

        // Remaining text
        if line_start < text.len() {
            let remaining = text[line_start..].trim_end();
            let remaining_width =
                self.measure_text(remaining, family, weight, style, font_size);
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
    let mut metrics = Vec::new();

    for face in font_faces {
        if let Ok(parsed) = ttf_parser::Face::parse(&face.data, 0) {
            let key = FontKey {
                family: face.family.clone(),
                weight: face.weight,
                style: face.style,
            };
            let idx = font_data.len();
            font_data.push(face.clone());

            // Use OS/2 win metrics when available to match Chromium's behavior.
            // Chromium uses usWinAscent/usWinDescent for the content area when
            // USE_TYPO_METRICS is not set.
            let (ascender, descender, line_gap) =
                if let Some(os2) = parsed.tables().os2 {
                    if os2.use_typographic_metrics() {
                        (
                            f32::from(os2.typographic_ascender()),
                            f32::from(os2.typographic_descender()),
                            f32::from(os2.typographic_line_gap()),
                        )
                    } else {
                        (
                            f32::from(os2.windows_ascender()),
                            f32::from(os2.windows_descender()),
                            0.0,
                        )
                    }
                } else {
                    (
                        f32::from(parsed.ascender()),
                        f32::from(parsed.descender()),
                        f32::from(parsed.line_gap()),
                    )
                };

            metrics.push(FontMetrics {
                units_per_em: f32::from(parsed.units_per_em()),
                ascender,
                descender,
                line_gap,
            });
            index.insert(key, idx);
        }
    }

    FontCollection {
        font_data,
        index,
        metrics,
        find_cache: RefCell::new(HashMap::new()),
        measure_cache: RefCell::new(HashMap::new()),
    }
}
