//! Compare full ballot interpretation between `GridStrategy` variants on a
//! corpus of ballot pairs.
//!
//! For each pair of front/back images, runs the full [`ballot_card`]
//! interpretation under all strategies and reports the per-bubble
//! fill-score and match-score deltas, plus aggregate statistics across the
//! corpus.
//!
//! Usage:
//!
//! ```text
//! cargo run --release --example compare-strategies -- \
//!     --election <election.json> \
//!     <path> [path ...]
//! ```
//!
//! Each `<path>` is either a `*-front.{png,jpg,jpeg}` file (its
//! `*-back.*` sibling is paired automatically) or a directory that is
//! recursively scanned for such pairs.

use std::path::{Path, PathBuf};

use ab_glyph::PxScale;
use ballot_interpreter::{
    ballot_card::ballot_scan_bubble_image,
    debug::monospace_font,
    draw_utils::{draw_hollow_rect_mut, draw_line_segment_mut, draw_text_mut, text_size},
    interpret::{
        ballot_card, InterpretedBallotCard, InterpretedBallotPage, Options,
        VerticalStreakDetection, WriteInScoring, DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
        DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
    },
    scoring::{ScoredBubbleMark, UnitIntervalScore},
    timing_marks::{border_finding::GridStrategy, BorderMarks},
};
use clap::Parser;
use color_eyre::eyre::{eyre, Context};
use image::{DynamicImage, GrayImage, Rgb, RgbImage};
use rayon::prelude::*;
use types_rs::{
    election::{ContestId, Election, GridLocation, OptionId},
    geometry::{Point, Rect},
};

/// Default per-bubble Δfill threshold above which a bubble is considered
/// to have diverged between strategies (and is drawn on the diff image).
const DEFAULT_DIFF_THRESHOLD: f32 = 0.01;

const COLOR_FULL: Rgb<u8> = Rgb([0, 180, 0]); // green
const COLOR_CORNERS: Rgb<u8> = Rgb([220, 100, 0]); // orange
const COLOR_SIDES: Rgb<u8> = Rgb([0, 100, 220]); // blue
const COLOR_LINK: Rgb<u8> = Rgb([120, 120, 120]); // mid-gray

#[derive(Parser, Debug)]
#[command(
    about = "Compare FullBorders vs CornersOnly vs ScanDirectionBordersOnly grid strategies on ballot pairs."
)]
struct Args {
    /// Path to an election definition file matching the ballots being compared.
    #[arg(long)]
    election: PathBuf,

    /// Paths to either:
    ///   - a `*-front.{png,jpg,jpeg}` file (its `*-back.*` sibling is paired
    ///     automatically), or
    ///   - a directory to recursively scan for such pairs.
    paths: Vec<PathBuf>,

    /// Process pairs in parallel. `ballot_card()` already parallelizes
    /// internally; enabling this on a multi-core box trades CPU for wall
    /// clock when many pairs need to be compared.
    #[arg(long)]
    parallel: bool,

    /// If set, write a diff image for every pair where strategies disagree
    /// on at least one bubble. One PNG per side is emitted under the given
    /// directory, named `<stem>-strategy-diff.png` (where `<stem>` is the
    /// per-side input filename stem). The directory is created if missing.
    #[arg(long)]
    output_dir: Option<PathBuf>,

    /// Per-bubble `Δfill_score` threshold for considering a bubble to have
    /// diverged between strategies. Bubbles below this are treated as
    /// matching and are not drawn on the diff image.
    #[arg(long, default_value_t = DEFAULT_DIFF_THRESHOLD)]
    threshold: f32,

    /// Print per-ballot details about full-borders vs sides-only
    /// disagreements: each side's four corner positions under both
    /// strategies, and a list of the diverging bubbles with their grid
    /// location, contest/option IDs, scores, and matched-bounds.
    #[arg(long)]
    dump_divergences: bool,

    /// Maximum number of diverging bubbles to print per ballot side
    /// when `--dump-divergences` is set. Bubbles are ranked by
    /// `max(|Δfill|, |Δmatch|)` descending. Use 0 for unlimited.
    #[arg(long, default_value_t = 10)]
    dump_top: usize,
}

fn main() -> color_eyre::Result<()> {
    color_eyre::install()?;
    let args = Args::parse();

    let election = load_election(&args.election)
        .with_context(|| format!("loading election from {}", args.election.display()))?;

    let mut pairs: Vec<BallotPair> = vec![];
    for path in &args.paths {
        collect_pairs(path, &mut pairs)?;
    }
    pairs.sort_by(|a, b| a.front.cmp(&b.front));

    if pairs.is_empty() {
        return Err(eyre!("no ballot pairs found under the given paths"));
    }

    eprintln!("Comparing {} ballot pair(s)...", pairs.len());

    if let Some(dir) = &args.output_dir {
        std::fs::create_dir_all(dir)
            .with_context(|| format!("creating output dir {}", dir.display()))?;
    }

    let process = |pair: &BallotPair| {
        let outcome = run_pair(
            &election,
            pair,
            args.output_dir.as_deref(),
            args.threshold,
            args.dump_divergences,
        );
        (pair.clone(), outcome)
    };
    let outcomes: Vec<(BallotPair, Outcome)> = if args.parallel {
        pairs.par_iter().map(process).collect()
    } else {
        pairs.iter().map(process).collect()
    };

    for (pair, outcome) in &outcomes {
        print_outcome(pair, outcome, args.dump_divergences, args.dump_top);
    }
    println!();
    print_summary(&outcomes);

    Ok(())
}

fn load_election(path: &Path) -> color_eyre::Result<Election> {
    let file = std::fs::File::open(path)?;
    let reader = std::io::BufReader::new(file);
    Ok(serde_json::from_reader(reader)?)
}

#[derive(Debug, Clone)]
struct BallotPair {
    front: PathBuf,
    back: PathBuf,
}

fn collect_pairs(path: &Path, out: &mut Vec<BallotPair>) -> color_eyre::Result<()> {
    if path.is_dir() {
        for entry in std::fs::read_dir(path)? {
            collect_pairs(&entry?.path(), out)?;
        }
    } else if path.is_file() {
        if let Some(pair) = pair_for_front(path) {
            out.push(pair);
        }
    }
    Ok(())
}

/// If `path` is a `*-front.{png,jpg,jpeg}` whose `*-back.*` sibling exists,
/// returns the pair; otherwise returns `None` (which silently skips other
/// files when recursing).
fn pair_for_front(path: &Path) -> Option<BallotPair> {
    let stem = path.file_name()?.to_str()?;
    let ext = path.extension()?.to_str()?;
    if !matches!(ext.to_ascii_lowercase().as_str(), "png" | "jpg" | "jpeg") {
        return None;
    }
    let base = stem.strip_suffix(&format!("-front.{ext}"))?;
    let back_name = format!("{base}-back.{ext}");
    let back = path.with_file_name(back_name);
    if !back.is_file() {
        return None;
    }
    Some(BallotPair {
        front: path.to_path_buf(),
        back,
    })
}

#[derive(Debug)]
enum Outcome {
    Compared(PairStats),
    LoadFailed(String),
    Failed {
        full: Option<String>,
        corners: Option<String>,
        sides: Option<String>,
    },
}

#[derive(Debug)]
struct PairStats {
    /// Total bubbles compared across both sides.
    n_bubbles: usize,
    /// How many bubbles diverged between strategies — either by
    /// presence mismatch or by `|Δ fill_score| >= threshold`. This is
    /// also the count of bubbles drawn on the diff image.
    diverged_bubbles: usize,
    /// How many bubbles were scored under some strategies but not all.
    presence_mismatch: usize,
    /// Largest `|Δ fill_score|` across all bubbles where all strategies
    /// produced a score.
    max_fill_delta: f32,
    /// Largest `|Δ match_score|`.
    max_match_delta: f32,
    /// Mean `|Δ fill_score|` across paired bubbles.
    mean_fill_delta: f32,
    /// Per-pair divergence counts. A bubble counts as diverged for a
    /// pair if `|Δfill_score| >= threshold`, `|Δmatch_score| >= threshold`,
    /// or one strategy in the pair scored the bubble and the other did
    /// not (presence mismatch within the pair).
    diverged_full_vs_corners: usize,
    diverged_full_vs_sides: usize,
    diverged_corners_vs_sides: usize,
    /// Per-pair max `|Δfill_score|` across bubbles where both strategies
    /// in the pair produced a score.
    max_fill_full_vs_corners: f32,
    max_fill_full_vs_sides: f32,
    max_fill_corners_vs_sides: f32,
    /// Per-pair max `|Δmatch_score|`.
    max_match_full_vs_corners: f32,
    max_match_full_vs_sides: f32,
    max_match_corners_vs_sides: f32,
    /// Detailed per-bubble divergence records for full-borders vs
    /// sides-only, populated only when `--dump-divergences` is set.
    /// One vec per side (front, back).
    full_vs_sides_divergences: [Vec<BubbleDivergence>; 2],
    /// Per-side timing-mark corner positions under each strategy,
    /// populated only when `--dump-divergences` is set. (front, back).
    corner_snapshots: [Option<CornerSnapshot>; 2],
}

#[derive(Debug, Clone)]
struct BubbleDivergence {
    location: GridLocation,
    contest_id: ContestId,
    option_id: OptionId,
    full: Option<MarkSnapshot>,
    sides: Option<MarkSnapshot>,
    /// `max(|Δfill|, |Δmatch|)` if both scored; `f32::INFINITY` for
    /// presence mismatch (so it sorts to the top).
    max_delta: f32,
}

#[derive(Debug, Clone, Copy)]
struct MarkSnapshot {
    fill_score: f32,
    match_score: f32,
    matched_bounds: Rect,
    expected_bounds: Rect,
}

#[derive(Debug, Clone)]
struct CornerSnapshot {
    full: PageCorners,
    sides: PageCorners,
    /// Left-border timing-mark centers (one per row), as detected by
    /// FullBorders. Empty if FullBorders did not record per-border marks
    /// (e.g., when a different variant of `BorderMarks` was produced).
    full_left_marks: Vec<(f32, f32)>,
    full_right_marks: Vec<(f32, f32)>,
    sides_left_marks: Vec<(f32, f32)>,
    sides_right_marks: Vec<(f32, f32)>,
}

#[derive(Debug, Clone, Copy)]
struct PageCorners {
    top_left: Point<f32>,
    top_right: Point<f32>,
    bottom_left: Point<f32>,
    bottom_right: Point<f32>,
}

#[derive(Debug, Clone, Copy)]
struct PairMetrics {
    diverged: bool,
    /// `Some` when both strategies in the pair scored the bubble.
    fill_delta: Option<f32>,
    match_delta: Option<f32>,
}

fn pair_metrics(
    a: Option<&ScoredBubbleMark>,
    b: Option<&ScoredBubbleMark>,
    threshold: f32,
) -> PairMetrics {
    match (a, b) {
        (Some(a), Some(b)) => {
            let fd = (a.fill_score.0 - b.fill_score.0).abs();
            let md = (a.match_score.0 - b.match_score.0).abs();
            PairMetrics {
                diverged: fd >= threshold || md >= threshold,
                fill_delta: Some(fd),
                match_delta: Some(md),
            }
        }
        (None, None) => PairMetrics {
            diverged: false,
            fill_delta: None,
            match_delta: None,
        },
        _ => PairMetrics {
            diverged: true,
            fill_delta: None,
            match_delta: None,
        },
    }
}

fn run_pair(
    election: &Election,
    pair: &BallotPair,
    output_dir: Option<&Path>,
    threshold: f32,
    collect_divergences: bool,
) -> Outcome {
    let front = match load_image(&pair.front) {
        Ok(img) => img,
        Err(e) => return Outcome::LoadFailed(format!("front: {e}")),
    };
    let back = match load_image(&pair.back) {
        Ok(img) => img,
        Err(e) => return Outcome::LoadFailed(format!("back: {e}")),
    };

    let full = ballot_card(
        front.clone(),
        back.clone(),
        &options(election, GridStrategy::FullBorders),
    );
    let corners = ballot_card(
        front.clone(),
        back.clone(),
        &options(election, GridStrategy::CornersOnly),
    );
    let sides = ballot_card(
        front,
        back,
        &options(election, GridStrategy::ScanDirectionBordersOnly),
    );

    match (full, corners, sides) {
        (Ok(f), Ok(c), Ok(s)) => {
            let stats = compare_interpretations(&f, &c, &s, threshold, collect_divergences);
            if let Some(dir) = output_dir {
                if stats.diverged_bubbles > 0 {
                    if let Err(e) = write_diff_images(dir, pair, &f, &c, &s, threshold) {
                        eprintln!(
                            "warning: failed to write diff image for {}: {e}",
                            short_label(&pair.front),
                        );
                    }
                }
            }
            Outcome::Compared(stats)
        }
        (full, corners, sides) => Outcome::Failed {
            full: full.err().map(|e| e.to_string()),
            corners: corners.err().map(|e| e.to_string()),
            sides: sides.err().map(|e| e.to_string()),
        },
    }
}

fn write_diff_images(
    output_dir: &Path,
    pair: &BallotPair,
    full: &InterpretedBallotCard,
    corners: &InterpretedBallotCard,
    sides: &InterpretedBallotCard,
    threshold: f32,
) -> color_eyre::Result<()> {
    write_diff_image_for_side(
        output_dir,
        &pair.front,
        &full.front,
        &corners.front,
        &sides.front,
        threshold,
    )?;
    write_diff_image_for_side(
        output_dir,
        &pair.back,
        &full.back,
        &corners.back,
        &sides.back,
        threshold,
    )?;
    Ok(())
}

/// Renders a side-of-ballot diff image. Background is the normalized
/// image; on top, for each bubble whose fill or match score diverges
/// between any pair of strategies by at least `threshold`, draws all
/// three strategies' `matched_bounds` rectangles and a small label with
/// their fill scores. Bubbles where all strategies agree are not drawn,
/// so the surviving annotations are exactly the divergences.
fn write_diff_image_for_side(
    output_dir: &Path,
    input_path: &Path,
    full_page: &InterpretedBallotPage,
    corners_page: &InterpretedBallotPage,
    sides_page: &InterpretedBallotPage,
    threshold: f32,
) -> color_eyre::Result<()> {
    let mut canvas: RgbImage =
        DynamicImage::ImageLuma8(full_page.normalized_image.clone()).to_rgb8();

    let font = monospace_font();
    let scale = PxScale::from(14.0);

    for (((_, full_mark), (_, corners_mark)), (_, sides_mark)) in full_page
        .marks
        .iter()
        .zip(corners_page.marks.iter())
        .zip(sides_page.marks.iter())
    {
        match (full_mark, corners_mark, sides_mark) {
            (Some(f), Some(c), Some(s)) => {
                let max_fill_delta = (f.fill_score.0 - c.fill_score.0)
                    .abs()
                    .max((f.fill_score.0 - s.fill_score.0).abs())
                    .max((c.fill_score.0 - s.fill_score.0).abs());
                let max_match_delta = (f.match_score.0 - c.match_score.0)
                    .abs()
                    .max((f.match_score.0 - s.match_score.0).abs())
                    .max((c.match_score.0 - s.match_score.0).abs());
                if max_fill_delta < threshold && max_match_delta < threshold {
                    continue;
                }
                draw_bubble_diff(&mut canvas, f, c, s, &font, scale);
            }
            // Presence mismatch: draw whichever bounds we have in their
            // own color so it's visually obvious which are missing.
            (f, c, s) => {
                if let Some(f) = f {
                    draw_one_sided(&mut canvas, &f.matched_bounds, COLOR_FULL);
                }
                if let Some(c) = c {
                    draw_one_sided(&mut canvas, &c.matched_bounds, COLOR_CORNERS);
                }
                if let Some(s) = s {
                    draw_one_sided(&mut canvas, &s.matched_bounds, COLOR_SIDES);
                }
            }
        }
    }

    let stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("ballot");
    let out_path = output_dir.join(format!("{stem}-strategy-diff.png"));
    canvas
        .save(&out_path)
        .with_context(|| format!("saving {}", out_path.display()))?;
    Ok(())
}

fn draw_bubble_diff(
    canvas: &mut RgbImage,
    full: &ScoredBubbleMark,
    corners: &ScoredBubbleMark,
    sides: &ScoredBubbleMark,
    font: &impl ab_glyph::Font,
    scale: PxScale,
) {
    draw_hollow_rect_mut(canvas, full.matched_bounds, COLOR_FULL);
    draw_hollow_rect_mut(canvas, corners.matched_bounds, COLOR_CORNERS);
    draw_hollow_rect_mut(canvas, sides.matched_bounds, COLOR_SIDES);

    // Connect all centers with thin lines so it's clear they represent
    // the same logical bubble.
    let f_center = full.matched_bounds.center();
    let c_center = corners.matched_bounds.center();
    let s_center = sides.matched_bounds.center();
    for (a, b) in [
        (f_center, c_center),
        (f_center, s_center),
        (c_center, s_center),
    ] {
        if a != b {
            draw_line_segment_mut(canvas, (a.x, a.y), (b.x, b.y), COLOR_LINK);
        }
    }

    // Three-line label, anchored just to the right of the widest bounding
    // box. F (full-borders) in green, C (corners-only) in orange,
    // S (sides-only) in blue.
    let label_x = full
        .matched_bounds
        .right()
        .max(corners.matched_bounds.right())
        .max(sides.matched_bounds.right())
        + 4;
    let label_y = full
        .matched_bounds
        .top()
        .min(corners.matched_bounds.top())
        .min(sides.matched_bounds.top());

    let f_text = format_score("F", full.fill_score, full.match_score);
    let c_text = format_score("C", corners.fill_score, corners.match_score);
    let s_text = format_score("S", sides.fill_score, sides.match_score);

    let (_, line_h) = text_size(scale, font, &f_text);
    let line_h: i32 = i32::try_from(line_h).unwrap_or(i32::MAX);
    draw_text_mut(canvas, COLOR_FULL, label_x, label_y, scale, font, &f_text);
    draw_text_mut(
        canvas,
        COLOR_CORNERS,
        label_x,
        label_y + line_h + 1,
        scale,
        font,
        &c_text,
    );
    draw_text_mut(
        canvas,
        COLOR_SIDES,
        label_x,
        label_y + (line_h + 1) * 2,
        scale,
        font,
        &s_text,
    );
}

fn draw_one_sided(canvas: &mut RgbImage, bounds: &Rect, color: Rgb<u8>) {
    draw_hollow_rect_mut(canvas, *bounds, color);
}

fn format_score(prefix: &str, fill: UnitIntervalScore, match_score: UnitIntervalScore) -> String {
    format!("{prefix} f={:.3} m={:.3}", fill.0, match_score.0,)
}

fn load_image(path: &Path) -> Result<GrayImage, image::ImageError> {
    image::open(path).map(|img| img.to_luma8())
}

fn options(election: &Election, strategy: GridStrategy) -> Options {
    Options {
        election: election.clone(),
        bubble_template: ballot_scan_bubble_image(),
        debug_side_a_base: None,
        debug_side_b_base: None,
        write_in_scoring: WriteInScoring::Disabled,
        vertical_streak_detection: VerticalStreakDetection::Enabled,
        minimum_detected_scale: None,
        max_cumulative_streak_width: DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
        retry_streak_width_threshold: DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
        grid_strategy: strategy,
    }
}

#[allow(clippy::similar_names, clippy::too_many_lines)]
fn compare_interpretations(
    full: &InterpretedBallotCard,
    corners: &InterpretedBallotCard,
    sides: &InterpretedBallotCard,
    threshold: f32,
    collect_divergences: bool,
) -> PairStats {
    let mut max_fill = 0.0f32;
    let mut max_match = 0.0f32;
    let mut sum_fill = 0.0f32;
    let mut paired = 0usize;
    let mut presence_mismatch = 0usize;
    let mut diverged_bubbles = 0usize;
    let mut n_bubbles = 0usize;

    let mut div_fc = 0usize;
    let mut div_fs = 0usize;
    let mut div_cs = 0usize;
    let mut max_fill_fc = 0.0f32;
    let mut max_fill_fs = 0.0f32;
    let mut max_fill_cs = 0.0f32;
    let mut max_match_fc = 0.0f32;
    let mut max_match_fs = 0.0f32;
    let mut max_match_cs = 0.0f32;

    let mut fs_divergences_per_side: [Vec<BubbleDivergence>; 2] = [vec![], vec![]];
    let mut corner_snapshots: [Option<CornerSnapshot>; 2] = [None, None];

    for (side_index, (f_page, c_page, s_page)) in [
        (&full.front, &corners.front, &sides.front),
        (&full.back, &corners.back, &sides.back),
    ]
    .into_iter()
    .enumerate()
    {
        if collect_divergences {
            let (f_left, f_right) = side_border_marks(f_page);
            let (s_left, s_right) = side_border_marks(s_page);
            corner_snapshots[side_index] = Some(CornerSnapshot {
                full: page_corners(f_page),
                sides: page_corners(s_page),
                full_left_marks: f_left,
                full_right_marks: f_right,
                sides_left_marks: s_left,
                sides_right_marks: s_right,
            });
        }
        // All strategies use the same election/grid layout, so the
        // emitted bubble sequences should align position-for-position.
        if f_page.marks.len() != c_page.marks.len() || c_page.marks.len() != s_page.marks.len() {
            // Length mismatch is itself a divergence; record it as a
            // presence mismatch on every position past the shared prefix.
            let min_len = f_page
                .marks
                .len()
                .min(c_page.marks.len())
                .min(s_page.marks.len());
            let max_len = f_page
                .marks
                .len()
                .max(c_page.marks.len())
                .max(s_page.marks.len());
            let extra = max_len - min_len;
            presence_mismatch += extra;
            diverged_bubbles += extra;
            // Per-pair length mismatches: an "extra" position past the
            // shorter of the two contributes to that pair's divergence.
            div_fc += pair_length_mismatch(f_page.marks.len(), c_page.marks.len());
            div_fs += pair_length_mismatch(f_page.marks.len(), s_page.marks.len());
            div_cs += pair_length_mismatch(c_page.marks.len(), s_page.marks.len());
        }
        for (((f_pos, f_mark), (c_pos, c_mark)), (s_pos, s_mark)) in f_page
            .marks
            .iter()
            .zip(c_page.marks.iter())
            .zip(s_page.marks.iter())
        {
            n_bubbles += 1;
            debug_assert_eq!(
                f_pos.location(),
                c_pos.location(),
                "bubble ordering diverged between strategies",
            );
            debug_assert_eq!(
                f_pos.location(),
                s_pos.location(),
                "bubble ordering diverged between strategies",
            );

            let fc = pair_metrics(f_mark.as_ref(), c_mark.as_ref(), threshold);
            let fs = pair_metrics(f_mark.as_ref(), s_mark.as_ref(), threshold);
            let cs = pair_metrics(c_mark.as_ref(), s_mark.as_ref(), threshold);

            if fc.diverged {
                div_fc += 1;
            }
            if fs.diverged {
                div_fs += 1;
            }
            if cs.diverged {
                div_cs += 1;
            }

            if collect_divergences && fs.diverged {
                let max_delta = match (fs.fill_delta, fs.match_delta) {
                    (Some(fd), Some(md)) => fd.max(md),
                    _ => f32::INFINITY, // presence mismatch: rank to top
                };
                fs_divergences_per_side[side_index].push(BubbleDivergence {
                    location: f_pos.location(),
                    contest_id: f_pos.contest_id(),
                    option_id: f_pos.option_id(),
                    full: f_mark.as_ref().map(snapshot_mark),
                    sides: s_mark.as_ref().map(snapshot_mark),
                    max_delta,
                });
            }
            if let Some(d) = fc.fill_delta {
                max_fill_fc = max_fill_fc.max(d);
            }
            if let Some(d) = fs.fill_delta {
                max_fill_fs = max_fill_fs.max(d);
            }
            if let Some(d) = cs.fill_delta {
                max_fill_cs = max_fill_cs.max(d);
            }
            if let Some(d) = fc.match_delta {
                max_match_fc = max_match_fc.max(d);
            }
            if let Some(d) = fs.match_delta {
                max_match_fs = max_match_fs.max(d);
            }
            if let Some(d) = cs.match_delta {
                max_match_cs = max_match_cs.max(d);
            }

            match (f_mark, c_mark, s_mark) {
                (Some(_), Some(_), Some(_)) => {
                    let fd = fc
                        .fill_delta
                        .unwrap_or(0.0)
                        .max(fs.fill_delta.unwrap_or(0.0))
                        .max(cs.fill_delta.unwrap_or(0.0));
                    let md = fc
                        .match_delta
                        .unwrap_or(0.0)
                        .max(fs.match_delta.unwrap_or(0.0))
                        .max(cs.match_delta.unwrap_or(0.0));
                    max_fill = max_fill.max(fd);
                    max_match = max_match.max(md);
                    sum_fill += fd;
                    paired += 1;
                    if fd >= threshold || md >= threshold {
                        diverged_bubbles += 1;
                    }
                }
                (None, None, None) => {}
                _ => {
                    presence_mismatch += 1;
                    diverged_bubbles += 1;
                }
            }
        }
    }

    PairStats {
        n_bubbles,
        diverged_bubbles,
        presence_mismatch,
        max_fill_delta: max_fill,
        max_match_delta: max_match,
        mean_fill_delta: if paired == 0 {
            0.0
        } else {
            #[allow(clippy::cast_precision_loss)]
            let n = paired as f32;
            sum_fill / n
        },
        diverged_full_vs_corners: div_fc,
        diverged_full_vs_sides: div_fs,
        diverged_corners_vs_sides: div_cs,
        max_fill_full_vs_corners: max_fill_fc,
        max_fill_full_vs_sides: max_fill_fs,
        max_fill_corners_vs_sides: max_fill_cs,
        max_match_full_vs_corners: max_match_fc,
        max_match_full_vs_sides: max_match_fs,
        max_match_corners_vs_sides: max_match_cs,
        full_vs_sides_divergences: fs_divergences_per_side,
        corner_snapshots,
    }
}

/// Number of "extra" bubble positions one side of a pair has past the
/// length of the other — i.e., `|len(a) - len(b)|`. Each such position
/// is a presence mismatch within the pair and counts as a divergence.
fn pair_length_mismatch(a: usize, b: usize) -> usize {
    a.max(b) - a.min(b)
}

fn snapshot_mark(m: &ScoredBubbleMark) -> MarkSnapshot {
    MarkSnapshot {
        fill_score: m.fill_score.0,
        match_score: m.match_score.0,
        matched_bounds: m.matched_bounds,
        expected_bounds: m.expected_bounds,
    }
}

fn page_corners(page: &InterpretedBallotPage) -> PageCorners {
    PageCorners {
        top_left: page.timing_marks.top_left_corner,
        top_right: page.timing_marks.top_right_corner,
        bottom_left: page.timing_marks.bottom_left_corner,
        bottom_right: page.timing_marks.bottom_right_corner,
    }
}

fn side_border_marks(page: &InterpretedBallotPage) -> (Vec<(f32, f32)>, Vec<(f32, f32)>) {
    let collect = |marks: &[ballot_interpreter::timing_marks::scoring::CandidateTimingMark]| {
        marks
            .iter()
            .map(|m| {
                let c = m.rect().center();
                (c.x, c.y)
            })
            .collect::<Vec<_>>()
    };
    match &page.timing_marks.border_marks {
        BorderMarks::Full { left, right, .. } => (collect(left), collect(right)),
        BorderMarks::ScanDirectionBordersOnly { left, right } => (collect(left), collect(right)),
        BorderMarks::CornersOnly => (vec![], vec![]),
    }
}

fn print_outcome(pair: &BallotPair, outcome: &Outcome, dump_divergences: bool, dump_top: usize) {
    let label = short_label(&pair.front);
    match outcome {
        Outcome::Compared(s) => {
            let flag = if s.diverged_bubbles == 0 {
                "OK"
            } else {
                "DIFF"
            };
            println!(
                "{flag:>4} {label}  diverged={}/{}  Δfill max={:.4} mean={:.4}  Δmatch max={:.4}  presence-mismatch={}",
                s.diverged_bubbles,
                s.n_bubbles,
                s.max_fill_delta,
                s.mean_fill_delta,
                s.max_match_delta,
                s.presence_mismatch,
            );
            if dump_divergences && s.diverged_full_vs_sides > 0 {
                print_full_vs_sides_details(pair, s, dump_top);
            }
        }
        Outcome::LoadFailed(e) => println!("LOAD {label}: {e}"),
        Outcome::Failed {
            full,
            corners,
            sides,
        } => {
            let failed: Vec<&str> = [
                full.as_ref().map(|_| "full"),
                corners.as_ref().map(|_| "corners"),
                sides.as_ref().map(|_| "sides"),
            ]
            .into_iter()
            .flatten()
            .collect();
            let errors: Vec<String> = [
                full.as_ref().map(|e| format!("full: {e}")),
                corners.as_ref().map(|e| format!("corners: {e}")),
                sides.as_ref().map(|e| format!("sides: {e}")),
            ]
            .into_iter()
            .flatten()
            .collect();
            println!(
                "FAIL {label}: {} failed: {}",
                failed.join("+"),
                errors.join(" | "),
            );
        }
    }
}

#[allow(clippy::similar_names, clippy::too_many_lines)]
fn print_summary(outcomes: &[(BallotPair, Outcome)]) {
    let total = outcomes.len();
    let mut compared = 0usize;
    let mut load_failed = 0usize;
    let mut full_failed = 0usize;
    let mut corners_failed = 0usize;
    let mut sides_failed = 0usize;
    let mut all_failed = 0usize;
    let mut max_fills: Vec<f32> = vec![];
    let mut max_matches: Vec<f32> = vec![];
    let mut presence_mismatches = 0usize;
    let mut total_bubbles = 0usize;
    let mut total_diverged = 0usize;
    let mut pairs_with_diff = 0usize;

    let mut total_div_fc = 0usize;
    let mut total_div_fs = 0usize;
    let mut total_div_cs = 0usize;
    let mut pairs_with_diff_fc = 0usize;
    let mut pairs_with_diff_fs = 0usize;
    let mut pairs_with_diff_cs = 0usize;
    let mut overall_max_fill_fc = 0.0f32;
    let mut overall_max_fill_fs = 0.0f32;
    let mut overall_max_fill_cs = 0.0f32;
    let mut overall_max_match_fc = 0.0f32;
    let mut overall_max_match_fs = 0.0f32;
    let mut overall_max_match_cs = 0.0f32;

    for (_, o) in outcomes {
        match o {
            Outcome::Compared(s) => {
                compared += 1;
                max_fills.push(s.max_fill_delta);
                max_matches.push(s.max_match_delta);
                if s.presence_mismatch > 0 {
                    presence_mismatches += 1;
                }
                total_bubbles += s.n_bubbles;
                total_diverged += s.diverged_bubbles;
                if s.diverged_bubbles > 0 {
                    pairs_with_diff += 1;
                }

                total_div_fc += s.diverged_full_vs_corners;
                total_div_fs += s.diverged_full_vs_sides;
                total_div_cs += s.diverged_corners_vs_sides;
                if s.diverged_full_vs_corners > 0 {
                    pairs_with_diff_fc += 1;
                }
                if s.diverged_full_vs_sides > 0 {
                    pairs_with_diff_fs += 1;
                }
                if s.diverged_corners_vs_sides > 0 {
                    pairs_with_diff_cs += 1;
                }
                overall_max_fill_fc = overall_max_fill_fc.max(s.max_fill_full_vs_corners);
                overall_max_fill_fs = overall_max_fill_fs.max(s.max_fill_full_vs_sides);
                overall_max_fill_cs = overall_max_fill_cs.max(s.max_fill_corners_vs_sides);
                overall_max_match_fc = overall_max_match_fc.max(s.max_match_full_vs_corners);
                overall_max_match_fs = overall_max_match_fs.max(s.max_match_full_vs_sides);
                overall_max_match_cs = overall_max_match_cs.max(s.max_match_corners_vs_sides);
            }
            Outcome::LoadFailed(_) => load_failed += 1,
            Outcome::Failed {
                full,
                corners,
                sides,
            } => {
                if full.is_some() {
                    full_failed += 1;
                }
                if corners.is_some() {
                    corners_failed += 1;
                }
                if sides.is_some() {
                    sides_failed += 1;
                }
                if full.is_some() && corners.is_some() && sides.is_some() {
                    all_failed += 1;
                }
            }
        }
    }

    let bubble_diff_pct = if total_bubbles == 0 {
        0.0
    } else {
        #[allow(clippy::cast_precision_loss)]
        let n = total_bubbles as f32;
        #[allow(clippy::cast_precision_loss)]
        let d = total_diverged as f32;
        100.0 * d / n
    };

    println!("=== Summary ===");
    println!("  total pairs:                    {total}");
    println!("  all strategies succeeded:       {compared}");
    println!("  full-borders failed:            {full_failed}");
    println!("  corners-only failed:            {corners_failed}");
    println!("  sides-only failed:              {sides_failed}");
    println!("  all strategies failed:          {all_failed}");
    println!("  load failed:                    {load_failed}");
    println!("  pairs with presence mismatches: {presence_mismatches}");
    println!("  pairs with any divergence:      {pairs_with_diff} / {compared}");
    println!(
        "  bubble-position differences:    {total_diverged} / {total_bubbles} ({bubble_diff_pct:.2}%)",
    );

    if compared > 0 {
        println!();
        println!("Pairwise disagreements (bubble-level / pair-level):");
        print_pairwise_row(
            "full-borders vs sides-only      ",
            total_div_fs,
            total_bubbles,
            pairs_with_diff_fs,
            compared,
            overall_max_fill_fs,
            overall_max_match_fs,
        );
        print_pairwise_row(
            "full-borders vs corners-only    ",
            total_div_fc,
            total_bubbles,
            pairs_with_diff_fc,
            compared,
            overall_max_fill_fc,
            overall_max_match_fc,
        );
        print_pairwise_row(
            "corners-only vs sides-only      ",
            total_div_cs,
            total_bubbles,
            pairs_with_diff_cs,
            compared,
            overall_max_fill_cs,
            overall_max_match_cs,
        );
    }

    if !max_fills.is_empty() {
        max_fills.sort_by(f32::total_cmp);
        max_matches.sort_by(f32::total_cmp);
        let max_fill_overall = *max_fills.last().expect("non-empty (just checked)");
        let max_match_overall = *max_matches.last().expect("non-empty (just checked)");
        println!();
        println!("Across compared pairs (max-per-pair distribution):");
        println!(
            "  Δfill_score:  p50={:.4}  p90={:.4}  p99={:.4}  max={:.4}",
            percentile(&max_fills, 0.50),
            percentile(&max_fills, 0.90),
            percentile(&max_fills, 0.99),
            max_fill_overall,
        );
        println!(
            "  Δmatch_score: p50={:.4}  p90={:.4}  p99={:.4}  max={:.4}",
            percentile(&max_matches, 0.50),
            percentile(&max_matches, 0.90),
            percentile(&max_matches, 0.99),
            max_match_overall,
        );
    }
}

fn print_full_vs_sides_details(pair: &BallotPair, stats: &PairStats, dump_top: usize) {
    let side_paths = [&pair.front, &pair.back];
    let side_names = ["front", "back"];
    for side_index in 0..2 {
        let path = side_paths[side_index];
        let side_name = side_names[side_index];
        let divergences = &stats.full_vs_sides_divergences[side_index];
        let snapshot = stats.corner_snapshots[side_index].as_ref();

        // Skip sides where nothing diverged.
        if divergences.is_empty() && snapshot.is_none() {
            continue;
        }

        println!("    {} ({}):", side_name, short_label(path));

        if let Some(corners) = snapshot {
            print_corner_block(corners);
            print_border_mark_diffs(corners);
        }

        if divergences.is_empty() {
            continue;
        }

        // Sort divergences by max delta descending; INFINITY (presence
        // mismatch) bubbles sort to the top.
        let mut sorted: Vec<&BubbleDivergence> = divergences.iter().collect();
        sorted.sort_by(|a, b| b.max_delta.total_cmp(&a.max_delta));

        let limit = if dump_top == 0 {
            sorted.len()
        } else {
            sorted.len().min(dump_top)
        };
        println!(
            "      diverging bubbles ({} shown of {}):",
            limit,
            sorted.len(),
        );
        println!(
            "        {:>3} {:>5} {:>5}  {:<28}  {:<14}  {:>9} {:>9} {:>13} {:>13}  {:>9} {:>9} {:>13} {:>13}  {:>8} {:>8}",
            "col",
            "row",
            "side",
            "contest_id",
            "option_id",
            "F_fill",
            "F_match",
            "F_exp",
            "F_matched",
            "S_fill",
            "S_match",
            "S_exp",
            "S_matched",
            "Δfill",
            "Δmatch",
        );
        for d in &sorted[..limit] {
            print_bubble_divergence_row(d);
        }
    }
}

fn print_corner_block(corners: &CornerSnapshot) {
    let f = &corners.full;
    let s = &corners.sides;
    println!(
        "      corners (full -> sides, Δ): TL ({:.2},{:.2}) -> ({:.2},{:.2})  Δ=({:+.2},{:+.2})",
        f.top_left.x,
        f.top_left.y,
        s.top_left.x,
        s.top_left.y,
        s.top_left.x - f.top_left.x,
        s.top_left.y - f.top_left.y,
    );
    println!(
        "                                  TR ({:.2},{:.2}) -> ({:.2},{:.2})  Δ=({:+.2},{:+.2})",
        f.top_right.x,
        f.top_right.y,
        s.top_right.x,
        s.top_right.y,
        s.top_right.x - f.top_right.x,
        s.top_right.y - f.top_right.y,
    );
    println!(
        "                                  BL ({:.2},{:.2}) -> ({:.2},{:.2})  Δ=({:+.2},{:+.2})",
        f.bottom_left.x,
        f.bottom_left.y,
        s.bottom_left.x,
        s.bottom_left.y,
        s.bottom_left.x - f.bottom_left.x,
        s.bottom_left.y - f.bottom_left.y,
    );
    println!(
        "                                  BR ({:.2},{:.2}) -> ({:.2},{:.2})  Δ=({:+.2},{:+.2})",
        f.bottom_right.x,
        f.bottom_right.y,
        s.bottom_right.x,
        s.bottom_right.y,
        s.bottom_right.x - f.bottom_right.x,
        s.bottom_right.y - f.bottom_right.y,
    );
}

fn print_border_mark_diffs(c: &CornerSnapshot) {
    print_one_border("left", &c.full_left_marks, &c.sides_left_marks);
    print_one_border("right", &c.full_right_marks, &c.sides_right_marks);
}

fn print_one_border(name: &str, full: &[(f32, f32)], sides: &[(f32, f32)]) {
    if full.is_empty() && sides.is_empty() {
        return;
    }
    let n = full.len().max(sides.len());
    let mut diffs: Vec<usize> = (0..n)
        .filter(|&i| match (full.get(i), sides.get(i)) {
            (Some(f), Some(s)) => (f.0 - s.0).abs() > 0.5 || (f.1 - s.1).abs() > 0.5,
            _ => true,
        })
        .collect();
    println!(
        "      {} marks: full={} sides={}; differing rows: {} (showing all)",
        name,
        full.len(),
        sides.len(),
        diffs.len(),
    );
    if diffs.is_empty() {
        return;
    }
    // Cap output so a wholly-disagreeing border doesn't dominate.
    diffs.truncate(20);
    for i in diffs {
        let f = full.get(i).copied();
        let s = sides.get(i).copied();
        let f_str = f.map_or("       -       ".to_string(), |(x, y)| {
            format!("({:>7.2},{:>7.2})", x, y)
        });
        let s_str = s.map_or("       -       ".to_string(), |(x, y)| {
            format!("({:>7.2},{:>7.2})", x, y)
        });
        let delta_str = match (f, s) {
            (Some((fx, fy)), Some((sx, sy))) => format!("Δ=({:+.2},{:+.2})", sx - fx, sy - fy),
            _ => "Δ=missing".to_string(),
        };
        println!(
            "        [{:>3}]  F={}  S={}  {}",
            i, f_str, s_str, delta_str,
        );
    }
}

fn print_bubble_divergence_row(d: &BubbleDivergence) {
    let side_str = match d.location.side {
        types_rs::ballot_card::BallotSide::Front => "front",
        types_rs::ballot_card::BallotSide::Back => "back",
    };
    let f_fill = d
        .full
        .as_ref()
        .map_or("    -    ".to_string(), |m| format!("{:>9.4}", m.fill_score));
    let f_match = d.full.as_ref().map_or("    -    ".to_string(), |m| {
        format!("{:>9.4}", m.match_score)
    });
    let f_exp = d
        .full
        .as_ref()
        .map_or("    -    ".to_string(), |m| fmt_box(&m.expected_bounds));
    let f_match_box = d
        .full
        .as_ref()
        .map_or("    -    ".to_string(), |m| fmt_box(&m.matched_bounds));
    let s_fill = d
        .sides
        .as_ref()
        .map_or("    -    ".to_string(), |m| format!("{:>9.4}", m.fill_score));
    let s_match = d.sides.as_ref().map_or("    -    ".to_string(), |m| {
        format!("{:>9.4}", m.match_score)
    });
    let s_exp = d
        .sides
        .as_ref()
        .map_or("    -    ".to_string(), |m| fmt_box(&m.expected_bounds));
    let s_match_box = d
        .sides
        .as_ref()
        .map_or("    -    ".to_string(), |m| fmt_box(&m.matched_bounds));

    let (d_fill, d_match) = match (d.full.as_ref(), d.sides.as_ref()) {
        (Some(f), Some(s)) => (
            format!("{:>8.4}", (f.fill_score - s.fill_score).abs()),
            format!("{:>8.4}", (f.match_score - s.match_score).abs()),
        ),
        _ => ("   PRESENCE".to_string(), "   PRESENCE".to_string()),
    };

    println!(
        "        {:>3} {:>5} {:>5}  {:<28}  {:<14}  {} {} {} {}  {} {} {} {}  {} {}",
        d.location.column,
        d.location.row,
        side_str,
        truncate(&d.contest_id.to_string(), 28),
        truncate(&d.option_id.to_string(), 14),
        f_fill,
        f_match,
        f_exp,
        f_match_box,
        s_fill,
        s_match,
        s_exp,
        s_match_box,
        d_fill,
        d_match,
    );
}

fn fmt_box(r: &Rect) -> String {
    format!(
        "{:>13}",
        format!("{}x{}@{},{}", r.width(), r.height(), r.left(), r.top())
    )
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max.saturating_sub(1)])
    }
}

fn print_pairwise_row(
    label: &str,
    diverged_bubbles: usize,
    total_bubbles: usize,
    pairs_with_diff: usize,
    compared_pairs: usize,
    max_fill: f32,
    max_match: f32,
) {
    let pct = if total_bubbles == 0 {
        0.0
    } else {
        #[allow(clippy::cast_precision_loss)]
        let n = total_bubbles as f32;
        #[allow(clippy::cast_precision_loss)]
        let d = diverged_bubbles as f32;
        100.0 * d / n
    };
    println!(
        "  {label}{diverged_bubbles}/{total_bubbles} bubbles ({pct:.2}%)  {pairs_with_diff}/{compared_pairs} pairs  Δfill_max={max_fill:.4}  Δmatch_max={max_match:.4}",
    );
}

#[allow(
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    clippy::cast_possible_truncation
)]
fn percentile(sorted: &[f32], p: f32) -> f32 {
    let idx = ((sorted.len() as f32 - 1.0) * p).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

/// Short label for a front-side path: the immediate parent dir + the
/// trailing `-front.<ext>` filename. Avoids printing long absolute paths
/// for every line of output.
fn short_label(front: &Path) -> String {
    let parent = front
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let name = front.file_name().and_then(|s| s.to_str()).unwrap_or("?");
    if parent.is_empty() {
        name.to_owned()
    } else {
        format!("{parent}/{name}")
    }
}
