import { z } from 'zod';
import { throwIllegalValue } from '@votingworks/basics';
import {
  ElectionIdSchema,
  ElectionSerializationFormatSchema,
  safeParseJson,
} from '@votingworks/types';

import { BackgroundTask } from '../store';
import { WorkerContext } from './context';
import { generateElectionPackageAndBallots } from './generate_election_package_and_ballots';
import { generateTestDecks } from './generate_test_decks';

export async function processBackgroundTask(
  context: WorkerContext,
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
        })
      ).unsafeUnwrap();
      await generateElectionPackageAndBallots(context, parsedPayload);
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
      await generateTestDecks(context, parsedPayload);
      break;
    }
    default: {
      /* istanbul ignore next: Compile-time check for completeness - @preserve */
      throwIllegalValue(taskName);
    }
  }
}
