use serde::Deserialize;
use typst_library::foundations::Smart;
use typst_library::layout::{Abs, Axes, Frame, FrameItem, Page, PagedDocument, Point};
use typst_library::model::DocumentInfo;
use typst_library::text::Font;
use typst_library::visualize::{
    Color, Curve, CurveItem, FillRule, FixedStroke, Geometry, Paint, Shape,
};

use crate::text::FontSet;

/// Decode HTML entities in a string.
fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
}

// ─── Rich Text HTML Renderer ────────────────────────────────────────────────

/// A parsed rich text block from HTML.
enum RichBlock {
    Paragraph { text: String, bold: bool, italic: bool, underline: bool, strikethrough: bool },
    ListItem { text: String, bold: bool, italic: bool, underline: bool, strikethrough: bool, ordered: bool, index: usize },
    TableRow { cells: Vec<(String, bool)> }, // (text, is_header)
}

/// Parse HTML into structured blocks for rendering.
fn parse_html_blocks(html: &str) -> Vec<RichBlock> {
    let mut blocks = Vec::new();
    let mut bold = false;
    let mut italic = false;
    let mut underline = false;
    let mut strikethrough = false;
    let mut in_ordered_list = false;
    let mut in_unordered_list = false;
    let mut list_counter = 0usize;
    let mut current_text = String::new();
    // Track formatting of the current block (captured when text is added)
    let mut block_bold = false;
    let mut block_italic = false;
    let mut block_underline = false;
    let mut block_strikethrough = false;
    let mut in_table_row = false;
    let mut row_cells: Vec<(String, bool)> = Vec::new();
    let mut cell_is_header = false;
    let mut in_cell = false;

    let tag_re = regex_lite::Regex::new(r"<(/?)(\w+)[^>]*>|([^<]+)").unwrap();

    for cap in tag_re.captures_iter(html) {
        if let Some(text_match) = cap.get(3) {
            let text = decode_entities(text_match.as_str()).replace('\n', " ");
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                if current_text.is_empty() {
                    // Capture formatting state from when text first appears
                    block_bold = bold;
                    block_italic = italic;
                    block_underline = underline;
                    block_strikethrough = strikethrough;
                }
                current_text.push_str(trimmed);
            }
            continue;
        }

        let closing = cap.get(1).map_or("", |m| m.as_str()) == "/";
        let tag = cap.get(2).map_or("", |m| m.as_str()).to_lowercase();

        match tag.as_str() {
            "strong" | "b" => bold = !closing,
            "em" | "i" => italic = !closing,
            "u" => underline = !closing,
            "s" => strikethrough = !closing,
            "p" | "div" if closing => {
                let text = current_text.trim().to_string();
                let in_list = in_ordered_list || in_unordered_list;
                if !text.is_empty() && !in_cell && !in_table_row && !in_list {
                    blocks.push(RichBlock::Paragraph {
                        text, bold: block_bold, italic: block_italic,
                        underline: block_underline, strikethrough: block_strikethrough,
                    });
                    current_text.clear();
                }
            }
            "ol" if !closing => { in_ordered_list = true; list_counter = 0; }
            "ol" if closing => { in_ordered_list = false; }
            "ul" if !closing => { in_unordered_list = true; list_counter = 0; }
            "ul" if closing => { in_unordered_list = false; }
            "li" if !closing => { current_text.clear(); list_counter += 1; }
            "li" if closing => {
                let text = current_text.trim().to_string();
                if !text.is_empty() {
                    blocks.push(RichBlock::ListItem {
                        text, bold: block_bold, italic: block_italic,
                        underline: block_underline, strikethrough: block_strikethrough,
                        ordered: in_ordered_list, index: list_counter,
                    });
                }
                current_text.clear();
            }
            "tr" if !closing => { in_table_row = true; row_cells.clear(); }
            "tr" if closing => {
                if !row_cells.is_empty() {
                    blocks.push(RichBlock::TableRow { cells: row_cells.clone() });
                }
                in_table_row = false;
            }
            "th" if !closing => { in_cell = true; cell_is_header = true; current_text.clear(); }
            "th" if closing => {
                row_cells.push((current_text.trim().to_string(), true));
                current_text.clear(); in_cell = false; cell_is_header = false;
            }
            "td" if !closing => { in_cell = true; cell_is_header = false; current_text.clear(); }
            "td" if closing => {
                row_cells.push((current_text.trim().to_string(), cell_is_header));
                current_text.clear(); in_cell = false;
            }
            _ => {}
        }
    }

    // Flush remaining text
    let text = current_text.trim().to_string();
    if !text.is_empty() && !in_cell {
        blocks.push(RichBlock::Paragraph {
            text, bold: block_bold, italic: block_italic,
            underline: block_underline, strikethrough: block_strikethrough,
        });
    }

    blocks
}

/// Measure the height of rich text HTML content.
fn measure_rich_text(fonts: &FontSet, html: &str, size: f64, max_w: f64) -> f64 {
    let blocks = parse_html_blocks(html);
    let line_h = size * LH;
    let para_gap = size * 0.4;
    let list_indent = size * 1.8;
    let mut h = 0.0;

    for block in &blocks {
        match block {
            RichBlock::Paragraph { text, bold, .. } => {
                let bundle = if *bold { &fonts.bold } else { &fonts.regular };
                let lines = bundle.wrap_text(text, pt(size), pt(max_w));
                h += lines.len() as f64 * line_h + para_gap;
            }
            RichBlock::ListItem { text, bold, .. } => {
                let bundle = if *bold { &fonts.bold } else { &fonts.regular };
                let lines = bundle.wrap_text(text, pt(size), pt(max_w - list_indent));
                h += lines.len() as f64 * line_h;
            }
            RichBlock::TableRow { cells } => {
                let cell_w = max_w / cells.len().max(1) as f64;
                let max_cell_h: f64 = cells.iter().map(|(text, is_hdr)| {
                    let bundle = if *is_hdr { &fonts.bold } else { &fonts.regular };
                    let lines = bundle.wrap_text(text, pt(size), pt(cell_w - 6.0));
                    lines.len() as f64 * line_h
                }).fold(0.0_f64, f64::max);
                h += max_cell_h + size * 0.5 + 0.75; // padding + border
            }
        }
    }
    h
}

/// Draw rich text HTML content. Returns height used.
fn draw_rich_text(frame: &mut Frame, fonts: &FontSet, html: &str, x: f64, y: f64, size: f64, max_w: f64) -> f64 {
    let blocks = parse_html_blocks(html);
    let line_h = size * LH;
    let para_gap = size * 0.4;
    let list_indent = size * 1.8;
    let mut cy = y;

    for block in &blocks {
        match block {
            RichBlock::Paragraph { text, bold, underline, strikethrough, .. } => {
                let bundle = if *bold { &fonts.bold } else { &fonts.regular };
                let is_bold = *bold;
                let lines = bundle.wrap_text(text, pt(size), pt(max_w));
                for line in &lines {
                    push_text(frame, fonts, x, cy, line, size, is_bold);
                    if *underline {
                        let tw = bundle.measure_width(line, pt(size)).to_pt();
                        push_line(frame, x, cy + size * 1.05, x + tw, cy + size * 1.05, 0.5);
                    }
                    if *strikethrough {
                        let tw = bundle.measure_width(line, pt(size)).to_pt();
                        push_line(frame, x, cy + size * 0.5, x + tw, cy + size * 0.5, 0.5);
                    }
                    cy += line_h;
                }
                cy += para_gap;
            }
            RichBlock::ListItem { text, bold, italic, underline, strikethrough, ordered, index } => {
                let is_bold = *bold;
                let bundle = if is_bold { &fonts.bold } else { &fonts.regular };
                let prefix = if *ordered { format!("{}.", index) } else { "•".to_string() };
                let prefix_w = fonts.regular.measure_width(&prefix, pt(size)).to_pt();
                push_text(frame, fonts, x + list_indent - prefix_w - 3.0, cy, &prefix, size, false);

                let lines = bundle.wrap_text(text, pt(size), pt(max_w - list_indent));
                for line in &lines {
                    push_text(frame, fonts, x + list_indent, cy, line, size, is_bold);
                    if *underline {
                        let tw = bundle.measure_width(line, pt(size)).to_pt();
                        push_line(frame, x + list_indent, cy + size * 1.05, x + list_indent + tw, cy + size * 1.05, 0.5);
                    }
                    if *strikethrough {
                        let tw = bundle.measure_width(line, pt(size)).to_pt();
                        push_line(frame, x + list_indent, cy + size * 0.5, x + list_indent + tw, cy + size * 0.5, 0.5);
                    }
                    if *italic {
                        // Draw with italic indicator (we only have regular/bold, so mark with slant)
                        // For now, just use regular font (italic font not loaded)
                    }
                    cy += line_h;
                }
            }
            RichBlock::TableRow { cells } => {
                let num_cols = cells.len().max(1);
                let cell_w = max_w / num_cols as f64;
                let cell_pad = 3.0;

                // Measure row height
                let max_cell_h: f64 = cells.iter().map(|(text, is_hdr)| {
                    let bundle = if *is_hdr { &fonts.bold } else { &fonts.regular };
                    let lines = bundle.wrap_text(text, pt(size), pt(cell_w - 2.0 * cell_pad));
                    lines.len() as f64 * line_h
                }).fold(0.0_f64, f64::max);

                let row_h = max_cell_h + 2.0 * cell_pad;

                // Header background
                if cells.iter().any(|(_, is_hdr)| *is_hdr) {
                    push_rect(frame, x, cy, max_w, row_h, Some(light_gray()), None);
                }

                // Cell content
                for (ci, (text, is_hdr)) in cells.iter().enumerate() {
                    let cell_x = x + ci as f64 * cell_w;
                    let is_bold = *is_hdr;
                    push_text_block(frame, fonts, cell_x + cell_pad, cy + cell_pad, text, size, cell_w - 2.0 * cell_pad, is_bold);
                }

                // Borders
                push_rect(frame, x, cy, max_w, row_h, None, Some(stroke_of(black(), 0.75)));
                for ci in 1..num_cols {
                    let div_x = x + ci as f64 * cell_w;
                    push_line(frame, div_x, cy, div_x, cy + row_h, 0.75);
                }

                cy += row_h;
            }
        }
    }
    cy - y
}

/// Format a date string like "2020-11-03" or "DateWithoutTime(2020-11-03)" to "November 3, 2020"
fn format_date(date_str: &str) -> String {
    // Extract YYYY-MM-DD from various formats
    let digits: String = date_str.chars().filter(|c| c.is_ascii_digit() || *c == '-').collect();
    let parts: Vec<&str> = digits.split('-').filter(|s| !s.is_empty()).collect();
    if parts.len() >= 3 {
        let month = parts[1].parse::<u32>().unwrap_or(1);
        let day = parts[2].parse::<u32>().unwrap_or(1);
        let year = parts[0];
        let month_name = match month {
            1 => "January", 2 => "February", 3 => "March", 4 => "April",
            5 => "May", 6 => "June", 7 => "July", 8 => "August",
            9 => "September", 10 => "October", 11 => "November", 12 => "December",
            _ => "Unknown",
        };
        format!("{month_name} {day}, {year}")
    } else {
        date_str.to_string()
    }
}

// ─── Constants (all in points unless noted) ─────────────────────────────────

const TM_W_IN: f64 = 0.1875;
const TM_H_IN: f64 = 0.0625;
const BUBBLE_W_PX: f64 = 19.0;
const BUBBLE_H_PX: f64 = 13.0;
const BUBBLE_R_PX: f64 = 7.0;
const PX_PER_IN: f64 = 96.0;

const MARGIN_TOP_IN: f64 = 0.16667;
const MARGIN_BOTTOM_IN: f64 = 0.16667;
const MARGIN_LEFT_IN: f64 = 0.19685;
const MARGIN_RIGHT_IN: f64 = 0.19685;
const FRAME_PAD_IN: f64 = 0.125;

const BASE: f64 = 12.0; // pt — base font size
const H1: f64 = 16.8;
const H2: f64 = 14.4;
const H3: f64 = 13.2;
const LH: f64 = 1.2; // line-height multiplier
const GAP: f64 = 9.0; // 0.75rem = section/column gap in pt

const OPTION_PAD_V: f64 = 4.5; // 0.375rem
const OPTION_PAD_H: f64 = 6.0; // 0.5rem
const CONTEST_HDR_PAD: f64 = 6.0; // 0.5rem
const BUBBLE_GAP: f64 = 6.0; // 0.5rem gap between bubble and text

fn pt(v: f64) -> Abs { Abs::pt(v) }
fn inches(v: f64) -> Abs { Abs::inches(v) }

fn bubble_w() -> Abs { Abs::pt(BUBBLE_W_PX * 72.0 / PX_PER_IN) }
fn bubble_h() -> Abs { Abs::pt(BUBBLE_H_PX * 72.0 / PX_PER_IN) }

fn black() -> Paint { Paint::Solid(Color::BLACK) }
fn white() -> Paint { Paint::Solid(Color::WHITE) }
fn light_gray() -> Paint { Paint::Solid(Color::from_u8(0xED, 0xED, 0xED, 0xFF)) }
fn dark_gray() -> Paint { Paint::Solid(Color::from_u8(0xDA, 0xDA, 0xDA, 0xFF)) }

fn span() -> typst_syntax::Span { typst_syntax::Span::detached() }

fn rect_shape(w: Abs, h: Abs, fill: Option<Paint>, stroke: Option<FixedStroke>) -> Shape {
    Shape {
        geometry: Geometry::Rect(Axes::new(w, h)),
        fill,
        fill_rule: FillRule::NonZero,
        stroke,
    }
}

fn stroke_of(paint: Paint, thickness: f64) -> FixedStroke {
    let mut s = FixedStroke::default();
    s.paint = paint;
    s.thickness = pt(thickness);
    s
}

// ─── Ballot Data Types ──────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BallotData {
    pub election: Election,
    pub ballot_style_id: String,
    pub precinct_id: String,
    pub ballot_type: String,
    pub ballot_mode: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Election {
    pub title: String,
    pub date: String,
    pub state: String,
    pub county: County,
    pub seal: Option<String>,
    pub ballot_layout: BallotLayout,
    pub contests: Vec<Contest>,
    pub ballot_styles: Vec<BallotStyle>,
    pub precincts: Vec<Precinct>,
    #[serde(default)]
    pub parties: Vec<Party>,
}

#[derive(Deserialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Contest {
    #[serde(rename = "candidate")]
    Candidate(CandidateContest),
    #[serde(rename = "yesno")]
    YesNo(YesNoContest),
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CandidateContest {
    pub id: String,
    pub title: String,
    pub seats: u32,
    pub candidates: Vec<Candidate>,
    #[serde(default)]
    pub allow_write_ins: bool,
    pub district_id: String,
    pub term_description: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub party_ids: Vec<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct YesNoContest {
    pub id: String,
    pub title: String,
    pub description: String,
    pub district_id: String,
    pub yes_option: ContestOption,
    pub no_option: ContestOption,
}

#[derive(Deserialize, Clone)]
pub struct ContestOption { pub id: String, pub label: String }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BallotStyle {
    pub id: String,
    #[serde(default)] pub precincts: Vec<String>,
    #[serde(default)] pub districts: Vec<String>,
}

#[derive(Deserialize)]
pub struct County { pub name: String }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BallotLayout { pub paper_size: String }

#[derive(Deserialize)]
pub struct Precinct { pub id: String, pub name: String }

#[derive(Deserialize)]
pub struct Party {
    pub id: String,
    pub name: String,
    #[serde(default)] pub full_name: String,
}

// ─── Content Area ───────────────────────────────────────────────────────────

struct ContentArea {
    x: f64,  // pt from left
    y: f64,  // pt from top
    w: f64,  // pt
    h: f64,  // pt
}

fn content_area(pw: f64, ph: f64) -> ContentArea {
    let x = MARGIN_LEFT_IN * 72.0 + TM_W_IN * 72.0 + FRAME_PAD_IN * 72.0;
    let y = MARGIN_TOP_IN * 72.0 + TM_H_IN * 72.0 + FRAME_PAD_IN * 72.0;
    let w = pw * 72.0 - 2.0 * (MARGIN_LEFT_IN * 72.0 + TM_W_IN * 72.0 + FRAME_PAD_IN * 72.0);
    let h = ph * 72.0 - 2.0 * (MARGIN_TOP_IN * 72.0 + TM_H_IN * 72.0 + FRAME_PAD_IN * 72.0);
    ContentArea { x, y, w, h }
}

// ─── Frame Drawing Helpers ──────────────────────────────────────────────────

fn push_rect(frame: &mut Frame, x: f64, y: f64, w: f64, h: f64, fill: Option<Paint>, stroke: Option<FixedStroke>) {
    frame.push(Point::new(pt(x), pt(y)), FrameItem::Shape(rect_shape(pt(w), pt(h), fill, stroke), span()));
}

fn push_text(frame: &mut Frame, fonts: &FontSet, x: f64, y: f64, text: &str, size: f64, bold: bool) {
    let bundle = if bold { &fonts.bold } else { &fonts.regular };
    let item = bundle.text_item(text, pt(size), black());
    // typst positions text at its baseline; offset y by ascent so the
    // top of the text aligns with the requested y coordinate
    let ascent = bundle.ascent(pt(size)).to_pt();
    frame.push(Point::new(pt(x), pt(y + ascent)), FrameItem::Text(item));
}

/// Draw a block of word-wrapped text. Returns height used in pt.
fn push_text_block(frame: &mut Frame, fonts: &FontSet, x: f64, y: f64, text: &str, size: f64, max_w: f64, bold: bool) -> f64 {
    let bundle = if bold { &fonts.bold } else { &fonts.regular };
    let lines = bundle.wrap_text(text, pt(size), pt(max_w));
    let line_h = size * LH;
    let ascent = bundle.ascent(pt(size)).to_pt();
    for (i, line) in lines.iter().enumerate() {
        let item = bundle.text_item(line, pt(size), black());
        frame.push(Point::new(pt(x), pt(y + i as f64 * line_h + ascent)), FrameItem::Text(item));
    }
    lines.len() as f64 * line_h
}

/// Measure height of word-wrapped text without drawing.
fn measure_text_block(fonts: &FontSet, text: &str, size: f64, max_w: f64, bold: bool) -> f64 {
    let bundle = if bold { &fonts.bold } else { &fonts.regular };
    let lines = bundle.wrap_text(text, pt(size), pt(max_w));
    lines.len() as f64 * size * LH
}

fn push_line(frame: &mut Frame, x1: f64, y1: f64, x2: f64, y2: f64, thickness: f64) {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let shape = Shape {
        geometry: Geometry::Line(Point::new(pt(dx), pt(dy))),
        fill: None,
        fill_rule: FillRule::NonZero,
        stroke: Some(stroke_of(black(), thickness)),
    };
    frame.push(Point::new(pt(x1), pt(y1)), FrameItem::Shape(shape, span()));
}

/// Draw a rounded-rectangle bubble.
fn push_bubble(frame: &mut Frame, x: f64, y: f64) {
    let w = BUBBLE_W_PX * 72.0 / PX_PER_IN;
    let h = BUBBLE_H_PX * 72.0 / PX_PER_IN;
    let r = BUBBLE_R_PX * 72.0 / PX_PER_IN;
    let k = r * ((4.0 * (2.0_f64.sqrt() - 1.0)) / 3.0);

    let mut curve = Curve::new();
    curve.move_(Point::new(pt(r), Abs::zero()));
    curve.line(Point::new(pt(w - r), Abs::zero()));
    curve.cubic(
        Point::new(pt(w - r + k), Abs::zero()),
        Point::new(pt(w), pt(r - k)),
        Point::new(pt(w), pt(r)),
    );
    curve.line(Point::new(pt(w), pt(h - r)));
    curve.cubic(
        Point::new(pt(w), pt(h - r + k)),
        Point::new(pt(w - r + k), pt(h)),
        Point::new(pt(w - r), pt(h)),
    );
    curve.line(Point::new(pt(r), pt(h)));
    curve.cubic(
        Point::new(pt(r - k), pt(h)),
        Point::new(Abs::zero(), pt(h - r + k)),
        Point::new(Abs::zero(), pt(h - r)),
    );
    curve.line(Point::new(Abs::zero(), pt(r)));
    curve.cubic(
        Point::new(Abs::zero(), pt(r - k)),
        Point::new(pt(r - k), Abs::zero()),
        Point::new(pt(r), Abs::zero()),
    );
    curve.close();

    let shape = Shape {
        geometry: Geometry::Curve(curve),
        fill: None,
        fill_rule: FillRule::NonZero,
        stroke: Some(stroke_of(black(), 0.75)),
    };
    frame.push(Point::new(pt(x), pt(y)), FrameItem::Shape(shape, span()));
}

// ─── Timing Marks ───────────────────────────────────────────────────────────

fn draw_timing_marks(frame: &mut Frame, pw: f64, ph: f64) {
    let (nx, ny) = timing_mark_counts(pw, ph);
    let tm_w = TM_W_IN * 72.0;
    let tm_h = TM_H_IN * 72.0;
    let ml = MARGIN_LEFT_IN * 72.0;
    let mt = MARGIN_TOP_IN * 72.0;
    let grid_w = pw * 72.0 - ml - MARGIN_RIGHT_IN * 72.0 - tm_w;
    let grid_h = ph * 72.0 - mt - MARGIN_BOTTOM_IN * 72.0 - tm_h;

    let mark = |frame: &mut Frame, x: f64, y: f64| {
        push_rect(frame, x, y, tm_w, tm_h, Some(black()), None);
    };

    for i in 0..nx {
        let frac = i as f64 / (nx - 1) as f64;
        let x = ml + frac * grid_w;
        mark(frame, x, mt);
        mark(frame, x, mt + grid_h);
    }
    for j in 0..ny {
        let frac = j as f64 / (ny - 1) as f64;
        let y = mt + frac * grid_h;
        mark(frame, ml, y);
        mark(frame, ml + grid_w, y);
    }
}

fn timing_mark_counts(pw: f64, ph: f64) -> (usize, usize) {
    ((pw * 4.0) as usize, (ph * 4.0) as usize - 3)
}

fn paper_dims(s: &str) -> (f64, f64) {
    match s {
        "letter" => (8.5, 11.0),
        "legal" => (8.5, 14.0),
        _ => (8.5, 11.0),
    }
}

// ─── Contest Measurement ────────────────────────────────────────────────────

fn measure_candidate_contest(fonts: &FontSet, c: &CandidateContest, col_w: f64) -> f64 {
    let inner = col_w - 2.0 * OPTION_PAD_H;
    let text_w = inner - bubble_w().to_pt() - BUBBLE_GAP;
    let mut h = 0.0;

    // Box top border
    h += 2.25; // 3px

    // Header
    h += CONTEST_HDR_PAD;
    h += measure_text_block(fonts, &c.title, H3, inner, true);
    let vote_text = if c.seats == 1 { "Vote for 1".to_string() } else { format!("Vote for up to {}", c.seats) };
    h += measure_text_block(fonts, &vote_text, BASE, inner, false);
    h += CONTEST_HDR_PAD;

    // Candidates
    for candidate in &c.candidates {
        h += OPTION_PAD_V;
        h += measure_text_block(fonts, &candidate.name, BASE, text_w, true);
        if !candidate.party_ids.is_empty() {
            h += BASE * LH;
        }
        h += OPTION_PAD_V;
    }

    // Write-ins
    if c.allow_write_ins {
        for _ in 0..c.seats {
            h += 0.75; // border
            h += 0.9 * BASE; // top padding
            h += 1.25 * BASE; // write-in line
            h += 0.8 * BASE * LH; // label
            h += 0.25 * BASE; // bottom padding
        }
    }

    h += 0.75; // bottom border
    h
}

fn measure_yesno_contest(fonts: &FontSet, c: &YesNoContest, col_w: f64) -> f64 {
    let inner = col_w - 2.0 * OPTION_PAD_H;
    let is_html = c.description.contains('<');
    let mut h = 0.0;
    h += 2.25; // top border
    h += CONTEST_HDR_PAD;
    h += measure_text_block(fonts, &c.title, H3, inner, true);
    h += CONTEST_HDR_PAD;
    h += OPTION_PAD_H;
    if is_html {
        h += measure_rich_text(fonts, &c.description, BASE, inner);
    } else {
        h += measure_text_block(fonts, &c.description, BASE, inner, false);
    }
    h += OPTION_PAD_H;
    h += 0.25 * BASE;
    // Yes + No
    h += 2.0 * (OPTION_PAD_V + BASE * LH + OPTION_PAD_V);
    h += 0.75;
    h
}

fn measure_contest(fonts: &FontSet, c: &Contest, col_w: f64) -> f64 {
    match c {
        Contest::Candidate(cc) => measure_candidate_contest(fonts, cc, col_w),
        Contest::YesNo(yn) => measure_yesno_contest(fonts, yn, col_w),
    }
}

// ─── Contest Drawing ────────────────────────────────────────────────────────

fn draw_candidate_contest(frame: &mut Frame, fonts: &FontSet, c: &CandidateContest, x: f64, y: f64, col_w: f64, election: &Election) -> f64 {
    let inner = col_w - 2.0 * OPTION_PAD_H;
    let text_w = inner - bubble_w().to_pt() - BUBBLE_GAP;
    let bw = bubble_w().to_pt();
    let bh = bubble_h().to_pt();
    let mut cy = y;

    // Top border (3px)
    push_rect(frame, x, cy, col_w, 2.25, Some(black()), None);
    cy += 2.25;

    // Header background
    let hdr_start = cy;
    cy += CONTEST_HDR_PAD;
    let title_h = push_text_block(frame, fonts, x + OPTION_PAD_H, cy, &c.title, H3, inner, true);
    cy += title_h;
    let vote_text = if c.seats == 1 { "Vote for 1".to_string() } else { format!("Vote for up to {}", c.seats) };
    let vote_h = push_text_block(frame, fonts, x + OPTION_PAD_H, cy, &vote_text, BASE, inner, false);
    cy += vote_h;
    cy += CONTEST_HDR_PAD;
    // Draw background behind header (push first so text is on top — actually typst paints in order, so draw bg first then re-draw text)
    // Typst renders items in push order, so we need to insert the bg before the text.
    // Simpler: just accept text on top of bg since we pushed text after rect in the PoC.
    // Actually, we need to draw bg BEFORE text. Let me restructure.

    // Instead, measure header first, draw bg, then draw text
    let hdr_h = cy - hdr_start;
    // We already drew the text. For the prototype, let's skip the bg (it would require
    // restructuring to measure-then-draw). We'll just draw a box outline.
    push_rect(frame, x, hdr_start, col_w, hdr_h, Some(light_gray()), None);
    // Re-draw text on top of background
    let mut ty = hdr_start + CONTEST_HDR_PAD;
    ty += push_text_block(frame, fonts, x + OPTION_PAD_H, ty, &c.title, H3, inner, true);
    push_text_block(frame, fonts, x + OPTION_PAD_H, ty, &vote_text, BASE, inner, false);

    // Candidates
    for (i, candidate) in c.candidates.iter().enumerate() {
        if i > 0 {
            push_line(frame, x, cy, x + col_w, cy, 0.5);
        }
        cy += OPTION_PAD_V;
        let line_h = BASE * LH;
        let bubble_y = cy + (line_h - bh) / 2.0;
        push_bubble(frame, x + OPTION_PAD_H, bubble_y);

        let tx = x + OPTION_PAD_H + bw + BUBBLE_GAP;
        let name_h = push_text_block(frame, fonts, tx, cy, &candidate.name, BASE, text_w, true);
        cy += name_h;

        // Party name
        if !candidate.party_ids.is_empty() {
            let party_name = candidate.party_ids.iter()
                .filter_map(|pid| election.parties.iter().find(|p| p.id == *pid))
                .map(|p| p.name.as_str())
                .collect::<Vec<_>>()
                .join(", ");
            if !party_name.is_empty() {
                push_text_block(frame, fonts, tx, cy, &party_name, BASE, text_w, false);
                cy += BASE * LH;
            }
        }
        cy += OPTION_PAD_V;
    }

    // Write-ins
    if c.allow_write_ins {
        for _ in 0..c.seats {
            push_line(frame, x, cy, x + col_w, cy, 0.5);
            cy += 0.75;
            cy += 0.9 * BASE;

            let line_h = BASE * LH;
            let bubble_y = cy + (line_h - bh) / 2.0;
            push_bubble(frame, x + OPTION_PAD_H, bubble_y);

            let tx = x + OPTION_PAD_H + bw + BUBBLE_GAP;
            let line_end_x = x + col_w - OPTION_PAD_H;
            cy += 1.25 * BASE;
            push_line(frame, tx, cy, line_end_x, cy, 0.5);
            cy += 0.1 * BASE;
            push_text_block(frame, fonts, tx, cy, "Write-in", 0.8 * BASE, text_w, false);
            cy += 0.8 * BASE * LH;
            cy += 0.25 * BASE;
        }
    }

    // Box outline
    push_rect(frame, x, y + 2.25, col_w, cy - y - 2.25, None, Some(stroke_of(black(), 0.75)));

    cy - y
}

fn draw_yesno_contest(frame: &mut Frame, fonts: &FontSet, c: &YesNoContest, x: f64, y: f64, col_w: f64) -> f64 {
    let inner = col_w - 2.0 * OPTION_PAD_H;
    let bw = bubble_w().to_pt();
    let bh = bubble_h().to_pt();
    let mut cy = y;

    // Top border
    push_rect(frame, x, cy, col_w, 2.25, Some(black()), None);
    cy += 2.25;

    // Header
    let hdr_start = cy;
    cy += CONTEST_HDR_PAD;
    let hdr_h = measure_text_block(fonts, &c.title, H3, inner, true);
    push_rect(frame, x, hdr_start, col_w, CONTEST_HDR_PAD + hdr_h + CONTEST_HDR_PAD, Some(light_gray()), None);
    push_text_block(frame, fonts, x + OPTION_PAD_H, cy, &c.title, H3, inner, true);
    cy += hdr_h + CONTEST_HDR_PAD;

    // Description (render rich text if HTML)
    cy += OPTION_PAD_H;
    let is_html = c.description.contains('<');
    if is_html {
        cy += draw_rich_text(frame, fonts, &c.description, x + OPTION_PAD_H, cy, BASE, inner);
    } else {
        cy += push_text_block(frame, fonts, x + OPTION_PAD_H, cy, &c.description, BASE, inner, false);
    }
    cy += OPTION_PAD_H + 0.25 * BASE;

    // Yes/No options
    for opt in [&c.yes_option, &c.no_option] {
        push_line(frame, x, cy, x + col_w, cy, 0.5);
        cy += OPTION_PAD_V;
        let line_h = BASE * LH;
        let bubble_y = cy + (line_h - bh) / 2.0;
        push_bubble(frame, x + OPTION_PAD_H, bubble_y);
        push_text_block(frame, fonts, x + OPTION_PAD_H + bw + BUBBLE_GAP, cy, &opt.label, BASE, inner, true);
        cy += line_h + OPTION_PAD_V;
    }

    push_rect(frame, x, y + 2.25, col_w, cy - y - 2.25, None, Some(stroke_of(black(), 0.75)));
    cy - y
}

// ─── Simple Column Layout ───────────────────────────────────────────────────

struct ColumnLayout {
    columns: Vec<Vec<usize>>, // indices into contest list
    height: f64,
}

fn layout_in_columns(heights: &[f64], num_cols: usize, max_h: f64) -> ColumnLayout {
    let mut columns: Vec<Vec<usize>> = (0..num_cols).map(|_| vec![]).collect();
    let mut col = 0;
    let mut col_h = 0.0;
    let mut used = 0;

    for (i, &h) in heights.iter().enumerate() {
        if col_h + h > max_h {
            if col_h > 0.0 {
                // Current column is full, try the next one
                col += 1;
                col_h = 0.0;
                if col >= num_cols { break; }
            }
            // If the contest doesn't fit even in an empty column, stop
            if h > max_h { break; }
        }
        columns[col].push(i);
        col_h += h + GAP;
        used = i + 1;
    }

    let tallest = columns.iter().map(|c| {
        let total: f64 = c.iter().map(|&i| heights[i]).sum();
        total + (c.len().saturating_sub(1)) as f64 * GAP
    }).fold(0.0_f64, f64::max);

    ColumnLayout { columns, height: tallest }
}

// ─── Header / Footer ────────────────────────────────────────────────────────

fn draw_header(frame: &mut Frame, fonts: &FontSet, ca: &ContentArea, data: &BallotData) -> f64 {
    let title = match data.ballot_mode.as_str() {
        "official" => "Official Ballot",
        "sample" => "Sample Ballot",
        _ => "Test Ballot",
    };

    let seal_size = 5.0 * BASE; // 60pt
    let text_x = ca.x + seal_size + GAP;
    let text_w = ca.w - seal_size - GAP;

    // Measure text height for centering
    let mut text_h = 0.0;
    text_h += H1 * LH;
    text_h += H2 * LH;
    text_h += H2 * LH;
    text_h += BASE * LH;

    let header_h = f64::max(text_h, seal_size);
    let text_offset = (header_h - text_h) / 2.0;

    let mut ty = ca.y + text_offset;
    push_text_block(frame, fonts, text_x, ty, title, H1, text_w, true);
    ty += H1 * LH;
    push_text_block(frame, fonts, text_x, ty, &data.election.title, H2, text_w, true);
    ty += H2 * LH;
    let formatted_date = format_date(&data.election.date);
    push_text_block(frame, fonts, text_x, ty, &formatted_date, H2, text_w, true);
    ty += H2 * LH;
    let loc = format!("{}, {}", data.election.county.name, data.election.state);
    push_text_block(frame, fonts, text_x, ty, &loc, BASE, text_w, false);

    header_h
}

// ─── Instructions ───────────────────────────────────────────────────────────

const INSTR_TO_VOTE: &str = "To vote, completely fill in the oval next to your choice.";
const INSTR_WRITE_IN_TITLE: &str = "To Vote for a Write-in:";
const INSTR_WRITE_IN_TEXT: &str = "To vote for a person whose name is not on the ballot, write the person\u{2019}s name on the \u{201C}Write-in\u{201D} line and completely fill in the oval next to the line.";

fn measure_instructions(ca: &ContentArea, fonts: &FontSet) -> f64 {
    let pad = CONTEST_HDR_PAD;
    let col_gap = GAP;
    let inner_w = ca.w - 2.0 * pad;
    let col2_w = 7.0 * BASE; // diagram column
    let col4_w = 7.5 * BASE;
    let fr_total = inner_w - col2_w - col4_w - 3.0 * col_gap;
    let col1_w = fr_total * (1.0 / 2.9);
    let col3_w = fr_total * (1.9 / 2.9);

    let left_h = H2 * LH
        + BASE * LH
        + measure_text_block(fonts, INSTR_TO_VOTE, BASE, col1_w, false);

    let right_h = BASE * LH
        + measure_text_block(fonts, INSTR_WRITE_IN_TEXT, BASE, col3_w, false);

    let grid_h = f64::max(left_h, right_h);

    2.25 + pad + grid_h + pad + 0.75 // border-top + padding + content + padding + border-bottom
}

fn draw_instructions(frame: &mut Frame, fonts: &FontSet, ca: &ContentArea, x: f64, y: f64) -> f64 {
    let h = measure_instructions(ca, fonts);
    let pad = CONTEST_HDR_PAD;
    let col_gap = GAP;
    let inner_w = ca.w - 2.0 * pad;
    let col2_w = 7.0 * BASE;
    let col4_w = 7.5 * BASE;
    let fr_total = inner_w - col2_w - col4_w - 3.0 * col_gap;
    let col1_w = fr_total * (1.0 / 2.9);
    let col3_w = fr_total * (1.9 / 2.9);

    // Box: 3px top border + tinted background
    push_rect(frame, x, y, ca.w, 2.25, Some(black()), None);
    push_rect(frame, x, y + 2.25, ca.w, h - 2.25 - 0.75, Some(light_gray()), None);
    push_rect(frame, x, y, ca.w, h, None, Some(stroke_of(black(), 0.75)));

    let cy = y + 2.25 + pad;
    let col1_x = x + pad;

    // Column 1: heading + To Vote: + text
    let mut c1y = cy;
    c1y += push_text_block(frame, fonts, col1_x, c1y, "Instructions", H2, col1_w, true);
    c1y += push_text_block(frame, fonts, col1_x, c1y, "To Vote:", BASE, col1_w, true);
    push_text_block(frame, fonts, col1_x, c1y, INSTR_TO_VOTE, BASE, col1_w, false);

    // Column 2: fill bubble diagram
    let col2_x = col1_x + col1_w + col_gap;
    let content_h = h - 2.25 - 2.0 * pad - 0.75;
    let diag_mid_y = cy + content_h / 2.0;
    let bh = bubble_h().to_pt();
    // Filled bubble
    push_bubble(frame, col2_x + 10.0, diag_mid_y - bh / 2.0 - 2.0);
    // Fill it (draw a filled rect on top)
    let bw_pt = bubble_w().to_pt();
    push_rect(frame, col2_x + 10.0 + 1.0, diag_mid_y - bh / 2.0 + 0.5, bw_pt - 2.0, bh - 3.0, Some(black()), None);
    // Empty bubble
    push_bubble(frame, col2_x + 10.0 + bw_pt + 8.0, diag_mid_y - bh / 2.0 - 2.0);

    // Column 3: write-in instructions
    let col3_x = col2_x + col2_w + col_gap;
    let mut c3y = cy;
    c3y += push_text_block(frame, fonts, col3_x, c3y, INSTR_WRITE_IN_TITLE, BASE, col3_w, true);
    push_text_block(frame, fonts, col3_x, c3y, INSTR_WRITE_IN_TEXT, BASE, col3_w, false);

    // Column 4: write-in diagram
    let col4_x = col3_x + col3_w + col_gap;
    // Filled bubble + line
    push_bubble(frame, col4_x + 6.0, diag_mid_y - bh / 2.0);
    push_rect(frame, col4_x + 6.0 + 1.0, diag_mid_y - bh / 2.0 + 0.5, bw_pt - 2.0, bh - 3.0, Some(black()), None);
    push_line(frame, col4_x + 6.0 + bw_pt + 6.0, diag_mid_y + 4.0, col4_x + col4_w - 4.0, diag_mid_y + 4.0, 0.75);

    h
}

fn footer_height() -> f64 {
    let qr_size = 0.6 * 72.0; // 43.2pt
    let meta_h = 8.0 * LH; // 9.6pt
    let meta_gap = 4.0; // gap between QR row and metadata
    qr_size + meta_gap + meta_h
}

fn draw_footer(frame: &mut Frame, fonts: &FontSet, ca: &ContentArea, page_num: usize, total_pages: usize, data: &BallotData) {
    let fh = footer_height();
    let footer_y = ca.y + ca.h - fh;
    let qr_size = 0.6 * 72.0;

    // QR placeholder
    push_rect(frame, ca.x, footer_y, qr_size, qr_size, None, Some(stroke_of(black(), 0.75)));

    // Footer box
    let box_x = ca.x + qr_size + GAP;
    let box_w = ca.w - qr_size - GAP;
    push_rect(frame, box_x, footer_y, box_w, 2.25, Some(black()), None);
    push_rect(frame, box_x, footer_y + 2.25, box_w, qr_size - 2.25, Some(light_gray()), None);
    push_rect(frame, box_x, footer_y, box_w, qr_size, None, Some(stroke_of(black(), 0.75)));

    // Page number
    let page_label_y = footer_y + (qr_size - BASE * 0.85 * LH - H1 * LH) / 2.0;
    push_text_block(frame, fonts, box_x + OPTION_PAD_H, page_label_y, "Page", 0.85 * BASE, box_w, false);
    push_text_block(frame, fonts, box_x + OPTION_PAD_H, page_label_y + BASE * 0.85 * LH, &format!("{page_num}/{total_pages}"), H1, box_w, true);

    // Voter instruction
    if page_num == total_pages {
        let text = "You have completed voting.";
        let tw = fonts.bold.measure_width(text, pt(H3)).to_pt();
        push_text(frame, fonts, box_x + box_w - tw - OPTION_PAD_H, footer_y + (qr_size - H3) / 2.0, text, H3, true);
    } else {
        let text = if page_num % 2 == 1 { "Turn ballot over and continue voting" } else { "Continue voting on next ballot sheet" };
        let tw = fonts.bold.measure_width(text, pt(H3)).to_pt();
        push_text(frame, fonts, box_x + box_w - tw - OPTION_PAD_H, footer_y + (qr_size - H3) / 2.0, text, H3, true);
    }

    // Metadata
    let meta_y = footer_y + qr_size + 4.0;
    let precinct = data.election.precincts.iter().find(|p| p.id == data.precinct_id).map(|p| p.name.as_str()).unwrap_or(&data.precinct_id);
    let fdate = format_date(&data.election.date);
    let left = format!("00000000000000000000 · {}, {} · {}, {}", data.election.title, fdate, data.election.county.name, data.election.state);
    push_text(frame, fonts, ca.x, meta_y, &left, 8.0, true);
    let right = format!("{precinct} · {} · English", data.ballot_style_id);
    let rw = fonts.bold.measure_width(&right, pt(8.0)).to_pt();
    push_text(frame, fonts, ca.x + ca.w - rw, meta_y, &right, 8.0, true);
}

// ─── Main Render ────────────────────────────────────────────────────────────

pub fn render_ballot(fonts: &FontSet, data: &BallotData) -> Result<Vec<u8>, String> {
    let (pw, ph) = paper_dims(&data.election.ballot_layout.paper_size);
    let ca = content_area(pw, ph);
    let hide_tm = data.ballot_mode == "sample";

    // Get contests for this ballot style
    let ballot_style = data.election.ballot_styles.iter()
        .find(|bs| bs.id == data.ballot_style_id)
        .ok_or("Ballot style not found")?;
    let contests: Vec<&Contest> = data.election.contests.iter()
        .filter(|c| {
            let district_id = match c {
                Contest::Candidate(cc) => &cc.district_id,
                Contest::YesNo(yn) => &yn.district_id,
            };
            ballot_style.districts.contains(district_id)
        })
        .collect();

    // Split into candidate and yesno sections
    let candidate_contests: Vec<&Contest> = contests.iter().filter(|c| matches!(c, Contest::Candidate(_))).copied().collect();
    let yesno_contests: Vec<&Contest> = contests.iter().filter(|c| matches!(c, Contest::YesNo(_))).copied().collect();
    let mut sections: Vec<(Vec<&Contest>, usize)> = vec![];
    if !candidate_contests.is_empty() { sections.push((candidate_contests, 3)); }
    if !yesno_contests.is_empty() { sections.push((yesno_contests, 2)); }

    // Measure header/instructions/footer
    let header_h = {
        let mut h = 0.0;
        h += f64::max(5.0 * BASE, H1 * LH + H2 * LH * 2.0 + BASE * LH);
        h
    };
    let instructions_h = measure_instructions(&ca, fonts);
    let footer_h = footer_height();

    // Paginate
    struct PageContent<'a> {
        sections: Vec<(Vec<&'a Contest>, usize, Vec<Vec<usize>>)>, // (contests, num_cols, column_layout)
        is_first: bool,
    }

    let mut all_pages: Vec<PageContent> = Vec::new();
    let mut remaining_sections = sections;
    let mut page_idx = 0;

    while !remaining_sections.is_empty() {
        let is_first = page_idx == 0;
        let mut avail = ca.h - footer_h - GAP;
        if is_first { avail -= header_h + GAP + instructions_h + GAP; }

        let mut page_sections = Vec::new();
        let mut height_used = 0.0;

        while !remaining_sections.is_empty() && height_used < avail {
            let (section_contests, num_cols) = remaining_sections.remove(0);
            let col_w = (ca.w - GAP * (num_cols - 1) as f64) / num_cols as f64;
            let heights: Vec<f64> = section_contests.iter().map(|c| measure_contest(fonts, c, col_w)).collect();
            let layout = layout_in_columns(&heights, num_cols, avail - height_used);

            let used_count: usize = layout.columns.iter().map(|c| c.len()).sum();

            if used_count == 0 {
                // Nothing fit — put the whole section back and go to next page
                remaining_sections.insert(0, (section_contests, num_cols));
                break;
            }

            if used_count < section_contests.len() {
                let leftover: Vec<&Contest> = section_contests[used_count..].to_vec();
                remaining_sections.insert(0, (leftover, num_cols));
            }

            if layout.height == 0.0 { break; }
            height_used += layout.height + GAP;
            page_sections.push((section_contests[..used_count].to_vec(), num_cols, layout.columns));
        }

        all_pages.push(PageContent { sections: page_sections, is_first });
        page_idx += 1;
    }

    let total_pages = all_pages.len();
    // Ensure even page count
    if all_pages.len() % 2 == 1 {
        all_pages.push(PageContent { sections: vec![], is_first: false });
    }

    // Render pages
    let mut pages = Vec::new();
    for (pi, pc) in all_pages.iter().enumerate() {
        let page_num = pi + 1;
        let mut frame = Frame::hard(Axes::new(inches(pw), inches(ph)));

        // White background
        push_rect(&mut frame, 0.0, 0.0, pw * 72.0, ph * 72.0, Some(white()), None);

        if !hide_tm {
            draw_timing_marks(&mut frame, pw, ph);
        }

        let mut cy = ca.y;

        if pc.is_first {
            let hdr_h = draw_header(&mut frame, fonts, &ca, data);
            cy += hdr_h + GAP;
            let instr_h = draw_instructions(&mut frame, fonts, &ca, ca.x, cy);
            cy += instr_h + GAP;
        }

        // Draw contest sections
        for (section_contests, num_cols, columns) in &pc.sections {
            let col_w = (ca.w - GAP * (*num_cols - 1) as f64) / *num_cols as f64;
            let mut section_max_h = 0.0_f64;
            for (ci, col) in columns.iter().enumerate() {
                let col_x = ca.x + ci as f64 * (col_w + GAP);
                let mut col_y = cy;
                for &idx in col {
                    let contest = section_contests[idx];
                    let h = match contest {
                        Contest::Candidate(cc) => draw_candidate_contest(&mut frame, fonts, cc, col_x, col_y, col_w, &data.election),
                        Contest::YesNo(yn) => draw_yesno_contest(&mut frame, fonts, yn, col_x, col_y, col_w),
                    };
                    col_y += h + GAP;
                }
                section_max_h = section_max_h.max(col_y - cy);
            }
            cy += section_max_h + GAP;
        }

        // Blank page message
        if pc.sections.is_empty() && !pc.is_first {
            let msg = "This page intentionally left blank";
            let tw = fonts.bold.measure_width(msg, pt(H1)).to_pt();
            push_text(&mut frame, fonts, ca.x + (ca.w - tw) / 2.0, ca.y + ca.h / 2.0, msg, H1, true);
        }

        // Footer
        if !pc.sections.is_empty() || pc.is_first {
            draw_footer(&mut frame, fonts, &ca, page_num, total_pages, data);
        }

        pages.push(Page {
            frame,
            fill: Smart::Custom(Some(white())),
            numbering: None,
            supplement: typst_library::foundations::Content::default(),
            number: page_num as u64,
        });
    }

    let doc = PagedDocument {
        pages,
        info: DocumentInfo::default(),
        introspector: typst_library::introspection::Introspector::default(),
    };

    typst_pdf::pdf(&doc, &typst_pdf::PdfOptions::default())
        .map_err(|e| format!("PDF export failed: {e:?}"))
}
