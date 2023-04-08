use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Election {
    pub title: String,
    pub date: String,
    pub state: String,
    pub county: County,
    pub districts: Vec<District>,
    pub parties: Vec<Party>,
    pub contests: Vec<Contest>,
    pub ballot_styles: Vec<BallotStyle>,
    pub precincts: Vec<Precinct>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ballot_layout: Option<BallotLayout>,
    pub grid_layouts: Vec<GridLayout>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mark_thresholds: Option<MarkThresholds>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct County {
    pub id: CountyId,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct District {
    pub id: DistrictId,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Party {
    pub id: PartyId,
    pub name: String,
    pub full_name: String,
    pub abbrev: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum Contest {
    /// A contest with a single selection.
    #[serde(rename_all = "camelCase", rename = "candidate")]
    Candidate(CandidateContest),

    /// A contest with multiple selections.
    #[serde(rename_all = "camelCase", rename = "yesno")]
    YesNo(YesNoContest),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateContest {
    pub id: ContestId,
    pub district_id: DistrictId,
    pub title: String,
    pub description: String,
    pub candidates: Vec<CandidateContestOption>,
    pub seats: usize,
    pub allow_write_ins: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateContestOption {
    pub id: OptionId,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_write_in: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YesNoContest {
    pub id: ContestId,
    pub title: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GridLayout {
    pub precinct_id: PrecinctId,
    pub ballot_style_id: BallotStyleId,
    pub columns: GridUnit,
    pub rows: GridUnit,
    pub grid_positions: Vec<GridPosition>,
}

/// A position on the ballot grid defined by timing marks and the contest/option
/// for which a mark at this position is a vote for.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum GridPosition {
    /// A pre-defined labeled option on the ballot.
    #[serde(rename_all = "camelCase", rename = "option")]
    Option {
        side: BallotSide,
        column: GridUnit,
        row: GridUnit,
        contest_id: ContestId,
        option_id: OptionId,
    },

    /// A write-in option on the ballot.
    #[serde(rename_all = "camelCase", rename = "write-in")]
    WriteIn {
        side: BallotSide,
        column: GridUnit,
        row: GridUnit,
        contest_id: ContestId,
        write_in_index: u32,
    },
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct GridLocation {
    pub side: BallotSide,
    pub column: GridUnit,
    pub row: GridUnit,
}

impl GridLocation {
    pub const fn new(side: BallotSide, column: GridUnit, row: GridUnit) -> Self {
        Self { side, column, row }
    }
}

/// A value between 0 and 1, inclusive.
///
/// Because this is just a type alias it does not enforce that another type
/// with the same underlying representation is not used.
pub type UnitIntervalValue = f32;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkThresholds {
    pub definite: UnitIntervalValue,
    pub marginal: UnitIntervalValue,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, Hash)]
pub enum BallotSide {
    #[serde(rename = "front")]
    Front,
    #[serde(rename = "back")]
    Back,
}

/// A unit of length in timing mark grid, i.e. 1 `GridUnit` is the logical
/// distance from one timing mark to the next. This does not map directly to
/// pixels.
///
/// Because this is just a type alias it does not enforce that another type
/// with the same underlying representation is not used.
pub type GridUnit = u32;

pub type PrecinctId = String;
pub type BallotStyleId = String;
pub type ContestId = String;
pub type OptionId = String;
pub type DistrictId = String;
pub type CountyId = String;
pub type PartyId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BallotPaperSize {
    #[serde(rename = "letter")]
    Letter,
    #[serde(rename = "legal")]
    Legal,
    #[serde(rename = "custom8.5x17")]
    Custom8Point5X17,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BallotLayout {
    pub paper_size: BallotPaperSize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout_density: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_mark_position: Option<BallotTargetMarkPosition>,
}

/// Specifies where the target mark appears in relation to the option text.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BallotTargetMarkPosition {
    #[serde(rename = "left")]
    Left,
    #[serde(rename = "right")]
    Right,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BallotStyle {
    pub id: BallotStyleId,
    pub precincts: Vec<PrecinctId>,
    pub districts: Vec<DistrictId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub party_id: Option<PartyId>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Precinct {
    pub id: PrecinctId,
    pub name: String,
}
