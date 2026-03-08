use std::collections::HashMap;

use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;

#[derive(Debug, Clone)]
pub enum DomNode {
    Element(ElementNode),
    Text(String),
}

#[derive(Debug, Clone)]
pub struct ElementNode {
    pub tag: String,
    pub attributes: HashMap<String, String>,
    pub children: Vec<DomNode>,
}

impl ElementNode {
    pub fn classes(&self) -> impl Iterator<Item = &str> {
        self.attributes
            .get("class")
            .map(|c| c.split_whitespace())
            .into_iter()
            .flatten()
    }

    pub fn get_attr(&self, name: &str) -> Option<&str> {
        self.attributes.get(name).map(String::as_str)
    }

    pub fn serialize_to_xml(&self) -> String {
        let mut xml = String::new();
        self.write_xml(&mut xml);
        xml
    }

    /// Serialize only this element's children to XML (skips the wrapper tag).
    pub fn serialize_children_to_xml(&self) -> String {
        let mut xml = String::new();
        for child in &self.children {
            match child {
                DomNode::Element(el) => el.write_xml(&mut xml),
                DomNode::Text(t) => xml.push_str(t),
            }
        }
        xml
    }

    fn write_xml(&self, out: &mut String) {
        out.push('<');
        out.push_str(&self.tag);
        // Sort attributes for deterministic output
        let mut attrs: Vec<_> = self.attributes.iter().collect();
        attrs.sort_by_key(|(k, _)| k.as_str());
        for (key, value) in &attrs {
            out.push(' ');
            out.push_str(key);
            out.push_str("=\"");
            out.push_str(&value.replace('&', "&amp;").replace('"', "&quot;").replace('<', "&lt;").replace('>', "&gt;"));
            out.push('"');
        }
        if self.children.is_empty() && VOID_ELEMENTS.contains(&self.tag.as_str()) {
            out.push_str("/>");
        } else {
            out.push('>');
            for child in &self.children {
                match child {
                    DomNode::Element(el) => el.write_xml(out),
                    DomNode::Text(t) => out.push_str(t),
                }
            }
            out.push_str("</");
            out.push_str(&self.tag);
            out.push('>');
        }
    }
}

fn parse_attributes(start: &BytesStart) -> HashMap<String, String> {
    let mut attrs = HashMap::new();
    for attr in start.attributes().flatten() {
        let key = String::from_utf8_lossy(attr.key.as_ref()).into_owned();
        let value = attr.unescape_value().map_or_else(
            |_| String::from_utf8_lossy(&attr.value).into_owned(),
            std::borrow::Cow::into_owned,
        );
        attrs.insert(key, value);
    }
    attrs
}

pub struct ParseResult {
    pub document: ElementNode,
    pub style_texts: Vec<String>,
}

/// HTML void elements that have no closing tag.
const VOID_ELEMENTS: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
];

/// Convert HTML void elements (e.g. `<col>`, `<br>`) to self-closing XML
/// (e.g. `<col/>`, `<br/>`) and remove stray closing tags (e.g. `</col>`)
/// so quick-xml can parse them.
fn make_void_elements_self_closing(html: &str) -> String {
    let mut result = html.to_string();
    for tag in VOID_ELEMENTS {
        // Remove stray closing tags for void elements (e.g. `</col>`)
        let close_tag = format!("</{tag}>");
        result = result.replace(&close_tag, "");

        // Find each occurrence of `<tag...>` that isn't already self-closing
        let open = format!("<{tag}");
        let mut search_from = 0;
        loop {
            let Some(start) = result[search_from..].find(&open) else {
                break;
            };
            let start = search_from + start;
            // Check that the character after the tag name is a boundary (space, /, or >)
            let after_tag = start + open.len();
            if after_tag < result.len() {
                let next_char = result.as_bytes()[after_tag];
                if next_char != b' ' && next_char != b'/' && next_char != b'>' {
                    search_from = after_tag;
                    continue;
                }
            }
            // Find the closing `>`
            let Some(end_offset) = result[start..].find('>') else {
                break;
            };
            let end = start + end_offset;
            // Already self-closing?
            if result.as_bytes()[end - 1] == b'/' {
                search_from = end + 1;
                continue;
            }
            // Insert `/` before `>`
            result.insert(end, '/');
            search_from = end + 2;
        }
    }
    result
}

pub fn parse_html(html: &str) -> Result<ParseResult, quick_xml::Error> {
    let html = &make_void_elements_self_closing(html);
    let mut reader = Reader::from_str(html);

    let mut stack: Vec<ElementNode> = vec![ElementNode {
        tag: String::from("#document"),
        attributes: HashMap::new(),
        children: Vec::new(),
    }];
    let mut style_texts: Vec<String> = Vec::new();
    let mut in_style = false;

    loop {
        match reader.read_event()? {
            Event::Start(start) => {
                let tag = String::from_utf8_lossy(start.name().as_ref()).into_owned();
                in_style = tag == "style";
                let element = ElementNode {
                    tag,
                    attributes: parse_attributes(&start),
                    children: Vec::new(),
                };
                stack.push(element);
            }
            Event::End(_) => {
                let finished = stack.pop().expect("unbalanced tags");
                in_style = false;
                if let Some(parent) = stack.last_mut() {
                    parent.children.push(DomNode::Element(finished));
                } else {
                    // Popped the root — shouldn't happen with well-formed HTML
                    stack.push(finished);
                }
            }
            Event::Empty(start) => {
                let tag = String::from_utf8_lossy(start.name().as_ref()).into_owned();
                let element = ElementNode {
                    tag,
                    attributes: parse_attributes(&start),
                    children: Vec::new(),
                };
                if let Some(parent) = stack.last_mut() {
                    parent.children.push(DomNode::Element(element));
                }
            }
            Event::Text(text) => {
                let text_str = text.unescape()?.into_owned();
                if in_style {
                    style_texts.push(text_str.clone());
                }
                if !text_str.is_empty() {
                    if let Some(parent) = stack.last_mut() {
                        parent.children.push(DomNode::Text(text_str));
                    }
                }
            }
            Event::CData(cdata) => {
                let text_str = String::from_utf8_lossy(&cdata).into_owned();
                if in_style {
                    style_texts.push(text_str.clone());
                }
                if !text_str.is_empty() {
                    if let Some(parent) = stack.last_mut() {
                        parent.children.push(DomNode::Text(text_str));
                    }
                }
            }
            Event::Eof => break,
            // Skip comments, declarations, PIs
            _ => {}
        }
    }

    // The root #document should be the only thing left on the stack
    let document = stack.pop().expect("empty stack");
    Ok(ParseResult {
        document,
        style_texts,
    })
}

/// Parse an HTML fragment into a list of child nodes (no root wrapper).
/// Style tags are collected separately, just like full document parsing.
pub fn parse_fragment(html: &str) -> Result<(Vec<DomNode>, Vec<String>), quick_xml::Error> {
    // Wrap in a temporary root so quick_xml can parse it
    let wrapped = format!("<__fragment__>{html}</__fragment__>");
    let result = parse_html(&wrapped)?;
    // Extract children from <__fragment__> wrapper
    if let Some(DomNode::Element(fragment)) = result.document.children.into_iter().next() {
        Ok((fragment.children, result.style_texts))
    } else {
        Ok((Vec::new(), result.style_texts))
    }
}

/// Find a mutable reference to the first element matching a CSS selector.
/// Uses the same selector matching as style resolution.
pub fn find_element_mut<'a>(
    root: &'a mut ElementNode,
    selector: &str,
) -> Option<&'a mut ElementNode> {
    find_element_mut_recursive(root, selector, &[])
}

/// Count elements matching a CSS selector without computing layout.
pub fn count_elements(root: &ElementNode, selector: &str) -> usize {
    count_elements_recursive(root, selector, &[])
}

fn count_elements_recursive(
    element: &ElementNode,
    selector: &str,
    ancestors: &[&ElementNode],
) -> usize {
    let mut count = usize::from(crate::style::selector_matches(selector, element, ancestors));

    let mut child_ancestors = vec![element];
    child_ancestors.extend_from_slice(ancestors);

    for child in &element.children {
        if let DomNode::Element(child_el) = child {
            count += count_elements_recursive(child_el, selector, &child_ancestors);
        }
    }
    count
}

fn find_element_mut_recursive<'a>(
    element: &'a mut ElementNode,
    selector: &str,
    ancestors: &[&ElementNode],
) -> Option<&'a mut ElementNode> {
    if crate::style::selector_matches(selector, element, ancestors) {
        return Some(element);
    }

    // Build ancestor chain for children. We need to use raw pointers because
    // we can't borrow `element` immutably (for ancestors) and mutably (for
    // children) at the same time.
    let element_ptr = element as *const ElementNode;
    let mut child_ancestors = vec![unsafe { &*element_ptr }];
    child_ancestors.extend_from_slice(ancestors);

    for child in &mut element.children {
        if let DomNode::Element(child_el) = child {
            if let Some(found) = find_element_mut_recursive(child_el, selector, &child_ancestors) {
                return Some(found);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_parsing() {
        let html = r#"<html><head><style>body { color: red; }</style></head><body><div class="page">Hello</div></body></html>"#;
        let result = parse_html(html).expect("parse failed");

        assert_eq!(result.style_texts.len(), 1);
        assert_eq!(result.style_texts[0], "body { color: red; }");

        // Root #document has one child: html
        assert_eq!(result.document.children.len(), 1);
        if let DomNode::Element(html_el) = &result.document.children[0] {
            assert_eq!(html_el.tag, "html");
            assert_eq!(html_el.children.len(), 2); // head + body
        } else {
            panic!("expected element");
        }
    }

    #[test]
    fn test_self_closing_elements() {
        let html = r#"<div><img src="test.png"/><br/></div>"#;
        let result = parse_html(html).expect("parse failed");
        let div = match &result.document.children[0] {
            DomNode::Element(e) => e,
            _ => panic!("expected element"),
        };
        assert_eq!(div.children.len(), 2);
        if let DomNode::Element(img) = &div.children[0] {
            assert_eq!(img.tag, "img");
            assert_eq!(img.get_attr("src"), Some("test.png"));
        }
    }

    #[test]
    fn test_attributes_and_classes() {
        let html = r#"<div class="page content-slot" data-page-number="1">text</div>"#;
        let result = parse_html(html).expect("parse failed");
        if let DomNode::Element(div) = &result.document.children[0] {
            let classes: Vec<&str> = div.classes().collect();
            assert_eq!(classes, vec!["page", "content-slot"]);
            assert_eq!(div.get_attr("data-page-number"), Some("1"));
        }
    }

    #[test]
    fn test_nested_structure() {
        let html = r#"<div><span><b>bold</b> text</span></div>"#;
        let result = parse_html(html).expect("parse failed");
        let div = match &result.document.children[0] {
            DomNode::Element(e) => e,
            _ => panic!("expected element"),
        };
        let span = match &div.children[0] {
            DomNode::Element(e) => e,
            _ => panic!("expected element"),
        };
        assert_eq!(span.children.len(), 2); // <b> + text
    }

}
