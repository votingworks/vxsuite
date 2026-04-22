/// Convert HTML rich text (as used in ballot measure descriptions) to Typst markup.
///
/// Handles: <p>, <strong>/<b>, <em>/<i>, <u>, <s>, <ol>/<ul>/<li>, <table>, <img>, <br>
pub fn html_to_typst(html: &str) -> String {
    let mut output = String::new();
    let mut bold = false;
    let mut italic = false;
    let mut underline = false;
    let mut strikethrough = false;
    let mut in_ordered_list = false;
    let mut in_unordered_list = false;
    let mut list_counter = 0usize;
    let mut in_cell = false;
    let mut in_table = false;
    let mut row_cells: Vec<(String, bool)> = Vec::new(); // (content, is_header)
    let mut cell_content = String::new();
    let mut pending_text = String::new();

    let tag_re = regex_lite::Regex::new(r"<(/?)(\w+)([^>]*)>|([^<]+)").expect("valid regex");

    for cap in tag_re.captures_iter(html) {
        if let Some(text_match) = cap.get(4) {
            let text = decode_entities(text_match.as_str().trim());
            if text.is_empty() {
                continue;
            }

            // Apply inline formatting
            let mut formatted = text.clone();
            if bold { formatted = format!("*{formatted}*"); }
            if italic { formatted = format!("_{formatted}_"); }
            if underline { formatted = format!("#underline[{formatted}]"); }
            if strikethrough { formatted = format!("#strike[{formatted}]"); }

            if in_cell {
                cell_content.push_str(&formatted);
            } else {
                pending_text.push_str(&formatted);
            }
            continue;
        }

        let closing = cap.get(1).map_or("", |m| m.as_str()) == "/";
        let tag = cap.get(2).map_or("", |m| m.as_str()).to_lowercase();
        let attrs = cap.get(3).map_or("", |m| m.as_str());

        match tag.as_str() {
            "strong" | "b" => bold = !closing,
            "em" | "i" => italic = !closing,
            "u" => underline = !closing,
            "s" => strikethrough = !closing,

            "p" | "div" if closing => {
                if !in_cell && !in_ordered_list && !in_unordered_list {
                    let text = pending_text.trim().to_string();
                    if !text.is_empty() {
                        output.push_str(&text);
                        output.push_str("\n\n");
                    }
                    pending_text.clear();
                }
            }

            "br" => {
                if !in_cell {
                    output.push_str(&pending_text);
                    output.push_str(" \\\n");
                    pending_text.clear();
                }
            }

            "ol" if !closing => {
                flush_pending(&mut output, &mut pending_text);
                in_ordered_list = true;
                list_counter = 0;
            }
            "ol" if closing => {
                in_ordered_list = false;
                output.push('\n');
            }
            "ul" if !closing => {
                flush_pending(&mut output, &mut pending_text);
                in_unordered_list = true;
            }
            "ul" if closing => {
                in_unordered_list = false;
                output.push('\n');
            }
            "li" if !closing => {
                pending_text.clear();
                list_counter += 1;
            }
            "li" if closing => {
                let text = pending_text.trim().to_string();
                if !text.is_empty() {
                    if in_ordered_list {
                        output.push_str(&format!("+ {text}\n"));
                    } else {
                        output.push_str(&format!("- {text}\n"));
                    }
                }
                pending_text.clear();
            }

            "table" if !closing => {
                flush_pending(&mut output, &mut pending_text);
                in_table = true;
            }
            "table" if closing => {
                in_table = false;
            }
            "tr" if !closing => {
                row_cells.clear();
            }
            "tr" if closing => {
                if !row_cells.is_empty() {
                    // Determine number of columns from first row
                    let num_cols = row_cells.len();
                    let is_header = row_cells.iter().any(|(_, h)| *h);

                    if is_header {
                        // Start a table with header row
                        output.push_str(&format!(
                            "#table(columns: {num_cols}, table.header({}),\n",
                            row_cells.iter()
                                .map(|(c, _)| format!("[*{c}*]"))
                                .collect::<Vec<_>>()
                                .join(", ")
                        ));
                    } else {
                        // Data row — just add cells
                        output.push_str(&format!(
                            "  {}\n",
                            row_cells.iter()
                                .map(|(c, _)| format!("[{c}]"))
                                .collect::<Vec<_>>()
                                .join(", ")
                        ));
                    }
                }
                // Close table if last row (we'll handle this in table closing)
            }
            // Close the table
            "table" if closing => {
                output.push_str(")\n\n");
                in_table = false;
            }
            "th" if !closing => {
                in_cell = true;
                cell_content.clear();
            }
            "th" if closing => {
                row_cells.push((cell_content.trim().to_string(), true));
                cell_content.clear();
                in_cell = false;
            }
            "td" if !closing => {
                in_cell = true;
                cell_content.clear();
            }
            "td" if closing => {
                row_cells.push((cell_content.trim().to_string(), false));
                cell_content.clear();
                in_cell = false;
            }

            "img" if !closing => {
                // Extract src for data URI images
                let src_re = regex_lite::Regex::new(r#"src="(data:[^"]+)""#).expect("valid regex");
                if let Some(src_cap) = src_re.captures(attrs) {
                    if let Some(src) = src_cap.get(1) {
                        // For data URIs, we'd need to save to a file and reference it
                        // For now, just note it as a placeholder
                        output.push_str(&format!(
                            "// embedded image: {}\n",
                            &src.as_str()[..src.as_str().len().min(60)]
                        ));
                    }
                }
            }

            // Ignore structural tags
            "colgroup" | "col" | "tbody" | "thead" => {}

            _ => {}
        }
    }

    // Flush remaining
    flush_pending(&mut output, &mut pending_text);

    // Close any open table
    if in_table {
        output.push_str(")\n");
    }

    output.trim().to_string()
}

fn flush_pending(output: &mut String, pending: &mut String) {
    let text = pending.trim().to_string();
    if !text.is_empty() {
        output.push_str(&text);
        output.push_str("\n\n");
    }
    pending.clear();
}

fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .replace('\n', " ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_paragraph() {
        let html = "<p>Hello world</p>";
        let typst = html_to_typst(html);
        assert_eq!(typst, "Hello world");
    }

    #[test]
    fn test_bold_and_italic() {
        let html = "<p><strong>Bold</strong> and <em>italic</em></p>";
        let typst = html_to_typst(html);
        assert!(typst.contains("*Bold*"));
        assert!(typst.contains("_italic_"));
    }

    #[test]
    fn test_ordered_list() {
        let html = "<ol><li><p>First</p></li><li><p>Second</p></li></ol>";
        let typst = html_to_typst(html);
        assert!(typst.contains("+ First"));
        assert!(typst.contains("+ Second"));
    }

    #[test]
    fn test_unordered_list() {
        let html = "<ul><li><p>Bullet one</p></li><li><p>Bullet two</p></li></ul>";
        let typst = html_to_typst(html);
        assert!(typst.contains("- Bullet one"));
        assert!(typst.contains("- Bullet two"));
    }

    #[test]
    fn test_underline_and_strikethrough() {
        let html = "<p><u>underlined</u> and <s>struck</s></p>";
        let typst = html_to_typst(html);
        assert!(typst.contains("#underline[underlined]"));
        assert!(typst.contains("#strike[struck]"));
    }
}
