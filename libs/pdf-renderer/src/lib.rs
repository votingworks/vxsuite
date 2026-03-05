#![deny(clippy::all)]
// napi-rs requires owned String params and Result return types
#![allow(clippy::needless_pass_by_value, clippy::missing_errors_doc)]
// PoC: many types defined ahead of use
#![allow(dead_code)]

mod dom;
mod style;
mod fonts;
mod layout;
mod paint;
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
}
