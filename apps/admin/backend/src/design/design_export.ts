import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudTranslator,
} from '@votingworks/backend';
import { assertDefined, extractErrorMessage } from '@votingworks/basics';
import {
  generateElectionPackageAndBallots,
  GenerateElectionPackageAndBallotsPayloadSchema,
  getStateFeaturesConfig,
  LocalDirectoryFileStorageClient,
} from '@votingworks/design-backend';
import {
  type ElectionId,
  safeParseJson,
  type StateCode,
} from '@votingworks/types';
import type { AdminDesignStores } from './design_db.js';
import { createAdminDesignFeatures } from './design_features.js';
import {
  OFFLINE_TEXT_TO_SPEECH_CLIENT,
  OFFLINE_TRANSLATION_CLIENT,
} from './offline_clients.js';

const RENDERER_POOL_SIZE = 4;

export interface DesignExporter {
  startExport(electionId: ElectionId, stateCode: StateCode): Promise<void>;
  resolveFileUrl(url: string): string;
}

export function createDesignExporter({
  stores,
  filesRoot,
}: {
  stores: AdminDesignStores;
  filesRoot: string;
}): DesignExporter {
  const { elections, tasks } = stores;
  let running = false;

  async function runExport(
    electionId: ElectionId,
    stateCode: StateCode
  ): Promise<void> {
    const task = assertDefined(
      (await tasks.getElectionPackage(electionId)).task
    );
    const scratchPath = await mkdtemp(join(tmpdir(), 'vxadmin-design-'));
    await tasks.startBackgroundTask(task.id);
    try {
      await generateElectionPackageAndBallots(
        {
          elections,
          tasks,
          features: createAdminDesignFeatures(stateCode),
          fileStorageClient: new LocalDirectoryFileStorageClient(filesRoot),
          translator: new GoogleCloudTranslator({
            translationClient: OFFLINE_TRANSLATION_CLIENT,
          }),
          speechSynthesizer: new GoogleCloudSpeechSynthesizer({
            textToSpeechClient: OFFLINE_TEXT_TO_SPEECH_CLIENT,
          }),
          rendererPoolSize: RENDERER_POOL_SIZE,
        },
        safeParseJson(
          task.payload,
          GenerateElectionPackageAndBallotsPayloadSchema
        ).unsafeUnwrap(),
        (label, progress, total) => {
          void tasks.updateBackgroundTaskProgress(task.id, {
            label,
            progress,
            total,
          });
        },
        { path: scratchPath }
      );
      await tasks.completeBackgroundTask(task.id);
    } catch (error) {
      await tasks.completeBackgroundTask(task.id, extractErrorMessage(error));
    } finally {
      await rm(scratchPath, { recursive: true, force: true });
    }
  }

  return {
    async startExport(electionId, stateCode) {
      if (running) {
        throw new Error('An election design export is already running.');
      }
      const features = getStateFeaturesConfig({ stateCode });
      await tasks.createElectionPackageBackgroundTask({
        electionId,
        electionSerializationFormat: 'vxf',
        shouldExportAudio: false,
        shouldExportSampleBallots: !!features.EXPORT_SAMPLE_BALLOTS,
        shouldExportTestBallots: !!features.EXPORT_TEST_BALLOTS,
      });
      running = true;
      void runExport(electionId, stateCode).finally(() => {
        running = false;
      });
    },

    resolveFileUrl: (url) => join(filesRoot, url.replace(/^\/files\//, '')),
  };
}
