use serde_json::{json, Value};
use std::path::Path;

use crate::html_to_typst;

/// Prepare the JSON data structure that the Typst ballot template consumes.
///
/// This handles:
/// - Filtering contests for the given ballot style
/// - Converting HTML descriptions to Typst markup
/// - Computing ballot title based on mode
/// - Formatting dates
/// - Setting up page structure (pagination is done by Typst's layout engine)
pub fn prepare_ballot_data(
    election: &Value,
    ballot_style_id: &str,
    precinct_id: &str,
    ballot_mode: &str,
    template_dir: &Path,
) -> Result<Value, Box<dyn std::error::Error>> {
    // Find the ballot style
    let ballot_styles = election["ballotStyles"]
        .as_array()
        .ok_or("No ballotStyles in election")?;
    let ballot_style = ballot_styles
        .iter()
        .find(|bs| bs["id"].as_str() == Some(ballot_style_id))
        .ok_or_else(|| format!("Ballot style '{ballot_style_id}' not found"))?;

    let districts: Vec<&str> = ballot_style["districts"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();

    // Filter and transform contests
    let all_contests = election["contests"]
        .as_array()
        .ok_or("No contests in election")?;

    let mut candidate_contests = Vec::new();
    let mut yesno_contests = Vec::new();

    for contest in all_contests {
        let district_id = contest["districtId"].as_str().unwrap_or("");
        if !districts.contains(&district_id) {
            continue;
        }

        match contest["type"].as_str() {
            Some("candidate") => {
                let parties = election["parties"].as_array();
                let candidates: Vec<Value> = contest["candidates"]
                    .as_array()
                    .unwrap_or(&Vec::new())
                    .iter()
                    .map(|c| {
                        let party_name = c["partyIds"]
                            .as_array()
                            .and_then(|pids| {
                                pids.iter()
                                    .filter_map(|pid| {
                                        parties?.iter().find(|p| p["id"] == *pid)
                                            .and_then(|p| p["name"].as_str())
                                    })
                                    .next()
                            });
                        json!({
                            "id": c["id"],
                            "name": c["name"],
                            "partyName": party_name,
                        })
                    })
                    .collect();

                candidate_contests.push(json!({
                    "type": "candidate",
                    "id": contest["id"],
                    "title": contest["title"],
                    "seats": contest["seats"],
                    "candidates": candidates,
                    "allowWriteIns": contest["allowWriteIns"],
                    "showParty": election["type"].as_str() != Some("primary"),
                }));
            }
            Some("yesno") => {
                // Convert HTML description to Typst markup
                let description = contest["description"].as_str().unwrap_or("");
                let typst_description = if description.contains('<') {
                    html_to_typst::html_to_typst(description)
                } else {
                    description.to_string()
                };

                yesno_contests.push(json!({
                    "type": "yesno",
                    "id": contest["id"],
                    "title": contest["title"],
                    "description": typst_description,
                    "options": [
                        { "id": contest["yesOption"]["id"], "label": contest["yesOption"]["label"] },
                        { "id": contest["noOption"]["id"], "label": contest["noOption"]["label"] },
                    ],
                }));
            }
            _ => {}
        }
    }

    // Combine contests in order: candidates first, then yesno
    let mut contests = candidate_contests;
    contests.extend(yesno_contests);

    // Compute pagination — for now, put all contests on pages with simple
    // sectioning. The Typst template handles the actual layout.
    // We group candidate contests (3 cols) and yesno contests (2 cols) separately.
    let candidate_count = contests.iter()
        .filter(|c| c["type"].as_str() == Some("candidate"))
        .count();
    let yesno_count = contests.iter()
        .filter(|c| c["type"].as_str() == Some("yesno"))
        .count();

    // Simple page structure — one page with all sections.
    // The Typst template uses its own pagination via page breaks.
    let mut pages = vec![];

    // Page 1: header + candidate contests
    let candidate_indices: Vec<usize> = (0..candidate_count).collect();
    let yesno_indices: Vec<usize> = (candidate_count..candidate_count + yesno_count).collect();

    let mut sections = vec![];
    if !candidate_indices.is_empty() {
        sections.push(json!({
            "numColumns": 3,
            "columns": [candidate_indices], // all in one group — Typst will distribute
        }));
    }
    if !yesno_indices.is_empty() {
        sections.push(json!({
            "numColumns": 2,
            "columns": [yesno_indices],
        }));
    }

    pages.push(json!({
        "pageNumber": 1,
        "sections": sections,
        "voterInstruction": "Turn ballot over and continue voting",
        "showPageInfo": true,
    }));

    // Ballot title
    let ballot_title = match ballot_mode {
        "official" => "Official Ballot",
        "sample" => "Sample Ballot",
        _ => "Test Ballot",
    };

    // Format date
    let date_str = election["date"].as_str().unwrap_or("");
    let formatted_date = format_date(date_str);

    // Precinct name
    let precinct_name = election["precincts"]
        .as_array()
        .and_then(|ps| ps.iter().find(|p| p["id"].as_str() == Some(precinct_id)))
        .and_then(|p| p["name"].as_str())
        .unwrap_or(precinct_id);

    // Paper dimensions
    let paper_size = election["ballotLayout"]["paperSize"]
        .as_str()
        .unwrap_or("letter");
    let (paper_w, paper_h) = match paper_size {
        "letter" => ("8.5in", "11in"),
        "legal" => ("8.5in", "14in"),
        _ => ("8.5in", "11in"),
    };

    // Paths to assets
    let has_seal = election["seal"].as_str().is_some();

    let config = json!({
        "paperWidth": paper_w,
        "paperHeight": paper_h,
        "ballotMode": ballot_mode,
        "ballotTitle": ballot_title,
        "formattedDate": formatted_date,
        "precinctName": precinct_name,
        "ballotStyleId": ballot_style_id,
        "hasSeal": has_seal,
        "hasFillBubbleDiagram": true,
        "hasWriteInDiagram": true,
        "watermark": if ballot_mode == "sample" { Some("SAMPLE") } else { None::<&str> },
    });

    Ok(json!({
        "election": {
            "title": election["title"],
            "state": election["state"],
            "county": election["county"],
        },
        "contests": contests,
        "pages": pages,
        "config": config,
    }))
}

fn format_date(date_str: &str) -> String {
    // Extract YYYY-MM-DD from various formats
    let digits: String = date_str
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '-')
        .collect();
    let parts: Vec<&str> = digits.split('-').filter(|s| !s.is_empty()).collect();
    if parts.len() >= 3 {
        let month = parts[1].parse::<u32>().unwrap_or(1);
        let day = parts[2].parse::<u32>().unwrap_or(1);
        let year = parts[0];
        let month_name = match month {
            1 => "January", 2 => "February", 3 => "March", 4 => "April",
            5 => "May", 6 => "June", 7 => "July", 8 => "August",
            9 => "September", 10 => "October", 11 => "November", 12 => "December",
            _ => "Unknown",
        };
        format!("{month_name} {day}, {year}")
    } else {
        date_str.to_string()
    }
}
