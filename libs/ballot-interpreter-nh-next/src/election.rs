use std::fmt::Display;

use serde::{Deserialize, Serialize};

use crate::{ballot_card::BallotSide, types::idtype};

// import idtype macro from types.rs

idtype!(ContestId);
idtype!(OptionId);
idtype!(BallotStyleId);
idtype!(PrecinctId);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Election {
    pub title: String,
    pub grid_layouts: Vec<GridLayout>,
    pub mark_thresholds: Option<MarkThresholds>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GridLayout {
    pub precinct_id: PrecinctId,
    pub ballot_style_id: BallotStyleId,
    pub columns: u32,
    pub rows: u32,
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
        column: u32,
        row: u32,
        contest_id: ContestId,
        option_id: OptionId,
    },

    /// A write-in option on the ballot.
    #[serde(rename_all = "camelCase", rename = "write-in")]
    WriteIn {
        side: BallotSide,
        column: u32,
        row: u32,
        contest_id: ContestId,
        write_in_index: u32,
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

#[derive(Debug, Clone, Copy, Serialize)]
pub struct GridLocation {
    pub side: BallotSide,
    pub column: u32,
    pub row: u32,
}

impl GridLocation {
    pub const fn new(side: BallotSide, column: u32, row: u32) -> Self {
        Self { side, column, row }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkThresholds {
    pub definite: f32,
    pub marginal: f32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_grid_location() {
        let location = GridLocation::new(BallotSide::Front, 1, 2);
        assert_eq!(location.side, BallotSide::Front);
        assert_eq!(location.column, 1);
        assert_eq!(location.row, 2);
    }

    #[test]
    fn test_grid_position() {
        let position = GridPosition::Option {
            side: BallotSide::Front,
            column: 1,
            row: 2,
            contest_id: ContestId::from("contest-1".to_string()),
            option_id: OptionId::from("option-1".to_string()),
        };
        assert_eq!(position.location().side, BallotSide::Front);
        assert_eq!(position.location().column, 1);
        assert_eq!(position.location().row, 2);
    }

    #[test]
    fn test_grid_position_option_serialization() {
        let json = r#"{
            "type": "option",
            "side": "front",
            "column": 1,
            "row": 2,
            "contestId": "contest-1",
            "optionId": "option-1"
        }"#;
        match serde_json::from_str(json).unwrap() {
            GridPosition::Option {
                side,
                column,
                row,
                contest_id,
                option_id,
            } => {
                assert_eq!(side, BallotSide::Front);
                assert_eq!(column, 1);
                assert_eq!(row, 2);
                assert_eq!(contest_id, ContestId::from("contest-1".to_string()));
                assert_eq!(option_id, OptionId::from("option-1".to_string()));
            }
            _ => panic!("expected Option"),
        }
    }

    #[test]
    fn test_grid_position_write_in_serialization() {
        let json = r#"{
            "type": "write-in",
            "side": "front",
            "column": 1,
            "row": 2,
            "contestId": "contest-1",
            "writeInIndex": 3
        }"#;
        match serde_json::from_str(json).unwrap() {
            GridPosition::WriteIn {
                side,
                column,
                row,
                contest_id,
                write_in_index,
            } => {
                assert_eq!(side, BallotSide::Front);
                assert_eq!(column, 1);
                assert_eq!(row, 2);
                assert_eq!(contest_id, ContestId::from("contest-1".to_string()));
                assert_eq!(write_in_index, 3);
            }
            _ => panic!("expected WriteIn"),
        }
    }
}
