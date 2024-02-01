use std::{fmt, io};

use bitter::{BigEndianReader, BitReader};
use image::{DynamicImage, ImageBuffer, Luma};
use serde::Deserialize;

use pdi_rs::pdiscan::protocol::{
    self,
    packets::{Incoming, Packet},
    types::Side,
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
        Ok(HexByte(u8::from_str_radix(s, 16).map_err(|e| {
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
            write!(f, "{:02x}", byte)?;
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
        Ok(HexString(
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
    const WIDTH: u32 = 1728;
    const APPROXIMATE_HEIGHT: u32 = 2400;

    // Build the CSV reader and iterate over each record.
    let mut rdr = csv::Reader::from_reader(io::stdin());
    let mut top_image_data = Vec::with_capacity((WIDTH * APPROXIMATE_HEIGHT) as usize);
    let mut bottom_image_data = Vec::with_capacity((WIDTH * APPROXIMATE_HEIGHT) as usize);

    for result in rdr.deserialize() {
        let packet: RawPacket = result?;

        if packet.transfer_type.0 != BULK_TRANSFER || packet.data.0.is_empty() {
            continue;
        }

        let endpoint = Endpoint::from(packet.endpoint_address.0);

        if let Endpoint::InAlt = endpoint {
            let data: Vec<_> = packet.data.0.iter().map(|byte| *byte ^ 0x33).collect();
            let mut reader = BigEndianReader::new(data.as_slice());
            let mut next_side = Side::Top;

            for _ in 0..data.len() {
                let image_data = if let Side::Top = next_side {
                    &mut top_image_data
                } else {
                    &mut bottom_image_data
                };

                for _ in 0..u8::BITS {
                    image_data.push(if reader.read_bit().unwrap_or_default() {
                        u8::MIN
                    } else {
                        u8::MAX
                    });
                }

                next_side = match next_side {
                    Side::Top => Side::Bottom,
                    Side::Bottom => Side::Top,
                }
            }
            continue;
        }

        match protocol::parse_packet(&packet.data.0) {
            Ok(([], Packet::Incoming(Incoming::BeginScanEvent))) => {
                println!(
                    "{endpoint} {incoming:?}",
                    incoming = Incoming::BeginScanEvent
                );
                top_image_data.clear();
                bottom_image_data.clear();
            }
            Ok(([], Packet::Incoming(Incoming::EndScanEvent))) => {
                println!("{endpoint} {incoming:?}", incoming = Incoming::EndScanEvent);

                let height = top_image_data.len() as u32 / WIDTH;
                let mut top_image = ImageBuffer::new(WIDTH, height);
                let mut bottom_image = ImageBuffer::new(WIDTH, height);

                for (image_data, image) in [
                    (&top_image_data, &mut top_image),
                    (&bottom_image_data, &mut bottom_image),
                ] {
                    for (y, image_row) in image_data.chunks_exact(WIDTH as usize).enumerate() {
                        for (x, pixel) in image_row.iter().enumerate() {
                            image.put_pixel(x as u32, y as u32, Luma([*pixel]));
                        }
                    }
                }

                let top_image = DynamicImage::ImageLuma8(top_image).fliph();
                let bottom_image = DynamicImage::ImageLuma8(bottom_image);

                for (side, image) in [(Side::Top, top_image), (Side::Bottom, bottom_image)] {
                    image.save(format!("image-{side:?}.bmp"))?;
                }
            }
            Ok(([], Packet::Incoming(incoming))) => {
                println!("{endpoint} {incoming:?}");
            }
            Ok(([], Packet::Outgoing(outgoing))) => {
                println!("{endpoint} {outgoing:?}");
            }
            Ok((remaining, parsed)) => {
                println!("{endpoint} {parsed:?} REMAINING: {remaining:02x?}");
            }
            Err(_) => {
                println!(
                    "{endpoint} UNKNOWN {packet:?} (string: {string:?}) (length: {length})",
                    string =
                        String::from_utf8_lossy(&packet.data.0[..100.min(packet.data.0.len())]),
                    length = packet.data.0.len(),
                );
            }
        }
    }

    Ok(())
}
