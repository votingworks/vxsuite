use types_rs::pair::Pair;

use crate::{
    ballot_card::BallotImage,
    interpret::TimingMarkAlgorithm,
    timing_marks::{
        self,
        contours::{find_timing_mark_grid, FindTimingMarkGridOptions},
        DefaultForGeometry, TimingMarks,
    },
};

use super::{
    barcode_data::BarcodeData,
    identified_ballot_card::{
        IdentifiedBallotCard, IdentifiedBallotCardParts, IdentifiedBubbleBallotCard,
    },
    Options, Result,
};

/// A bubble ballot card whose position and scale have been registered to a
/// known coordinate system by locating the timing marks along its borders.
///
/// Registration aligns the scanned image with the ballot’s logical layout,
/// allowing later steps (e.g. bubble scoring) to map grid units to raw pixel
/// positions.
pub struct RegisteredBubbleBallotCard {
    options: Options,
    ballot_images: Pair<BallotImage>,
    barcode_data: BarcodeData,
    timing_marks: Pair<TimingMarks>,
}

impl RegisteredBubbleBallotCard {
    pub fn from_identified_ballot(
        identified_bubble_ballot_card: IdentifiedBubbleBallotCard,
    ) -> Result<Self> {
        let IdentifiedBallotCardParts {
            options,
            ballot_images,
            barcode_data,
        } = identified_ballot_card.into_parts();

        let timing_marks = ballot_images
            .map(|ballot_image| {
                match options.timing_mark_algorithm {
            TimingMarkAlgorithm::Corners => timing_marks::corners::find_timing_mark_grid(
                &ballot_image,
                &timing_marks::corners::Options::default_for_geometry(ballot_image.geometry()),
            ),
            TimingMarkAlgorithm::Contours { inference } => {
                timing_marks::contours::find_timing_mark_grid(
                    &ballot_image,
                    &FindTimingMarkGridOptions {
                        allowed_timing_mark_inset_percentage_of_width:
                            timing_marks::contours::ALLOWED_TIMING_MARK_INSET_PERCENTAGE_OF_WIDTH,
                        inference,
                    },
                )
            }
        }
            })
            .into_result()?;

        todo!()
    }
}
