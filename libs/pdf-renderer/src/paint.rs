use std::sync::Arc;

use base64::Engine;
use krilla::color::rgb;
use krilla::geom::{PathBuilder, Point, Rect, Size, Transform};
use krilla::image::Image;
use krilla::num::NormalizedF32;
use krilla::paint::{Fill, FillRule};
use krilla::page::PageSettings;
use krilla::text::Font;
use krilla::{Data, Document};
use krilla_svg::{SurfaceExt, SvgSettings};
use taffy::NodeId;

use crate::fonts::FontCollection;
use crate::layout::{LayoutResult, TextContext};
use crate::style::{BackgroundSize, BorderStyle, Color, ComputedStyle, Display, Overflow, StyleResult, Visibility};

pub fn render_pdf(layout: &LayoutResult, styles: &StyleResult, fonts: &FontCollection) -> Vec<u8> {
    let mut document = Document::new();

    let page_settings = PageSettings::from_wh(layout.page_width, layout.page_height)
        .unwrap_or_else(|| PageSettings::from_wh(612.0, 792.0).expect("valid default page size"));

    // Determine total content height from root layout
    let root_layout = layout.taffy.layout(layout.root).expect("root layout");
    let total_height = root_layout.size.height;
    let page_height = layout.page_height;

    // Calculate number of pages needed
    let num_pages = if total_height <= page_height {
        1
    } else {
        ((total_height / page_height).ceil() as usize).max(1)
    };

    for page_idx in 0..num_pages {
        let mut page = document.start_page_with(page_settings.clone());
        let mut surface = page.surface();

        let y_offset = -(page_idx as f32 * page_height);

        // Clip to page bounds
        if num_pages > 1 {
            if let Some(clip_path) = build_rect_path(0.0, 0.0, layout.page_width, page_height) {
                surface.push_clip_path(&clip_path, &FillRule::NonZero);
            }
        }

        paint_node(
            &layout.taffy,
            layout.root,
            &mut surface,
            styles,
            fonts,
            layout,
            0.0,
            y_offset,
        );

        if num_pages > 1 {
            surface.pop(); // pop clip
        }

        drop(surface);
        page.finish();
    }

    document.finish().expect("PDF generation failed")
}

#[allow(clippy::too_many_arguments)]
fn paint_node(
    taffy: &taffy::TaffyTree<crate::layout::TextContext>,
    node: NodeId,
    surface: &mut krilla::surface::Surface,
    styles: &StyleResult,
    fonts: &FontCollection,
    layout: &LayoutResult,
    parent_x: f32,
    parent_y: f32,
) {
    let taffy_layout = taffy.layout(node).expect("layout");
    let x = parent_x + taffy_layout.location.x;
    let y = parent_y + taffy_layout.location.y;
    let w = taffy_layout.size.width;
    let h = taffy_layout.size.height;

    let computed = find_style_for_node(node, layout, styles);

    if let Some(ref computed) = computed {
        if matches!(computed.visibility, Visibility::Hidden) {
            return;
        }
        if matches!(computed.display, Display::None) {
            return;
        }
    }

    // Track push count for matching pops
    let mut push_count: u32 = 0;

    if let Some(ref computed) = computed {
        // Opacity
        if computed.opacity < 1.0 {
            if let Some(opacity) = NormalizedF32::new(computed.opacity) {
                surface.push_opacity(opacity);
                push_count += 1;
            }
        }

        // Transform
        if let Some(ref transform) = computed.transform {
            let transforms = flatten_transform(transform, x, y, w, h);
            for t in &transforms {
                surface.push_transform(t);
                push_count += 1;
            }
        }

        // Background
        if !computed.background_color.is_transparent() {
            if computed.border_radius > 0.0 {
                paint_rounded_rect(surface, x, y, w, h, computed.border_radius, &computed.background_color);
            } else {
                paint_rect(surface, x, y, w, h, &computed.background_color);
            }
        }

        // Background image
        if let Some(ref bg_image) = computed.background_image {
            paint_background_image(surface, x, y, w, h, bg_image, computed);
        }

        // Borders
        if matches!(
            computed.border_style,
            BorderStyle::Solid | BorderStyle::Dashed
        ) {
            if computed.border_radius > 0.0 {
                paint_rounded_borders(surface, x, y, w, h, computed);
            } else {
                paint_borders(surface, x, y, w, h, computed);
            }
        }

        // Overflow: hidden — clip children to this element's box
        if matches!(computed.overflow, Overflow::Hidden) {
            if let Some(clip_path) = build_rect_path(x, y, w, h) {
                surface.push_clip_path(&clip_path, &FillRule::NonZero);
                push_count += 1;
            }
        }
    }

    // SVG rendering — if this node has SVG data, render it and skip children
    if let Some(elem_id) = find_element_id_for_node(node, layout) {
        if let Some(svg_xml) = layout.svg_data.get(&elem_id) {
            paint_svg(surface, x, y, w, h, svg_xml);
            for _ in 0..push_count {
                surface.pop();
            }
            return;
        }
        // Image rendering — <img> elements with data URIs
        if let Some(src) = layout.image_data.get(&elem_id) {
            paint_data_uri_image(surface, x, y, w, h, src);
            for _ in 0..push_count {
                surface.pop();
            }
            return;
        }
    }

    // Paint children sorted by z-index (lower z-index paints first)
    let mut children: Vec<NodeId> = taffy.children(node).unwrap_or_default();
    children.sort_by_key(|child| {
        find_style_for_node(*child, layout, styles)
            .map_or(0, |s| s.z_index)
    });
    for child in children {
        if let Some(ctx) = taffy.get_node_context(child) {
            let child_layout = taffy.layout(child).expect("layout");
            let cx = x + child_layout.location.x;
            let cy = y + child_layout.location.y;

            if let Some(ref parent_style) = computed {
                let content_width = w - computed.as_ref().map_or(0.0, |s| s.padding.left + s.padding.right);
                if ctx.runs.len() <= 1 {
                    paint_text(surface, cx, cy, &ctx.text(), parent_style, fonts, content_width);
                } else {
                    paint_inline_runs(surface, cx, cy, ctx, parent_style, fonts, content_width);
                }
            }
        } else {
            paint_node(taffy, child, surface, styles, fonts, layout, x, y);
        }
    }

    // Pop in reverse order
    for _ in 0..push_count {
        surface.pop();
    }
}

fn find_element_id_for_node(node: NodeId, layout: &LayoutResult) -> Option<usize> {
    for (&elem_id, &taffy_node) in &layout.node_map {
        if taffy_node == node {
            return Some(elem_id);
        }
    }
    None
}

fn find_style_for_node(
    node: NodeId,
    layout: &LayoutResult,
    styles: &StyleResult,
) -> Option<ComputedStyle> {
    find_element_id_for_node(node, layout)
        .and_then(|elem_id| styles.styles.get(&elem_id).cloned())
}

fn make_fill(color: &Color) -> Fill {
    Fill {
        paint: rgb::Color::new(color.r, color.g, color.b).into(),
        opacity: NormalizedF32::new(color.a).unwrap_or(NormalizedF32::ONE),
        rule: FillRule::NonZero,
    }
}

fn build_rect_path(x: f32, y: f32, w: f32, h: f32) -> Option<krilla::geom::Path> {
    let rect = Rect::from_xywh(x, y, w, h)?;
    let mut pb = PathBuilder::new();
    pb.push_rect(rect);
    pb.finish()
}

fn paint_rect(
    surface: &mut krilla::surface::Surface,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    color: &Color,
) {
    let Some(path) = build_rect_path(x, y, w, h) else {
        return;
    };
    surface.set_fill(Some(make_fill(color)));
    surface.set_stroke(None);
    surface.draw_path(&path);
}

/// Approximation constant for circular arcs with cubic beziers.
/// kappa = 4 * (sqrt(2) - 1) / 3
const KAPPA: f32 = 0.552_284_8;

fn paint_rounded_rect(
    surface: &mut krilla::surface::Surface,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    radius: f32,
    color: &Color,
) {
    let Some(path) = build_rounded_rect_path(x, y, w, h, radius) else {
        return;
    };
    surface.set_fill(Some(make_fill(color)));
    surface.set_stroke(None);
    surface.draw_path(&path);
}

fn build_rounded_rect_path(x: f32, y: f32, w: f32, h: f32, radius: f32) -> Option<krilla::geom::Path> {
    // Clamp radius to half the smallest dimension
    let r = radius.min(w / 2.0).min(h / 2.0);
    let k = r * KAPPA;

    let mut pb = PathBuilder::new();
    // Start at top-left corner, after the radius
    pb.move_to(x + r, y);
    // Top edge
    pb.line_to(x + w - r, y);
    // Top-right corner
    pb.cubic_to(x + w - r + k, y, x + w, y + r - k, x + w, y + r);
    // Right edge
    pb.line_to(x + w, y + h - r);
    // Bottom-right corner
    pb.cubic_to(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h);
    // Bottom edge
    pb.line_to(x + r, y + h);
    // Bottom-left corner
    pb.cubic_to(x + r - k, y + h, x, y + h - r + k, x, y + h - r);
    // Left edge
    pb.line_to(x, y + r);
    // Top-left corner
    pb.cubic_to(x, y + r - k, x + r - k, y, x + r, y);
    pb.close();
    pb.finish()
}

fn paint_rounded_borders(
    surface: &mut krilla::surface::Surface,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    computed: &ComputedStyle,
) {
    let bw = &computed.border_widths;
    let color = &computed.border_colors.top; // Use top color for uniform stroke
    let r = computed.border_radius;

    // For uniform borders with border-radius, stroke the rounded rect
    #[allow(clippy::float_cmp)]
    let uniform = bw.top == bw.right && bw.right == bw.bottom && bw.bottom == bw.left;
    if uniform && bw.top > 0.0 {
        let half = bw.top / 2.0;
        let inner_r = (r - half).max(0.0);
        let Some(path) = build_rounded_rect_path(
            x + half, y + half, w - bw.top, h - bw.top, inner_r,
        ) else {
            return;
        };
        let stroke = krilla::paint::Stroke {
            paint: rgb::Color::new(color.r, color.g, color.b).into(),
            width: bw.top,
            opacity: NormalizedF32::new(color.a).unwrap_or(NormalizedF32::ONE),
            ..krilla::paint::Stroke::default()
        };
        surface.set_fill(None);
        surface.set_stroke(Some(stroke));
        surface.draw_path(&path);
    } else {
        // Fall back to rectangular borders for non-uniform widths
        paint_borders(surface, x, y, w, h, computed);
    }
}

fn paint_borders(
    surface: &mut krilla::surface::Surface,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    computed: &ComputedStyle,
) {
    let bw = &computed.border_widths;
    let colors = &computed.border_colors;

    if matches!(computed.border_style, BorderStyle::Dashed) {
        paint_dashed_borders(surface, x, y, w, h, computed);
        return;
    }

    if bw.top > 0.0 {
        paint_rect(surface, x, y, w, bw.top, &colors.top);
    }
    if bw.bottom > 0.0 {
        paint_rect(surface, x, y + h - bw.bottom, w, bw.bottom, &colors.bottom);
    }
    if bw.left > 0.0 {
        paint_rect(surface, x, y, bw.left, h, &colors.left);
    }
    if bw.right > 0.0 {
        paint_rect(surface, x + w - bw.right, y, bw.right, h, &colors.right);
    }
}

fn paint_dashed_borders(
    surface: &mut krilla::surface::Surface,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    computed: &ComputedStyle,
) {
    let bw = &computed.border_widths;
    let colors = &computed.border_colors;

    let paint_dashed_edge = |surface: &mut krilla::surface::Surface,
                             x1: f32, y1: f32, x2: f32, y2: f32,
                             width: f32, color: &Color| {
        let mut pb = PathBuilder::new();
        pb.move_to(x1, y1);
        pb.line_to(x2, y2);
        let Some(path) = pb.finish() else { return };
        let stroke = krilla::paint::Stroke {
            paint: rgb::Color::new(color.r, color.g, color.b).into(),
            width,
            opacity: NormalizedF32::new(color.a).unwrap_or(NormalizedF32::ONE),
            dash: Some(krilla::paint::StrokeDash {
                array: vec![width * 3.0, width],
                offset: 0.0,
            }),
            ..krilla::paint::Stroke::default()
        };
        surface.set_fill(None);
        surface.set_stroke(Some(stroke));
        surface.draw_path(&path);
    };

    if bw.top > 0.0 {
        let half = bw.top / 2.0;
        paint_dashed_edge(surface, x, y + half, x + w, y + half, bw.top, &colors.top);
    }
    if bw.bottom > 0.0 {
        let half = bw.bottom / 2.0;
        paint_dashed_edge(surface, x, y + h - half, x + w, y + h - half, bw.bottom, &colors.bottom);
    }
    if bw.left > 0.0 {
        let half = bw.left / 2.0;
        paint_dashed_edge(surface, x + half, y, x + half, y + h, bw.left, &colors.left);
    }
    if bw.right > 0.0 {
        let half = bw.right / 2.0;
        paint_dashed_edge(surface, x + w - half, y, x + w - half, y + h, bw.right, &colors.right);
    }
}

/// Flatten a transform tree into a list of krilla Transforms to push individually.
fn flatten_transform(
    transform: &crate::style::Transform,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
) -> Vec<Transform> {
    let cx = x + w / 2.0;
    let cy = y + h / 2.0;

    match transform {
        crate::style::Transform::ScaleX(sx) => vec![
            // Scale around center: translate to center, scale, translate back
            Transform::from_translate(cx, cy),
            Transform::from_scale(*sx, 1.0),
            Transform::from_translate(-cx, -cy),
        ],
        crate::style::Transform::Rotate(deg) => vec![Transform::from_rotate_at(*deg, cx, cy)],
        crate::style::Transform::Translate(tx, ty) => vec![Transform::from_translate(*tx, *ty)],
        crate::style::Transform::Combined(list) => {
            list.iter()
                .flat_map(|t| flatten_transform(t, x, y, w, h))
                .collect()
        }
    }
}

fn paint_svg(
    surface: &mut krilla::surface::Surface,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    svg_xml: &str,
) {
    // Ensure xmlns is present for usvg parsing
    let svg_xml = if svg_xml.contains("xmlns") {
        svg_xml.to_string()
    } else {
        svg_xml.replacen("<svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"", 1)
    };
    let Ok(tree) = usvg::Tree::from_str(&svg_xml, &usvg::Options::default()) else {
        return;
    };
    let Some(size) = Size::from_wh(w, h) else {
        return;
    };
    surface.push_transform(&Transform::from_translate(x, y));
    surface.draw_svg(&tree, size, SvgSettings::default());
    surface.pop();
}

fn percent_decode(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let hi = chars.next().unwrap_or(0);
            let lo = chars.next().unwrap_or(0);
            let hex = [hi, lo];
            if let Ok(s) = std::str::from_utf8(&hex) {
                if let Ok(byte) = u8::from_str_radix(s, 16) {
                    result.push(byte as char);
                    continue;
                }
            }
            result.push('%');
            result.push(hi as char);
            result.push(lo as char);
        } else {
            result.push(b as char);
        }
    }
    result
}

fn extract_data_uri(uri: &str) -> Option<(&str, Vec<u8>)> {
    let uri = uri.trim();
    // Strip url(...) wrapper if present
    let uri = if uri.starts_with("url(") {
        let inner = uri.strip_prefix("url(")?.strip_suffix(')')?;
        let inner = inner.trim();
        if (inner.starts_with('"') && inner.ends_with('"'))
            || (inner.starts_with('\'') && inner.ends_with('\''))
        {
            &inner[1..inner.len() - 1]
        } else {
            inner
        }
    } else {
        uri
    };
    let rest = uri.strip_prefix("data:")?;
    if let Some(base64_sep) = rest.find(";base64,") {
        let mime = &rest[..base64_sep];
        let encoded = &rest[base64_sep + 8..];
        let data = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .ok()?;
        Some((mime, data))
    } else {
        // URL-encoded data (e.g. SVG)
        let comma = rest.find(',')?;
        let mime = &rest[..comma];
        let encoded = &rest[comma + 1..];
        let decoded = percent_decode(encoded);
        Some((mime, decoded.into_bytes()))
    }
}

fn paint_background_image(
    surface: &mut krilla::surface::Surface,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    uri: &str,
    style: &ComputedStyle,
) {
    let Some((mime, data)) = extract_data_uri(uri) else {
        return;
    };

    // For SVGs, we can render at any size — use the full element box
    if mime.contains("svg") {
        let svg_xml = String::from_utf8_lossy(&data);
        paint_svg(surface, x, y, w, h, &svg_xml);
        return;
    }

    // For raster images, get the intrinsic size and compute placement
    let image_result = if mime.contains("png") {
        Image::from_png(Data::from(data), false)
    } else if mime.contains("jpeg") || mime.contains("jpg") {
        Image::from_jpeg(Data::from(data), false)
    } else {
        Image::from_png(Data::from(data.clone()), false)
            .or_else(|_| Image::from_jpeg(Data::from(data), false))
    };
    let Ok(image) = image_result else { return };

    let (draw_w, draw_h) = match style.background_size {
        BackgroundSize::Contain => {
            let iw = image.size().0 as f32;
            let ih = image.size().1 as f32;
            if iw == 0.0 || ih == 0.0 {
                (w, h)
            } else {
                let scale = (w / iw).min(h / ih);
                (iw * scale, ih * scale)
            }
        }
        BackgroundSize::Cover => {
            let iw = image.size().0 as f32;
            let ih = image.size().1 as f32;
            if iw == 0.0 || ih == 0.0 {
                (w, h)
            } else {
                let scale = (w / iw).max(h / ih);
                (iw * scale, ih * scale)
            }
        }
        BackgroundSize::Auto => (w, h),
    };

    let Some(size) = Size::from_wh(draw_w, draw_h) else {
        return;
    };
    surface.push_transform(&Transform::from_translate(x, y));
    surface.draw_image(image, size);
    surface.pop();
}

fn paint_data_uri_image(
    surface: &mut krilla::surface::Surface,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    uri: &str,
) {
    let Some((mime, data)) = extract_data_uri(uri) else {
        return;
    };
    if mime.contains("svg") {
        let svg_xml = String::from_utf8_lossy(&data);
        paint_svg(surface, x, y, w, h, &svg_xml);
    } else {
        let image_result = if mime.contains("png") {
            Image::from_png(Data::from(data), false)
        } else if mime.contains("jpeg") || mime.contains("jpg") {
            Image::from_jpeg(Data::from(data), false)
        } else if mime.contains("gif") {
            Image::from_gif(Data::from(data), false)
        } else if mime.contains("webp") {
            Image::from_webp(Data::from(data), false)
        } else {
            // Try PNG first, then JPEG as fallback
            Image::from_png(Data::from(data.clone()), false)
                .or_else(|_| Image::from_jpeg(Data::from(data), false))
        };
        if let Ok(image) = image_result {
            let Some(size) = Size::from_wh(w, h) else {
                return;
            };
            surface.push_transform(&Transform::from_translate(x, y));
            surface.draw_image(image, size);
            surface.pop();
        }
    }
}

fn paint_text(
    surface: &mut krilla::surface::Surface,
    x: f32,
    y: f32,
    text: &str,
    style: &ComputedStyle,
    fonts: &FontCollection,
    container_width: f32,
) {
    let text = match style.text_transform {
        crate::style::TextTransform::Uppercase => text.to_uppercase(),
        crate::style::TextTransform::None => text.to_string(),
    };

    let Some(font_face) = fonts.find(&style.font_family, style.font_weight, style.font_style)
    else {
        return;
    };

    let data: krilla::Data = Arc::new(font_face.data.clone()).into();
    let Some(font) = Font::new(data, 0) else {
        return;
    };

    let font_size = style.font_size;
    let ascender_ratio = fonts.ascender_ratio(&style.font_family, style.font_weight, style.font_style);
    let baseline_y = y + font_size * ascender_ratio;

    let text_x = match style.text_align {
        crate::style::TextAlign::Left => x,
        crate::style::TextAlign::Center => {
            let text_width = fonts.measure_text(
                &text, &style.font_family, style.font_weight, style.font_style, font_size,
            );
            x + (container_width - text_width) / 2.0
        }
        crate::style::TextAlign::Right => {
            let text_width = fonts.measure_text(
                &text, &style.font_family, style.font_weight, style.font_style, font_size,
            );
            x + container_width - text_width
        }
    };

    surface.set_fill(Some(make_fill(&style.color)));
    surface.set_stroke(None);
    surface.draw_text(
        Point::from_xy(text_x, baseline_y),
        font,
        font_size,
        &text,
        false,
        krilla::text::TextDirection::Auto,
    );
}

#[allow(clippy::too_many_arguments)]
fn paint_inline_runs(
    surface: &mut krilla::surface::Surface,
    x: f32,
    y: f32,
    ctx: &TextContext,
    parent_style: &ComputedStyle,
    fonts: &FontCollection,
    container_width: f32,
) {
    let font_size = ctx.primary_font_size();
    let font_family = ctx.primary_font_family().to_string();
    let font_weight = ctx.primary_font_weight();
    let font_style = ctx.primary_font_style();
    let ascender_ratio = fonts.ascender_ratio(&font_family, font_weight, font_style);
    let line_height = if ctx.line_height() > 0.0 {
        font_size * ctx.line_height()
    } else {
        font_size * fonts.line_height_ratio(&font_family, font_weight, font_style)
    };

    let mut cursor_x = x;
    let mut cursor_y = y;
    let line_start_x = x;
    let max_x = x + container_width;
    let _space_width = fonts.measure_text(" ", &font_family, font_weight, font_style, font_size);

    // Break all runs into word-level segments with their styles
    let mut segments: Vec<(String, usize)> = Vec::new();
    for (i, run) in ctx.runs.iter().enumerate() {
        let text = match parent_style.text_transform {
            crate::style::TextTransform::Uppercase => run.text.to_uppercase(),
            crate::style::TextTransform::None => run.text.clone(),
        };

        // Split into words, preserving leading/trailing spaces
        let has_leading_space = text.starts_with(' ');
        let has_trailing_space = text.ends_with(' ');
        let words: Vec<&str> = text.split_whitespace().collect();

        for (j, word) in words.iter().enumerate() {
            let mut w = String::new();
            // Add space before word if it's not the first word, or if the
            // run text had a leading space
            if (j == 0 && has_leading_space) || j > 0 {
                w.push(' ');
            }
            w.push_str(word);
            if j == words.len() - 1 && has_trailing_space {
                w.push(' ');
            }
            segments.push((w, i));
        }
    }

    // Paint word by word with wrapping
    for (word, run_index) in &segments {
        let run = &ctx.runs[*run_index];
        let word_width = fonts.measure_text(word, &run.font_family, run.font_weight, run.font_style, run.font_size);

        // Check if we need to wrap
        if cursor_x > line_start_x && cursor_x + word_width > max_x + 0.5 {
            cursor_x = line_start_x;
            cursor_y += line_height;
        }

        let baseline_y = cursor_y + font_size * ascender_ratio;

        let Some(font_face) = fonts.find(&run.font_family, run.font_weight, run.font_style) else {
            cursor_x += word_width;
            continue;
        };
        let data: krilla::Data = Arc::new(font_face.data.clone()).into();
        let Some(font) = Font::new(data, 0) else {
            cursor_x += word_width;
            continue;
        };

        surface.set_fill(Some(make_fill(&run.color)));
        surface.set_stroke(None);
        surface.draw_text(
            Point::from_xy(cursor_x, baseline_y),
            font,
            run.font_size,
            word,
            false,
            krilla::text::TextDirection::Auto,
        );

        cursor_x += word_width;
    }
}

