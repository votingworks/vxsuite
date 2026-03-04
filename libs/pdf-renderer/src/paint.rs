use std::sync::Arc;

use krilla::color::rgb;
use krilla::geom::{PathBuilder, Point, Rect};
use krilla::num::NormalizedF32;
use krilla::paint::{Fill, FillRule};
use krilla::page::PageSettings;
use krilla::text::Font;
use krilla::Document;
use taffy::NodeId;

use crate::fonts::FontCollection;
use crate::layout::LayoutResult;
use crate::style::{BorderStyle, Color, ComputedStyle, Display, StyleResult, Visibility};

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

        if !computed.background_color.is_transparent() {
            paint_rect(surface, x, y, w, h, &computed.background_color);
        }

        if matches!(
            computed.border_style,
            BorderStyle::Solid | BorderStyle::Dashed
        ) {
            paint_borders(surface, x, y, w, h, computed);
        }
    }

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

fn paint_rect(
    surface: &mut krilla::surface::Surface,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    color: &Color,
) {
    let Some(rect) = Rect::from_xywh(x, y, w, h) else {
        return;
    };
    let mut pb = PathBuilder::new();
    pb.push_rect(rect);
    let Some(path) = pb.finish() else {
        return;
    };
    surface.set_fill(Some(make_fill(color)));
    surface.set_stroke(None);
    surface.draw_path(&path);
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
    let color = &computed.border_color;

    if bw.top > 0.0 {
        paint_rect(surface, x, y, w, bw.top, color);
    }
    if bw.bottom > 0.0 {
        paint_rect(surface, x, y + h - bw.bottom, w, bw.bottom, color);
    }
    if bw.left > 0.0 {
        paint_rect(surface, x, y, bw.left, h, color);
    }
    if bw.right > 0.0 {
        paint_rect(surface, x + w - bw.right, y, bw.right, h, color);
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
    let baseline_y = y + font_size * 0.8;

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
