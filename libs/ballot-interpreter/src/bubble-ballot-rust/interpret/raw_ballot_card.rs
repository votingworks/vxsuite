use types_rs::pair::Pair;

use crate::ballot_card::BallotImage;

use super::Options;

#[must_use]
pub struct RawBallotCard {
    options: Options,
    ballot_images: Pair<BallotImage>,
}

impl RawBallotCard {
    pub const fn new(options: Options, ballot_images: Pair<BallotImage>) -> Self {
        Self {
            options,
            ballot_images,
        }
    }

    pub fn into_parts(self) -> RawBallotCardParts {
        RawBallotCardParts {
            options: self.options,
            ballot_images: self.ballot_images,
        }
    }
}

pub struct RawBallotCardParts {
    pub options: Options,
    pub ballot_images: Pair<BallotImage>,
}
