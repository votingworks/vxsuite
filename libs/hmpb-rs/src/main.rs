mod columns;
mod doc;
mod html;
mod text;
mod vx;

use std::cell::RefCell;
use std::sync::Arc;
use std::time::Instant;

use rayon::prelude::*;
use serde_json::Value;

use text::Fonts;
use vx::{Assets, Ballot};

const FONT_FILES: [&str; 4] = [
    "roboto-400-normal.ttf",
    "roboto-700-normal.ttf",
    "roboto-400-italic.ttf",
    "roboto-700-italic.ttf",
];

thread_local!(static FONTS: RefCell<Option<Fonts>> = const { RefCell::new(None) });

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let assets_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets");
    let read = |f: &str| std::fs::read(assets_dir.join(f)).unwrap();
    let real_dir = matches!(args.get(1).map(String::as_str), Some("real" | "group"))
        .then(|| std::path::PathBuf::from(&args[2]));
    let election_path = match &real_dir {
        Some(dir) => dir.join("election.parsed.json"),
        None => args
            .iter()
            .find_map(|a| a.strip_prefix("--election="))
            .map(std::path::PathBuf::from)
            .unwrap_or(assets_dir.join("../../fixtures/data/electionGeneral/election.json")),
    };
    let election: Value = serde_json::from_slice(&std::fs::read(election_path).unwrap()).unwrap();
    let fonts: Vec<Arc<Vec<u8>>> = FONT_FILES.iter().map(|f| Arc::new(read(f))).collect();

    let mut fontdb = usvg::fontdb::Database::new();
    for f in &fonts {
        fontdb.load_font_data(f.to_vec());
    }
    let usvg_opts = Arc::new(usvg::Options {
        fontdb: Arc::new(fontdb),
        font_family: "Roboto".into(),
        ..Default::default()
    });
    let svg = |data: &[u8]| Arc::new(usvg::Tree::from_data(data, &usvg_opts).unwrap());
    let assets = Assets {
        strings: serde_json::from_slice(&read("strings.json")).unwrap(),
        seal: election["seal"]
            .as_str()
            .and_then(|s| usvg::Tree::from_data(s.as_bytes(), &usvg_opts).ok())
            .map(Arc::new),
        fill_bubble: svg(&read("fill_bubble.svg")),
        write_in: svg(
            &strip_foreign_object(&String::from_utf8(read("write_in.svg")).unwrap()).into_bytes(),
        ),
        arrow: svg(&read("arrow.svg")),
        usvg: usvg_opts.clone(),
    };
    let ballot_hash = match &real_dir {
        Some(dir) => std::fs::read_to_string(dir.join("ballot_hash.txt"))
            .unwrap()
            .trim()
            .to_string(),
        None => args
            .iter()
            .find_map(|a| a.strip_prefix("--hash="))
            .unwrap_or("ef96cc6000000000000000000000000000000000000000000000000000000000")
            .to_string(),
    };

    let mut jobs: Vec<Job> = vec![];
    let find_style = |id: &Value| {
        election["ballotStyles"]
            .as_array()
            .unwrap()
            .iter()
            .find(|bs| bs["id"] == *id)
            .unwrap()
            .clone()
    };
    if let Some(dir) = &real_dir {
        let real_jobs: Vec<Value> =
            serde_json::from_slice(&std::fs::read(dir.join("jobs.json")).unwrap()).unwrap();
        for j in real_jobs {
            jobs.push(Job {
                key: j["index"].to_string(),
                style: find_style(&j["styleId"]),
                precinct_id: j["precinctId"].as_str().unwrap().to_string(),
                contests: j["contests"].as_array().unwrap().clone(),
                ballot_type: j["ballotType"].as_str().unwrap_or("precinct").to_string(),
                ballot_mode: j["ballotMode"].as_str().unwrap_or("official").to_string(),
            });
        }
    } else {
        for bs in election["ballotStyles"].as_array().unwrap() {
            let districts: Vec<&Value> = bs["districts"].as_array().unwrap().iter().collect();
            let contests: Vec<Value> = election["contests"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|c| districts.contains(&&c["districtId"]))
                .cloned()
                .collect();
            for p in bs["precincts"].as_array().unwrap() {
                let p = p.as_str().unwrap();
                jobs.push(Job {
                    key: format!("{}-{p}", bs["id"].as_str().unwrap()),
                    style: bs.clone(),
                    precinct_id: p.to_string(),
                    contests: contests.clone(),
                    ballot_type: "precinct".into(),
                    ballot_mode: "official".into(),
                });
            }
        }
    }
    let with_fonts = |f: &mut dyn FnMut(&mut Fonts)| {
        FONTS.with(|cell| {
            let mut cell = cell.borrow_mut();
            f(cell.get_or_insert_with(|| Fonts::new(&fonts)))
        })
    };
    let render_one = |i: usize| {
        let mut out = None;
        with_fonts(&mut |fonts| {
            out = Some(vx::render(
                fonts,
                &assets,
                &job_ballot(&election, &ballot_hash, &jobs[i % jobs.len()]),
            ))
        });
        out.unwrap()
    };

    match args.get(1).map(String::as_str) {
        Some("render" | "real") => {
            let out = real_dir
                .clone()
                .unwrap_or_else(|| std::path::PathBuf::from(&args[2]));
            let mut positions = serde_json::Map::new();
            for (i, Job { key, style, .. }) in jobs.iter().enumerate() {
                let t0 = Instant::now();
                match render_one(i) {
                    Ok((pdf, bubbles)) => {
                        std::fs::write(out.join(format!("rust-{key}.pdf")), pdf).unwrap();
                        let entry = serde_json::json!({ "styleId": style["id"], "bubbles": bubbles.iter().map(|b| serde_json::json!([b.page, b.id, b.column, b.row])).collect::<Vec<_>>() });
                        positions.insert(key.clone(), entry);
                        println!("OK {key} {:.1}ms", t0.elapsed().as_secs_f64() * 1e3);
                    }
                    Err(e) => println!("LAYOUT_ERROR {key} {e:?}"),
                }
            }
            std::fs::write(
                out.join("rust-positions.json"),
                serde_json::to_string_pretty(&positions).unwrap(),
            )
            .unwrap();
        }
        Some("group") => {
            let by = args
                .iter()
                .find_map(|a| a.strip_prefix("--by="))
                .unwrap_or("ballot");
            let threads: usize = args
                .iter()
                .find_map(|a| a.strip_prefix("--threads="))
                .map_or(16, |t| t.parse().unwrap());
            rayon::ThreadPoolBuilder::new()
                .num_threads(threads)
                .build_global()
                .unwrap();
            let group_key = |j: &Job| match by {
                "ballot" => j.key.clone(),
                "precinct" => j.precinct_id.clone(),
                "style" => j.style["id"].as_str().unwrap().to_string(),
                "all" => "all".to_string(),
                other => panic!("unknown grouping {other}"),
            };
            let mut groups: std::collections::BTreeMap<String, Vec<usize>> = Default::default();
            for (i, j) in jobs.iter().enumerate() {
                groups.entry(group_key(j)).or_default().push(i);
            }
            let out = real_dir.as_ref().unwrap().join(format!("group-{by}"));
            let _ = std::fs::remove_dir_all(&out);
            std::fs::create_dir_all(&out).unwrap();
            let t0 = Instant::now();
            let results: Vec<(String, usize, Vec<Value>)> = groups
                .par_iter()
                .map(|(key, indices)| {
                    let mut pdf = krilla::Document::new();
                    let mut manifest = vec![];
                    let mut first_page = 1;
                    for &i in indices {
                        let job = &jobs[i];
                        let mut pages = 0;
                        with_fonts(&mut |fonts| pages = vx::render_into(fonts, &assets, &job_ballot(&election, &ballot_hash, job), &mut pdf).unwrap().0);
                        manifest.push(serde_json::json!({
                            "index": job.key, "styleId": job.style["id"], "precinctId": job.precinct_id,
                            "ballotType": job.ballot_type, "ballotMode": job.ballot_mode, "firstPage": first_page, "pageCount": pages,
                        }));
                        first_page += pages;
                    }
                    let bytes = pdf.finish().unwrap();
                    let file = format!("{}.pdf", key.replace(['/', ' '], "_"));
                    std::fs::write(out.join(&file), &bytes).unwrap();
                    (file, bytes.len(), manifest)
                })
                .collect();
            let elapsed = t0.elapsed().as_secs_f64();
            let manifest: serde_json::Map<String, Value> = results
                .iter()
                .map(|(f, _, m)| (f.clone(), Value::from(m.clone())))
                .collect();
            std::fs::write(
                out.join("manifest.json"),
                serde_json::to_string_pretty(&manifest).unwrap(),
            )
            .unwrap();
            let total: usize = results.iter().map(|r| r.1).sum();
            println!(
                "by={by} ballots={} files={} total={:.1}MB perBallot={:.1}KB time={:.2}s ({:.2}ms/ballot)",
                jobs.len(),
                results.len(),
                total as f64 / 1048576.0,
                total as f64 / jobs.len() as f64 / 1024.0,
                elapsed,
                elapsed * 1e3 / jobs.len() as f64
            );
        }
        _ => {
            let n: usize = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(500);
            let threads: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(1);
            rayon::ThreadPoolBuilder::new()
                .num_threads(threads)
                .build_global()
                .unwrap();
            let t0 = Instant::now();
            let bytes: usize = (0..n)
                .into_par_iter()
                .map(|i| render_one(i).unwrap().0.len())
                .sum();
            let el = t0.elapsed().as_secs_f64() * 1e3;
            println!(
                "{{\"n\":{n},\"threads\":{threads},\"msPerBallot\":{:.3},\"cpuMsPerBallot\":{:.3},\"avgPdfKB\":{:.1}}}",
                el / n as f64,
                el * threads as f64 / n as f64,
                bytes as f64 / n as f64 / 1024.0
            );
        }
    }
}

fn job_ballot<'a>(election: &'a Value, ballot_hash: &'a str, job: &'a Job) -> Ballot<'a> {
    Ballot {
        election,
        style: &job.style,
        precinct_id: &job.precinct_id,
        contests: job.contests.iter().collect(),
        ballot_hash,
        ballot_type: &job.ballot_type,
        ballot_mode: &job.ballot_mode,
    }
}

struct Job {
    key: String,
    style: Value,
    precinct_id: String,
    contests: Vec<Value>,
    ballot_type: String,
    ballot_mode: String,
}

fn strip_foreign_object(svg: &str) -> String {
    match (svg.find("<foreignObject"), svg.find("</foreignObject>")) {
        (Some(a), Some(b)) => format!("{}{}", &svg[..a], &svg[b + "</foreignObject>".len()..]),
        _ => svg.to_string(),
    }
}
