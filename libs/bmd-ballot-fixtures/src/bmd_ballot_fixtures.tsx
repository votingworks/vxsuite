import React from 'react';
import { renderToPdf } from '@votingworks/printing';
import {
  ElectionDefinition,
  VotesDict,
  BallotStyleId,
  PrecinctId,
  vote,
} from '@votingworks/types';
import { BmdPaperBallot, BmdPaperBallotProps } from '@votingworks/ui';
import { Buffer } from 'buffer';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';

export async function renderBmdBallotFixture(
  props: Partial<BmdPaperBallotProps> & {
    electionDefinition: ElectionDefinition;
  }
): Promise<Buffer> {
  // Set some default props that can be overriden by the caller
  const {
    electionDefinition: { election },
  } = props;
  const ballotStyle = election.ballotStyles[0];
  const precinctId = ballotStyle.precincts[0];
  const votes: VotesDict = {};
  const ballot = (
    <React.Fragment>
      <BmdPaperBallot
        isLiveMode={false}
        generateBallotId={() => '1'}
        machineType="mark"
        ballotStyleId={ballotStyle.id}
        precinctId={precinctId}
        votes={votes}
        {...props}
      />
      <div style={{ pageBreakAfter: 'always' }} />
    </React.Fragment>
  );

  return renderToPdf({ document: ballot });
}

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
