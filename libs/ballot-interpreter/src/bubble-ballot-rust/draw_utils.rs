//! Inlined drawing utilities, replacing the `imageproc` drawing functions we
//! previously used. All functions operate directly on `RgbImage` with our own
//! `Rect` type so no external drawing crate is required.

use ab_glyph::{point, Font, GlyphId, OutlinedGlyph, PxScale, Rect as GlyphRect, ScaleFont};
use image::{Rgb, RgbImage};
use types_rs::geometry::Rect;

// ---------------------------------------------------------------------------
// Contrast helpers (moved here from image_utils and callers)
// ---------------------------------------------------------------------------

/// Draws a filled cross (+ shape, 3×3 pixels) on `canvas` at `(x, y)`.
///
/// Handles coordinates outside image bounds.
pub(crate) fn draw_cross_mut(canvas: &mut RgbImage, color: Rgb<u8>, x: i32, y: i32) {
    let (width, height) = canvas.dimensions();
    #[rustfmt::skip]
    let stencil = [
        0u8, 1u8, 0u8,
        1u8, 1u8, 1u8,
        0u8, 1u8, 0u8,
    ];
    for sy in -1i32..=1 {
        let iy = y + sy;
        if iy < 0 || iy >= height as i32 {
            continue;
        }
        for sx in -1i32..=1 {
            let ix = x + sx;
            if ix < 0 || ix >= width as i32 {
                continue;
            }
            let idx = (3 * (sy + 1) + (sx + 1)) as usize;
            if stencil[idx] == 1 {
                canvas.put_pixel(ix as u32, iy as u32, color);
            }
        }
    }
}

/// Draws a filled rectangle on `canvas`.
///
/// Clips to image bounds.
pub(crate) fn draw_filled_rect_mut(canvas: &mut RgbImage, rect: Rect, color: Rgb<u8>) {
    let (w, h) = canvas.dimensions();
    let x0 = rect.left().max(0) as u32;
    let y0 = rect.top().max(0) as u32;
    let x1 = (rect.left() + rect.width() as i32).min(w as i32) as u32;
    let y1 = (rect.top() + rect.height() as i32).min(h as i32) as u32;
    for y in y0..y1 {
        for x in x0..x1 {
            canvas.put_pixel(x, y, color);
        }
    }
}

/// Draws the outline of a rectangle on `canvas`.
///
/// Clips to image bounds.
pub(crate) fn draw_hollow_rect_mut(canvas: &mut RgbImage, rect: Rect, color: Rgb<u8>) {
    let left = rect.left() as f32;
    let right = rect.right() as f32;
    let top = rect.top() as f32;
    let bottom = rect.bottom() as f32;
    draw_line_segment_mut(canvas, (left, top), (right, top), color);
    draw_line_segment_mut(canvas, (left, bottom), (right, bottom), color);
    draw_line_segment_mut(canvas, (left, top), (left, bottom), color);
    draw_line_segment_mut(canvas, (right, top), (right, bottom), color);
}

/// Draws a line segment between `start` and `end` using Bresenham's algorithm.
///
/// Clips to image bounds.
pub(crate) fn draw_line_segment_mut(
    canvas: &mut RgbImage,
    start: (f32, f32),
    end: (f32, f32),
    color: Rgb<u8>,
) {
    let (w, h) = canvas.dimensions();
    let (mut x0, mut y0) = (start.0, start.1);
    let (mut x1, mut y1) = (end.0, end.1);

    let is_steep = (y1 - y0).abs() > (x1 - x0).abs();
    if is_steep {
        std::mem::swap(&mut x0, &mut y0);
        std::mem::swap(&mut x1, &mut y1);
    }
    if x0 > x1 {
        std::mem::swap(&mut x0, &mut x1);
        std::mem::swap(&mut y0, &mut y1);
    }

    let dx = x1 - x0;
    let dy = (y1 - y0).abs();
    let mut error = dx / 2.0;
    let y_step: i32 = if y0 < y1 { 1 } else { -1 };
    let mut y = y0 as i32;
    let x_end = x1 as i32;

    let mut x = x0 as i32;
    while x <= x_end {
        let (px, py) = if is_steep { (y, x) } else { (x, y) };
        if px >= 0 && py >= 0 && (px as u32) < w && (py as u32) < h {
            canvas.put_pixel(px as u32, py as u32, color);
        }
        x += 1;
        error -= dy;
        if error < 0.0 {
            y += y_step;
            error += dx;
        }
    }
}

// ---------------------------------------------------------------------------
// Text rendering (using ab_glyph directly)
// ---------------------------------------------------------------------------

fn layout_glyphs(
    scale: impl Into<PxScale> + Copy,
    font: &impl Font,
    text: &str,
    mut f: impl FnMut(OutlinedGlyph, GlyphRect),
) -> (u32, u32) {
    let (mut w, mut h) = (0f32, 0f32);
    let font = font.as_scaled(scale);
    let mut last: Option<GlyphId> = None;

    for c in text.chars() {
        let glyph_id = font.glyph_id(c);
        let glyph = glyph_id.with_scale_and_position(scale, point(w, font.ascent()));
        w += font.h_advance(glyph_id);
        if let Some(g) = font.outline_glyph(glyph) {
            if let Some(last_id) = last {
                w += font.kern(glyph_id, last_id);
            }
            last = Some(glyph_id);
            let bb = g.px_bounds();
            h = h.max(bb.height());
            f(g, bb);
        }
    }

    (w as u32, h as u32)
}

/// Returns the pixel `(width, height)` of `text` rendered at `scale`.
pub(crate) fn text_size(
    scale: impl Into<PxScale> + Copy,
    font: &impl Font,
    text: &str,
) -> (u32, u32) {
    layout_glyphs(scale, font, text, |_, _| {})
}

/// Draws `text` on `canvas` at `(x, y)` with the given color.
///
/// Uses sub-pixel anti-aliasing blended against the existing pixel.
pub(crate) fn draw_text_mut(
    canvas: &mut RgbImage,
    color: Rgb<u8>,
    x: i32,
    y: i32,
    scale: impl Into<PxScale> + Copy,
    font: &impl Font,
    text: &str,
) {
    let (img_w, img_h) = canvas.dimensions();
    let (img_w, img_h) = (img_w as i32, img_h as i32);

    layout_glyphs(scale, font, text, |g, bb| {
        g.draw(|gx, gy, gv| {
            let px = gx as i32 + x + bb.min.x.round() as i32;
            let py = gy as i32 + y + bb.min.y.round() as i32;
            if (0..img_w).contains(&px) && (0..img_h).contains(&py) {
                let bg = canvas.get_pixel(px as u32, py as u32).0;
                let fg = color.0;
                let blended = std::array::from_fn(|i| {
                    ((1.0 - gv) * f32::from(bg[i]) + gv * f32::from(fg[i])).round() as u8
                });
                canvas.put_pixel(px as u32, py as u32, Rgb(blended));
            }
        });
    });
}
