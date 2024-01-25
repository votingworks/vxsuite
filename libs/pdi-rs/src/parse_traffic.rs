use std::{fmt, io};

use serde::Deserialize;

use crate::pdiscan_next::protocol;

mod pdiscan_next;

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
        return Ok(HexByte(u8::from_str_radix(s, 16).map_err(|e| {
            serde::de::Error::custom(format!("failed to parse hex byte: {e}"))
        })?));
    }
}

struct HexString(Vec<u8>);

impl fmt::Debug for HexString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "<")?;

        for (i, byte) in self.0.iter().enumerate() {
            if i > 0 {
                write!(f, " ")?;
            }
            write!(f, "{:02x}", byte)?;
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
        return Ok(HexString(
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
        ));
    }
}

#[derive(Debug, Deserialize)]
struct Packet {
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
            ENDPOINT_OUT => Endpoint::Out,
            ENDPOINT_IN => Endpoint::In,
            ENDPOINT_IN_ALT => Endpoint::InAlt,
            _ => Endpoint::Unknown,
        }
    }
}

impl fmt::Display for Endpoint {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Endpoint::Out => write!(f, "OUT"),
            Endpoint::In => write!(f, "IN"),
            Endpoint::InAlt => write!(f, "IN_ALT"),
            Endpoint::Unknown => write!(f, "UNKNOWN"),
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Build the CSV reader and iterate over each record.
    let mut rdr = csv::Reader::from_reader(io::stdin());
    for result in rdr.deserialize() {
        let packet: Packet = result?;

        if packet.transfer_type.0 != BULK_TRANSFER || packet.data.0.is_empty() {
            continue;
        }

        let endpoint = Endpoint::from(packet.endpoint_address.0);

        match protocol::parsers::any_packet(&packet.data.0.as_slice()) {
            Ok(([], protocol::Packet::Incoming(incoming))) => {
                println!("{endpoint} {incoming:?}");
            }
            Ok(([], protocol::Packet::Outgoing(outgoing))) => {
                println!("{endpoint} {outgoing:?}");
            }
            Ok((remaining, parsed)) => {
                println!("{endpoint} {parsed:?} REMAINING: {remaining:?}");
            }
            Err(_) => {
                println!(
                    "{endpoint} UNKNOWN {packet:?} (string: {string:?}) (length: {length})",
                    string = String::from_utf8_lossy(&packet.data.0.as_slice()),
                    length = packet.data.0.len(),
                );
            }
        }
    }

    Ok(())
}
