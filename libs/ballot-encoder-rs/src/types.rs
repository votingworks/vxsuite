use std::num::NonZeroU8;

use static_assertions::const_assert;

use crate::codable;

codable!(PrecinctIndex, u32, 0..=4096);
codable!(BallotStyleIndex, u32, 0..=4096);
codable!(PageNumber, u8, 1..=30);

// Statically validate our maximum values fit within the types we're using.
// TODO: move this into `codable!`
const_assert!(PrecinctIndex::BITS <= usize::BITS);
const_assert!(BallotStyleIndex::BITS <= usize::BITS);
const_assert!(PageNumber::BITS <= u8::BITS);

impl PageNumber {
    /// Whether this is the first page of its sheet, i.e. the front.
    ///
    /// ```
    /// # use ballot_encoder_rs::types::PageNumber;
    /// let page_one = PageNumber::new_unchecked(1);
    /// let page_two = PageNumber::new_unchecked(2);
    ///
    /// assert!(page_one.is_recto());
    /// assert!(!page_two.is_recto());
    /// ```
    #[must_use]
    pub const fn is_recto(self) -> bool {
        self.0 % 2 == 1
    }

    /// Whether this is the second page of its sheet, i.e. the back.
    ///
    /// ```
    /// # use ballot_encoder_rs::types::PageNumber;
    /// let page_one = PageNumber::new_unchecked(1);
    /// let page_two = PageNumber::new_unchecked(2);
    ///
    /// assert!(!page_one.is_verso());
    /// assert!(page_two.is_verso());
    /// ```
    #[must_use]
    pub const fn is_verso(self) -> bool {
        self.0 % 2 == 0
    }

    /// Determines the sheet number.
    ///
    /// ```
    /// # use ballot_encoder_rs::types::PageNumber;
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
        let verso_page = if self.is_verso() {
            self
        } else {
            self.opposite()
        };
        NonZeroU8::new(verso_page.get() / 2).expect("sheet number >= 1")
    }

    /// Gets the `PageNumber` opposite this one on the same sheet.
    ///
    /// ```
    /// # use ballot_encoder_rs::types::PageNumber;
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

#[cfg(test)]
pub mod tests {
    use std::num::NonZeroU8;

    use proptest::{prelude::Strategy, proptest};

    use super::PageNumber;

    #[test]
    fn test_page_number() {
        let page_one = PageNumber::new_unchecked(1);
        let page_two = PageNumber::new_unchecked(2);

        assert_eq!(page_one.get(), 1);
        assert_eq!(page_two.get(), 2);

        assert_eq!(page_one, page_one);
        assert_ne!(page_one, page_two);

        assert!(page_one.is_recto());
        assert!(!page_two.is_recto());
        assert!(!page_one.is_verso());
        assert!(page_two.is_verso());

        assert_eq!(page_one.sheet_number(), NonZeroU8::new(1).unwrap());
        assert_eq!(page_two.sheet_number(), NonZeroU8::new(1).unwrap());
    }

    pub fn arbitrary_page_number() -> impl Strategy<Value = PageNumber> {
        (PageNumber::MIN_VALUE..=PageNumber::MAX_VALUE).prop_map(PageNumber::new_unchecked)
    }

    proptest! {
        #[test]
        fn test_valid_page_number(page_number in arbitrary_page_number()) {
            assert_eq!(page_number, page_number.opposite().opposite());
            assert_eq!(page_number.is_recto(), page_number.opposite().is_verso());
            assert_eq!(page_number.is_verso(), page_number.opposite().is_recto());
            assert_eq!(page_number.sheet_number(), page_number.opposite().sheet_number());
        }

        #[test]
        fn test_invalid_page_number(value in PageNumber::MAX_VALUE + 1..=u8::MAX) {
            assert_eq!(PageNumber::new(value), None);
        }
    }
}
