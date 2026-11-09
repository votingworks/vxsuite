//! The binary wire protocol between `deskproctl` and its Node client: frames of a 1-byte type, a
//! little-endian `u32` payload length, then little-endian binary payloads.
//!
//! `../src/ts/protocol.ts` is the other half of this file and must change with it.

#![allow(clippy::missing_errors_doc)]

use std::string::FromUtf8Error;

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
    #[error("truncated payload: wanted {wanted} more bytes, {available} available")]
    Truncated { wanted: usize, available: usize },

    #[error("{payload} bytes of trailing data after a complete message")]
    TrailingData { payload: usize },

    #[error("unknown {kind} discriminant {value}")]
    UnknownDiscriminant { kind: &'static str, value: u32 },

    #[error("string is not valid UTF-8: {0}")]
    NotUtf8(#[from] FromUtf8Error),

    #[error("frame payload of {length} bytes exceeds the {MAX_FRAME_PAYLOAD} byte maximum")]
    FrameTooLarge { length: u32 },
}

type Result<T> = std::result::Result<T, DecodeError>;

/// Appends little-endian primitives to a byte buffer.
#[derive(Debug, Default)]
pub struct Writer(Vec<u8>);

impl Writer {
    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        Self(Vec::with_capacity(capacity))
    }

    pub fn u8(&mut self, value: u8) -> &mut Self {
        self.0.push(value);
        self
    }

    pub fn bool(&mut self, value: bool) -> &mut Self {
        self.u8(u8::from(value))
    }

    pub fn u16(&mut self, value: u16) -> &mut Self {
        self.0.extend_from_slice(&value.to_le_bytes());
        self
    }

    pub fn u32(&mut self, value: u32) -> &mut Self {
        self.0.extend_from_slice(&value.to_le_bytes());
        self
    }

    pub fn i32(&mut self, value: i32) -> &mut Self {
        self.0.extend_from_slice(&value.to_le_bytes());
        self
    }

    pub fn i64(&mut self, value: i64) -> &mut Self {
        self.0.extend_from_slice(&value.to_le_bytes());
        self
    }

    /// A `u32` byte length followed by the UTF-8 bytes.
    pub fn str(&mut self, value: &str) -> &mut Self {
        self.bytes(value.as_bytes())
    }

    /// A `u32` byte length followed by the bytes.
    pub fn bytes(&mut self, value: &[u8]) -> &mut Self {
        self.u32(u32::try_from(value.len()).unwrap_or(u32::MAX));
        self.0.extend_from_slice(value);
        self
    }

    #[must_use]
    pub fn finish(self) -> Vec<u8> {
        self.0
    }
}

/// Reads little-endian primitives out of a payload, bounds-checking every read.
#[derive(Debug)]
pub struct Reader<'a> {
    payload: &'a [u8],
    offset: usize,
}

impl<'a> Reader<'a> {
    #[must_use]
    pub fn new(payload: &'a [u8]) -> Self {
        Self { payload, offset: 0 }
    }

    fn take(&mut self, wanted: usize) -> Result<&'a [u8]> {
        let available = self.payload.len() - self.offset;
        if wanted > available {
            return Err(DecodeError::Truncated { wanted, available });
        }
        let slice = &self.payload[self.offset..self.offset + wanted];
        self.offset += wanted;
        Ok(slice)
    }

    pub fn u8(&mut self) -> Result<u8> {
        Ok(self.take(1)?[0])
    }

    pub fn bool(&mut self) -> Result<bool> {
        Ok(self.u8()? != 0)
    }

    pub fn u16(&mut self) -> Result<u16> {
        Ok(u16::from_le_bytes(
            self.take(2)?.try_into().unwrap_or_default(),
        ))
    }

    pub fn u32(&mut self) -> Result<u32> {
        Ok(u32::from_le_bytes(
            self.take(4)?.try_into().unwrap_or_default(),
        ))
    }

    pub fn i32(&mut self) -> Result<i32> {
        Ok(i32::from_le_bytes(
            self.take(4)?.try_into().unwrap_or_default(),
        ))
    }

    pub fn i64(&mut self) -> Result<i64> {
        Ok(i64::from_le_bytes(
            self.take(8)?.try_into().unwrap_or_default(),
        ))
    }

    pub fn str(&mut self) -> Result<String> {
        Ok(String::from_utf8(self.bytes()?.to_vec())?)
    }

    pub fn bytes(&mut self) -> Result<&'a [u8]> {
        let length = self.u32()? as usize;
        self.take(length)
    }

    /// Fails if anything is left over.
    pub fn finish(self) -> Result<()> {
        let remaining = self.payload.len() - self.offset;
        if remaining == 0 {
            Ok(())
        } else {
            Err(DecodeError::TrailingData { payload: remaining })
        }
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
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Command {
    pub id: u32,
    pub body: CommandBody,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CommandBody {
    /// Shut the daemon down. Answered before the process exits.
    Exit,
    /// Open `libinoapi.so` and connect to the scanner.
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

mod command_kind {
    pub const EXIT: u8 = 0;
    pub const CONNECT: u8 = 1;
    pub const DISCONNECT: u8 = 2;
    pub const GET_STATUS: u8 = 3;
    pub const GET_VERSIONS: u8 = 4;
    pub const GET_PROFILE: u8 = 5;
    pub const SET_PROFILE: u8 = 6;
    pub const SET_READY: u8 = 7;
    pub const SCAN_START: u8 = 8;
    pub const SCAN_STOP: u8 = 9;
    pub const SCAN_PAUSE: u8 = 10;
    pub const SCAN_RESUME: u8 = 11;
    pub const SET_IMPRINTER_TEXT: u8 = 12;
    pub const SET_COUNTER: u8 = 13;
    pub const SET_NUMBER_OF_SHEETS: u8 = 14;
}

impl Command {
    #[must_use]
    pub fn encode(&self) -> Vec<u8> {
        use CommandBody::{
            Connect, Disconnect, Exit, GetProfile, GetStatus, GetVersions, ScanPause, ScanResume,
            ScanStart, ScanStop, SetCounter, SetImprinterText, SetNumberOfSheets, SetProfile,
            SetReady,
        };
        let mut w = Writer::default();
        w.u32(self.id);
        match &self.body {
            Exit => w.u8(command_kind::EXIT),
            Connect { app_id } => w.u8(command_kind::CONNECT).str(app_id),
            Disconnect => w.u8(command_kind::DISCONNECT),
            GetStatus => w.u8(command_kind::GET_STATUS),
            GetVersions => w.u8(command_kind::GET_VERSIONS),
            GetProfile => w.u8(command_kind::GET_PROFILE),
            SetProfile { profile } => w.u8(command_kind::SET_PROFILE).str(profile),
            SetReady { ready } => w.u8(command_kind::SET_READY).bool(*ready),
            ScanStart => w.u8(command_kind::SCAN_START),
            ScanStop => w.u8(command_kind::SCAN_STOP),
            ScanPause => w.u8(command_kind::SCAN_PAUSE),
            ScanResume => w.u8(command_kind::SCAN_RESUME),
            SetImprinterText { text } => w.u8(command_kind::SET_IMPRINTER_TEXT).str(text),
            SetCounter { index, value } => w.u8(command_kind::SET_COUNTER).u8(*index).i64(*value),
            SetNumberOfSheets { count } => w.u8(command_kind::SET_NUMBER_OF_SHEETS).u32(*count),
        };
        w.finish()
    }

    pub fn decode(payload: &[u8]) -> Result<Self> {
        use CommandBody::{
            Connect, Disconnect, Exit, GetProfile, GetStatus, GetVersions, ScanPause, ScanResume,
            ScanStart, ScanStop, SetCounter, SetImprinterText, SetNumberOfSheets, SetProfile,
            SetReady,
        };
        let mut r = Reader::new(payload);
        let id = r.u32()?;
        let kind = r.u8()?;
        let body = match kind {
            command_kind::EXIT => Exit,
            command_kind::CONNECT => Connect { app_id: r.str()? },
            command_kind::DISCONNECT => Disconnect,
            command_kind::GET_STATUS => GetStatus,
            command_kind::GET_VERSIONS => GetVersions,
            command_kind::GET_PROFILE => GetProfile,
            command_kind::SET_PROFILE => SetProfile { profile: r.str()? },
            command_kind::SET_READY => SetReady { ready: r.bool()? },
            command_kind::SCAN_START => ScanStart,
            command_kind::SCAN_STOP => ScanStop,
            command_kind::SCAN_PAUSE => ScanPause,
            command_kind::SCAN_RESUME => ScanResume,
            command_kind::SET_IMPRINTER_TEXT => SetImprinterText { text: r.str()? },
            command_kind::SET_COUNTER => SetCounter {
                index: r.u8()?,
                value: r.i64()?,
            },
            command_kind::SET_NUMBER_OF_SHEETS => SetNumberOfSheets { count: r.u32()? },
            value => {
                return Err(DecodeError::UnknownDiscriminant {
                    kind: "command",
                    value: u32::from(value),
                });
            }
        };
        r.finish()?;
        Ok(Self { id, body })
    }
}

/// Why a command failed. Driver failures carry the driver's error text in the message.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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

impl ErrorCode {
    fn to_u16(self) -> u16 {
        match self {
            ErrorCode::DriverUnavailable => 1,
            ErrorCode::NotConnected => 2,
            ErrorCode::AlreadyConnected => 3,
            ErrorCode::Driver => 4,
            ErrorCode::BadRequest => 5,
            ErrorCode::Other => 6,
        }
    }

    fn from_u16(value: u16) -> Result<Self> {
        Ok(match value {
            1 => ErrorCode::DriverUnavailable,
            2 => ErrorCode::NotConnected,
            3 => ErrorCode::AlreadyConnected,
            4 => ErrorCode::Driver,
            5 => ErrorCode::BadRequest,
            6 => ErrorCode::Other,
            value => {
                return Err(DecodeError::UnknownDiscriminant {
                    kind: "error code",
                    value: u32::from(value),
                });
            }
        })
    }
}

/// The scanner state words, passed through raw. See [`crate::driver::Status`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Status {
    pub state: u32,
    pub operational_state: u32,
    pub images_available: u32,
    pub feeder_loaded: u32,
    pub next_feeder_loaded: u32,
    pub feeder_side: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Response {
    pub id: u32,
    pub body: ResponseBody,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResponseBody {
    Ok,
    Error { code: ErrorCode, message: String },
    Status(Status),
    Versions { api: String, scanner: String },
    Profile { profile: String },
}

mod response_kind {
    pub const OK: u8 = 0;
    pub const ERROR: u8 = 1;
    pub const STATUS: u8 = 2;
    pub const VERSIONS: u8 = 3;
    pub const PROFILE: u8 = 4;
}

impl Response {
    #[must_use]
    pub fn encode(&self) -> Vec<u8> {
        use ResponseBody as B;
        let mut w = Writer::default();
        w.u32(self.id);
        match &self.body {
            B::Ok => w.u8(response_kind::OK),
            B::Error { code, message } => {
                w.u8(response_kind::ERROR).u16(code.to_u16()).str(message)
            }
            B::Status(status) => w
                .u8(response_kind::STATUS)
                .u32(status.state)
                .u32(status.operational_state)
                .u32(status.images_available)
                .u32(status.feeder_loaded)
                .u32(status.next_feeder_loaded)
                .u32(status.feeder_side),
            B::Versions { api, scanner } => w.u8(response_kind::VERSIONS).str(api).str(scanner),
            B::Profile { profile } => w.u8(response_kind::PROFILE).str(profile),
        };
        w.finish()
    }

    pub fn decode(payload: &[u8]) -> Result<Self> {
        use ResponseBody as B;
        let mut r = Reader::new(payload);
        let id = r.u32()?;
        let kind = r.u8()?;
        let body = match kind {
            response_kind::OK => B::Ok,
            response_kind::ERROR => B::Error {
                code: ErrorCode::from_u16(r.u16()?)?,
                message: r.str()?,
            },
            response_kind::STATUS => B::Status(Status {
                state: r.u32()?,
                operational_state: r.u32()?,
                images_available: r.u32()?,
                feeder_loaded: r.u32()?,
                next_feeder_loaded: r.u32()?,
                feeder_side: r.u32()?,
            }),
            response_kind::VERSIONS => B::Versions {
                api: r.str()?,
                scanner: r.str()?,
            },
            response_kind::PROFILE => B::Profile { profile: r.str()? },
            value => {
                return Err(DecodeError::UnknownDiscriminant {
                    kind: "response",
                    value: u32::from(value),
                });
            }
        };
        r.finish()?;
        Ok(Self { id, body })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Event {
    /// A line from the driver's own logger.
    Log { message: String },
    /// A `ScannerControl_t`, passed through raw.
    Control {
        control_type: u32,
        num_data: u32,
        str_data: String,
    },
    /// The daemon lost the scanner and has torn the connection down. The client should reconnect.
    Disconnected { message: String },
    /// An image's `ImageInfo_t` was smaller than ours, so it was dropped unread.
    IncompatibleImage { size: i32 },
    /// The scanner's operational state changed; 0 while an error is active.
    OperationalState { state: i32 },
    /// An image's frame would exceed [`MAX_FRAME_PAYLOAD`], so it was dropped.
    OversizedImage {
        seq_id: i64,
        scan_side: i32,
        size: i64,
    },
}

mod event_kind {
    pub const LOG: u8 = 0;
    pub const CONTROL: u8 = 1;
    pub const DISCONNECTED: u8 = 2;
    pub const INCOMPATIBLE_IMAGE: u8 = 3;
    pub const OPERATIONAL_STATE: u8 = 4;
    pub const OVERSIZED_IMAGE: u8 = 5;
}

impl Event {
    #[must_use]
    pub fn encode(&self) -> Vec<u8> {
        use Event as E;
        let mut w = Writer::default();
        match self {
            E::Log { message } => w.u8(event_kind::LOG).str(message),
            E::Control {
                control_type,
                num_data,
                str_data,
            } => w
                .u8(event_kind::CONTROL)
                .u32(*control_type)
                .u32(*num_data)
                .str(str_data),
            E::Disconnected { message } => w.u8(event_kind::DISCONNECTED).str(message),
            E::IncompatibleImage { size } => w.u8(event_kind::INCOMPATIBLE_IMAGE).i32(*size),
            E::OperationalState { state } => w.u8(event_kind::OPERATIONAL_STATE).i32(*state),
            E::OversizedImage {
                seq_id,
                scan_side,
                size,
            } => w
                .u8(event_kind::OVERSIZED_IMAGE)
                .i64(*seq_id)
                .i32(*scan_side)
                .i64(*size),
        };
        w.finish()
    }

    pub fn decode(payload: &[u8]) -> Result<Self> {
        use Event as E;
        let mut r = Reader::new(payload);
        let event = match r.u8()? {
            event_kind::LOG => E::Log { message: r.str()? },
            event_kind::CONTROL => E::Control {
                control_type: r.u32()?,
                num_data: r.u32()?,
                str_data: r.str()?,
            },
            event_kind::DISCONNECTED => E::Disconnected { message: r.str()? },
            event_kind::INCOMPATIBLE_IMAGE => E::IncompatibleImage { size: r.i32()? },
            event_kind::OPERATIONAL_STATE => E::OperationalState { state: r.i32()? },
            event_kind::OVERSIZED_IMAGE => E::OversizedImage {
                seq_id: r.i64()?,
                scan_side: r.i32()?,
                size: r.i64()?,
            },
            value => {
                return Err(DecodeError::UnknownDiscriminant {
                    kind: "event",
                    value: u32::from(value),
                });
            }
        };
        r.finish()?;
        Ok(event)
    }
}

/// The `ImageProperties_t` fields sent ahead of the pixels in an image frame.
#[derive(Debug, Clone, PartialEq, Eq)]
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
    pub endorser_front_text: String,
    pub endorser_back_text: String,
}

impl ImageHeader {
    fn write(&self, w: &mut Writer) {
        w.i64(self.seq_id)
            .i32(self.stream_id)
            .i32(self.scan_side)
            .i32(self.resolution)
            .i32(self.pixels_per_line)
            .i32(self.lines)
            .i32(self.bytes_per_line)
            .i32(self.bits_per_pixel)
            .i32(self.file_format)
            .i32(self.compression)
            .i32(self.double_feed)
            .i32(self.blank_page)
            .i32(self.integrity);
        for counter in self.counters {
            w.i64(counter);
        }
        w.str(&self.endorser_front_text)
            .str(&self.endorser_back_text);
    }

    fn read(r: &mut Reader<'_>) -> Result<Self> {
        Ok(Self {
            seq_id: r.i64()?,
            stream_id: r.i32()?,
            scan_side: r.i32()?,
            resolution: r.i32()?,
            pixels_per_line: r.i32()?,
            lines: r.i32()?,
            bytes_per_line: r.i32()?,
            bits_per_pixel: r.i32()?,
            file_format: r.i32()?,
            compression: r.i32()?,
            double_feed: r.i32()?,
            blank_page: r.i32()?,
            integrity: r.i32()?,
            counters: [r.i64()?, r.i64()?, r.i64()?, r.i64()?],
            endorser_front_text: r.str()?,
            endorser_back_text: r.str()?,
        })
    }
}

/// Encodes an image frame payload, copying `data` once.
#[must_use]
pub fn encode_image(header: &ImageHeader, data: &[u8]) -> Vec<u8> {
    let mut w = Writer::with_capacity(256 + data.len());
    header.write(&mut w);
    w.bytes(data);
    w.finish()
}

/// Decodes an image frame payload, borrowing the pixels from it.
pub fn decode_image(payload: &[u8]) -> Result<(ImageHeader, &[u8])> {
    let mut r = Reader::new(payload);
    let header = ImageHeader::read(&mut r)?;
    let data = r.bytes()?;
    r.finish()?;
    Ok((header, data))
}

/// The first frame the daemon writes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hello {
    pub daemon_version: String,
}

impl Hello {
    #[must_use]
    pub fn encode(&self) -> Vec<u8> {
        let mut w = Writer::default();
        w.str(&self.daemon_version);
        w.finish()
    }

    pub fn decode(payload: &[u8]) -> Result<Self> {
        let mut r = Reader::new(payload);
        let hello = Self {
            daemon_version: r.str()?,
        };
        r.finish()?;
        Ok(hello)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn every_command() -> Vec<CommandBody> {
        use CommandBody as C;
        vec![
            C::Exit,
            C::Connect {
                app_id: "VxCentralScan".to_owned(),
            },
            C::Disconnect,
            C::GetStatus,
            C::GetVersions,
            C::GetProfile,
            C::SetProfile {
                profile: "ProfilePaper_brightness = 200\n".to_owned(),
            },
            C::SetReady { ready: true },
            C::SetReady { ready: false },
            C::ScanStart,
            C::ScanStop,
            C::ScanPause,
            C::ScanResume,
            C::SetImprinterText {
                text: "batch7_%NMC4%%CNT1%".to_owned(),
            },
            C::SetCounter {
                index: 1,
                value: -9_000_000_000,
            },
            C::SetNumberOfSheets { count: 25 },
        ]
    }

    fn every_response() -> Vec<ResponseBody> {
        use ResponseBody as R;
        vec![
            R::Ok,
            R::Error {
                code: ErrorCode::DriverUnavailable,
                message: "no such file".to_owned(),
            },
            R::Error {
                code: ErrorCode::NotConnected,
                message: String::new(),
            },
            R::Error {
                code: ErrorCode::AlreadyConnected,
                message: String::new(),
            },
            R::Error {
                code: ErrorCode::Driver,
                message: "ScanStart failed".to_owned(),
            },
            R::Error {
                code: ErrorCode::BadRequest,
                message: String::new(),
            },
            R::Error {
                code: ErrorCode::Other,
                message: "…unicode ✓".to_owned(),
            },
            R::Status(Status {
                state: 2,
                operational_state: 1,
                images_available: 4,
                feeder_loaded: 1,
                next_feeder_loaded: 0,
                feeder_side: 0,
            }),
            R::Versions {
                api: "3.0.0.0".to_owned(),
                scanner: "DeskPro 631".to_owned(),
            },
            R::Profile {
                profile: String::new(),
            },
        ]
    }

    fn every_event() -> Vec<Event> {
        vec![
            Event::Log {
                message: "state scanning".to_owned(),
            },
            Event::Control {
                control_type: 30,
                num_data: 1,
                str_data: "Feeder empty".to_owned(),
            },
            Event::Disconnected {
                message: "ERR_SCANNER_NOTCONNECTED".to_owned(),
            },
            Event::IncompatibleImage { size: 30_000 },
            Event::OperationalState { state: 0 },
            Event::OversizedImage {
                seq_id: 42,
                scan_side: 1,
                size: 70_000_000,
            },
        ]
    }

    #[test]
    fn commands_round_trip() {
        for (id, body) in every_command().into_iter().enumerate() {
            let command = Command {
                id: u32::try_from(id).unwrap_or(0),
                body,
            };
            assert_eq!(Command::decode(&command.encode()), Ok(command));
        }
    }

    #[test]
    fn responses_round_trip() {
        for (id, body) in every_response().into_iter().enumerate() {
            let response = Response {
                id: u32::try_from(id).unwrap_or(0),
                body,
            };
            assert_eq!(Response::decode(&response.encode()), Ok(response));
        }
    }

    #[test]
    fn events_round_trip() {
        for event in every_event() {
            assert_eq!(Event::decode(&event.encode()), Ok(event));
        }
    }

    #[test]
    fn hello_round_trips() {
        let hello = Hello {
            daemon_version: "0.1.0".to_owned(),
        };
        assert_eq!(Hello::decode(&hello.encode()), Ok(hello));
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
            endorser_front_text: "batch7_0042".to_owned(),
            endorser_back_text: String::new(),
        }
    }

    #[test]
    fn images_round_trip_without_touching_the_pixels() {
        let header = an_image_header();
        let pixels: Vec<u8> = (0..=255).cycle().take(10_000).collect();
        let payload = encode_image(&header, &pixels);
        let (decoded_header, decoded_pixels) = decode_image(&payload).expect("image should decode");
        assert_eq!(decoded_header, header);
        assert_eq!(decoded_pixels, pixels.as_slice());
    }

    #[test]
    fn an_empty_image_is_still_a_valid_frame() {
        let header = an_image_header();
        let payload = encode_image(&header, &[]);
        let (_, pixels) = decode_image(&payload).expect("image should decode");
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
        let encoded = Command {
            id: 1,
            body: CommandBody::Connect {
                app_id: "VxCentralScan".to_owned(),
            },
        }
        .encode();
        for length in 0..encoded.len() {
            assert!(
                Command::decode(&encoded[..length]).is_err(),
                "a {length}-byte prefix should not decode"
            );
        }
    }

    #[test]
    fn trailing_data_is_an_error() {
        let mut encoded = Command {
            id: 1,
            body: CommandBody::ScanStart,
        }
        .encode();
        encoded.push(0);
        assert_eq!(
            Command::decode(&encoded),
            Err(DecodeError::TrailingData { payload: 1 })
        );
    }

    #[test]
    fn unknown_discriminants_are_named_in_the_error() {
        assert_eq!(
            Command::decode(&[1, 0, 0, 0, 200]),
            Err(DecodeError::UnknownDiscriminant {
                kind: "command",
                value: 200
            })
        );
        assert_eq!(
            Event::decode(&[200]),
            Err(DecodeError::UnknownDiscriminant {
                kind: "event",
                value: 200
            })
        );
        assert_eq!(
            Response::decode(&[1, 0, 0, 0, 200]),
            Err(DecodeError::UnknownDiscriminant {
                kind: "response",
                value: 200
            })
        );
        assert_eq!(
            Response::decode(&[1, 0, 0, 0, 1, 99, 0, 0, 0, 0, 0]),
            Err(DecodeError::UnknownDiscriminant {
                kind: "error code",
                value: 99
            })
        );
    }

    #[test]
    fn invalid_utf8_in_a_string_is_an_error() {
        // A Connect command whose app id is a lone 0xff byte.
        let payload = [1, 0, 0, 0, 1, 1, 0, 0, 0, 0xff];
        assert!(matches!(
            Command::decode(&payload),
            Err(DecodeError::NotUtf8(_))
        ));
    }
}
