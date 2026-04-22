use napi::bindgen_prelude::Buffer;
use napi_derive::napi;

mod render;
mod text;

/// A ballot renderer that pre-loads fonts and shared assets once,
/// then reuses them for each ballot render call.
#[napi]
pub struct BallotRenderer {
    fonts: text::FontSet,
}

#[napi]
impl BallotRenderer {
    /// Create a new renderer, loading and parsing all fonts upfront.
    #[napi(constructor)]
    pub fn new() -> napi::Result<Self> {
        let fonts = text::FontSet::new()
            .map_err(|e| napi::Error::from_reason(format!("Font loading failed: {e}")))?;
        Ok(Self { fonts })
    }

    /// Render a ballot to PDF. Accepts a JSON string with ballot data.
    /// Reuses the pre-loaded fonts from construction.
    #[napi]
    pub fn render(&self, ballot_data_json: String) -> napi::Result<Buffer> {
        let data: render::BallotData = serde_json::from_str(&ballot_data_json)
            .map_err(|e| napi::Error::from_reason(format!("Invalid ballot data: {e}")))?;

        let pdf = render::render_ballot(&self.fonts, &data)
            .map_err(|e| napi::Error::from_reason(format!("Render failed: {e}")))?;

        Ok(Buffer::from(pdf))
    }
}

/// One-shot render function (loads fonts each time — slower for batches).
#[napi]
pub fn render_ballot_to_pdf(ballot_data_json: String) -> napi::Result<Buffer> {
    let fonts = text::FontSet::new()
        .map_err(|e| napi::Error::from_reason(format!("Font loading failed: {e}")))?;
    let data: render::BallotData = serde_json::from_str(&ballot_data_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid ballot data: {e}")))?;
    let pdf = render::render_ballot(&fonts, &data)
        .map_err(|e| napi::Error::from_reason(format!("Render failed: {e}")))?;
    Ok(Buffer::from(pdf))
}
