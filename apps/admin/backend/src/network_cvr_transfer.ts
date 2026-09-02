import { Buffer } from 'node:buffer';
import { randomUUID as uuid } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { assert, assertDefined, err, ok, Result } from '@votingworks/basics';
import {
  inMemoryFileSource,
  readCastVoteRecordFromSource,
} from '@votingworks/backend';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import type {
  CvrTransferManifest,
  FinishCvrTransferError,
  StartCvrTransferError,
} from '@votingworks/networking';
import {
  BallotId,
  BallotPageLayout,
  safeParseJson,
  Side,
  Tabulation,
} from '@votingworks/types';
import { z } from 'zod/v4';
import { getEntries, openZip, readEntry } from '@votingworks/utils';
import {
  prepareCastVoteRecord,
  PreparedCastVoteRecord,
  shouldStoreBallotImages,
} from './cast_vote_records.js';
import { getMachineConfig } from './machine_config.js';
import { Store } from './store.js';
import { CastVoteRecordAdjudicationFlags, CvrFileMode } from './types.js';
import { rootDebug } from './util/debug.js';
import { Workspace } from './util/workspace.js';

const debug = rootDebug.extend('network-cvr-transfer');

const TRANSFER_MANIFEST_FILE_NAME = 'manifest.json';

const CvrTransferManifestSchema: z.ZodType<CvrTransferManifest> = z.object({
  machineId: z.string(),
  batchId: z.string(),
  label: z.string(),
  pollingPlaceId: z.string(),
  sheetCount: z.number().int().nonnegative(),
  startedAt: z.string(),
  isTestMode: z.boolean(),
});

/**
 * A validated, ready-to-insert cast vote record as staged in the
 * `cvrs_staging` table (serialized as JSON). Ballot image bytes are
 * staged as files alongside the transfer's manifest; only their metadata is
 * staged here.
 */
interface StagedCvrData {
  cvr: Omit<Tabulation.CastVoteRecord, 'scannerId'>;
  adjudicationFlags: CastVoteRecordAdjudicationFlags;
  writeIns: PreparedCastVoteRecord['writeIns'];
  images?: Array<{ side: Side; pageLayout?: BallotPageLayout }>;
}

/**
 * Path component ids come from other machines, so only accept a conservative
 * character set that can't traverse directories.
 */
const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

function isSafeId(id: string): boolean {
  return SAFE_ID_PATTERN.test(id) && id !== '.' && id !== '..';
}

function getTransferDirectoryPath(
  workspace: Workspace,
  scannerId: string,
  batchId: string
): string {
  return path.join(workspace.path, 'cvr-transfers', scannerId, batchId);
}

function getStagedImagePath(
  transferDirectoryPath: string,
  ballotId: string,
  side: Side
): string {
  return path.join(transferDirectoryPath, 'images', `${ballotId}-${side}.png`);
}

async function readTransferManifest(
  transferDirectoryPath: string
): Promise<CvrTransferManifest | undefined> {
  let contents: string;
  try {
    contents = await fs.readFile(
      path.join(transferDirectoryPath, TRANSFER_MANIFEST_FILE_NAME),
      'utf-8'
    );
  } catch {
    return undefined;
  }
  const parseResult = safeParseJson(contents, CvrTransferManifestSchema);
  // Manifests are only ever written by startCvrTransfer
  assert(parseResult.isOk(), 'invalid CVR transfer manifest');
  return parseResult.ok();
}

/**
 * Serializes network CVR transfer finalizations so that concurrent transfers
 * from multiple scanners cannot interleave their imports.
 */
export class NetworkCvrImportQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

function checkScannerCompatibility(
  store: Store,
  input: { codeVersion: string; ballotHash: string }
): Result<{ electionId: string }, StartCvrTransferError> {
  const machineConfig = getMachineConfig();
  if (input.codeVersion !== machineConfig.codeVersion) {
    return err({ type: 'code-version-mismatch' });
  }
  const electionId = store.getCurrentElectionId();
  if (!electionId) {
    return err({ type: 'host-unconfigured' });
  }
  const { electionDefinition } = assertDefined(store.getElection(electionId));
  if (input.ballotHash !== electionDefinition.ballotHash) {
    return err({ type: 'ballot-hash-mismatch' });
  }
  return ok({ electionId });
}

/**
 * Starts (or resumes) a CVR transfer for one batch. See the contract docs in
 * libs/networking for the transfer protocol.
 */
export async function startCvrTransfer(
  { workspace, logger }: { workspace: Workspace; logger: BaseLogger },
  input: CvrTransferManifest & { codeVersion: string; ballotHash: string }
): Promise<Result<{ alreadyComplete: boolean }, StartCvrTransferError>> {
  const { store } = workspace;

  function reject(
    error: StartCvrTransferError
  ): Result<{ alreadyComplete: boolean }, StartCvrTransferError> {
    logger.log(LogEventId.AdminNetworkStatus, 'system', {
      message: `Rejected CVR transfer of batch ${input.batchId} from scanner ${input.machineId}: ${error.type}.`,
      disposition: 'failure',
      scannerMachineId: input.machineId,
      batchId: input.batchId,
      error: error.type,
    });
    return err(error);
  }

  if (!isSafeId(input.machineId) || !isSafeId(input.batchId)) {
    return reject({ type: 'scanner-unconfigured' });
  }

  const compatibility = checkScannerCompatibility(store, input);
  if (compatibility.isErr()) {
    return reject(compatibility.err());
  }
  const { electionId } = compatibility.ok();

  const transferMode: CvrFileMode = input.isTestMode ? 'test' : 'official';
  const currentMode = store.getCurrentCvrFileModeForElection(electionId);
  if (currentMode !== 'unlocked' && transferMode !== currentMode) {
    return reject({ type: 'invalid-mode', currentMode });
  }

  if (store.getNetworkCvrImportId(electionId, input.machineId, input.batchId)) {
    return ok({ alreadyComplete: true });
  }

  const transferDirectoryPath = getTransferDirectoryPath(
    workspace,
    input.machineId,
    input.batchId
  );
  await fs.mkdir(transferDirectoryPath, { recursive: true });
  const manifest: CvrTransferManifest = {
    machineId: input.machineId,
    batchId: input.batchId,
    label: input.label,
    pollingPlaceId: input.pollingPlaceId,
    sheetCount: input.sheetCount,
    startedAt: input.startedAt,
    isTestMode: input.isTestMode,
  };
  await fs.writeFile(
    path.join(transferDirectoryPath, TRANSFER_MANIFEST_FILE_NAME),
    JSON.stringify(manifest)
  );
  logger.log(LogEventId.AdminNetworkStatus, 'system', {
    message: `Started CVR transfer of batch ${input.batchId} (${input.sheetCount} sheets) from scanner ${input.machineId}.`,
    scannerMachineId: input.machineId,
    batchId: input.batchId,
    sheetCount: input.sheetCount,
  });
  return ok({ alreadyComplete: false });
}

/**
 * Receives one cast vote record's zipped file set, validates it fully (the
 * same parsing, election checks, and image hash verification as a USB
 * import), and stages it — invisible to every other consumer — for the
 * atomic move at finish. Re-sends after an interruption simply replace the
 * staged record.
 *
 * Doing all per-record work here spreads the import cost across the
 * transfer instead of concentrating it in finish, and means a malformed
 * cast vote record is rejected — with a reason — the moment it arrives.
 */
export async function receiveCvrTransferUpload(
  { workspace }: { workspace: Workspace },
  input: {
    scannerId: string;
    batchId: string;
    castVoteRecordId: string;
    zipData: Buffer;
  }
): Promise<Result<void, string>> {
  const { store } = workspace;
  const { scannerId, batchId, castVoteRecordId, zipData } = input;
  if (
    !isSafeId(scannerId) ||
    !isSafeId(batchId) ||
    !isSafeId(castVoteRecordId)
  ) {
    return err('invalid id');
  }
  const transferDirectoryPath = getTransferDirectoryPath(
    workspace,
    scannerId,
    batchId
  );
  if (!(await readTransferManifest(transferDirectoryPath))) {
    return err('transfer not started');
  }
  // A transfer can only have been started while configured
  const electionId = assertDefined(store.getCurrentElectionId());
  const { electionDefinition } = assertDefined(store.getElection(electionId));
  const { adminAdjudicationReasons, markThresholds } =
    store.getSystemSettings(electionId);

  let entries: Awaited<ReturnType<typeof getEntries>>;
  try {
    entries = getEntries(await openZip(zipData)).filter((entry) => !entry.dir);
  } catch {
    return err('invalid zip');
  }
  if (entries.some((entry) => !isSafeId(entry.name))) {
    return err('invalid zip entry name');
  }

  const files: Record<string, Buffer> = {};
  for (const entry of entries) {
    files[entry.name] = await readEntry(entry);
  }

  const readResult = await readCastVoteRecordFromSource(
    inMemoryFileSource(files),
    new Set([batchId])
  );
  if (readResult.isErr()) {
    return err(`invalid cast vote record (${readResult.err().subType})`);
  }
  const prepareResult = prepareCastVoteRecord(
    readResult.ok(),
    electionDefinition,
    { adminAdjudicationReasons, markThresholds }
  );
  if (prepareResult.isErr()) {
    return err(`invalid cast vote record (${prepareResult.err().subType})`);
  }
  const prepared = prepareResult.ok();
  if (prepared.ballotId !== castVoteRecordId) {
    return err('cast vote record id mismatch');
  }

  let images: StagedCvrData['images'];
  if (shouldStoreBallotImages(prepared) && prepared.referencedFiles) {
    images = [];
    const { imageFiles, layoutFiles } = prepared.referencedFiles;
    await fs.mkdir(path.join(transferDirectoryPath, 'images'), {
      recursive: true,
    });
    for (const i of [0, 1] as const) {
      const side = (['front', 'back'] as const)[i];
      // Reading verifies the file against the hash in the report
      const imageReadResult = await imageFiles[i].read();
      if (imageReadResult.isErr()) {
        return err('could not verify a ballot image');
      }
      let pageLayout: BallotPageLayout | undefined;
      if (layoutFiles) {
        const layoutReadResult = await layoutFiles[i].read();
        if (layoutReadResult.isErr()) {
          return err('could not verify a layout file');
        }
        pageLayout = layoutReadResult.ok();
      }
      await fs.writeFile(
        getStagedImagePath(transferDirectoryPath, prepared.ballotId, side),
        imageReadResult.ok()
      );
      images.push({ side, pageLayout });
    }
  }

  const cvrData: StagedCvrData = {
    cvr: prepared.cvr,
    adjudicationFlags: prepared.adjudicationFlags,
    writeIns: prepared.writeIns,
    images,
  };
  store.upsertStagedCvr({
    electionId,
    scannerId,
    batchId,
    ballotId: prepared.ballotId,
    cvrData: JSON.stringify(cvrData),
  });
  return ok();
}

/**
 * Completes a CVR transfer: verifies the staged cast vote records against
 * the manifest's sheet count, then moves them into the real tables in one
 * atomic transaction — the first moment any other consumer can see them.
 * Idempotent — a transfer that already completed returns its count.
 */
export async function finishCvrTransfer(
  {
    workspace,
    logger,
    importQueue,
  }: {
    workspace: Workspace;
    logger: BaseLogger;
    importQueue: NetworkCvrImportQueue;
  },
  input: { machineId: string; batchId: string }
): Promise<Result<{ cvrCount: number }, FinishCvrTransferError>> {
  const { store } = workspace;

  function reject(
    error: FinishCvrTransferError
  ): Result<{ cvrCount: number }, FinishCvrTransferError> {
    logger.log(LogEventId.AdminNetworkStatus, 'system', {
      message: `Could not finish CVR transfer of batch ${input.batchId} from scanner ${input.machineId}: ${error.type}.`,
      disposition: 'failure',
      scannerMachineId: input.machineId,
      batchId: input.batchId,
      error: error.type,
    });
    return err(error);
  }

  if (!isSafeId(input.machineId) || !isSafeId(input.batchId)) {
    return reject({ type: 'transfer-not-found' });
  }
  const electionId = store.getCurrentElectionId();
  if (!electionId) {
    return reject({ type: 'transfer-not-found' });
  }

  const existingImportId = store.getNetworkCvrImportId(
    electionId,
    input.machineId,
    input.batchId
  );
  if (existingImportId) {
    return ok({
      cvrCount: store.getCastVoteRecordCountByFileId(existingImportId),
    });
  }

  const transferDirectoryPath = getTransferDirectoryPath(
    workspace,
    input.machineId,
    input.batchId
  );
  const manifest = await readTransferManifest(transferDirectoryPath);
  if (!manifest) {
    return reject({ type: 'transfer-not-found' });
  }

  const received = store.getStagedCvrCount(
    electionId,
    input.machineId,
    input.batchId
  );
  if (received !== manifest.sheetCount) {
    return reject({
      type: 'sheet-count-mismatch',
      expected: manifest.sheetCount,
      received,
    });
  }

  return await importQueue.run(async () =>
    moveStagedTransfer({
      workspace,
      logger,
      electionId,
      manifest,
      transferDirectoryPath,
    })
  );
}

async function moveStagedTransfer({
  workspace,
  logger,
  electionId,
  manifest,
  transferDirectoryPath,
}: {
  workspace: Workspace;
  logger: BaseLogger;
  electionId: string;
  manifest: CvrTransferManifest;
  transferDirectoryPath: string;
}): Promise<Result<{ cvrCount: number }, FinishCvrTransferError>> {
  const { store } = workspace;
  const { electionDefinition } = assertDefined(store.getElection(electionId));

  const stagedRecords = store
    .getStagedCvrs(electionId, manifest.machineId, manifest.batchId)
    .map((record) => ({
      ballotId: record.ballotId,
      data: JSON.parse(record.cvrData) as StagedCvrData,
    }));

  const importId = uuid();
  const precinctIds = new Set<string>();

  // The move is one synchronous transaction: nothing is visible to any other
  // consumer until it commits, and returning an err rolls the whole move
  // back. All rows are inserted before any image file moves so a rollback
  // can't leave moved images behind.
  const moveResult = store.withTransaction(
    (): Result<void, { subType: string }> => {
      store.addScannerBatch({
        batchId: manifest.batchId,
        electionId,
        label: manifest.label,
        scannerId: manifest.machineId,
        scannerMachineType: 'central',
        pollingPlaceId: manifest.pollingPlaceId,
        startedAt: manifest.startedAt,
      });
      store.addCastVoteRecordFileRecord({
        id: importId,
        electionId,
        exportedTimestamp: new Date().toISOString(),
        filename: manifest.label,
        isTestMode: manifest.isTestMode,
        pollingPlaceIds: new Set([manifest.pollingPlaceId]),
        scannerIds: new Set([manifest.machineId]),
        batchIds: [manifest.batchId],
        source: {
          type: 'network',
          scannerId: manifest.machineId,
          batchId: manifest.batchId,
        },
      });

      // Pass 1: insert every cast vote record; any error rolls back before
      // any image file has moved.
      const inserted: Array<{
        cvrId: string;
        isNew: boolean;
        ballotId: BallotId;
        data: StagedCvrData;
      }> = [];
      for (const { ballotId, data } of stagedRecords) {
        const addResult = store.addCastVoteRecordFileEntry({
          ballotId,
          cvr: data.cvr,
          cvrFileId: importId,
          electionId,
          adjudicationFlags: data.adjudicationFlags,
        });
        if (addResult.isErr()) {
          return err({ subType: addResult.err().type });
        }
        const { cvrId, isNew } = addResult.ok();
        inserted.push({ cvrId, isNew, ballotId, data });
        precinctIds.add(data.cvr.precinctId);
      }

      // Pass 2: write-ins and ballot images (image files move into place
      // by rename, so this is cheap enough to run inside the transaction)
      for (const { cvrId, isNew, ballotId, data } of inserted) {
        if (!isNew) continue;
        if (data.images) {
          for (const image of data.images) {
            store.addBallotImageFromFile({
              cvrId,
              electionDefinitionId: electionDefinition.election.id,
              imageFilePath: getStagedImagePath(
                transferDirectoryPath,
                ballotId,
                image.side
              ),
              pageLayout: image.pageLayout,
              side: image.side,
            });
          }
        }
        for (const writeIn of data.writeIns) {
          store.addWriteIn({
            castVoteRecordId: cvrId,
            contestId: writeIn.contestId,
            electionId,
            optionId: writeIn.optionId,
            isUnmarked: writeIn.isUnmarked,
            isUndetected: false,
            machineMarkedText: writeIn.text,
          });
        }
      }

      store.updateCastVoteRecordFileRecord({ id: importId, precinctIds });
      store.deleteStagedCvrs(electionId, manifest.machineId, manifest.batchId);
      return ok();
    }
  );

  if (moveResult.isErr()) {
    const { subType } = moveResult.err();
    logger.log(LogEventId.ImportCastVoteRecordsComplete, 'system', {
      message: `Failed to import CVR transfer of batch ${manifest.batchId} from scanner ${manifest.machineId}: ${subType}.`,
      disposition: 'failure',
      scannerMachineId: manifest.machineId,
      batchId: manifest.batchId,
      error: subType,
    });
    return err({ type: 'import-failed', subType });
  }

  await fs.rm(transferDirectoryPath, { recursive: true, force: true });
  const cvrCount = stagedRecords.length;
  debug(
    'Imported %d CVRs from scanner %s batch %s',
    cvrCount,
    manifest.machineId,
    manifest.batchId
  );
  logger.log(LogEventId.ImportCastVoteRecordsComplete, 'system', {
    message: `Imported ${cvrCount} cast vote records from scanner ${manifest.machineId}, batch ${manifest.batchId}, over the network.`,
    disposition: 'success',
    scannerMachineId: manifest.machineId,
    batchId: manifest.batchId,
    cvrCount,
  });
  return ok({ cvrCount });
}
