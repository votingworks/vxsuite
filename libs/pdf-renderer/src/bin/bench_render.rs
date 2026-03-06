use std::fs;
use std::path::Path;
use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let html_path = args.get(1).expect("Usage: bench-render <html-file>");
    let html = fs::read_to_string(Path::new(html_path)).expect("read HTML");
    eprintln!("HTML size: {} KB", html.len() / 1024);

    // Warmup
    let _ = run_pipeline(&html);

    // Timed run
    let n = 5;
    for i in 0..n {
        eprintln!("\n--- Run {}/{} ---", i + 1, n);
        run_pipeline(&html);
    }
}

fn run_pipeline(html: &str) {
    let t0 = Instant::now();
    let parsed = pdf_renderer::dom::parse_html(html).expect("parse");
    let t1 = Instant::now();
    let mut styles = pdf_renderer::style::resolve_styles(&parsed);
    let t2 = Instant::now();
    let fonts = pdf_renderer::fonts::load_fonts(&styles.font_faces);
    let t3 = Instant::now();
    let layout = pdf_renderer::layout::compute_layout(&parsed.document, &mut styles, &fonts);
    let t4 = Instant::now();
    let pdf = pdf_renderer::paint::render_pdf(&layout, &styles, &fonts);
    let t5 = Instant::now();

    eprintln!(
        "parse={:.1}ms  style={:.1}ms  fonts={:.1}ms  layout={:.1}ms  paint={:.1}ms  TOTAL={:.1}ms  pdf={}KB",
        ms(t1, t0), ms(t2, t1), ms(t3, t2), ms(t4, t3), ms(t5, t4), ms(t5, t0),
        pdf.len() / 1024,
    );
}

fn ms(end: Instant, start: Instant) -> f64 {
    end.duration_since(start).as_secs_f64() * 1000.0
}
