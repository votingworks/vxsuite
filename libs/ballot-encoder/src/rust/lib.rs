//! Exposes the ballot QR code encoders and decoders in `types-rs` to
//! TypeScript, so that `libs/types-rs` can become their single implementation.
//!
//! Everything here is a thin bridge: shapes are converted at the boundary and
//! the bit-level work happens in `types-rs`. Payload structs cross as JSON,
//! matching the pattern `libs/ballot-interpreter` established.

// dead_code: `cargo test` compiles without the napi runtime, so #[napi] functions appear unused.
// needless_pass_by_value: napi can only build arguments it owns, so `Buffer`
// and `serde_json::Value` parameters cannot be taken by reference.
#![allow(clippy::needless_pass_by_value, dead_code)]

use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use types_rs::bmd::cvr::CastVoteRecord;
use types_rs::bubble_ballot::{
    self, Metadata, PartialBallotHash, SoftwareVersion, PARTIAL_BALLOT_HASH_BYTE_LENGTH,
};
use types_rs::coding;
use types_rs::election::Election;

fn from_json<T: serde::de::DeserializeOwned>(value: serde_json::Value) -> napi::Result<T> {
    serde_json::from_value(value).map_err(|e| napi::Error::from_reason(e.to_string()))
}

fn to_json<T: serde::Serialize>(value: &T) -> napi::Result<serde_json::Value> {
    serde_json::to_value(value).map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Decodes a hex ballot hash string into a [`PartialBallotHash`], slicing it to
/// the partial-hash length the way `sliceBallotHashForEncoding` does.
fn partial_ballot_hash(hex: &str) -> napi::Result<PartialBallotHash> {
    let bytes = hex::decode(hex)
        .map_err(|err| napi::Error::from_reason(format!("ballotHash is not valid hex: {err}")))?;
    if bytes.len() < PARTIAL_BALLOT_HASH_BYTE_LENGTH {
        return Err(napi::Error::from_reason(format!(
            "ballotHash must be at least {} hex characters",
            PARTIAL_BALLOT_HASH_BYTE_LENGTH * 2
        )));
    }
    let mut hash = PartialBallotHash::default();
    let len = hash.len();
    hash.copy_from_slice(&bytes[..len]);
    Ok(hash)
}

/// Encodes bubble ballot page metadata for its QR code.
///
/// # Errors
///
/// Returns an error if the election, metadata, or version cannot be parsed, or
/// if the metadata cannot be encoded against that election.
#[napi(
    ts_args_type = "election: Election, metadata: RustBubbleBallotMetadata, version: 'v4.0' | 'v4.1'",
    ts_return_type = "Buffer"
)]
pub fn encode_hmpb_ballot_page_metadata(
    election: serde_json::Value,
    metadata: serde_json::Value,
    version: String,
) -> napi::Result<Buffer> {
    let election: Election = from_json(election)?;
    let metadata: Metadata = from_json(metadata)?;
    let version: SoftwareVersion = from_json(serde_json::Value::String(version))?;

    let bytes = coding::encode_with(&metadata, &(&election, version))
        .map_err(|e| napi::Error::from_reason(format!("encoding failed: {e}")))?;
    Ok(Buffer::from(bytes))
}

/// Encodes one page of a summary ballot for its QR code.
///
/// # Errors
///
/// Returns an error if the election or page cannot be parsed, or if the page
/// cannot be encoded against that election.
#[napi(
    ts_args_type = "election: Election, page: RustCastVoteRecord",
    ts_return_type = "Buffer"
)]
pub fn encode_summary_ballot_page(
    election: serde_json::Value,
    page: serde_json::Value,
) -> napi::Result<Buffer> {
    let election: Election = from_json(election)?;
    let page: CastVoteRecord = from_json(page)?;

    let bytes = coding::encode_with(&page, &election)
        .map_err(|e| napi::Error::from_reason(format!("encoding failed: {e}")))?;
    Ok(Buffer::from(bytes))
}

/// Decodes one page of a summary ballot from its QR code payload.
///
/// # Errors
///
/// Returns an error if the election cannot be parsed or the payload is not a
/// valid summary ballot page for it.
#[napi(
    ts_args_type = "election: Election, data: Buffer",
    ts_return_type = "RustCastVoteRecord"
)]
pub fn decode_summary_ballot_page(
    election: serde_json::Value,
    data: Buffer,
) -> napi::Result<serde_json::Value> {
    let election: Election = from_json(election)?;
    let page = coding::decode_with::<CastVoteRecord>(&data, &election)
        .map_err(|e| napi::Error::from_reason(format!("decoding failed: {e}")))?;
    to_json(&page)
}

/// Decodes bubble ballot page metadata from its QR code payload. The expected
/// ballot hash is required because the encoded form carries only the first
/// [`PARTIAL_BALLOT_HASH_BYTE_LENGTH`] bytes, which the decoder checks against
/// the election it was handed.
///
/// # Errors
///
/// Returns an error if the election or expected ballot hash cannot be parsed,
/// or if the payload is not valid bubble ballot metadata for that election.
#[napi(
    ts_args_type = "election: Election, data: Buffer, expectedBallotHash: string",
    ts_return_type = "RustBubbleBallotMetadata"
)]
pub fn decode_hmpb_ballot_page_metadata(
    election: serde_json::Value,
    data: Buffer,
    expected_ballot_hash: String,
) -> napi::Result<serde_json::Value> {
    let election: Election = from_json(election)?;
    let expected_ballot_hash = partial_ballot_hash(&expected_ballot_hash)?;
    let metadata = coding::decode_with::<Metadata>(&data, &(&election, expected_ballot_hash))
        .map_err(|e| napi::Error::from_reason(format!("decoding failed: {e}")))?;
    to_json(&metadata)
}

/// Reads the partial ballot hash out of either payload kind, as a hex string,
/// or `null` if the data does not start with a recognized prelude.
#[napi(ts_args_type = "data: Buffer", ts_return_type = "string | null")]
#[must_use]
pub fn decode_ballot_hash(data: Buffer) -> Option<String> {
    let prelude = data.get(0..3)?;
    let is_ours = matches!(
        prelude.try_into(),
        Ok(bubble_ballot::PRELUDE | types_rs::bmd::BMD_PRELUDE)
    );
    if !is_ours {
        return None;
    }
    let hash = data.get(3..3 + PARTIAL_BALLOT_HASH_BYTE_LENGTH)?;
    Some(hex::encode(hash))
}

/// Whether `data` is a summary ballot payload, matching the TypeScript
/// `isVxBallot`, which checks only the summary ballot prelude.
#[napi(ts_args_type = "data: Buffer", ts_return_type = "boolean")]
#[must_use]
pub fn is_vx_ballot(data: Buffer) -> bool {
    data.get(0..3)
        .is_some_and(|prelude| prelude == types_rs::bmd::BMD_PRELUDE)
}
