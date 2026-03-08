use std::collections::HashMap;

use taffy::prelude::*;

use crate::dom::{DomNode, ElementNode};
use crate::fonts::FontCollection;
use crate::style::{
    AlignContent, AlignItems, AlignSelf, BoxSizing, ComputedStyle, Dimension, Display,
    FlexDirection, FlexWrap, JustifyContent, Position, StyleResult, WhiteSpace,
};
use crate::{DataAttribute, ElementInfo};

/// A single styled segment of text within a text node
#[derive(Clone)]
pub(crate) struct TextRun {
    pub text: String,
    pub font_family: String,
    pub font_size: f32,
    pub font_weight: u16,
    pub font_style: crate::style::FontStyle,
    pub color: crate::style::Color,
}

/// Context carried with leaf text nodes for measurement
pub struct TextContext {
    pub(crate) runs: Vec<TextRun>,
    white_space: WhiteSpace,
    line_height: f32,
}

impl TextContext {
    pub(crate) fn text(&self) -> String {
        self.runs.iter().map(|r| r.text.as_str()).collect()
    }

    pub(crate) fn primary_font_family(&self) -> &str {
        self.runs.first().map_or("", |r| &r.font_family)
    }

    pub(crate) fn primary_font_size(&self) -> f32 {
        self.runs.first().map_or(12.0, |r| r.font_size)
    }

    pub(crate) fn primary_font_weight(&self) -> u16 {
        self.runs.first().map_or(400, |r| r.font_weight)
    }

    pub(crate) fn primary_font_style(&self) -> crate::style::FontStyle {
        self.runs.first().map_or(crate::style::FontStyle::Normal, |r| r.font_style)
    }

    pub(crate) fn line_height(&self) -> f32 {
        self.line_height
    }
}

/// Result of layout computation
pub struct LayoutResult {
    pub taffy: TaffyTree<TextContext>,
    pub root: NodeId,
    /// Map from DOM element pointer → taffy NodeId
    pub node_map: HashMap<usize, NodeId>,
    /// Map from element ID → serialized SVG XML for SVG elements
    pub svg_data: HashMap<usize, String>,
    /// Map from element ID → image data URI for <img> elements
    pub image_data: HashMap<usize, String>,
    /// Page dimensions in points
    pub page_width: f32,
    pub page_height: f32,
    /// Location overrides for nodes whose position was reset by subtree relayout.
    /// Maps NodeId → original location (position within parent).
    pub location_overrides: HashMap<NodeId, taffy::geometry::Point<f32>>,
}

fn convert_dimension(dim: Dimension) -> taffy::Dimension {
    match dim {
        Dimension::Auto => taffy::Dimension::Auto,
        Dimension::Points(v) => taffy::Dimension::Length(v),
        Dimension::Percent(v) | Dimension::PercentPlus(v, _) => taffy::Dimension::Percent(v),
    }
}

fn convert_length_percent_auto(dim: Dimension) -> LengthPercentageAuto {
    match dim {
        Dimension::Auto => LengthPercentageAuto::Auto,
        Dimension::Points(v) => LengthPercentageAuto::Length(v),
        Dimension::Percent(v) | Dimension::PercentPlus(v, _) => LengthPercentageAuto::Percent(v),
    }
}

fn convert_length_percent(dim: Dimension) -> LengthPercentage {
    match dim {
        Dimension::Points(v) => LengthPercentage::Length(v),
        Dimension::Percent(v) | Dimension::PercentPlus(v, _) => LengthPercentage::Percent(v),
        Dimension::Auto => LengthPercentage::Length(0.0),
    }
}

fn build_taffy_style(computed: &ComputedStyle) -> Style {
    let display = match computed.display {
        Display::Flex => taffy::Display::Flex,
        Display::Grid => taffy::Display::Grid,
        Display::Block | Display::Inline => taffy::Display::Block,
        Display::None => taffy::Display::None,
    };

    let position = match computed.position {
        Position::Absolute => taffy::Position::Absolute,
        Position::Relative | Position::Static => taffy::Position::Relative,
    };

    let flex_direction = match computed.flex_direction {
        FlexDirection::Row => taffy::FlexDirection::Row,
        FlexDirection::Column => taffy::FlexDirection::Column,
    };

    let flex_wrap = match computed.flex_wrap {
        FlexWrap::NoWrap => taffy::FlexWrap::NoWrap,
        FlexWrap::Wrap => taffy::FlexWrap::Wrap,
    };

    let justify_content = match computed.justify_content {
        JustifyContent::FlexStart => Some(taffy::JustifyContent::FlexStart),
        JustifyContent::FlexEnd => Some(taffy::JustifyContent::FlexEnd),
        JustifyContent::Center => Some(taffy::JustifyContent::Center),
        JustifyContent::SpaceBetween => Some(taffy::JustifyContent::SpaceBetween),
    };

    let align_content = match computed.align_content {
        AlignContent::Stretch => Some(taffy::AlignContent::Stretch),
        AlignContent::FlexStart => Some(taffy::AlignContent::FlexStart),
        AlignContent::FlexEnd => Some(taffy::AlignContent::FlexEnd),
        AlignContent::Center => Some(taffy::AlignContent::Center),
        AlignContent::SpaceBetween => Some(taffy::AlignContent::SpaceBetween),
        AlignContent::SpaceAround => Some(taffy::AlignContent::SpaceAround),
    };

    let align_items = match computed.align_items {
        AlignItems::Stretch => Some(taffy::AlignItems::Stretch),
        AlignItems::FlexStart => Some(taffy::AlignItems::FlexStart),
        AlignItems::FlexEnd => Some(taffy::AlignItems::FlexEnd),
        AlignItems::Center => Some(taffy::AlignItems::Center),
    };

    let align_self = match computed.align_self {
        AlignSelf::Auto => None,
        AlignSelf::Center => Some(taffy::AlignSelf::Center),
    };

    let grid_template_columns: Vec<TrackSizingFunction> = computed
        .grid_template_columns
        .iter()
        .map(|track| match track {
            crate::style::TrackSize::Points(v) => minmax(length(*v), length(*v)),
            crate::style::TrackSize::Fr(v) => minmax(length(0.0), fr(*v)),
            crate::style::TrackSize::Auto => minmax(auto(), auto()),
        })
        .collect();

    let box_sizing = match computed.box_sizing {
        BoxSizing::ContentBox => taffy::BoxSizing::ContentBox,
        BoxSizing::BorderBox => taffy::BoxSizing::BorderBox,
    };

    Style {
        display,
        position,
        box_sizing,
        flex_direction,
        flex_wrap,
        flex_grow: computed.flex_grow,
        flex_shrink: computed.flex_shrink,
        flex_basis: convert_dimension(computed.flex_basis),
        justify_content,
        align_content,
        align_items,
        align_self,
        gap: Size {
            width: LengthPercentage::Length(computed.gap.1),
            height: LengthPercentage::Length(computed.gap.0),
        },
        grid_template_columns: if grid_template_columns.is_empty() {
            vec![]
        } else {
            grid_template_columns
        },
        size: Size {
            width: convert_dimension(computed.width),
            height: convert_dimension(computed.height),
        },
        min_size: Size {
            // CSS spec: flex items default to min-width: auto, which prevents
            // them from shrinking below their specified width. We default to 0
            // for proper flex constraint propagation, but when an element has
            // an explicit width and no explicit min-width override, use the
            // width as the min-width to match browser behavior.
            width: if matches!(computed.min_width, Dimension::Points(v) if v == 0.0)
                && !matches!(computed.width, Dimension::Auto)
            {
                convert_dimension(computed.width)
            } else {
                convert_dimension(computed.min_width)
            },
            height: convert_dimension(computed.min_height),
        },
        max_size: Size {
            width: convert_dimension(computed.max_width),
            height: convert_dimension(computed.max_height),
        },
        aspect_ratio: computed.aspect_ratio,
        padding: Rect {
            top: convert_length_percent(Dimension::Points(computed.padding.top)),
            right: convert_length_percent(Dimension::Points(computed.padding.right)),
            bottom: convert_length_percent(Dimension::Points(computed.padding.bottom)),
            left: convert_length_percent(Dimension::Points(computed.padding.left)),
        },
        margin: Rect {
            top: convert_length_percent_auto(computed.margin.top),
            right: convert_length_percent_auto(computed.margin.right),
            bottom: convert_length_percent_auto(computed.margin.bottom),
            left: convert_length_percent_auto(computed.margin.left),
        },
        border: Rect {
            top: convert_length_percent(Dimension::Points(computed.border_widths.top)),
            right: convert_length_percent(Dimension::Points(computed.border_widths.right)),
            bottom: convert_length_percent(Dimension::Points(computed.border_widths.bottom)),
            left: convert_length_percent(Dimension::Points(computed.border_widths.left)),
        },
        inset: Rect {
            top: convert_length_percent_auto(computed.top),
            right: convert_length_percent_auto(computed.right),
            bottom: convert_length_percent_auto(computed.bottom),
            left: convert_length_percent_auto(computed.left),
        },
        overflow: taffy::Point {
            x: match computed.overflow {
                crate::style::Overflow::Hidden => taffy::Overflow::Hidden,
                crate::style::Overflow::Visible => taffy::Overflow::Visible,
            },
            y: match computed.overflow {
                crate::style::Overflow::Hidden => taffy::Overflow::Hidden,
                crate::style::Overflow::Visible => taffy::Overflow::Visible,
            },
        },
        ..Style::DEFAULT
    }
}

pub fn compute_layout(
    document: &ElementNode,
    styles: &mut StyleResult,
    fonts: &FontCollection,
) -> LayoutResult {
    let mut taffy: TaffyTree<TextContext> = TaffyTree::new();
    taffy.disable_rounding();
    let mut node_map = HashMap::new();
    let mut svg_data = HashMap::new();
    let mut image_data = HashMap::new();

    let root = build_taffy_tree(&mut taffy, document, styles, fonts, &mut node_map, &mut svg_data, &mut image_data, 0);

    // Determine page size from the outermost element's computed style
    let page_width;
    let page_height;
    if let Some(body) = find_element(document, "body") {
        let body_id = std::ptr::from_ref(body) as usize;
        if let Some(body_style) = styles.styles.get(&body_id) {
            page_width = match body_style.width {
                Dimension::Points(v) => v,
                _ => 612.0, // 8.5" default
            };
            page_height = match body_style.height {
                Dimension::Points(v) => v,
                _ => 792.0, // 11" default
            };
        } else {
            page_width = 612.0;
            page_height = 792.0;
        }
    } else {
        page_width = 612.0;
        page_height = 792.0;
    }

    // Run layout
    let available = Size {
        width: AvailableSpace::Definite(page_width),
        height: AvailableSpace::Definite(page_height),
    };
    taffy
        .compute_layout_with_measure(root, available, |known, available, _id, ctx, _style| {
            measure_text_node(known, available, ctx, fonts)
        })
        .expect("layout failed");

    // Resolve PercentPlus dimensions (e.g. calc(100% + 9pt)) by computing the
    // resolved value from the parent's layout size, updating the Taffy style to
    // use a fixed Length, and re-running layout. This ensures children are
    // positioned using the correct container size. Safe because PercentPlus
    // elements in practice are absolutely positioned and don't affect siblings.
    let mut has_percent_plus = false;
    for (&element_id, &node_id) in &node_map {
        if let Some(computed) = styles.styles.get(&element_id) {
            let has_pp_w = matches!(computed.width, Dimension::PercentPlus(_, _));
            let has_pp_h = matches!(computed.height, Dimension::PercentPlus(_, _));
            if has_pp_w || has_pp_h {
                if let Some(parent_id) = taffy.parent(node_id) {
                    let parent_size = taffy.layout(parent_id).expect("parent layout").size;
                    let mut style = taffy.style(node_id).expect("style").clone();
                    if let Dimension::PercentPlus(pct, offset) = computed.width {
                        style.size.width = taffy::Dimension::Length(parent_size.width * pct + offset);
                        has_percent_plus = true;
                    }
                    if let Dimension::PercentPlus(pct, offset) = computed.height {
                        style.size.height = taffy::Dimension::Length(parent_size.height * pct + offset);
                        has_percent_plus = true;
                    }
                    taffy.set_style(node_id, style).expect("set style");
                }
            }
        }
    }

    // Relayout only the PercentPlus subtrees, not the entire tree.
    // A full relayout can change unrelated grid/flex layouts because the
    // PercentPlus node's resolved fixed size gives Taffy different sizing
    // hints in the second pass. We relayout each PercentPlus node with
    // its own resolved size as available space, so its children (e.g.
    // timing marks with justify-content:space-between) get positioned
    // using the correct container dimensions.
    let mut location_overrides: HashMap<NodeId, taffy::geometry::Point<f32>> = HashMap::new();
    if has_percent_plus {
        for (&element_id, &node_id) in &node_map {
            if let Some(computed) = styles.styles.get(&element_id) {
                let is_pp = matches!(computed.width, Dimension::PercentPlus(_, _))
                    || matches!(computed.height, Dimension::PercentPlus(_, _));
                if is_pp {
                    let node_size = taffy.style(node_id).expect("style").size;
                    let resolved_w = match node_size.width {
                        taffy::Dimension::Length(v) => v,
                        _ => taffy.layout(node_id).expect("layout").size.width,
                    };
                    let resolved_h = match node_size.height {
                        taffy::Dimension::Length(v) => v,
                        _ => taffy.layout(node_id).expect("layout").size.height,
                    };
                    // Save the node's position within its parent before
                    // subtree relayout, since compute_layout_with_measure
                    // treats the node as a root and resets location to (0,0).
                    let saved_location = taffy.layout(node_id).expect("layout").location;
                    taffy
                        .compute_layout_with_measure(
                            node_id,
                            Size {
                                width: AvailableSpace::Definite(resolved_w),
                                height: AvailableSpace::Definite(resolved_h),
                            },
                            |known, available, _id, ctx, _style| {
                                measure_text_node(known, available, ctx, fonts)
                            },
                        )
                        .expect("subtree relayout failed");
                    // Store the original location so paint/query can use it
                    // instead of the reset (0,0) location from subtree relayout.
                    location_overrides.insert(node_id, saved_location);
                }
            }
        }
    }

    LayoutResult {
        taffy,
        root,
        node_map,
        svg_data,
        image_data,
        page_width,
        page_height,
        location_overrides,
    }
}

/// Parse SVG viewBox attribute "minX minY width height" and return (width, height).
fn parse_viewbox_dims(viewbox: &str) -> Option<(f32, f32)> {
    let parts: Vec<f32> = viewbox
        .split_whitespace()
        .filter_map(|s| s.parse::<f32>().ok())
        .collect();
    if parts.len() == 4 {
        Some((parts[2], parts[3]))
    } else {
        None
    }
}

#[allow(clippy::only_used_in_recursion, clippy::too_many_arguments)]
fn build_taffy_tree(
    taffy: &mut TaffyTree<TextContext>,
    element: &ElementNode,
    styles: &mut StyleResult,
    fonts: &FontCollection,
    node_map: &mut HashMap<usize, NodeId>,
    svg_data: &mut HashMap<usize, String>,
    image_data: &mut HashMap<usize, String>,
    li_index: usize,
) -> NodeId {
    let element_id = std::ptr::from_ref(element) as usize;
    let computed = styles
        .styles
        .get(&element_id)
        .cloned()
        .unwrap_or_default();

    if computed.display == Display::None {
        let node = taffy
            .new_leaf(Style {
                display: taffy::Display::None,
                ..Style::DEFAULT
            })
            .expect("taffy new_leaf");
        node_map.insert(element_id, node);
        return node;
    }

    // Skip SVG internals — serialize and store for paint-time rendering
    if element.tag == "svg" {
        let mut computed = computed;
        let attr_w = element.get_attr("width").and_then(|v| v.parse::<f32>().ok());
        let attr_h = element.get_attr("height").and_then(|v| v.parse::<f32>().ok());
        let viewbox_dims = element.get_attr("viewBox").and_then(parse_viewbox_dims);
        let css_width_is_auto = matches!(computed.width, Dimension::Auto);
        let css_height_is_auto = matches!(computed.height, Dimension::Auto);
        // Use intrinsic dimensions when CSS is auto.
        // With explicit width/height attributes: use as fixed sizes (px → pt).
        // With only viewBox: stretch to container width and use aspect ratio for height,
        // matching browser behavior for SVGs without explicit dimensions.
        if css_width_is_auto && css_height_is_auto {
            if attr_w.is_some() || attr_h.is_some() {
                if let Some(w) = attr_w {
                    computed.width = Dimension::Points(w * 0.75);
                }
                if let Some(h) = attr_h {
                    computed.height = Dimension::Points(h * 0.75);
                }
            } else if viewbox_dims.is_some() {
                computed.width = Dimension::Percent(1.0);
            }
        }
        // Derive aspect ratio from attributes or viewBox
        if computed.aspect_ratio.is_none() {
            let ratio_w = attr_w.or(viewbox_dims.map(|(w, _)| w));
            let ratio_h = attr_h.or(viewbox_dims.map(|(_, h)| h));
            if let (Some(w), Some(h)) = (ratio_w, ratio_h) {
                if h > 0.0 {
                    computed.aspect_ratio = Some(w / h);
                }
            }
        }
        let style = build_taffy_style(&computed);
        let node = taffy.new_leaf(style).expect("taffy new_leaf");
        node_map.insert(element_id, node);
        svg_data.insert(element_id, element.serialize_to_xml());
        return node;
    }

    // Handle <img> elements as leaf nodes
    if element.tag == "img" {
        let mut computed = computed;
        let mut intrinsic_w = element.get_attr("width").and_then(|v| v.parse::<f32>().ok());
        let mut intrinsic_h = element.get_attr("height").and_then(|v| v.parse::<f32>().ok());
        // When the <img> has no width/height attributes but its src is an SVG
        // data URI, extract intrinsic dimensions from the SVG itself.
        if intrinsic_w.is_none() || intrinsic_h.is_none() {
            if let Some(src) = element.get_attr("src") {
                if let Some((sw, sh)) = extract_svg_data_uri_dimensions(src) {
                    intrinsic_w = intrinsic_w.or(Some(sw));
                    intrinsic_h = intrinsic_h.or(Some(sh));
                }
            }
        }
        let css_width_is_auto = matches!(computed.width, Dimension::Auto);
        let css_height_is_auto = matches!(computed.height, Dimension::Auto);
        // When both dimensions are auto, use intrinsic sizes as fallback.
        // When only one is auto and we have an aspect ratio, leave it auto
        // so Taffy can compute it from the other dimension + aspect ratio.
        if css_width_is_auto {
            if let Some(w) = intrinsic_w {
                if css_height_is_auto {
                    computed.width = Dimension::Points(w * 0.75);
                }
            }
        }
        if css_height_is_auto {
            if let Some(h) = intrinsic_h {
                if css_width_is_auto {
                    computed.height = Dimension::Points(h * 0.75);
                }
            }
        }
        // Derive aspect ratio from intrinsic dimensions when not explicitly set
        if computed.aspect_ratio.is_none() {
            if let (Some(w), Some(h)) = (intrinsic_w, intrinsic_h) {
                if h > 0.0 {
                    computed.aspect_ratio = Some(w / h);
                }
            }
        }
        let style = build_taffy_style(&computed);
        let node = taffy.new_leaf(style).expect("taffy new_leaf");
        node_map.insert(element_id, node);
        if let Some(src) = element.get_attr("src") {
            image_data.insert(element_id, src.to_string());
        }
        return node;
    }

    // Handle <table> elements — flatten to grid with cell children
    if element.tag == "table" {
        let cells = collect_table_cells(element);
        let num_cols = count_table_columns(element);
        let num_rows = if num_cols > 0 { cells.len().div_ceil(num_cols) } else { 0 };
        let border_collapse = computed.border_collapse;
        let mut computed = computed;
        computed.display = Display::Grid;
        if computed.grid_template_columns.is_empty() && num_cols > 0 {
            computed.grid_template_columns = vec![crate::style::TrackSize::Fr(1.0); num_cols];
        }
        // For border-collapse, remove table's own border (cells handle it)
        if border_collapse {
            computed.border_widths = crate::style::Edges::zero();
        }
        let style = build_taffy_style(&computed);
        let mut children = Vec::new();
        for (i, cell_el) in cells.iter().enumerate() {
            // Apply border-collapse: each internal shared border is drawn once.
            // Convention: top/left borders win; remove bottom (except last row)
            // and right (except last column) to avoid doubling.
            if border_collapse && num_cols > 0 {
                let row = i / num_cols;
                let col = i % num_cols;
                let cell_id = std::ptr::from_ref(*cell_el) as usize;
                if let Some(cell_style) = styles.styles.get_mut(&cell_id) {
                    if row < num_rows - 1 {
                        cell_style.border_widths.bottom = 0.0;
                    }
                    if col < num_cols - 1 {
                        cell_style.border_widths.right = 0.0;
                    }
                }
            }
            let child_node = build_taffy_tree(taffy, cell_el, styles, fonts, node_map, svg_data, image_data, 0);
            children.push(child_node);
        }
        let node = taffy.new_with_children(style, &children).expect("taffy new_with_children");
        node_map.insert(element_id, node);
        return node;
    }

    // Generate list marker for <li> elements
    let list_marker = if element.tag == "li" {
        match computed.list_style_type {
            crate::style::ListStyleType::Disc => Some("\u{2022} ".to_string()),
            crate::style::ListStyleType::Decimal => Some(format!("{li_index}. ")),
            crate::style::ListStyleType::None => None,
        }
    } else {
        None
    };

    // Check if this container has inline content that should be flattened.
    // Also treat as inline if pseudo-elements are present with text children.
    let has_pseudo = computed.before.is_some() || computed.after.is_some() || list_marker.is_some();
    let has_inline_content = has_mixed_inline_content(&element.children, styles)
        || (has_pseudo && has_text_or_inline_children(&element.children, styles));

    let mut children = Vec::new();

    // Helper: create a text leaf from a pseudo-element
    let make_pseudo_leaf = |taffy: &mut TaffyTree<TextContext>, pseudo: &crate::style::PseudoElementStyle, parent: &ComputedStyle| -> NodeId {
        taffy.new_leaf_with_context(
            Style::DEFAULT,
            TextContext {
                runs: vec![TextRun {
                    text: pseudo.content.clone(),
                    font_family: parent.font_family.clone(),
                    font_size: parent.font_size,
                    font_weight: pseudo.font_weight,
                    font_style: pseudo.font_style,
                    color: pseudo.color,
                }],
                white_space: parent.white_space,
                line_height: parent.line_height,
            },
        ).expect("taffy new_leaf_with_context")
    };

    if has_inline_content {
        // Flatten inline content into styled text runs
        let mut runs = Vec::new();

        // Add list marker as first run
        if let Some(ref marker) = list_marker {
            runs.push(TextRun {
                text: marker.clone(),
                font_family: computed.font_family.clone(),
                font_size: computed.font_size,
                font_weight: computed.font_weight,
                font_style: computed.font_style,
                color: computed.color,
            });
        }

        // Add ::before content as first run
        if let Some(ref before) = computed.before {
            runs.push(TextRun {
                text: before.content.clone(),
                font_family: computed.font_family.clone(),
                font_size: computed.font_size,
                font_weight: before.font_weight,
                font_style: before.font_style,
                color: before.color,
            });
        }

        collect_inline_runs(element, &element.children, styles, &computed, &mut runs);

        // Add ::after content as last run
        if let Some(ref after) = computed.after {
            runs.push(TextRun {
                text: after.content.clone(),
                font_family: computed.font_family.clone(),
                font_size: computed.font_size,
                font_weight: after.font_weight,
                font_style: after.font_style,
                color: after.color,
            });
        }

        if !runs.is_empty() {
            let text_node = taffy
                .new_leaf_with_context(
                    Style::DEFAULT,
                    TextContext {
                        runs,
                        white_space: computed.white_space,
                        line_height: computed.line_height,
                    },
                )
                .expect("taffy new_leaf_with_context");
            children.push(text_node);
        }
    } else {
        // Add ::before as first child
        if let Some(ref before) = computed.before {
            children.push(make_pseudo_leaf(taffy, before, &computed));
        }

        let mut content_children = Vec::new();
        let mut child_li_counter = 0usize;
        // Accumulate consecutive text nodes so they flow inline instead of
        // stacking as separate block children (e.g. React comment nodes
        // `<!-- -->` split "2/0" into "2", "/", "0" text nodes).
        let mut pending_text = String::new();

        let flush_pending_text = |pending: &mut String,
                                  out: &mut Vec<NodeId>,
                                  taffy: &mut TaffyTree<TextContext>,
                                  computed: &ComputedStyle| {
            let trimmed = pending.trim();
            if !trimmed.is_empty() {
                let text_node = taffy
                    .new_leaf_with_context(
                        Style::DEFAULT,
                        TextContext {
                            runs: vec![TextRun {
                                text: trimmed.to_string(),
                                font_family: computed.font_family.clone(),
                                font_size: computed.font_size,
                                font_weight: computed.font_weight,
                                font_style: computed.font_style,
                                color: computed.color,
                            }],
                            white_space: computed.white_space,
                            line_height: computed.line_height,
                        },
                    )
                    .expect("taffy new_leaf_with_context");
                out.push(text_node);
            }
            pending.clear();
        };

        for child in &element.children {
            match child {
                DomNode::Element(child_el) => {
                    if child_el.tag == "style" || child_el.tag == "head" {
                        continue;
                    }
                    flush_pending_text(
                        &mut pending_text,
                        &mut content_children,
                        taffy,
                        &computed,
                    );
                    let child_li_index = if child_el.tag == "li" {
                        child_li_counter += 1;
                        child_li_counter
                    } else {
                        0
                    };
                    let child_node = build_taffy_tree(taffy, child_el, styles, fonts, node_map, svg_data, image_data, child_li_index);
                    content_children.push(child_node);
                }
                DomNode::Text(text) => {
                    pending_text.push_str(text);
                }
            }
        }
        flush_pending_text(
            &mut pending_text,
            &mut content_children,
            taffy,
            &computed,
        );

        // Add ::after as last child
        if let Some(ref after) = computed.after {
            content_children.push(make_pseudo_leaf(taffy, after, &computed));
        }

        // For block-content <li>, use flex-row layout so the marker sits
        // inline-left of the content instead of stacking vertically.
        if let Some(ref marker) = list_marker {
            let marker_node = taffy.new_leaf_with_context(
                Style {
                    flex_shrink: 0.0,
                    ..Style::DEFAULT
                },
                TextContext {
                    runs: vec![TextRun {
                        text: marker.clone(),
                        font_family: computed.font_family.clone(),
                        font_size: computed.font_size,
                        font_weight: computed.font_weight,
                        font_style: computed.font_style,
                        color: computed.color,
                    }],
                    white_space: computed.white_space,
                    line_height: computed.line_height,
                },
            ).expect("taffy new_leaf_with_context");
            let content_wrapper = taffy.new_with_children(
                Style {
                    flex_grow: 1.0,
                    flex_shrink: 1.0,
                    min_size: Size { width: length(0.0), height: auto() },
                    ..Style::DEFAULT
                },
                &content_children,
            ).expect("taffy new_with_children");
            children.push(marker_node);
            children.push(content_wrapper);
        } else {
            children.append(&mut content_children);
        }
    }

    let mut style = build_taffy_style(&computed);

    // Block-content <li> with a marker uses flex-row so the marker sits
    // beside the content rather than stacking vertically.
    if list_marker.is_some() && !has_inline_content {
        style.display = taffy::Display::Flex;
        style.flex_direction = taffy::FlexDirection::Row;
    }

    let node = taffy
        .new_with_children(style, &children)
        .expect("taffy new_with_children");
    node_map.insert(element_id, node);
    node
}

/// Extract intrinsic (width, height) from an SVG data URI.
/// Decodes the data URI, parses the SVG root element, and reads `width`/`height`
/// attributes or falls back to `viewBox` dimensions.
fn extract_svg_data_uri_dimensions(uri: &str) -> Option<(f32, f32)> {
    use base64::Engine;
    let rest = uri.strip_prefix("data:")?;
    let (mime, svg_xml) = if let Some(base64_sep) = rest.find(";base64,") {
        let mime = &rest[..base64_sep];
        let encoded = &rest[base64_sep + 8..];
        let data = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .ok()?;
        (mime, String::from_utf8(data).ok()?)
    } else {
        // URL-encoded SVG (e.g. data:image/svg+xml,%3Csvg...)
        let comma = rest.find(',')?;
        let mime = &rest[..comma];
        let encoded = &rest[comma + 1..];
        let decoded = crate::paint::percent_decode(encoded);
        (mime, decoded)
    };
    if !mime.contains("svg") {
        return None;
    }
    // Parse the SVG root element to extract width/height/viewBox
    let parsed = crate::dom::parse_html(&svg_xml).ok()?;
    let svg_el = find_element_by_tag(&parsed.document, "svg")?;
    let attr_w = svg_el
        .get_attr("width")
        .and_then(|v| v.trim_end_matches("px").parse::<f32>().ok());
    let attr_h = svg_el
        .get_attr("height")
        .and_then(|v| v.trim_end_matches("px").parse::<f32>().ok());
    if let (Some(w), Some(h)) = (attr_w, attr_h) {
        return Some((w, h));
    }
    // Fall back to viewBox dimensions
    if let Some(dims) = svg_el.get_attr("viewBox").and_then(parse_viewbox_dims) {
        return Some((attr_w.unwrap_or(dims.0), attr_h.unwrap_or(dims.1)));
    }
    None
}

/// Find the first element with the given tag name (depth-first).
fn find_element_by_tag<'a>(element: &'a ElementNode, tag: &str) -> Option<&'a ElementNode> {
    if element.tag == tag {
        return Some(element);
    }
    for child in &element.children {
        if let DomNode::Element(el) = child {
            if let Some(found) = find_element_by_tag(el, tag) {
                return Some(found);
            }
        }
    }
    None
}

/// Check if a list of children contains mixed inline content (text + inline elements)
/// that should be flattened into a single text node.
fn has_mixed_inline_content(children: &[DomNode], styles: &StyleResult) -> bool {
    let mut has_text = false;
    let mut has_inline_element = false;

    for child in children {
        match child {
            DomNode::Text(t) => {
                if !t.trim().is_empty() {
                    has_text = true;
                }
            }
            DomNode::Element(el) => {
                if el.tag == "style" || el.tag == "head" {
                    continue;
                }
                let el_id = std::ptr::from_ref(el) as usize;
                let is_inline = styles
                    .styles
                    .get(&el_id)
                    .is_some_and(|s| matches!(s.display, Display::Inline));
                if is_inline {
                    has_inline_element = true;
                } else {
                    // Has a block-level element — not pure inline content
                    return false;
                }
            }
        }
    }

    has_text && has_inline_element
}

/// Check if children contain any text or inline elements (but no block elements).
fn has_text_or_inline_children(children: &[DomNode], styles: &StyleResult) -> bool {
    for child in children {
        match child {
            DomNode::Text(t) => {
                if !t.trim().is_empty() {
                    return true;
                }
            }
            DomNode::Element(el) => {
                if el.tag == "style" || el.tag == "head" {
                    continue;
                }
                let el_id = std::ptr::from_ref(el) as usize;
                let is_inline = styles
                    .styles
                    .get(&el_id)
                    .is_some_and(|s| matches!(s.display, Display::Inline));
                if !is_inline {
                    return false;
                }
            }
        }
    }
    true
}

/// Collapse whitespace: newlines → space, multiple spaces → one space.
fn collapse_whitespace(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut prev_was_space = false;
    for c in s.chars() {
        if c.is_whitespace() {
            if !prev_was_space {
                result.push(' ');
                prev_was_space = true;
            }
        } else {
            result.push(c);
            prev_was_space = false;
        }
    }
    result
}

/// Recursively collect text runs from inline content.
fn collect_inline_runs(
    _parent: &ElementNode,
    children: &[DomNode],
    styles: &StyleResult,
    parent_computed: &ComputedStyle,
    runs: &mut Vec<TextRun>,
) {
    for child in children {
        match child {
            DomNode::Text(text) => {
                let collapsed = collapse_whitespace(text);
                let trimmed = if runs.is_empty() {
                    collapsed.trim_start().to_string()
                } else {
                    collapsed
                };
                if !trimmed.is_empty() {
                    runs.push(TextRun {
                        text: trimmed,
                        font_family: parent_computed.font_family.clone(),
                        font_size: parent_computed.font_size,
                        font_weight: parent_computed.font_weight,
                        font_style: parent_computed.font_style,
                        color: parent_computed.color,
                    });
                }
            }
            DomNode::Element(el) => {
                if el.tag == "style" || el.tag == "head" {
                    continue;
                }
                let el_id = std::ptr::from_ref(el) as usize;
                let el_style = styles
                    .styles
                    .get(&el_id)
                    .cloned()
                    .unwrap_or_default();
                collect_inline_runs(el, &el.children, styles, &el_style, runs);
            }
        }
    }
}

fn measure_text_node(
    known: Size<Option<f32>>,
    available: Size<AvailableSpace>,
    ctx: Option<&mut TextContext>,
    fonts: &FontCollection,
) -> Size<f32> {
    let Some(ctx) = ctx else {
        return Size::ZERO;
    };

    let max_width = known.width.unwrap_or(match available.width {
        AvailableSpace::Definite(w) => w,
        AvailableSpace::MinContent => 0.0,
        AvailableSpace::MaxContent => f32::INFINITY,
    });

    let font_size = ctx.primary_font_size();
    let font_family = ctx.primary_font_family().to_string();
    let font_weight = ctx.primary_font_weight();
    let font_style = ctx.primary_font_style();

    let line_height = if ctx.line_height > 0.0 {
        font_size * ctx.line_height
    } else {
        font_size * fonts.line_height_ratio(&font_family, font_weight, font_style)
    };

    // For multi-run text, measure each run and sum widths for single-line,
    // or concatenate text for line-breaking
    let full_text = ctx.text();

    if matches!(ctx.white_space, WhiteSpace::NoWrap) || max_width.is_infinite() {
        // Measure each run individually for more accurate width
        let width: f32 = ctx.runs.iter().map(|run| {
            fonts.measure_text(
                &run.text,
                &run.font_family,
                run.font_weight,
                run.font_style,
                run.font_size,
            )
        }).sum();
        return Size { width, height: line_height };
    }

    // For wrapping, use concatenated text with primary font (simplified)
    let lines = fonts.break_text_into_lines(
        &full_text,
        &font_family,
        font_weight,
        font_style,
        font_size,
        max_width,
    );
    let width = lines.iter().copied().fold(0.0f32, f32::max);
    let height = lines.len() as f32 * line_height;

    Size { width, height }
}

fn find_element<'a>(element: &'a ElementNode, tag: &str) -> Option<&'a ElementNode> {
    if element.tag == tag {
        return Some(element);
    }
    for child in &element.children {
        if let DomNode::Element(child_el) = child {
            if let Some(found) = find_element(child_el, tag) {
                return Some(found);
            }
        }
    }
    None
}

pub fn query_elements(
    layout: &LayoutResult,
    document: &ElementNode,
    selector: &str,
) -> Vec<ElementInfo> {
    let mut results = Vec::new();
    collect_matching_elements(
        document,
        selector,
        layout,
        0.0,
        0.0,
        &mut results,
        &[],
    );
    results
}

fn collect_matching_elements<'a>(
    element: &'a ElementNode,
    selector: &str,
    layout: &LayoutResult,
    parent_x: f32,
    parent_y: f32,
    results: &mut Vec<ElementInfo>,
    ancestors: &[&'a ElementNode],
) {
    let element_id = std::ptr::from_ref(element) as usize;
    let Some(&node_id) = layout.node_map.get(&element_id) else {
        return;
    };

    let taffy_layout = layout.taffy.layout(node_id).expect("layout not computed");
    let location = layout
        .location_overrides
        .get(&node_id)
        .copied()
        .unwrap_or(taffy_layout.location);
    let x = parent_x + location.x;
    let y = parent_y + location.y;
    // Check if this element matches using the full selector engine
    if crate::style::selector_matches(selector, element, ancestors) {
        let data_attrs: Vec<DataAttribute> = element
            .attributes
            .iter()
            .filter(|(k, _)| k.starts_with("data-"))
            .map(|(k, v)| DataAttribute {
                name: k.clone(),
                value: v.clone(),
            })
            .collect();

        results.push(ElementInfo {
            x: f64::from(x),
            y: f64::from(y),
            width: f64::from(taffy_layout.size.width),
            height: f64::from(taffy_layout.size.height),
            attributes: data_attrs,
        });
    }

    // Recurse with this element added to ancestors
    let mut child_ancestors = vec![element];
    child_ancestors.extend_from_slice(ancestors);
    for child in &element.children {
        if let DomNode::Element(child_el) = child {
            collect_matching_elements(child_el, selector, layout, x, y, results, &child_ancestors);
        }
    }
}

/// Collect all <th> and <td> cells from a table, flattening through
/// <thead>, <tbody>, <tfoot>, and <tr> elements.
fn collect_table_cells(table: &ElementNode) -> Vec<&ElementNode> {
    let mut cells = Vec::new();
    collect_cells_recursive(table, &mut cells);
    cells
}

fn collect_cells_recursive<'a>(element: &'a ElementNode, cells: &mut Vec<&'a ElementNode>) {
    for child in &element.children {
        if let DomNode::Element(el) = child {
            match el.tag.as_str() {
                "th" | "td" => cells.push(el),
                "thead" | "tbody" | "tfoot" | "tr" | "colgroup" => {
                    collect_cells_recursive(el, cells);
                }
                _ => {}
            }
        }
    }
}

/// Count the number of columns in a table from the first row.
fn count_table_columns(table: &ElementNode) -> usize {
    for child in &table.children {
        if let DomNode::Element(el) = child {
            match el.tag.as_str() {
                "tr" => return count_row_cells(el),
                "thead" | "tbody" | "tfoot" => {
                    for tbody_child in &el.children {
                        if let DomNode::Element(tr) = tbody_child {
                            if tr.tag == "tr" {
                                return count_row_cells(tr);
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }
    0
}

fn count_row_cells(tr: &ElementNode) -> usize {
    let mut count = 0;
    for child in &tr.children {
        if let DomNode::Element(el) = child {
            if el.tag == "th" || el.tag == "td" {
                let colspan = el
                    .get_attr("colspan")
                    .and_then(|v| v.parse::<usize>().ok())
                    .unwrap_or(1);
                count += colspan;
            }
        }
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dom::parse_html;
    use crate::fonts::load_fonts;
    use crate::style::resolve_styles;

    fn query_html(html: &str, selector: &str) -> Vec<ElementInfo> {
        let parsed = parse_html(html).expect("parse failed");
        let mut styles = resolve_styles(&parsed);
        let fonts = load_fonts(&styles.font_faces);
        let layout = compute_layout(&parsed.document, &mut styles, &fonts);
        query_elements(&layout, &parsed.document, selector)
    }

    #[test]
    fn test_query_class_selector() {
        let html = r#"<html><body style="width:100pt;height:100pt;margin:0"><div class="target" data-id="1">A</div><div>B</div></body></html>"#;
        let results = query_html(html, ".target");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].attributes.len(), 1);
        assert_eq!(results[0].attributes[0].name, "data-id");
        assert_eq!(results[0].attributes[0].value, "1");
    }

    #[test]
    fn test_query_descendant_selector() {
        let html = r#"<html><body style="width:100pt;height:100pt;margin:0"><div class="parent"><div class="child" data-v="found">X</div></div><div class="child" data-v="skip">Y</div></body></html>"#;
        let results = query_html(html, ".parent .child");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].attributes[0].value, "found");
    }

    #[test]
    fn test_query_compound_selector() {
        let html = r#"<html><body style="width:100pt;height:100pt;margin:0"><div class="a b" data-v="match">X</div><div class="a">Y</div></body></html>"#;
        let results = query_html(html, ".a.b");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].attributes[0].value, "match");
    }

    #[test]
    fn test_block_children_constrained_by_grid_item() {
        let html = r#"<html><body style="width:576pt;height:792pt;margin:0">
            <div style="display:grid;grid-template-columns:1fr 7rem 1.9fr 7.5rem;gap:0.125rem 0.75rem;padding:0.5rem">
                <div><h2 data-v="h2">Instructions</h2></div>
                <div>Col 2</div>
                <div>Col 3</div>
                <div>Col 4</div>
            </div>
        </body></html>"#;
        let results = query_html(html, "[data-v=h2]");
        assert_eq!(results.len(), 1);
        // h2 should be constrained to the first grid column (~1fr of 4 columns)
        // It should NOT be 576pt (full page width)
        assert!(
            results[0].width < 200.0,
            "h2 width {} should be less than 200pt (constrained to grid cell)",
            results[0].width
        );
    }

    #[test]
    fn test_block_children_in_nested_grid() {
        // Matches real ballot structure: page > flex column > box with border+padding > grid
        // The Box and grid are the SAME element (inline grid display + class border/padding)
        let html = r#"<html>
        <head><style>* { box-sizing: border-box; } h2 { font-size: 1.2em; margin: 0; }</style></head>
        <body style="margin:0">
            <div style="width:612pt;height:792pt;padding:14pt">
                <div style="display:flex;flex-direction:column;padding:9pt">
                    <div style="border:1px solid black;border-top-width:3px;padding:6pt;display:grid;gap:1.5pt 9pt;grid-template-columns:1fr 84pt 1.9fr 90pt">
                        <div><h2 data-v="h2"><span>Instructions</span></h2></div>
                        <div>Col 2</div>
                        <div>Col 3</div>
                        <div>Col 4</div>
                    </div>
                </div>
            </div>
        </body></html>"#;
        let results = query_html(html, "[data-v=h2]");
        assert_eq!(results.len(), 1);
        // h2 should fit within the 1fr grid column (~112pt), not overflow
        assert!(
            results[0].width < 200.0,
            "h2 width {} should be less than 200pt (constrained to grid cell)",
            results[0].width
        );
    }

    #[test]
    fn test_img_data_uri_svg_creates_image_data() {
        let html = r#"<html><head><style>
            img { max-width: 100%; height: auto; }
        </style></head><body style="width:200pt;margin:0">
            <p>Before</p>
            <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MCIgaGVpZ2h0PSI1MCIgdmlld0JveD0iMCAwIDUwIDUwIj48Y2lyY2xlIGN4PSIyNSIgY3k9IjI1IiByPSIyMCIgZmlsbD0iYmxhY2siLz48L3N2Zz4=" width="50" height="50" />
            <p>After</p>
        </body></html>"#;
        let parsed = parse_html(html).expect("parse failed");
        let mut styles = resolve_styles(&parsed);
        let fonts = load_fonts(&styles.font_faces);
        let layout = compute_layout(&parsed.document, &mut styles, &fonts);

        assert!(
            !layout.image_data.is_empty(),
            "Expected image_data to contain the <img> element's data URI"
        );

        // Check that the image node has non-zero layout dimensions
        for (&elem_id, src) in &layout.image_data {
            if src.contains("data:image/svg+xml") {
                let node = layout.node_map[&elem_id];
                let node_layout = layout.taffy.layout(node).expect("layout");
                let w = node_layout.size.width;
                let h = node_layout.size.height;
                assert!(w > 0.0, "img width should be > 0, got {}", w);
                assert!(h > 0.0, "img height should be > 0, got {}", h);
            }
        }
    }

    #[test]
    fn test_img_svg_data_uri_no_width_height_attrs() {
        // Reproduces the real ballot scenario: <img> with SVG data URI but
        // no width/height HTML attributes. The renderer should extract
        // intrinsic dimensions from the SVG's width/height/viewBox.
        let html = r#"<html><head><style>
            img { max-width: 100%; height: auto; }
        </style></head><body style="width:200pt;margin:0">
            <p>Before</p>
            <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MCIgaGVpZ2h0PSI1MCIgdmlld0JveD0iMCAwIDUwIDUwIj48Y2lyY2xlIGN4PSIyNSIgY3k9IjI1IiByPSIyMCIgZmlsbD0iYmxhY2siLz48L3N2Zz4=" />
            <p>After</p>
        </body></html>"#;
        let parsed = parse_html(html).expect("parse failed");
        let mut styles = resolve_styles(&parsed);
        let fonts = load_fonts(&styles.font_faces);
        let layout = compute_layout(&parsed.document, &mut styles, &fonts);

        assert!(
            !layout.image_data.is_empty(),
            "Expected image_data to contain the <img> element's data URI"
        );

        for (&elem_id, src) in &layout.image_data {
            if src.contains("data:image/svg+xml") {
                let node = layout.node_map[&elem_id];
                let node_layout = layout.taffy.layout(node).expect("layout");
                let w = node_layout.size.width;
                let h = node_layout.size.height;
                // SVG has width=50 height=50 → 37.5pt each
                assert!(w > 0.0, "img width should be > 0, got {}", w);
                assert!(h > 0.0, "img height should be > 0, got {}", h);
                assert!((w - 37.5).abs() < 1.0, "img width should be ~37.5pt, got {}", w);
                assert!((h - 37.5).abs() < 1.0, "img height should be ~37.5pt, got {}", h);
            }
        }
    }
}
