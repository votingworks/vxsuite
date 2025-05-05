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
            pub const BYTES: u32 = $crate::coding::byte_size(*Self::RANGE.end() as u64);

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
pub(crate) const fn bit_size(n: u64) -> u32 {
    if n == 0 { 1 } else { n.ilog2() + 1 }
}

#[inline]
pub(crate) const fn byte_size(n: u64) -> u32 {
    let bits = bit_size(n);
    let rem = bits % u8::BITS;
    (bits + rem) / u8::BITS
}
