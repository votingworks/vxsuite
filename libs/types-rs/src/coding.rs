use std::io;

use bitstream_io::{
    BigEndian, BitRead, BitReader, BitWrite, BitWriter, FromBitStream, FromBitStreamWith,
    ToBitStream, ToBitStreamWith,
};

/// Defines a type that can be encoded and decoded from a bitstream.
///
/// ```
/// # use types_rs::codable;
/// codable!(MyType, u8, 0..=127);
/// assert_eq!(MyType::MIN, MyType::new(0).unwrap());
/// assert_eq!(MyType::MAX, MyType::new(127).unwrap());
/// assert_eq!(MyType::BITS, 7);
/// ```
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

            pub const BITS: u32 = $crate::coding::const_bit_size(*Self::RANGE.end() as u64);

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

        impl ::std::fmt::Display for $name {
            fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> Result<(), ::std::fmt::Error> {
                write!(f, "{}", self.0)
            }
        }
    };
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Invalid value: {0}")]
    InvalidValue(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

/// Calculate the number of bits required to represent a value. This version
/// exists for const contexts since trait implementation functions cannot be
/// `const` functions.
///
/// ```
/// # use types_rs::coding::const_bit_size;
/// assert_eq!(const_bit_size(0u64), 0);
/// assert_eq!(const_bit_size(1u64), 1);
/// assert_eq!(const_bit_size(12345u64), 14);
/// ```
pub const fn const_bit_size(value: u64) -> u32 {
    u64::BITS - value.leading_zeros()
}

/// Trait for calculating the number of bits required to represent a value,
/// implemented for primitive numeric types.
pub trait BitSize {
    fn bit_size(self) -> u32;
}

macro_rules! impl_bit_size {
    ($type:path) => {
        impl BitSize for $type {
            fn bit_size(self) -> u32 {
                Self::BITS - self.leading_zeros()
            }
        }
    };
}

impl_bit_size!(u8);
impl_bit_size!(u32);
impl_bit_size!(u64);
impl_bit_size!(usize);

/// Encode a codable value to an array of bytes using big-endian byte order.
/// Ensures that the result is byte-aligned, so there may be some padding bits
/// at the end.
///
/// ```
/// # use std::io;
/// # use types_rs::{coding, codable};
/// codable!(MyType, u8, 0..=31);
/// assert_eq!(MyType::BITS, 5);
///
/// let data = coding::encode(&MyType::new(15).unwrap()).unwrap();
/// assert_eq!(data, vec![0b0111_1000]);
/// ```
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
/// ```
/// # use types_rs::coding;
/// # use types_rs::codable;
/// # use std::io;
/// # use bitstream_io::{BigEndian, BitReader, ToBitStreamWith};
/// #[derive(Debug, PartialEq)]
/// struct BallotType {
///     value: u8,
///     label: String,
/// }
///
/// impl ToBitStreamWith<'_> for BallotType {
///     type Context = Vec<&'static str>;
///     type Error = io::Error;
///
///     fn to_writer<W: bitstream_io::BitWrite + ?Sized>(&self, writer: &mut W, context: &Self::Context) -> Result<(), Self::Error> {
///         assert_eq!(&self.label, context[self.value as usize]);
///         writer.write_unsigned_var(2, self.value)?;
///         Ok(())
///     }
/// }
///
/// let labels = vec!["A", "B", "C", "D"];
///
/// assert_eq!(coding::encode_with(&BallotType { value: 0, label: "A".to_owned() }, &labels).unwrap(), vec![0b0000_0000]);
/// assert_eq!(coding::encode_with(&BallotType { value: 1, label: "B".to_owned() }, &labels).unwrap(), vec![0b0100_0000]);
/// assert_eq!(coding::encode_with(&BallotType { value: 2, label: "C".to_owned() }, &labels).unwrap(), vec![0b1000_0000]);
/// assert_eq!(coding::encode_with(&BallotType { value: 3, label: "D".to_owned() }, &labels).unwrap(), vec![0b1100_0000]);
/// ```
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
/// ```
/// # use std::io;
/// # use types_rs::coding;
/// # use bitstream_io::BitWrite;
/// let data = coding::collect_writes::<io::Error>(|writer| {
///     writer.write_bit(true)?;
///     writer.write_bit(false)?;
///     writer.write_bit(true)?;
///     writer.write_bit(false)?;
///     writer.write_bit(true)?;
///     writer.write_bit(false)?;
///     Ok(())
/// }).unwrap();
///
/// // Alternating bits x6 then automatic padding x2.
/// assert_eq!(data, vec![0b1010_1000]);
/// ```
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

/// Decode a codable value from an array of bytes using big-endian byte order.
/// Ensures that there is no extra data at the end beyond the padding required
/// to end byte-aligned.
///
/// ```
/// # use types_rs::coding;
/// # use types_rs::codable;
/// # use std::io;
/// codable!(MyType, u8, 0..=3);
/// assert_eq!(coding::decode::<MyType>(&[0b0000_0000]).unwrap(), MyType(0));
/// assert_eq!(coding::decode::<MyType>(&[0b0100_0000]).unwrap(), MyType(1));
/// assert_eq!(coding::decode::<MyType>(&[0b1000_0000]).unwrap(), MyType(2));
/// assert_eq!(coding::decode::<MyType>(&[0b1100_0000]).unwrap(), MyType(3));
///
/// match coding::decode::<MyType>(&[0b0000_0001]) {
///     Err(coding::Error::IoError(e)) => {
///         assert_eq!(e.kind(), io::ErrorKind::InvalidData);
///         assert_eq!(e.to_string(), "Encountered non-zero bit while reading padding");
///     },
///     _ => panic!("Expected InvalidData error"),
/// }
/// ```
///
/// # Errors
///
/// Fails when constructing a value from the bytes fails or there is an I/O
/// error.
pub fn decode<T>(bytes: &[u8]) -> Result<T, T::Error>
where
    T: FromBitStream,
    T::Error: From<io::Error>,
{
    let mut reader = BitReader::<_, BigEndian>::new(bytes);
    let value = T::from_reader(&mut reader)?;

    // read the padding at the end
    while !reader.byte_aligned() {
        let padding = reader.read_bit()?;
        if padding {
            Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Encountered non-zero bit while reading padding",
            ))?;
        }
    }

    Ok(value)
}

/// Decode a codable value, with a context, from an array of bytes using
/// big-endian byte order. Ensures that there is no extra data at the end beyond
/// the padding required to end byte-aligned.
///
/// ```
/// # use types_rs::coding;
/// # use types_rs::codable;
/// # use std::io;
/// # use bitstream_io::{BigEndian, BitReader, FromBitStreamWith};
/// #[derive(Debug, PartialEq)]
/// struct BallotType {
///     value: u8,
///     label: String,
/// }
///
/// impl FromBitStreamWith<'_> for BallotType {
///     type Context = Vec<&'static str>;
///     type Error = io::Error;
///
///     fn from_reader<R: bitstream_io::BitRead + ?Sized>(reader: &mut R, context: &Self::Context) -> Result<Self, Self::Error> {
///         let value: u8 = reader.read_unsigned_var(2)?;
///         let label = context.get(value as usize).ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "Invalid label index"))?;
///         Ok(BallotType { value, label: label.to_string() })
///     }
/// }
///
/// let labels = vec!["A", "B", "C", "D"];
///
/// assert_eq!(coding::decode_with::<BallotType>(&[0b0000_0000], &labels).unwrap(), BallotType { value: 0, label: "A".to_owned() });
/// assert_eq!(coding::decode_with::<BallotType>(&[0b0100_0000], &labels).unwrap(), BallotType { value: 1, label: "B".to_owned() });
/// assert_eq!(coding::decode_with::<BallotType>(&[0b1000_0000], &labels).unwrap(), BallotType { value: 2, label: "C".to_owned() });
/// assert_eq!(coding::decode_with::<BallotType>(&[0b1100_0000], &labels).unwrap(), BallotType { value: 3, label: "D".to_owned() });
/// ```
///
/// # Errors
///
/// Fails when constructing a value from the bytes fails or there is an I/O
/// error.
pub fn decode_with<'a, T>(bytes: &[u8], context: &'a T::Context) -> Result<T, T::Error>
where
    T: FromBitStreamWith<'a>,
    T::Error: From<io::Error>,
{
    let mut reader = BitReader::<_, BigEndian>::new(bytes);
    let value = T::from_reader(&mut reader, context)?;

    // read the padding at the end
    while !reader.byte_aligned() {
        let padding = reader.read_bit()?;
        if padding {
            Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Encountered non-zero bit while reading padding",
            ))?;
        }
    }

    Ok(value)
}
