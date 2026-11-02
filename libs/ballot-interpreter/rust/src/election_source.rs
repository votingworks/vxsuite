use std::collections::HashMap;
use std::fmt::Debug;
use std::io::BufRead;
use std::path::PathBuf;
use std::time::Duration;

use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use types_rs::bubble_ballot::{PARTIAL_BALLOT_HASH_BYTE_LENGTH, PartialBallotHash};
use types_rs::election::{BallotStyleId, Election, GridLayout, SheetPositions};

/// Max wait time if the DB lookup is blocked by a write lock.
const BUSY_TIMEOUT: Duration = Duration::from_secs(1);

const OPEN_FLAGS: OpenFlags =
    OpenFlags::SQLITE_OPEN_READ_ONLY.union(OpenFlags::SQLITE_OPEN_NO_MUTEX);

/// The election and the ballot hash its ballots are encoded with.
#[derive(Debug, Clone)]
pub struct ElectionDefinition {
    pub election: Election,
    pub ballot_hash: PartialBallotHash,
}

/// Where the interpreter reads the election, its ballot hash, and the grid
/// layout for each scannable ballot style.
pub trait ElectionSource: Debug {
    /// Returns the election and its ballot hash.
    ///
    /// # Errors
    ///
    /// Returns an error message if the election cannot be read or parsed.
    fn election_definition(&self) -> Result<ElectionDefinition, String>;

    /// Returns the grid layout for a ballot style, or `None` if there isn't one.
    ///
    /// # Errors
    ///
    /// Returns an error message if the lookup itself fails.
    fn grid_layout(&self, style_id: &BallotStyleId) -> Result<Option<GridLayout>, String>;
}

impl<T: ElectionSource + ?Sized> ElectionSource for &T {
    fn election_definition(&self) -> Result<ElectionDefinition, String> {
        (**self).election_definition()
    }

    fn grid_layout(&self, style_id: &BallotStyleId) -> Result<Option<GridLayout>, String> {
        (**self).grid_layout(style_id)
    }
}

/// Decodes a hex ballot hash and slices it to the partial-hash length,
/// matching the TS `sliceBallotHashForEncoding` convention.
///
/// # Errors
///
/// Returns an error message if the string is not hex or is too short.
pub fn partial_ballot_hash_from_hex(hex: &str) -> Result<PartialBallotHash, String> {
    let bytes = hex::decode(hex).map_err(|err| format!("ballot hash is not valid hex: {err}"))?;
    if bytes.len() < PARTIAL_BALLOT_HASH_BYTE_LENGTH {
        return Err(format!(
            "ballot hash must be at least {} hex characters",
            PARTIAL_BALLOT_HASH_BYTE_LENGTH * 2
        ));
    }
    let mut hash = PartialBallotHash::default();
    let len = hash.len();
    hash.copy_from_slice(&bytes[..len]);
    Ok(hash)
}

/// Reads the election from the election package DB: the `election` row holds
/// the election JSON and ballot hash, and `ballot_positions` holds each
/// scannable ballot style's positions (see `ElectionPackageStore`).
#[derive(Debug, Clone)]
pub struct SqliteElectionSource {
    pub db_path: PathBuf,
}

impl SqliteElectionSource {
    fn connect(&self) -> Result<Connection, String> {
        let conn = Connection::open_with_flags(&self.db_path, OPEN_FLAGS).map_err(|err| {
            format!(
                "connecting to election DB at {path}: {err}",
                path = self.db_path.display()
            )
        })?;
        conn.busy_timeout(BUSY_TIMEOUT)
            .map_err(|err| format!("setting busy timeout: {err}"))?;
        Ok(conn)
    }
}

impl ElectionSource for SqliteElectionSource {
    fn election_definition(&self) -> Result<ElectionDefinition, String> {
        let conn = self.connect()?;
        let (election_data, ballot_hash): (String, String) = conn
            .query_row(
                "select election_data, ballot_hash from election",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|err| format!("querying election: {err}"))?
            .ok_or_else(|| "no election is configured".to_owned())?;

        let election: Election = serde_json::from_str(&election_data)
            .map_err(|err| format!("parsing election: {err}"))?;
        let ballot_hash = partial_ballot_hash_from_hex(&ballot_hash)?;
        Ok(ElectionDefinition {
            election,
            ballot_hash,
        })
    }

    fn grid_layout(&self, style_id: &BallotStyleId) -> Result<Option<GridLayout>, String> {
        let conn = self.connect()?;
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
}

/// An election read from `election.json`, with grid layouts from the ballot
/// positions embedded in it or from a `ballotPositions.jsonl` file.
#[derive(Debug, Clone)]
pub struct InMemoryElectionSource {
    election: Election,
    ballot_hash: PartialBallotHash,
    grid_layouts: HashMap<BallotStyleId, GridLayout>,
}

impl InMemoryElectionSource {
    /// Builds the source from election definition JSON. The ballot hash is
    /// the SHA-256 of the raw bytes, matching the TS `sha256(electionData)`
    /// convention for single-file elections; grid layouts come from each
    /// ballot style's embedded `ballotPositions`.
    ///
    /// # Errors
    ///
    /// Returns an error if the JSON cannot be parsed.
    pub fn from_election_json(bytes: &[u8]) -> serde_json::Result<Self> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct BallotStylePositions {
            id: BallotStyleId,
            ballot_positions: Option<Vec<SheetPositions>>,
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct ElectionPositions {
            ballot_styles: Vec<BallotStylePositions>,
        }

        let election: Election = serde_json::from_slice(bytes)?;
        let positions: ElectionPositions = serde_json::from_slice(bytes)?;
        let digest = Sha256::digest(bytes);
        let mut ballot_hash = PartialBallotHash::default();
        let len = ballot_hash.len();
        ballot_hash.copy_from_slice(&digest[..len]);

        Ok(Self {
            election,
            ballot_hash,
            grid_layouts: positions
                .ballot_styles
                .into_iter()
                .filter_map(|style| {
                    let layout = GridLayout::from_sheet_positions(
                        style.id.clone(),
                        &style.ballot_positions?,
                    );
                    Some((style.id, layout))
                })
                .collect(),
        })
    }

    /// Replaces the grid layouts with those from a `ballotPositions.jsonl`
    /// file, one `{ ballotStyleId, positions }` record per line.
    ///
    /// # Errors
    ///
    /// Returns an error if any line cannot be parsed.
    pub fn with_ballot_positions_jsonl(mut self, bytes: &[u8]) -> serde_json::Result<Self> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct BallotPositions {
            ballot_style_id: BallotStyleId,
            positions: Vec<SheetPositions>,
        }

        self.grid_layouts = bytes
            .lines()
            .map(|line| {
                let line = line.map_err(serde_json::Error::io)?;
                if line.trim().is_empty() {
                    return Ok(None);
                }
                let record: BallotPositions = serde_json::from_str(&line)?;
                let layout = GridLayout::from_sheet_positions(
                    record.ballot_style_id.clone(),
                    &record.positions,
                );
                Ok(Some((record.ballot_style_id, layout)))
            })
            .filter_map(Result::transpose)
            .collect::<serde_json::Result<_>>()?;
        Ok(self)
    }

    /// Overrides the ballot hash, e.g. with the composite hash of a split-file
    /// election package.
    #[must_use]
    pub fn with_ballot_hash(mut self, ballot_hash: PartialBallotHash) -> Self {
        self.ballot_hash = ballot_hash;
        self
    }
}

impl ElectionSource for InMemoryElectionSource {
    fn election_definition(&self) -> Result<ElectionDefinition, String> {
        Ok(ElectionDefinition {
            election: self.election.clone(),
            ballot_hash: self.ballot_hash,
        })
    }

    fn grid_layout(&self, style_id: &BallotStyleId) -> Result<Option<GridLayout>, String> {
        Ok(self.grid_layouts.get(style_id).cloned())
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use types_rs::election::{
        ContestId, ContestOptionPosition, ContestPosition, GridPoint, GridRect, OptionId,
    };

    use super::*;

    fn style_id(id: &str) -> BallotStyleId {
        BallotStyleId::from(id.to_owned())
    }

    fn sheet_positions() -> Vec<SheetPositions> {
        vec![(
            vec![ContestPosition {
                contest_id: ContestId::from("contest-1".to_owned()),
                bounds: GridRect::default(),
                options: vec![ContestOptionPosition::Option {
                    bubble_center: GridPoint {
                        row: 2.0,
                        column: 3.0,
                    },
                    bounds: GridRect::default(),
                    option_id: OptionId::from("option-1".to_owned()),
                }],
            }],
            vec![],
        )]
    }

    fn election_json() -> serde_json::Value {
        serde_json::json!({
            "title": "Test Election",
            "ballotStyles": [
                { "id": "bs-1", "groupId": "g-1", "precincts": ["p-1"], "districts": [], "ballotPositions": sheet_positions() },
                { "id": "bs-2", "groupId": "g-2", "precincts": ["p-1"], "districts": [] },
                { "id": "bs-3", "groupId": "g-3", "precincts": ["p-1"], "districts": [], "ballotPositions": null },
            ],
            "precincts": [{ "id": "p-1", "name": "Precinct 1" }],
            "contests": [],
        })
    }

    const BALLOT_HASH_HEX: &str =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn test_partial_ballot_hash_from_hex() {
        let hash = partial_ballot_hash_from_hex(BALLOT_HASH_HEX).unwrap();
        assert_eq!(hash.len(), PARTIAL_BALLOT_HASH_BYTE_LENGTH);
        assert_eq!(hash[0], 0x01);
        assert!(
            partial_ballot_hash_from_hex("zz")
                .unwrap_err()
                .contains("not valid hex")
        );
        assert!(
            partial_ballot_hash_from_hex("0123")
                .unwrap_err()
                .contains("at least")
        );
    }

    #[test]
    fn test_sqlite_source() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("ballots.db");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(
            "create table election (id integer primary key, election_data text not null, ballot_hash text not null);
             create table ballot_positions (style_id text primary key, positions text not null)",
        )
        .unwrap();
        conn.execute(
            "insert into election (id, election_data, ballot_hash) values (1, ?, ?)",
            [&election_json().to_string(), BALLOT_HASH_HEX],
        )
        .unwrap();
        conn.execute(
            "insert into ballot_positions (style_id, positions) values (?, ?)",
            ["bs-1", &serde_json::to_string(&sheet_positions()).unwrap()],
        )
        .unwrap();
        conn.execute(
            "insert into ballot_positions (style_id, positions) values (?, ?)",
            ["bs-bad", "not json"],
        )
        .unwrap();

        let source = SqliteElectionSource { db_path };
        let definition = source.election_definition().unwrap();
        assert_eq!(definition.election.title, "Test Election");
        assert_eq!(
            definition.ballot_hash,
            partial_ballot_hash_from_hex(BALLOT_HASH_HEX).unwrap()
        );

        let layout = source.grid_layout(&style_id("bs-1")).unwrap().unwrap();
        assert_eq!(layout.ballot_style_id, style_id("bs-1"));
        assert_eq!(layout.grid_positions.len(), 1);

        assert!(source.grid_layout(&style_id("bs-2")).unwrap().is_none());

        let err = source.grid_layout(&style_id("bs-bad")).unwrap_err();
        assert!(
            err.contains("parsing positions for ballot style bs-bad"),
            "{err}"
        );
    }

    #[test]
    fn test_sqlite_source_without_election() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("ballots.db");
        Connection::open(&db_path)
            .unwrap()
            .execute_batch(
                "create table election (id integer primary key, election_data text not null, ballot_hash text not null)",
            )
            .unwrap();
        let source = SqliteElectionSource { db_path };
        let err = source.election_definition().unwrap_err();
        assert!(err.contains("no election is configured"), "{err}");
    }

    #[test]
    fn test_sqlite_source_missing_db() {
        let dir = tempfile::tempdir().unwrap();
        let source = SqliteElectionSource {
            db_path: dir.path().join("missing.db"),
        };
        let err = source.grid_layout(&style_id("bs-1")).unwrap_err();
        assert!(err.contains("connecting to election DB"), "{err}");
        let err = source.election_definition().unwrap_err();
        assert!(err.contains("connecting to election DB"), "{err}");
    }

    #[test]
    fn test_in_memory_source() {
        let bytes = election_json().to_string().into_bytes();
        let source = InMemoryElectionSource::from_election_json(&bytes).unwrap();

        let definition = source.election_definition().unwrap();
        assert_eq!(definition.election.title, "Test Election");
        assert_eq!(
            definition.ballot_hash[..],
            Sha256::digest(&bytes)[..PARTIAL_BALLOT_HASH_BYTE_LENGTH]
        );

        assert_eq!(
            source
                .grid_layout(&style_id("bs-1"))
                .unwrap()
                .unwrap()
                .grid_positions
                .len(),
            1
        );
        assert!(source.grid_layout(&style_id("bs-2")).unwrap().is_none());
        assert!(source.grid_layout(&style_id("bs-3")).unwrap().is_none());
        assert!(source.grid_layout(&style_id("bs-4")).unwrap().is_none());
    }

    #[test]
    fn test_in_memory_source_with_jsonl_and_hash() {
        let bytes = election_json().to_string().into_bytes();
        let jsonl = format!(
            "{}\n\n{}\n",
            serde_json::json!({ "ballotStyleId": "bs-2", "positions": sheet_positions() }),
            serde_json::json!({ "ballotStyleId": "bs-3", "positions": sheet_positions() }),
        );
        let override_hash = partial_ballot_hash_from_hex(BALLOT_HASH_HEX).unwrap();
        let source = InMemoryElectionSource::from_election_json(&bytes)
            .unwrap()
            .with_ballot_positions_jsonl(jsonl.as_bytes())
            .unwrap()
            .with_ballot_hash(override_hash);

        assert_eq!(
            source.election_definition().unwrap().ballot_hash,
            override_hash
        );
        assert!(source.grid_layout(&style_id("bs-1")).unwrap().is_none());
        assert!(source.grid_layout(&style_id("bs-2")).unwrap().is_some());
        assert!(source.grid_layout(&style_id("bs-3")).unwrap().is_some());

        assert!(
            InMemoryElectionSource::from_election_json(&bytes)
                .unwrap()
                .with_ballot_positions_jsonl(b"not json\n")
                .is_err()
        );
    }

    #[test]
    fn test_in_memory_source_with_invalid_utf8_jsonl() {
        let bytes = election_json().to_string().into_bytes();
        let mut jsonl =
            serde_json::json!({ "ballotStyleId": "bs-2", "positions": sheet_positions() })
                .to_string()
                .into_bytes();
        jsonl.extend_from_slice(b"\n\xff\xfe\n");

        assert!(
            InMemoryElectionSource::from_election_json(&bytes)
                .unwrap()
                .with_ballot_positions_jsonl(&jsonl)
                .is_err()
        );
    }
}
