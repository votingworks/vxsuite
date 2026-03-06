//! Compare two PDF renders side-by-side with a pixel diff panel.
//!
//! Usage:
//!   cargo run --bin compare-pdfs -- <rust.pdf> <chromium.pdf> [output.png]
//!
//! Requires `pdftoppm` (from poppler-utils) on PATH.

use image::{GenericImage, ImageBuffer, Rgb, RgbImage};
use pdf_renderer::diff;
use std::path::Path;

const LABEL_H: u32 = 36;
const GAP: u32 = 4;

fn draw_label(canvas: &mut RgbImage, x: u32, y: u32, w: u32, text: &str, bg: Rgb<u8>) {
    for py in y..y + LABEL_H {
        for px in x..x + w {
            canvas.put_pixel(px, py, bg);
        }
    }
    let char_w = 8u32;
    let char_h = 12u32;
    let text_w = text.len() as u32 * char_w;
    let start_x = x + (w.saturating_sub(text_w)) / 2;
    let start_y = y + (LABEL_H.saturating_sub(char_h)) / 2;
    let fg = Rgb([0, 0, 0]);

    for (i, ch) in text.chars().enumerate() {
        let glyph = char_to_bitmap(ch);
        let cx = start_x + i as u32 * char_w;
        for (row, bits) in glyph.iter().enumerate() {
            for col in 0..char_w {
                if bits & (1 << (7 - col)) != 0 {
                    let px = cx + col;
                    let py = start_y + row as u32;
                    if px < x + w && py < y + LABEL_H {
                        canvas.put_pixel(px, py, fg);
                    }
                }
            }
        }
    }
}

fn char_to_bitmap(ch: char) -> [u8; 12] {
    match ch {
        'R' => [0xFC,0xC6,0xC6,0xC6,0xFC,0xD8,0xCC,0xC6,0xC6,0xC6,0x00,0x00],
        'U' => [0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0x7C,0x00,0x00],
        'S' => [0x7C,0xC6,0xC0,0xC0,0x7C,0x06,0x06,0xC6,0xC6,0x7C,0x00,0x00],
        'T' => [0xFE,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x00,0x00],
        'C' => [0x7C,0xC6,0xC0,0xC0,0xC0,0xC0,0xC0,0xC0,0xC6,0x7C,0x00,0x00],
        'H' => [0xC6,0xC6,0xC6,0xC6,0xFE,0xC6,0xC6,0xC6,0xC6,0xC6,0x00,0x00],
        'O' => [0x7C,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0x7C,0x00,0x00],
        'M' => [0xC6,0xEE,0xFE,0xD6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0x00,0x00],
        'I' => [0x7E,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x7E,0x00,0x00],
        'D' => [0xFC,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xFC,0x00,0x00],
        'F' => [0xFE,0xC0,0xC0,0xC0,0xFC,0xC0,0xC0,0xC0,0xC0,0xC0,0x00,0x00],
        'E' => [0xFE,0xC0,0xC0,0xC0,0xFC,0xC0,0xC0,0xC0,0xC0,0xFE,0x00,0x00],
        'x' => [0x00,0x00,0x00,0xC6,0x6C,0x38,0x38,0x6C,0xC6,0x00,0x00,0x00],
        '(' => [0x0C,0x18,0x30,0x30,0x30,0x30,0x30,0x30,0x18,0x0C,0x00,0x00],
        ')' => [0x30,0x18,0x0C,0x0C,0x0C,0x0C,0x0C,0x0C,0x18,0x30,0x00,0x00],
        '1' => [0x18,0x38,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x7E,0x00,0x00],
        '0' => [0x7C,0xC6,0xC6,0xCE,0xD6,0xE6,0xC6,0xC6,0xC6,0x7C,0x00,0x00],
        _ => [0x00; 12],
    }
}

fn make_comparison(rust_img: &RgbImage, chrome_img: &RgbImage) -> RgbImage {
    let w = rust_img.width().max(chrome_img.width());
    let h = rust_img.height().max(chrome_img.height());

    let rust_padded = diff::pad_to_size(rust_img, w, h);
    let chrome_padded = diff::pad_to_size(chrome_img, w, h);
    let diff_img = diff::compute_diff(&rust_padded, &chrome_padded);

    let total_w = w * 3 + GAP * 2;
    let total_h = LABEL_H + h;

    let mut canvas: RgbImage = ImageBuffer::from_pixel(total_w, total_h, Rgb([255, 255, 255]));

    draw_label(&mut canvas, 0, 0, w, "RUST", Rgb([208, 208, 208]));
    draw_label(&mut canvas, w + GAP, 0, w, "CHROMIUM", Rgb([208, 208, 208]));
    draw_label(&mut canvas, 2 * (w + GAP), 0, w, "DIFF (10x)", Rgb([255, 200, 200]));

    canvas.copy_from(&rust_padded, 0, LABEL_H).expect("paste rust");
    canvas.copy_from(&chrome_padded, w + GAP, LABEL_H).expect("paste chrome");
    canvas.copy_from(&diff_img, 2 * (w + GAP), LABEL_H).expect("paste diff");

    canvas
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("Usage: compare-pdfs <rust.pdf> <chromium.pdf> [output-prefix]");
        eprintln!("  Generates output-prefix-p1.png, output-prefix-p2.png, etc.");
        std::process::exit(1);
    }
    let rust_pdf = &args[1];
    let chrome_pdf = &args[2];
    let output_prefix = args
        .get(3)
        .map_or("ballot-diff", String::as_str)
        .trim_end_matches(".png");

    let tmp = std::env::temp_dir().join("compare-pdfs");
    std::fs::create_dir_all(&tmp).expect("create temp dir");

    let rust_pages = diff::pdf_to_pngs(Path::new(rust_pdf), &tmp.join("rust"));
    let chrome_pages = diff::pdf_to_pngs(Path::new(chrome_pdf), &tmp.join("chrome"));

    let num_pages = rust_pages.len().max(chrome_pages.len());
    let white = ImageBuffer::from_pixel(1, 1, Rgb([255, 255, 255]));

    for i in 0..num_pages {
        let rust_img = rust_pages.get(i).unwrap_or(&white);
        let chrome_img = chrome_pages.get(i).unwrap_or(&white);
        let canvas = make_comparison(rust_img, chrome_img);
        let (cw, ch) = canvas.dimensions();
        let output = format!("{output_prefix}-p{}.png", i + 1);
        canvas.save(&output).expect("save output");
        eprintln!("Saved: {output} ({cw}x{ch})");
    }
}
