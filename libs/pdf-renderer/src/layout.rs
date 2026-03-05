use std::collections::HashMap;

use taffy::prelude::*;

use crate::dom::{DomNode, ElementNode};
use crate::fonts::FontCollection;
use crate::style::{
    AlignItems, AlignSelf, BoxSizing, ComputedStyle, Dimension, Display, FlexDirection, FlexWrap,
    JustifyContent, Position, StyleResult, WhiteSpace,
};
use crate::{DataAttribute, ElementInfo};

/// Context carried with leaf text nodes for measurement
pub(crate) struct TextContext {
    text: String,
    font_family: String,
    font_size: f32,
    font_weight: u16,
    font_style: crate::style::FontStyle,
    white_space: WhiteSpace,
}

impl TextContext {
    pub(crate) fn text(&self) -> &str {
        &self.text
    }
}

/// Result of layout computation
pub struct LayoutResult {
    pub taffy: TaffyTree<TextContext>,
    pub root: NodeId,
    /// Map from DOM element pointer → taffy NodeId
    pub node_map: HashMap<usize, NodeId>,
    /// Page dimensions in points
    pub page_width: f32,
    pub page_height: f32,
}

fn convert_dimension(dim: Dimension) -> taffy::Dimension {
    match dim {
        Dimension::Auto => taffy::Dimension::Auto,
        Dimension::Points(v) => taffy::Dimension::Length(v),
        Dimension::Percent(v) => taffy::Dimension::Percent(v),
    }
}

fn convert_length_percent_auto(dim: Dimension) -> LengthPercentageAuto {
    match dim {
        Dimension::Auto => LengthPercentageAuto::Auto,
        Dimension::Points(v) => LengthPercentageAuto::Length(v),
        Dimension::Percent(v) => LengthPercentageAuto::Percent(v),
    }
}

fn convert_length_percent(dim: Dimension) -> LengthPercentage {
    match dim {
        Dimension::Points(v) => LengthPercentage::Length(v),
        Dimension::Percent(v) => LengthPercentage::Percent(v),
        Dimension::Auto => LengthPercentage::Length(0.0),
    }
}

fn build_taffy_style(computed: &ComputedStyle) -> Style {
    let display = match computed.display {
        Display::Flex => taffy::Display::Flex,
        Display::Grid => taffy::Display::Grid,
        Display::Block => taffy::Display::Block,
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
        justify_content,
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
            width: taffy::Dimension::Auto,
            height: convert_dimension(computed.min_height),
        },
        padding: Rect {
            top: convert_length_percent(Dimension::Points(computed.padding.top)),
            right: convert_length_percent(Dimension::Points(computed.padding.right)),
            bottom: convert_length_percent(Dimension::Points(computed.padding.bottom)),
            left: convert_length_percent(Dimension::Points(computed.padding.left)),
        },
        margin: Rect {
            top: convert_length_percent_auto(Dimension::Points(computed.margin.top)),
            right: convert_length_percent_auto(Dimension::Points(computed.margin.right)),
            bottom: convert_length_percent_auto(Dimension::Points(computed.margin.bottom)),
            left: convert_length_percent_auto(Dimension::Points(computed.margin.left)),
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
    styles: &StyleResult,
    fonts: &FontCollection,
) -> LayoutResult {
    let mut taffy: TaffyTree<TextContext> = TaffyTree::new();
    let mut node_map = HashMap::new();

    let root = build_taffy_tree(&mut taffy, document, styles, fonts, &mut node_map);

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

    LayoutResult {
        taffy,
        root,
        node_map,
        page_width,
        page_height,
    }
}

#[allow(clippy::only_used_in_recursion)]
fn build_taffy_tree(
    taffy: &mut TaffyTree<TextContext>,
    element: &ElementNode,
    styles: &StyleResult,
    fonts: &FontCollection,
    node_map: &mut HashMap<usize, NodeId>,
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

    // Skip SVG internals — they'll be rendered as images
    if element.tag == "svg" {
        let style = build_taffy_style(&computed);
        let node = taffy.new_leaf(style).expect("taffy new_leaf");
        node_map.insert(element_id, node);
        return node;
    }

    let mut children = Vec::new();

    for child in &element.children {
        match child {
            DomNode::Element(child_el) => {
                // Skip style, head elements
                if child_el.tag == "style" || child_el.tag == "head" {
                    continue;
                }
                let child_node = build_taffy_tree(taffy, child_el, styles, fonts, node_map);
                children.push(child_node);
            }
            DomNode::Text(text) => {
                let text = text.trim();
                if text.is_empty() {
                    continue;
                }
                // Create a leaf node for text
                let text_node = taffy
                    .new_leaf_with_context(
                        Style::DEFAULT,
                        TextContext {
                            text: text.to_string(),
                            font_family: computed.font_family.clone(),
                            font_size: computed.font_size,
                            font_weight: computed.font_weight,
                            font_style: computed.font_style,
                            white_space: computed.white_space,
                        },
                    )
                    .expect("taffy new_leaf_with_context");
                children.push(text_node);
            }
        }
    }

    let style = build_taffy_style(&computed);
    let node = taffy
        .new_with_children(style, &children)
        .expect("taffy new_with_children");
    node_map.insert(element_id, node);
    node
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

    let line_height_ratio =
        fonts.line_height_ratio(&ctx.font_family, ctx.font_weight, ctx.font_style);

    if matches!(ctx.white_space, WhiteSpace::NoWrap) || max_width.is_infinite() {
        let width = fonts.measure_text(
            &ctx.text,
            &ctx.font_family,
            ctx.font_weight,
            ctx.font_style,
            ctx.font_size,
        );
        let height = ctx.font_size * line_height_ratio;
        return Size { width, height };
    }

    let lines = fonts.break_text_into_lines(
        &ctx.text,
        &ctx.font_family,
        ctx.font_weight,
        ctx.font_style,
        ctx.font_size,
        max_width,
    );

    let line_height = ctx.font_size * line_height_ratio;
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
        None,
    );
    results
}

fn collect_matching_elements(
    element: &ElementNode,
    selector: &str,
    layout: &LayoutResult,
    parent_x: f32,
    parent_y: f32,
    results: &mut Vec<ElementInfo>,
    _parent: Option<&ElementNode>,
) {
    let element_id = std::ptr::from_ref(element) as usize;
    let Some(&node_id) = layout.node_map.get(&element_id) else {
        return;
    };

    let taffy_layout = layout.taffy.layout(node_id).expect("layout not computed");
    let x = parent_x + taffy_layout.location.x;
    let y = parent_y + taffy_layout.location.y;

    // Check if this element matches the selector
    if matches_selector(element, selector) {
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

    // Recurse
    for child in &element.children {
        if let DomNode::Element(child_el) = child {
            collect_matching_elements(child_el, selector, layout, x, y, results, Some(element));
        }
    }
}

fn matches_selector(element: &ElementNode, selector: &str) -> bool {
    let selector = selector.trim();

    // Handle class selector: .foo
    if let Some(class_name) = selector.strip_prefix('.') {
        return element.classes().any(|c| c == class_name);
    }

    // Handle element selector
    if selector == element.tag {
        return true;
    }

    // Handle element.class
    if let Some((tag, class)) = selector.split_once('.') {
        return tag == element.tag && element.classes().any(|c| c == class);
    }

    false
}
