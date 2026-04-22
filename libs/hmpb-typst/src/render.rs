use serde::Deserialize;
use typst_library::foundations::Smart;
use typst_library::layout::{Abs, Axes, Frame, FrameItem, Page, PagedDocument, Point};
use typst_library::model::DocumentInfo;
use typst_library::text::Font;
use typst_library::visualize::{
    Color, Curve, CurveItem, FillRule, FixedStroke, Geometry, Paint, Shape,
};

use crate::text::FontSet;

/// Strip HTML tags from a string, converting basic elements to plain text.
fn strip_html(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    let mut last_was_block = false;

    let lower = html.to_lowercase();
    let chars: Vec<char> = html.chars().collect();
    let lower_chars: Vec<char> = lower.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        if chars[i] == '<' {
            in_tag = true;
            // Check for block elements that should add newlines
            let rest: String = lower_chars[i..].iter().collect();
            if rest.starts_with("<p>") || rest.starts_with("<br") || rest.starts_with("<li>") || rest.starts_with("<tr>") {
                if !result.is_empty() && !last_was_block {
                    result.push('\n');
                }
                last_was_block = true;
            } else {
                last_was_block = false;
            }
        } else if chars[i] == '>' {
            in_tag = false;
        } else if !in_tag {
            result.push(chars[i]);
            last_was_block = false;
        }
        i += 1;
    }

    // Decode basic HTML entities
    result
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
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
    let desc = strip_html(&c.description);
    let mut h = 0.0;
    h += 2.25; // top border
    h += CONTEST_HDR_PAD;
    h += measure_text_block(fonts, &c.title, H3, inner, true);
    h += CONTEST_HDR_PAD;
    h += OPTION_PAD_H;
    h += measure_text_block(fonts, &desc, BASE, inner, false);
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

    // Description (strip HTML)
    let desc = strip_html(&c.description);
    cy += OPTION_PAD_H;
    cy += push_text_block(frame, fonts, x + OPTION_PAD_H, cy, &desc, BASE, inner, false);
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
        if col_h + h > max_h && col_h > 0.0 {
            col += 1;
            col_h = 0.0;
            if col >= num_cols { break; }
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

fn draw_footer(frame: &mut Frame, fonts: &FontSet, ca: &ContentArea, page_num: usize, total_pages: usize, data: &BallotData) {
    let footer_y = ca.y + ca.h - 43.2 - 8.0 * LH - 4.0;
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
    let instructions_h = 60.0; // approximate
    let footer_h = 0.6 * 72.0 + 8.0 * LH + 8.0;

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
            // Simplified instructions placeholder
            push_rect(&mut frame, ca.x, cy, ca.w, 2.25, Some(black()), None);
            push_rect(&mut frame, ca.x, cy + 2.25, ca.w, instructions_h - 2.25, Some(light_gray()), None);
            push_rect(&mut frame, ca.x, cy, ca.w, instructions_h, None, Some(stroke_of(black(), 0.75)));
            push_text_block(&mut frame, fonts, ca.x + OPTION_PAD_H, cy + 2.25 + OPTION_PAD_H, "Instructions", H2, ca.w - 2.0 * OPTION_PAD_H, true);
            let instr_text_y = cy + 2.25 + OPTION_PAD_H + H2 * LH;
            push_text_block(&mut frame, fonts, ca.x + OPTION_PAD_H, instr_text_y, "To Vote:", BASE, ca.w * 0.25, true);
            push_text_block(&mut frame, fonts, ca.x + OPTION_PAD_H, instr_text_y + BASE * LH, "To vote, completely fill in the oval next to your choice.", BASE, ca.w * 0.25, false);
            cy += instructions_h + GAP;
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
