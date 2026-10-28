use std::collections::HashMap;
use std::fmt::Debug;
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Deserialize;
use types_rs::election::{BallotStyleId, GridLayout, SheetPositions};

/// Max wait time if the DB lookup is blocked by a write lock on the JS main
/// thread.
const BUSY_TIMEOUT: Duration = Duration::from_secs(1);

const OPEN_FLAGS: OpenFlags =
    OpenFlags::SQLITE_OPEN_READ_ONLY.union(OpenFlags::SQLITE_OPEN_NO_MUTEX);

pub trait GridLayoutSource: Debug {
    /// Returns the grid layout for a ballot style, or `None` if there isn't one.
    ///
    /// # Errors
    ///
    /// Returns an error message if the lookup itself fails.
    fn grid_layout(&self, style_id: &BallotStyleId) -> Result<Option<GridLayout>, String>;
}

impl<T: GridLayoutSource + ?Sized> GridLayoutSource for &T {
    fn grid_layout(&self, style_id: &BallotStyleId) -> Result<Option<GridLayout>, String> {
        (**self).grid_layout(style_id)
    }
}

#[derive(Debug, Clone)]
pub struct SqliteGridLayoutSource {
    pub db_path: PathBuf,
}

impl GridLayoutSource for SqliteGridLayoutSource {
    fn grid_layout(&self, style_id: &BallotStyleId) -> Result<Option<GridLayout>, String> {
        get_grid_layout(&self.db_path, style_id)
    }
}

/// Grid layouts read from the `ballotPositions` of each ballot style in an
/// election definition.
#[derive(Debug, Clone, Default)]
pub struct InMemoryGridLayoutSource(HashMap<BallotStyleId, GridLayout>);

impl InMemoryGridLayoutSource {
    /// Builds grid layouts from election definition JSON.
    ///
    /// # Errors
    ///
    /// Returns an error if the JSON cannot be parsed.
    pub fn from_election_json(bytes: &[u8]) -> serde_json::Result<Self> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct BallotStylePositions {
            id: BallotStyleId,
            #[serde(default)]
            ballot_positions: Vec<SheetPositions>,
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct ElectionPositions {
            ballot_styles: Vec<BallotStylePositions>,
        }

        let election: ElectionPositions = serde_json::from_slice(bytes)?;
        Ok(Self(
            election
                .ballot_styles
                .into_iter()
                .map(|style| {
                    let layout =
                        GridLayout::from_sheet_positions(style.id.clone(), &style.ballot_positions);
                    (style.id, layout)
                })
                .collect(),
        ))
    }
}

impl GridLayoutSource for InMemoryGridLayoutSource {
    fn grid_layout(&self, style_id: &BallotStyleId) -> Result<Option<GridLayout>, String> {
        Ok(self.0.get(style_id).cloned())
    }
}

fn get_grid_layout(db_path: &Path, style_id: &BallotStyleId) -> Result<Option<GridLayout>, String> {
    let conn = Connection::open_with_flags(db_path, OPEN_FLAGS).map_err(|err| {
        format!(
            "connecting to ballot positions DB at {path}: {err}",
            path = db_path.display()
        )
    })?;

    conn.busy_timeout(BUSY_TIMEOUT)
        .map_err(|err| format!("setting busy timeout: {err}"))?;

    let json_str: Option<String> = conn
        .query_row(
            "select positions from ballot_positions where style_id = ?",
            [style_id.to_string()],
            |row| row.get(0),
        )
        .optional()
        .map_err(|err| format!("querying positions for ballot style {style_id}: {err}"))?;

    let Some(json_str) = json_str else {
        return Ok(None);
    };

    let positions: Vec<SheetPositions> = serde_json::from_str(&json_str)
        .map_err(|err| format!("parsing positions for ballot style {style_id}: {err}"))?;

    Ok(Some(GridLayout::from_sheet_positions(
        style_id.clone(),
        &positions,
    )))
}
