import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareSignatureFile } from '@votingworks/auth';
import {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudTranslator,
  loadEnvVarsFromDotenvFiles,
} from '@votingworks/backend';
import { assertDefined, extractErrorMessage } from '@votingworks/basics';
import {
  BackgroundTaskStore,
  Db,
  ElectionStore,
  generateElectionPackageAndBallots,
  GenerateElectionPackageAndBallotsPayloadSchema,
  LocalDirectoryFileStorageClient,
} from '@votingworks/design-backend';
import { BaseLogger, LogSource } from '@votingworks/logging';
import {
  type ElectionId,
  safeParseJson,
  type StateCode,
} from '@votingworks/types';
import { designDatabaseUrl } from './design_db.js';
import { createAdminDesignFeatures } from './design_features.js';
import {
  OFFLINE_TEXT_TO_SPEECH_CLIENT,
  OFFLINE_TRANSLATION_CLIENT,
} from './offline_clients.js';

export interface ExportChildArgs {
  electionId: ElectionId;
  stateCode: StateCode;
  filesRoot: string;
  rendererPoolSize: number;
}

export function resolveDesignFileUrl(filesRoot: string, url: string): string {
  return join(filesRoot, url.replace(/^\/files\//, ''));
}

async function runExport({
  electionId,
  stateCode,
  filesRoot,
  rendererPoolSize,
}: ExportChildArgs): Promise<void> {
  const logger = new BaseLogger(LogSource.VxAdminService);
  const db = new Db(logger, { connectionString: designDatabaseUrl() });
  const features = createAdminDesignFeatures(stateCode);
  const elections = new ElectionStore(db, {
    getStateFeatures: features.getStateFeatures,
  });
  const tasks = new BackgroundTaskStore(db);
  const task = assertDefined((await tasks.getElectionPackage(electionId)).task);
  const scratchPath = await mkdtemp(join(tmpdir(), 'vxadmin-design-'));
  await tasks.startBackgroundTask(task.id);
  try {
    await generateElectionPackageAndBallots(
      {
        elections,
        tasks,
        features,
        fileStorageClient: new LocalDirectoryFileStorageClient(filesRoot),
        translator: new GoogleCloudTranslator({
          translationClient: OFFLINE_TRANSLATION_CLIENT,
        }),
        speechSynthesizer: new GoogleCloudSpeechSynthesizer({
          textToSpeechClient: OFFLINE_TEXT_TO_SPEECH_CLIENT,
        }),
        rendererPoolSize,
      },
      safeParseJson(
        task.payload,
        GenerateElectionPackageAndBallotsPayloadSchema
      ).unsafeUnwrap(),
      (label, progress, total) => {
        process.send?.({ type: 'progress' });
        void tasks.updateBackgroundTaskProgress(task.id, {
          label,
          progress,
          total,
        });
      },
      { path: scratchPath }
    );
    const { electionPackageUrl } = await tasks.getElectionPackage(electionId);
    const packagePath = resolveDesignFileUrl(
      filesRoot,
      assertDefined(electionPackageUrl)
    );
    const signatureFile = await prepareSignatureFile({
      type: 'election_package',
      filePath: packagePath,
      exportFileName: basename(packagePath),
    });
    await writeFile(
      join(dirname(packagePath), signatureFile.fileName),
      signatureFile.fileContents
    );
    await tasks.completeBackgroundTask(task.id);
  } catch (error) {
    await tasks.completeBackgroundTask(task.id, extractErrorMessage(error));
  } finally {
    await rm(scratchPath, { recursive: true, force: true });
    await db.close();
  }
}

// @coverage-exclude
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadEnvVarsFromDotenvFiles();
  const args = JSON.parse(assertDefined(process.argv[2])) as ExportChildArgs;
  void runExport(args).then(
    () => process.exit(0),
    () => process.exit(1)
  );
}
