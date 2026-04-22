use rustybuzz::{Face, UnicodeBuffer};
use typst_library::layout::{Abs, Em};
use typst_library::text::{Font, Glyph};

/// Shape a text string using rustybuzz, producing typst Glyphs.
pub fn shape_text(
    _font: &Font,
    face: &Face<'_>,
    text: &str,
    _size: Abs,
) -> Vec<Glyph> {
    let mut buffer = UnicodeBuffer::new();
    buffer.push_str(text);

    let glyphs_output = rustybuzz::shape(face, &[], buffer);
    let infos = glyphs_output.glyph_infos();
    let positions = glyphs_output.glyph_positions();

    let units_per_em = f64::from(face.units_per_em());

    infos
        .iter()
        .zip(positions.iter())
        .map(|(info, pos)| {
            Glyph {
                id: info.glyph_id.try_into().unwrap_or(0),
                x_advance: Em::new(f64::from(pos.x_advance) / units_per_em),
                x_offset: Em::new(f64::from(pos.x_offset) / units_per_em),
                y_advance: Em::new(f64::from(pos.y_advance) / units_per_em),
                y_offset: Em::new(f64::from(pos.y_offset) / units_per_em),
                range: 0..text.len() as u16,
                span: (typst_syntax::Span::detached(), 0),
            }
        })
        .collect()
}

/// Measure the width of shaped text in absolute units.
pub fn measure_text_width(face: &Face<'_>, text: &str, size: Abs) -> Abs {
    let mut buffer = UnicodeBuffer::new();
    buffer.push_str(text);

    let output = rustybuzz::shape(face, &[], buffer);
    let positions = output.glyph_positions();

    let units_per_em = f64::from(face.units_per_em());
    let total_advance: f64 = positions
        .iter()
        .map(|p| f64::from(p.x_advance))
        .sum();

    Abs::pt(total_advance / units_per_em * size.to_pt())
}
