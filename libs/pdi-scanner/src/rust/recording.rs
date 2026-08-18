//! Records pdictl's I/O boundaries to a JSONL file so real scanner sessions
//! can be replayed as regression tests.
//!
//! Recording is enabled by setting the `PDICTL_RECORD` environment variable to
//! the path of the file to write. Every entry crossing pdictl's boundaries is
//! appended in observed order:
//!
//! - commands read from stdin
//! - raw packet bytes received from the scanner (pre-parse), including errors
//!   and the end of the USB task
//! - raw packet bytes successfully written to the scanner
//! - TLV frames written to stdout (large payloads are stored as a length and
//!   FNV-1a hash instead of the full bytes)
//!
//! The replay harness in `main.rs` feeds a recording's inputs back through the
//! command loop in lockstep and asserts that the outputs match.

use std::{
    fs::File,
    io::{BufRead, BufReader, BufWriter, Write},
    path::Path,
    sync::{Mutex, OnceLock},
    time::Instant,
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use flate2::{bufread::GzDecoder, write::GzEncoder, Compression};
use nusb::transfer::TransferError;

use crate::{Error, UsbError};

/// Version number written as the first entry of every recording, bumped when
/// the format changes incompatibly.
pub const FORMAT_VERSION: u32 = 1;

/// Environment variable naming the file to record to. Recording is disabled
/// when unset.
pub const RECORD_ENV_VAR: &str = "PDICTL_RECORD";

/// Stdout frame payloads up to this many bytes are recorded in full; larger
/// payloads (i.e. scanned images) are recorded as a length and hash, which is
/// enough for the replay harness to verify them.
pub const FULL_PAYLOAD_MAX_LENGTH: usize = 4096;

/// Which USB IN endpoint a packet arrived on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Endpoint {
    Primary,
    ImageData,
}

/// A recorded stdout frame payload: full bytes for small payloads, length and
/// FNV-1a 64 hash for large ones.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(untagged, rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum FramePayload {
    Full {
        payload_base64: String,
    },
    Hashed {
        payload_length: usize,
        payload_fnv1a64: String,
    },
}

impl FramePayload {
    #[must_use]
    pub fn new(payload: &[u8]) -> Self {
        if payload.len() <= FULL_PAYLOAD_MAX_LENGTH {
            Self::Full {
                payload_base64: STANDARD.encode(payload),
            }
        } else {
            Self::Hashed {
                payload_length: payload.len(),
                payload_fnv1a64: format!("{:016x}", fnv1a64(payload)),
            }
        }
    }

    /// Whether the given payload matches this recorded payload.
    #[must_use]
    pub fn matches(&self, payload: &[u8]) -> bool {
        *self == Self::new(payload)
    }
}

/// One line of a recording: when the entry was observed (milliseconds since
/// the recording started, for latency analysis) and the entry itself,
/// flattened.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub timestamp_ms: u64,
    #[serde(flatten)]
    pub entry: Entry,
}

/// One recorded event at a pdictl I/O boundary.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Entry {
    Meta {
        version: u32,
    },
    StdinCommand {
        line: String,
    },
    ScannerToHost {
        endpoint: Endpoint,
        data_base64: String,
    },
    ScannerToHostError {
        disconnected: bool,
        message: String,
    },
    ScannerTaskEnded,
    HostToScanner {
        data_base64: String,
    },
    StdoutFrame {
        frame_type: u8,
        payload: FramePayload,
    },
}

impl Entry {
    #[must_use]
    pub fn scanner_to_host(endpoint: Endpoint, data: &[u8]) -> Self {
        Self::ScannerToHost {
            endpoint,
            data_base64: STANDARD.encode(data),
        }
    }

    /// Records an error sent from the scanner task to the host, classified the
    /// same way pdictl classifies errors when reporting them on stdout.
    #[must_use]
    pub fn scanner_to_host_error(error: &Error) -> Self {
        let disconnected = matches!(
            error,
            Error::Usb {
                source: UsbError::DeviceNotFound
                    | UsbError::NusbTransfer(
                        TransferError::Disconnected
                            | TransferError::Fault
                            | TransferError::Cancelled
                            | TransferError::Stall,
                    ),
                ..
            }
        );
        Self::ScannerToHostError {
            disconnected,
            message: error.to_string(),
        }
    }

    #[must_use]
    pub fn host_to_scanner(data: &[u8]) -> Self {
        Self::HostToScanner {
            data_base64: STANDARD.encode(data),
        }
    }

    #[must_use]
    pub fn stdout_frame(frame_type: u8, payload: &[u8]) -> Self {
        Self::StdoutFrame {
            frame_type,
            payload: FramePayload::new(payload),
        }
    }
}

/// Decodes a recorded `data_base64` field.
///
/// # Errors
///
/// Fails if the string is not valid base64.
pub fn decode_base64(data: &str) -> Result<Vec<u8>, base64::DecodeError> {
    STANDARD.decode(data)
}

/// FNV-1a 64-bit hash, used to fingerprint large payloads in recordings.
#[must_use]
pub fn fnv1a64(bytes: &[u8]) -> u64 {
    const OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0000_0100_0000_01b3;
    bytes.iter().fold(OFFSET_BASIS, |hash, &byte| {
        (hash ^ u64::from(byte)).wrapping_mul(PRIME)
    })
}

struct Recorder {
    writer: Mutex<BufWriter<File>>,
    started: Instant,
}

static RECORDER: OnceLock<Option<Recorder>> = OnceLock::new();

fn recorder() -> Option<&'static Recorder> {
    RECORDER
        .get_or_init(|| {
            let path = std::env::var_os(RECORD_ENV_VAR)?;
            match File::create(&path) {
                Ok(file) => {
                    let recorder = Recorder {
                        writer: Mutex::new(BufWriter::new(file)),
                        started: Instant::now(),
                    };
                    match recorder.write(&Entry::Meta {
                        version: FORMAT_VERSION,
                    }) {
                        Ok(()) => {
                            tracing::info!("recording pdictl session to {path:?}");
                            Some(recorder)
                        }
                        Err(error) => {
                            tracing::error!("failed to write to recording file {path:?}: {error}");
                            None
                        }
                    }
                }
                Err(error) => {
                    tracing::error!("failed to create recording file {path:?}: {error}");
                    None
                }
            }
        })
        .as_ref()
}

impl Recorder {
    fn write(&self, entry: &Entry) -> std::io::Result<()> {
        let record = Record {
            timestamp_ms: u64::try_from(self.started.elapsed().as_millis()).unwrap_or(u64::MAX),
            entry: entry.clone(),
        };
        let Ok(mut writer) = self.writer.lock() else {
            return Ok(());
        };
        serde_json::to_writer(&mut *writer, &record)?;
        writer.write_all(b"\n")?;
        // Flush after each entry so a crash mid-session keeps everything
        // recorded up to that point.
        writer.flush()
    }
}

/// Whether recording is enabled. Use this to guard any work needed only to
/// construct an [`Entry`] (e.g. cloning packet bytes).
#[must_use]
pub fn is_enabled() -> bool {
    recorder().is_some()
}

/// Appends an entry to the recording, if enabled. Recording failures are
/// logged, never propagated: recording must not break scanning.
pub fn record(entry: &Entry) {
    let Some(recorder) = recorder() else { return };
    if let Err(error) = recorder.write(entry) {
        tracing::error!("failed to write recording entry: {error}");
    }
}

/// Reads all entries from a recording file, dropping the timestamps (which
/// exist for latency analysis, not replay).
///
/// # Errors
///
/// Fails if the file cannot be read or contains an invalid entry.
pub fn read(path: &Path) -> std::io::Result<Vec<Entry>> {
    Ok(read_records(path)?
        .into_iter()
        .map(|record| record.entry)
        .collect())
}

/// Whether a recording path names a gzip-compressed recording. Synthetic
/// fixtures are stored compressed so they can be committed at negligible size.
fn is_gzipped(path: &Path) -> bool {
    path.extension().is_some_and(|extension| extension == "gz")
}

/// Reads all records (timestamps included) from a recording file. Recordings
/// with a `.gz` extension are decompressed transparently.
///
/// # Errors
///
/// Fails if the file cannot be read or contains an invalid entry.
pub fn read_records(path: &Path) -> std::io::Result<Vec<Record>> {
    let file = BufReader::new(File::open(path)?);
    let reader: Box<dyn BufRead> = if is_gzipped(path) {
        Box::new(BufReader::new(GzDecoder::new(file)))
    } else {
        Box::new(file)
    };
    let mut records = Vec::new();
    for (index, line) in reader.lines().enumerate() {
        let line = line?;
        if line.is_empty() {
            continue;
        }
        let record: Record = serde_json::from_str(&line).map_err(|error| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("invalid entry on line {}: {error}", index + 1),
            )
        })?;
        records.push(record);
    }
    Ok(records)
}

/// Writes records to a recording file, gzip-compressing when the path has a
/// `.gz` extension. Used to produce synthetic fixtures (see the regeneration
/// test in `main.rs`), not by live recording, which appends incrementally.
///
/// # Errors
///
/// Fails if the file cannot be written.
pub fn write_records(path: &Path, records: &[Record]) -> std::io::Result<()> {
    let mut lines = Vec::new();
    for record in records {
        serde_json::to_writer(&mut lines, record)?;
        lines.push(b'\n');
    }
    if is_gzipped(path) {
        let mut encoder = GzEncoder::new(File::create(path)?, Compression::best());
        encoder.write_all(&lines)?;
        encoder.finish()?;
    } else {
        std::fs::write(path, lines)?;
    }
    Ok(())
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn fnv1a64_known_vectors() {
        // https://datatracker.ietf.org/doc/html/draft-eastlake-fnv (test vectors)
        assert_eq!(fnv1a64(b""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(fnv1a64(b"a"), 0xaf63_dc4c_8601_ec8c);
        assert_eq!(fnv1a64(b"foobar"), 0x8594_4171_f739_67e8);
    }

    #[test]
    fn frame_payload_full_and_hashed() {
        let small = vec![7u8; FULL_PAYLOAD_MAX_LENGTH];
        let payload = FramePayload::new(&small);
        assert!(matches!(payload, FramePayload::Full { .. }));
        assert!(payload.matches(&small));
        assert!(!payload.matches(&small[1..]));

        let large = vec![7u8; FULL_PAYLOAD_MAX_LENGTH + 1];
        let payload = FramePayload::new(&large);
        assert!(matches!(payload, FramePayload::Hashed { .. }));
        assert!(payload.matches(&large));
        assert!(!payload.matches(&large[1..]));
    }

    #[test]
    fn entry_json_round_trip() {
        let entries = vec![
            Entry::Meta {
                version: FORMAT_VERSION,
            },
            Entry::StdinCommand {
                line: r#"{"command":"connect"}"#.to_owned(),
            },
            Entry::scanner_to_host(Endpoint::Primary, b"#30"),
            Entry::scanner_to_host(Endpoint::ImageData, &[1, 2, 3]),
            Entry::ScannerToHostError {
                disconnected: true,
                message: "device disconnected".to_owned(),
            },
            Entry::ScannerTaskEnded,
            Entry::host_to_scanner(b"\x1BK"),
            Entry::stdout_frame(1, br#"{"response":"ok"}"#),
            Entry::stdout_frame(2, &vec![9u8; FULL_PAYLOAD_MAX_LENGTH + 1]),
        ];
        for entry in entries {
            let record = Record {
                timestamp_ms: 12345,
                entry,
            };
            let json = serde_json::to_string(&record).unwrap();
            assert!(json.contains("\"timestampMs\":12345"), "{json}");
            let parsed: Record = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed, record, "round trip failed for {json}");
        }
    }

    #[test]
    fn read_returns_entries_without_timestamps() {
        let path = std::env::temp_dir().join(format!(
            "pdictl-recording-read-test-{}.jsonl",
            std::process::id()
        ));
        std::fs::write(
            &path,
            "{\"timestampMs\":0,\"type\":\"meta\",\"version\":1}\n\
             {\"timestampMs\":42,\"type\":\"scannerTaskEnded\"}\n",
        )
        .unwrap();
        assert_eq!(
            read(&path).unwrap(),
            vec![Entry::Meta { version: 1 }, Entry::ScannerTaskEnded]
        );
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn read_rejects_invalid_entries() {
        let path = std::env::temp_dir().join(format!(
            "pdictl-recording-test-{}.jsonl",
            std::process::id()
        ));
        std::fs::write(
            &path,
            "{\"timestampMs\":0,\"type\":\"scannerTaskEnded\"}\n\nnot json\n",
        )
        .unwrap();
        let error = read(&path).unwrap_err();
        assert!(error.to_string().contains("line 3"), "{error}");
        std::fs::remove_file(&path).unwrap();
    }
}
