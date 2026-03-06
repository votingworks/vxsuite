use std::time::Instant;

/// Benchmark to measure the impact of rule indexing and layout caching.
/// Generates synthetic ballot-like HTML with ~200 CSS rules and ~1000 elements.
fn main() {
    let html = generate_ballot_html(200, 50);
    eprintln!(
        "Generated HTML: {} KB, ~{} rules, ~{} elements",
        html.len() / 1024,
        200,
        50 * 20
    );

    // --- Measure style resolution (rule indexing impact) ---
    eprintln!("\n=== Style resolution (includes rule indexing) ===");
    let parsed = pdf_renderer::dom::parse_html(&html).expect("parse");
    let compiled = pdf_renderer::style::compile_styles(&parsed.style_texts);
    let fonts = pdf_renderer::fonts::load_fonts(&compiled.font_faces);

    // Warmup
    let _ = pdf_renderer::style::apply_styles(&compiled, &parsed.document);
    let _ = pdf_renderer::style::apply_styles_no_index(&compiled, &parsed.document);

    let n = 10;
    let mut total_style_ms = 0.0;
    let mut total_style_no_index_ms = 0.0;
    for _ in 0..n {
        let t0 = Instant::now();
        let _ = pdf_renderer::style::apply_styles(&compiled, &parsed.document);
        let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
        total_style_ms += elapsed;

        let t0 = Instant::now();
        let _ = pdf_renderer::style::apply_styles_no_index(&compiled, &parsed.document);
        let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
        total_style_no_index_ms += elapsed;
    }
    let avg_indexed = total_style_ms / n as f64;
    let avg_no_index = total_style_no_index_ms / n as f64;
    eprintln!(
        "With rule index:    {:.1}ms avg",
        avg_indexed,
    );
    eprintln!(
        "Without rule index: {:.1}ms avg",
        avg_no_index,
    );
    eprintln!(
        "Rule index speedup: {:.1}x",
        avg_no_index / avg_indexed,
    );

    // --- Measure full pipeline (parse + style + layout) ---
    eprintln!("\n=== Full pipeline per call ===");
    let mut total_pipeline_ms = 0.0;
    for _ in 0..n {
        let t0 = Instant::now();
        let parsed2 = pdf_renderer::dom::parse_html(&html).expect("parse");
        let styles = pdf_renderer::style::apply_styles(&compiled, &parsed2.document);
        let mut style_result = pdf_renderer::style::StyleResult {
            styles,
            font_faces: compiled.font_faces.clone(),
        };
        let _layout =
            pdf_renderer::layout::compute_layout(&parsed2.document, &mut style_result, &fonts);
        let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
        total_pipeline_ms += elapsed;
    }
    eprintln!(
        "Full pipeline avg: {:.1}ms (over {} runs)",
        total_pipeline_ms / n as f64,
        n
    );

    // --- Simulate extractGridLayout: 10 queries on same HTML ---
    // This is what layout caching optimizes — same HTML, different selectors
    eprintln!("\n=== 10 queries on same HTML (simulates extractGridLayout) ===");
    let selectors = vec![
        ".content-slot",
        ".page",
        ".timing-mark",
        "div.header",
        "div.contest",
        ".candidate",
        ".oval",
        "div.footer",
        "div.instructions",
        "svg",
    ];

    // Without caching: each call re-parses, re-styles, re-layouts
    let mut total_uncached = 0.0;
    for _ in 0..3 {
        let t0 = Instant::now();
        for sel in &selectors {
            let p = pdf_renderer::dom::parse_html(&html).expect("parse");
            let styles = pdf_renderer::style::apply_styles(&compiled, &p.document);
            let mut sr = pdf_renderer::style::StyleResult {
                styles,
                font_faces: compiled.font_faces.clone(),
            };
            let layout = pdf_renderer::layout::compute_layout(&p.document, &mut sr, &fonts);
            let _ = pdf_renderer::layout::query_elements(&layout, &p.document, sel);
        }
        let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
        total_uncached += elapsed;
    }
    eprintln!(
        "Without caching: {:.1}ms avg for 10 queries",
        total_uncached / 3.0
    );

    // With caching: only first call does full pipeline, rest hit cache
    // Simulate by doing full pipeline once, then just query 9 more times
    let mut total_cached = 0.0;
    for _ in 0..3 {
        let t0 = Instant::now();
        // First call: full pipeline
        let p = pdf_renderer::dom::parse_html(&html).expect("parse");
        let styles = pdf_renderer::style::apply_styles(&compiled, &p.document);
        let mut sr = pdf_renderer::style::StyleResult {
            styles,
            font_faces: compiled.font_faces.clone(),
        };
        let layout = pdf_renderer::layout::compute_layout(&p.document, &mut sr, &fonts);
        let _ = pdf_renderer::layout::query_elements(&layout, &p.document, selectors[0]);
        // Remaining 9 calls: just query on cached layout
        for sel in &selectors[1..] {
            let _ = pdf_renderer::layout::query_elements(&layout, &p.document, sel);
        }
        let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
        total_cached += elapsed;
    }
    eprintln!(
        "With caching:    {:.1}ms avg for 10 queries",
        total_cached / 3.0
    );
    eprintln!(
        "Caching speedup: {:.1}x",
        total_uncached / total_cached
    );
}

/// Generate ballot-like HTML with many CSS rules and nested elements.
fn generate_ballot_html(num_rules: usize, num_contests: usize) -> String {
    let mut css = String::from(
        "* { box-sizing: border-box; }
body { width: 612pt; height: 792pt; margin: 0; padding: 36pt; display: flex; flex-direction: column; font-family: sans-serif; font-size: 9pt; }
.page { display: flex; flex-direction: column; width: 100%; }
.header { display: flex; justify-content: space-between; padding: 8pt; border-bottom: 1pt solid black; }
.content { display: flex; flex-direction: column; flex: 1; }
.footer { padding: 4pt; border-top: 1pt solid black; font-size: 7pt; }
.contest { display: flex; flex-direction: column; padding: 4pt; border: 0.5pt solid #999; margin-bottom: 2pt; }
.contest-header { font-weight: bold; font-size: 10pt; padding: 2pt 0; }
.candidate { display: flex; align-items: center; padding: 1pt 0; }
.oval { width: 12pt; height: 8pt; border: 1pt solid black; margin-right: 4pt; }
.candidate-name { flex: 1; }
.party { color: #666; font-size: 8pt; }
.timing-mark { width: 12pt; height: 4pt; background-color: black; }
.instructions { padding: 4pt; font-size: 8pt; background-color: #f0f0f0; }
.content-slot { display: flex; flex-direction: column; flex: 1; }
",
    );

    // Generate ~200 rules with various selector patterns (class, tag, compound, descendant)
    let class_names = [
        "primary", "secondary", "highlight", "selected", "disabled",
        "active", "muted", "bold-text", "italic-text", "underline",
        "small", "large", "centered", "left-align", "right-align",
        "bordered", "rounded", "shadow", "compact", "expanded",
    ];
    for i in 0..num_rules.saturating_sub(15) {
        let class = class_names[i % class_names.len()];
        match i % 5 {
            0 => css.push_str(&format!(
                ".contest .candidate.{class}-{i} {{ color: #{}{}{}; }}\n",
                (i * 37 % 256),
                (i * 53 % 256),
                (i * 71 % 256)
            )),
            1 => css.push_str(&format!(
                "div.{class}-{i} {{ font-size: {}pt; }}\n",
                8 + i % 6
            )),
            2 => css.push_str(&format!(
                ".page > .content .{class}-{i} {{ padding: {}pt; }}\n",
                1 + i % 8
            )),
            3 => css.push_str(&format!(
                ".contest-header.{class}-{i} {{ font-weight: {}; }}\n",
                if i % 2 == 0 { 700 } else { 400 }
            )),
            _ => css.push_str(&format!(
                ".{class}-{i} {{ margin: {}pt; }}\n",
                i % 5
            )),
        }
    }

    let mut body = String::from("<div class=\"page\"><div class=\"header\"><span>Election Title</span><span>Precinct Name</span></div><div class=\"instructions\">Fill in the oval completely using a black pen.</div><div class=\"content\"><div class=\"content-slot\">");

    for c in 0..num_contests {
        body.push_str(&format!(
            "<div class=\"contest\"><div class=\"contest-header\">Contest {c}</div>"
        ));
        for cand in 0..4 {
            body.push_str(&format!(
                "<div class=\"candidate\"><div class=\"oval\"></div><div class=\"candidate-name\">Candidate {c}-{cand}</div><div class=\"party\">Party {}</div></div>",
                cand % 3
            ));
        }
        body.push_str("</div>");
    }

    body.push_str("</div></div><div class=\"footer\">Page 1 of 2</div></div>");

    // Add timing marks
    for _ in 0..34 {
        body.push_str("<div class=\"timing-mark\"></div>");
    }

    format!(
        "<html><head><style>{css}</style></head><body>{body}</body></html>"
    )
}
