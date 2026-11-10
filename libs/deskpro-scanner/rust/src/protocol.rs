//! The wire protocol between `deskproctl` and its Node client: frames of a 1-byte type and a
//! little-endian `u32` payload length, each carrying one CBOR item. An image payload is instead a
//! little-endian `u32` header length, the CBOR header, then the raw pixels.
//!
//! `../src/ts/protocol.ts` is the other half of this file and must change with it.

#![allow(clippy::missing_errors_doc, clippy::missing_panics_doc)] // the `expect`s are on writes to a `Vec`

use serde::{Deserialize, Serialize, de::DeserializeOwned};

pub mod frame_type {
    pub const HELLO: u8 = 1;
    pub const COMMAND: u8 = 2;
    pub const RESPONSE: u8 = 3;
    pub const EVENT: u8 = 4;
    pub const IMAGE: u8 = 5;
}

pub const FRAME_HEADER_LENGTH: usize = 1 + size_of::<u32>();

/// Generous for one image; a 200 dpi grayscale side is a few megabytes.
pub const MAX_FRAME_PAYLOAD: u32 = 64 * 1024 * 1024;

/// A malformed frame. The peer is out of sync, so the connection should be torn down.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum DecodeError {
    #[error("invalid payload: {0}")]
    Invalid(String),

    #[error("{payload} bytes of trailing data after a complete message")]
    TrailingData { payload: usize },

    #[error("frame payload of {length} bytes exceeds the {MAX_FRAME_PAYLOAD} byte maximum")]
    FrameTooLarge { length: u32 },
}

type Result<T> = std::result::Result<T, DecodeError>;

/// Encodes one message as a CBOR item.
#[must_use]
pub fn encode(message: &impl Serialize) -> Vec<u8> {
    let mut payload = Vec::new();
    ciborium::into_writer(message, &mut payload).expect("protocol types always serialize");
    payload
}

/// Decodes a payload holding exactly one CBOR item.
pub fn decode<T: DeserializeOwned>(payload: &[u8]) -> Result<T> {
    let mut rest = payload;
    let message = ciborium::from_reader(&mut rest)
        .map_err(|error| DecodeError::Invalid(error.to_string()))?;
    if rest.is_empty() {
        Ok(message)
    } else {
        Err(DecodeError::TrailingData {
            payload: rest.len(),
        })
    }
}

/// Wraps a payload in a frame header.
#[must_use]
pub fn encode_frame(frame_type: u8, payload: &[u8]) -> Vec<u8> {
    let mut frame = Vec::with_capacity(FRAME_HEADER_LENGTH + payload.len());
    frame.push(frame_type);
    frame.extend_from_slice(
        &u32::try_from(payload.len())
            .unwrap_or(u32::MAX)
            .to_le_bytes(),
    );
    frame.extend_from_slice(payload);
    frame
}

/// Reads a frame header, rejecting a length over [`MAX_FRAME_PAYLOAD`].
pub fn decode_frame_header(header: &[u8; FRAME_HEADER_LENGTH]) -> Result<(u8, u32)> {
    let length = u32::from_le_bytes([header[1], header[2], header[3], header[4]]);
    if length > MAX_FRAME_PAYLOAD {
        return Err(DecodeError::FrameTooLarge { length });
    }
    Ok((header[0], length))
}

/// A request from the client, tagged with an id the matching [`Response`] echoes back.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Command {
    pub id: u32,
    pub body: CommandBody,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum CommandBody {
    /// Shut the daemon down. Answered before the process exits.
    Exit,
    /// Open `libinoapi.so` and connect to the scanner.
    #[serde(rename_all = "camelCase")]
    Connect {
        app_id: String,
    },
    /// Disconnect but keep the daemon running, so the client can reconnect without a respawn.
    Disconnect,
    GetStatus,
    GetVersions,
    GetProfile,
    SetProfile {
        profile: String,
    },
    SetReady {
        ready: bool,
    },
    ScanStart,
    ScanStop,
    /// `ScanBreak`: stop the feeder without ending the batch.
    ScanPause,
    ScanResume,
    SetImprinterText {
        text: String,
    },
    SetCounter {
        index: u8,
        value: i64,
    },
    SetNumberOfSheets {
        count: u32,
    },
}

impl Command {
    pub fn decode(payload: &[u8]) -> Result<Self> {
        decode(payload)
    }
}

/// Why a command failed. Driver failures carry the driver's error text in the message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    /// `libinoapi.so` is missing, or cannot be loaded on this host.
    DriverUnavailable,
    NotConnected,
    AlreadyConnected,
    /// The driver returned a non-zero code.
    Driver,
    /// The command cannot be run in the current state.
    BadRequest,
    Other,
}

pub use crate::driver::Status;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Response {
    pub id: u32,
    pub body: ResponseBody,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ResponseBody {
    Ok,
    Error { code: ErrorCode, message: String },
    Status { status: Status },
    Versions { api: String, scanner: String },
    Profile { profile: String },
}

impl Response {
    #[must_use]
    pub fn encode(&self) -> Vec<u8> {
        encode(self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Event {
    /// A line from the driver's own logger.
    Log { message: String },
    /// A `ScannerControl_t`, passed through raw.
    #[serde(rename_all = "camelCase")]
    Control {
        control_type: u32,
        num_data: u32,
        str_data: String,
    },
    /// The daemon lost the scanner and is exiting; start a new daemon to reconnect.
    Disconnected { message: String },
    /// An image's `ImageInfo_t` was smaller than ours, so it was dropped unread.
    IncompatibleImage { size: i32 },
    /// The scanner's operational state changed; 0 while an error is active.
    OperationalState { state: i32 },
    /// An image's frame would exceed [`MAX_FRAME_PAYLOAD`], so it was dropped.
    #[serde(rename_all = "camelCase")]
    OversizedImage {
        seq_id: i64,
        scan_side: i32,
        size: i64,
    },
}

impl Event {
    #[must_use]
    pub fn encode(&self) -> Vec<u8> {
        encode(self)
    }

    pub fn decode(payload: &[u8]) -> Result<Self> {
        decode(payload)
    }
}

/// The `ImageProperties_t` fields sent ahead of the pixels in an image frame.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageHeader {
    /// Pairs the two sides of one sheet.
    pub seq_id: i64,
    pub stream_id: i32,
    /// 0 = front, 1 = back, per `ImageProperties_t.scanSide`.
    pub scan_side: i32,
    pub resolution: i32,
    pub pixels_per_line: i32,
    pub lines: i32,
    pub bytes_per_line: i32,
    pub bits_per_pixel: i32,
    /// `ImageProperties_t.fileformat`; 2 is BMP.
    pub file_format: i32,
    pub compression: i32,
    pub double_feed: i32,
    pub blank_page: i32,
    pub integrity: i32,
    pub counters: [i64; 4],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub endorser_front_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub endorser_back_text: Option<String>,
}

const IMAGE_HEADER_LENGTH_SIZE: usize = size_of::<u32>();

/// Encodes an image frame up to its pixels, which the caller writes right after it. Fails with
/// the payload size if the frame would exceed [`MAX_FRAME_PAYLOAD`].
pub fn encode_image_frame_prefix(
    header: &ImageHeader,
    data_len: usize,
) -> std::result::Result<Vec<u8>, usize> {
    let header_start = FRAME_HEADER_LENGTH + IMAGE_HEADER_LENGTH_SIZE;
    let mut prefix = vec![0; header_start];
    prefix[0] = frame_type::IMAGE;
    ciborium::into_writer(header, &mut prefix).expect("protocol types always serialize");
    let header_len = u32::try_from(prefix.len() - header_start).expect("an image header is small");
    prefix[FRAME_HEADER_LENGTH..header_start].copy_from_slice(&header_len.to_le_bytes());
    let payload_len = prefix.len() - FRAME_HEADER_LENGTH + data_len;
    match u32::try_from(payload_len) {
        Ok(length) if length <= MAX_FRAME_PAYLOAD => {
            prefix[1..FRAME_HEADER_LENGTH].copy_from_slice(&length.to_le_bytes());
            Ok(prefix)
        }
        _ => Err(payload_len),
    }
}

/// Decodes an image frame payload, borrowing the pixels from it.
pub fn decode_image(payload: &[u8]) -> Result<(ImageHeader, &[u8])> {
    let (header_len, rest) = payload
        .split_first_chunk::<IMAGE_HEADER_LENGTH_SIZE>()
        .ok_or_else(|| DecodeError::Invalid("image payload has no header length".to_owned()))?;
    let header_len = u32::from_le_bytes(*header_len) as usize;
    let (header, pixels) = rest.split_at_checked(header_len).ok_or_else(|| {
        DecodeError::Invalid(format!(
            "{header_len}-byte image header declared, {} bytes present",
            rest.len()
        ))
    })?;
    Ok((decode(header)?, pixels))
}

/// The first frame the daemon writes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hello {
    pub daemon_version: String,
}

impl Hello {
    #[must_use]
    pub fn encode(&self) -> Vec<u8> {
        encode(self)
    }
}

#[cfg(test)]
mod tests {
    use std::fmt::Write as _;

    use super::*;

    fn every_command() -> Vec<(&'static str, CommandBody)> {
        use CommandBody as C;
        vec![
            ("exit", C::Exit),
            (
                "connect",
                C::Connect {
                    app_id: "VxCentralScan".to_owned(),
                },
            ),
            ("disconnect", C::Disconnect),
            ("getStatus", C::GetStatus),
            ("getVersions", C::GetVersions),
            ("getProfile", C::GetProfile),
            (
                "setProfile",
                C::SetProfile {
                    profile: "ProfilePaper_brightness = 200\n".to_owned(),
                },
            ),
            ("setReady.true", C::SetReady { ready: true }),
            ("setReady.false", C::SetReady { ready: false }),
            ("scanStart", C::ScanStart),
            ("scanStop", C::ScanStop),
            ("scanPause", C::ScanPause),
            ("scanResume", C::ScanResume),
            (
                "setImprinterText",
                C::SetImprinterText {
                    text: "batch7_%NMC4%%CNT1%".to_owned(),
                },
            ),
            (
                "setCounter",
                C::SetCounter {
                    index: 1,
                    value: -9_000_000_000,
                },
            ),
            ("setNumberOfSheets", C::SetNumberOfSheets { count: 25 }),
        ]
    }

    fn every_response() -> Vec<(&'static str, ResponseBody)> {
        use ResponseBody as R;
        let error = |code, message: &str| R::Error {
            code,
            message: message.to_owned(),
        };
        vec![
            ("ok", R::Ok),
            (
                "error.driverUnavailable",
                error(ErrorCode::DriverUnavailable, "no such file"),
            ),
            ("error.notConnected", error(ErrorCode::NotConnected, "")),
            (
                "error.alreadyConnected",
                error(ErrorCode::AlreadyConnected, ""),
            ),
            ("error.driver", error(ErrorCode::Driver, "ScanStart failed")),
            ("error.badRequest", error(ErrorCode::BadRequest, "")),
            ("error.other", error(ErrorCode::Other, "…unicode ✓")),
            (
                "status",
                R::Status {
                    status: Status {
                        state: 2,
                        operational_state: 1,
                        images_available: 4,
                        feeder_loaded: 1,
                        next_feeder_loaded: 0,
                        feeder_side: 0,
                    },
                },
            ),
            (
                "versions",
                R::Versions {
                    api: "3.0.0.0".to_owned(),
                    scanner: "DeskPro 631".to_owned(),
                },
            ),
            (
                "profile",
                R::Profile {
                    profile: String::new(),
                },
            ),
        ]
    }

    fn every_event() -> Vec<(&'static str, Event)> {
        vec![
            (
                "log",
                Event::Log {
                    message: "state scanning".to_owned(),
                },
            ),
            (
                "control",
                Event::Control {
                    control_type: 602,
                    num_data: 14_900,
                    str_data: "263".to_owned(),
                },
            ),
            (
                "disconnected",
                Event::Disconnected {
                    message: "ERR_SCANNER_NOTCONNECTED".to_owned(),
                },
            ),
            (
                "incompatibleImage",
                Event::IncompatibleImage { size: 30_000 },
            ),
            ("operationalState", Event::OperationalState { state: 0 }),
            (
                "oversizedImage",
                Event::OversizedImage {
                    seq_id: 42,
                    scan_side: 1,
                    size: 70_000_000,
                },
            ),
        ]
    }

    /// Exercises every byte of the id, so a byte-order mistake changes the fixture.
    const FIXTURE_ID: u32 = 0x0102_0304;

    const WIRE_FIXTURES_PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../fixtures/wire.txt");

    /// Every frame type, encoded by this crate, as `name hex` lines for the TS tests to check.
    fn wire_fixtures() -> String {
        let mut frames = Vec::new();
        for (name, body) in every_command() {
            let payload = encode(&Command {
                id: FIXTURE_ID,
                body,
            });
            frames.push((
                format!("command.{name}"),
                encode_frame(frame_type::COMMAND, &payload),
            ));
        }
        for (name, body) in every_response() {
            let payload = Response {
                id: FIXTURE_ID,
                body,
            }
            .encode();
            frames.push((
                format!("response.{name}"),
                encode_frame(frame_type::RESPONSE, &payload),
            ));
        }
        for (name, event) in every_event() {
            frames.push((
                format!("event.{name}"),
                encode_frame(frame_type::EVENT, &event.encode()),
            ));
        }
        let hello = Hello {
            daemon_version: "0.1.0".to_owned(),
        };
        frames.push((
            "hello".to_owned(),
            encode_frame(frame_type::HELLO, &hello.encode()),
        ));
        let mut image = encode_image_frame_prefix(&an_image_header(), 3).expect("within the limit");
        image.extend_from_slice(&[1, 2, 3]);
        frames.push(("image".to_owned(), image));

        let mut text = String::from(
            "# Generated by `cargo test regenerate_wire_fixtures -- --ignored`; checked by both test suites.\n",
        );
        for (name, frame) in frames {
            write!(text, "{name} ").expect("writing to a String");
            for byte in frame {
                write!(text, "{byte:02x}").expect("writing to a String");
            }
            text.push('\n');
        }
        text
    }

    #[test]
    fn wire_fixtures_are_current() {
        let committed = std::fs::read_to_string(WIRE_FIXTURES_PATH).unwrap_or_default();
        assert!(
            committed == wire_fixtures(),
            "{WIRE_FIXTURES_PATH} is stale; run `cargo test regenerate_wire_fixtures -- --ignored`"
        );
    }

    #[test]
    #[ignore = "rewrites the committed wire fixtures"]
    fn regenerate_wire_fixtures() {
        std::fs::write(WIRE_FIXTURES_PATH, wire_fixtures()).expect("writable fixtures");
    }

    #[test]
    fn commands_round_trip() {
        for (id, (_, body)) in every_command().into_iter().enumerate() {
            let command = Command {
                id: u32::try_from(id).unwrap_or(0),
                body,
            };
            assert_eq!(Command::decode(&encode(&command)), Ok(command));
        }
    }

    #[test]
    fn responses_round_trip() {
        for (id, (_, body)) in every_response().into_iter().enumerate() {
            let response = Response {
                id: u32::try_from(id).unwrap_or(0),
                body,
            };
            assert_eq!(decode(&response.encode()), Ok(response));
        }
    }

    #[test]
    fn events_round_trip() {
        for (_, event) in every_event() {
            assert_eq!(Event::decode(&event.encode()), Ok(event));
        }
    }

    #[test]
    fn hello_round_trips() {
        let hello = Hello {
            daemon_version: "0.1.0".to_owned(),
        };
        assert_eq!(decode(&hello.encode()), Ok(hello));
    }

    #[test]
    fn strings_longer_than_the_decoder_scratch_buffer_round_trip() {
        let command = Command {
            id: 1,
            body: CommandBody::SetProfile {
                profile: "ProfilePaper_brightness = 200\n".repeat(1_000),
            },
        };
        assert_eq!(Command::decode(&encode(&command)), Ok(command));
    }

    fn an_image_header() -> ImageHeader {
        ImageHeader {
            seq_id: 42,
            stream_id: 0,
            scan_side: 1,
            resolution: 200,
            pixels_per_line: 1_700,
            lines: 2_200,
            bytes_per_line: 1_700,
            bits_per_pixel: 8,
            file_format: 2,
            compression: 0,
            double_feed: 0,
            blank_page: 0,
            integrity: 0,
            counters: [1, 2, 3, 4],
            endorser_front_text: Some("batch7_0042".to_owned()),
            endorser_back_text: None,
        }
    }

    #[test]
    fn images_round_trip_without_touching_the_pixels() {
        let header = an_image_header();
        let pixels: Vec<u8> = (0..=255).cycle().take(10_000).collect();
        let mut frame = encode_image_frame_prefix(&header, pixels.len()).expect("within the limit");
        frame.extend_from_slice(&pixels);
        let (frame_header, payload) = frame.split_at(FRAME_HEADER_LENGTH);
        let (frame_type, length) =
            decode_frame_header(frame_header.try_into().expect("whole header")).expect("valid");
        assert_eq!(
            (frame_type, length as usize),
            (frame_type::IMAGE, payload.len())
        );
        let (decoded_header, decoded_pixels) = decode_image(payload).expect("image should decode");
        assert_eq!(decoded_header, header);
        assert_eq!(decoded_pixels, pixels.as_slice());
    }

    #[test]
    fn an_empty_image_is_still_a_valid_frame() {
        let header = an_image_header();
        let frame = encode_image_frame_prefix(&header, 0).expect("within the limit");
        let (_, pixels) = decode_image(&frame[FRAME_HEADER_LENGTH..]).expect("image should decode");
        assert!(pixels.is_empty());
    }

    #[test]
    fn frames_round_trip() {
        let payload = b"payload".as_slice();
        let frame = encode_frame(frame_type::EVENT, payload);
        let header: [u8; FRAME_HEADER_LENGTH] = frame[..FRAME_HEADER_LENGTH]
            .try_into()
            .expect("header is the right size");
        assert_eq!(
            decode_frame_header(&header),
            Ok((frame_type::EVENT, u32::try_from(payload.len()).unwrap_or(0)))
        );
        assert_eq!(&frame[FRAME_HEADER_LENGTH..], payload);
    }

    #[test]
    fn an_oversized_frame_is_refused_before_it_is_allocated() {
        let mut header = [0u8; FRAME_HEADER_LENGTH];
        header[0] = frame_type::IMAGE;
        header[1..].copy_from_slice(&u32::MAX.to_le_bytes());
        assert_eq!(
            decode_frame_header(&header),
            Err(DecodeError::FrameTooLarge { length: u32::MAX })
        );
    }

    #[test]
    fn a_truncated_payload_is_an_error_rather_than_a_panic() {
        let encoded = encode(&Command {
            id: 1,
            body: CommandBody::Connect {
                app_id: "VxCentralScan".to_owned(),
            },
        });
        for length in 0..encoded.len() {
            assert!(
                Command::decode(&encoded[..length]).is_err(),
                "a {length}-byte prefix should not decode"
            );
        }
    }

    #[test]
    fn a_truncated_image_header_is_an_error() {
        let frame = encode_image_frame_prefix(&an_image_header(), 0).expect("within the limit");
        let payload = &frame[FRAME_HEADER_LENGTH..];
        for length in 0..payload.len() {
            assert!(
                matches!(
                    decode_image(&payload[..length]),
                    Err(DecodeError::Invalid(_))
                ),
                "a {length}-byte prefix should not decode"
            );
        }
    }

    #[test]
    fn trailing_data_is_an_error() {
        let mut encoded = encode(&Command {
            id: 1,
            body: CommandBody::ScanStart,
        });
        encoded.push(0);
        assert_eq!(
            Command::decode(&encoded),
            Err(DecodeError::TrailingData { payload: 1 })
        );
    }

    #[test]
    fn unknown_kinds_are_errors() {
        #[derive(Serialize)]
        struct Unknown {
            id: u32,
            body: UnknownBody,
        }
        #[derive(Serialize)]
        struct UnknownBody {
            kind: &'static str,
        }
        let payload = encode(&Unknown {
            id: 1,
            body: UnknownBody {
                kind: "selfDestruct",
            },
        });
        assert!(matches!(
            Command::decode(&payload),
            Err(DecodeError::Invalid(message)) if message.contains("selfDestruct")
        ));
    }
}
