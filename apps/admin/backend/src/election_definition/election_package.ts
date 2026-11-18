import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertDefined, extractErrorMessage } from '@votingworks/basics';
import {
  LocalFileStorageClient,
  renderElectionPackageAndBallots,
} from '@votingworks/election-definition-backend/election-package';
import { createPlaywrightRendererPool } from '@votingworks/hmpb';
import { type BaseLogger, LogEventId, Logger } from '@votingworks/logging';
import { type ElectionId, LATEST_SOFTWARE_VERSION } from '@votingworks/types';
import { configureFromElectionPackageFile } from '../configure_from_election_package.js';
import type { Store } from '../store.js';
import { createEnglishOnlyTranslator } from './english_only_translator.js';
import { getMachineState } from './state.js';

const RENDERER_POOL_SIZE = 4;

/** Where VxAdmin keeps the election definition's built election package. */
export function getElectionPackageFilesPath(store: Store): string {
  return join(store.getElectionPackagesPath(), 'election-definition');
}

/** Deletes the election definition's built election package files. */
export async function clearElectionPackageFiles(store: Store): Promise<void> {
  await rm(getElectionPackageFilesPath(store), {
    recursive: true,
    force: true,
  });
}

/**
 * Renders every ballot of a finalized election definition, builds its
 * election package and configures VxAdmin with it, recording progress and the
 * result in the store.
 */
export async function buildElectionPackage({
  store,
  logger,
  electionId,
}: {
  store: Store;
  logger: BaseLogger;
  electionId: ElectionId;
}): Promise<void> {
  const { stateCode, features } = assertDefined(getMachineState());
  const electionInfo = assertDefined(
    store.electionDefinition.getElectionInfo()
  );
  const { election, candidateOrderings } = assertDefined(
    store.electionDefinition.getElectionWithCandidateOrderings(electionId)
  );
  const scratchPath = await mkdtemp(join(tmpdir(), 'election-package-'));
  try {
    const output = await renderElectionPackageAndBallots(
      {
        translator: createEnglishOnlyTranslator(),
        createRendererPool: () =>
          createPlaywrightRendererPool(RENDERER_POOL_SIZE),
        fileStorageClient: new LocalFileStorageClient(
          getElectionPackageFilesPath(store)
        ),
        outputDirectory: electionId,
        scratchDir: { path: scratchPath },
        emitProgress: (label, progress, total) =>
          store.electionDefinition.updateElectionPackageProgress(electionId, {
            label,
            progress,
            total,
          }),
      },
      {
        election,
        stateCode,
        ballotLanguageConfigs: electionInfo.languageCodes.map(
          (languageCode) => ({ languages: [languageCode] })
        ),
        ballotTemplateId: 'VxDefaultBallot',
        getCandidateOrderings: (ballotStyle) =>
          assertDefined(candidateOrderings.get(ballotStyle.groupId)),
        compact:
          store.electionDefinition.getBallotLayoutSettings(electionId).compact,
        systemSettings: store.electionDefinition.getSystemSettings(electionId),
        registeredVoterCounts:
          store.electionDefinition.getRegisteredVoterCounts(electionId),
        softwareVersion: LATEST_SOFTWARE_VERSION,
        electionSerializationFormat: 'vxf',
        shouldExportSampleBallots: !!features.EXPORT_SAMPLE_BALLOTS,
        shouldExportTestBallots: !!features.EXPORT_TEST_BALLOTS,
      }
    );
    const configureResult = await configureFromElectionPackageFile({
      store,
      logger: Logger.from(logger, () => Promise.resolve('system')),
      packagePath: join(
        getElectionPackageFilesPath(store),
        output.electionPackagePath
      ),
      successMessage: `Configured VxAdmin with the election package built from election definition ${electionId}.`,
    });
    if (configureResult.isErr()) {
      throw new Error(
        `VxAdmin could not be configured with the election package (${configureResult.err().type}).`
      );
    }
    store.electionDefinition.completeElectionPackage(electionId, {
      ballotHash: output.electionDefinition.ballotHash,
      electionPackagePath: output.electionPackagePath,
      officialBallotsPath: output.officialBallotsPath,
      sampleBallotsPath: output.sampleBallotsPath,
      testBallotsPath: output.testBallotsPath,
    });
    logger.log(LogEventId.ElectionDefinitionElectionPackageBuilt, 'system', {
      message: `Built the election package for election definition ${electionId}.`,
      disposition: 'success',
    });
  } catch (error) {
    const message = extractErrorMessage(error);
    store.electionDefinition.failElectionPackage(electionId, message);
    logger.log(LogEventId.ElectionDefinitionElectionPackageBuilt, 'system', {
      message: `Error building the election package for election definition ${electionId}: ${message}`,
      disposition: 'failure',
    });
  } finally {
    await rm(scratchPath, { recursive: true, force: true });
  }
}

/**
 * Fails election package builds a previous VxAdmin process left running,
 * since builds run in-process.
 */
export function failInterruptedElectionPackageBuilds({
  store,
  logger,
}: {
  store: Store;
  logger: BaseLogger;
}): void {
  const error = 'VxAdmin restarted before the election package was built.';
  for (const electionId of store.electionDefinition.failInterruptedElectionPackages(
    error
  )) {
    logger.log(LogEventId.ElectionDefinitionElectionPackageBuilt, 'system', {
      message: `Error building the election package for election definition ${electionId}: ${error}`,
      disposition: 'failure',
    });
  }
}
