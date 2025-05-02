use bitter::{BigEndianReader, BitReader};

/// Provides a means of decoding data from a `BitReader` directly, or by
/// decoding bytes as either big- or little-endian.
pub trait BitDecode
where
    Self: Sized,
{
    type Context;

    /// Try to decode a `Self` from the given `BitReader`, with a given context
    /// that may determine how the resulting value is decoded.
    #[must_use]
    fn bit_decode<R: BitReader>(bits: &mut R, context: Self::Context) -> Option<Self>;

    /// Try to decode a `Self` from the given `bytes`, with a given context
    /// that may determine how the resulting value is decoded.
    ///
    /// An automatic implementation is provided, and generally should not need
    /// to be overwritten in trait implementations.
    #[must_use]
    fn decode_be_bytes(bytes: &[u8], context: Self::Context) -> Option<Self> {
        let mut bits = BigEndianReader::new(bytes);
        Self::bit_decode(&mut bits, context)
    }
}

#[macro_export]
macro_rules! codable {
    ($name:ident, $inner:path, $range:expr) => {
        #[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
        #[serde(transparent)]
        #[must_use]
        pub struct $name($inner);

        #[allow(dead_code)]
        impl $name {
            const RANGE: ::std::ops::RangeInclusive<$inner> = $range;
            const MIN_U64: u64 = *Self::RANGE.start() as u64;
            const MIN_VALUE: $inner = *Self::RANGE.start();
            pub const MIN: Self = Self(*Self::RANGE.start());

            const MAX_U64: u64 = *Self::RANGE.end() as u64;
            const MAX_VALUE: $inner = *Self::RANGE.end();
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

        impl PartialEq for $name {
            fn eq(&self, other: &Self) -> bool {
                self.0 == other.0
            }
        }

        impl Eq for $name {}

        impl $crate::coding::BitDecode for $name {
            type Context = ();

            fn bit_decode<R: ::bitter::BitReader>(
                bits: &mut R,
                _context: Self::Context,
            ) -> Option<Self> {
                match bits.read_bits(Self::BITS)? {
                    index @ ..=Self::MAX_U64 => index.try_into().ok().map(Self),
                    _ => None,
                }
            }
        }
    };
}

#[inline]
pub(crate) const fn bit_size(n: u64) -> u32 {
    if n == 0 { 1 } else { n.ilog2() + 1 }
}
