import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { readElectionPackageFromFile } from '@votingworks/backend';
import { err, extractErrorMessage, ok, type Result } from '@votingworks/basics';
import {
  type ElectionInfoUpdate,
  prepareElectionForEditing,
  splitCandidateNames,
  type StateCode,
  type StateFeaturesConfig,
  stateDefaultSystemSettings,
} from '@votingworks/election-definition-backend';
import {
  type Election,
  type ElectionId,
  isCombinedBallotPrimary,
  LanguageCode,
  safeParseElectionAnyVersion,
  type SystemSettings,
} from '@votingworks/types';
import type { ElectionDefinitionStore } from './store.js';

/** Why an election file could not be duplicated into a new election definition. */
export interface ElectionImportError {
  type: 'invalid-file' | 'unsupported-election' | 'invalid-election';
  message: string;
}

async function readElectionFile(
  filePath: string,
  stateCode: StateCode
): Promise<
  Result<
    { election: Election; systemSettings: SystemSettings },
    ElectionImportError
  >
> {
  switch (extname(filePath).toLowerCase()) {
    case '.zip': {
      const result = await readElectionPackageFromFile(filePath);
      if (result.isErr()) {
        return err({
          type: 'invalid-file',
          message: `The election package is invalid (${result.err().type}).`,
        });
      }
      const { electionDefinition, systemSettings } =
        result.ok().electionPackage;
      return ok({ election: electionDefinition.election, systemSettings });
    }
    case '.json': {
      const result = safeParseElectionAnyVersion(await readFile(filePath));
      if (result.isErr()) {
        return err({ type: 'invalid-file', message: result.err().message });
      }
      return ok({
        election: result.ok(),
        systemSettings: stateDefaultSystemSettings(stateCode),
      });
    }
    default:
      return err({
        type: 'invalid-file',
        message: 'Choose an election package (.zip) or election (.json) file.',
      });
  }
}

function findUnsupportedContent(election: Election): string | undefined {
  if (election.contests.some((contest) => contest.type === 'straight-party')) {
    return 'Straight party contests are not supported.';
  }
  if (isCombinedBallotPrimary(election)) {
    return 'Combined ballot primaries are not supported.';
  }
  return undefined;
}

function writeImportedElection(
  store: ElectionDefinitionStore,
  election: Election,
  systemSettings: SystemSettings
): Result<void, string> {
  const electionId = election.id;
  const electionInfo: ElectionInfoUpdate = {
    electionId,
    type: election.type,
    date: election.date,
    title: election.title,
    state: election.state,
    jurisdictionName: election.jurisdiction.name,
    seal: election.seal,
    signatureImage: election.signature?.image,
    signatureCaption: election.signature?.caption,
    languageCodes: [LanguageCode.ENGLISH],
  };
  store.createInProgressElection(electionInfo, systemSettings);

  const writes: Array<() => Result<void, unknown>> = [
    () =>
      store.updateDistricts({
        electionId,
        newDistricts: [...election.districts],
      }),
    () =>
      store.updateParties({ electionId, newParties: [...election.parties] }),
    ...election.precincts.map(
      (newPrecinct) => () => store.createPrecinct({ electionId, newPrecinct })
    ),
    ...election.contests.map(
      (newContest) => () => store.createContest({ electionId, newContest })
    ),
    ...election.pollingPlaces.map(
      (place) => () => store.setPollingPlace({ electionId, place })
    ),
  ];
  for (const write of writes) {
    const result = write();
    if (result.isErr()) {
      store.deleteInProgressElection();
      return err(JSON.stringify(result.err()));
    }
  }
  store.updateBallotLayoutSettings({
    electionId,
    paperSize: election.ballotLayout.paperSize,
    compact: false,
  });
  return ok();
}

/**
 * Creates a new election definition from an election package or election
 * file, with new IDs.
 */
export async function createElectionDefinitionFromFile({
  store,
  filePath,
  newId,
  stateCode,
  stateFeatures,
}: {
  store: ElectionDefinitionStore;
  filePath: string;
  newId: ElectionId;
  stateCode: StateCode;
  stateFeatures: StateFeaturesConfig;
}): Promise<Result<ElectionId, ElectionImportError>> {
  const fileResult = await readElectionFile(filePath, stateCode);
  if (fileResult.isErr()) return fileResult;
  const { election: sourceElection, systemSettings } = fileResult.ok();

  const unsupportedContent = findUnsupportedContent(sourceElection);
  if (unsupportedContent) {
    return err({ type: 'unsupported-election', message: unsupportedContent });
  }

  const election = prepareElectionForEditing({
    election: sourceElection,
    newId,
    stateFeatures,
  });
  const writeResult = writeImportedElection(store, election, systemSettings);
  if (writeResult.isErr()) {
    return err({ type: 'invalid-election', message: writeResult.err() });
  }
  return ok(newId);
}

/**
 * Adds the election VxAdmin was configured with to the election definition
 * store, read-only and with its own IDs, so it can be viewed.
 */
export function importConfiguredElection({
  store,
  election,
  systemSettings,
}: {
  store: ElectionDefinitionStore;
  election: Election;
  systemSettings: SystemSettings;
}): Result<void, string> {
  const unsupportedContent = findUnsupportedContent(election);
  if (unsupportedContent) {
    return err(unsupportedContent);
  }
  try {
    const writeResult = writeImportedElection(
      store,
      { ...election, contests: splitCandidateNames(election.contests) },
      systemSettings
    );
    if (writeResult.isErr()) {
      return writeResult;
    }
    store.markElectionLoaded(election.id);
    return ok();
  } catch (error) {
    store.deleteInProgressElection();
    return err(extractErrorMessage(error));
  }
}
