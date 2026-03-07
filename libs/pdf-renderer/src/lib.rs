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

    /// Cached layout results for the live DOM. Stored separately because the
    /// DOM is owned by `live_dom` and we just cache the computed results.
    struct LiveLayoutCache {
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
        /// Mutable DOM for structural caching. When set_content is used,
        /// this holds the live DOM tree that gets patched in-place.
        live_dom: RefCell<Option<Box<crate::dom::ParseResult>>>,
        /// Cached layout for the live DOM, invalidated on set_content.
        live_layout_cache: RefCell<Option<LiveLayoutCache>>,
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
            Ok(Self {
                compiled,
                fonts,
                initial_style_count,
                cache: RefCell::new(None),
                live_dom: RefCell::new(None),
                live_layout_cache: RefCell::new(None),
            })
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

        /// Initialize the live DOM from the given HTML. Subsequent calls to
        /// `set_content` will patch this DOM in-place instead of re-parsing.
        #[napi]
        pub fn load_document(&self, html: String) -> napi::Result<()> {
            let parsed = Box::new(
                crate::dom::parse_html(&html)
                    .map_err(|e| napi::Error::from_reason(e.to_string()))?,
            );
            *self.live_dom.borrow_mut() = Some(parsed);
            *self.live_layout_cache.borrow_mut() = None;
            Ok(())
        }

        /// Patch the live DOM by replacing the children of the element
        /// matching `selector` with the parsed `html_content` fragment.
        /// Much faster than re-parsing the entire document.
        #[napi]
        pub fn set_content(&self, selector: String, html_content: String) -> napi::Result<()> {
            let mut dom_ref = self.live_dom.borrow_mut();
            let parsed = dom_ref.as_mut().ok_or_else(|| {
                napi::Error::from_reason("No document loaded. Call loadDocument first.".to_string())
            })?;

            let (new_children, new_styles) = crate::dom::parse_fragment(&html_content)
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;

            let target = crate::dom::find_element_mut(&mut parsed.document, &selector)
                .ok_or_else(|| {
                    napi::Error::from_reason(format!("No element found matching: {selector}"))
                })?;
            target.children = new_children;

            // Replace additional styles (from styled-components in the fragment).
            // Truncate to initial count first to avoid accumulating stale styles
            // from previous setContent calls.
            parsed.style_texts.truncate(self.initial_style_count);
            parsed.style_texts.extend(new_styles);

            // Invalidate cached layout since DOM changed
            drop(dom_ref);
            *self.live_layout_cache.borrow_mut() = None;
            Ok(())
        }

        /// Compute styles and layout for the live DOM, caching the result.
        fn ensure_live_layout(&self) -> napi::Result<()> {
            if self.live_layout_cache.borrow().is_some() {
                return Ok(());
            }

            let dom_ref = self.live_dom.borrow();
            let parsed = dom_ref.as_ref().ok_or_else(|| {
                napi::Error::from_reason("No document loaded. Call loadDocument first.".to_string())
            })?;

            let new_styles = &parsed.style_texts[self.initial_style_count..];
            let rules = self.compiled.with_additional_styles(new_styles);
            let styles = crate::style::apply_rules(&rules, &parsed.document);
            let mut style_result = crate::style::StyleResult {
                styles,
                font_faces: self.compiled.font_faces.clone(),
            };
            let layout_result =
                crate::layout::compute_layout(&parsed.document, &mut style_result, &self.fonts);

            drop(dom_ref);
            *self.live_layout_cache.borrow_mut() = Some(LiveLayoutCache {
                style_result,
                layout_result,
            });
            Ok(())
        }

        /// Query elements from the live DOM. Recomputes styles and layout
        /// only if the DOM has been modified since the last query.
        #[napi]
        pub fn query_live(&self, selector: String) -> napi::Result<Vec<crate::ElementInfo>> {
            self.ensure_live_layout()?;

            let dom_ref = self.live_dom.borrow();
            let parsed = dom_ref.as_ref().expect("live_dom set by ensure_live_layout");
            let cache_ref = self.live_layout_cache.borrow();
            let cached = cache_ref.as_ref().expect("set by ensure_live_layout");

            Ok(crate::layout::query_elements(
                &cached.layout_result,
                &parsed.document,
                &selector,
            ))
        }

        /// Serialize the current live DOM back to an HTML string.
        #[napi]
        pub fn get_content(&self) -> napi::Result<String> {
            let dom_ref = self.live_dom.borrow();
            let parsed = dom_ref.as_ref().ok_or_else(|| {
                napi::Error::from_reason("No document loaded. Call loadDocument first.".to_string())
            })?;
            Ok(parsed.document.serialize_children_to_xml())
        }

        /// Render the live DOM to PDF.
        #[napi]
        pub fn render_live_to_pdf(&self) -> napi::Result<Buffer> {
            self.ensure_live_layout()?;

            let cache_ref = self.live_layout_cache.borrow();
            let cached = cache_ref.as_ref().expect("set by ensure_live_layout");

            let pdf_bytes = crate::paint::render_pdf(
                &cached.layout_result,
                &cached.style_result,
                &self.fonts,
            );
            Ok(Buffer::from(pdf_bytes))
        }
    }
}
