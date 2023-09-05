use bitter::{BigEndianReader, BitReader};
use image::{EncodableLayout, GrayImage};
use rqrr::PreparedImage;
use serde::Serialize;

use crate::{
    ballot_card::{Geometry, Orientation},
    debug::{self, ImageDebugWriter},
    election::{BallotStyleId, Election, PrecinctId},
    geometry::Rect,
};

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize)]
pub enum BallotType {
    #[serde(rename = "precinct")]
    Precinct,
    #[serde(rename = "absentee")]
    Absentee,
    #[serde(rename = "provisional")]
    Provisional,
}

#[derive(Debug, Serialize, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
// Metadata encoded in a QR code. Matches the TS type HmpbBallotPageMetadata.
pub struct BallotPageQrCodeMetadata {
    pub election_hash: String, // Hex string, first 20 characters of the hash
    pub precinct_id: PrecinctId,
    pub ballot_style_id: BallotStyleId,
    pub page_number: u8,
    pub is_test_mode: bool,
    pub ballot_type: BallotType,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BallotPageQrCodeMetadataError {
    NoQrCodeDetected,
    UnreadableQrCode { error: String },
    InvalidMetadata { bytes: Vec<u8> },
}

const ELECTION_HASH_LENGTH: u32 = 20;
const HEX_BYTES_PER_CHAR: u32 = 2;
const MAXIMUM_PAGE_NUMBERS: u32 = 30;
const BALLOT_TYPE_MAXIMUM_VALUE: u32 = 2_u32.pow(4) - 1;

fn decode_metadata_bits(election: &Election, bytes: &[u8]) -> Option<BallotPageQrCodeMetadata> {
    let mut bits = BigEndianReader::new(bytes);

    let mut prelude = [0; 3];
    bits.read_bytes(&mut prelude);
    if prelude != b"VP\x02".as_bytes() {
        return None;
    }

    let mut election_hash_bytes = [0; (ELECTION_HASH_LENGTH / HEX_BYTES_PER_CHAR) as usize];
    bits.read_bytes(&mut election_hash_bytes);
    let election_hash = hex::encode(election_hash_bytes);

    let precinct_count = bits.read_u8()?;
    let ballot_style_count = bits.read_u8()?;
    let _contest_count = bits.read_u8()?;
    let precinct_index = bits.read_bits(bit_size(precinct_count as u32 - 1))?;
    let ballot_style_index = bits.read_bits(bit_size(ballot_style_count as u32 - 1))?;
    let page_number = bits.read_bits(bit_size(MAXIMUM_PAGE_NUMBERS))? as u8;
    let is_test_mode = bits.read_bit()?;
    let ballot_type: BallotType = match bits.read_bits(bit_size(BALLOT_TYPE_MAXIMUM_VALUE))? {
        0 => BallotType::Precinct,
        1 => BallotType::Absentee,
        2 => BallotType::Provisional,
        _ => return None,
    };

    let precinct = election.precincts.get(precinct_index as usize)?;
    let ballot_style = election.ballot_styles.get(ballot_style_index as usize)?;

    Some(BallotPageQrCodeMetadata {
        election_hash,
        precinct_id: precinct.id.clone(),
        ballot_style_id: ballot_style.id.clone(),
        page_number,
        is_test_mode,
        ballot_type,
    })
}

const fn bit_size(n: u32) -> u32 {
    if n == 0 {
        1
    } else {
        n.ilog2() + 1
    }
}

pub fn detect_qr_code_metadata(
    election: &Election,
    img: &GrayImage,
    geometry: &Geometry,
    debug: &mut ImageDebugWriter,
) -> Result<(BallotPageQrCodeMetadata, Orientation), BallotPageQrCodeMetadataError> {
    let mut prepared_img = PreparedImage::prepare(img.clone());
    let grids = prepared_img.detect_grids();
    let qr_code = grids.first();

    debug.write("qr_code", |canvas| {
        debug::draw_qr_code_debug_image_mut(
            canvas,
            qr_code.map(|qr_code| {
                let [top_left, top_right, _bottom_right, bottom_left] = qr_code.bounds;
                Rect::new(
                    top_left.x,
                    top_left.y,
                    (top_right.x - top_left.x) as u32,
                    (bottom_left.y - top_left.y) as u32,
                )
            }),
        );
    });

    let qr_code = qr_code.ok_or(BallotPageQrCodeMetadataError::NoQrCodeDetected)?;
    let mut bytes = Vec::new();
    qr_code.decode_to(&mut bytes).map_err(|error| {
        BallotPageQrCodeMetadataError::UnreadableQrCode {
            error: error.to_string(),
        }
    })?;
    let metadata = decode_metadata_bits(election, &bytes)
        .ok_or(BallotPageQrCodeMetadataError::InvalidMetadata { bytes })?;

    let [top_left, _top_right, _bottom_right, _bottom_left] = qr_code.bounds;
    let orientation = if top_left.y > geometry.canvas_size.height as i32 / 2 {
        Orientation::Portrait
    } else {
        Orientation::PortraitReversed
    };

    Ok((metadata, orientation))
}

#[cfg(test)]
mod test {
    use std::{fs::File, io::BufReader, path::PathBuf};

    use super::*;

    #[test]
    fn test_decode_metadata_bits() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/fixtures/ashland");
        let election_path = fixture_path.join("election.json");
        let election: Election =
            serde_json::from_reader(BufReader::new(File::open(election_path).unwrap())).unwrap();
        // Encoded using libs/ballot-encoder
        let bytes = [
            86, 80, 2, 210, 122, 182, 88, 139, 24, 105, 84, 76, 222, 4, 1, 9, 1, 0,
        ];
        assert_eq!(
            decode_metadata_bits(&election, &bytes),
            Some(BallotPageQrCodeMetadata {
                election_hash: "d27ab6588b1869544cde".to_string(),
                precinct_id: PrecinctId::from("town-id-01001-precinct-id-".to_string()),
                ballot_style_id: BallotStyleId::from("card-number-5".to_string()),
                page_number: 1,
                is_test_mode: false,
                ballot_type: BallotType::Precinct,
            })
        );
    }
}
