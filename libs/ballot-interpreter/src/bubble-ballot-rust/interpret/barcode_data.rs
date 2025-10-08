use types_rs::{bmd::cvr::CastVoteRecord, bubble_ballot, pair::Pair};

use crate::ballot_card::Orientation;

pub enum BarcodeData {
    BubbleBallot(BubbleBallotBarcodeData),
    SummaryBallot(SummaryBallotBarcodeData),
}

pub struct BubbleBallotBarcodeData(pub Pair<BubblePageData>);
pub struct SummaryBallotBarcodeData(pub SummaryPageData);

pub enum BallotPageData {
    Bubble(BubblePageData),
    Summary(SummaryPageData),
}
impl BallotPageData {
    pub fn infer_opposite_page_data(&self) -> Option<Self> {
        match self {
            Self::Bubble(page_data) => {
                Some(BallotPageData::Bubble(page_data.infer_opposite_page_data()))
            }
            Self::Summary(_) => None,
        }
    }
}

pub struct BubblePageData {
    metadata: bubble_ballot::Metadata,
    orientation: Orientation,
}

impl BubblePageData {
    pub const fn new(metadata: bubble_ballot::Metadata, orientation: Orientation) -> Self {
        Self {
            metadata,
            orientation,
        }
    }

    pub fn infer_opposite_page_data(&self) -> Self {
        Self {
            metadata: bubble_ballot::infer_missing_page_metadata(&self.metadata),
            orientation: self.orientation,
        }
    }

    pub fn is_front_page(&self) -> bool {
        self.metadata.page_number.is_front()
    }

    pub fn is_upside_down(&self) -> bool {
        matches!(self.orientation, Orientation::PortraitReversed)
    }

    pub fn rotate180(&mut self) {
        self.orientation = match self.orientation {
            Orientation::Portrait => Orientation::PortraitReversed,
            Orientation::PortraitReversed => Orientation::Portrait,
        };
    }
}

pub struct SummaryPageData {
    cvr: CastVoteRecord,
    orientation: Orientation,
}

impl SummaryPageData {
    pub const fn new(cvr: CastVoteRecord, orientation: Orientation) -> Self {
        Self { cvr, orientation }
    }
}
