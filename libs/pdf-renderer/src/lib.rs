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

use napi::bindgen_prelude::Buffer;
use napi_derive::napi;

#[napi(object)]
pub struct ElementInfo {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub attributes: Vec<DataAttribute>,
}

#[napi(object)]
pub struct DataAttribute {
    pub name: String,
    pub value: String,
}

#[napi]
pub fn render_to_pdf(html: String) -> napi::Result<Buffer> {
    let parsed = dom::parse_html(&html).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let styles = style::resolve_styles(&parsed);
    let fonts = fonts::load_fonts(&styles.font_faces);
    let layout_result = layout::compute_layout(&parsed.document, &styles, &fonts);
    let pdf_bytes = paint::render_pdf(&layout_result, &styles, &fonts);
    Ok(Buffer::from(pdf_bytes))
}

#[napi]
pub fn query(html: String, selector: String) -> napi::Result<Vec<ElementInfo>> {
    let parsed = dom::parse_html(&html).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let styles = style::resolve_styles(&parsed);
    let fonts = fonts::load_fonts(&styles.font_faces);
    let layout_result = layout::compute_layout(&parsed.document, &styles, &fonts);
    Ok(layout::query_elements(
        &layout_result,
        &parsed.document,
        &selector,
    ))
}
