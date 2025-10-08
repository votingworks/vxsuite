use types_rs::{bmd::cvr::CastVoteRecord, bubble_ballot, coding, pair::Pair};

use crate::{ballot_card::BallotImage, qr_code};

use super::{
    barcode_data::{
        BallotPageData, BarcodeData, BubbleBallotBarcodeData, BubblePageData,
        SummaryBallotBarcodeData, SummaryPageData,
    },
    raw_ballot_card::{RawBallotCard, RawBallotCardParts},
    Error, Options, Result,
};

#[must_use]
pub enum IdentifiedBallotCard {
    Bubble(IdentifiedBubbleBallotCard),
    Summary(IdentifiedSummaryBallotCard),
}

#[must_use]
pub struct IdentifiedBubbleBallotCard {
    options: Options,
    ballot_images: Pair<BallotImage>,
    barcode_data: BubbleBallotBarcodeData,
}

#[must_use]
pub struct IdentifiedSummaryBallotCard {
    options: Options,
    ballot_images: Pair<BallotImage>,
    barcode_data: SummaryBallotBarcodeData,
}

impl IdentifiedBallotCard {
    pub fn from_raw_ballot_card(raw_ballot_card: RawBallotCard) -> Result<Self> {
        let RawBallotCardParts {
            options,
            mut ballot_images,
        } = raw_ballot_card.into_parts();

        let detect_results = Self::detect_barcodes(ballot_images.as_ref());

        match Self::try_decode_as_bubble_ballot(&options, ballot_images.as_ref(), detect_results) {
            Ok(bubble_ballot_metadata) => todo!(),
            Err(err) => {
                Self:try_decode_as_summary_ballot(&options, ballot_images.as_ref(), detect_results);
            },
        };

        let mut page_data = match detected.into() {
            (Ok(first), Ok(second)) => Pair::new(first, second),
            (Ok(first), Err(err)) => match first.infer_opposite_page_data() {
                Some(second) => Pair::new(first, second),
                None => return Err(err),
            },
            (Err(err), Ok(second)) => match second.infer_opposite_page_data() {
                Some(first) => Pair::new(first, second),
                None => return Err(err),
            },
            (Err(err), Err(_)) => return Err(err),
        };

        // If the pages are upside-down, rotate them to right side up.
        ballot_images
            .as_mut_ref()
            .zip(&mut page_data)
            .map(|(ballot_image, page_data)| {
                if page_data.is_upside_down() {
                    ballot_image.rotate180();
                    page_data.rotate180();
                }
            });

        // If the metadata in the first position is a back page, swap the order.
        if !page_data.first().is_front_page() {
            page_data.swap();
            ballot_images.swap();
        }

        Ok(Self::Bubble(IdentifiedBubbleBallotCard {
            options,
            ballot_images,
            barcode_data: BubbleBallotBarcodeData(page_data),
        }))
    }

    fn detect_barcodes(ballot_images: Pair<&BallotImage>) -> Pair<Result<qr_code::Detected>> {
        ballot_images.map(|ballot_image| {
            qr_code::detect(ballot_image.image(), ballot_image.debug()).map_err(|err| {
                Error::InvalidQrCodeMetadata {
                    label: ballot_image.label().to_owned(),
                    message: format!("unable to find barcode: {err}"),
                }
            })
        })
    }

    fn try_decode_as_bubble_ballot(
        options: &Options,
        ballot_images: Pair<&BallotImage>,
        detect_results: Pair<&Result<qr_code::Detected>>,
    ) -> Result<Pair<bubble_ballot::Metadata>> {
        match detect_results.into() {
            (Ok(first_detected), Ok(second_detected)) => Pair::new(first_detected, second_detected)
                .zip(ballot_images)
                .map(|(detected, ballot_image)| {
                    coding::decode_with::<bubble_ballot::Metadata>(
                        detected.bytes(),
                        &options.election,
                    )
                    .map_err(|err| Error::InvalidQrCodeMetadata {
                        label: ballot_image.label().to_owned(),
                        message: format!("unable to decode barcode: {err}"),
                    })
                })
                .into_result(),
            (Ok(detected), Err(_)) => {
                let metadata = coding::decode_with::<bubble_ballot::Metadata>(
                    detected.bytes(),
                    &options.election,
                )
                .map_err(|err| Error::InvalidQrCodeMetadata {
                    label: ballot_images.first().label().to_owned(),
                    message: format!("unable to decode barcode: {err}"),
                })?;
                let inferred = bubble_ballot::infer_missing_page_metadata(&metadata);
                Ok(Pair::new(metadata, inferred))
            }
            (Err(_), Ok(detected)) => {
                let metadata = coding::decode_with::<bubble_ballot::Metadata>(
                    detected.bytes(),
                    &options.election,
                )
                .map_err(|err| Error::InvalidQrCodeMetadata {
                    label: ballot_images.second().label().to_owned(),
                    message: format!("unable to decode barcode: {err}"),
                })?;
                let inferred = bubble_ballot::infer_missing_page_metadata(&metadata);
                Ok(Pair::new(metadata, inferred))
            }
            (Err(err), Err(_)) => return Err(err.clone()),
        }
    }

    fn try_decode_as_summary_ballot(
        options: &Options,
        ballot_images: Pair<&BallotImage>,
        detect_results: Pair<Result<&qr_code::Detected>>,
    ) {
        todo!()
    }
}
