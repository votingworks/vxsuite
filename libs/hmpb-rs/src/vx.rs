//! Port of libs/hmpb's VX default ballot template. Units are CSS px (96/in).
use std::sync::Arc;

use serde_json::Value;
use taffy::prelude::*;

use crate::columns::lay_out_in_columns;
use crate::doc::{
    BLACK, Borders, Color, Content, Doc, El, Picture, Svg, Tag, block, draw_shared_rects, flex_col,
    flex_row, pad, strut_below_baseline,
};
use crate::html::{RichTextStyle, decode_entities, rich_text};
use crate::text::{Align, Fonts, TextBlock};

pub const IN: f32 = 96.0;
const REM: f32 = 16.0;
const LIGHT_GRAY: Color = (0xED, 0xED, 0xED);
const DARK_GRAY: Color = (0xDA, 0xDA, 0xDA);
const DARKER_GRAY: Color = (0xB0, 0xB0, 0xB0);
const H1: f32 = 1.4 * REM;
const H2: f32 = 1.2 * REM;
const H3: f32 = 1.1 * REM;

pub struct Assets {
    pub strings: Value,
    pub seal: Option<Arc<usvg::Tree>>,
    pub fill_bubble: Arc<usvg::Tree>,
    pub write_in: Arc<usvg::Tree>,
    pub arrow: Arc<usvg::Tree>,
    pub usvg: Arc<usvg::Options<'static>>,
}

impl Assets {
    fn s(&self, key: &str) -> String {
        decode_entities(self.strings[key].as_str().unwrap_or(key))
    }
}

pub struct Ballot<'a> {
    pub election: &'a Value,
    pub style: &'a Value,
    pub precinct_id: &'a str,
    pub contests: Vec<&'a Value>,
    pub ballot_hash: &'a str,
    /// "precinct" | "absentee" | "provisional"
    pub ballot_type: &'a str,
    /// "official" | "test" | "sample"
    pub ballot_mode: &'a str,
}

impl Ballot<'_> {
    /// Paper (width, height) in inches.
    fn paper(&self) -> (f32, f32) {
        match self.election["ballotLayout"]["paperSize"]
            .as_str()
            .unwrap_or("letter")
        {
            "letter" => (8.5, 11.0),
            "legal" => (8.5, 14.0),
            custom => (
                8.5,
                custom
                    .trim_start_matches("custom-8.5x")
                    .parse()
                    .unwrap_or(11.0),
            ),
        }
    }

    fn party_full_name(&self) -> Option<&str> {
        if self.election["type"] != "primary" {
            return None;
        }
        let party = self.election["parties"]
            .as_array()?
            .iter()
            .find(|p| p["id"] == self.style["partyId"])?;
        party["fullName"].as_str()
    }
}

#[derive(Debug)]
#[allow(dead_code, reason = "fields are reported through Debug")]
pub enum LayoutError {
    ContestTooLong(String),
}

pub struct BubblePos {
    pub page: usize,
    pub id: String,
    pub column: f32,
    pub row: f32,
}

/// A block of plain text, with whitespace collapsed as CSS does.
fn text(s: impl Into<String>, size: f32, bold: bool) -> El {
    let collapsed = s
        .into()
        .split_ascii_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    El::new(block()).content(Content::Text(TextBlock::new(collapsed, size, bold)))
}

fn sized(mut s: Style, w: Option<f32>, h: Option<f32>) -> Style {
    s.size = Size {
        width: w.map_or(auto(), length),
        height: h.map_or(auto(), length),
    };
    s
}

fn bx(style: Style) -> El {
    El::new(style).borders(Borders {
        top: Some((3.0, BLACK)),
        right: Some((1.0, BLACK)),
        bottom: Some((1.0, BLACK)),
        left: Some((1.0, BLACK)),
    })
}

fn election_date(e: &Value) -> String {
    e["ballotStrings"]["en"]["electionDate"]
        .as_str()
        .map(String::from)
        .unwrap_or_else(|| format_date(e["date"].as_str().unwrap()))
}

fn format_date(iso: &str) -> String {
    const MONTHS: [&str; 12] = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    let p: Vec<u32> = iso.split('-').filter_map(|x| x.parse().ok()).collect();
    format!("{} {}, {}", MONTHS[(p[1] - 1) as usize], p[2], p[0])
}

fn precinct_name(b: &Ballot) -> String {
    let p = b.election["precincts"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == b.precinct_id)
        .unwrap();
    let mut districts: Vec<&str> = b.style["districts"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|d| d.as_str())
        .collect();
    districts.sort();
    if let Some(splits) = p["splits"].as_array() {
        for sp in splits {
            let mut ds: Vec<&str> = sp["districtIds"]
                .as_array()
                .unwrap()
                .iter()
                .filter_map(|d| d.as_str())
                .collect();
            ds.sort();
            if ds == districts {
                return sp["name"].as_str().unwrap().to_string();
            }
        }
    }
    p["name"].as_str().unwrap().to_string()
}

fn timing_mark() -> El {
    let mut mark =
        El::new(sized(block(), Some(0.1875 * IN), Some(0.0625 * IN))).tag(Tag::TimingMark);
    // Painted together via `draw_shared_rects`.
    mark.data.hidden = true;
    mark
}

fn aligned_bubble(id: String) -> El {
    let mut s = flex_row(0.0);
    s.align_items = AlignItems::CENTER;
    s.size.height = length(1.2 * REM);
    s.flex_shrink = 0.0;
    let mut bubble = El::new(sized(block(), Some(19.0), Some(13.0)))
        .borders(Borders::all(1.0, BLACK))
        .tag(Tag::Bubble(id));
    bubble.data.radius = 7.0;
    El::new(s).child(bubble)
}

fn contest_header(title: &str, subtitles: impl IntoIterator<Item = String>) -> El {
    let mut s = block();
    s.padding = pad(8.0, 8.0, 8.0, 8.0);
    El::new(s)
        .bg(LIGHT_GRAY)
        .child(text(title, H3, true))
        .children(subtitles.into_iter().map(|t| text(t, REM, false)))
}

fn candidate_contest(a: &Assets, e: &Value, c: &Value) -> El {
    let seats = c["seats"].as_u64().unwrap_or(1);
    let mut ul = El::new(block());
    let parties = e["parties"].as_array().unwrap();
    for (i, cand) in c["candidates"].as_array().unwrap().iter().enumerate() {
        let mut li = block();
        li.padding = pad(6.0, 8.0, 6.0, 8.0);
        let mut li = El::new(li);
        if i != 0 {
            li = li.borders(Borders {
                top: Some((1.0, DARK_GRAY)),
                ..Default::default()
            });
        }
        let party: Vec<&str> = cand["partyIds"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|pid| parties.iter().find(|p| p["id"] == *pid)?["name"].as_str())
            .collect();
        let mut label = El::new(block()).child(text(cand["name"].as_str().unwrap(), REM, true));
        if e["type"] != "primary" && !party.is_empty() {
            label = label.child(text(party.join(", "), REM, false));
        }
        let party_ids: Vec<&str> = cand["partyIds"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|p| p.as_str())
            .collect();
        let id = format!(
            "{}/{}#{}",
            c["id"].as_str().unwrap(),
            cand["id"].as_str().unwrap(),
            party_ids.join(",")
        );
        ul = ul.child(
            li.child(
                El::new(flex_row(8.0))
                    .child(aligned_bubble(id))
                    .child(label),
            ),
        );
    }
    if c["allowWriteIns"].as_bool().unwrap_or(false) {
        for k in 0..seats {
            let mut li = flex_row(8.0);
            li.padding = pad(0.9 * REM, 8.0, 4.0, 8.0);
            let mut grow = block();
            grow.flex_grow = 1.0;
            grow.flex_basis = percent(0.0);
            let line = El::new(sized(block(), None, Some(1.25 * REM))).borders(Borders {
                bottom: Some((1.0, BLACK)),
                ..Default::default()
            });
            let id = format!("{}/write-in-{k}", c["id"].as_str().unwrap());
            ul = ul.child(
                El::new(li)
                    .borders(Borders {
                        top: Some((1.0, DARK_GRAY)),
                        ..Default::default()
                    })
                    .child(aligned_bubble(id))
                    .child(El::new(grow).child(line).child(text(
                        a.s("hmpbWriteIn"),
                        0.8 * REM,
                        false,
                    ))),
            );
        }
    }
    let vote_for = a.s(&format!("hmpbVoteFor{seats}"));
    let term = c["termDescription"].as_str().map(String::from);
    bx(flex_col(0.0))
        .child(contest_header(
            c["title"].as_str().unwrap(),
            [vote_for].into_iter().chain(term),
        ))
        .child(ul)
}

fn measure_contest(a: &Assets, c: &Value) -> El {
    let rt = RichTextStyle {
        font_size: REM,
        table_border: (1.0, DARKER_GRAY),
        table_header_bg: LIGHT_GRAY,
        usvg: a.usvg.clone(),
    };
    let mut desc = flex_col(8.0);
    desc.padding = pad(8.0, 8.0, 8.0, 8.0);
    let mut ul = flex_col(0.0);
    ul.justify_content = JustifyContent::END;
    let mut options = El::new(ul);
    for opt in c["options"].as_array().unwrap() {
        let mut li = block();
        li.padding = pad(6.0, 8.0, 6.0, 8.0);
        let id = format!(
            "{}/{}",
            c["id"].as_str().unwrap(),
            opt["id"].as_str().unwrap()
        );
        options = options.child(
            El::new(li)
                .borders(Borders {
                    top: Some((1.0, LIGHT_GRAY)),
                    ..Default::default()
                })
                .child(El::new(flex_row(8.0)).child(aligned_bubble(id)).child(text(
                    opt["label"].as_str().unwrap(),
                    REM,
                    true,
                ))),
        );
    }
    let mut body = flex_col(4.0);
    body.justify_content = JustifyContent::SPACE_BETWEEN;
    bx(block())
        .child(contest_header(c["title"].as_str().unwrap(), []))
        .child(
            El::new(body)
                .child(El::new(desc).child(rich_text(c["description"].as_str().unwrap_or(""), &rt)))
                .child(options),
        )
}

fn contest(a: &Assets, e: &Value, c: &Value) -> El {
    if c["type"] == "candidate" {
        candidate_contest(a, e, c)
    } else {
        measure_contest(a, c)
    }
}

fn inline_svg(tree: &Arc<usvg::Tree>) -> El {
    El::new(block()).content(Content::Svg(Svg {
        tree: Picture::Svg(tree.clone()),
        inline_gap: strut_below_baseline(REM, 1.2),
        overlay: None,
    }))
}

fn ballot_title_key(b: &Ballot) -> String {
    let capitalize = |s: &str| s[..1].to_uppercase() + &s[1..];
    let ballot_type = if b.ballot_type == "precinct" {
        String::new()
    } else {
        capitalize(b.ballot_type)
    };
    format!("hmpb{}{ballot_type}Ballot", capitalize(b.ballot_mode))
}

fn header(a: &Assets, b: &Ballot) -> El {
    let e = b.election;
    let mut row = flex_row(0.75 * REM);
    row.align_items = AlignItems::CENTER;
    let mut seal = sized(block(), Some(5.0 * REM), Some(5.0 * REM));
    seal.margin.top = length(0.125 * REM);
    seal.flex_shrink = 0.0;
    let seal = match &a.seal {
        Some(t) => El::new(seal).content(Content::Svg(Svg {
            tree: Picture::Svg(t.clone()),
            inline_gap: 0.0,
            overlay: None,
        })),
        None => El::new(seal),
    };
    let juris = format!(
        "{}, {}",
        e["jurisdiction"]["name"].as_str().unwrap(),
        e["state"].as_str().unwrap()
    );
    El::new(row).child(seal).child(
        El::new(block())
            .child(text(a.s(&ballot_title_key(b)), H1, true))
            .children(b.party_full_name().map(|p| text(p, H1, true)))
            .child(text(e["title"].as_str().unwrap(), H2, true))
            .child(text(election_date(e), H2, true))
            .child(text(juris, REM, false)),
    )
}

fn instructions(a: &Assets) -> El {
    let mut g = Style {
        display: Display::Grid,
        ..Default::default()
    };
    g.padding = pad(8.0, 8.0, 8.0, 8.0);
    g.gap = Size {
        width: length(0.75 * REM),
        height: length(0.125 * REM),
    };
    g.grid_template_columns = vec![fr(1.0), length(7.0 * REM), fr(1.9), length(7.5 * REM)];
    let mut centered = block();
    centered.align_self = Some(AlignSelf::CENTER);
    let mut write_in_label = TextBlock::new(a.s("hmpbWriteIn"), 13.0 * 4.0 / 3.0, false);
    write_in_label.line_height = 1.2;
    let write_in = El::new(block()).content(Content::Svg(Svg {
        tree: Picture::Svg(a.write_in.clone()),
        inline_gap: strut_below_baseline(REM, 1.2),
        overlay: Some((65.0, 51.0, write_in_label)),
    }));
    bx(g).bg(LIGHT_GRAY).children([
        El::new(block())
            .child(text(a.s("hmpbInstructions"), H2, true))
            .child(text(a.s("hmpbInstructionsToVoteTitle"), REM, true))
            .child(text(a.s("hmpbInstructionsToVoteText"), REM, false)),
        El::new(centered.clone()).child(inline_svg(&a.fill_bubble)),
        El::new(block())
            .child(text(a.s("hmpbInstructionsWriteInTitle"), REM, true))
            .child(text(a.s("hmpbInstructionsWriteInText"), REM, false)),
        El::new(centered).child(write_in),
    ])
}

fn footer(a: &Assets, b: &Ballot, page: usize, total: Option<usize>) -> El {
    let e = b.election;
    let qr = 0.6 * IN;
    let mut fb = flex_row(0.0);
    fb.padding = pad(4.0, 8.0, 4.0, 8.0);
    fb.flex_grow = 1.0;
    fb.flex_basis = percent(0.0);
    fb.justify_content = JustifyContent::SPACE_BETWEEN;
    fb.align_items = AlignItems::CENTER;
    let mut footer_box = bx(fb).bg(LIGHT_GRAY);
    if let Some(total) = total {
        footer_box = footer_box.child(
            El::new(block())
                .child(text(a.s("hmpbPage"), 0.85 * REM, false))
                .child(text(format!("{page}/{total}"), H1, true)),
        );
        if page == total {
            footer_box = footer_box.child(text(a.s("hmpbVotingComplete"), H3, true).content(
                Content::Text(
                    TextBlock::new(a.s("hmpbVotingComplete"), H3, true).align(Align::Right),
                ),
            ));
        } else {
            let msg = if page % 2 == 1 {
                "hmpbContinueVotingOnBack"
            } else {
                "hmpbContinueVotingOnNextSheet"
            };
            let mut r = flex_row(0.75 * REM);
            r.align_items = AlignItems::CENTER;
            let mut arrow = sized(block(), None, Some(2.0 * REM));
            arrow.flex_shrink = 0.0;
            footer_box = footer_box.child(
                El::new(r)
                    .child(El::new(block()).content(Content::Text(
                        TextBlock::new(a.s(msg), H3, true).align(Align::Right),
                    )))
                    .child(El::new(arrow).content(Content::Svg(Svg {
                        tree: Picture::Svg(a.arrow.clone()),
                        inline_gap: 0.0,
                        overlay: None,
                    }))),
            );
        }
    }
    let mut slot = sized(block(), Some(qr), Some(qr));
    slot.flex_shrink = 0.0;
    // Stand-in for the encoded page metadata: real payloads are base64 of ~18 bytes (24 chars).
    let qr_data = format!(
        "{:0>24}",
        format!("{}{}{}", &b.ballot_hash[..12], b.precinct_id, page)
    )
    .chars()
    .take(24)
    .collect::<String>();
    let qr = if b.ballot_mode == "sample" {
        El::new(slot).borders(Borders::all(1.0, BLACK))
    } else {
        El::new(slot).tag(Tag::QrSlot).content(Content::Qr(qr_data))
    };
    let row = El::new(flex_row(0.75 * REM)).child(qr).child(footer_box);

    let small = 8.0 * 4.0 / 3.0;
    let mut meta = flex_row(0.5 * REM);
    meta.justify_content = JustifyContent::SPACE_BETWEEN;
    meta.align_items = AlignItems::CENTER;
    meta.margin.top = length(0.325 * REM);
    meta.margin.bottom = length(-0.075 * IN);
    let date = election_date(e);
    let left = format!(
        "{} • {}, {} • {}, {}",
        &b.ballot_hash[..7],
        e["title"].as_str().unwrap(),
        date,
        e["jurisdiction"]["name"].as_str().unwrap(),
        e["state"].as_str().unwrap()
    );
    let mut right = precinct_name(b);
    let party = e["parties"]
        .as_array()
        .and_then(|ps| ps.iter().find(|p| p["id"] == b.style["partyId"]));
    if let Some(name) = party.and_then(|p| p["name"].as_str()) {
        right += &format!(" • {name}");
    }
    let languages: std::collections::BTreeSet<&str> = e["ballotStyles"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|s| {
            s["languages"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|l| l.as_str())
        })
        .collect();
    if languages.len() > 1 {
        right += " • English";
    }
    let meta = El::new(meta)
        .child(text(left, small, true))
        .child(text(right, small, true));
    El::new(block()).child(row).child(meta)
}

/// Page frame; `content` goes in the flexible content area (tagged `ContentSlot`).
fn page(a: &Assets, b: &Ballot, page_no: usize, total: Option<usize>, content: El) -> El {
    let (paper_w, paper_h) = b.paper();
    let (w, h) = (paper_w * IN, paper_h * IN);
    let (marks_x, marks_y) = ((paper_w * 4.0) as usize, (paper_h * 4.0) as usize - 3);
    let mut pg = sized(block(), Some(w), Some(h));
    pg.padding = pad(0.16667 * IN, 0.19685 * IN, 0.16667 * IN, 0.19685 * IN);
    let mut full = block();
    full.size.height = percent(1.0);
    let mut grid = flex_col(0.0);
    grid.size = Size {
        width: percent(1.0),
        height: percent(1.0),
    };
    let mut row = flex_row(0.0);
    row.justify_content = JustifyContent::SPACE_BETWEEN;
    let mark_row = || El::new(row.clone()).children((0..marks_x).map(|_| timing_mark()));
    let mark_col = || {
        let mut s = flex_col(0.0);
        s.justify_content = JustifyContent::SPACE_BETWEEN;
        s.flex_shrink = 0.0;
        s.margin = taffy::Rect {
            top: length(-0.0625 * IN),
            bottom: length(-0.0625 * IN),
            left: length(0.0),
            right: length(0.0),
        };
        El::new(s).children((0..marks_y).map(|_| timing_mark()))
    };
    let mut middle = flex_row(0.0);
    middle.flex_grow = 1.0;
    middle.flex_basis = percent(0.0);
    middle.min_size.height = length(0.0);
    let mut frame = flex_col(0.75 * REM);
    frame.flex_grow = 1.0;
    frame.flex_basis = percent(0.0);
    // The frame is exactly the page's inner area: content can never move the footer or timing marks.
    frame.min_size = Size {
        width: length(0.0),
        height: length(0.0),
    };
    frame.padding = pad(0.125 * IN, 0.125 * IN, 0.125 * IN, 0.125 * IN);
    let mut frame = El::new(frame);
    if page_no == 1 {
        frame = frame.child(header(a, b)).child(instructions(a));
    }
    let mut slot = flex_col(0.0);
    slot.flex_grow = 1.0;
    slot.flex_basis = percent(0.0);
    slot.min_size.height = length(0.0);
    frame = frame
        .child(El::new(slot).tag(Tag::ContentSlot).child(content))
        .child(footer(a, b, page_no, total));
    El::new(pg).child(
        El::new(full).child(
            El::new(grid)
                .child(mark_row())
                .child(
                    El::new(middle)
                        .child(mark_col())
                        .child(frame)
                        .child(mark_col()),
                )
                .child(mark_row()),
        ),
    )
}

fn blank_message(a: &Assets) -> El {
    let mut s = flex_row(0.0);
    s.flex_grow = 1.0;
    s.justify_content = JustifyContent::CENTER;
    s.align_items = AlignItems::CENTER;
    El::new(s).child(El::new(block()).content(Content::Text(
        TextBlock::new(a.s("hmpbPageIntentionallyBlank"), H1, true).align(Align::Center),
    )))
}

const GAP: f32 = 0.75 * 16.0;

struct PagePlan {
    sections: Vec<(usize, Vec<Vec<usize>>)>,
}

thread_local!(static SLOTS: std::cell::RefCell<std::collections::HashMap<(usize, String), (f32, f32)>> = Default::default());

fn content_slot_size(fonts: &mut Fonts, a: &Assets, b: &Ballot, page_no: usize) -> (f32, f32) {
    let key = (
        page_no.min(2),
        format!("{}{:?}", precinct_name(b), b.paper()),
    );
    if std::env::var_os("NO_CACHE").is_none() {
        if let Some(v) = SLOTS.with(|s| s.borrow().get(&key).copied()) {
            return v;
        }
    }
    let v = content_slot_size_uncached(fonts, a, b, page_no);
    SLOTS.with(|s| s.borrow_mut().insert(key, v));
    v
}

fn content_slot_size_uncached(
    fonts: &mut Fonts,
    a: &Assets,
    b: &Ballot,
    page_no: usize,
) -> (f32, f32) {
    let mut doc = Doc::new();
    let root = doc.add(page(a, b, page_no, Some(0), El::new(block())));
    doc.compute(fonts, root, None);
    let (_, _, _, w, h) = doc.find(root, &|t| matches!(t, Tag::ContentSlot)).remove(0);
    (w, h)
}

thread_local!(static HEIGHTS: std::cell::RefCell<std::collections::HashMap<(String, u32), f32>> = Default::default());

fn measure_heights(
    fonts: &mut Fonts,
    a: &Assets,
    b: &Ballot,
    idx: &[usize],
    width: f32,
) -> Vec<f32> {
    if std::env::var_os("NO_CACHE").is_none() {
        let key = |i: usize| {
            (
                b.contests[i]["id"].as_str().unwrap().to_string(),
                width.to_bits(),
            )
        };
        let cached: Option<Vec<f32>> = HEIGHTS.with(|h| {
            idx.iter()
                .map(|&i| h.borrow().get(&key(i)).copied())
                .collect()
        });
        if let Some(hs) = cached {
            return hs;
        }
        let hs = measure_heights_uncached(fonts, a, b, idx, width);
        HEIGHTS.with(|h| {
            idx.iter().zip(&hs).for_each(|(&i, &v)| {
                h.borrow_mut().insert(key(i), v);
            })
        });
        return hs;
    }
    measure_heights_uncached(fonts, a, b, idx, width)
}

fn measure_heights_uncached(
    fonts: &mut Fonts,
    a: &Assets,
    b: &Ballot,
    idx: &[usize],
    width: f32,
) -> Vec<f32> {
    let mut doc = Doc::new();
    let wrappers = idx.iter().enumerate().map(|(k, &i)| {
        El::new(sized(block(), Some(width), None))
            .tag(Tag::Measure(k))
            .child(contest(a, b.election, b.contests[i]))
    });
    let root = doc.add(El::new(block()).children(wrappers));
    doc.compute(fonts, root, None);
    let mut hs = vec![0.0; idx.len()];
    for (t, _, _, _, h) in doc.find(root, &|t| matches!(t, Tag::Measure(_))) {
        if let Tag::Measure(k) = t {
            hs[k] = h;
        }
    }
    hs
}

fn paginate(fonts: &mut Fonts, a: &Assets, b: &Ballot) -> Result<Vec<PagePlan>, LayoutError> {
    let mut pages = vec![];
    let candidates: Vec<usize> = (0..b.contests.len())
        .filter(|&i| b.contests[i]["type"] == "candidate")
        .collect();
    let others: Vec<usize> = (0..b.contests.len())
        .filter(|&i| b.contests[i]["type"] != "candidate")
        .collect();
    let mut sections: Vec<Vec<usize>> = [candidates, others]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect();
    while !sections.is_empty() {
        let (w, h) = content_slot_size(fonts, a, b, pages.len() + 1);
        let mut used = 0.0;
        let mut plan = PagePlan { sections: vec![] };
        while !sections.is_empty() && used < h {
            let section = sections.remove(0);
            let ncols = if b.contests[section[0]]["type"] == "candidate" {
                3
            } else {
                2
            };
            let cw = (w - GAP * (ncols - 1) as f32) / ncols as f32;
            let heights = measure_heights(fonts, a, b, &section, cw);
            let layout = lay_out_in_columns(&heights, ncols, h - used, GAP);
            if layout.num_placed < section.len() {
                sections.insert(0, section[layout.num_placed..].to_vec());
            }
            if layout.height == 0.0 || layout.columns.iter().all(|c| c.is_empty()) {
                break;
            }
            used += layout.height + GAP;
            plan.sections.push((
                ncols,
                layout
                    .columns
                    .into_iter()
                    .map(|c| c.into_iter().map(|k| section[k]).collect())
                    .collect(),
            ));
        }
        if plan.sections.is_empty() {
            let contest = &b.contests[sections[0][0]];
            return Err(LayoutError::ContestTooLong(
                contest["id"].as_str().unwrap_or("").to_string(),
            ));
        }
        pages.push(plan);
    }
    Ok(pages)
}

fn page_content(a: &Assets, b: &Ballot, plan: &PagePlan) -> El {
    let mut col = flex_col(GAP);
    col.flex_shrink = 0.0;
    El::new(col)
        .tag(Tag::PageContent)
        .children(plan.sections.iter().map(|(_, cols)| {
            El::new(flex_row(GAP)).children(cols.iter().map(|c| {
                let mut s = flex_col(GAP);
                s.flex_grow = 1.0;
                s.flex_basis = percent(0.0);
                // Keep columns at the width pagination measured them at, even if content is wider.
                s.min_size.width = length(0.0);
                El::new(s).children(c.iter().map(|&i| contest(a, b.election, b.contests[i])))
            }))
        }))
}

/// Renders the ballot as its own PDF; returns PDF bytes and bubble grid positions.
pub fn render(
    fonts: &mut Fonts,
    a: &Assets,
    b: &Ballot,
) -> Result<(Vec<u8>, Vec<BubblePos>), LayoutError> {
    let mut pdf = krilla::Document::new();
    let (_, bubbles) = render_into(fonts, a, b, &mut pdf)?;
    Ok((pdf.finish().unwrap(), bubbles))
}

/// Appends the ballot's pages to `pdf`, so ballots in one document share fonts and repeated graphics.
/// Returns the number of pages added and bubble grid positions.
pub fn render_into(
    fonts: &mut Fonts,
    a: &Assets,
    b: &Ballot,
    pdf: &mut krilla::Document,
) -> Result<(usize, Vec<BubblePos>), LayoutError> {
    let plans = paginate(fonts, a, b)?;
    let total = plans.len();
    let mut pages: Vec<El> = plans
        .iter()
        .enumerate()
        .map(|(i, p)| page(a, b, i + 1, Some(total), page_content(a, b, p)))
        .collect();
    if total % 2 == 1 {
        pages.push(page(a, b, total + 1, None, blank_message(a)));
    }
    let page_count = pages.len();
    let mut bubbles = vec![];
    for (i, el) in pages.into_iter().enumerate() {
        let mut doc = Doc::new();
        let root = doc.add(el);
        doc.compute(fonts, root, None);
        bubbles.extend(bubble_positions(&doc, root, i + 1));
        let content_height = doc
            .find(root, &|t| matches!(t, Tag::PageContent))
            .first()
            .map_or(0.0, |c| c.4);
        let slot_height = content_slot_size(fonts, a, b, i + 1).1;
        assert!(
            content_height <= slot_height + 0.01,
            "page {} content ({content_height:.1}px) exceeds the slot it was paginated into ({slot_height:.1}px)",
            i + 1
        );
        let (paper_w, paper_h) = b.paper();
        let mut p = pdf.start_page_with(
            krilla::page::PageSettings::from_wh(paper_w * 72.0, paper_h * 72.0).unwrap(),
        );
        let mut s = p.surface();
        s.push_transform(&krilla::geom::Transform::from_scale(0.75, 0.75));
        doc.paint(fonts, &mut s, root);
        let marks: Vec<_> = doc
            .find(root, &|t| matches!(t, Tag::TimingMark))
            .into_iter()
            .map(|(_, x, y, w, h)| (x, y, w, h))
            .collect();
        if b.ballot_mode != "sample" {
            draw_shared_rects(&mut s, &marks);
        }
        s.pop();
        s.finish();
        p.finish();
    }
    Ok((page_count, bubbles))
}

/// Mirrors `measureTimingMarkGrid` + `pixelPointToGridPoint`.
fn bubble_positions(doc: &Doc, root: NodeId, page: usize) -> Vec<BubblePos> {
    let marks = doc.find(root, &|t| matches!(t, Tag::TimingMark));
    let min_x = marks.iter().map(|m| m.1).fold(f32::INFINITY, f32::min);
    let min_y = marks.iter().map(|m| m.2).fold(f32::INFINITY, f32::min);
    let max_x = marks.iter().map(|m| m.1).fold(f32::NEG_INFINITY, f32::max);
    let max_y = marks.iter().map(|m| m.2).fold(f32::NEG_INFINITY, f32::max);
    let rows = marks.iter().filter(|m| (m.1 - min_x).abs() < 0.01).count() - 2;
    let cols = marks.iter().filter(|m| (m.2 - min_y).abs() < 0.01).count() - 2;
    let (ox, oy) = (min_x + marks[0].3 / 2.0, min_y + marks[0].4 / 2.0);
    let col_gap = (max_x - min_x) / (cols - 1) as f32;
    let row_gap = (max_y - min_y) / (rows - 1) as f32;
    doc.find(root, &|t| matches!(t, Tag::Bubble(_)))
        .into_iter()
        .map(|(t, x, y, w, h)| {
            let Tag::Bubble(id) = t else { unreachable!() };
            BubblePos {
                page,
                id,
                column: (x + w / 2.0 - ox) / col_gap,
                row: (y + h / 2.0 - oy) / row_gap,
            }
        })
        .collect()
}
