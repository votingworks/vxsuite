import { z } from 'zod';
import { Result, throwIllegalValue } from '@votingworks/basics';
import {
  ElectionIdSchema,
  ElectionSerializationFormatSchema,
  safeParseJson,
} from '@votingworks/types';
import { BackgroundTask } from '../store';
import { WorkerContext } from './context';
import { generateElectionPackageAndBallots } from './generate_election_package_and_ballots';

export async function processBackgroundTask(
  context: WorkerContext,
  { taskName, payload }: BackgroundTask
): Promise<Result<unknown, unknown>> {
  switch (taskName) {
    // Misnomer; actually generates election and ballot packages, but
    // task name is unchanged until can migrate db
    case 'generate_election_package': {
      const parseResult = safeParseJson(
        payload,
        z.object({
          electionId: ElectionIdSchema,
          electionSerializationFormat: ElectionSerializationFormatSchema,
          orgId: z.string(),
        })
      );
      if (parseResult.isErr()) {
        return parseResult;
      }
      return await generateElectionPackageAndBallots(context, parseResult.ok());
    }
    default: {
      /* istanbul ignore next: Compile-time check for completeness - @preserve */
      throwIllegalValue(taskName);
    }
  }
}
