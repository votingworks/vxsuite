use std::io;

use bitstream_io::{BigEndian, BitWrite, BitWriter, ToBitStream, ToBitStreamWith};

#[macro_export]
macro_rules! codable {
    ($name:ident, $inner:path, $range:expr) => {
        #[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
        #[serde(transparent)]
        #[must_use]
        pub struct $name($inner);

        #[allow(dead_code)]
        impl $name {
            pub const RANGE: ::std::ops::RangeInclusive<$inner> = $range;
            pub const MIN_VALUE: $inner = *Self::RANGE.start();
            pub const MIN: Self = Self(*Self::RANGE.start());

            pub const MAX_VALUE: $inner = *Self::RANGE.end();
            pub const MAX: Self = Self(*Self::RANGE.end());

            pub const BITS: u32 = $crate::coding::bit_size(*Self::RANGE.end() as u64);

            /// Makes a new `Self` validating that `value` is valid, returning
            /// `Some(Self)` if so and `None` if not.
            #[must_use]
            pub const fn new(value: $inner) -> Option<Self> {
                match value {
                    Self::MIN_VALUE..=Self::MAX_VALUE => Some(Self(value)),
                    _ => None,
                }
            }

            /// Makes a new `Self` without validating `value` is valid. It is
            /// your responsibility to ensure `value` is valid before passing it in.
            pub const fn new_unchecked(value: $inner) -> Self {
                Self(value)
            }

            #[must_use]
            pub const fn get(self) -> $inner {
                self.0
            }
        }

        impl ::bitstream_io::FromBitStream for $name {
            type Error = $crate::coding::Error;

            fn from_reader<R: ::bitstream_io::BitRead + ?Sized>(
                r: &mut R,
            ) -> Result<Self, Self::Error>
            where
                Self: Sized,
            {
                let value = r.read_var::<$inner>(Self::BITS)?;
                Self::new(value)
                    .ok_or_else(|| $crate::coding::Error::InvalidValue(value.to_string()))
            }
        }

        impl ::bitstream_io::ToBitStream for $name {
            type Error = $crate::coding::Error;

            fn to_writer<W: ::bitstream_io::BitWrite + ?Sized>(
                &self,
                w: &mut W,
            ) -> Result<(), Self::Error> {
                Ok(w.write_var::<$inner>(Self::BITS, self.0)?)
            }
        }

        impl PartialEq for $name {
            fn eq(&self, other: &Self) -> bool {
                self.0 == other.0
            }
        }

        impl Eq for $name {}
    };
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Invalid value: {0}")]
    InvalidValue(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

#[inline]
#[must_use]
pub const fn bit_size(n: u64) -> u32 {
    if n == 0 {
        1
    } else {
        n.ilog2() + 1
    }
}

/// Encode a codable value to an array of bytes using big-endian byte order.
/// Ensures that the result is byte-aligned, so there may be some padding bits
/// at the end.
///
/// # Errors
///
/// Fails when the contents cannot be encoded or there is an I/O error.
pub fn encode<T>(value: &T) -> Result<Vec<u8>, T::Error>
where
    T: ToBitStream,
    T::Error: From<io::Error>,
{
    collect_writes(|writer| value.to_writer(writer))
}

/// Encode a codable value, with a context, to an array of bytes using
/// big-endian byte order. Ensures that the result is byte-aligned, so there may
/// be some padding bits at the end.
///
/// # Errors
///
/// Fails when the contents cannot be encoded or there is an I/O error.
pub fn encode_with<'a, T>(value: &T, context: &'a T::Context) -> Result<Vec<u8>, T::Error>
where
    T: ToBitStreamWith<'a>,
    T::Error: From<io::Error>,
{
    collect_writes(|writer| value.to_writer(writer, context))
}

/// Call a callback with a [`BitWriter`], then collect all the data written
/// into a byte array in big-endian byte order. Ensures that the result is
/// byte-aligned, so there may be some padding bits at the end.
///
/// # Errors
///
/// Propagates errors from the given callback.
pub fn collect_writes<E>(
    f: impl FnOnce(&mut BitWriter<Vec<u8>, BigEndian>) -> Result<(), E>,
) -> Result<Vec<u8>, E>
where
    E: From<io::Error>,
{
    let mut writer = BitWriter::new(Vec::new());
    f(&mut writer)?;
    writer.byte_align()?;
    Ok(writer.into_writer())
}
