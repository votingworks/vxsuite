use std::sync::Arc;

use krilla::color::rgb;
use krilla::geom::{PathBuilder, Point, Rect, Transform};
use krilla::num::NormalizedF32;
use krilla::paint::{Fill, FillRule};
use krilla::page::PageSettings;
use krilla::text::Font;
use krilla::Document;
use taffy::NodeId;

use crate::fonts::FontCollection;
use crate::layout::LayoutResult;
use crate::style::{BorderStyle, Color, ComputedStyle, Display, Overflow, StyleResult, Visibility};

pub fn render_pdf(layout: &LayoutResult, styles: &StyleResult, fonts: &FontCollection) -> Vec<u8> {
    let mut document = Document::new();

    let page_settings = PageSettings::from_wh(layout.page_width, layout.page_height)
        .unwrap_or_else(|| PageSettings::from_wh(612.0, 792.0).expect("valid default page size"));

    let mut page = document.start_page_with(page_settings);
    let mut surface = page.surface();

    paint_node(
        &layout.taffy,
        layout.root,
        &mut surface,
        styles,
        fonts,
        layout,
        0.0,
        0.0,
    );

    drop(surface);
    page.finish();
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

    // Paint children
    let children: Vec<NodeId> = taffy.children(node).unwrap_or_default();
    for child in children {
        if let Some(ctx) = taffy.get_node_context(child) {
            let child_layout = taffy.layout(child).expect("layout");
            let cx = x + child_layout.location.x;
            let cy = y + child_layout.location.y;

            if let Some(ref parent_style) = computed {
                paint_text(surface, cx, cy, ctx.text(), parent_style, fonts);
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

fn find_style_for_node(
    node: NodeId,
    layout: &LayoutResult,
    styles: &StyleResult,
) -> Option<ComputedStyle> {
    for (&elem_id, &taffy_node) in &layout.node_map {
        if taffy_node == node {
            return styles.styles.get(&elem_id).cloned();
        }
    }
    None
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

fn paint_text(
    surface: &mut krilla::surface::Surface,
    x: f32,
    y: f32,
    text: &str,
    style: &ComputedStyle,
    fonts: &FontCollection,
) {
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

    surface.set_fill(Some(make_fill(&style.color)));
    surface.set_stroke(None);
    surface.draw_text(
        Point::from_xy(x, baseline_y),
        font,
        font_size,
        text,
        false,
        krilla::text::TextDirection::Auto,
    );
}
