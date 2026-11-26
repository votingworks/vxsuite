import { expect, test } from 'vitest';
import { interpretSimplexBmdBallot } from '@votingworks/ballot-interpreter';
import { readElection } from '@votingworks/fs';
import { DEFAULT_MARK_THRESHOLDS } from '@votingworks/types';
import {
  DIAGNOSTIC_ELECTION_PATH,
  getDiagnosticMockBallotImage,
} from './utils.js';

test('the diagnostic mock ballot interprets against the diagnostic election file', async () => {
  const electionDefinition = (
    await readElection(DIAGNOSTIC_ELECTION_PATH)
  ).unsafeUnwrap();

  const [front, back] = await interpretSimplexBmdBallot(
    await getDiagnosticMockBallotImage(),
    {
      electionDefinition,
      validPrecinctIds: new Set(
        electionDefinition.election.precincts.map((p) => p.id)
      ),
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    }
  );

  expect(front.type).toEqual('InterpretedBmdPage');
  expect(back.type).toEqual('BlankPage');
});
