//! Visual comparison integration tests.
//!
//! Discovers all `.html` files in `test-cases/`, renders each with our Rust
//! renderer, compares the rasterized output against cached Chromium reference
//! PNGs using SSIM.
//!
//! # Test protocol
//!
//! - **Exact match** → PASS
//! - **SSIM >= 0.99** → WARN (logs warning, saves diff, doesn't fail)
//! - **SSIM < 0.99** → FAIL (saves diff images to `test-output/`)
//!
//! # Marker files
//!
//! - `.approved` — the soft-pass threshold (0.99) is accepted for this test
//! - `.expected-fail` — the test is expected to fail (XFAIL); it won't count
//!   toward the failure total. When rendering improves and the test starts
//!   passing, it reports as XPASS.
//!
//! # Running
//!
//! ```sh
//! cargo test --no-default-features --test visual_comparison
//! ```
//!
//! Before first run, generate references with:
//! ```sh
//! cargo run --no-default-features --features headless_chrome --bin update-references
//! ```

use base64::Engine;
use image::RgbImage;
use image_compare::Algorithm;
use pdf_renderer::diff;
use std::fs;
use std::path::{Path, PathBuf};

const SOFT_PASS_THRESHOLD: f64 = 0.99;

struct TestCase {
    name: String,
    html_path: PathBuf,
    reference_png_path: PathBuf,
    expected_fail: bool,
}

struct TestResult {
    name: String,
    ssim: f64,
    soft_pass: bool,
    expected_fail: bool,
    diff_pixels: u64,
}

fn find_test_cases(base_dir: &Path) -> Vec<TestCase> {
    let mut cases = Vec::new();
    collect_html_files(base_dir, base_dir, &mut cases);
    cases.sort_by(|a, b| a.name.cmp(&b.name));
    cases
}

fn collect_html_files(root: &Path, dir: &Path, out: &mut Vec<TestCase>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && path.file_name().is_none_or(|n| n != "fonts") {
            collect_html_files(root, &path, out);
        } else if path.extension().is_some_and(|e| e == "html") {
            let relative = path.strip_prefix(root).unwrap_or(&path);
            let name = relative
                .with_extension("")
                .to_string_lossy()
                .replace(std::path::MAIN_SEPARATOR, "/");
            let reference_png = path.with_extension("reference.png");
            let expected_fail = path.with_extension("expected-fail").exists();
            out.push(TestCase {
                name,
                html_path: path,
                reference_png_path: reference_png,
                expected_fail,
            });
        }
    }
}

/// Resolve relative `url(...)` font references in @font-face rules to base64
/// data URIs, so the Rust renderer (which only supports data URIs) can load
/// them.
fn resolve_font_urls(html: &str, html_dir: &Path) -> String {
    let mut result = html.to_string();

    while let Some(url_start) = result.find("url(../fonts/") {
        let after_url = &result[url_start + 4..]; // skip "url("
        let Some(url_end) = after_url.find(')') else {
            break;
        };
        let relative_path = &after_url[..url_end];

        let font_path = html_dir.join(relative_path);
        if font_path.exists() {
            let font_bytes = fs::read(&font_path).expect("read font file");
            let b64 = base64::engine::general_purpose::STANDARD.encode(&font_bytes);
            let data_uri = format!("data:font/truetype;base64,{b64}");
            let old = format!("url({relative_path})");
            let new = format!("url({data_uri})");
            result = result.replacen(&old, &new, 1);
        } else {
            break;
        }
    }

    result
}

fn run_test_case(case: &TestCase, output_dir: &Path) -> TestResult {
    let html = fs::read_to_string(&case.html_path).expect("read test HTML");
    let html_dir = case.html_path.parent().expect("html parent dir");
    let processed_html = resolve_font_urls(&html, html_dir);

    let our_pdf = diff::render_html_to_pdf(&processed_html);
    let our_png = diff::pdf_bytes_to_png(&our_pdf);

    if !case.reference_png_path.exists() {
        fs::create_dir_all(output_dir).ok();
        let slug = case.name.replace('/', "_");
        our_png
            .save(output_dir.join(format!("{slug}.ours.png")))
            .ok();
        return TestResult {
            name: case.name.clone(),
            ssim: 0.0,
            soft_pass: false,
            expected_fail: case.expected_fail,
            diff_pixels: u64::MAX,
        };
    }

    let reference_png = image::open(&case.reference_png_path)
        .expect("open reference PNG")
        .to_rgb8();

    let w = our_png.width().max(reference_png.width());
    let h = our_png.height().max(reference_png.height());
    let our_padded = diff::pad_to_size(&our_png, w, h);
    let ref_padded = diff::pad_to_size(&reference_png, w, h);

    let diff_pixels = diff::count_different_pixels(&our_padded, &ref_padded);

    if diff_pixels == 0 {
        return TestResult {
            name: case.name.clone(),
            ssim: 1.0,
            soft_pass: false,
            expected_fail: case.expected_fail,
            diff_pixels: 0,
        };
    }

    let ssim = compute_ssim(&our_padded, &ref_padded);

    fs::create_dir_all(output_dir).ok();
    let slug = case.name.replace('/', "_");
    our_padded
        .save(output_dir.join(format!("{slug}.ours.png")))
        .ok();
    ref_padded
        .save(output_dir.join(format!("{slug}.reference.png")))
        .ok();
    let diff_img = diff::compute_diff(&our_padded, &ref_padded);
    diff_img
        .save(output_dir.join(format!("{slug}.diff.png")))
        .ok();
    fs::write(
        output_dir.join(format!("{slug}.ssim")),
        format!("{ssim:.6}"),
    )
    .ok();

    let soft_pass = ssim >= SOFT_PASS_THRESHOLD;

    TestResult {
        name: case.name.clone(),
        ssim,
        soft_pass,
        expected_fail: case.expected_fail,
        diff_pixels,
    }
}

fn compute_ssim(a: &RgbImage, b: &RgbImage) -> f64 {
    let a_gray = image::DynamicImage::ImageRgb8(a.clone()).into_luma8();
    let b_gray = image::DynamicImage::ImageRgb8(b.clone()).into_luma8();
    let result = image_compare::gray_similarity_structure(
        &Algorithm::MSSIMSimple,
        &a_gray,
        &b_gray,
    )
    .expect("SSIM computation");
    result.score
}

#[test]
fn visual_comparison() {
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let test_cases_dir = crate_dir.join("test-cases");
    let output_dir = crate_dir.join("test-output");

    let cases = find_test_cases(&test_cases_dir);
    assert!(
        !cases.is_empty(),
        "No test cases found in {}",
        test_cases_dir.display()
    );

    if output_dir.exists() {
        fs::remove_dir_all(&output_dir).ok();
    }

    let mut results = Vec::new();
    for case in &cases {
        if !case.reference_png_path.exists() {
            eprintln!(
                "SKIP  {} (no reference — run update-references)",
                case.name
            );
            continue;
        }
        let result = run_test_case(case, &output_dir);
        results.push(result);
    }

    eprintln!("\n--- Visual Comparison Results ---");
    let mut failures = Vec::new();
    let mut xfails = Vec::new();
    let mut xpasses = Vec::new();

    for r in &results {
        if r.diff_pixels == 0 {
            if r.expected_fail {
                eprintln!("XPASS {} (expected fail but passed!)", r.name);
                xpasses.push(r);
            } else {
                eprintln!("PASS  {}", r.name);
            }
        } else if r.soft_pass {
            if r.expected_fail {
                eprintln!(
                    "XPASS {} (SSIM={:.4}, expected fail but soft-passed)",
                    r.name, r.ssim
                );
                xpasses.push(r);
            } else {
                eprintln!(
                    "WARN  {} (SSIM={:.4}, {} pixels differ)",
                    r.name, r.ssim, r.diff_pixels
                );
            }
        } else if r.expected_fail {
            eprintln!(
                "XFAIL {} (SSIM={:.4}, {} pixels differ — expected)",
                r.name, r.ssim, r.diff_pixels
            );
            xfails.push(r);
        } else {
            eprintln!(
                "FAIL  {} (SSIM={:.4}, {} pixels differ)",
                r.name, r.ssim, r.diff_pixels
            );
            failures.push(r);
        }
    }

    if !xpasses.is_empty() {
        eprintln!(
            "\n{} test(s) unexpectedly passed — remove .expected-fail marker:",
            xpasses.len()
        );
        for r in &xpasses {
            eprintln!("  - {}", r.name);
        }
    }

    if !failures.is_empty() {
        eprintln!(
            "\n{} test(s) failed. Review diffs in: {}",
            failures.len(),
            output_dir.display()
        );
        for f in &failures {
            eprintln!("  - {} (SSIM={:.4})", f.name, f.ssim);
        }
        panic!(
            "{} visual comparison(s) failed — see test-output/ for diff images",
            failures.len()
        );
    }

    if !xfails.is_empty() {
        eprintln!("\n{} expected failure(s) (XFAIL).", xfails.len());
    }
}
