use napi_derive::napi;
use napi::bindgen_prelude::Buffer;

mod render;
mod text;

/// Render a ballot to PDF using typst's infrastructure.
///
/// Accepts a JSON string with ballot data (election, ballot style, etc.)
/// and returns PDF bytes.
#[napi]
pub async fn render_ballot_to_pdf(ballot_data_json: String) -> napi::Result<Buffer> {
    let ballot_data: render::BallotData = serde_json::from_str(&ballot_data_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid ballot data JSON: {e}")))?;

    let pdf_bytes = render::render_ballot(&ballot_data)
        .map_err(|e| napi::Error::from_reason(format!("Rendering failed: {e}")))?;

    Ok(Buffer::from(pdf_bytes))
}
