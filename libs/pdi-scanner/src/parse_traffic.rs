use std::{fmt, io};

use serde::Deserialize;

use pdi_scanner::protocol::{
    self,
    image::{RawImageData, Sheet, DEFAULT_IMAGE_WIDTH},
    packets::{Incoming, Packet},
    types::{ScanSideMode, Side},
};

const ENDPOINT_OUT: u8 = 0x05;
const ENDPOINT_IN: u8 = 0x85;
const ENDPOINT_IN_ALT: u8 = 0x86;
const BULK_TRANSFER: u8 = 0x03;

struct HexByte(u8);

impl fmt::Debug for HexByte {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "0x{:02x}", self.0)
    }
}

impl<'de> Deserialize<'de> for HexByte {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s: String = Deserialize::deserialize(deserializer)?;
        let s = s.trim_start_matches("0x");
        Ok(Self(u8::from_str_radix(s, 16).map_err(|e| {
            serde::de::Error::custom(format!("failed to parse hex byte: {e}"))
        })?))
    }
}

struct HexString(Vec<u8>);

impl fmt::Debug for HexString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        const MAX_LENGTH: usize = 100;
        write!(f, "<")?;

        for (i, byte) in self.0.iter().take(MAX_LENGTH).enumerate() {
            if i > 0 {
                write!(f, " ")?;
            }
            write!(f, "{byte:02x}")?;
        }

        if self.0.len() > MAX_LENGTH {
            write!(f, " …")?;
        }

        write!(f, ">")
    }
}

impl<'de> Deserialize<'de> for HexString {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s: String = Deserialize::deserialize(deserializer)?;
        Ok(Self(
            s.as_bytes()
                .chunks_exact(2)
                .map(|chunk| {
                    u8::from_str_radix(
                        std::str::from_utf8(chunk).map_err(|e| {
                            serde::de::Error::custom(format!("failed to parse hex string: {e}"))
                        })?,
                        16,
                    )
                    .map_err(|e| {
                        serde::de::Error::custom(format!("failed to parse hex string: {e}"))
                    })
                })
                .collect::<Result<Vec<u8>, _>>()?,
        ))
    }
}

#[derive(Debug, Deserialize)]
struct RawPacket {
    transfer_type: HexByte,
    endpoint_address: HexByte,
    data: HexString,
}

#[derive(Debug)]
enum Endpoint {
    Out,
    In,
    InAlt,
    Unknown,
}

impl From<u8> for Endpoint {
    fn from(endpoint: u8) -> Self {
        match endpoint {
            ENDPOINT_OUT => Self::Out,
            ENDPOINT_IN => Self::In,
            ENDPOINT_IN_ALT => Self::InAlt,
            _ => Self::Unknown,
        }
    }
}

impl fmt::Display for Endpoint {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Out => write!(f, "OUT"),
            Self::In => write!(f, "IN"),
            Self::InAlt => write!(f, "IN_ALT"),
            Self::Unknown => write!(f, "UNKNOWN"),
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Build the CSV reader and iterate over each record.
    let mut rdr = csv::Reader::from_reader(io::stdin());
    let mut raw_image_data = RawImageData::new();

    for (lineno0, result) in rdr.deserialize().enumerate() {
        let lineno = lineno0 + 1;
        let packet: RawPacket = result?;

        if packet.transfer_type.0 != BULK_TRANSFER || packet.data.0.is_empty() {
            continue;
        }

        let endpoint = Endpoint::from(packet.endpoint_address.0);

        if matches!(endpoint, Endpoint::InAlt) {
            println!(
                "{lineno} {endpoint} appending {} bytes to raw image data",
                packet.data.0.len()
            );
            raw_image_data.extend_from_slice(&packet.data.0);
            continue;
        }

        match protocol::parse_packet(&packet.data.0) {
            Ok(([], Packet::Incoming(Incoming::BeginScanEvent))) => {
                println!(
                    "{lineno} {endpoint} {incoming:?}",
                    incoming = Incoming::BeginScanEvent
                );
                raw_image_data = RawImageData::new();
            }
            Ok(([], Packet::Incoming(Incoming::EndScanEvent))) => {
                println!(
                    "{lineno} {endpoint} {incoming:?}",
                    incoming = Incoming::EndScanEvent
                );

                let Sheet::Duplex(top_page, bottom_page) =
                    raw_image_data.try_decode_scan(DEFAULT_IMAGE_WIDTH, ScanSideMode::Duplex)?
                else {
                    eprintln!("skipping non-duplex scan");
                    continue;
                };

                for (side, page) in [(Side::Top, top_page), (Side::Bottom, bottom_page)] {
                    page.to_image()
                        .unwrap()
                        .save(format!("image-{side:?}.png"))?;
                }
            }
            Ok(([], Packet::Incoming(incoming))) => {
                println!("{lineno} {endpoint} {incoming:?}");
            }
            Ok(([], Packet::Outgoing(outgoing))) => {
                println!("{lineno} {endpoint} {outgoing:?}");
            }
            Ok((remaining, parsed)) => {
                println!("{lineno} {endpoint} {parsed:?} REMAINING: {remaining:02x?}");
            }
            Err(_) => {
                println!(
                    "{lineno} {endpoint} UNKNOWN {packet:?} (string: {string:?}) (length: {length})",
                    string =
                        String::from_utf8_lossy(&packet.data.0[..100.min(packet.data.0.len())]),
                    length = packet.data.0.len(),
                );
            }
        }
    }

    Ok(())
}
