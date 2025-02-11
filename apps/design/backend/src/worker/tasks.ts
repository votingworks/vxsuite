import { z } from 'zod';
import { Result, throwIllegalValue } from '@votingworks/basics';
import {
  BallotStyleIdSchema,
  BallotTypeSchema,
  ElectionIdSchema,
  ElectionSerializationFormatSchema,
  PrecinctIdSchema,
  safeParseJson,
} from '@votingworks/types';
import { BackgroundTask } from '../store';
import { WorkerContext } from './context';
import { generateElectionPackageAndBallots } from './generate_election_package_and_ballots';
import { generateBallotPreviewPdf } from './generate_ballot_preview';

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
    case 'generate_ballot_preview': {
      const parseResult = safeParseJson(
        payload,
        z.object({
          electionId: ElectionIdSchema,
          precinctId: PrecinctIdSchema,
          ballotStyleId: BallotStyleIdSchema,
          ballotType: BallotTypeSchema,
          ballotMode: z.union([
            z.literal('official'),
            z.literal('test'),
            z.literal('sample'),
          ]),
        })
      );
      if (parseResult.isErr()) {
        return parseResult;
      }
      return await generateBallotPreviewPdf(context, parseResult.ok());
    }
    default: {
      /* istanbul ignore next: Compile-time check for completeness - @preserve */
      throwIllegalValue(taskName);
    }
  }
}
