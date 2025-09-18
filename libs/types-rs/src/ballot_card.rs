use std::num::NonZeroU8;
use std::{fmt::Debug, io};

use bitstream_io::FromBitStream;
use serde::{Deserialize, Serialize};
use static_assertions::const_assert;

use crate::geometry::{Inch, Size};
use crate::{codable, coding};

codable!(PrecinctIndex, u32, 0..=4096);
codable!(BallotStyleIndex, u32, 0..=4096);
codable!(PageNumber, u8, 1..=30);
codable!(BallotAuditIdLength, u8, 1..=255);

// Statically validate our maximum values fit within the types we're using.
// TODO: move this into `codable!`
const_assert!(PrecinctIndex::BITS <= u32::BITS);
const_assert!(BallotStyleIndex::BITS <= u32::BITS);
const_assert!(PageNumber::BITS <= u8::BITS);
const_assert!(BallotAuditIdLength::BITS <= u8::BITS);

impl PageNumber {
    /// Whether this is the first page of its sheet, i.e. the front.
    ///
    /// ```
    /// # use types_rs::ballot_card::PageNumber;
    /// let page_one = PageNumber::new_unchecked(1);
    /// let page_two = PageNumber::new_unchecked(2);
    ///
    /// assert!(page_one.is_front());
    /// assert!(!page_two.is_front());
    /// ```
    #[must_use]
    pub const fn is_front(self) -> bool {
        self.0 % 2 == 1
    }

    /// Whether this is the second page of its sheet, i.e. the back.
    ///
    /// ```
    /// # use types_rs::ballot_card::PageNumber;
    /// let page_one = PageNumber::new_unchecked(1);
    /// let page_two = PageNumber::new_unchecked(2);
    ///
    /// assert!(!page_one.is_back());
    /// assert!(page_two.is_back());
    /// ```
    #[must_use]
    pub const fn is_back(self) -> bool {
        self.0 % 2 == 0
    }

    /// Determines the sheet number.
    ///
    /// ```
    /// # use types_rs::ballot_card::PageNumber;
    /// let page_one = PageNumber::new_unchecked(1);
    /// let page_two = PageNumber::new_unchecked(2);
    /// let page_three = PageNumber::new_unchecked(3);
    /// let page_four = PageNumber::new_unchecked(4);
    ///
    /// assert_eq!(page_one.sheet_number().get(), 1);
    /// assert_eq!(page_two.sheet_number().get(), 1);
    /// assert_eq!(page_three.sheet_number().get(), 2);
    /// assert_eq!(page_four.sheet_number().get(), 2);
    /// ```
    ///
    /// # Panics
    ///
    /// If `Self` is an invalid `PageNumber` that would produce a sheet number
    /// of zero, this method will panic.
    #[must_use]
    pub const fn sheet_number(self) -> NonZeroU8 {
        let verso_page = if self.is_back() {
            self
        } else {
            self.opposite()
        };
        NonZeroU8::new(verso_page.get() / 2).expect("sheet number >= 1")
    }

    /// Gets the `PageNumber` opposite this one on the same sheet.
    ///
    /// ```
    /// # use types_rs::ballot_card::PageNumber;
    /// let page_one = PageNumber::new_unchecked(1);
    /// let page_two = page_one.opposite();
    /// assert_eq!(page_two.get(), 2);
    /// ```
    pub const fn opposite(self) -> Self {
        match self.0 % 2 {
            0 => Self(self.0 - 1),
            1 => Self(self.0 + 1),
            _ => unreachable!(),
        }
    }
}

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize)]
pub enum BallotType {
    #[serde(rename = "precinct")]
    Precinct,
    #[serde(rename = "absentee")]
    Absentee,
    #[serde(rename = "provisional")]
    Provisional,
}

impl BallotType {
    const MAX: u32 = 2_u32.pow(4) - 1;
    const BITS: u32 = coding::bit_size(Self::MAX as u64);
}

impl FromBitStream for BallotType {
    type Error = ParseBallotTypeError;

    fn from_reader<R: bitstream_io::BitRead + ?Sized>(r: &mut R) -> Result<Self, Self::Error>
    where
        Self: Sized,
    {
        match r.read_var::<u8>(BallotType::BITS)? {
            0 => Ok(BallotType::Precinct),
            1 => Ok(BallotType::Absentee),
            2 => Ok(BallotType::Provisional),
            t => Err(Self::Error::InvalidNumericValue(t)),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ParseBallotTypeError {
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),

    #[error("Invalid numeric ballot type value: {0}")]
    InvalidNumericValue(u8),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum BallotSide {
    #[serde(rename = "front")]
    Front,
    #[serde(rename = "back")]
    Back,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize)]
pub enum PaperSize {
    #[serde(rename = "letter")]
    Letter,
    #[serde(rename = "legal")]
    Legal,
    #[serde(rename = "custom-8.5x17")]
    Custom17,
    #[serde(rename = "custom-8.5x19")]
    Custom19,
    #[serde(rename = "custom-8.5x22")]
    Custom22,
}

impl PaperSize {
    pub const fn dimensions(self) -> Size<Inch> {
        match self {
            PaperSize::Letter => Size {
                width: Inch::new(8.5),
                height: Inch::new(11.0),
            },
            PaperSize::Legal => Size {
                width: Inch::new(8.5),
                height: Inch::new(14.0),
            },
            PaperSize::Custom17 => Size {
                width: Inch::new(8.5),
                height: Inch::new(17.0),
            },
            PaperSize::Custom19 => Size {
                width: Inch::new(8.5),
                height: Inch::new(19.0),
            },
            PaperSize::Custom22 => Size {
                width: Inch::new(8.5),
                height: Inch::new(22.0),
            },
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
pub mod tests {
    use std::num::NonZeroU8;

    use proptest::{prelude::Strategy, proptest};

    use super::*;

    #[test]
    fn test_bit_counts() {
        assert_eq!(PrecinctIndex::BITS, 13);
    }

    #[test]
    fn test_page_number() {
        let page_one = PageNumber::new_unchecked(1);
        let page_two = PageNumber::new_unchecked(2);

        assert_eq!(page_one.get(), 1);
        assert_eq!(page_two.get(), 2);

        assert_eq!(page_one, page_one);
        assert_ne!(page_one, page_two);

        assert!(page_one.is_front());
        assert!(!page_two.is_front());
        assert!(!page_one.is_back());
        assert!(page_two.is_back());

        assert_eq!(page_one.sheet_number(), NonZeroU8::new(1).unwrap());
        assert_eq!(page_two.sheet_number(), NonZeroU8::new(1).unwrap());
    }

    fn arbitrary_page_number() -> impl Strategy<Value = PageNumber> {
        (PageNumber::MIN_VALUE..=PageNumber::MAX_VALUE).prop_map(PageNumber::new_unchecked)
    }

    proptest! {
        #[test]
        fn test_valid_page_number(page_number in arbitrary_page_number()) {
            assert_eq!(page_number, page_number.opposite().opposite());
            assert_eq!(page_number.is_front(), page_number.opposite().is_back());
            assert_eq!(page_number.is_back(), page_number.opposite().is_front());
            assert_eq!(page_number.sheet_number(), page_number.opposite().sheet_number());
        }

        #[test]
        fn test_invalid_page_number(value in PageNumber::MAX_VALUE + 1..=u8::MAX) {
            assert_eq!(PageNumber::new(value), None);
        }
    }

    #[test]
    fn test_ballot_side_deserialize() {
        assert_eq!(
            serde_json::from_str::<BallotSide>(r#""front""#).unwrap(),
            BallotSide::Front
        );
        assert_eq!(
            serde_json::from_str::<BallotSide>(r#""back""#).unwrap(),
            BallotSide::Back
        );
        assert!(serde_json::from_str::<BallotSide>(r#""foo""#).is_err());
    }

    #[test]
    fn test_ballot_side_serialize() {
        assert_eq!(
            serde_json::to_string(&BallotSide::Front).unwrap(),
            r#""front""#
        );
        assert_eq!(
            serde_json::to_string(&BallotSide::Back).unwrap(),
            r#""back""#
        );
    }
}
