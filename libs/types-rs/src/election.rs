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
// mirrored in `bubble-ballot-ts/types.ts` within this package.
//
// IF YOU CHANGE ANYTHING HERE, YOU MUST ALSO CHANGE IT THERE.

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Election {
    pub title: String,
    pub ballot_styles: Vec<BallotStyle>,
    pub precincts: Vec<Precinct>,
    pub mark_thresholds: Option<MarkThresholds>,
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

    /// Builds the flat grid layouts used during interpretation from each ballot
    /// style's hierarchical `ballot_positions`. v4.1+ stores ballot geometry as
    /// `ballotPositions` (sheets -> [front, back] contests -> options) with
    /// per-option bounds; this flattens it into the per-bubble representation
    /// the interpreter scores against.
    #[must_use]
    pub fn grid_layouts(&self) -> Vec<GridLayout> {
        self.ballot_styles
            .iter()
            .filter_map(|ballot_style| {
                let ballot_positions = ballot_style.ballot_positions.as_ref()?;
                let mut grid_positions = Vec::new();
                for (sheet_index, (front, back)) in ballot_positions.iter().enumerate() {
                    let sheet_number = (sheet_index + 1) as u32;
                    for (side, contests) in [(BallotSide::Front, front), (BallotSide::Back, back)] {
                        for contest in contests {
                            for option in &contest.options {
                                grid_positions.push(option.to_grid_position(
                                    sheet_number,
                                    side,
                                    contest.contest_id.clone(),
                                ));
                            }
                        }
                    }
                }
                Some(GridLayout {
                    ballot_style_id: ballot_style.id.clone(),
                    grid_positions,
                })
            })
            .collect()
    }
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
    #[serde(default)]
    pub ballot_positions: Option<Vec<SheetPositions>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Precinct {
    pub id: PrecinctId,
}

/// A point in timing-mark grid coordinates.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GridPoint {
    pub row: SubGridUnit,
    pub column: SubGridUnit,
}

/// A rectangle in timing-mark grid coordinates.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GridRect {
    pub row: SubGridUnit,
    pub column: SubGridUnit,
    pub width: SubGridUnit,
    pub height: SubGridUnit,
}

/// An option's geometry on the ballot grid: the bubble center, the option's
/// bounding box, and the contest/option it represents. Part of the v4.1+
/// `ballotPositions` ballot-style geometry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ContestOptionPosition {
    #[serde(rename_all = "camelCase", rename = "option")]
    Option {
        bubble_center: GridPoint,
        bounds: GridRect,
        option_id: OptionId,
    },

    #[serde(rename_all = "camelCase", rename = "write-in")]
    WriteIn {
        bubble_center: GridPoint,
        bounds: GridRect,
        write_in_index: u32,
        write_in_area: GridRect,
    },
}

impl ContestOptionPosition {
    /// Converts this hierarchical option position into the flat
    /// [`GridPosition`] the interpreter scores against, carrying the stored
    /// per-option bounds.
    fn to_grid_position(
        &self,
        sheet_number: u32,
        side: BallotSide,
        contest_id: ContestId,
    ) -> GridPosition {
        match self {
            Self::Option {
                bubble_center,
                bounds,
                option_id,
            } => GridPosition::Option {
                sheet_number,
                side,
                column: bubble_center.column,
                row: bubble_center.row,
                contest_id,
                option_id: option_id.clone(),
                bounds: *bounds,
            },
            Self::WriteIn {
                bubble_center,
                bounds,
                write_in_index,
                write_in_area,
            } => GridPosition::WriteIn {
                sheet_number,
                side,
                column: bubble_center.column,
                row: bubble_center.row,
                contest_id,
                write_in_index: *write_in_index,
                write_in_area: SubGridRect {
                    x: write_in_area.column,
                    y: write_in_area.row,
                    width: write_in_area.width,
                    height: write_in_area.height,
                },
                bounds: *bounds,
            },
        }
    }
}

/// The geometry of a single contest on the ballot grid. Part of the v4.1+
/// `ballotPositions` ballot-style geometry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContestPosition {
    pub contest_id: ContestId,
    pub bounds: GridRect,
    pub options: Vec<ContestOptionPosition>,
}

/// The contest positions for a single sheet, as a `[front, back]` tuple.
pub type SheetPositions = (Vec<ContestPosition>, Vec<ContestPosition>);

/// The interpreter's flat per-bubble representation, built from a ballot
/// style's [`ballot_positions`](BallotStyle::ballot_positions). Not part of the
/// serialized election definition; only emitted as interpreter output.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GridLayout {
    pub ballot_style_id: BallotStyleId,
    pub grid_positions: Vec<GridPosition>,
}

impl GridLayout {
    pub fn write_in_positions(&self) -> impl Iterator<Item = &GridPosition> {
        self.grid_positions
            .iter()
            .filter(|grid_position| matches!(grid_position, GridPosition::WriteIn { .. }))
    }
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
        /// The option's bounding box (grid coordinates). Used to build the
        /// interpreted layout; not serialized as part of the mark output.
        #[serde(skip)]
        bounds: GridRect,
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
        /// The option's bounding box (grid coordinates). Used to build the
        /// interpreted layout; not serialized as part of the mark output.
        #[serde(skip)]
        bounds: GridRect,
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

    /// The option's bounding box in grid coordinates, used to build the
    /// interpreted option layout.
    #[must_use]
    pub const fn bounds(&self) -> GridRect {
        match self {
            Self::Option { bounds, .. } | Self::WriteIn { bounds, .. } => *bounds,
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
    #[serde(rename = "straight-party")]
    StraightParty(StraightPartyContest),
}

impl Contest {
    pub fn id(&self) -> &ContestId {
        match self {
            Self::Candidate(CandidateContest { id, .. })
            | Self::YesNo(YesNoContest { id, .. })
            | Self::StraightParty(StraightPartyContest { id, .. }) => id,
        }
    }

    pub fn district_id(&self) -> &DistrictId {
        match self {
            Self::Candidate(CandidateContest { district_id, .. })
            | Self::YesNo(YesNoContest { district_id, .. })
            | Self::StraightParty(StraightPartyContest { district_id, .. }) => district_id,
        }
    }

    #[must_use]
    pub fn applies_to_ballot_style(&self, ballot_style: &BallotStyle) -> bool {
        // matches the district
        ballot_style
            .districts
            .iter()
            .any(|district_id| district_id == self.district_id())
            && match (&ballot_style.party_id, self) {
                // Party filtering only applies to candidate contests on a ballot
                // style that has a party of its own, as in a closed primary. A
                // combined ballot primary uses party-less ballot styles that
                // carry every party's contests, so filtering there would drop
                // most of the ballot.
                (Some(style_party), Contest::Candidate(CandidateContest { party_id, .. })) => {
                    party_id.is_none() || party_id.as_ref() == Some(style_party)
                }
                _ => true,
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
    pub options: Vec<YesNoOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
#[must_use]
pub struct YesNoOption {
    pub id: OptionId,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
#[must_use]
pub struct StraightPartyContest {
    pub id: ContestId,
    pub district_id: DistrictId,
    pub title: String,
    pub option_ids: Vec<PartyId>,
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use std::{fs::File, io::BufReader, path::PathBuf};

    use super::*;

    fn read_election(name: &str) -> Election {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../fixtures/data")
            .join(name)
            .join("election.json");
        serde_json::from_reader(BufReader::new(File::open(path).expect("fixture exists")))
            .expect("fixture parses")
    }

    /// A combined ballot primary puts every party's contests on one ballot
    /// style, and that ballot style has no party of its own. Filtering candidate
    /// contests by party there drops most of the ballot, which misaligns the
    /// contest bitmap against what the TypeScript encoder writes.
    #[test]
    fn test_combined_primary_ballot_style_keeps_every_party_contest() {
        let election = read_election("electionCombinedBallotPrimary");
        let ballot_style = election
            .ballot_styles
            .first()
            .expect("election has a ballot style");
        assert!(
            ballot_style.party_id.is_none(),
            "this fixture's ballot styles are party-less; the test is meaningless otherwise"
        );

        let contests = election.contests_in(ballot_style);
        let party_specific = contests
            .iter()
            .filter(|contest| {
                matches!(
                    contest,
                    Contest::Candidate(CandidateContest {
                        party_id: Some(_),
                        ..
                    })
                )
            })
            .count();

        assert!(
            party_specific > 0,
            "party-specific contests must survive on a party-less ballot style"
        );
        assert_eq!(
            contests.len(),
            election
                .contests
                .iter()
                .filter(|c| ballot_style.districts.contains(c.district_id()))
                .count(),
            "a party-less ballot style filters by district only"
        );
    }

    /// A closed primary does filter by party, and contests without a party stay
    /// on every ballot style.
    #[test]
    fn test_closed_primary_ballot_style_filters_by_party() {
        let election = read_election("electionTwoPartyPrimary");
        let ballot_style = election
            .ballot_styles
            .iter()
            .find(|bs| bs.party_id.is_some())
            .expect("fixture has a party-specific ballot style");
        let style_party = ballot_style.party_id.as_ref().expect("checked above");

        for contest in election.contests_in(ballot_style) {
            if let Contest::Candidate(CandidateContest { party_id, .. }) = &contest {
                assert!(
                    party_id.is_none() || party_id.as_ref() == Some(style_party),
                    "contest {} from another party is on this ballot style",
                    contest.id()
                );
            }
        }
    }

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
            bounds: GridRect::default(),
        };
        assert_eq!(position.location().side, BallotSide::Front);
        assert!((position.location().column - 1.0).abs() < f32::EPSILON);
        assert!((position.location().row - 2.0).abs() < f32::EPSILON);
        assert_eq!(position.sheet_number(), 1);
    }

    #[test]
    #[allow(clippy::too_many_lines)]
    fn test_grid_layouts_from_ballot_positions() {
        let option_bounds = GridRect {
            row: 1.5,
            column: 2.0,
            width: 9.0,
            height: 2.0,
        };
        let write_in_bounds = GridRect {
            row: 4.5,
            column: 2.0,
            width: 9.0,
            height: 2.0,
        };
        let write_in_area = GridRect {
            row: 4.0,
            column: 5.0,
            width: 4.0,
            height: 1.0,
        };
        let contest = ContestPosition {
            contest_id: ContestId::from("contest-1".to_string()),
            bounds: GridRect::default(),
            options: vec![
                ContestOptionPosition::Option {
                    bubble_center: GridPoint {
                        row: 2.0,
                        column: 3.0,
                    },
                    bounds: option_bounds,
                    option_id: OptionId::from("option-1".to_string()),
                },
                ContestOptionPosition::WriteIn {
                    bubble_center: GridPoint {
                        row: 5.0,
                        column: 3.0,
                    },
                    bounds: write_in_bounds,
                    write_in_index: 0,
                    write_in_area,
                },
            ],
        };
        let election = Election {
            title: "Test".to_string(),
            ballot_styles: vec![BallotStyle {
                id: BallotStyleId::from("bs-1".to_string()),
                group_id: BallotStyleGroupId::from("bs-1".to_string()),
                precincts: vec![],
                districts: vec![],
                party_id: None,
                languages: vec![],
                ballot_positions: Some(vec![(vec![contest], vec![])]),
            }],
            precincts: vec![],
            mark_thresholds: None,
            contests: vec![],
        };

        let grid_layouts = election.grid_layouts();
        assert_eq!(grid_layouts.len(), 1);
        let grid_layout = &grid_layouts[0];
        assert_eq!(
            grid_layout.ballot_style_id,
            BallotStyleId::from("bs-1".to_string())
        );
        assert_eq!(grid_layout.grid_positions.len(), 2);

        match &grid_layout.grid_positions[0] {
            GridPosition::Option {
                sheet_number,
                side,
                column,
                row,
                contest_id,
                option_id,
                bounds,
            } => {
                assert_eq!(*sheet_number, 1);
                assert_eq!(*side, BallotSide::Front);
                assert!((*column - 3.0).abs() < f32::EPSILON);
                assert!((*row - 2.0).abs() < f32::EPSILON);
                assert_eq!(*contest_id, ContestId::from("contest-1".to_string()));
                assert_eq!(*option_id, OptionId::from("option-1".to_string()));
                assert_eq!(*bounds, option_bounds);
            }
            GridPosition::WriteIn { .. } => panic!("expected Option"),
        }

        match &grid_layout.grid_positions[1] {
            GridPosition::WriteIn {
                sheet_number,
                side,
                column,
                row,
                contest_id,
                write_in_index,
                write_in_area: area,
                bounds,
            } => {
                assert_eq!(*sheet_number, 1);
                assert_eq!(*side, BallotSide::Front);
                assert!((*column - 3.0).abs() < f32::EPSILON);
                assert!((*row - 5.0).abs() < f32::EPSILON);
                assert_eq!(*contest_id, ContestId::from("contest-1".to_string()));
                assert_eq!(*write_in_index, 0);
                assert_eq!(
                    *area,
                    SubGridRect {
                        x: 5.0,
                        y: 4.0,
                        width: 4.0,
                        height: 1.0
                    }
                );
                assert_eq!(*bounds, write_in_bounds);
            }
            GridPosition::Option { .. } => panic!("expected WriteIn"),
        }
    }

    #[test]
    fn test_grid_layouts_without_ballot_positions_is_empty() {
        let election = Election {
            title: "Test".to_string(),
            ballot_styles: vec![BallotStyle {
                id: BallotStyleId::from("bs-1".to_string()),
                group_id: BallotStyleGroupId::from("bs-1".to_string()),
                precincts: vec![],
                districts: vec![],
                party_id: None,
                languages: vec![],
                ballot_positions: None,
            }],
            precincts: vec![],
            mark_thresholds: None,
            contests: vec![],
        };
        assert!(election.grid_layouts().is_empty());
    }

    #[test]
    fn test_ballot_positions_deserialization_is_camel_case() {
        // The TypeScript renderer emits ballotPositions with camelCase fields
        // (bubbleCenter, optionId, writeInIndex, writeInArea). Deserialize a
        // ballot style's positions and confirm grid_layouts() flattens them.
        let json = r#"{
            "id": "bs-1",
            "groupId": "bs-1",
            "precincts": [],
            "districts": [],
            "languages": ["en"],
            "ballotPositions": [
                [
                    [
                        {
                            "contestId": "contest-1",
                            "bounds": { "row": 1, "column": 1, "width": 10, "height": 4 },
                            "options": [
                                {
                                    "type": "option",
                                    "bubbleCenter": { "row": 2, "column": 3 },
                                    "bounds": { "row": 1, "column": 1, "width": 10, "height": 2 },
                                    "optionId": "option-1"
                                },
                                {
                                    "type": "write-in",
                                    "bubbleCenter": { "row": 5, "column": 3 },
                                    "bounds": { "row": 4, "column": 1, "width": 10, "height": 2 },
                                    "writeInIndex": 0,
                                    "writeInArea": { "row": 4, "column": 5, "width": 4, "height": 1 }
                                }
                            ]
                        }
                    ],
                    []
                ]
            ]
        }"#;
        let ballot_style: BallotStyle = serde_json::from_str(json).unwrap();
        let election = Election {
            title: "Test".to_string(),
            ballot_styles: vec![ballot_style],
            precincts: vec![],
            mark_thresholds: None,
            contests: vec![],
        };
        let grid_layouts = election.grid_layouts();
        assert_eq!(grid_layouts.len(), 1);
        assert_eq!(grid_layouts[0].grid_positions.len(), 2);
        match &grid_layouts[0].grid_positions[0] {
            GridPosition::Option {
                option_id, bounds, ..
            } => {
                assert_eq!(*option_id, OptionId::from("option-1".to_string()));
                assert_eq!(
                    *bounds,
                    GridRect {
                        row: 1.0,
                        column: 1.0,
                        width: 10.0,
                        height: 2.0
                    }
                );
            }
            GridPosition::WriteIn { .. } => panic!("expected Option"),
        }
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
                ..
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
                ..
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
