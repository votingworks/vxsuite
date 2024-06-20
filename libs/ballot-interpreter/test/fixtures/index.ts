import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { BallotStyleId, PrecinctId, vote } from '@votingworks/types';

export const DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID: BallotStyleId = '1';
export const DEFAULT_FAMOUS_NAMES_PRECINCT_ID: PrecinctId = '23';

export const DEFAULT_FAMOUS_NAMES_VOTES = vote(
  electionFamousNames2021Fixtures.election.contests,
  {
    mayor: 'sherlock-holmes',
    controller: 'winston-churchill',
    attorney: 'john-snow',
    'public-works-director': 'benjamin-franklin',
    'chief-of-police': 'natalie-portman',
    'parks-and-recreation-director': 'charles-darwin',
    'board-of-alderman': [
      'helen-keller',
      'steve-jobs',
      'nikola-tesla',
      'vincent-van-gogh',
    ],
    'city-council': [
      'marie-curie',
      'indiana-jones',
      'mona-lisa',
      'jackie-chan',
    ],
  }
);
