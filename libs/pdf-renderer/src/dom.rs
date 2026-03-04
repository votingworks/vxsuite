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

pub fn parse_html(html: &str) -> Result<ParseResult, quick_xml::Error> {
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
                    style_texts.push(text_str);
                } else if !text_str.is_empty() {
                    if let Some(parent) = stack.last_mut() {
                        parent.children.push(DomNode::Text(text_str));
                    }
                }
            }
            Event::CData(cdata) => {
                let text_str = String::from_utf8_lossy(&cdata).into_owned();
                if in_style {
                    style_texts.push(text_str);
                } else if !text_str.is_empty() {
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
