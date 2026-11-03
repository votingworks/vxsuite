import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudTranslator,
} from '@votingworks/backend';
import { extractErrorMessage } from '@votingworks/basics';
import {
  getStateFeaturesConfig,
  LocalDirectoryFileStorageClient,
  renderElectionPackageAndBallots,
} from '@votingworks/design-backend';
import type { ElectionId, StateCode } from '@votingworks/types';
import type { DesignStore } from './design_store.js';
import { localJurisdiction } from './design_features.js';
import {
  OFFLINE_TEXT_TO_SPEECH_CLIENT,
  OFFLINE_TRANSLATION_CLIENT,
} from './offline_clients.js';

const RENDERER_POOL_SIZE = 4;

export interface DesignExporter {
  startExport(electionId: ElectionId, stateCode: StateCode): void;
  isRunning(): boolean;
  resolveFileUrl(url: string): string;
  clearFiles(): Promise<void>;
}

export function createDesignExporter({
  store,
  filesRoot,
}: {
  store: DesignStore;
  filesRoot: string;
}): DesignExporter {
  let running = false;

  async function runExport(
    electionId: ElectionId,
    stateCode: StateCode
  ): Promise<void> {
    const scratchPath = await mkdtemp(join(tmpdir(), 'vxadmin-design-'));
    const features = getStateFeaturesConfig({ stateCode });
    try {
      const result = await renderElectionPackageAndBallots(
        {
          fileStorageClient: new LocalDirectoryFileStorageClient(filesRoot),
          translator: new GoogleCloudTranslator({
            translationClient: OFFLINE_TRANSLATION_CLIENT,
          }),
          speechSynthesizer: new GoogleCloudSpeechSynthesizer({
            textToSpeechClient: OFFLINE_TEXT_TO_SPEECH_CLIENT,
          }),
          rendererPoolSize: RENDERER_POOL_SIZE,
        },
        {
          electionRecord: store.getElection(electionId),
          compact: store.getBallotLayoutSettings(electionId).compact,
          registeredVoterCounts: store.getRegisteredVoterCounts(electionId),
          jurisdiction: localJurisdiction(stateCode),
        },
        {
          electionId,
          electionSerializationFormat: 'vxf',
          shouldExportAudio: false,
          shouldExportSampleBallots: !!features.EXPORT_SAMPLE_BALLOTS,
          shouldExportTestBallots: !!features.EXPORT_TEST_BALLOTS,
        },
        (label, progress, total) => {
          store.updateExportProgress(electionId, { label, progress, total });
        },
        { path: scratchPath }
      );
      store.completeExport(electionId, {
        ballotHash: result.ballotHash,
        electionPackagePath: result.electionPackageUrl,
        officialBallotsPath: result.officialBallotsUrl,
        testBallotsPath: result.testBallotsUrl,
        sampleBallotsPath: result.sampleBallotsUrl,
      });
    } catch (error) {
      store.failExport(electionId, extractErrorMessage(error));
    } finally {
      await rm(scratchPath, { recursive: true, force: true });
    }
  }

  return {
    startExport(electionId, stateCode) {
      if (running) {
        throw new Error('An election design export is already running.');
      }
      store.startExport(electionId);
      running = true;
      void runExport(electionId, stateCode).finally(() => {
        running = false;
      });
    },

    isRunning: () => running,

    resolveFileUrl: (url) => join(filesRoot, url.replace(/^\/files\//, '')),

    async clearFiles() {
      await rm(filesRoot, { recursive: true, force: true });
    },
  };
}
