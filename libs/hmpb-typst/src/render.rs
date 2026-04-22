use serde::Deserialize;
use std::sync::LazyLock;
use typst_library::foundations::Smart;
use typst_library::layout::{Abs, Axes, Frame, FrameItem, Page, PagedDocument, Point};
use typst_library::model::DocumentInfo;
use typst_library::text::{Font, TextItem};
use typst_library::visualize::{
    Color, FillRule, FixedStroke, Geometry, Paint, Shape,
};

use crate::text;

// ─── Constants ──────────────────────────────────────────────────────────────

const TIMING_MARK_W: f64 = 0.1875; // inches
const TIMING_MARK_H: f64 = 0.0625; // inches

const BUBBLE_W_PX: f64 = 19.0;
const BUBBLE_H_PX: f64 = 13.0;
const BUBBLE_RADIUS_PX: f64 = 7.0;
const PX_TO_IN: f64 = 1.0 / 96.0;

const MARGIN_TOP: f64 = 0.16667; // inches (12pt)
const MARGIN_BOTTOM: f64 = 0.16667;
const MARGIN_LEFT: f64 = 0.19685; // inches (5mm)
const MARGIN_RIGHT: f64 = 0.19685;

const FRAME_PADDING: f64 = 0.125; // inches

const FONT_SIZE_BASE: f64 = 12.0; // pt
const FONT_SIZE_H1: f64 = 16.8;
const FONT_SIZE_H2: f64 = 14.4;
const FONT_SIZE_H3: f64 = 13.2;
const LINE_HEIGHT: f64 = 1.2;

const SECTION_GAP: f64 = 9.0; // pt (0.75rem)
const COLUMN_GAP: f64 = 9.0;

// ─── Fonts ──────────────────────────────────────────────────────────────────

static ROBOTO_REGULAR: LazyLock<Vec<u8>> = LazyLock::new(|| {
    include_bytes!("../fonts/Roboto-Regular.ttf").to_vec()
});

static ROBOTO_BOLD: LazyLock<Vec<u8>> = LazyLock::new(|| {
    include_bytes!("../fonts/Roboto-Bold.ttf").to_vec()
});

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

#[derive(Deserialize)]
pub struct County {
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BallotLayout {
    pub paper_size: String,
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
pub struct ContestOption {
    pub id: String,
    pub label: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BallotStyle {
    pub id: String,
    #[serde(default)]
    pub precincts: Vec<String>,
    #[serde(default)]
    pub districts: Vec<String>,
}

#[derive(Deserialize)]
pub struct Precinct {
    pub id: String,
    pub name: String,
}

#[derive(Deserialize)]
pub struct Party {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub full_name: String,
}

// ─── Helper functions ───────────────────────────────────────────────────────

fn paper_dimensions(paper_size: &str) -> (f64, f64) {
    match paper_size {
        "letter" => (8.5, 11.0),
        "legal" => (8.5, 14.0),
        "custom17" => (8.5, 17.0),
        "custom18" => (8.5, 18.0),
        "custom19" => (8.5, 19.0),
        "custom20" => (8.5, 20.0),
        "custom22" => (8.5, 22.0),
        _ => (8.5, 11.0), // default to letter
    }
}

fn timing_mark_counts(width_in: f64, height_in: f64) -> (usize, usize) {
    let cols_per_inch = 4;
    let rows_per_inch = 4;
    let x = (width_in * cols_per_inch as f64) as usize;
    let y = (height_in * rows_per_inch as f64) as usize - 3;
    (x, y)
}

fn pt(value: f64) -> Abs {
    Abs::pt(value)
}

fn inches(value: f64) -> Abs {
    Abs::inches(value)
}

fn black_paint() -> Paint {
    Paint::Solid(Color::BLACK)
}

fn gray_paint() -> Paint {
    // #EDEDED
    Paint::Solid(
        Color::from_u8(0xED, 0xED, 0xED, 0xFF),
    )
}

fn make_rect(w: Abs, h: Abs, fill: Option<Paint>, stroke: Option<FixedStroke>) -> Shape {
    Shape {
        geometry: Geometry::Rect(Axes::new(w, h)),
        fill,
        fill_rule: FillRule::NonZero,
        stroke,
    }
}

fn make_line(dx: Abs, dy: Abs, stroke: FixedStroke) -> Shape {
    Shape {
        geometry: Geometry::Line(Point::new(dx, dy)),
        fill: None,
        fill_rule: FillRule::NonZero,
        stroke: Some(stroke),
    }
}

fn thin_stroke() -> FixedStroke {
    let mut s = FixedStroke::default();
    s.paint = black_paint();
    s.thickness = Abs::pt(0.75);
    s
}

// ─── Main Render Function ───────────────────────────────────────────────────

pub fn render_ballot(data: &BallotData) -> Result<Vec<u8>, String> {
    let (page_w_in, page_h_in) = paper_dimensions(&data.election.ballot_layout.paper_size);
    let page_w = inches(page_w_in);
    let page_h = inches(page_h_in);
    let page_size = Axes::new(page_w, page_h);

    // Load fonts
    let regular_font_data = typst_library::foundations::Bytes::new(ROBOTO_REGULAR.clone());
    let bold_font_data = typst_library::foundations::Bytes::new(ROBOTO_BOLD.clone());

    let regular_font = Font::new(regular_font_data, 0)
        .ok_or_else(|| "Failed to load Roboto Regular".to_string())?;
    let bold_font = Font::new(bold_font_data, 0)
        .ok_or_else(|| "Failed to load Roboto Bold".to_string())?;

    // Create rustybuzz faces for text shaping
    let regular_face_data = ROBOTO_REGULAR.clone();
    let regular_face = rustybuzz::Face::from_slice(&regular_face_data, 0)
        .ok_or_else(|| "Failed to create rustybuzz face for Regular".to_string())?;
    let bold_face_data = ROBOTO_BOLD.clone();
    let bold_face = rustybuzz::Face::from_slice(&bold_face_data, 0)
        .ok_or_else(|| "Failed to create rustybuzz face for Bold".to_string())?;

    let hide_timing_marks = data.ballot_mode == "sample";

    // Build pages
    let mut pages: Vec<Page> = Vec::new();

    // For now, create a single page with timing marks and a header
    let mut frame = Frame::hard(page_size);

    // Draw timing marks
    if !hide_timing_marks {
        draw_timing_marks(&mut frame, page_w_in, page_h_in);
    }

    // Draw header text
    let content_x = MARGIN_LEFT + TIMING_MARK_W + FRAME_PADDING;
    let content_y = MARGIN_TOP + TIMING_MARK_H + FRAME_PADDING;

    // Title
    let title_text = match data.ballot_mode.as_str() {
        "official" => "Official Ballot",
        "sample" => "Sample Ballot",
        _ => "Test Ballot",
    };
    let title_glyphs = text::shape_text(&bold_font, &bold_face, title_text, pt(FONT_SIZE_H1));
    let title_item = TextItem {
        font: bold_font.clone(),
        size: pt(FONT_SIZE_H1),
        fill: black_paint(),
        stroke: None,
        lang: typst_library::text::Lang::ENGLISH,
        region: None,
        text: title_text.into(),
        glyphs: title_glyphs,
    };
    frame.push(
        Point::new(inches(content_x), inches(content_y)),
        FrameItem::Text(title_item),
    );

    // Election title
    let mut y_offset = content_y + FONT_SIZE_H1 * LINE_HEIGHT / 72.0;
    let election_title = &data.election.title;
    let et_glyphs = text::shape_text(&bold_font, &bold_face, election_title, pt(FONT_SIZE_H2));
    let et_item = TextItem {
        font: bold_font.clone(),
        size: pt(FONT_SIZE_H2),
        fill: black_paint(),
        stroke: None,
        lang: typst_library::text::Lang::ENGLISH,
        region: None,
        text: election_title.clone().into(),
        glyphs: et_glyphs,
    };
    frame.push(
        Point::new(inches(content_x), inches(y_offset)),
        FrameItem::Text(et_item),
    );

    // Location
    y_offset += FONT_SIZE_H2 * LINE_HEIGHT / 72.0;
    let location = format!("{}, {}", data.election.county.name, data.election.state);
    let loc_glyphs = text::shape_text(&regular_font, &regular_face, &location, pt(FONT_SIZE_BASE));
    let loc_item = TextItem {
        font: regular_font.clone(),
        size: pt(FONT_SIZE_BASE),
        fill: black_paint(),
        stroke: None,
        lang: typst_library::text::Lang::ENGLISH,
        region: None,
        text: location.into(),
        glyphs: loc_glyphs,
    };
    frame.push(
        Point::new(inches(content_x), inches(y_offset)),
        FrameItem::Text(loc_item),
    );

    pages.push(Page {
        frame,
        fill: Smart::Custom(Some(Paint::Solid(Color::WHITE))),
        numbering: None,
        supplement: typst_library::foundations::Content::default(),
        number: 1,
    });

    // Build document
    let doc = PagedDocument {
        pages,
        info: DocumentInfo::default(),
        introspector: typst_library::introspection::Introspector::default(),
    };

    // Export to PDF
    let options = typst_pdf::PdfOptions::default();
    let pdf_bytes = typst_pdf::pdf(&doc, &options)
        .map_err(|e| format!("PDF export failed: {e:?}"))?;

    Ok(pdf_bytes)
}

// ─── Timing Marks ───────────────────────────────────────────────────────────

fn draw_timing_marks(frame: &mut Frame, page_w_in: f64, page_h_in: f64) {
    let (mark_count_x, mark_count_y) = timing_mark_counts(page_w_in, page_h_in);
    let tm_w = inches(TIMING_MARK_W);
    let tm_h = inches(TIMING_MARK_H);
    let mark_shape = make_rect(tm_w, tm_h, Some(black_paint()), None);

    let grid_w = page_w_in - MARGIN_LEFT - MARGIN_RIGHT - TIMING_MARK_W;
    let grid_h = page_h_in - MARGIN_TOP - MARGIN_BOTTOM - TIMING_MARK_H;

    // Top row
    for i in 0..mark_count_x {
        let frac = i as f64 / (mark_count_x - 1) as f64;
        let x = MARGIN_LEFT + frac * grid_w;
        frame.push(
            Point::new(inches(x), inches(MARGIN_TOP)),
            FrameItem::Shape(mark_shape.clone(), typst_syntax::Span::detached()),
        );
    }

    // Bottom row
    let bottom_y = page_h_in - MARGIN_BOTTOM - TIMING_MARK_H;
    for i in 0..mark_count_x {
        let frac = i as f64 / (mark_count_x - 1) as f64;
        let x = MARGIN_LEFT + frac * grid_w;
        frame.push(
            Point::new(inches(x), inches(bottom_y)),
            FrameItem::Shape(mark_shape.clone(), typst_syntax::Span::detached()),
        );
    }

    // Left column
    for j in 0..mark_count_y {
        let frac = j as f64 / (mark_count_y - 1) as f64;
        let y = MARGIN_TOP + frac * grid_h;
        frame.push(
            Point::new(inches(MARGIN_LEFT), inches(y)),
            FrameItem::Shape(mark_shape.clone(), typst_syntax::Span::detached()),
        );
    }

    // Right column
    let right_x = page_w_in - MARGIN_RIGHT - TIMING_MARK_W;
    for j in 0..mark_count_y {
        let frac = j as f64 / (mark_count_y - 1) as f64;
        let y = MARGIN_TOP + frac * grid_h;
        frame.push(
            Point::new(inches(right_x), inches(y)),
            FrameItem::Shape(mark_shape.clone(), typst_syntax::Span::detached()),
        );
    }
}
