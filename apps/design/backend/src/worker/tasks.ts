import { z } from 'zod';
import { throwIllegalValue } from '@votingworks/basics';
import { safeParseJson } from '@votingworks/types';

import { BackgroundTask } from '../store';
import { WorkerContext } from './context';
import { generateElectionPackage } from './generate_election_package';

export async function processBackgroundTask(
  context: WorkerContext,
  { taskName, payload }: BackgroundTask
): Promise<void> {
  switch (taskName) {
    case 'generate_election_package': {
      const parsedPayload = safeParseJson(
        payload,
        z.object({ electionId: z.string() })
      ).unsafeUnwrap();
      await generateElectionPackage(context, parsedPayload);
      break;
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(taskName);
    }
  }
}
