use std::fmt::Display;

use serde::{Deserialize, Serialize};

use crate::{
    ballot_card::BallotSide,
    geometry::{SubGridRect, SubGridUnit},
    idtype::idtype,
};

idtype!(ContestId);
idtype!(OptionId);
idtype!(BallotStyleId);
idtype!(PrecinctId);

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
    pub grid_layouts: Vec<GridLayout>,
    pub mark_thresholds: Option<MarkThresholds>,
    pub ballot_layout: BallotLayout,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum MetadataEncoding {
    QrCode,
    TimingMarks,
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
