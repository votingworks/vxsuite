use std::{fmt::Display, io};

use bitstream_io::{FromBitStream, ToBitStream};

use crate::coding;

use super::error::Error;

/// Represents the name of a write-in candidate as entered by a voter on a BMD.
/// The name can only contain certain characters and has a maximum length, and
/// the constructor ensures that the name is valid.
#[derive(Debug, PartialEq, serde::Serialize)]
#[must_use]
pub struct WriteInName(String);

impl WriteInName {
    pub const CHARS: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ '\"-.,";
    pub const MAX_LENGTH: usize = 40;
    pub const BITS: u32 = coding::const_bit_size(Self::MAX_LENGTH as u64);

    /// Constructs a new [`WriteInName`] if the characters are all allowed in a
    /// write-in name. If not, returns [`None`].
    #[must_use]
    #[allow(dead_code)]
    pub fn new(name: impl Into<String>) -> Option<Self> {
        let name = name.into();
        if name.len() > Self::MAX_LENGTH {
            return None;
        }

        for ch in name.chars() {
            if !Self::CHARS.contains(ch) {
                return None;
            }
        }

        Some(Self(name))
    }
}

impl Display for WriteInName {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl ToBitStream for WriteInName {
    type Error = io::Error;

    fn to_writer<W: bitstream_io::BitWrite + ?Sized>(&self, w: &mut W) -> Result<(), Self::Error>
    where
        Self: Sized,
    {
        // write length
        w.write_unsigned_var(Self::BITS, self.0.len() as u32)?;

        // write character indexes
        for ch in self.0.chars() {
            let (index, _) = Self::CHARS
                .char_indices()
                .find(|(_, c)| *c == ch)
                .expect("character must be in CHARS");
            w.write_unsigned_var(Self::BITS, index as u32)?;
        }

        Ok(())
    }
}

impl FromBitStream for WriteInName {
    type Error = Error;

    fn from_reader<R: bitstream_io::BitRead + ?Sized>(r: &mut R) -> Result<Self, Self::Error>
    where
        Self: Sized,
    {
        let write_in_length: u32 = r.read_unsigned_var(Self::BITS)?;

        let mut name = String::with_capacity(write_in_length as usize);

        for _ in 0..write_in_length {
            let index: u32 = r.read_unsigned_var(Self::BITS)?;
            let Some(ch) = Self::CHARS.chars().nth(index as usize) else {
                return Err(Error::Coding(coding::Error::InvalidValue(format!(
                    "write-in character code {index} is invalid"
                ))));
            };
            name.push(ch);
        }

        // Directly construct the value since we've already validated it above.
        Ok(Self(name))
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use proptest::{prop_compose, proptest};

    prop_compose! {
        pub fn arbitrary_write_in_name()(name in "[ABCDEFGHIJKLMNOPQRSTUVWXYZ '\"\\-.,]{0,40}") -> WriteInName {
            WriteInName::new(name).unwrap()
        }
    }

    proptest! {
        #[test]
        fn test_write_in_name_round_trip(name in arbitrary_write_in_name()) {
            let bytes = coding::encode(&name).unwrap();
            let decoded_name = coding::decode(&bytes).unwrap();
            assert_eq!(name, decoded_name);
        }
    }
}
