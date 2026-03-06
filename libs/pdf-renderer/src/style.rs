use std::collections::{HashMap, HashSet};

use crate::dom::{DomNode, ElementNode, ParseResult};

/// A resolved font-face declaration
#[derive(Debug, Clone)]
pub struct FontFace {
    pub family: String,
    pub weight: u16,
    pub style: FontStyle,
    pub data: Vec<u8>, // decoded TTF bytes
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FontStyle {
    Normal,
    Italic,
}

/// Computed style values for a single element, in PDF points
#[derive(Debug, Clone)]
pub struct ComputedStyle {
    // Display & layout
    pub display: Display,
    pub flex_direction: FlexDirection,
    pub flex_wrap: FlexWrap,
    pub flex_grow: f32,
    pub flex_shrink: f32,
    pub flex_basis: Dimension,
    pub justify_content: JustifyContent,
    pub align_items: AlignItems,
    pub align_content: AlignContent,
    pub align_self: AlignSelf,
    pub gap: (f32, f32), // row, column

    // Grid
    pub grid_template_columns: Vec<TrackSize>,

    // Box model (in points)
    pub width: Dimension,
    pub height: Dimension,
    pub min_width: Dimension,
    pub min_height: Dimension,
    pub max_width: Dimension,
    pub max_height: Dimension,
    pub aspect_ratio: Option<f32>,
    pub padding: Edges,
    pub margin: DimensionEdges,
    pub border_widths: Edges,

    // Positioning
    pub position: Position,
    pub top: Dimension,
    pub left: Dimension,
    pub right: Dimension,
    pub bottom: Dimension,

    // Typography
    pub font_family: String,
    pub font_size: f32, // points
    pub font_weight: u16,
    pub font_style: FontStyle,
    pub line_height: f32, // multiplier
    pub text_align: TextAlign,
    pub text_transform: TextTransform,
    pub white_space: WhiteSpace,

    // Color
    pub color: Color,
    pub background_color: Color,
    pub background_image: Option<String>, // data URI
    pub background_size: BackgroundSize,
    pub background_repeat: BackgroundRepeat,

    // Borders
    pub border_colors: BorderColors,
    pub border_style: BorderStyle,
    pub border_radius: f32,
    pub border_collapse: bool, // true = collapse (table only)

    // Box sizing
    pub box_sizing: BoxSizing,

    // Visual
    pub overflow: Overflow,
    pub visibility: Visibility,
    pub transform: Option<Transform>,
    pub opacity: f32,
    pub z_index: i32,

    // Content (for pseudo-elements)
    pub content: Option<String>,

    // Pseudo-element generated content
    pub before: Option<Box<PseudoElementStyle>>,
    pub after: Option<Box<PseudoElementStyle>>,

    // Lists
    pub list_style_type: ListStyleType,

    // Page break control
    pub break_inside: BreakInside,
}

#[derive(Debug, Clone)]
pub struct PseudoElementStyle {
    pub content: String,
    pub color: Color,
    pub display: Display,
    pub font_weight: u16,
    pub font_style: FontStyle,
}

impl Default for ComputedStyle {
    fn default() -> Self {
        Self {
            display: Display::Block,
            flex_direction: FlexDirection::Row,
            flex_wrap: FlexWrap::NoWrap,
            flex_grow: 0.0,
            flex_shrink: 1.0,
            flex_basis: Dimension::Auto,
            justify_content: JustifyContent::FlexStart,
            align_content: AlignContent::Stretch,
            align_items: AlignItems::Stretch,
            align_self: AlignSelf::Auto,
            gap: (0.0, 0.0),
            grid_template_columns: Vec::new(),
            width: Dimension::Auto,
            height: Dimension::Auto,
            min_width: Dimension::Points(0.0),
            min_height: Dimension::Points(0.0),
            max_width: Dimension::Auto,
            max_height: Dimension::Auto,
            aspect_ratio: None,
            padding: Edges::zero(),
            margin: DimensionEdges::zero(),
            border_widths: Edges::zero(),
            position: Position::Static,
            top: Dimension::Auto,
            left: Dimension::Auto,
            right: Dimension::Auto,
            bottom: Dimension::Auto,
            font_family: String::from("sans-serif"),
            font_size: 12.0,
            font_weight: 400,
            font_style: FontStyle::Normal,
            line_height: 0.0, // 0 = use font metrics (line-height: normal)
            text_align: TextAlign::Left,
            text_transform: TextTransform::None,
            white_space: WhiteSpace::Normal,
            color: Color::BLACK,
            background_color: Color::TRANSPARENT,
            background_image: None,
            background_size: BackgroundSize::Auto,
            background_repeat: BackgroundRepeat::Repeat,
            border_colors: BorderColors::uniform(Color::BLACK),
            border_style: BorderStyle::None,
            border_radius: 0.0,
            border_collapse: false,
            box_sizing: BoxSizing::ContentBox,
            overflow: Overflow::Visible,
            visibility: Visibility::Visible,
            transform: None,
            opacity: 1.0,
            z_index: 0,
            content: None,
            before: None,
            after: None,
            list_style_type: ListStyleType::None,
            break_inside: BreakInside::Auto,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ListStyleType {
    None,
    Disc,
    Decimal,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BreakInside {
    Auto,
    Avoid,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Display {
    Block,
    Flex,
    Grid,
    Inline,
    None,
}

#[derive(Debug, Clone, Copy)]
pub enum FlexDirection {
    Row,
    Column,
}

#[derive(Debug, Clone, Copy)]
pub enum FlexWrap {
    NoWrap,
    Wrap,
}

#[derive(Debug, Clone, Copy)]
pub enum JustifyContent {
    FlexStart,
    FlexEnd,
    Center,
    SpaceBetween,
}

#[derive(Debug, Clone, Copy)]
pub enum AlignItems {
    Stretch,
    FlexStart,
    FlexEnd,
    Center,
}

#[derive(Debug, Clone, Copy)]
pub enum AlignContent {
    Stretch,
    FlexStart,
    FlexEnd,
    Center,
    SpaceBetween,
    SpaceAround,
}

#[derive(Debug, Clone, Copy)]
pub enum AlignSelf {
    Auto,
    Center,
}

#[derive(Debug, Clone, Copy)]
pub enum Position {
    Static,
    Relative,
    Absolute,
}

#[derive(Debug, Clone, Copy)]
pub enum TextAlign {
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, Copy)]
pub enum TextTransform {
    None,
    Uppercase,
}

#[derive(Debug, Clone, Copy)]
pub enum WhiteSpace {
    Normal,
    NoWrap,
}

#[derive(Debug, Clone, Copy)]
pub enum BorderStyle {
    None,
    Solid,
    Dashed,
}

#[derive(Debug, Clone, Copy)]
pub enum BackgroundSize {
    Auto,
    Contain,
    Cover,
}

#[derive(Debug, Clone, Copy)]
pub enum BackgroundRepeat {
    Repeat,
    NoRepeat,
}

#[derive(Debug, Clone, Copy)]
pub enum BoxSizing {
    ContentBox,
    BorderBox,
}

#[derive(Debug, Clone, Copy)]
pub enum Overflow {
    Visible,
    Hidden,
}

#[derive(Debug, Clone, Copy)]
pub enum Visibility {
    Visible,
    Hidden,
}

#[derive(Debug, Clone)]
pub enum Transform {
    ScaleX(f32),
    Rotate(f32), // degrees
    Translate(f32, f32),
    Combined(Vec<Transform>),
}

#[derive(Debug, Clone, Copy)]
pub enum Dimension {
    Auto,
    Points(f32),
    Percent(f32),
    /// calc(percent + points), e.g. calc(100% + 9pt)
    PercentPlus(f32, f32),
}

#[derive(Debug, Clone)]
pub enum TrackSize {
    Points(f32),
    Fr(f32),
    Auto,
}

#[derive(Debug, Clone, Copy)]
pub struct Edges {
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
}

impl Edges {
    pub const fn zero() -> Self {
        Self {
            top: 0.0,
            right: 0.0,
            bottom: 0.0,
            left: 0.0,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct DimensionEdges {
    pub top: Dimension,
    pub right: Dimension,
    pub bottom: Dimension,
    pub left: Dimension,
}

impl DimensionEdges {
    pub const fn zero() -> Self {
        Self {
            top: Dimension::Points(0.0),
            right: Dimension::Points(0.0),
            bottom: Dimension::Points(0.0),
            left: Dimension::Points(0.0),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct BorderColors {
    pub top: Color,
    pub right: Color,
    pub bottom: Color,
    pub left: Color,
}

impl BorderColors {
    pub const fn uniform(color: Color) -> Self {
        Self {
            top: color,
            right: color,
            bottom: color,
            left: color,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: f32,
}

impl Color {
    pub const BLACK: Self = Self {
        r: 0,
        g: 0,
        b: 0,
        a: 1.0,
    };
    pub const WHITE: Self = Self {
        r: 255,
        g: 255,
        b: 255,
        a: 1.0,
    };
    pub const TRANSPARENT: Self = Self {
        r: 0,
        g: 0,
        b: 0,
        a: 0.0,
    };

    pub fn is_transparent(self) -> bool {
        self.a == 0.0
    }
}

/// All resolved styles for a document
pub struct StyleResult {
    /// Computed styles keyed by element pointer identity
    pub styles: HashMap<usize, ComputedStyle>,
    /// Font face declarations
    pub font_faces: Vec<FontFace>,
}

/// Pre-compiled CSS rules and font face declarations, extracted from style
/// text. Reusable across multiple documents that share the same stylesheets.
pub struct CompiledStyles {
    pub(crate) rules: Vec<CssRule>,
    pub font_faces: Vec<FontFace>,
}

impl CompiledStyles {
    /// Parse additional style texts (e.g. from styled-components injected into
    /// the document) and return a combined rule set. Font faces are not
    /// re-parsed since they only appear in the initial stylesheet.
    pub(crate) fn with_additional_styles(&self, style_texts: &[String]) -> Vec<CssRule> {
        if style_texts.is_empty() {
            return self.rules.clone();
        }
        let additional_css: String = style_texts.join("\n");
        let additional_rules = parse_css_rules(&additional_css);
        let mut combined = self.rules.clone();
        combined.extend(additional_rules);
        combined
    }
}

/// Index mapping tag names and class names to rule indices for fast lookup.
/// Instead of checking every rule against every element, we only check rules
/// whose tag or class might match.
struct RuleIndex {
    by_tag: HashMap<String, Vec<usize>>,
    by_class: HashMap<String, Vec<usize>>,
    universal: Vec<usize>,
}

impl RuleIndex {
    fn build(rules: &[CssRule]) -> Self {
        let mut by_tag: HashMap<String, Vec<usize>> = HashMap::new();
        let mut by_class: HashMap<String, Vec<usize>> = HashMap::new();
        let mut universal: Vec<usize> = Vec::new();

        for (i, rule) in rules.iter().enumerate() {
            let selector = rule.selector.trim();
            // Extract the rightmost simple selector (the key selector that must
            // match the target element)
            let key_selector = Self::extract_key_selector(selector);

            if key_selector == "*" || key_selector.is_empty() {
                universal.push(i);
                continue;
            }

            // Strip pseudo-classes and attribute selectors for indexing
            let (base, _pseudo_classes) = extract_pseudo_classes(key_selector);
            let (base_no_attr, _attrs) = extract_attribute_selectors(base);

            // If the selector is only pseudo-classes/attributes with no
            // tag/class (e.g. `:first-child`, `[data-foo]`), it's universal
            if base_no_attr.is_empty() || base_no_attr == "*" {
                universal.push(i);
                continue;
            }

            // If the base starts with :not(...), treat as universal
            if base_no_attr.starts_with(":not(") || base_no_attr.starts_with(':') {
                universal.push(i);
                continue;
            }

            let parts: Vec<&str> = base_no_attr.split('.').collect();
            let tag_part = parts[0];
            let class_parts = &parts[1..];

            let mut indexed = false;

            // Index by tag if present
            if !tag_part.is_empty() {
                by_tag.entry(tag_part.to_string()).or_default().push(i);
                indexed = true;
            }

            // Index by each class
            for class in class_parts {
                if !class.is_empty() {
                    by_class.entry(class.to_string()).or_default().push(i);
                    indexed = true;
                }
            }

            if !indexed {
                universal.push(i);
            }
        }

        Self { by_tag, by_class, universal }
    }

    /// Get the rightmost simple selector from a potentially compound selector.
    /// e.g. "div > .foo .bar" -> ".bar", "div.class" -> "div.class"
    fn extract_key_selector(selector: &str) -> &str {
        // Find the last space or > combinator to get the rightmost part
        let mut last_start = 0;
        let bytes = selector.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            match bytes[i] {
                b' ' | b'>' => {
                    // Skip whitespace
                    let mut j = i + 1;
                    while j < bytes.len() && (bytes[j] == b' ' || bytes[j] == b'>') {
                        j += 1;
                    }
                    if j < bytes.len() {
                        last_start = j;
                    }
                    i = j;
                }
                _ => i += 1,
            }
        }
        &selector[last_start..]
    }

    /// Return candidate rule indices for a given element.
    fn candidates_for(&self, element: &ElementNode) -> Vec<usize> {
        let mut seen = HashSet::new();
        let mut candidates = Vec::new();

        // Add universal rules
        for &idx in &self.universal {
            if seen.insert(idx) {
                candidates.push(idx);
            }
        }

        // Add rules matching by tag
        if let Some(indices) = self.by_tag.get(&element.tag) {
            for &idx in indices {
                if seen.insert(idx) {
                    candidates.push(idx);
                }
            }
        }

        // Add rules matching by class
        for class in element.classes() {
            if let Some(indices) = self.by_class.get(class) {
                for &idx in indices {
                    if seen.insert(idx) {
                        candidates.push(idx);
                    }
                }
            }
        }

        candidates.sort_unstable();
        candidates
    }
}

/// Convert px to points (1px = 0.75pt at 96dpi)
const PX_TO_PT: f32 = 0.75;
/// Convert inches to points
const IN_TO_PT: f32 = 72.0;

fn resolve_length(value: &str, parent_font_size: f32, root_font_size: f32) -> Option<f32> {
    let value = value.trim();
    if value == "0" {
        return Some(0.0);
    }
    // Handle calc() expressions
    if value.starts_with("calc(") && value.ends_with(')') {
        let inner = &value[5..value.len() - 1];
        return eval_calc(inner, parent_font_size, root_font_size);
    }
    if let Some(n) = value.strip_suffix("pt") {
        n.trim().parse::<f32>().ok()
    } else if let Some(n) = value.strip_suffix("px") {
        n.trim().parse::<f32>().ok().map(|v| v * PX_TO_PT)
    } else if let Some(n) = value.strip_suffix("in") {
        n.trim().parse::<f32>().ok().map(|v| v * IN_TO_PT)
    } else if let Some(n) = value.strip_suffix("rem") {
        n.trim().parse::<f32>().ok().map(|v| v * root_font_size)
    } else if let Some(n) = value.strip_suffix("em") {
        n.trim().parse::<f32>().ok().map(|v| v * parent_font_size)
    } else if let Some(n) = value.strip_suffix('%') {
        n.trim().parse::<f32>().ok().map(|v| v / 100.0)
    } else {
        // Try bare number
        value.parse::<f32>().ok()
    }
    // Percent returns a fraction — the caller must handle it
}

/// Evaluate a calc() expression. Supports +, -, *, / with length values.
/// Handles expressions like "100pt + 20pt", "50% - 10pt", "2 * 36pt".
/// Returns None if the expression cannot be evaluated.
fn eval_calc(expr: &str, parent_font_size: f32, root_font_size: f32) -> Option<f32> {
    let expr = expr.trim();

    // Handle nested calc()
    if expr.starts_with("calc(") && expr.ends_with(')') {
        return eval_calc(&expr[5..expr.len() - 1], parent_font_size, root_font_size);
    }

    // Try to find a binary operator (+ or - with surrounding spaces, or * / anywhere)
    // CSS spec requires + and - to be surrounded by whitespace
    if let Some(pos) = find_calc_operator(expr, " + ") {
        let left = eval_calc(&expr[..pos], parent_font_size, root_font_size)?;
        let right = eval_calc(&expr[pos + 3..], parent_font_size, root_font_size)?;
        return Some(left + right);
    }
    if let Some(pos) = find_calc_operator(expr, " - ") {
        let left = eval_calc(&expr[..pos], parent_font_size, root_font_size)?;
        let right = eval_calc(&expr[pos + 3..], parent_font_size, root_font_size)?;
        return Some(left - right);
    }
    // * and / bind tighter but we process left-to-right after + and -
    if let Some(pos) = find_calc_operator(expr, " * ") {
        let left = eval_calc(&expr[..pos], parent_font_size, root_font_size)?;
        let right = eval_calc(&expr[pos + 3..], parent_font_size, root_font_size)?;
        return Some(left * right);
    }
    if let Some(pos) = find_calc_operator(expr, " / ") {
        let left = eval_calc(&expr[..pos], parent_font_size, root_font_size)?;
        let right = eval_calc(&expr[pos + 3..], parent_font_size, root_font_size)?;
        if right == 0.0 {
            return None;
        }
        return Some(left / right);
    }

    // Handle parenthesized subexpressions
    if expr.starts_with('(') && expr.ends_with(')') {
        return eval_calc(&expr[1..expr.len() - 1], parent_font_size, root_font_size);
    }

    // Base case: a single length value
    resolve_length_no_calc(expr, parent_font_size, root_font_size)
}

fn find_calc_operator(expr: &str, op: &str) -> Option<usize> {
    let mut depth = 0i32;
    let bytes = expr.as_bytes();
    let op_bytes = op.as_bytes();
    if op_bytes.len() > bytes.len() {
        return None;
    }
    for i in 0..=bytes.len() - op_bytes.len() {
        match bytes[i] {
            b'(' => depth += 1,
            b')' => depth -= 1,
            _ => {}
        }
        if depth == 0 && &bytes[i..i + op_bytes.len()] == op_bytes {
            return Some(i);
        }
    }
    None
}

fn resolve_length_no_calc(value: &str, parent_font_size: f32, root_font_size: f32) -> Option<f32> {
    let value = value.trim();
    if value == "0" {
        return Some(0.0);
    }
    if let Some(n) = value.strip_suffix("pt") {
        n.trim().parse::<f32>().ok()
    } else if let Some(n) = value.strip_suffix("px") {
        n.trim().parse::<f32>().ok().map(|v| v * PX_TO_PT)
    } else if let Some(n) = value.strip_suffix("in") {
        n.trim().parse::<f32>().ok().map(|v| v * IN_TO_PT)
    } else if let Some(n) = value.strip_suffix("rem") {
        n.trim().parse::<f32>().ok().map(|v| v * root_font_size)
    } else if let Some(n) = value.strip_suffix("em") {
        n.trim().parse::<f32>().ok().map(|v| v * parent_font_size)
    } else if let Some(n) = value.strip_suffix('%') {
        n.trim().parse::<f32>().ok().map(|v| v / 100.0)
    } else {
        value.parse::<f32>().ok()
    }
}

fn parse_color(value: &str) -> Option<Color> {
    let value = value.trim();
    match value {
        "black" | "#000000" | "#000" => Some(Color::BLACK),
        "white" | "#ffffff" | "#fff" | "#FFFFFF" | "#FFF" => Some(Color::WHITE),
        "none" | "transparent" => Some(Color::TRANSPARENT),
        _ if value.starts_with('#') => {
            let hex = &value[1..];
            let (r, g, b) = if hex.len() == 6 {
                (
                    u8::from_str_radix(&hex[0..2], 16).ok()?,
                    u8::from_str_radix(&hex[2..4], 16).ok()?,
                    u8::from_str_radix(&hex[4..6], 16).ok()?,
                )
            } else if hex.len() == 3 {
                let r = u8::from_str_radix(&hex[0..1], 16).ok()?;
                let g = u8::from_str_radix(&hex[1..2], 16).ok()?;
                let b = u8::from_str_radix(&hex[2..3], 16).ok()?;
                (r << 4 | r, g << 4 | g, b << 4 | b)
            } else {
                return None;
            };
            Some(Color { r, g, b, a: 1.0 })
        }
        _ if value.starts_with("rgb(") && !value.starts_with("rgba(") => {
            let inner = value.strip_prefix("rgb(")?.strip_suffix(')')?;
            let parts: Vec<&str> = inner.split(',').collect();
            if parts.len() == 3 {
                Some(Color {
                    r: parts[0].trim().parse().ok()?,
                    g: parts[1].trim().parse().ok()?,
                    b: parts[2].trim().parse().ok()?,
                    a: 1.0,
                })
            } else {
                None
            }
        }
        _ if value.starts_with("rgba(") => {
            let inner = value.strip_prefix("rgba(")?.strip_suffix(')')?;
            let parts: Vec<&str> = inner.split(',').collect();
            if parts.len() == 4 {
                Some(Color {
                    r: parts[0].trim().parse().ok()?,
                    g: parts[1].trim().parse().ok()?,
                    b: parts[2].trim().parse().ok()?,
                    a: parts[3].trim().parse().ok()?,
                })
            } else {
                None
            }
        }
        _ if value.starts_with("hsl(") => {
            let inner = value.strip_prefix("hsl(")?.strip_suffix(')')?;
            let parts: Vec<&str> = inner.split(',').collect();
            if parts.len() == 3 {
                let h: f32 = parts[0].trim().parse().ok()?;
                let s: f32 = parts[1].trim().strip_suffix('%')?.parse::<f32>().ok()? / 100.0;
                let l: f32 = parts[2].trim().strip_suffix('%')?.parse::<f32>().ok()? / 100.0;
                let (r, g, b) = hsl_to_rgb(h, s, l);
                Some(Color { r, g, b, a: 1.0 })
            } else {
                None
            }
        }
        _ => None,
    }
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> (u8, u8, u8) {
    if s == 0.0 {
        let v = (l * 255.0) as u8;
        return (v, v, v);
    }
    let q = if l < 0.5 {
        l * (1.0 + s)
    } else {
        l + s - l * s
    };
    let p = 2.0 * l - q;
    let h = h / 360.0;
    let r = hue_to_rgb(p, q, h + 1.0 / 3.0);
    let g = hue_to_rgb(p, q, h);
    let b = hue_to_rgb(p, q, h - 1.0 / 3.0);
    (
        (r * 255.0) as u8,
        (g * 255.0) as u8,
        (b * 255.0) as u8,
    )
}

fn hue_to_rgb(p: f32, q: f32, mut t: f32) -> f32 {
    if t < 0.0 {
        t += 1.0;
    }
    if t > 1.0 {
        t -= 1.0;
    }
    if t < 1.0 / 6.0 {
        return p + (q - p) * 6.0 * t;
    }
    if t < 1.0 / 2.0 {
        return q;
    }
    if t < 2.0 / 3.0 {
        return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    }
    p
}

/// Parse a simple CSS declaration block (property: value pairs).
/// Handles url(...) data URIs that contain `;` and `:` characters.
fn parse_inline_declarations(style_attr: &str) -> Vec<(String, String)> {
    let mut result = Vec::new();
    let mut chars = style_attr.chars().peekable();

    loop {
        // Skip whitespace
        while chars.peek().is_some_and(|c| c.is_whitespace()) {
            chars.next();
        }
        if chars.peek().is_none() {
            break;
        }

        // Read property name (until ':')
        let mut prop = String::new();
        loop {
            match chars.peek() {
                Some(':') => {
                    chars.next();
                    break;
                }
                Some(&c) => {
                    chars.next();
                    prop.push(c);
                }
                None => break,
            }
        }
        let prop = prop.trim().to_string();
        if prop.is_empty() {
            break;
        }

        // Read value (until ';' outside of url(...) or end)
        let mut value = String::new();
        let mut paren_depth: u32 = 0;
        loop {
            match chars.peek() {
                Some(';') if paren_depth == 0 => {
                    chars.next();
                    break;
                }
                Some('(') => {
                    paren_depth += 1;
                    value.push('(');
                    chars.next();
                }
                Some(')') => {
                    paren_depth = paren_depth.saturating_sub(1);
                    value.push(')');
                    chars.next();
                }
                Some(&c) => {
                    value.push(c);
                    chars.next();
                }
                None => break,
            }
        }
        let value = value.trim().to_string();
        if !prop.is_empty() {
            result.push((prop, value));
        }
    }

    result
}

/// Parse a `grid-template-columns` value into a list of track sizes.
/// Supports: `<length>`, `<fr>`, and `auto` tokens.
fn parse_track_list(value: &str, parent_font_size: f32, root_font_size: f32) -> Vec<TrackSize> {
    let mut tracks = Vec::new();
    for token in value.split_whitespace() {
        if let Some(n) = token.strip_suffix("fr") {
            if let Ok(v) = n.trim().parse::<f32>() {
                tracks.push(TrackSize::Fr(v));
                continue;
            }
        }
        if token == "auto" {
            tracks.push(TrackSize::Auto);
            continue;
        }
        if let Some(pts) = resolve_length(token, parent_font_size, root_font_size) {
            tracks.push(TrackSize::Points(pts));
        }
    }
    tracks
}

/// Copy a single CSS property from parent style (for the `inherit` keyword).
fn apply_inherit(style: &mut ComputedStyle, prop: &str, parent: &ComputedStyle) {
    match prop {
        "box-sizing" => style.box_sizing = parent.box_sizing,
        "display" => style.display = parent.display,
        "color" => style.color = parent.color,
        "font-weight" => style.font_weight = parent.font_weight,
        "font-style" => style.font_style = parent.font_style,
        "font-family" => style.font_family.clone_from(&parent.font_family),
        "font-size" => style.font_size = parent.font_size,
        "line-height" => style.line_height = parent.line_height,
        "text-align" => style.text_align = parent.text_align,
        "visibility" => style.visibility = parent.visibility,
        "list-style-type" => style.list_style_type = parent.list_style_type,
        _ => {} // unsupported property — silently ignore
    }
}

/// Apply a property-value pair to a `ComputedStyle`
fn apply_property(style: &mut ComputedStyle, prop: &str, value: &str, root_font_size: f32) {
    let fs = style.font_size;
    match prop {
        "display" => {
            style.display = match value {
                "flex" => Display::Flex,
                "grid" => Display::Grid,
                "inline" | "inline-block" => Display::Inline,
                "none" => Display::None,
                _ => Display::Block,
            };
        }
        "flex-direction" => {
            style.flex_direction = match value {
                "column" => FlexDirection::Column,
                _ => FlexDirection::Row,
            };
        }
        "flex-wrap" => {
            style.flex_wrap = match value {
                "wrap" => FlexWrap::Wrap,
                _ => FlexWrap::NoWrap,
            };
        }
        "flex" => {
            // CSS `flex` shorthand: a single number means
            // flex-grow: <number>; flex-shrink: 1; flex-basis: 0%
            if let Ok(v) = value.parse::<f32>() {
                style.flex_grow = v;
                style.flex_shrink = 1.0;
                style.flex_basis = Dimension::Percent(0.0);
            }
        }
        "flex-grow" => {
            if let Ok(v) = value.parse::<f32>() {
                style.flex_grow = v;
            }
        }
        "flex-shrink" => {
            if let Ok(v) = value.parse::<f32>() {
                style.flex_shrink = v;
            }
        }
        "flex-basis" => {
            style.flex_basis = parse_dimension(value, fs, root_font_size);
        }
        "justify-content" => {
            style.justify_content = match value {
                "center" => JustifyContent::Center,
                "space-between" => JustifyContent::SpaceBetween,
                "flex-end" | "end" => JustifyContent::FlexEnd,
                _ => JustifyContent::FlexStart,
            };
        }
        "align-content" => {
            style.align_content = match value {
                "center" => AlignContent::Center,
                "flex-start" => AlignContent::FlexStart,
                "flex-end" => AlignContent::FlexEnd,
                "space-between" => AlignContent::SpaceBetween,
                "space-around" => AlignContent::SpaceAround,
                _ => AlignContent::Stretch,
            };
        }
        "align-items" => {
            style.align_items = match value {
                "center" => AlignItems::Center,
                "flex-start" => AlignItems::FlexStart,
                "flex-end" => AlignItems::FlexEnd,
                _ => AlignItems::Stretch,
            };
        }
        "align-self" => {
            style.align_self = match value {
                "center" => AlignSelf::Center,
                _ => AlignSelf::Auto,
            };
        }
        "gap" => {
            let parts: Vec<&str> = value.split_whitespace().collect();
            if let Some(row) = parts.first().and_then(|v| resolve_length(v, fs, root_font_size)) {
                let col = parts
                    .get(1)
                    .and_then(|v| resolve_length(v, fs, root_font_size))
                    .unwrap_or(row);
                style.gap = (row, col);
            }
        }
        "grid-template-columns" => {
            style.grid_template_columns = parse_track_list(value, fs, root_font_size);
        }
        "width" => {
            style.width = parse_dimension(value, fs, root_font_size);
        }
        "height" => {
            style.height = parse_dimension(value, fs, root_font_size);
        }
        "min-width" => {
            style.min_width = parse_dimension(value, fs, root_font_size);
        }
        "min-height" => {
            style.min_height = parse_dimension(value, fs, root_font_size);
        }
        "max-width" => {
            style.max_width = parse_dimension(value, fs, root_font_size);
        }
        "max-height" => {
            style.max_height = parse_dimension(value, fs, root_font_size);
        }
        "padding" => {
            apply_shorthand_edges(&mut style.padding, value, fs, root_font_size);
        }
        "padding-top" => {
            if let Some(v) = resolve_length(value, fs, root_font_size) {
                style.padding.top = v;
            }
        }
        "padding-right" => {
            if let Some(v) = resolve_length(value, fs, root_font_size) {
                style.padding.right = v;
            }
        }
        "padding-bottom" => {
            if let Some(v) = resolve_length(value, fs, root_font_size) {
                style.padding.bottom = v;
            }
        }
        "padding-left" | "padding-inline-start" => {
            if let Some(v) = resolve_length(value, fs, root_font_size) {
                style.padding.left = v;
            }
        }
        "margin" => {
            apply_margin_shorthand(&mut style.margin, value, fs, root_font_size);
        }
        "margin-top" => {
            style.margin.top = parse_margin_value(value, fs, root_font_size);
        }
        "margin-right" => {
            style.margin.right = parse_margin_value(value, fs, root_font_size);
        }
        "margin-bottom" => {
            style.margin.bottom = parse_margin_value(value, fs, root_font_size);
        }
        "margin-left" => {
            style.margin.left = parse_margin_value(value, fs, root_font_size);
        }
        "position" => {
            style.position = match value {
                "absolute" => Position::Absolute,
                "relative" => Position::Relative,
                _ => Position::Static,
            };
        }
        "top" => {
            style.top = parse_dimension(value, fs, root_font_size);
        }
        "left" => {
            style.left = parse_dimension(value, fs, root_font_size);
        }
        "right" => {
            style.right = parse_dimension(value, fs, root_font_size);
        }
        "bottom" => {
            style.bottom = parse_dimension(value, fs, root_font_size);
        }
        "aspect-ratio" => {
            if value == "auto" {
                style.aspect_ratio = None;
            } else if let Some((w, h)) = value.split_once('/') {
                if let (Ok(w), Ok(h)) = (w.trim().parse::<f32>(), h.trim().parse::<f32>()) {
                    if h > 0.0 {
                        style.aspect_ratio = Some(w / h);
                    }
                }
            } else if let Ok(v) = value.parse::<f32>() {
                style.aspect_ratio = Some(v);
            }
        }
        "font-family" => {
            // Take the first family name, stripping quotes
            if let Some(family) = value.split(',').next() {
                style.font_family = family.trim().trim_matches('\'').trim_matches('"').to_string();
            }
        }
        "font-size" => {
            if let Some(v) = resolve_length(value, fs, root_font_size) {
                style.font_size = v;
            }
        }
        "font-weight" => {
            style.font_weight = match value {
                "bold" => 700,
                "normal" => 400,
                _ => value.parse().unwrap_or(400),
            };
        }
        "font-style" => {
            style.font_style = match value {
                "italic" => FontStyle::Italic,
                _ => FontStyle::Normal,
            };
        }
        "line-height" => {
            if let Ok(v) = value.parse::<f32>() {
                style.line_height = v;
            }
        }
        "text-align" => {
            style.text_align = match value {
                "center" => TextAlign::Center,
                "right" => TextAlign::Right,
                _ => TextAlign::Left,
            };
        }
        "text-transform" => {
            style.text_transform = match value {
                "uppercase" => TextTransform::Uppercase,
                _ => TextTransform::None,
            };
        }
        "white-space" => {
            style.white_space = match value {
                "nowrap" => WhiteSpace::NoWrap,
                _ => WhiteSpace::Normal,
            };
        }
        "color" => {
            if let Some(c) = parse_color(value) {
                style.color = c;
            }
        }
        "background-color" | "background" => {
            // Handle simple color values for background shorthand
            if let Some(c) = parse_color(value) {
                style.background_color = c;
            }
        }
        "background-image" => {
            if value != "none" {
                style.background_image = Some(value.to_string());
            }
        }
        "background-size" => {
            style.background_size = match value {
                "contain" => BackgroundSize::Contain,
                "cover" => BackgroundSize::Cover,
                _ => BackgroundSize::Auto,
            };
        }
        "background-repeat" => {
            style.background_repeat = match value {
                "no-repeat" => BackgroundRepeat::NoRepeat,
                _ => BackgroundRepeat::Repeat,
            };
        }
        "border" => {
            // Parse shorthand: "1px solid black"
            let parts: Vec<&str> = value.split_whitespace().collect();
            if let Some(width) = parts.first().and_then(|v| resolve_length(v, fs, root_font_size))
            {
                style.border_widths = Edges {
                    top: width,
                    right: width,
                    bottom: width,
                    left: width,
                };
            }
            if let Some(s) = parts.get(1) {
                style.border_style = match *s {
                    "solid" => BorderStyle::Solid,
                    "dashed" => BorderStyle::Dashed,
                    _ => BorderStyle::None,
                };
            }
            if let Some(c) = parts.get(2).and_then(|v| parse_color(v)) {
                style.border_colors = BorderColors::uniform(c);
            }
        }
        "border-top" | "border-right" | "border-bottom" | "border-left" => {
            if value == "none" {
                match prop {
                    "border-top" => style.border_widths.top = 0.0,
                    "border-right" => style.border_widths.right = 0.0,
                    "border-bottom" => style.border_widths.bottom = 0.0,
                    "border-left" => style.border_widths.left = 0.0,
                    _ => {}
                }
            } else {
                let parts: Vec<&str> = value.split_whitespace().collect();
                if let Some(width) =
                    parts.first().and_then(|v| resolve_length(v, fs, root_font_size))
                {
                    match prop {
                        "border-top" => style.border_widths.top = width,
                        "border-right" => style.border_widths.right = width,
                        "border-bottom" => style.border_widths.bottom = width,
                        "border-left" => style.border_widths.left = width,
                        _ => {}
                    }
                }
                if let Some(s) = parts.get(1) {
                    if *s == "solid" || *s == "dashed" {
                        style.border_style = match *s {
                            "solid" => BorderStyle::Solid,
                            "dashed" => BorderStyle::Dashed,
                            _ => style.border_style,
                        };
                    }
                }
                if let Some(c) = parts.get(2).and_then(|v| parse_color(v)) {
                    match prop {
                        "border-top" => style.border_colors.top = c,
                        "border-right" => style.border_colors.right = c,
                        "border-bottom" => style.border_colors.bottom = c,
                        "border-left" => style.border_colors.left = c,
                        _ => {}
                    }
                }
            }
        }
        "border-color" => {
            if let Some(c) = parse_color(value) {
                style.border_colors = BorderColors::uniform(c);
            }
        }
        "border-radius" => {
            if let Some(v) = resolve_length(value, fs, root_font_size) {
                style.border_radius = v;
            }
        }
        "border-collapse" => {
            style.border_collapse = value == "collapse";
        }
        "break-inside" => {
            style.break_inside = if value == "avoid" {
                BreakInside::Avoid
            } else {
                BreakInside::Auto
            };
        }
        "box-sizing" => {
            style.box_sizing = match value {
                "border-box" => BoxSizing::BorderBox,
                _ => BoxSizing::ContentBox,
            };
        }
        "overflow" => {
            style.overflow = match value {
                "hidden" => Overflow::Hidden,
                _ => Overflow::Visible,
            };
        }
        "visibility" => {
            style.visibility = match value {
                "hidden" => Visibility::Hidden,
                _ => Visibility::Visible,
            };
        }
        "opacity" => {
            if let Ok(v) = value.parse::<f32>() {
                style.opacity = v.clamp(0.0, 1.0);
            }
        }
        "z-index" => {
            if let Ok(v) = value.parse::<i32>() {
                style.z_index = v;
            }
        }
        "transform" => {
            style.transform = parse_transform(value);
        }
        "border-width" => {
            if let Some(w) = resolve_length(value, fs, root_font_size) {
                style.border_widths = Edges {
                    top: w,
                    right: w,
                    bottom: w,
                    left: w,
                };
            }
        }
        "border-style" => {
            style.border_style = match value {
                "solid" => BorderStyle::Solid,
                "dashed" => BorderStyle::Dashed,
                _ => BorderStyle::None,
            };
        }
        "border-top-width" => {
            if let Some(w) = resolve_length(value, fs, root_font_size) {
                style.border_widths.top = w;
            }
        }
        "border-right-width" => {
            if let Some(w) = resolve_length(value, fs, root_font_size) {
                style.border_widths.right = w;
            }
        }
        "border-bottom-width" => {
            if let Some(w) = resolve_length(value, fs, root_font_size) {
                style.border_widths.bottom = w;
            }
        }
        "border-left-width" => {
            if let Some(w) = resolve_length(value, fs, root_font_size) {
                style.border_widths.left = w;
            }
        }
        "list-style" | "list-style-type" => {
            style.list_style_type = match value.trim() {
                "none" => ListStyleType::None,
                "disc" => ListStyleType::Disc,
                "decimal" => ListStyleType::Decimal,
                _ => style.list_style_type,
            };
        }
        _ => {}
    }
}

fn parse_transform(value: &str) -> Option<Transform> {
    let value = value.trim();
    if value == "none" {
        return None;
    }

    let mut transforms = Vec::new();
    let mut remaining = value;

    while !remaining.is_empty() {
        remaining = remaining.trim_start();
        if remaining.is_empty() {
            break;
        }

        if let Some(inner) = remaining.strip_prefix("scaleX(").and_then(|s| {
            let end = s.find(')')?;
            Some(&s[..end])
        }) {
            if let Ok(sx) = inner.trim().parse::<f32>() {
                transforms.push(Transform::ScaleX(sx));
            }
            remaining = &remaining[remaining.find(')').map_or(remaining.len(), |i| i + 1)..];
        } else if let Some(inner) = remaining.strip_prefix("rotate(").and_then(|s| {
            let end = s.find(')')?;
            Some(&s[..end])
        }) {
            let deg_str = inner.trim().trim_end_matches("deg");
            if let Ok(deg) = deg_str.parse::<f32>() {
                transforms.push(Transform::Rotate(deg));
            }
            remaining = &remaining[remaining.find(')').map_or(remaining.len(), |i| i + 1)..];
        } else if let Some(inner) = remaining.strip_prefix("translate(").and_then(|s| {
            let end = s.find(')')?;
            Some(&s[..end])
        }) {
            let parts: Vec<&str> = inner.split(',').collect();
            let tx = parts
                .first()
                .and_then(|v| resolve_length(v.trim(), 12.0, 12.0))
                .unwrap_or(0.0);
            let ty = parts
                .get(1)
                .and_then(|v| resolve_length(v.trim(), 12.0, 12.0))
                .unwrap_or(0.0);
            transforms.push(Transform::Translate(tx, ty));
            remaining = &remaining[remaining.find(')').map_or(remaining.len(), |i| i + 1)..];
        } else {
            // Skip unrecognized transform function
            if let Some(end) = remaining.find(')') {
                remaining = &remaining[end + 1..];
            } else {
                break;
            }
        }
    }

    match transforms.len() {
        0 => None,
        1 => Some(transforms.into_iter().next().expect("len checked")),
        _ => Some(Transform::Combined(transforms)),
    }
}

fn parse_dimension(value: &str, parent_font_size: f32, root_font_size: f32) -> Dimension {
    let value = value.trim();
    if value == "auto" {
        return Dimension::Auto;
    }
    // Handle calc() — if it contains %, extract percent and absolute parts
    if value.starts_with("calc(") && value.ends_with(')') {
        let inner = &value[5..value.len() - 1];
        // Check if the expression contains a percentage
        if inner.contains('%') {
            // Try to decompose into percent + absolute: "100% + 20pt" or "100% - 10pt"
            if let Some(dim) = eval_calc_dimension(inner, parent_font_size, root_font_size) {
                return dim;
            }
        }
        // Fully absolute calc — resolve to points
        if let Some(v) = eval_calc(inner, parent_font_size, root_font_size) {
            return Dimension::Points(v);
        }
        return Dimension::Auto;
    }
    if let Some(n) = value.strip_suffix('%') {
        if let Ok(v) = n.trim().parse::<f32>() {
            return Dimension::Percent(v / 100.0);
        }
    }
    if let Some(v) = resolve_length(value, parent_font_size, root_font_size) {
        return Dimension::Points(v);
    }
    Dimension::Auto
}

/// Try to decompose a calc expression with percentages.
/// For "100% + 20pt", returns Dimension::PercentPlus(1.0, 20.0) to preserve
/// both the percentage and absolute parts.
fn eval_calc_dimension(expr: &str, parent_font_size: f32, root_font_size: f32) -> Option<Dimension> {
    let expr = expr.trim();
    // Simple case: "X% + Ypt" or "X% - Ypt"
    if let Some(pos) = find_calc_operator(expr, " + ") {
        let left = expr[..pos].trim();
        let right = expr[pos + 3..].trim();
        if left.ends_with('%') {
            let pct = left.strip_suffix('%')?.trim().parse::<f32>().ok()? / 100.0;
            let abs = resolve_length_no_calc(right, parent_font_size, root_font_size).unwrap_or(0.0);
            return Some(Dimension::PercentPlus(pct, abs));
        }
        if right.ends_with('%') {
            let pct = right.strip_suffix('%')?.trim().parse::<f32>().ok()? / 100.0;
            let abs = resolve_length_no_calc(left, parent_font_size, root_font_size).unwrap_or(0.0);
            return Some(Dimension::PercentPlus(pct, abs));
        }
    }
    if let Some(pos) = find_calc_operator(expr, " - ") {
        let left = expr[..pos].trim();
        let right = expr[pos + 3..].trim();
        if left.ends_with('%') {
            let pct = left.strip_suffix('%')?.trim().parse::<f32>().ok()? / 100.0;
            let abs = resolve_length_no_calc(right, parent_font_size, root_font_size).unwrap_or(0.0);
            return Some(Dimension::PercentPlus(pct, -abs));
        }
        if right.ends_with('%') {
            let pct = right.strip_suffix('%')?.trim().parse::<f32>().ok()? / 100.0;
            let abs = resolve_length_no_calc(left, parent_font_size, root_font_size).unwrap_or(0.0);
            return Some(Dimension::PercentPlus(-pct, abs));
        }
    }
    // Fallback: just percentage
    if expr.ends_with('%') {
        let pct = expr.strip_suffix('%')?.trim().parse::<f32>().ok()? / 100.0;
        return Some(Dimension::Percent(pct));
    }
    None
}

fn apply_shorthand_edges(edges: &mut Edges, value: &str, fs: f32, root_fs: f32) {
    let parts: Vec<&str> = value.split_whitespace().collect();
    match parts.len() {
        1 => {
            if let Some(v) = resolve_length(parts[0], fs, root_fs) {
                *edges = Edges {
                    top: v,
                    right: v,
                    bottom: v,
                    left: v,
                };
            }
        }
        2 => {
            let tb = resolve_length(parts[0], fs, root_fs).unwrap_or(0.0);
            let lr = resolve_length(parts[1], fs, root_fs).unwrap_or(0.0);
            *edges = Edges {
                top: tb,
                right: lr,
                bottom: tb,
                left: lr,
            };
        }
        4 => {
            *edges = Edges {
                top: resolve_length(parts[0], fs, root_fs).unwrap_or(0.0),
                right: resolve_length(parts[1], fs, root_fs).unwrap_or(0.0),
                bottom: resolve_length(parts[2], fs, root_fs).unwrap_or(0.0),
                left: resolve_length(parts[3], fs, root_fs).unwrap_or(0.0),
            };
        }
        _ => {}
    }
}

fn parse_margin_value(value: &str, fs: f32, root_fs: f32) -> Dimension {
    let v = value.trim();
    if v == "auto" {
        Dimension::Auto
    } else {
        resolve_length(v, fs, root_fs)
            .map_or(Dimension::Points(0.0), Dimension::Points)
    }
}

fn apply_margin_shorthand(edges: &mut DimensionEdges, value: &str, fs: f32, root_fs: f32) {
    let parts: Vec<&str> = value.split_whitespace().collect();
    match parts.len() {
        1 => {
            let v = parse_margin_value(parts[0], fs, root_fs);
            *edges = DimensionEdges {
                top: v,
                right: v,
                bottom: v,
                left: v,
            };
        }
        2 => {
            let tb = parse_margin_value(parts[0], fs, root_fs);
            let lr = parse_margin_value(parts[1], fs, root_fs);
            *edges = DimensionEdges {
                top: tb,
                right: lr,
                bottom: tb,
                left: lr,
            };
        }
        4 => {
            *edges = DimensionEdges {
                top: parse_margin_value(parts[0], fs, root_fs),
                right: parse_margin_value(parts[1], fs, root_fs),
                bottom: parse_margin_value(parts[2], fs, root_fs),
                left: parse_margin_value(parts[3], fs, root_fs),
            };
        }
        _ => {}
    }
}

/// Minimal CSS rule representation — selector string + declarations
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PseudoElement {
    None,
    Before,
    After,
}

#[derive(Clone)]
pub(crate) struct CssRule {
    selector: String,
    pseudo_element: PseudoElement,
    declarations: Vec<(String, String)>,
}

/// Parse CSS text into rules (using simple text parsing for the PoC)
fn strip_css_comments(css: &str) -> String {
    let mut result = String::with_capacity(css.len());
    let bytes = css.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if i + 1 < bytes.len() && bytes[i] == b'/' && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                i += 1;
            }
            i += 2; // skip */
        } else {
            result.push(bytes[i] as char);
            i += 1;
        }
    }
    result
}

fn parse_css_rules(css_text: &str) -> Vec<CssRule> {
    let css_text = strip_css_comments(css_text);
    let mut rules = Vec::new();
    let mut chars = css_text.chars().peekable();

    loop {
        // Skip whitespace
        while chars.peek().is_some_and(|c| c.is_whitespace()) {
            chars.next();
        }
        if chars.peek().is_none() {
            break;
        }

        // Handle @font-face separately — we skip it here and parse it elsewhere
        let remaining: String = chars.clone().collect();
        if remaining.starts_with("@font-face") {
            // Skip to the closing brace
            let mut brace_depth = 0;
            for c in chars.by_ref() {
                if c == '{' {
                    brace_depth += 1;
                } else if c == '}' {
                    brace_depth -= 1;
                    if brace_depth == 0 {
                        break;
                    }
                }
            }
            continue;
        }

        // Skip any other @-rules
        if remaining.starts_with('@') {
            let mut brace_depth = 0;
            for c in chars.by_ref() {
                if c == '{' {
                    brace_depth += 1;
                } else if c == '}' {
                    brace_depth -= 1;
                    if brace_depth == 0 {
                        break;
                    }
                }
            }
            continue;
        }

        // Read selector (until '{')
        let mut selector = String::new();
        for c in chars.by_ref() {
            if c == '{' {
                break;
            }
            selector.push(c);
        }
        let selector = selector.trim().to_string();
        if selector.is_empty() {
            break;
        }

        // Read declarations (until '}')
        let mut decl_text = String::new();
        for c in chars.by_ref() {
            if c == '}' {
                break;
            }
            decl_text.push(c);
        }

        let declarations = parse_inline_declarations(&decl_text);
        // Handle comma-separated selectors
        for sel in selector.split(',') {
            let sel = sel.trim().to_string();
            if sel.is_empty() {
                continue;
            }
            // Detect and strip pseudo-elements
            let (sel, pseudo) = if let Some(base) = sel.strip_suffix("::before") {
                (base.to_string(), PseudoElement::Before)
            } else if let Some(base) = sel.strip_suffix("::after") {
                (base.to_string(), PseudoElement::After)
            } else {
                (sel, PseudoElement::None)
            };
            rules.push(CssRule {
                selector: sel,
                pseudo_element: pseudo,
                declarations: declarations.clone(),
            });
        }
    }

    rules
}

/// Check if a full selector (potentially with combinators) matches an element.
/// `ancestors` is the list from nearest parent to root.
pub fn selector_matches(
    selector: &str,
    element: &ElementNode,
    ancestors: &[&ElementNode],
) -> bool {
    let selector = selector.trim();

    // Tokenize into simple selector parts and combinators
    let parts = tokenize_selector(selector);
    if parts.is_empty() {
        return false;
    }

    // The last part must match the element itself
    let last = &parts[parts.len() - 1];
    match last {
        SelectorToken::Simple(s) => {
            if !simple_selector_matches(s, element, ancestors) {
                return false;
            }
        }
        SelectorToken::Combinator(_) => return false,
    }

    if parts.len() == 1 {
        return true;
    }

    // Walk backwards through the remaining parts, matching against ancestors
    match_selector_parts(&parts[..parts.len() - 1], ancestors)
}

fn match_selector_parts(parts: &[SelectorToken], ancestors: &[&ElementNode]) -> bool {
    if parts.is_empty() {
        return true;
    }

    // Get the combinator (second-to-last token should be a combinator)
    let last_idx = parts.len() - 1;
    let combinator = match &parts[last_idx] {
        SelectorToken::Combinator(c) => *c,
        SelectorToken::Simple(_) => Combinator::Descendant, // implicit
    };

    // Get the simple selector before the combinator
    let (simple_selector, remaining) = if matches!(parts[last_idx], SelectorToken::Combinator(_)) {
        if last_idx == 0 {
            return false;
        }
        match &parts[last_idx - 1] {
            SelectorToken::Simple(s) => (s.as_str(), &parts[..last_idx - 1]),
            SelectorToken::Combinator(_) => return false,
        }
    } else {
        match &parts[last_idx] {
            SelectorToken::Simple(s) => (s.as_str(), &parts[..last_idx]),
            SelectorToken::Combinator(_) => return false,
        }
    };

    match combinator {
        Combinator::Child => {
            // Must match the immediate parent
            if let Some(&parent) = ancestors.first() {
                if simple_selector_matches(simple_selector, parent, &ancestors[1..]) {
                    return match_selector_parts(remaining, &ancestors[1..]);
                }
            }
            false
        }
        Combinator::Descendant => {
            // Can match any ancestor
            for (i, &ancestor) in ancestors.iter().enumerate() {
                if simple_selector_matches(simple_selector, ancestor, &ancestors[i + 1..])
                    && match_selector_parts(remaining, &ancestors[i + 1..])
                {
                    return true;
                }
            }
            false
        }
    }
}

#[derive(Debug)]
enum SelectorToken {
    Simple(String),
    Combinator(Combinator),
}

#[derive(Debug, Clone, Copy)]
enum Combinator {
    Descendant, // space
    Child,      // >
}

fn tokenize_selector(selector: &str) -> Vec<SelectorToken> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut chars = selector.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '>' => {
                let trimmed = current.trim().to_string();
                if !trimmed.is_empty() {
                    tokens.push(SelectorToken::Simple(trimmed));
                }
                current.clear();
                tokens.push(SelectorToken::Combinator(Combinator::Child));
                // Skip whitespace after >
                while chars.peek() == Some(&' ') {
                    chars.next();
                }
            }
            ' ' => {
                let trimmed = current.trim().to_string();
                if !trimmed.is_empty() {
                    // Check if the next non-space char is >
                    while chars.peek() == Some(&' ') {
                        chars.next();
                    }
                    if chars.peek() == Some(&'>') {
                        tokens.push(SelectorToken::Simple(trimmed));
                        current.clear();
                        // The > will be handled in the next iteration
                    } else {
                        tokens.push(SelectorToken::Simple(trimmed));
                        current.clear();
                        tokens.push(SelectorToken::Combinator(Combinator::Descendant));
                    }
                }
            }
            _ => current.push(ch),
        }
    }

    let trimmed = current.trim().to_string();
    if !trimmed.is_empty() {
        tokens.push(SelectorToken::Simple(trimmed));
    }

    tokens
}

/// Check if a simple (non-compound) selector matches an element.
fn simple_selector_matches(
    selector: &str,
    element: &ElementNode,
    ancestors: &[&ElementNode],
) -> bool {
    let selector = selector.trim();

    if selector == "*" {
        return true;
    }

    // Handle pseudo-elements — strip them for matching
    let base = selector.split("::").next().unwrap_or(selector);

    // Separate pseudo-classes from the selector
    let (base, pseudo_classes) = extract_pseudo_classes(base);

    // Handle :not() — very basic
    if let Some(inner) = base.strip_prefix(":not(").and_then(|s| s.strip_suffix(')')) {
        return !simple_selector_matches(inner, element, ancestors);
    }

    // Extract attribute selectors: e.g. div[data-id="foo"].bar
    let (base_no_attr, attr_selectors) = extract_attribute_selectors(base);

    // Split into element and class parts
    let parts: Vec<&str> = base_no_attr.split('.').collect();
    let tag_part = parts[0];

    // Check tag
    if !tag_part.is_empty() && tag_part != element.tag {
        return false;
    }

    // Check classes
    for class in &parts[1..] {
        if !element.classes().any(|c| c == *class) {
            return false;
        }
    }

    // Check attribute selectors
    for attr_sel in &attr_selectors {
        if !matches_attribute_selector(attr_sel, element) {
            return false;
        }
    }

    // Check pseudo-classes
    for pseudo in &pseudo_classes {
        if !matches_pseudo_class(pseudo, element, ancestors) {
            return false;
        }
    }

    true
}

/// Extract attribute selectors from a simple selector.
/// "div[data-id][class=foo]" -> ("div", vec!["data-id", "class=foo"])
fn extract_attribute_selectors(selector: &str) -> (String, Vec<String>) {
    let mut base = String::new();
    let mut attrs = Vec::new();
    let mut i = 0;
    let bytes = selector.as_bytes();
    while i < bytes.len() {
        if bytes[i] == b'[' {
            if let Some(end) = selector[i..].find(']') {
                let attr_content = &selector[i + 1..i + end];
                attrs.push(attr_content.to_string());
                i += end + 1;
            } else {
                base.push(bytes[i] as char);
                i += 1;
            }
        } else {
            base.push(bytes[i] as char);
            i += 1;
        }
    }
    (base, attrs)
}

fn strip_attr_quotes(s: &str) -> &str {
    let s = s.trim();
    if (s.starts_with('"') && s.ends_with('"')) || (s.starts_with('\'') && s.ends_with('\'')) {
        &s[1..s.len() - 1]
    } else {
        s
    }
}

fn matches_attribute_selector(attr_sel: &str, element: &ElementNode) -> bool {
    // [attr=value], [attr^=value], [attr$=value], [attr*=value], [attr~=value], [attr]
    let attr_sel = attr_sel.trim();

    if let Some(pos) = attr_sel.find("^=") {
        let attr_name = attr_sel[..pos].trim();
        let expected = strip_attr_quotes(&attr_sel[pos + 2..]);
        return element.get_attr(attr_name).is_some_and(|v| v.starts_with(expected));
    }
    if let Some(pos) = attr_sel.find("$=") {
        let attr_name = attr_sel[..pos].trim();
        let expected = strip_attr_quotes(&attr_sel[pos + 2..]);
        return element.get_attr(attr_name).is_some_and(|v| v.ends_with(expected));
    }
    if let Some(pos) = attr_sel.find("*=") {
        let attr_name = attr_sel[..pos].trim();
        let expected = strip_attr_quotes(&attr_sel[pos + 2..]);
        return element.get_attr(attr_name).is_some_and(|v| v.contains(expected));
    }
    if let Some(pos) = attr_sel.find("~=") {
        let attr_name = attr_sel[..pos].trim();
        let expected = strip_attr_quotes(&attr_sel[pos + 2..]);
        return element.get_attr(attr_name).is_some_and(|v| {
            v.split_whitespace().any(|word| word == expected)
        });
    }
    if let Some(pos) = attr_sel.find('=') {
        let attr_name = attr_sel[..pos].trim();
        let expected = strip_attr_quotes(&attr_sel[pos + 1..]);
        return element.get_attr(attr_name).is_some_and(|v| v == expected);
    }
    // Just [attr] — check presence
    element.get_attr(attr_sel).is_some()
}

fn extract_pseudo_classes(selector: &str) -> (&str, Vec<&str>) {
    let mut base_end = 0;
    let mut pseudos = Vec::new();
    let mut i = 0;
    let bytes = selector.as_bytes();

    while i < bytes.len() {
        if bytes[i] == b':' && (i + 1 < bytes.len()) && bytes[i + 1] != b':' {
            if base_end == 0 {
                base_end = i;
            }
            // Find end of pseudo-class (handle :not() with parens)
            let start = i + 1;
            let mut end = start;
            let mut depth = 0;
            while end < bytes.len() {
                match bytes[end] {
                    b'(' => depth += 1,
                    b')' if depth > 0 => {
                        end += 1;
                        break;
                    }
                    b':' if depth == 0 => break,
                    _ => {}
                }
                end += 1;
            }
            pseudos.push(&selector[start..end]);
            i = end;
        } else {
            if pseudos.is_empty() {
                base_end = i + 1;
            }
            i += 1;
        }
    }

    if base_end == 0 {
        base_end = selector.len();
    }

    (&selector[..base_end], pseudos)
}

fn matches_pseudo_class(pseudo: &str, element: &ElementNode, ancestors: &[&ElementNode]) -> bool {
    match pseudo {
        "first-child" => {
            if let Some(&parent) = ancestors.first() {
                let element_children: Vec<&ElementNode> = parent
                    .children
                    .iter()
                    .filter_map(|c| match c {
                        DomNode::Element(el) => Some(el),
                        DomNode::Text(_) => None,
                    })
                    .collect();
                return element_children.first().is_some_and(|first| {
                    std::ptr::eq(*first, element)
                });
            }
            false
        }
        "last-child" => {
            if let Some(&parent) = ancestors.first() {
                let element_children: Vec<&ElementNode> = parent
                    .children
                    .iter()
                    .filter_map(|c| match c {
                        DomNode::Element(el) => Some(el),
                        DomNode::Text(_) => None,
                    })
                    .collect();
                return element_children.last().is_some_and(|last| {
                    std::ptr::eq(*last, element)
                });
            }
            false
        }
        _ => {
            // Handle :not()
            if let Some(inner) = pseudo.strip_prefix("not(").and_then(|s| s.strip_suffix(')')) {
                return !simple_selector_matches(inner, element, ancestors);
            }
            // Handle :nth-child()
            if let Some(inner) = pseudo.strip_prefix("nth-child(").and_then(|s| s.strip_suffix(')')) {
                return matches_nth_child(inner.trim(), element, ancestors);
            }
            true // Unknown pseudo-classes pass by default
        }
    }
}

fn matches_nth_child(expr: &str, element: &ElementNode, ancestors: &[&ElementNode]) -> bool {
    let Some(&parent) = ancestors.first() else {
        return false;
    };
    // Find 1-based index of this element among its siblings
    let mut index = 0usize;
    for child in &parent.children {
        if let DomNode::Element(el) = child {
            index += 1;
            if std::ptr::eq(el, element) {
                break;
            }
        }
    }
    if index == 0 {
        return false;
    }
    let (a, b) = parse_nth(expr);
    matches_an_plus_b(a, b, index)
}

/// Parse nth expression: "odd", "even", "3", "2n", "2n+1", "-n+3", etc.
/// Returns (a, b) for the formula an+b.
fn parse_nth(expr: &str) -> (i32, i32) {
    let expr = expr.trim().to_lowercase();
    match expr.as_str() {
        "odd" => (2, 1),
        "even" => (2, 0),
        _ => {
            if let Some(n_pos) = expr.find('n') {
                let a_str = expr[..n_pos].trim();
                let a = match a_str {
                    "" | "+" => 1,
                    "-" => -1,
                    _ => a_str.parse::<i32>().unwrap_or(0),
                };
                let rest = expr[n_pos + 1..].trim();
                let b = if rest.is_empty() {
                    0
                } else {
                    rest.replace(' ', "").parse::<i32>().unwrap_or(0)
                };
                (a, b)
            } else {
                // Just a number: matches exactly that index
                let n = expr.parse::<i32>().unwrap_or(0);
                (0, n)
            }
        }
    }
}

fn matches_an_plus_b(a: i32, b: i32, index: usize) -> bool {
    let Ok(index) = i32::try_from(index) else {
        return false;
    };
    if a == 0 {
        return index == b;
    }
    let diff = index - b;
    // diff must be divisible by a, and the quotient must be non-negative
    if diff % a != 0 {
        return false;
    }
    diff / a >= 0
}

/// Parse @font-face rules from CSS text
fn parse_font_faces(css_text: &str) -> Vec<FontFace> {
    let mut faces = Vec::new();
    let mut remaining = css_text;

    while let Some(start) = remaining.find("@font-face") {
        remaining = &remaining[start + 10..];
        let Some(brace_start) = remaining.find('{') else {
            break;
        };
        remaining = &remaining[brace_start + 1..];
        let Some(brace_end) = remaining.find('}') else {
            break;
        };
        let block = &remaining[..brace_end];
        remaining = &remaining[brace_end + 1..];

        let declarations = parse_inline_declarations(block);
        let mut family = String::new();
        let mut weight = 400u16;
        let mut style = FontStyle::Normal;
        let mut data_uri = String::new();

        for (prop, val) in &declarations {
            match prop.as_str() {
                "font-family" => {
                    family = val.trim_matches('\'').trim_matches('"').to_string();
                }
                "font-weight" => {
                    weight = match val.as_str() {
                        "bold" => 700,
                        "normal" => 400,
                        _ => val.parse().unwrap_or(400),
                    };
                }
                "font-style" => {
                    style = if val == "italic" {
                        FontStyle::Italic
                    } else {
                        FontStyle::Normal
                    };
                }
                "src" => {
                    // Extract data URI: url(data:...)
                    if let Some(url_start) = val.find("url(") {
                        let after = &val[url_start + 4..];
                        // Handle both url("...") and url(...)
                        let data = after
                            .trim_start_matches('"')
                            .trim_start_matches('\'');
                        if let Some(end) = data.find(')') {
                            data_uri = data[..end].trim_end_matches('"').trim_end_matches('\'').to_string();
                        }
                    }
                }
                _ => {}
            }
        }

        if !family.is_empty() && !data_uri.is_empty() {
            // Decode base64 TTF data
            if let Some(base64_data) = data_uri
                .strip_prefix("data:")
                .and_then(|s| s.split_once(','))
                .map(|(_, data)| data)
            {
                use base64::Engine;
                if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(base64_data) {
                    faces.push(FontFace {
                        family,
                        weight,
                        style,
                        data: bytes,
                    });
                }
            }
        }
    }

    faces
}

/// Pre-compile CSS rules and decode font faces from style text. This is the
/// expensive part that can be done once and reused across many documents.
pub fn compile_styles(style_texts: &[String]) -> CompiledStyles {
    let all_css: String = style_texts.join("\n");
    let rules = parse_css_rules(&all_css);
    let font_faces = parse_font_faces(&all_css);
    CompiledStyles { rules, font_faces }
}

/// Apply pre-compiled CSS rules to a parsed document, producing computed styles
/// for each element.
pub fn apply_styles(compiled: &CompiledStyles, document: &ElementNode) -> HashMap<usize, ComputedStyle> {
    apply_rules(&compiled.rules, document)
}

/// Apply a set of CSS rules to a document, producing computed styles.
pub(crate) fn apply_rules(rules: &[CssRule], document: &ElementNode) -> HashMap<usize, ComputedStyle> {
    let root_font_size: f32 = 12.0; // default
    let rule_index = RuleIndex::build(rules);
    let mut styles = HashMap::new();
    resolve_element_styles(
        document,
        rules,
        &rule_index,
        &ComputedStyle::default(),
        root_font_size,
        &mut styles,
        &[],
    );
    styles
}

/// Apply styles without rule indexing (for benchmarking comparison only).
#[doc(hidden)]
pub fn apply_styles_no_index(compiled: &CompiledStyles, document: &ElementNode) -> HashMap<usize, ComputedStyle> {
    let root_font_size: f32 = 12.0;
    let all_indices: Vec<usize> = (0..compiled.rules.len()).collect();
    let rule_index = RuleIndex {
        by_tag: HashMap::new(),
        by_class: HashMap::new(),
        universal: all_indices,
    };
    let mut styles = HashMap::new();
    resolve_element_styles(
        document,
        &compiled.rules,
        &rule_index,
        &ComputedStyle::default(),
        root_font_size,
        &mut styles,
        &[],
    );
    styles
}

pub fn resolve_styles(parsed: &ParseResult) -> StyleResult {
    let compiled = compile_styles(&parsed.style_texts);
    let styles = apply_styles(&compiled, &parsed.document);
    StyleResult {
        styles,
        font_faces: compiled.font_faces,
    }
}

type CascadedDecls = Vec<(usize, u32, Vec<(String, String)>)>;

#[allow(clippy::type_complexity)]
fn resolve_pseudo_element(
    decls: &[(usize, u32, Vec<(String, String)>)],
    parent: &ComputedStyle,
) -> Option<Box<PseudoElementStyle>> {
    let mut content = None;
    let mut color = parent.color;
    let mut display = Display::Inline;
    let mut font_weight = parent.font_weight;
    let mut font_style = parent.font_style;

    for (_, _, declarations) in decls {
        for (prop, val) in declarations {
            match prop.as_str() {
                "content" => {
                    let val = val.trim();
                    if val == "none" || val == "\"\"" || val == "''" || val.is_empty() {
                        content = Some(String::new());
                    } else {
                        // Strip quotes and handle escape sequences
                        let unquoted = val
                            .trim_start_matches('"')
                            .trim_end_matches('"')
                            .trim_start_matches('\'')
                            .trim_end_matches('\'');
                        content = Some(decode_css_escapes(unquoted));
                    }
                }
                "color" => {
                    if let Some(c) = parse_color(val) {
                        color = c;
                    }
                }
                "display" => {
                    display = match val.as_str() {
                        "none" => Display::None,
                        "inline" => Display::Inline,
                        _ => Display::Block,
                    };
                }
                "font-weight" => {
                    font_weight = match val.as_str() {
                        "bold" => 700,
                        "normal" => 400,
                        _ => val.parse().unwrap_or(font_weight),
                    };
                }
                "font-style" => {
                    font_style = if val == "italic" {
                        FontStyle::Italic
                    } else {
                        FontStyle::Normal
                    };
                }
                _ => {}
            }
        }
    }

    let content = content?;
    if content.is_empty() {
        return None;
    }

    Some(Box::new(PseudoElementStyle {
        content,
        color,
        display,
        font_weight,
        font_style,
    }))
}

fn decode_css_escapes(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' {
            let mut hex = String::new();
            while hex.len() < 6 {
                match chars.peek() {
                    Some(ch) if ch.is_ascii_hexdigit() => hex.push(chars.next().expect("peeked")),
                    _ => break,
                }
            }
            if !hex.is_empty() {
                if let Ok(code) = u32::from_str_radix(&hex, 16) {
                    if let Some(ch) = char::from_u32(code) {
                        result.push(ch);
                    }
                }
                if chars.peek() == Some(&' ') {
                    chars.next();
                }
            } else if let Some(next) = chars.next() {
                result.push(next);
            }
        } else {
            result.push(c);
        }
    }
    result
}

fn resolve_element_styles(
    element: &ElementNode,
    rules: &[CssRule],
    rule_index: &RuleIndex,
    parent_style: &ComputedStyle,
    root_font_size: f32,
    styles: &mut HashMap<usize, ComputedStyle>,
    ancestors: &[&ElementNode],
) {
    let element_id = std::ptr::from_ref(element) as usize;

    // Start with inherited properties from parent
    let mut computed = ComputedStyle {
        font_family: parent_style.font_family.clone(),
        font_size: parent_style.font_size,
        font_weight: parent_style.font_weight,
        font_style: parent_style.font_style,
        line_height: parent_style.line_height,
        text_align: parent_style.text_align,
        color: parent_style.color,
        visibility: parent_style.visibility,
        list_style_type: parent_style.list_style_type,
        ..ComputedStyle::default()
    };

    // Default user-agent styles based on tag
    match element.tag.as_str() {
        "span" | "a" | "small" | "u" | "s" | "sub" | "sup" | "abbr" | "code" | "var" => {
            computed.display = Display::Inline;
        }
        "b" | "strong" => {
            computed.display = Display::Inline;
            computed.font_weight = 700;
        }
        "em" | "i" => {
            computed.display = Display::Inline;
            computed.font_style = FontStyle::Italic;
        }
        "h1" => {
            computed.font_size = parent_style.font_size * 2.0;
            computed.font_weight = 700;
        }
        "h2" => {
            computed.font_size = parent_style.font_size * 1.5;
            computed.font_weight = 700;
        }
        "h3" => {
            computed.font_size = parent_style.font_size * 1.17;
            computed.font_weight = 700;
        }
        "h4" | "th" => {
            computed.font_weight = 700;
        }
        "h5" => {
            computed.font_size = parent_style.font_size * 0.83;
            computed.font_weight = 700;
        }
        "h6" => {
            computed.font_size = parent_style.font_size * 0.67;
            computed.font_weight = 700;
        }
        "p" => {
            computed.margin.top = Dimension::Points(computed.font_size);
            computed.margin.bottom = Dimension::Points(computed.font_size);
        }
        "ul" => {
            computed.list_style_type = ListStyleType::Disc;
            computed.padding.left = 40.0;
            computed.margin.top = Dimension::Points(computed.font_size);
            computed.margin.bottom = Dimension::Points(computed.font_size);
        }
        "ol" => {
            computed.list_style_type = ListStyleType::Decimal;
            computed.padding.left = 40.0;
            computed.margin.top = Dimension::Points(computed.font_size);
            computed.margin.bottom = Dimension::Points(computed.font_size);
        }
        "table" => {
            computed.display = Display::Grid;
        }
        "head" | "style" | "script" | "link" | "meta" | "title" => {
            computed.display = Display::None;
        }
        _ => {}
    }

    // Collect matching rules with specificity for proper cascade ordering
    #[allow(clippy::type_complexity)]
    let mut matched_rules: Vec<(usize, u32, Vec<(String, String)>)> = Vec::new();
    let mut before_decls: CascadedDecls = Vec::new();
    let mut after_decls: CascadedDecls = Vec::new();

    let candidates = rule_index.candidates_for(element);
    for source_order in candidates {
        let rule = &rules[source_order];
        if selector_matches(&rule.selector, element, ancestors) {
            let specificity = compute_specificity(&rule.selector);
            match rule.pseudo_element {
                PseudoElement::None => {
                    matched_rules.push((source_order, specificity, rule.declarations.clone()));
                }
                PseudoElement::Before => {
                    before_decls.push((source_order, specificity, rule.declarations.clone()));
                }
                PseudoElement::After => {
                    after_decls.push((source_order, specificity, rule.declarations.clone()));
                }
            }
        }
    }
    // Sort by specificity (stable sort preserves source order for equal specificity)
    matched_rules.sort_by_key(|(source_order, specificity, _)| (*specificity, *source_order));

    let mut all_declarations: Vec<(String, String)> = Vec::new();
    for (_, _, decls) in matched_rules {
        all_declarations.extend(decls);
    }
    // Inline styles have highest specificity
    if let Some(style_attr) = element.get_attr("style") {
        all_declarations.extend(parse_inline_declarations(style_attr));
    }

    // Pass 1: resolve font-size. Per CSS spec, `em` units in font-size are
    // relative to the parent's font-size, not the element's own UA default.
    // Temporarily set font-size to parent's value so em resolves correctly,
    // then apply the CSS declaration (which will override both the UA default
    // and the parent value).
    let ua_font_size = computed.font_size;
    let has_font_size_decl = all_declarations.iter().any(|(p, _)| p == "font-size");
    if has_font_size_decl {
        // For font-size, `em` resolves against the parent's font-size
        computed.font_size = parent_style.font_size;
        for (prop, val) in &all_declarations {
            if prop == "font-size" {
                apply_property(&mut computed, prop, val, root_font_size);
            }
        }
    } else {
        computed.font_size = ua_font_size;
    }
    // Pass 2: resolve everything else
    for (prop, val) in &all_declarations {
        if prop == "font-size" {
            continue;
        }
        if val == "inherit" {
            apply_inherit(&mut computed, prop, parent_style);
        } else {
            apply_property(&mut computed, prop, val, root_font_size);
        }
    }

    // Process ::before pseudo-element
    if !before_decls.is_empty() {
        before_decls.sort_by_key(|(so, sp, _)| (*sp, *so));
        computed.before = resolve_pseudo_element(&before_decls, &computed);
    }

    // Process ::after pseudo-element
    if !after_decls.is_empty() {
        after_decls.sort_by_key(|(so, sp, _)| (*sp, *so));
        computed.after = resolve_pseudo_element(&after_decls, &computed);
    }

    styles.insert(element_id, computed.clone());

    // Build ancestor chain for children (element becomes nearest ancestor)
    let mut child_ancestors = vec![element];
    child_ancestors.extend_from_slice(ancestors);

    // Recurse into children
    for child in &element.children {
        if let DomNode::Element(child_el) = child {
            resolve_element_styles(child_el, rules, rule_index, &computed, root_font_size, styles, &child_ancestors);
        }
    }
}

/// Compute CSS specificity as a single u32.
/// Format: 0x00_AA_BB_CC where AA=id count, BB=class/attr/pseudo count, CC=element count
fn compute_specificity(selector: &str) -> u32 {
    let tokens = tokenize_selector(selector);
    let mut ids: u32 = 0;
    let mut classes: u32 = 0;
    let mut elements: u32 = 0;

    for token in &tokens {
        if let SelectorToken::Simple(s) = token {
            let (base, pseudos) = extract_pseudo_classes(s);
            let base = base.split("::").next().unwrap_or(base);

            // Count pseudo-classes
            for pseudo in &pseudos {
                if pseudo.starts_with("not(") {
                    // :not() itself has no specificity; the inner selector does
                    if let Some(inner) = pseudo.strip_prefix("not(").and_then(|p| p.strip_suffix(')')) {
                        // Simplified: count inner as a class-level selector
                        classes += count_classes_in_simple(inner);
                        elements += count_elements_in_simple(inner);
                    }
                } else {
                    classes += 1; // pseudo-classes count as class-level
                }
            }

            // Extract attribute selectors before splitting by .
            let (base_no_attr, attr_sels) = extract_attribute_selectors(base);
            classes += attr_sels.len() as u32;

            let parts: Vec<&str> = base_no_attr.split('.').collect();
            let tag_part = parts[0];

            // Count ID selectors (not yet supported but future-proof)
            if tag_part.starts_with('#') {
                ids += 1;
            } else if !tag_part.is_empty() && tag_part != "*" {
                elements += 1;
            }

            // Count class selectors
            classes += (parts.len() as u32).saturating_sub(1);
        }
    }

    (ids << 16) | (classes << 8) | elements
}

fn count_classes_in_simple(s: &str) -> u32 {
    let parts: Vec<&str> = s.split('.').collect();
    (parts.len() as u32).saturating_sub(1)
}

fn count_elements_in_simple(s: &str) -> u32 {
    let parts: Vec<&str> = s.split('.').collect();
    let tag = parts[0];
    u32::from(!tag.is_empty() && tag != "*")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_inline_declarations_with_data_uri() {
        let decls = parse_inline_declarations(
            "font-family: 'Test'; src: url(data:font/truetype;base64,AAAA) format('truetype')",
        );
        assert_eq!(decls.len(), 2);
        assert_eq!(decls[0].0, "font-family");
        assert_eq!(decls[0].1, "'Test'");
        assert_eq!(decls[1].0, "src");
        assert!(
            decls[1].1.contains("data:font/truetype;base64,AAAA"),
            "got: {}",
            decls[1].1
        );
    }

    #[test]
    fn test_parse_font_faces() {
        let css = r#"
            @font-face {
                font-family: 'Vx Roboto';
                font-weight: 400;
                font-style: normal;
                src: url(data:font/truetype;charset=utf-8;base64,QUFB) format('truetype');
            }
        "#;
        let faces = parse_font_faces(css);
        // QUFB decodes to "AAA" — ttf-parser accepts minimal data
        assert_eq!(faces.len(), 1);
        assert_eq!(faces[0].family, "Vx Roboto");
        assert_eq!(faces[0].weight, 400);
    }
}
