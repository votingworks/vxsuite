import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudTranslator,
} from '@votingworks/backend';
import { assertDefined, extractErrorMessage } from '@votingworks/basics';
import {
  type ElectionPackageExportContext,
  generateElectionPackageAndBallots,
  GenerateElectionPackageAndBallotsPayloadSchema,
  getStateFeaturesConfig,
  LocalDirectoryFileStorageClient,
  type Store as DesignStore,
} from '@votingworks/design-backend';
import { type ElectionId, safeParseJson } from '@votingworks/types';
import {
  OFFLINE_TEXT_TO_SPEECH_CLIENT,
  OFFLINE_TRANSLATION_CLIENT,
} from './offline_clients.js';

const RENDER_POOL_SIZE = 4;

export interface DesignExporter {
  readonly fileStorageClient: LocalDirectoryFileStorageClient;
  readonly translator: GoogleCloudTranslator;
  readonly speechSynthesizer: GoogleCloudSpeechSynthesizer;
  startExport(electionId: ElectionId): Promise<void>;
  resolveFileUrl(url: string): string;
}

export function createDesignExporter({
  designStore,
  filesRoot,
}: {
  designStore: DesignStore;
  filesRoot: string;
}): DesignExporter {
  const fileStorageClient = new LocalDirectoryFileStorageClient(filesRoot);
  const context: ElectionPackageExportContext = {
    fileStorageClient,
    translator: new GoogleCloudTranslator({
      translationClient: OFFLINE_TRANSLATION_CLIENT,
    }),
    speechSynthesizer: new GoogleCloudSpeechSynthesizer({
      textToSpeechClient: OFFLINE_TEXT_TO_SPEECH_CLIENT,
    }),
    workspace: { store: designStore },
    rendererPoolSize: RENDER_POOL_SIZE,
  };

  async function runExportTask(electionId: ElectionId): Promise<void> {
    const { task } = await designStore.getElectionPackage(electionId);
    const taskId = assertDefined(task).id;
    const payload = safeParseJson(
      assertDefined(task).payload,
      GenerateElectionPackageAndBallotsPayloadSchema
    ).unsafeUnwrap();
    const scratchPath = await mkdtemp(join(tmpdir(), 'vxadmin-design-'));
    await designStore.startBackgroundTask(taskId);
    try {
      await generateElectionPackageAndBallots(
        context,
        payload,
        (label, progress, total) => {
          void designStore.updateBackgroundTaskProgress(taskId, {
            label,
            progress,
            total,
          });
        },
        { path: scratchPath }
      );
      await designStore.completeBackgroundTask(taskId);
    } catch (error) {
      await designStore.completeBackgroundTask(
        taskId,
        extractErrorMessage(error)
      );
    } finally {
      await rm(scratchPath, { recursive: true, force: true });
    }
  }

  return {
    fileStorageClient,
    translator: context.translator,
    speechSynthesizer: context.speechSynthesizer,

    async startExport(electionId) {
      const jurisdiction =
        await designStore.getElectionJurisdiction(electionId);
      const features = getStateFeaturesConfig(jurisdiction);
      await designStore.createElectionPackageBackgroundTask({
        electionId,
        electionSerializationFormat: 'vxf',
        shouldExportAudio: false,
        shouldExportSampleBallots: !!features.EXPORT_SAMPLE_BALLOTS,
        shouldExportTestBallots: !!features.EXPORT_TEST_BALLOTS,
      });
      void runExportTask(electionId);
    },

    resolveFileUrl(url) {
      return fileStorageClient.resolvePath(url.replace(/^\/files\//, ''));
    },
  };
}
