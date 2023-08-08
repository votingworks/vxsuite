import { electionSampleDefinition } from '@votingworks/fixtures';
import { BallotPaperSize, Election } from '@votingworks/types';

import { getBallotLayoutDensity } from './get_ballot_layout_density';

test('getBallotLayoutDensity', () => {
  const election: Election = {
    ...electionSampleDefinition.election,
    ballotLayout: {
      paperSize: BallotPaperSize.Legal,
      layoutDensity: 20,
      metadataEncoding: 'qr-code',
    },
  };

  expect(getBallotLayoutDensity(election)).toEqual(20);
});
