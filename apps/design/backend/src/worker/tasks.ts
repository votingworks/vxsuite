import { z } from 'zod/v4';
import { throwIllegalValue } from '@votingworks/basics';
import {
  ElectionIdSchema,
  ElectionSerializationFormatSchema,
  safeParseJson,
} from '@votingworks/types';

import { LogEventId } from '@votingworks/logging';
import { BackgroundTask } from '../store';
import { WorkerContext } from './context';
import { generateElectionPackageAndBallots } from './generate_election_package_and_ballots';
import { generateTestDecks } from './generate_test_decks';

export async function processBackgroundTask(
  ctx: WorkerContext,
  { taskName, payload }: BackgroundTask
): Promise<void> {
  switch (taskName) {
    // Misnomer; actually generates election and ballot packages, but
    // task name is unchanged until can migrate db
    case 'generate_election_package': {
      const parsedPayload = safeParseJson(
        payload,
        z.object({
          electionId: ElectionIdSchema,
          electionSerializationFormat: ElectionSerializationFormatSchema,
          shouldExportAudio: z.boolean(),
          numAuditIdBallots: z.number().optional(),
        })
      ).unsafeUnwrap();

      ctx.logger.log(LogEventId.BackgroundTaskStarted, 'system', {
        message: `Starting task ${taskName}`,
        payload,
      });

      await generateElectionPackageAndBallots(ctx, parsedPayload);

      break;
    }
    case 'generate_test_decks': {
      const parsedPayload = safeParseJson(
        payload,
        z.object({
          electionId: ElectionIdSchema,
          electionSerializationFormat: ElectionSerializationFormatSchema,
        })
      ).unsafeUnwrap();

      ctx.logger.log(LogEventId.BackgroundTaskStarted, 'system', {
        message: `Starting task ${taskName}`,
        payload,
      });

      await generateTestDecks(ctx, parsedPayload);

      break;
    }
    default: {
      /* istanbul ignore next: Compile-time check for completeness - @preserve */
      throwIllegalValue(taskName);
    }
  }
}
