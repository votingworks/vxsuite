//! Rich-text HTML subset (VxDesign's editor output) to layout elements.
use std::sync::Arc;

use base64::Engine;
use taffy::prelude::*;

use crate::doc::{
    Borders, Color, Content, El, Picture, Svg, Table, block, flex_col, flex_row, pad,
    strut_below_baseline,
};
use crate::text::{SpanStyle, TextBlock};

#[derive(Debug)]
pub enum HNode {
    El {
        tag: String,
        attrs: Vec<(String, String)>,
        children: Vec<HNode>,
    },
    Text(String),
}

impl HNode {
    fn tag(&self) -> Option<&str> {
        match self {
            HNode::El { tag, .. } => Some(tag),
            HNode::Text(_) => None,
        }
    }
    fn attr(&self, name: &str) -> Option<&str> {
        match self {
            HNode::El { attrs, .. } => attrs
                .iter()
                .find(|(k, _)| k == name)
                .map(|(_, v)| v.as_str()),
            HNode::Text(_) => None,
        }
    }
    fn kids(&self) -> &[HNode] {
        match self {
            HNode::El { children, .. } => children,
            HNode::Text(_) => &[],
        }
    }
}

const VOID: &[&str] = &["br", "img", "col", "hr"];

pub fn decode_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        rest = &rest[i..];
        let Some(end) = rest.find(';').filter(|&e| e < 10) else {
            out.push('&');
            rest = &rest[1..];
            continue;
        };
        let ent = &rest[1..end];
        let ch = match ent {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            "nbsp" => Some('\u{a0}'),
            "rsquo" => Some('’'),
            "lsquo" => Some('‘'),
            "bull" => Some('•'),
            _ if ent.starts_with("#x") => u32::from_str_radix(&ent[2..], 16)
                .ok()
                .and_then(char::from_u32),
            _ if ent.starts_with('#') => ent[1..].parse().ok().and_then(char::from_u32),
            _ => None,
        };
        match ch {
            Some(c) => {
                out.push(c);
                rest = &rest[end + 1..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

pub fn parse(html: &str) -> Vec<HNode> {
    let mut stack: Vec<(String, Vec<(String, String)>, Vec<HNode>)> =
        vec![(String::new(), vec![], vec![])];
    let b = html.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'<' {
            let end = html[i..].find('>').map(|e| i + e).unwrap_or(b.len() - 1);
            let inner = &html[i + 1..end];
            i = end + 1;
            if let Some(name) = inner.strip_prefix('/') {
                let name = name.trim().to_ascii_lowercase();
                if let Some(pos) = stack.iter().rposition(|(t, _, _)| *t == name) {
                    while stack.len() > pos {
                        let (tag, attrs, children) = stack.pop().unwrap();
                        stack.last_mut().unwrap().2.push(HNode::El {
                            tag,
                            attrs,
                            children,
                        });
                    }
                }
                continue;
            }
            if inner.starts_with('!') {
                continue;
            }
            let self_closing = inner.ends_with('/');
            let inner = inner.trim_end_matches('/');
            let name_end = inner
                .find(|c: char| c.is_whitespace())
                .unwrap_or(inner.len());
            let tag = inner[..name_end].to_ascii_lowercase();
            let attrs = parse_attrs(&inner[name_end..]);
            if self_closing || VOID.contains(&tag.as_str()) {
                stack.last_mut().unwrap().2.push(HNode::El {
                    tag,
                    attrs,
                    children: vec![],
                });
            } else {
                stack.push((tag, attrs, vec![]));
            }
        } else {
            let end = html[i..].find('<').map(|e| i + e).unwrap_or(b.len());
            stack
                .last_mut()
                .unwrap()
                .2
                .push(HNode::Text(decode_entities(&html[i..end])));
            i = end;
        }
    }
    while stack.len() > 1 {
        let (tag, attrs, children) = stack.pop().unwrap();
        stack.last_mut().unwrap().2.push(HNode::El {
            tag,
            attrs,
            children,
        });
    }
    stack.pop().unwrap().2
}

fn parse_attrs(s: &str) -> Vec<(String, String)> {
    let mut out = vec![];
    let mut rest = s.trim();
    while !rest.is_empty() {
        let name_end = rest
            .find(|c: char| c == '=' || c.is_whitespace())
            .unwrap_or(rest.len());
        let name = rest[..name_end].to_ascii_lowercase();
        rest = rest[name_end..].trim_start();
        let mut value = String::new();
        if let Some(r) = rest.strip_prefix('=') {
            let r = r.trim_start();
            if let Some(q) = r.chars().next().filter(|c| *c == '"' || *c == '\'') {
                let close = r[1..].find(q).map(|e| e + 1).unwrap_or(r.len());
                value = decode_entities(&r[1..close]);
                rest = r.get(close + 1..).unwrap_or("").trim_start();
            } else {
                let e = r.find(char::is_whitespace).unwrap_or(r.len());
                value = r[..e].to_string();
                rest = r[e..].trim_start();
            }
        }
        if !name.is_empty() {
            out.push((name, value));
        }
    }
    out
}

pub struct RichTextStyle {
    pub font_size: f32,
    pub table_border: (f32, Color),
    pub table_header_bg: Color,
    pub usvg: Arc<usvg::Options<'static>>,
}

const INLINE: &[&str] = &[
    "strong", "b", "em", "i", "u", "s", "strike", "span", "br", "a", "sub", "sup", "code",
];

fn is_inline(n: &HNode) -> bool {
    match n {
        HNode::Text(_) => true,
        HNode::El { tag, .. } => INLINE.contains(&tag.as_str()) || tag == "img",
    }
}

#[derive(Clone, Copy, Default)]
struct Ctx {
    in_li: bool,
    in_table: bool,
}

/// Lays out a rich-text fragment as a block element.
pub fn rich_text(html: &str, st: &RichTextStyle) -> El {
    let nodes = parse(html);
    El::new(block()).children(blocks(&nodes, st, Ctx::default()))
}

fn blocks(nodes: &[HNode], st: &RichTextStyle, ctx: Ctx) -> Vec<El> {
    let elements: Vec<usize> = nodes
        .iter()
        .enumerate()
        .filter(|(_, n)| n.tag().is_some())
        .map(|(i, _)| i)
        .collect();
    let first_el = elements.first().copied();
    let last_el = elements.last().copied();
    let mut out = vec![];
    let mut i = 0;
    while i < nodes.len() {
        if is_inline(&nodes[i]) {
            let start = i;
            while i < nodes.len() && is_inline(&nodes[i]) {
                i += 1;
            }
            out.extend(inline_run(&nodes[start..i], st));
            continue;
        }
        let n = &nodes[i];
        let is_first = Some(i) == first_el;
        let is_last = Some(i) == last_el;
        let tag = n.tag().unwrap();
        let em = st.font_size;
        let vmargin = |default: f32| -> (f32, f32) {
            (
                if is_first { 0.0 } else { default },
                if is_last { 0.0 } else { default },
            )
        };
        match tag {
            "p" | "div" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "blockquote" => {
                let (mt, mb) = if tag == "p" {
                    vmargin(if ctx.in_table {
                        0.0
                    } else if ctx.in_li {
                        0.25 * em
                    } else {
                        em
                    })
                } else {
                    (0.0, 0.0)
                };
                let mut s = block();
                s.margin = taffy::Rect {
                    top: length(mt),
                    bottom: length(mb),
                    left: length(0.0),
                    right: length(0.0),
                };
                out.push(El::new(s).children(blocks(n.kids(), st, ctx)));
            }
            "ul" | "ol" => {
                let (mt, mb) = vmargin(0.0);
                let mut s = block();
                s.margin = taffy::Rect {
                    top: length(mt),
                    bottom: length(mb),
                    left: length(0.0),
                    right: length(0.0),
                };
                s.padding = pad(0.0, 0.0, 0.0, 2.0 * em);
                let mut list = El::new(s);
                let mut k = 0;
                for li in n.kids().iter().filter(|c| c.tag() == Some("li")) {
                    k += 1;
                    let marker = if tag == "ol" {
                        format!("{k}. ")
                    } else {
                        "•  ".to_string()
                    };
                    let mut item = El::new(block()).children(blocks(
                        li.kids(),
                        st,
                        Ctx { in_li: true, ..ctx },
                    ));
                    set_marker(&mut item, marker);
                    list = list.child(item);
                }
                out.push(list);
            }
            "table" => {
                let (mt, mb) = vmargin(em);
                let mut wrap = flex_row(0.0);
                wrap.margin = taffy::Rect {
                    top: length(mt),
                    bottom: length(mb),
                    left: length(0.0),
                    right: length(0.0),
                };
                out.push(El::new(wrap).child(table(n, st, ctx)));
            }
            "img" => out.extend(image(n, st)),
            _ => out.extend(blocks(n.kids(), st, ctx)),
        }
        i += 1;
    }
    out
}

fn set_marker(el: &mut El, marker: String) -> bool {
    if let Content::Text(t) = &mut el.data.content {
        t.marker = Some(marker);
        return true;
    }
    for c in &mut el.children {
        if set_marker(c, marker.clone()) {
            return true;
        }
    }
    false
}

fn table(n: &HNode, st: &RichTextStyle, ctx: Ctx) -> El {
    let (bw, bc) = st.table_border;
    let mut grid = El::new(Style {
        display: Display::Grid,
        ..Default::default()
    })
    .borders(Borders {
        top: Some((bw, bc)),
        left: Some((bw, bc)),
        ..Default::default()
    });
    let mut cols = vec![];
    for (ri, row) in collect_rows(n).iter().enumerate() {
        // `sanitize-html` (as configured for ballots) strips colspan/rowspan, so every cell spans 1x1.
        for (ci, cell) in row
            .kids()
            .iter()
            .filter(|c| matches!(c.tag(), Some("td" | "th")))
            .enumerate()
        {
            let is_th = cell.tag() == Some("th");
            // UA default: table cells are `vertical-align: middle`.
            let mut cs = flex_col(0.0);
            cs.justify_content = JustifyContent::CENTER;
            cs.padding = pad(
                0.25 * st.font_size,
                0.5 * st.font_size,
                0.25 * st.font_size,
                0.5 * st.font_size,
            );
            cs.grid_column = taffy::Line {
                start: line(ci as i16 + 1),
                end: span(1),
            };
            cs.grid_row = taffy::Line {
                start: line(ri as i16 + 1),
                end: span(1),
            };
            let mut kids = blocks(
                cell.kids(),
                st,
                Ctx {
                    in_table: true,
                    ..ctx
                },
            );
            if is_th {
                for k in &mut kids {
                    embolden(k);
                }
            }
            let mut c = El::new(cs)
                .borders(Borders {
                    right: Some((bw, bc)),
                    bottom: Some((bw, bc)),
                    ..Default::default()
                })
                .children(kids);
            if is_th {
                c = c.bg(st.table_header_bg);
            }
            grid = grid.child(c);
            cols.push(ci);
        }
    }
    let mut s = block();
    s.flex_shrink = 1.0;
    El::new(s).content(Content::Table(Box::new(Table::new(grid, cols, bw))))
}

fn collect_rows(n: &HNode) -> Vec<&HNode> {
    let mut out = vec![];
    for c in n.kids() {
        match c.tag() {
            Some("tr") => out.push(c),
            Some("tbody" | "thead" | "tfoot") => out.extend(collect_rows(c)),
            _ => {}
        }
    }
    out
}

fn embolden(el: &mut El) {
    if let Content::Text(t) = &mut el.data.content {
        t.base.bold = true;
    }
    for c in &mut el.children {
        embolden(c);
    }
}

fn image(n: &HNode, st: &RichTextStyle) -> Option<El> {
    let (mime, b64) = n
        .attr("src")?
        .strip_prefix("data:")?
        .split_once(";base64,")?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).ok()?;
    let picture = match mime {
        "image/svg+xml" => Picture::Svg(Arc::new(usvg::Tree::from_data(&bytes, &st.usvg).ok()?)),
        "image/png" => Picture::Raster(krilla::image::Image::from_png(bytes.into(), true).ok()?),
        "image/jpeg" => Picture::Raster(krilla::image::Image::from_jpeg(bytes.into(), true).ok()?),
        _ => return None,
    };
    let mut style = block();
    style.size.width = length(picture.size().0);
    style.max_size.width = percent(1.0);
    Some(El::new(style).content(Content::Svg(Svg {
        tree: picture,
        inline_gap: strut_below_baseline(st.font_size, 1.2),
        overlay: None,
    })))
}

fn inline_run(nodes: &[HNode], st: &RichTextStyle) -> Vec<El> {
    let mut out = vec![];
    let mut tb = TextBlock::new(String::new(), st.font_size, false);
    let mut pending_space = false;
    fn flush(out: &mut Vec<El>, tb: &mut TextBlock, size: f32) {
        // Trailing spaces collapse. A trailing <br> ends the last line rather than starting a new one,
        // so a block holding only a <br> is one empty line.
        while tb.text.ends_with(' ') {
            tb.text.pop();
        }
        if tb.text.ends_with('\n') {
            tb.text.pop();
            if tb.text.is_empty() {
                tb.text.push('\u{200B}');
            }
        }
        if !tb.text.is_empty() {
            let full = std::mem::replace(tb, TextBlock::new(String::new(), size, false));
            out.push(El::new(block()).content(Content::Text(full)));
        }
    }
    fn walk(
        n: &HNode,
        style: SpanStyle,
        tb: &mut TextBlock,
        pending_space: &mut bool,
        out: &mut Vec<El>,
        st: &RichTextStyle,
    ) {
        match n {
            HNode::Text(t) => {
                let start = tb.text.len();
                for ch in t.chars() {
                    if ch.is_ascii_whitespace() {
                        *pending_space = true;
                    } else {
                        if *pending_space && !tb.text.is_empty() && !tb.text.ends_with('\n') {
                            tb.text.push(' ');
                        }
                        *pending_space = false;
                        tb.text.push(ch);
                    }
                }
                if style != SpanStyle::default() && tb.text.len() > start {
                    tb.spans.push((start..tb.text.len(), style));
                }
            }
            HNode::El { tag, children, .. } => {
                let mut s = style;
                match tag.as_str() {
                    "strong" | "b" => s.bold = true,
                    "em" | "i" => s.italic = true,
                    "u" => s.underline = true,
                    "s" | "strike" => s.strike = true,
                    "br" => {
                        tb.text.push('\n');
                        *pending_space = false;
                        return;
                    }
                    "img" => {
                        flush(out, tb, st.font_size);
                        out.extend(image(n, st));
                        return;
                    }
                    _ => {}
                }
                for c in children {
                    walk(c, s, tb, pending_space, out, st);
                }
            }
        }
    }
    for n in nodes {
        walk(
            n,
            SpanStyle::default(),
            &mut tb,
            &mut pending_space,
            &mut out,
            st,
        );
    }
    flush(&mut out, &mut tb, st.font_size);
    out
}
