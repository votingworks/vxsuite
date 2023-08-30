import { Buffer } from 'buffer';
import fs from 'fs/promises';
import { sha256 } from 'js-sha256';
import path from 'path';
import { groupBy } from '@votingworks/basics';
import { Client } from '@votingworks/db';

/**
 * A representation of a file
 */
export interface File {
  fileName: string;
  fileContents: string | Buffer;
}

/**
 * Computes a hash for a single cast vote record, incorporating the cast vote record's directory
 * name, file names, and file contents. The directory summary that we hash specifically mirrors the
 * output of:
 *
 * find <directoryName> -type f | sort | xargs sha256sum
 */
export function computeSingleCastVoteRecordHash({
  directoryName,
  files,
}: {
  directoryName: string;
  files: File[];
}): string {
  const filesSorted = [...files].sort((file1, file2) =>
    file1.fileName.localeCompare(file2.fileName)
  );
  const fileHashes: string[] = [];
  for (const { fileName, fileContents } of filesSorted) {
    fileHashes.push(
      `${sha256(fileContents)}  ${path.join(directoryName, fileName)}\n`
    );
  }
  const directorySummary = fileHashes.join('');
  return sha256(directorySummary);
}

/**
 * The input to {@link computeCombinedHash}
 */
export type HashesToCombine = Array<{ hash: string; sortKey: string }>;

/**
 * Sorts the provided hashes using the specified sort key, concatenates the hashes, and hashes the
 * result, yielding a combined hash
 */
export function computeCombinedHash(hashesToCombine: HashesToCombine): string {
  return sha256(
    [...hashesToCombine]
      .sort((entry1, entry2) => entry1.sortKey.localeCompare(entry2.sortKey))
      .map((entry) => entry.hash)
      .join('')
  );
}

//
// Functions for managing cast vote record hashes in a SQLite DB table. This code is relevant for
// export-time hash computation.
//

/**
 * A schema for a Merkle tree (https://en.wikipedia.org/wiki/Merkle_tree) that allows for efficient
 * hashing of continuously exported cast vote records
 */
export const CAST_VOTE_RECORD_HASHES_TABLE_SCHEMA = `
create table cvr_hashes (
  cvr_id_level_1_prefix text not null,
  cvr_id_level_2_prefix text not null,
  cvr_id text not null,
  cvr_hash text not null
);

create unique index idx_cvr_hashes ON cvr_hashes (
  cvr_id_level_1_prefix,
  cvr_id_level_2_prefix,
  cvr_id
);
`;

/**
 * Using true SQLite NULL values interferes with uniqueness constraints since SQLite treats all
 * NULL values as different, so we use a special value instead.
 */
const NULL_VALUE = '-';

interface Constraint {
  type: '=' | '!=';
  value: string;
}

function selectCastVoteRecordHashes(
  client: Client,
  {
    cvrIdLevel1PrefixConstraint,
    cvrIdLevel2PrefixConstraint,
    cvrIdConstraint,
    orderBy,
  }: {
    cvrIdLevel1PrefixConstraint: Constraint;
    cvrIdLevel2PrefixConstraint: Constraint;
    cvrIdConstraint: Constraint;
    orderBy: 'cvr_id_level_1_prefix' | 'cvr_id_level_2_prefix' | 'cvr_id';
  }
): string[] {
  const rows = client.all(
    `
    select cvr_hash as cvrHash
    from cvr_hashes
    where
      cvr_id_level_1_prefix ${cvrIdLevel1PrefixConstraint.type} ? and
      cvr_id_level_2_prefix ${cvrIdLevel2PrefixConstraint.type} ? and
      cvr_id ${cvrIdConstraint.type} ?
    order by ${orderBy} asc
    `,
    cvrIdLevel1PrefixConstraint.value,
    cvrIdLevel2PrefixConstraint.value,
    cvrIdConstraint.value
  ) as Array<{ cvrHash: string }>;
  return rows.map((row) => row.cvrHash);
}

function insertCastVoteRecordHash(
  client: Client,
  {
    cvrIdLevel1Prefix,
    cvrIdLevel2Prefix,
    cvrId,
    cvrHash,
  }: {
    cvrIdLevel1Prefix: string;
    cvrIdLevel2Prefix: string;
    cvrId: string;
    cvrHash: string;
  }
): void {
  client.run(
    `
    insert or replace into cvr_hashes (
      cvr_id_level_1_prefix,
      cvr_id_level_2_prefix,
      cvr_id,
      cvr_hash
    ) values (?, ?, ?, ?)
    `,
    cvrIdLevel1Prefix,
    cvrIdLevel2Prefix,
    cvrId,
    cvrHash
  );
}

/**
 * Gets the cast vote record root hash.
 *
 * See {@link CAST_VOTE_RECORD_HASHES_TABLE_SCHEMA} for more context.
 */
export function getCastVoteRecordRootHash(client: Client): string {
  const row = client.one(
    `
    select cvr_hash as cvrHash
    from cvr_hashes
    where
      cvr_id_level_1_prefix = '${NULL_VALUE}' and
      cvr_id_level_2_prefix = '${NULL_VALUE}' and
      cvr_id = '${NULL_VALUE}'
    `
  ) as { cvrHash: string } | undefined;
  return row?.cvrHash ?? '';
}

/**
 * Inserts a cast vote record hash (a leaf node in the Merkle tree) and updates the cast vote
 * record root hash (the root node in the Merkle tree), updating relevant intermediate hashes along
 * the way (intermediate nodes in the Merkle tree).
 *
 * See {@link CAST_VOTE_RECORD_HASHES_TABLE_SCHEMA} for more context.
 */
export function updateCastVoteRecordHashes(
  client: Client,
  cvrId: string,
  cvrHash: string
): void {
  const cvrIdLevel1Prefix = cvrId.slice(0, 1);
  const cvrIdLevel2Prefix = cvrId.slice(0, 2);

  client.transaction(() => {
    insertCastVoteRecordHash(client, {
      cvrIdLevel1Prefix,
      cvrIdLevel2Prefix,
      cvrId,
      cvrHash,
    });

    const cvrHashesForLevel2Prefix = selectCastVoteRecordHashes(client, {
      cvrIdLevel1PrefixConstraint: { type: '=', value: cvrIdLevel1Prefix },
      cvrIdLevel2PrefixConstraint: { type: '=', value: cvrIdLevel2Prefix },
      cvrIdConstraint: { type: '!=', value: NULL_VALUE },
      orderBy: 'cvr_id',
    });
    const level2Hash = sha256(cvrHashesForLevel2Prefix.join(''));
    insertCastVoteRecordHash(client, {
      cvrIdLevel1Prefix,
      cvrIdLevel2Prefix,
      cvrId: NULL_VALUE,
      cvrHash: level2Hash,
    });

    const level2HashesForLevel1Prefix = selectCastVoteRecordHashes(client, {
      cvrIdLevel1PrefixConstraint: { type: '=', value: cvrIdLevel1Prefix },
      cvrIdLevel2PrefixConstraint: { type: '!=', value: NULL_VALUE },
      cvrIdConstraint: { type: '=', value: NULL_VALUE },
      orderBy: 'cvr_id_level_2_prefix',
    });
    const level1Hash = sha256(level2HashesForLevel1Prefix.join(''));
    insertCastVoteRecordHash(client, {
      cvrIdLevel1Prefix,
      cvrIdLevel2Prefix: NULL_VALUE,
      cvrId: NULL_VALUE,
      cvrHash: level1Hash,
    });

    const level1Hashes = selectCastVoteRecordHashes(client, {
      cvrIdLevel1PrefixConstraint: { type: '!=', value: NULL_VALUE },
      cvrIdLevel2PrefixConstraint: { type: '=', value: NULL_VALUE },
      cvrIdConstraint: { type: '=', value: NULL_VALUE },
      orderBy: 'cvr_id_level_1_prefix',
    });
    const rootHash = sha256(level1Hashes.join(''));
    insertCastVoteRecordHash(client, {
      cvrId: NULL_VALUE,
      cvrIdLevel1Prefix: NULL_VALUE,
      cvrIdLevel2Prefix: NULL_VALUE,
      cvrHash: rootHash,
    });
  });
}

/**
 * Clears all cast vote record hashes
 */
export function clearCastVoteRecordHashes(client: Client): void {
  client.run('delete from cvr_hashes');
}

//
// Functions for computing cast vote record hashes from scratch. This code is relevant for
// import-time hash computation.
//

/**
 * Computes the cast vote record root hash from scratch given the export directory path, reading in
 * all files and computing hashes in memory without the aid of a SQLite DB
 */
export async function computeCastVoteRecordRootHashFromScratch(
  exportDirectoryPath: string
): Promise<string> {
  const cvrIds = (
    await fs.readdir(exportDirectoryPath, { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((directory) => directory.name);

  const cvrHashes: HashesToCombine = [];
  for (const cvrId of cvrIds) {
    const cvrDirectoryPath = path.join(exportDirectoryPath, cvrId);
    const cvrFileNames = (
      await fs.readdir(cvrDirectoryPath, { withFileTypes: true })
    )
      .filter((entry) => entry.isFile())
      .map((file) => file.name);
    const cvrFiles: File[] = [];
    for (const fileName of cvrFileNames) {
      const fileContents = await fs.readFile(
        path.join(cvrDirectoryPath, fileName)
      );
      cvrFiles.push({ fileName, fileContents });
    }
    const cvrHash = computeSingleCastVoteRecordHash({
      directoryName: cvrId,
      files: cvrFiles,
    });
    cvrHashes.push({ hash: cvrHash, sortKey: cvrId });
  }

  const level2Hashes: HashesToCombine = groupBy(
    cvrHashes,
    ({ sortKey: cvrId }) => cvrId.slice(0, 2)
  ).map(([cvrIdLevel2Prefix, cvrHashesForLevel2Prefix]) => ({
    hash: computeCombinedHash(cvrHashesForLevel2Prefix),
    sortKey: cvrIdLevel2Prefix,
  }));

  const level1Hashes: HashesToCombine = groupBy(
    level2Hashes,
    ({ sortKey: cvrIdLevel2Prefix }) => cvrIdLevel2Prefix.slice(0, 1)
  ).map(([cvrIdLevel1Prefix, level2HashesForLevel1Prefix]) => ({
    hash: computeCombinedHash(level2HashesForLevel1Prefix),
    sortKey: cvrIdLevel1Prefix,
  }));

  const rootHash = computeCombinedHash(level1Hashes);
  return rootHash;
}
