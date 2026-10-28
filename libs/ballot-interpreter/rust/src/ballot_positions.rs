use std::path::Path;
use std::time::Duration;

use rusqlite::{Connection, OpenFlags, OptionalExtension};
use types_rs::election::{BallotStyleId, GridLayout, SheetPositions};

/// Max wait time if the DB lookup is blocked by a write lock on the JS main
/// thread.
const BUSY_TIMEOUT: Duration = Duration::from_secs(1);

const OPEN_FLAGS: OpenFlags =
    OpenFlags::SQLITE_OPEN_READ_ONLY.union(OpenFlags::SQLITE_OPEN_NO_MUTEX);

pub fn get_grid_layout(
    db_path: &Path,
    style_id: &BallotStyleId,
) -> Result<Option<GridLayout>, String> {
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

    return Ok(Some(GridLayout::from_sheet_positions(
        style_id.clone(),
        &positions,
    )));
}
