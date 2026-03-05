//! Generate Chromium reference PDFs and PNGs for all test cases.
//!
//! Usage:
//!   cargo run --bin update-references
//!
//! Launches headless Chromium once, iterates all `.html` files in
//! `test-cases/`, prints each to PDF via CDP, then rasterizes to PNG
//! via `pdftoppm`. Saves `<name>.reference.pdf` and `<name>.reference.png`
//! alongside each HTML file.
//!
//! Skips files whose HTML content hasn't changed (based on a hash marker
//! stored in `<name>.reference.hash`).

use headless_chrome::types::PrintToPdfOptions;
use headless_chrome::Browser;
use image::RgbImage;
use pdf_renderer::diff;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

fn hash_content(content: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    hasher.finish()
}

fn find_test_cases(base_dir: &Path) -> Vec<PathBuf> {
    let mut cases = Vec::new();
    collect_html_files(base_dir, &mut cases);
    cases.sort();
    cases
}

fn collect_html_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && path.file_name().map_or(true, |n| n != "fonts") {
            collect_html_files(&path, out);
        } else if path.extension().map_or(false, |e| e == "html") {
            out.push(path);
        }
    }
}

fn rasterize_reference(pdf_path: &Path) -> RgbImage {
    let stem = pdf_path.with_extension("");
    diff::pdf_to_png(pdf_path, &stem.with_extension("ref-tmp"))
}

fn main() {
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let test_cases_dir = crate_dir.join("test-cases");

    if !test_cases_dir.exists() {
        eprintln!("No test-cases/ directory found at {}", test_cases_dir.display());
        std::process::exit(1);
    }

    let cases = find_test_cases(&test_cases_dir);
    if cases.is_empty() {
        eprintln!("No .html files found in {}", test_cases_dir.display());
        return;
    }

    eprintln!("Found {} test case(s), launching browser...", cases.len());

    let browser = Browser::default().expect("failed to launch headless Chrome");
    let tab = browser.new_tab().expect("failed to create tab");

    let mut updated = 0u32;
    let mut skipped = 0u32;

    for html_path in &cases {
        let html_content = fs::read_to_string(html_path).expect("read HTML");
        let content_hash = hash_content(&html_content);

        let hash_path = html_path.with_extension("reference.hash");
        if hash_path.exists() {
            let stored = fs::read_to_string(&hash_path).unwrap_or_default();
            if stored.trim() == content_hash.to_string() {
                skipped += 1;
                continue;
            }
        }

        let relative = html_path.strip_prefix(crate_dir).unwrap_or(html_path);
        eprintln!("  Updating: {}", relative.display());

        let file_url = format!("file://{}", html_path.display());
        tab.navigate_to(&file_url).expect("navigate");
        tab.wait_until_navigated().expect("wait for navigation");

        // Parse page dimensions from body style
        let (width_in, height_in) = parse_page_dimensions(&html_content);

        let pdf_options = PrintToPdfOptions {
            paper_width: Some(width_in),
            paper_height: Some(height_in),
            margin_top: Some(0.0),
            margin_bottom: Some(0.0),
            margin_left: Some(0.0),
            margin_right: Some(0.0),
            print_background: Some(true),
            prefer_css_page_size: Some(true),
            ..PrintToPdfOptions::default()
        };

        let pdf_bytes = tab.print_to_pdf(Some(pdf_options)).expect("print to PDF");

        let pdf_path = html_path.with_extension("reference.pdf");
        fs::write(&pdf_path, &pdf_bytes).expect("write PDF");

        let png = rasterize_reference(&pdf_path);
        let png_path = html_path.with_extension("reference.png");
        png.save(&png_path).expect("save PNG");

        // Clean up temp file from pdftoppm
        let tmp_png = html_path.with_extension("ref-tmp-1.png");
        let _ = fs::remove_file(tmp_png);

        fs::write(&hash_path, content_hash.to_string()).expect("write hash");
        updated += 1;
    }

    eprintln!("Done: {updated} updated, {skipped} skipped (unchanged).");
}

/// Parse body width/height from CSS to get page dimensions in inches.
///
/// Looks for `width: <N>pt` and `height: <N>pt` in body styles.
/// Falls back to US Letter (8.5 x 11 inches).
fn parse_page_dimensions(html: &str) -> (f64, f64) {
    let default_w = 8.5;
    let default_h = 11.0;

    // Simple extraction: find body { ... } and parse width/height
    let Some(body_start) = html.find("body") else {
        return (default_w, default_h);
    };
    let Some(brace_start) = html[body_start..].find('{') else {
        return (default_w, default_h);
    };
    let Some(brace_end) = html[body_start + brace_start..].find('}') else {
        return (default_w, default_h);
    };
    let body_css = &html[body_start + brace_start + 1..body_start + brace_start + brace_end];

    let width = parse_pt_value(body_css, "width").map_or(default_w, |pt| pt / 72.0);
    let height = parse_pt_value(body_css, "height").map_or(default_h, |pt| pt / 72.0);

    (width, height)
}

fn parse_pt_value(css: &str, property: &str) -> Option<f64> {
    let pattern = format!("{property}:");
    let start = css.find(&pattern)?;
    let rest = &css[start + pattern.len()..];
    let rest = rest.trim_start();
    let end = rest.find("pt")?;
    rest[..end].trim().parse::<f64>().ok()
}
