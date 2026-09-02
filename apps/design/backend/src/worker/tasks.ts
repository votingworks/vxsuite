import * as tmp from 'tmp';

import { throwIllegalValue } from '@votingworks/basics';
import { safeParseJson } from '@votingworks/types';
import { ScratchDir } from '@votingworks/hmpb';

import { BackgroundTask } from '../store.js';
import { WorkerContext } from './context.js';
import {
  generateElectionPackageAndBallots,
  GenerateElectionPackageAndBallotsPayloadSchema,
} from './generate_election_package_and_ballots.js';
import {
  generateTestDecks,
  GenerateTestDecksPayloadSchema,
} from './generate_test_decks.js';

tmp.setGracefulCleanup();

export async function processBackgroundTask(
  context: WorkerContext,
  task: BackgroundTask
): Promise<void> {
  const scratchDir = tmp.dirSync({ unsafeCleanup: true });

  try {
    await processTask(context, task, { path: scratchDir.name });
  } finally {
    try {
      scratchDir.removeCallback();
    } catch (error) {
      // Cleanup failures aren't much of an issue in current Heroku deployments,
      // since the disk is ephemeral and wiped during scheduled restarts, or
      // when a deploy/crash-restart cycle occurs.
      // eslint-disable-next-line no-console
      console.error('scratch dir cleanup failed:', error);
    }
  }
}

async function processTask(
  context: WorkerContext,
  { id: taskId, taskName, payload }: BackgroundTask,
  scratchDir: ScratchDir
): Promise<void> {
  function emitProgress(label: string, progress: number, total: number): void {
    context.workspace.store
      .updateBackgroundTaskProgress(taskId, {
        label,
        progress,
        total,
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error(
          `Error updating progress for background task ${taskId}:`,
          error
        );
      });
  }

  switch (taskName) {
    // Misnomer; actually generates election and ballot packages, but
    // task name is unchanged until can migrate db
    case 'generate_election_package': {
      const parsedPayload = safeParseJson(
        payload,
        GenerateElectionPackageAndBallotsPayloadSchema
      ).unsafeUnwrap();

      await generateElectionPackageAndBallots(
        context,
        parsedPayload,
        emitProgress,
        scratchDir
      );

      break;
    }
    case 'generate_test_decks': {
      const parsedPayload = safeParseJson(
        payload,
        GenerateTestDecksPayloadSchema
      ).unsafeUnwrap();

      await generateTestDecks(context, parsedPayload, emitProgress, scratchDir);

      break;
    }
    default: {
      throwIllegalValue(taskName);
    }
  }
}
