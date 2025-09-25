use std::fmt::Display;

use serde::{Deserialize, Serialize};

use crate::{
    ballot_card::{BallotSide, BallotStyleIndex, PrecinctIndex},
    geometry::{SubGridRect, SubGridUnit},
    idtype::idtype,
};

idtype!(ContestId);
idtype!(OptionId);
idtype!(BallotStyleId);
idtype!(BallotStyleGroupId);
idtype!(PrecinctId);
idtype!(PartyId);
idtype!(DistrictId);

// NOTE: This is a subset of the full election definition. We only need the
// parts that are relevant to interpreting a ballot card. Some of these types
// are defined in the `@votingworks/types` package, some are defined here and
// mirrored in `hmpb-ts/types.ts` within this package.
//
// IF YOU CHANGE ANYTHING HERE, YOU MUST ALSO CHANGE IT THERE.

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Election {
    pub title: String,
    pub ballot_styles: Vec<BallotStyle>,
    pub precincts: Vec<Precinct>,
    pub grid_layouts: Option<Vec<GridLayout>>,
    pub mark_thresholds: Option<MarkThresholds>,
    pub ballot_layout: BallotLayout,
    pub contests: Vec<Contest>,
}

impl Election {
    /// Finds the index of the precinct with the given ID, returning `None` if
    /// no such precinct is found or if the index cannot be represented in the
    /// number of bits allowed for a [`PrecinctIndex`].
    #[must_use]
    pub fn precinct_index(&self, precinct_id: &PrecinctId) -> Option<PrecinctIndex> {
        self.precincts
            .iter()
            .enumerate()
            .find(|(_, precinct)| &precinct.id == precinct_id)
            .and_then(|(index, _)| index.try_into().ok())
            .and_then(PrecinctIndex::new)
    }

    /// Finds the index of the ballot style with the given ID, returning `None`
    /// if no such ballot style is found or if the index cannot be represented
    /// in the number of bits allowed for a [`BallotStyleIndex`].
    #[must_use]
    pub fn ballot_style_index(&self, ballot_style_id: &BallotStyleId) -> Option<BallotStyleIndex> {
        self.ballot_styles
            .iter()
            .enumerate()
            .find(|(_, ballot_style)| &ballot_style.id == ballot_style_id)
            .and_then(|(index, _)| index.try_into().ok())
            .and_then(BallotStyleIndex::new)
    }

    /// Gets contests which belong to a ballot style in an election.
    #[must_use]
    pub fn contests_in(&self, ballot_style: &BallotStyle) -> Vec<Contest> {
        self.contests
            .iter()
            .filter(|contest| contest.applies_to_ballot_style(ballot_style))
            .cloned()
            .collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum MetadataEncoding {
    QrCode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BallotLayout {
    pub metadata_encoding: MetadataEncoding,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BallotStyle {
    pub id: BallotStyleId,
    pub group_id: BallotStyleGroupId,
    pub precincts: Vec<PrecinctId>,
    pub districts: Vec<DistrictId>,
    pub party_id: Option<PartyId>,
    #[serde(default)]
    pub languages: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Precinct {
    pub id: PrecinctId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GridLayout {
    pub ballot_style_id: BallotStyleId,
    pub option_bounds_from_target_mark: Outset<SubGridUnit>,
    pub grid_positions: Vec<GridPosition>,
}

impl GridLayout {
    pub fn write_in_positions(&self) -> impl Iterator<Item = &GridPosition> {
        self.grid_positions
            .iter()
            .filter(|grid_position| matches!(grid_position, GridPosition::WriteIn { .. }))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Outset<T> {
    pub top: T,
    pub right: T,
    pub bottom: T,
    pub left: T,
}

/// A position on the ballot grid defined by timing marks and the contest/option
/// for which a mark at this position is a vote for.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum GridPosition {
    /// A pre-defined labeled option on the ballot.
    #[serde(rename_all = "camelCase", rename = "option")]
    Option {
        sheet_number: u32,
        side: BallotSide,
        column: SubGridUnit,
        row: SubGridUnit,
        contest_id: ContestId,
        option_id: OptionId,
    },

    /// A write-in option on the ballot.
    #[serde(rename_all = "camelCase", rename = "write-in")]
    WriteIn {
        sheet_number: u32,
        side: BallotSide,
        column: SubGridUnit,
        row: SubGridUnit,
        contest_id: ContestId,
        write_in_index: u32,
        write_in_area: SubGridRect,
    },
}

impl Display for GridPosition {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Option { option_id, .. } => write!(f, "{option_id}"),

            Self::WriteIn { write_in_index, .. } => {
                write!(f, "Write-In {write_in_index}")
            }
        }
    }
}

impl GridPosition {
    pub fn contest_id(&self) -> ContestId {
        match self {
            Self::Option { contest_id, .. } | Self::WriteIn { contest_id, .. } => {
                contest_id.clone()
            }
        }
    }

    pub fn option_id(&self) -> OptionId {
        match self {
            Self::Option { option_id, .. } => option_id.clone(),
            Self::WriteIn { write_in_index, .. } => {
                OptionId::from(format!("write-in-{write_in_index}"))
            }
        }
    }

    #[must_use]
    pub const fn sheet_number(&self) -> u32 {
        match self {
            Self::Option { sheet_number, .. } | Self::WriteIn { sheet_number, .. } => *sheet_number,
        }
    }

    pub const fn location(&self) -> GridLocation {
        match self {
            Self::Option {
                side, column, row, ..
            }
            | Self::WriteIn {
                side, column, row, ..
            } => GridLocation::new(*side, *column, *row),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[must_use]
pub struct GridLocation {
    pub side: BallotSide,
    pub column: SubGridUnit,
    pub row: SubGridUnit,
}

impl GridLocation {
    pub const fn new(side: BallotSide, column: SubGridUnit, row: SubGridUnit) -> Self {
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
#[must_use]
pub struct MarkThresholds {
    pub definite: UnitIntervalValue,
    pub marginal: UnitIntervalValue,
    pub write_in_text_area: Option<UnitIntervalValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
#[must_use]
pub enum Contest {
    #[serde(rename = "candidate")]
    Candidate(CandidateContest),
    #[serde(rename = "yesno")]
    YesNo(YesNoContest),
}

impl Contest {
    pub fn id(&self) -> &ContestId {
        match self {
            Self::Candidate(CandidateContest { id, .. }) | Self::YesNo(YesNoContest { id, .. }) => {
                id
            }
        }
    }

    pub fn district_id(&self) -> &DistrictId {
        match self {
            Self::Candidate(CandidateContest { district_id, .. })
            | Self::YesNo(YesNoContest { district_id, .. }) => district_id,
        }
    }

    #[must_use]
    pub fn applies_to_ballot_style(&self, ballot_style: &BallotStyle) -> bool {
        // matches the district
        ballot_style
            .districts
            .iter()
            .any(|district_id| district_id == self.district_id())
            // and has matching party or no party
            && match self {
                Contest::YesNo(_)
                | Contest::Candidate(CandidateContest { party_id: None, .. }) => true,
                Contest::Candidate(CandidateContest { party_id, .. }) => {
                    party_id == &ballot_style.party_id
                }
            }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
#[must_use]
pub struct CandidateContest {
    /// The unique ID of this contest.
    pub id: ContestId,

    /// The district this contest appears in.
    pub district_id: DistrictId,

    /// The title of the contest to show to voters.
    pub title: String,

    /// How many people will be elected for this office?
    pub seats: u32,

    /// The list of candidates, named or write-in, voters may choose from.
    pub candidates: Vec<Candidate>,

    /// Determines whether write-ins are allowed in this contest.
    pub allow_write_ins: bool,

    /// If this is a primary contest, the party of the candidates.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub party_id: Option<PartyId>,

    /// A description to show to the voter of the term/duration of the office.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub term_description: Option<String>,
}

#[derive(Debug, Clone)]
#[must_use]
pub enum Candidate {
    Named(NamedCandidate),
    WriteIn(WriteInCandidate),
}

impl Candidate {
    pub fn id(&self) -> &OptionId {
        match self {
            Self::Named(NamedCandidate { id, .. }) | Self::WriteIn(WriteInCandidate { id, .. }) => {
                id
            }
        }
    }
}

/// Provides an intermediate representation closer to the JSON serialization
/// of `Candidate` in TypeScript, where it is not represented as tagged union.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsonCandidate {
    id: OptionId,
    name: String,
    party_ids: Option<Vec<PartyId>>,
    is_write_in: Option<bool>,
    write_in_index: Option<u32>,
    // Structured name properties are supported only in VxDesign.
    first_name: Option<String>,
    middle_name: Option<String>,
    last_name: Option<String>,
}

impl Serialize for Candidate {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let json_candidate = match self {
            Self::Named(candidate) => JsonCandidate {
                id: candidate.id.clone(),
                name: candidate.name.clone(),
                party_ids: candidate.party_ids.clone(),
                is_write_in: None,
                write_in_index: None,
                first_name: None,
                middle_name: None,
                last_name: None,
            },
            Self::WriteIn(candidate) => JsonCandidate {
                id: candidate.id.clone(),
                name: format!("Write-In #{}", candidate.write_in_index + 1),
                party_ids: None,
                is_write_in: Some(true),
                write_in_index: Some(candidate.write_in_index),
                first_name: None,
                middle_name: None,
                last_name: None,
            },
        };

        json_candidate.serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for Candidate {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let json_candidate = JsonCandidate::deserialize(deserializer)?;

        match json_candidate {
            JsonCandidate {
                id,
                name,
                party_ids,
                is_write_in: None | Some(false),
                write_in_index: None,
                ..
            } => Ok(Self::Named(NamedCandidate {
                id,
                name,
                party_ids,
            })),
            JsonCandidate {
                id,
                party_ids: None,
                is_write_in: Some(true),
                write_in_index: Some(write_in_index),
                ..
            } => Ok(Self::WriteIn(WriteInCandidate { id, write_in_index })),
            _ => Err(serde::de::Error::custom(
                "Candidate must have both or neither of `isWriteIn` and `writeInIndex`",
            )),
        }
    }
}

#[derive(Debug, Clone)]
#[must_use]
pub struct NamedCandidate {
    /// The unique ID for the candidate.
    pub id: OptionId,

    /// The name of the candidate to display to voters.
    pub name: String,

    /// The list of party endorsements for this candidate.
    pub party_ids: Option<Vec<PartyId>>,
}

#[derive(Debug, Clone)]
#[must_use]
pub struct WriteInCandidate {
    /// The unique ID for the candidate.
    pub id: OptionId,

    /// The index of this write-in candidate in the list, up to
    /// [`Contest::seats`] minus one.
    pub write_in_index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
#[must_use]
pub struct YesNoContest {
    pub id: ContestId,
    pub district_id: DistrictId,
    pub title: String,
    pub description: String,
    pub yes_option: YesNoOption,
    pub no_option: YesNoOption,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
#[must_use]
pub struct YesNoOption {
    pub id: OptionId,
    pub label: String,
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn test_grid_location() {
        let location = GridLocation::new(BallotSide::Front, 1.0, 2.0);
        assert_eq!(location.side, BallotSide::Front);
        assert!((location.column - 1.0).abs() < f32::EPSILON);
        assert!((location.row - 2.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_grid_position() {
        let position = GridPosition::Option {
            sheet_number: 1,
            side: BallotSide::Front,
            column: 1.0,
            row: 2.0,
            contest_id: ContestId::from("contest-1".to_string()),
            option_id: OptionId::from("option-1".to_string()),
        };
        assert_eq!(position.location().side, BallotSide::Front);
        assert!((position.location().column - 1.0).abs() < f32::EPSILON);
        assert!((position.location().row - 2.0).abs() < f32::EPSILON);
        assert_eq!(position.sheet_number(), 1);
    }

    #[test]
    fn test_grid_position_option_serialization() {
        let json = r#"{
            "type": "option",
            "sheetNumber": 1,
            "side": "front",
            "column": 1,
            "row": 2,
            "contestId": "contest-1",
            "optionId": "option-1"
        }"#;
        match serde_json::from_str(json).unwrap() {
            GridPosition::Option {
                sheet_number,
                side,
                column,
                row,
                contest_id,
                option_id,
            } => {
                assert_eq!(sheet_number, 1);
                assert_eq!(side, BallotSide::Front);
                assert!((column - 1.0).abs() < f32::EPSILON);
                assert!((row - 2.0).abs() < f32::EPSILON);
                assert_eq!(contest_id, ContestId::from("contest-1".to_string()));
                assert_eq!(option_id, OptionId::from("option-1".to_string()));
            }
            GridPosition::WriteIn { .. } => panic!("expected Option"),
        }
    }

    #[test]
    fn test_grid_position_write_in_serialization() {
        let json = r#"{
            "type": "write-in",
            "sheetNumber": 1,
            "side": "front",
            "column": 1,
            "row": 2,
            "contestId": "contest-1",
            "writeInIndex": 3,
            "writeInArea": {
                "x": 1,
                "y": 1.5,
                "width": 2,
                "height": 1
            }
        }"#;
        match serde_json::from_str(json).unwrap() {
            GridPosition::WriteIn {
                sheet_number,
                side,
                column,
                row,
                contest_id,
                write_in_index,
                write_in_area,
            } => {
                assert_eq!(sheet_number, 1);
                assert_eq!(side, BallotSide::Front);
                assert!((column - 1.0).abs() < f32::EPSILON);
                assert!((row - 2.0).abs() < f32::EPSILON);
                assert_eq!(contest_id, ContestId::from("contest-1".to_string()));
                assert_eq!(write_in_index, 3);
                assert_eq!(
                    write_in_area,
                    SubGridRect {
                        x: 1.0,
                        y: 1.5,
                        width: 2.0,
                        height: 1.0
                    }
                );
            }
            GridPosition::Option { .. } => panic!("expected WriteIn"),
        }
    }
}
