import { fork } from 'node:child_process';
import { join } from 'node:path';
import type { BackgroundTaskStore } from '@votingworks/design-backend';
import { getStateFeaturesConfig } from '@votingworks/design-backend';
import { LogEventId, type BaseLogger } from '@votingworks/logging';
import type { ElectionId, StateCode } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { type ExportChildArgs, resolveDesignFileUrl } from './export_child.js';

const RENDERER_POOL_SIZE = 4;
const EXPORT_CHILD_MAX_HEAP_MB = 3072;
const WATCHDOG_TIMEOUT_MS = 5 * 60 * 1000;
const WATCHDOG_INTERVAL_MS = 10 * 1000;

export interface DesignExporter {
  readonly filesRoot: string;
  isExporting(): boolean;
  startExport(electionId: ElectionId, stateCode: StateCode): Promise<void>;
  resolveFileUrl(url: string): string;
}

export function createDesignExporter({
  tasks,
  filesRoot,
  logger,
}: {
  tasks: BackgroundTaskStore;
  filesRoot: string;
  logger: BaseLogger;
}): DesignExporter {
  let running = false;

  async function failTask(taskId: string, message: string): Promise<void> {
    const task = await tasks.getBackgroundTask(taskId);
    if (task && !task.completedAt) {
      await tasks.completeBackgroundTask(taskId, message);
    }
  }

  return {
    filesRoot,

    isExporting: () => running,

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
      const taskId = assertDefined(
        (await tasks.getElectionPackage(electionId)).task
      ).id;
      const args: ExportChildArgs = {
        electionId,
        stateCode,
        filesRoot,
        rendererPoolSize: RENDERER_POOL_SIZE,
      };
      running = true;
      const child = fork(
        join(import.meta.dirname, 'export_child.js'),
        [JSON.stringify(args)],
        { execArgv: [`--max-old-space-size=${EXPORT_CHILD_MAX_HEAP_MB}`] }
      );
      let lastProgressAt = Date.now();
      child.on('message', () => {
        lastProgressAt = Date.now();
      });
      const watchdog = setInterval(() => {
        if (Date.now() - lastProgressAt > WATCHDOG_TIMEOUT_MS) {
          child.kill('SIGKILL');
          void failTask(
            taskId,
            'Export stopped making progress and was stopped.'
          );
        }
      }, WATCHDOG_INTERVAL_MS);
      child.on('exit', (code, signal) => {
        clearInterval(watchdog);
        running = false;
        if (code !== 0) {
          logger.log(LogEventId.UnknownError, 'system', {
            message: `Election design export exited (code ${code}, signal ${signal}).`,
            disposition: 'failure',
          });
          void failTask(taskId, 'Export process exited unexpectedly.');
        }
      });
    },

    resolveFileUrl: (url) => resolveDesignFileUrl(filesRoot, url),
  };
}
