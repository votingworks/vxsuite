#![deny(clippy::all)]
// napi-rs requires owned String params and Result return types
#![allow(clippy::needless_pass_by_value, clippy::missing_errors_doc)]
// PoC: many types defined ahead of use
#![allow(dead_code)]

pub mod dom;
pub mod style;
pub mod fonts;
pub mod layout;
pub mod paint;
pub mod diff;

#[cfg_attr(feature = "napi-binding", napi_derive::napi(object))]
pub struct ElementInfo {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub attributes: Vec<DataAttribute>,
}

#[cfg_attr(feature = "napi-binding", napi_derive::napi(object))]
pub struct DataAttribute {
    pub name: String,
    pub value: String,
}

#[cfg(feature = "napi-binding")]
mod napi_bindings {
    use std::cell::RefCell;
    use std::hash::{Hash, Hasher};

    use napi::bindgen_prelude::Buffer;
    use napi_derive::napi;

    #[napi]
    pub fn render_to_pdf(html: String) -> napi::Result<Buffer> {
        let parsed =
            crate::dom::parse_html(&html).map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let mut styles = crate::style::resolve_styles(&parsed);
        let fonts = crate::fonts::load_fonts(&styles.font_faces);
        let layout_result = crate::layout::compute_layout(&parsed.document, &mut styles, &fonts);
        let pdf_bytes = crate::paint::render_pdf(&layout_result, &styles, &fonts);
        Ok(Buffer::from(pdf_bytes))
    }

    #[napi]
    pub fn query(html: String, selector: String) -> napi::Result<Vec<crate::ElementInfo>> {
        let parsed =
            crate::dom::parse_html(&html).map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let mut styles = crate::style::resolve_styles(&parsed);
        let fonts = crate::fonts::load_fonts(&styles.font_faces);
        let layout_result = crate::layout::compute_layout(&parsed.document, &mut styles, &fonts);
        Ok(crate::layout::query_elements(
            &layout_result,
            &parsed.document,
            &selector,
        ))
    }

    struct CachedLayout {
        html_hash: u64,
        /// Box-allocated so element pointers (used as keys in node_map and
        /// styles) remain stable after the struct is stored in the cache.
        parsed: Box<crate::dom::ParseResult>,
        style_result: crate::style::StyleResult,
        layout_result: crate::layout::LayoutResult,
    }

    fn hash_html(html: &str) -> u64 {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        html.hash(&mut hasher);
        hasher.finish()
    }

    /// Pre-compiled CSS rules and loaded fonts. Create once per stylesheet set
    /// and reuse across many `query`/`render_to_pdf` calls to avoid redundant
    /// CSS parsing, base64 font decoding, and TTF loading.
    #[napi]
    pub struct RenderContext {
        compiled: crate::style::CompiledStyles,
        fonts: crate::fonts::FontCollection,
        /// Number of `<style>` tags in the initial HTML, so we can skip them
        /// when merging additional styles from the document.
        initial_style_count: usize,
        cache: RefCell<Option<CachedLayout>>,
    }

    #[napi]
    impl RenderContext {
        /// Create a new context by parsing CSS and loading fonts from the given
        /// HTML (typically just `<style>` tags).
        #[napi(constructor)]
        pub fn new(styles_html: String) -> napi::Result<Self> {
            let parsed = crate::dom::parse_html(&styles_html)
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;
            let initial_style_count = parsed.style_texts.len();
            let compiled = crate::style::compile_styles(&parsed.style_texts);
            let fonts = crate::fonts::load_fonts(&compiled.font_faces);
            Ok(Self { compiled, fonts, initial_style_count, cache: RefCell::new(None) })
        }

        /// Query elements matching a CSS selector in the given HTML document.
        /// Uses the pre-compiled styles and loaded fonts from this context.
        /// Any additional `<style>` tags in the document (e.g. from
        /// styled-components) are merged with the pre-compiled rules.
        /// Caches the layout so repeated queries on the same HTML skip
        /// parsing, style resolution, and layout computation.
        #[napi]
        pub fn query(&self, html: String, selector: String) -> napi::Result<Vec<crate::ElementInfo>> {
            let html_hash = hash_html(&html);

            // Check if we have a cached layout for this exact HTML
            {
                let cache = self.cache.borrow();
                if let Some(cached) = cache.as_ref() {
                    if cached.html_hash == html_hash {
                        return Ok(crate::layout::query_elements(
                            &cached.layout_result,
                            &cached.parsed.document,
                            &selector,
                        ));
                    }
                }
            }

            // Box-allocate early so element pointers are stable for
            // node_map/styles keys and remain valid in the cache.
            let parsed = Box::new(
                crate::dom::parse_html(&html)
                    .map_err(|e| napi::Error::from_reason(e.to_string()))?,
            );
            let new_styles = &parsed.style_texts[self.initial_style_count..];
            let rules = self.compiled.with_additional_styles(new_styles);
            let styles = crate::style::apply_rules(&rules, &parsed.document);
            let mut style_result = crate::style::StyleResult {
                styles,
                font_faces: self.compiled.font_faces.clone(),
            };
            let layout_result =
                crate::layout::compute_layout(&parsed.document, &mut style_result, &self.fonts);
            let results = crate::layout::query_elements(
                &layout_result,
                &parsed.document,
                &selector,
            );

            *self.cache.borrow_mut() = Some(CachedLayout {
                html_hash,
                parsed,
                style_result,
                layout_result,
            });

            Ok(results)
        }

        /// Render the given HTML document to PDF. Uses the pre-compiled styles
        /// and loaded fonts from this context.
        /// Any additional `<style>` tags in the document are merged with the
        /// pre-compiled rules.
        #[napi]
        pub fn render_to_pdf(&self, html: String) -> napi::Result<Buffer> {
            let parsed = crate::dom::parse_html(&html)
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;
            let new_styles = &parsed.style_texts[self.initial_style_count..];
            let rules = self.compiled.with_additional_styles(new_styles);
            let styles = crate::style::apply_rules(&rules, &parsed.document);
            let mut style_result = crate::style::StyleResult {
                styles,
                font_faces: self.compiled.font_faces.clone(),
            };
            let layout_result =
                crate::layout::compute_layout(&parsed.document, &mut style_result, &self.fonts);
            let pdf_bytes = crate::paint::render_pdf(&layout_result, &style_result, &self.fonts);
            Ok(Buffer::from(pdf_bytes))
        }
    }
}
