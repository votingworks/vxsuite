use napi::bindgen_prelude::Buffer;
use napi_derive::napi;

mod render;
mod text;

/// A ballot renderer that pre-loads fonts, instruction SVGs, and shared
/// assets once, then reuses them for each ballot render call.
#[napi]
pub struct BallotRenderer {
    fonts: text::FontSet,
    assets: render::CachedAssets,
}

#[napi]
impl BallotRenderer {
    /// Create a new renderer, loading and parsing all fonts and static
    /// assets upfront. Call render() repeatedly to reuse them.
    #[napi(constructor)]
    pub fn new() -> napi::Result<Self> {
        let fonts = text::FontSet::new()
            .map_err(|e| napi::Error::from_reason(format!("Font loading failed: {e}")))?;
        let assets = render::CachedAssets::new()
            .map_err(|e| napi::Error::from_reason(format!("Asset loading failed: {e}")))?;
        Ok(Self { fonts, assets })
    }

    /// Render a ballot to PDF. Accepts a JSON string with ballot data.
    /// Reuses pre-loaded fonts and cached assets.
    #[napi]
    pub fn render(&self, ballot_data_json: String) -> napi::Result<Buffer> {
        let data: render::BallotData = serde_json::from_str(&ballot_data_json)
            .map_err(|e| napi::Error::from_reason(format!("Invalid ballot data: {e}")))?;

        let pdf = render::render_ballot(&self.fonts, &self.assets, &data)
            .map_err(|e| napi::Error::from_reason(format!("Render failed: {e}")))?;

        Ok(Buffer::from(pdf))
    }
}

/// One-shot render function (loads fonts each time — slower for batches).
#[napi]
pub fn render_ballot_to_pdf(ballot_data_json: String) -> napi::Result<Buffer> {
    let fonts = text::FontSet::new()
        .map_err(|e| napi::Error::from_reason(format!("Font loading failed: {e}")))?;
    let assets = render::CachedAssets::new()
        .map_err(|e| napi::Error::from_reason(format!("Asset loading failed: {e}")))?;
    let data: render::BallotData = serde_json::from_str(&ballot_data_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid ballot data: {e}")))?;
    let pdf = render::render_ballot(&fonts, &assets, &data)
        .map_err(|e| napi::Error::from_reason(format!("Render failed: {e}")))?;
    Ok(Buffer::from(pdf))
}
