#![allow(clippy::cast_precision_loss)]
#![allow(clippy::cast_possible_truncation)]
#![allow(clippy::cast_sign_loss)]
#![allow(clippy::cast_possible_wrap)]
#![allow(clippy::too_many_lines)]
#![allow(clippy::struct_excessive_bools)]
#![allow(clippy::module_name_repetitions)]

use std::{
    collections::{HashMap, HashSet},
    io::{self, Read},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use ab_glyph::{FontRef, PxScale};
use clap::Parser;
use color_eyre::Result;
use crossterm::{
    event::{self, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use image::{DynamicImage, Rgb};
use imageproc::drawing::{draw_hollow_rect_mut, draw_text_mut};
use imageproc::rect::Rect as ImgRect;
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Rect as TuiRect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, List, ListItem, ListState, Paragraph, Wrap},
    Frame, Terminal,
};
use ratatui_image::{picker::Picker, protocol::StatefulProtocol, StatefulImage};
use serde_json::Value;

fn monospace_font() -> FontRef<'static> {
    FontRef::try_from_slice(include_bytes!("../data/fonts/Inconsolata-Regular.ttf"))
        .expect("built-in font is valid")
}

// ===== Data Models =====

#[derive(Debug, Clone)]
struct PixelBounds {
    left: i32,
    top: i32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone)]
struct CvrOption {
    name: String,
    is_write_in: bool,
    bounds: Option<PixelBounds>,
    score: f32,
    has_indication: bool,
}

#[derive(Debug, Clone)]
struct CvrContest {
    id: String,
    page: u8,
    options: Vec<CvrOption>,
}

#[derive(Debug, Clone)]
struct FullCvrData {
    ballot_style: String,
    contests: Vec<CvrContest>,
}

#[derive(Debug, Clone)]
struct BallotEntry {
    id: String,
    ballot_style: Option<String>,
    /// Maximum bubble fill score across any selection on this ballot.
    max_score: f32,
    is_rejected: bool,
    path: PathBuf,
}

#[derive(Debug, Clone)]
struct Machine {
    id: String,
    path: PathBuf,
}

// ===== Source (directory or zip) =====

#[derive(Debug, Clone)]
struct Source {
    kind: SourceKind,
    /// Prefix within the source where machine directories live (e.g. "" or "cast-vote-records")
    root_prefix: PathBuf,
}

#[derive(Debug, Clone)]
enum SourceKind {
    Directory(PathBuf),
    Zip(PathBuf),
}

impl Source {
    fn new_dir(path: PathBuf) -> Self {
        let root_prefix = find_cvr_root_dir(&path);
        let base = if root_prefix == PathBuf::new() {
            path
        } else {
            path.join(&root_prefix)
        };
        Self {
            kind: SourceKind::Directory(base),
            root_prefix: PathBuf::new(),
        }
    }

    fn new_zip(path: PathBuf) -> Self {
        let prefix = find_cvr_root_in_zip(&path).unwrap_or_default();
        Self {
            kind: SourceKind::Zip(path),
            root_prefix: prefix,
        }
    }

    fn resolve(&self, rel: &Path) -> PathBuf {
        if self.root_prefix == PathBuf::new() {
            rel.to_path_buf()
        } else {
            self.root_prefix.join(rel)
        }
    }

    fn read_bytes(&self, rel: &Path) -> Result<Vec<u8>> {
        match &self.kind {
            SourceKind::Directory(root) => Ok(std::fs::read(root.join(rel))?),
            SourceKind::Zip(zip_path) => {
                let resolved = self.resolve(rel);
                let path_str = resolved.to_string_lossy().replace('\\', "/");
                let file = std::fs::File::open(zip_path)?;
                let mut archive = zip::ZipArchive::new(file)?;
                let mut zip_file = archive.by_name(&path_str)?;
                let mut bytes = Vec::new();
                zip_file.read_to_end(&mut bytes)?;
                Ok(bytes)
            }
        }
    }

    fn read_string(&self, rel: &Path) -> Result<String> {
        let bytes = self.read_bytes(rel)?;
        Ok(String::from_utf8(bytes)?)
    }

    fn file_exists(&self, rel: &Path) -> bool {
        match &self.kind {
            SourceKind::Directory(root) => root.join(rel).exists(),
            SourceKind::Zip(zip_path) => {
                let resolved = self.resolve(rel);
                let path_str = resolved.to_string_lossy().replace('\\', "/");
                let Ok(file) = std::fs::File::open(zip_path) else {
                    return false;
                };
                let Ok(mut archive) = zip::ZipArchive::new(file) else {
                    return false;
                };
                let exists = archive.by_name(&path_str).is_ok();
                exists
            }
        }
    }

    fn list_dirs(&self, rel: &Path) -> Result<Vec<PathBuf>> {
        match &self.kind {
            SourceKind::Directory(root) => {
                let full = root.join(rel);
                let mut result = Vec::new();
                for entry in std::fs::read_dir(&full)? {
                    let entry = entry?;
                    if entry.file_type()?.is_dir() {
                        result.push(entry.path());
                    }
                }
                result.sort();
                Ok(result)
            }
            SourceKind::Zip(zip_path) => {
                let root = self.resolve(rel);
                let file = std::fs::File::open(zip_path)?;
                let mut archive = zip::ZipArchive::new(file)?;
                let len = archive.len();
                let mut dirs = HashSet::new();
                for i in 0..len {
                    let Ok(entry) = archive.by_index(i) else {
                        continue;
                    };
                    let Some(path) = entry.enclosed_name() else {
                        continue;
                    };

                    if path.parent() == Some(&root) && !entry.is_dir() {
                        // direct child of root, but not a file
                        continue;
                    }

                    let Ok(relative) = path.strip_prefix(&root) else {
                        continue;
                    };

                    if let Some(file_name) = relative.components().next() {
                        dirs.insert(
                            root.join(file_name)
                                .strip_prefix(&self.root_prefix)
                                .expect("listed directories are within self.root_prefix")
                                .to_path_buf(),
                        );
                    }
                }
                let mut result: Vec<_> = dirs.into_iter().collect();
                result.sort();
                Ok(result)
            }
        }
    }
}

fn find_cvr_root_dir(path: &Path) -> PathBuf {
    // Check if any subdir starts with "TEST__machine_" or "machine_"
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if entry.file_type().is_ok_and(|t| t.is_dir()) {
                let name = entry.file_name();
                let n = name.to_string_lossy();
                if n.starts_with("TEST__machine_") || n.starts_with("machine_") {
                    return PathBuf::new();
                }
            }
        }
    }
    // Check cast-vote-records subdir
    let cvr_sub = path.join("cast-vote-records");
    if cvr_sub.is_dir() {
        return PathBuf::from("cast-vote-records");
    }
    PathBuf::new()
}

fn find_cvr_root_in_zip(zip_path: &Path) -> Option<PathBuf> {
    let file = std::fs::File::open(zip_path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;
    let len = archive.len();

    // Find metadata.json files. Their parent is the machine dir;
    // their grandparent is the CVR root we want.
    for i in 0..len {
        let Some(path) = archive
            .by_index(i)
            .ok()
            .and_then(|entry| entry.enclosed_name())
        else {
            continue;
        };
        if path.file_name().and_then(|s| s.to_str()) != Some("metadata.json") {
            continue;
        }
        // Strip "/metadata.json" suffix to get the machine dir path.
        if let Some(root) = path.parent().and_then(|p| p.parent()) {
            return Some(root.to_owned());
        }
    }
    Some(PathBuf::new())
}

// ===== Loader Functions =====

fn load_machines(source: &Source) -> Result<Vec<Machine>> {
    let dirs = source.list_dirs(Path::new(""))?;
    let mut machines = Vec::new();
    for dir in dirs {
        let Some(file_name) = dir.file_name().and_then(|file_name| file_name.to_str()) else {
            continue;
        };
        // Skip hidden directories and Mac zip artifacts.
        if file_name.starts_with('.') || file_name.starts_with("__") {
            continue;
        }
        let id = file_name
            .strip_prefix("TEST__")
            .unwrap_or(file_name)
            .to_owned();
        machines.push(Machine { id, path: dir });
    }
    if machines.is_empty() {
        // Root itself is the machine directory (single-machine zip).
        machines.push(Machine {
            id: "default".to_owned(),
            path: PathBuf::new(),
        });
    }
    Ok(machines)
}

fn load_ballot_list(source: &Source, machine_path: &Path) -> Result<Vec<BallotEntry>> {
    let dirs = source.list_dirs(machine_path)?;
    let mut ballots = Vec::new();
    for dir in dirs {
        // `list_dirs` returns full paths (absolute for Directory, root-relative for Zip),
        // so use the path directly — do not join with machine_path.
        let ballot_path = dir;
        let Some(file_name) = ballot_path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let is_rejected = file_name.starts_with("rejected-");
        let ballot_id = file_name
            .strip_prefix("rejected-")
            .unwrap_or(file_name)
            .to_owned();
        if is_rejected {
            ballots.push(BallotEntry {
                id: ballot_id,
                ballot_style: None,
                max_score: 0.0,
                is_rejected: true,
                path: ballot_path,
            });
            continue;
        }
        let cvr_path = ballot_path.join("cast-vote-record-report.json");
        if source.file_exists(&cvr_path) {
            if let Ok(cvr_str) = source.read_string(&cvr_path) {
                if let Ok(cvr_json) = serde_json::from_str::<Value>(&cvr_str) {
                    ballots.push(parse_ballot_summary(&ballot_id, &ballot_path, &cvr_json));
                    continue;
                }
            }
        }
        ballots.push(BallotEntry {
            id: ballot_id,
            ballot_style: None,
            max_score: 0.0,
            is_rejected: false,
            path: ballot_path,
        });
    }
    Ok(ballots)
}

fn parse_ballot_summary(id: &str, path: &Path, cvr_json: &Value) -> BallotEntry {
    let cvr_array = cvr_json.get("CVR").and_then(|v| v.as_array());
    let ballot_style = cvr_array
        .and_then(|arr| arr.first())
        .and_then(|cvr| cvr.get("BallotStyleId"))
        .and_then(|v| v.as_str())
        .map(str::to_owned);

    let mut max_score = 0.0f32;
    if let Some(cvrs) = cvr_array {
        for cvr in cvrs {
            if let Some(snapshots) = cvr.get("CVRSnapshot").and_then(|v| v.as_array()) {
                for snapshot in snapshots {
                    if snapshot.get("Type").and_then(|v| v.as_str()).unwrap_or("") != "original" {
                        continue;
                    }
                    for_each_selection(snapshot, |_sel_id, score, _has_ind| {
                        if score > max_score {
                            max_score = score;
                        }
                    });
                }
            }
        }
    }
    BallotEntry {
        id: id.to_owned(),
        ballot_style,
        max_score,
        is_rejected: false,
        path: path.to_path_buf(),
    }
}

/// Calls `f(selection_id, score, has_indication)` for every selection in the original snapshot.
fn for_each_selection<F>(snapshot: &Value, mut f: F)
where
    F: FnMut(&str, f32, bool),
{
    let Some(contests) = snapshot.get("CVRContest").and_then(|v| v.as_array()) else {
        return;
    };
    for contest in contests {
        let Some(selections) = contest
            .get("CVRContestSelection")
            .and_then(|v| v.as_array())
        else {
            continue;
        };
        for sel in selections {
            let sel_id = sel
                .get("ContestSelectionId")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let Some(positions) = sel.get("SelectionPosition").and_then(|v| v.as_array()) else {
                continue;
            };
            for pos in positions {
                let has_ind = pos
                    .get("HasIndication")
                    .and_then(|v| v.as_str())
                    .unwrap_or("no")
                    == "yes";
                let score = pos
                    .get("MarkMetricValue")
                    .and_then(|v| v.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f32>().ok())
                    .unwrap_or(0.0);
                f(sel_id, score, has_ind);
            }
        }
    }
}

fn load_full_cvr(source: &Source, ballot_path: &Path, ballot_id: &str) -> Result<FullCvrData> {
    let cvr_str = source.read_string(&ballot_path.join("cast-vote-record-report.json"))?;
    let cvr_json: Value = serde_json::from_str(&cvr_str)?;

    let front_path = ballot_path.join(format!("{ballot_id}-front.layout.json"));
    let back_path = ballot_path.join(format!("{ballot_id}-back.layout.json"));

    let front_layout = if source.file_exists(&front_path) {
        source
            .read_string(&front_path)
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
    } else {
        None
    };
    let back_layout = if source.file_exists(&back_path) {
        source
            .read_string(&back_path)
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
    } else {
        None
    };

    Ok(build_full_cvr_data(
        &cvr_json,
        front_layout.as_ref(),
        back_layout.as_ref(),
    ))
}

fn build_full_cvr_data(
    cvr_json: &Value,
    front_layout: Option<&Value>,
    back_layout: Option<&Value>,
) -> FullCvrData {
    let cvr_array = cvr_json.get("CVR").and_then(|v| v.as_array());
    let ballot_style = cvr_array
        .and_then(|arr| arr.first())
        .and_then(|cvr| cvr.get("BallotStyleId"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_owned();

    // Build score map: {contest_id -> {selection_id -> (score, has_indication)}}
    let mut scores: HashMap<String, HashMap<String, (f32, bool)>> = HashMap::new();
    if let Some(cvrs) = cvr_array {
        for cvr in cvrs {
            if let Some(snapshots) = cvr.get("CVRSnapshot").and_then(|v| v.as_array()) {
                for snapshot in snapshots {
                    if snapshot.get("Type").and_then(|v| v.as_str()).unwrap_or("") != "original" {
                        continue;
                    }
                    let Some(contests) = snapshot.get("CVRContest").and_then(|v| v.as_array())
                    else {
                        continue;
                    };
                    for contest in contests {
                        let contest_id = contest
                            .get("ContestId")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_owned();
                        let entry = scores.entry(contest_id).or_default();
                        for_each_selection(snapshot, |sel_id, score, has_ind| {
                            entry.insert(sel_id.to_owned(), (score, has_ind));
                        });
                    }
                }
            }
        }
    }

    // Note: the for_each_selection above iterates ALL contests in snapshot, not per-contest.
    // Let's redo the scoring pass per-contest properly.
    scores.clear();
    if let Some(cvrs) = cvr_array {
        for cvr in cvrs {
            if let Some(snapshots) = cvr.get("CVRSnapshot").and_then(|v| v.as_array()) {
                for snapshot in snapshots {
                    if snapshot.get("Type").and_then(|v| v.as_str()).unwrap_or("") != "original" {
                        continue;
                    }
                    let Some(contests) = snapshot.get("CVRContest").and_then(|v| v.as_array())
                    else {
                        continue;
                    };
                    for contest in contests {
                        let contest_id = contest
                            .get("ContestId")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_owned();
                        let contest_entry = scores.entry(contest_id).or_default();
                        let Some(sels) = contest
                            .get("CVRContestSelection")
                            .and_then(|v| v.as_array())
                        else {
                            continue;
                        };
                        for sel in sels {
                            let sel_id = sel
                                .get("ContestSelectionId")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_owned();
                            let Some(positions) =
                                sel.get("SelectionPosition").and_then(|v| v.as_array())
                            else {
                                continue;
                            };
                            for pos in positions {
                                let has_ind = pos
                                    .get("HasIndication")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("no")
                                    == "yes";
                                let score = pos
                                    .get("MarkMetricValue")
                                    .and_then(|v| v.as_array())
                                    .and_then(|arr| arr.first())
                                    .and_then(|v| v.as_str())
                                    .and_then(|s| s.parse::<f32>().ok())
                                    .unwrap_or(0.0);
                                contest_entry.insert(sel_id.clone(), (score, has_ind));
                            }
                        }
                    }
                }
            }
        }
    }

    let mut contests = Vec::new();
    for (page, layout) in [(1u8, front_layout), (2u8, back_layout)] {
        let Some(layout_val) = layout else { continue };
        let Some(layout_contests) = layout_val.get("contests").and_then(|v| v.as_array()) else {
            continue;
        };
        for contest_json in layout_contests {
            let contest_id = contest_json
                .get("contestId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_owned();
            let empty = HashMap::new();
            let contest_scores = scores.get(&contest_id).unwrap_or(&empty);
            let mut options = Vec::new();
            if let Some(opts) = contest_json.get("options").and_then(|v| v.as_array()) {
                for opt_json in opts {
                    let def = opt_json.get("definition");
                    let opt_id = def
                        .and_then(|d| d.get("id"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_owned();
                    let opt_name = def
                        .and_then(|d| d.get("name"))
                        .and_then(Value::as_str)
                        .map_or_else(|| opt_id.clone(), str::to_owned);
                    let is_write_in = def
                        .and_then(|d| d.get("isWriteIn"))
                        .and_then(Value::as_bool)
                        .unwrap_or_else(|| opt_id.starts_with("write-in"));
                    let bounds = parse_bounds(opt_json.get("bounds"));
                    let (score, has_indication) =
                        contest_scores.get(&opt_id).copied().unwrap_or((0.0, false));
                    options.push(CvrOption {
                        name: opt_name,
                        is_write_in,
                        bounds,
                        score,
                        has_indication,
                    });
                }
            }
            contests.push(CvrContest {
                id: contest_id,
                page,
                options,
            });
        }
    }

    FullCvrData {
        ballot_style,
        contests,
    }
}

fn parse_bounds(val: Option<&Value>) -> Option<PixelBounds> {
    let val = val?;
    // Layout JSON uses {x, y, width, height} (VxSuite's Rect type).
    // Values may be integers or floats in the JSON.
    let val_signed = |v: &Value| -> Option<i32> {
        v.as_i64()
            .or_else(|| v.as_f64().map(|f| f as i64))
            .map(|n| n as i32)
    };
    let val_unsigned = |v: &Value| -> Option<u32> {
        v.as_u64()
            .or_else(|| v.as_f64().map(|f| f as u64))
            .map(|n| n as u32)
    };
    let left = val.get("x").and_then(val_signed)?;
    let top = val.get("y").and_then(val_signed)?;
    let width = val.get("width").and_then(val_unsigned)?;
    let height = val.get("height").and_then(val_unsigned)?;
    Some(PixelBounds {
        left,
        top,
        width,
        height,
    })
}

fn load_image(
    source: &Source,
    ballot_path: &Path,
    ballot_id: &str,
    side: &str,
) -> Result<DynamicImage> {
    let img_path = ballot_path.join(format!("{ballot_id}-{side}.png"));
    let bytes = source.read_bytes(&img_path)?;
    Ok(image::load_from_memory(&bytes)?)
}

// ===== Image Annotation =====

fn annotate_image(img: &DynamicImage, contests: &[CvrContest]) -> DynamicImage {
    let mut rgb = img.to_rgb8();
    let font = monospace_font();
    for contest in contests {
        for opt in &contest.options {
            let Some(bounds) = &opt.bounds else {
                continue;
            };
            let color = match (opt.has_indication, opt.is_write_in, opt.score) {
                (true, true, _) => Rgb([0u8, 180u8, 90u8]),
                (true, false, _) => Rgb([0u8, 120u8, 220u8]),
                (false, true, s) if s > 0.03 => Rgb([220u8, 130u8, 0u8]),
                (false, true, _) => Rgb([180u8, 60u8, 60u8]),
                _ => Rgb([130u8, 130u8, 130u8]),
            };
            let x = bounds.left;
            let y = bounds.top;
            let w = bounds.width;
            let h = bounds.height;
            for t in 0..3i32 {
                let tw = t as u32;
                if w > tw * 2 && h > tw * 2 {
                    let rect = ImgRect::at(x + t, y + t).of_size(w - tw * 2, h - tw * 2);
                    draw_hollow_rect_mut(&mut rgb, rect, color);
                }
            }
            let score_text = format!("{:.2}", opt.score);
            let scale = PxScale::from(18.0);
            draw_text_mut(&mut rgb, color, x + 3, y + 3, scale, &font, &score_text);
        }
    }
    DynamicImage::ImageRgb8(rgb)
}

// ===== Filter =====

#[derive(Debug, Clone)]
struct Filter {
    ballot_style: String,
    wi_score_min: f32,
    wi_score_max: f32,
    show_rejected: bool,
    write_in_filter_enabled: bool,
}

impl Default for Filter {
    fn default() -> Self {
        Self {
            ballot_style: String::new(),
            wi_score_min: 0.0,
            wi_score_max: 1.0,
            show_rejected: true,
            write_in_filter_enabled: false,
        }
    }
}

fn passes_filter(entry: &BallotEntry, filter: &Filter) -> bool {
    if entry.is_rejected && !filter.show_rejected {
        return false;
    }
    if !filter.ballot_style.is_empty() {
        let style = entry.ballot_style.as_deref().unwrap_or("");
        if !style.contains(&filter.ballot_style) {
            return false;
        }
    }
    if filter.write_in_filter_enabled {
        let s = entry.max_score;
        if s < filter.wi_score_min || s > filter.wi_score_max {
            return false;
        }
    }
    true
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FilterField {
    StyleRadio,
    ScoreMin,
    ScoreMax,
}

#[derive(Debug, Clone)]
struct FilterPopup {
    /// Available ballot styles, collected from `all_ballots`. Index 0 = "All".
    available_styles: Vec<String>,
    /// 0 = All, 1+ = `available_styles`\[idx-1\].
    selected_style_idx: usize,
    score_min: String,
    score_max: String,
    show_rejected: bool,
    focused_field: FilterField,
}

impl FilterPopup {
    fn from_filter(f: &Filter, available_styles: Vec<String>) -> Self {
        let selected_style_idx = if f.ballot_style.is_empty() {
            0
        } else {
            available_styles
                .iter()
                .position(|s| s == &f.ballot_style)
                .map_or(0, |i| i + 1)
        };
        Self {
            available_styles,
            selected_style_idx,
            score_min: format!("{:.2}", f.wi_score_min),
            score_max: format!("{:.2}", f.wi_score_max),
            show_rejected: f.show_rejected,
            focused_field: FilterField::StyleRadio,
        }
    }

    fn to_filter(&self) -> Filter {
        let ballot_style = if self.selected_style_idx == 0 {
            String::new()
        } else {
            self.available_styles
                .get(self.selected_style_idx - 1)
                .cloned()
                .unwrap_or_default()
        };
        let min: f32 = self.score_min.trim().parse().unwrap_or(0.0);
        let max: f32 = self.score_max.trim().parse().unwrap_or(1.0);
        Filter {
            ballot_style,
            wi_score_min: min,
            wi_score_max: max,
            show_rejected: self.show_rejected,
            write_in_filter_enabled: min > 0.0 || max < 1.0,
        }
    }

    fn focused_score_field_mut(&mut self) -> Option<&mut String> {
        match self.focused_field {
            FilterField::ScoreMin => Some(&mut self.score_min),
            FilterField::ScoreMax => Some(&mut self.score_max),
            FilterField::StyleRadio => None,
        }
    }

    fn next_field(&mut self) {
        self.focused_field = match self.focused_field {
            FilterField::StyleRadio => FilterField::ScoreMin,
            FilterField::ScoreMin => FilterField::ScoreMax,
            FilterField::ScoreMax => FilterField::StyleRadio,
        };
    }

    fn radio_up(&mut self) {
        self.selected_style_idx = self.selected_style_idx.saturating_sub(1);
    }

    fn radio_down(&mut self) {
        if self.selected_style_idx < self.available_styles.len() {
            self.selected_style_idx += 1;
        }
    }
}

// ===== Copy Dialog =====

#[derive(Debug, Clone)]
struct CopyDialog {
    items: Vec<(&'static str, String)>,
}

impl CopyDialog {
    fn build(source: &Source, ballot: &BallotEntry, side: ImageSide) -> Self {
        let side_str = match side {
            ImageSide::Front => "front",
            ImageSide::Back => "back",
        };
        let image_name = format!("{}-{side_str}.png", ballot.id);
        let (dir_path, img_path) = match &source.kind {
            SourceKind::Directory(root) => {
                let dir = root.join(&ballot.path).display().to_string();
                let img = root
                    .join(&ballot.path)
                    .join(&image_name)
                    .display()
                    .to_string();
                (dir, img)
            }
            SourceKind::Zip(zip_path) => {
                let inner = source.resolve(&ballot.path);
                let dir = format!("{}:{}", zip_path.display(), inner.display());
                let img = format!("{}:{}/{}", zip_path.display(), inner.display(), image_name);
                (dir, img)
            }
        };
        Self {
            items: vec![
                ("UUID", ballot.id.clone()),
                ("Ballot dir", dir_path),
                ("Image path", img_path),
            ],
        }
    }
}

/// Write text to the system clipboard via the OSC 52 terminal escape sequence.
/// Works over SSH in terminals that support it (kitty, iTerm2, etc.).
fn copy_via_osc52(text: &str) -> bool {
    use base64::Engine as _;
    use std::io::Write as _;
    let encoded = base64::engine::general_purpose::STANDARD.encode(text.as_bytes());
    let seq = format!("\x1b]52;c;{encoded}\x07");
    std::io::stdout()
        .write_all(seq.as_bytes())
        .and_then(|()| std::io::stdout().flush())
        .is_ok()
}

// ===== App State =====

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Pane {
    Machines,
    Ballots,
    Preview,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PreviewMode {
    Image,
    Interpretation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ImageSide {
    Front,
    Back,
}

struct App {
    source: Source,
    machines: Vec<Machine>,
    machine_state: ListState,
    all_ballots: Vec<BallotEntry>,
    filtered_ballots: Vec<BallotEntry>,
    ballot_state: ListState,
    current_cvr: Option<FullCvrData>,
    front_image: Option<DynamicImage>,
    back_image: Option<DynamicImage>,
    front_annotated: Option<DynamicImage>,
    back_annotated: Option<DynamicImage>,
    image_state: Option<StatefulProtocol>,
    picker: Picker,
    focused_pane: Pane,
    preview_mode: PreviewMode,
    image_side: ImageSide,
    show_overlay: bool,
    show_filter: bool,
    filter: Filter,
    filter_popup: Option<FilterPopup>,
    /// Unique ballot styles collected from `all_ballots`; used by filter popup.
    available_styles: Vec<String>,
    show_help: bool,
    copy_dialog: Option<CopyDialog>,
    status_message: String,
    /// Debounce: load the selected ballot image after this instant.
    image_load_due: Option<Instant>,
}

impl App {
    fn new(source: Source, machines: Vec<Machine>, picker: Picker) -> Self {
        let mut machine_state = ListState::default();
        if !machines.is_empty() {
            machine_state.select(Some(0));
        }
        Self {
            source,
            machines,
            machine_state,
            all_ballots: Vec::new(),
            filtered_ballots: Vec::new(),
            ballot_state: ListState::default(),
            current_cvr: None,
            front_image: None,
            back_image: None,
            front_annotated: None,
            back_annotated: None,
            image_state: None,
            picker,
            focused_pane: Pane::Machines,
            preview_mode: PreviewMode::Image,
            image_side: ImageSide::Front,
            show_overlay: false,
            show_filter: false,
            filter: Filter::default(),
            filter_popup: None,
            available_styles: Vec::new(),
            show_help: false,
            copy_dialog: None,
            status_message: String::new(),
            image_load_due: None,
        }
    }

    fn selected_machine(&self) -> Option<&Machine> {
        self.machine_state
            .selected()
            .and_then(|i| self.machines.get(i))
    }

    fn selected_ballot(&self) -> Option<&BallotEntry> {
        self.ballot_state
            .selected()
            .and_then(|i| self.filtered_ballots.get(i))
    }

    fn load_machine_ballots(&mut self) {
        let Some(machine) = self.selected_machine() else {
            return;
        };
        let machine_path = machine.path.clone();
        match load_ballot_list(&self.source, &machine_path) {
            Ok(ballots) => {
                self.all_ballots = ballots;
                self.apply_filter();
            }
            Err(e) => {
                self.status_message = format!("Error loading ballots: {e}");
            }
        }
    }

    fn apply_filter(&mut self) {
        // Rebuild available styles from all ballots (sorted, deduplicated).
        let mut styles: Vec<String> = self
            .all_ballots
            .iter()
            .filter_map(|b| b.ballot_style.clone())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        styles.sort();
        self.available_styles = styles;

        self.filtered_ballots = self
            .all_ballots
            .iter()
            .filter(|e| passes_filter(e, &self.filter))
            .cloned()
            .collect();
        self.ballot_state = ListState::default();
        if !self.filtered_ballots.is_empty() {
            self.ballot_state.select(Some(0));
        }
        self.clear_ballot_cache();
    }

    fn clear_ballot_cache(&mut self) {
        self.current_cvr = None;
        self.front_image = None;
        self.back_image = None;
        self.front_annotated = None;
        self.back_annotated = None;
        self.image_state = None;
    }

    /// Schedule an image load after a short debounce delay.
    /// Rapid navigation calls this repeatedly; only the final pause loads.
    fn schedule_image_load(&mut self) {
        self.image_load_due = Some(Instant::now() + Duration::from_millis(150));
    }

    fn load_selected_ballot(&mut self) {
        self.image_load_due = None; // cancel any pending debounced load
        let Some(ballot) = self.selected_ballot() else {
            return;
        };
        let ballot_path = ballot.path.clone();
        let ballot_id = ballot.id.clone();
        let is_rejected = ballot.is_rejected;
        self.clear_ballot_cache();
        if !is_rejected {
            match load_full_cvr(&self.source, &ballot_path, &ballot_id) {
                Ok(cvr) => self.current_cvr = Some(cvr),
                Err(e) => self.status_message = format!("CVR load error: {e}"),
            }
        }
        self.load_current_image();
    }

    fn load_current_image(&mut self) {
        let Some(ballot) = self.selected_ballot() else {
            return;
        };
        let ballot_path = ballot.path.clone();
        let ballot_id = ballot.id.clone();
        let side_str = match self.image_side {
            ImageSide::Front => "front",
            ImageSide::Back => "back",
        };
        let already_loaded = match self.image_side {
            ImageSide::Front => self.front_image.is_some(),
            ImageSide::Back => self.back_image.is_some(),
        };
        if !already_loaded {
            match load_image(&self.source, &ballot_path, &ballot_id, side_str) {
                Ok(img) => match self.image_side {
                    ImageSide::Front => self.front_image = Some(img),
                    ImageSide::Back => self.back_image = Some(img),
                },
                Err(e) => {
                    self.status_message = format!("Image load error: {e}");
                    return;
                }
            }
        }
        self.image_state = None;
        self.rebuild_image_state();
    }

    fn rebuild_image_state(&mut self) {
        let img: Option<&DynamicImage> = if self.show_overlay {
            match self.image_side {
                ImageSide::Front => {
                    if self.front_annotated.is_none() {
                        if let (Some(img), Some(cvr)) = (&self.front_image, &self.current_cvr) {
                            let front_contests: Vec<CvrContest> = cvr
                                .contests
                                .iter()
                                .filter(|c| c.page == 1)
                                .cloned()
                                .collect();
                            self.front_annotated = Some(annotate_image(img, &front_contests));
                        }
                    }
                    self.front_annotated.as_ref().or(self.front_image.as_ref())
                }
                ImageSide::Back => {
                    if self.back_annotated.is_none() {
                        if let (Some(img), Some(cvr)) = (&self.back_image, &self.current_cvr) {
                            let back_contests: Vec<CvrContest> = cvr
                                .contests
                                .iter()
                                .filter(|c| c.page == 2)
                                .cloned()
                                .collect();
                            self.back_annotated = Some(annotate_image(img, &back_contests));
                        }
                    }
                    self.back_annotated.as_ref().or(self.back_image.as_ref())
                }
            }
        } else {
            match self.image_side {
                ImageSide::Front => self.front_image.as_ref(),
                ImageSide::Back => self.back_image.as_ref(),
            }
        };
        if let Some(img) = img {
            self.image_state = Some(self.picker.new_resize_protocol(img.clone()));
        }
    }

    fn handle_key(&mut self, key: KeyCode) -> bool {
        if self.show_help {
            self.show_help = false;
            self.rebuild_image_state(); // restore image after help closed
            return true;
        }
        if self.copy_dialog.is_some() {
            return self.handle_copy_key(key);
        }
        if self.show_filter {
            return self.handle_filter_key(key);
        }
        match key {
            KeyCode::Char('q' | 'Q') => return false,
            KeyCode::Char('j') | KeyCode::Down => self.move_down(),
            KeyCode::Char('k') | KeyCode::Up => self.move_up(),
            KeyCode::Char('h') | KeyCode::Left => self.focus_left(),
            KeyCode::Char('l') | KeyCode::Right => self.focus_right(),
            KeyCode::Char('g') => self.jump_top(),
            KeyCode::Char('G') => self.jump_bottom(),
            KeyCode::Enter | KeyCode::Char(' ') => self.select_item(),
            KeyCode::Char('f') => {
                self.image_side = ImageSide::Front;
                self.preview_mode = PreviewMode::Image;
                self.image_state = None;
                self.load_current_image();
            }
            KeyCode::Char('b') => {
                self.image_side = ImageSide::Back;
                self.preview_mode = PreviewMode::Image;
                self.image_state = None;
                self.load_current_image();
            }
            KeyCode::Char('v') => {
                self.preview_mode = if self.preview_mode == PreviewMode::Image {
                    PreviewMode::Interpretation
                } else {
                    PreviewMode::Image
                };
            }
            KeyCode::Char('i') => {
                self.show_overlay = !self.show_overlay;
                self.image_state = None;
                self.rebuild_image_state();
            }
            KeyCode::Char('c') => {
                if let Some(ballot) = self.selected_ballot() {
                    let dialog = CopyDialog::build(&self.source, ballot, self.image_side);
                    self.copy_dialog = Some(dialog);
                }
            }
            KeyCode::Char('/') => {
                self.filter_popup = Some(FilterPopup::from_filter(
                    &self.filter,
                    self.available_styles.clone(),
                ));
                self.show_filter = true;
            }
            KeyCode::Esc => {
                self.show_filter = false;
                self.filter_popup = None;
            }
            KeyCode::Char('r') => {
                self.filter.show_rejected = !self.filter.show_rejected;
                let old_selected_id = self.selected_ballot().map(|b| b.id.clone());
                self.apply_filter();
                // Restore selection if ballot still visible
                if let Some(id) = old_selected_id {
                    if let Some(pos) = self.filtered_ballots.iter().position(|b| b.id == id) {
                        self.ballot_state.select(Some(pos));
                    }
                }
            }
            KeyCode::Char('?') => {
                // Clear image while help is open so the graphics layer doesn't
                // bleed into the surrounding terminal area.
                self.image_state = None;
                self.show_help = true;
            }
            _ => {}
        }
        true
    }

    fn handle_copy_key(&mut self, key: KeyCode) -> bool {
        let Some(dialog) = &self.copy_dialog else {
            return true;
        };
        match key {
            KeyCode::Char('1') => {
                let value = dialog
                    .items
                    .first()
                    .map_or("", |(_, v)| v.as_str())
                    .to_owned();
                let ok = copy_via_osc52(&value);
                self.status_message = if ok {
                    format!("Copied: {value}")
                } else {
                    format!("(OSC52 sent, check terminal) {value}")
                };
                self.copy_dialog = None;
            }
            KeyCode::Char('2') => {
                let value = dialog
                    .items
                    .get(1)
                    .map_or("", |(_, v)| v.as_str())
                    .to_owned();
                let ok = copy_via_osc52(&value);
                self.status_message = if ok {
                    format!("Copied: {value}")
                } else {
                    format!("(OSC52 sent) {value}")
                };
                self.copy_dialog = None;
            }
            KeyCode::Char('3') => {
                let value = dialog
                    .items
                    .get(2)
                    .map_or("", |(_, v)| v.as_str())
                    .to_owned();
                let ok = copy_via_osc52(&value);
                self.status_message = if ok {
                    format!("Copied: {value}")
                } else {
                    format!("(OSC52 sent) {value}")
                };
                self.copy_dialog = None;
            }
            KeyCode::Esc | KeyCode::Char('q') => {
                self.copy_dialog = None;
            }
            _ => {}
        }
        true
    }

    fn handle_filter_key(&mut self, key: KeyCode) -> bool {
        let Some(popup) = self.filter_popup.as_mut() else {
            return true;
        };
        match key {
            KeyCode::Esc => {
                self.show_filter = false;
                self.filter_popup = None;
            }
            KeyCode::Enter => {
                let new_filter = popup.to_filter();
                self.filter = new_filter;
                self.show_filter = false;
                self.filter_popup = None;
                self.apply_filter();
            }
            KeyCode::Tab => popup.next_field(),
            KeyCode::Up | KeyCode::Char('k') if popup.focused_field == FilterField::StyleRadio => {
                popup.radio_up();
            }
            KeyCode::Down | KeyCode::Char('j')
                if popup.focused_field == FilterField::StyleRadio =>
            {
                popup.radio_down();
            }
            KeyCode::Char(c) => {
                if let Some(field) = popup.focused_score_field_mut() {
                    field.push(c);
                }
            }
            KeyCode::Backspace => {
                if let Some(field) = popup.focused_score_field_mut() {
                    field.pop();
                }
            }
            _ => {}
        }
        true
    }

    fn move_down(&mut self) {
        match self.focused_pane {
            Pane::Machines => {
                let len = self.machines.len();
                if len == 0 {
                    return;
                }
                let i = self
                    .machine_state
                    .selected()
                    .map_or(0, |i| (i + 1).min(len - 1));
                self.machine_state.select(Some(i));
            }
            Pane::Ballots | Pane::Preview => {
                let len = self.filtered_ballots.len();
                if len == 0 {
                    return;
                }
                let i = self
                    .ballot_state
                    .selected()
                    .map_or(0, |i| (i + 1).min(len - 1));
                self.ballot_state.select(Some(i));
                self.schedule_image_load();
            }
        }
    }

    fn move_up(&mut self) {
        match self.focused_pane {
            Pane::Machines => {
                let i = self
                    .machine_state
                    .selected()
                    .map_or(0, |i| i.saturating_sub(1));
                self.machine_state.select(Some(i));
            }
            Pane::Ballots | Pane::Preview => {
                let i = self
                    .ballot_state
                    .selected()
                    .map_or(0, |i| i.saturating_sub(1));
                self.ballot_state.select(Some(i));
                self.schedule_image_load();
            }
        }
    }

    fn focus_left(&mut self) {
        self.focused_pane = match self.focused_pane {
            Pane::Machines | Pane::Ballots => Pane::Machines,
            Pane::Preview => Pane::Ballots,
        };
    }

    fn focus_right(&mut self) {
        self.focused_pane = match self.focused_pane {
            Pane::Machines => Pane::Ballots,
            Pane::Ballots | Pane::Preview => Pane::Preview,
        };
    }

    fn jump_top(&mut self) {
        match self.focused_pane {
            Pane::Machines => {
                if !self.machines.is_empty() {
                    self.machine_state.select(Some(0));
                }
            }
            Pane::Ballots | Pane::Preview => {
                if !self.filtered_ballots.is_empty() {
                    self.ballot_state.select(Some(0));
                    self.schedule_image_load();
                }
            }
        }
    }

    fn jump_bottom(&mut self) {
        match self.focused_pane {
            Pane::Machines => {
                if !self.machines.is_empty() {
                    self.machine_state.select(Some(self.machines.len() - 1));
                }
            }
            Pane::Ballots | Pane::Preview => {
                if !self.filtered_ballots.is_empty() {
                    let last = self.filtered_ballots.len() - 1;
                    self.ballot_state.select(Some(last));
                    self.schedule_image_load();
                }
            }
        }
    }

    fn select_item(&mut self) {
        match self.focused_pane {
            Pane::Machines => {
                self.load_machine_ballots();
                self.focused_pane = Pane::Ballots;
            }
            Pane::Ballots => {
                self.load_selected_ballot();
                self.focused_pane = Pane::Preview;
            }
            Pane::Preview => {}
        }
    }
}

// ===== UI Rendering =====

fn render(frame: &mut Frame, app: &mut App) {
    let area = frame.area();
    let [main_area, status_area] =
        ratatui::layout::Layout::vertical([Constraint::Min(0), Constraint::Length(1)]).areas(area);
    let [machines_area, ballots_area, preview_area] = ratatui::layout::Layout::horizontal([
        Constraint::Percentage(15),
        Constraint::Percentage(30),
        Constraint::Percentage(55),
    ])
    .areas(main_area);

    render_machines(frame, machines_area, app);
    render_ballots(frame, ballots_area, app);
    render_preview(frame, preview_area, app);
    render_status(frame, status_area, app);

    if app.show_filter {
        render_filter_popup(frame, app);
    }
    if app.copy_dialog.is_some() {
        render_copy_dialog(frame, app);
    }
    if app.show_help {
        render_help(frame);
    }
}

fn focused_block(title: String, focused: bool) -> Block<'static> {
    let border_style = if focused {
        Style::default().fg(Color::Yellow)
    } else {
        Style::default().fg(Color::White)
    };
    Block::default()
        .title(title)
        .borders(Borders::ALL)
        .border_style(border_style)
}

fn render_machines(frame: &mut Frame, area: TuiRect, app: &mut App) {
    let is_focused = app.focused_pane == Pane::Machines;
    let block = focused_block(format!(" MACHINES [{}] ", app.machines.len()), is_focused);
    let items: Vec<ListItem> = app
        .machines
        .iter()
        .map(|m| ListItem::new(m.id.clone()))
        .collect();
    let list = List::new(items)
        .block(block)
        .highlight_style(
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        )
        .highlight_symbol("> ");
    frame.render_stateful_widget(list, area, &mut app.machine_state);
}

fn render_ballots(frame: &mut Frame, area: TuiRect, app: &mut App) {
    let is_focused = app.focused_pane == Pane::Ballots;
    let title = format!(
        " BALLOTS {}/{} ",
        app.filtered_ballots.len(),
        app.all_ballots.len()
    );
    let block = focused_block(title, is_focused);
    let items: Vec<ListItem> = app
        .filtered_ballots
        .iter()
        .map(|b| {
            let short_id = if b.id.len() > 8 { &b.id[..8] } else { &b.id };
            let style_str = b.ballot_style.as_deref().unwrap_or("-");
            let wi_ind = if b.max_score > 0.03 { "✓" } else { "-" };
            let wi_score = format!("{:.2}", b.max_score);
            let rej = if b.is_rejected { " REJ" } else { "    " };
            let text = format!("{short_id:<8} {style_str:<6} {wi_ind} {wi_score:<4}{rej}");
            let style = if b.is_rejected {
                Style::default().fg(Color::DarkGray)
            } else if b.max_score > 0.03 {
                Style::default().fg(Color::Yellow)
            } else {
                Style::default()
            };
            ListItem::new(text).style(style)
        })
        .collect();
    let list = List::new(items)
        .block(block)
        .highlight_style(
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        )
        .highlight_symbol("> ");
    frame.render_stateful_widget(list, area, &mut app.ballot_state);
}

fn render_preview(frame: &mut Frame, area: TuiRect, app: &mut App) {
    let is_focused = app.focused_pane == Pane::Preview;
    let ballot_id = app.selected_ballot().map_or("-", |b| b.id.as_str());
    let short_id = if ballot_id.len() > 8 {
        &ballot_id[..8]
    } else {
        ballot_id
    };
    let side_label = match app.image_side {
        ImageSide::Front => "[Front]",
        ImageSide::Back => "[Back]",
    };
    let overlay_label = if app.show_overlay { " [Overlay]" } else { "" };
    let mode_label = match app.preview_mode {
        PreviewMode::Image => "",
        PreviewMode::Interpretation => " [Interp]",
    };
    let title = format!(" {short_id}  {side_label}{overlay_label}{mode_label} ");
    let block = focused_block(title, is_focused);
    let inner = block.inner(area);
    frame.render_widget(block, area);

    match app.preview_mode {
        PreviewMode::Image => {
            if let Some(state) = &mut app.image_state {
                frame.render_stateful_widget(StatefulImage::default(), inner, state);
            } else if app.selected_ballot().is_none() {
                frame.render_widget(Paragraph::new("Select a ballot to view"), inner);
            } else {
                frame.render_widget(Paragraph::new("Loading image..."), inner);
            }
        }
        PreviewMode::Interpretation => {
            render_interpretation(frame, inner, app);
        }
    }
}

fn render_interpretation(frame: &mut Frame, area: TuiRect, app: &App) {
    let Some(cvr) = &app.current_cvr else {
        frame.render_widget(Paragraph::new("No CVR data (rejected or not loaded)"), area);
        return;
    };
    let mut lines: Vec<Line> = vec![Line::from(vec![Span::styled(
        format!("Ballot style: {}", cvr.ballot_style),
        Style::default().fg(Color::Cyan),
    )])];
    lines.push(Line::from(""));
    for contest in &cvr.contests {
        let page_label = if contest.page == 2 { " [page 2]" } else { "" };
        lines.push(Line::from(vec![Span::styled(
            format!("● {}{}", contest.id, page_label),
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        )]));
        for opt in &contest.options {
            let check = if opt.has_indication { "✓" } else { " " };
            let wi_marker = if opt.is_write_in { "✎ " } else { "  " };
            let color = match (opt.has_indication, opt.is_write_in, opt.score) {
                (true, true, _) => Color::Green,
                (true, false, _) => Color::Blue,
                (false, true, s) if s > 0.03 => Color::Yellow,
                _ => Color::DarkGray,
            };
            lines.push(Line::from(vec![Span::styled(
                format!("  [{}] {:.2}  {}{}", check, opt.score, wi_marker, opt.name),
                Style::default().fg(color),
            )]));
        }
        lines.push(Line::from(""));
    }
    let p = Paragraph::new(lines).wrap(Wrap { trim: false });
    frame.render_widget(p, area);
}

fn render_status(frame: &mut Frame, area: TuiRect, app: &App) {
    let help = "↑↓/jk nav  ←→/hl pane  f/b front/back  v interp  i overlay  c copy  / filter  r rej  ? help  q quit";
    let text = if app.status_message.is_empty() {
        help.to_owned()
    } else {
        format!("{}  |  {}", app.status_message, help)
    };
    frame.render_widget(
        Paragraph::new(text).style(Style::default().fg(Color::DarkGray)),
        area,
    );
}

fn popup_rect(frame: &Frame, w: u16, h: u16) -> TuiRect {
    let area = frame.area();
    let w = w.min(area.width);
    let h = h.min(area.height);
    let x = area.width.saturating_sub(w) / 2;
    let y = area.height.saturating_sub(h) / 2;
    TuiRect::new(x, y, w, h)
}

fn render_filter_popup(frame: &mut Frame, app: &App) {
    let Some(popup) = &app.filter_popup else {
        return;
    };
    let n_styles = popup.available_styles.len();
    // Height: 1 header + 1 "All" + n_styles + 1 blank + 2 score lines + 1 rejected + 1 blank + 1 hint + 2 borders
    let h = (10 + n_styles as u16).min(frame.area().height);
    let popup_area = popup_rect(frame, 52, h);

    frame.render_widget(Clear, popup_area);
    let block = Block::default()
        .title(" Filter ")
        .borders(Borders::ALL)
        .style(Style::default().bg(Color::Black))
        .border_style(Style::default().fg(Color::Yellow));
    let inner = block.inner(popup_area);
    frame.render_widget(block, popup_area);

    let focused_score = popup.focused_field != FilterField::StyleRadio;
    let score_style = |f: FilterField| -> Style {
        if popup.focused_field == f {
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD)
        } else {
            Style::default()
        }
    };
    let radio_style = |idx: usize| -> Style {
        if popup.selected_style_idx == idx && popup.focused_field == FilterField::StyleRadio {
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD)
        } else if popup.selected_style_idx == idx {
            Style::default().fg(Color::White)
        } else {
            Style::default().fg(Color::DarkGray)
        }
    };

    let style_header = if focused_score {
        Style::default().fg(Color::DarkGray)
    } else {
        Style::default().add_modifier(Modifier::BOLD)
    };

    let mut lines = vec![Line::from(Span::styled("Ballot style:", style_header))];
    let all_dot = if popup.selected_style_idx == 0 {
        "●"
    } else {
        " "
    };
    lines.push(Line::from(Span::styled(
        format!("  ({all_dot}) All"),
        radio_style(0),
    )));
    for (i, style) in popup.available_styles.iter().enumerate() {
        let dot = if popup.selected_style_idx == i + 1 {
            "●"
        } else {
            " "
        };
        lines.push(Line::from(Span::styled(
            format!("  ({dot}) {style}"),
            radio_style(i + 1),
        )));
    }
    lines.push(Line::from(""));
    lines.push(Line::from(vec![
        Span::raw("Bubble score min:  "),
        Span::styled(
            format!("[{:<8}]", popup.score_min),
            score_style(FilterField::ScoreMin),
        ),
    ]));
    lines.push(Line::from(vec![
        Span::raw("Bubble score max:  "),
        Span::styled(
            format!("[{:<8}]", popup.score_max),
            score_style(FilterField::ScoreMax),
        ),
    ]));
    lines.push(Line::from(format!(
        "[{}] Show rejected",
        if popup.show_rejected { "x" } else { " " }
    )));
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "j/k: style  Tab: field  Enter: apply  Esc: cancel",
        Style::default().fg(Color::DarkGray),
    )));
    frame.render_widget(Paragraph::new(lines), inner);
}

fn render_copy_dialog(frame: &mut Frame, app: &App) {
    let Some(dialog) = &app.copy_dialog else {
        return;
    };
    let w = 70u16.min(frame.area().width);
    let h = (3 + dialog.items.len() as u16 + 2).min(frame.area().height);
    let popup_area = popup_rect(frame, w, h);

    frame.render_widget(Clear, popup_area);
    let block = Block::default()
        .title(" Copy (press 1/2/3, Esc to cancel) ")
        .borders(Borders::ALL)
        .style(Style::default().bg(Color::Black))
        .border_style(Style::default().fg(Color::Green));
    let inner = block.inner(popup_area);
    frame.render_widget(block, popup_area);

    let mut lines = Vec::new();
    for (i, (label, value)) in dialog.items.iter().enumerate() {
        let truncated = if value.len() > (inner.width as usize).saturating_sub(8) {
            let keep = (inner.width as usize).saturating_sub(11);
            format!("...{}", &value[value.len().saturating_sub(keep)..])
        } else {
            value.clone()
        };
        lines.push(Line::from(vec![
            Span::styled(
                format!("  {}. ", i + 1),
                Style::default()
                    .fg(Color::Yellow)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(format!("{label}: "), Style::default().fg(Color::DarkGray)),
            Span::raw(truncated),
        ]));
    }
    frame.render_widget(Paragraph::new(lines), inner);
}

fn render_help(frame: &mut Frame) {
    // Size is computed from actual content width so the popup tightly fits.
    let popup_area = popup_rect(frame, 58, 24);

    frame.render_widget(Clear, popup_area);
    let block = Block::default()
        .title(" Help (any key to close) ")
        .borders(Borders::ALL)
        .style(Style::default().bg(Color::Black))
        .border_style(Style::default().fg(Color::Cyan));
    let inner = block.inner(popup_area);
    frame.render_widget(block, popup_area);

    let bold = Style::default().add_modifier(Modifier::BOLD);
    let lines = vec![
        Line::from(Span::styled("Navigation", bold)),
        Line::from("  j / ↓      Move down in list"),
        Line::from("  k / ↑      Move up in list"),
        Line::from("  h / ←      Focus left pane"),
        Line::from("  l / →      Focus right pane"),
        Line::from("  g / G      Jump to top / bottom"),
        Line::from("  Enter / Space   Select item"),
        Line::from(""),
        Line::from(Span::styled("Preview", bold)),
        Line::from("  f           View front image"),
        Line::from("  b           View back image"),
        Line::from("  v           Toggle interpretation view"),
        Line::from("  i           Toggle score overlay on image"),
        Line::from("  c           Copy ballot info to clipboard"),
        Line::from(""),
        Line::from(Span::styled("Filtering", bold)),
        Line::from("  /           Open filter popup"),
        Line::from("  r           Toggle show rejected ballots"),
        Line::from("  Esc         Close filter / cancel"),
        Line::from(""),
        Line::from("  ?  Show this help  |  q  Quit"),
    ];
    frame.render_widget(
        Paragraph::new(lines).style(Style::default().bg(Color::Black)),
        inner,
    );
}

// ===== CLI & Main =====

#[derive(Debug, clap::Parser)]
#[command(
    name = "cvr-browser",
    about = "Browse CVR directories and inspect ballot images and scores"
)]
struct Options {
    /// Path to a CVR directory or zip file (any depth)
    path: PathBuf,
}

fn main() -> Result<()> {
    color_eyre::install()?;
    let options = Options::parse();

    let source = if options
        .path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("zip"))
    {
        Source::new_zip(options.path)
    } else {
        Source::new_dir(options.path)
    };

    let machines = load_machines(&source)?;

    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;

    let picker = Picker::from_query_stdio().unwrap_or_else(|_| Picker::halfblocks());
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut app = App::new(source, machines, picker);
    if !app.machines.is_empty() {
        app.load_machine_ballots();
        // Auto-load first ballot if available
        if !app.filtered_ballots.is_empty() {
            app.load_selected_ballot();
        }
    }

    let result = run_app(&mut terminal, &mut app);

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;

    result
}

fn run_app(terminal: &mut Terminal<CrosstermBackend<io::Stdout>>, app: &mut App) -> Result<()> {
    loop {
        // Fire debounced image load once the user pauses navigation.
        if app.image_load_due.is_some_and(|t| Instant::now() >= t) {
            app.load_selected_ballot();
        }

        terminal.draw(|f| render(f, app))?;

        // Wake up promptly when the debounce deadline arrives.
        let timeout = app.image_load_due.map_or(Duration::from_millis(100), |t| {
            t.saturating_duration_since(Instant::now())
        });

        if event::poll(timeout)? {
            if let Event::Key(key_event) = event::read()? {
                if !app.handle_key(key_event.code) {
                    return Ok(());
                }
            }
        }
    }
}
