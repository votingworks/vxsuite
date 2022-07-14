import React from 'react';
import { computeTallyWithPrecomputedCategories } from '@votingworks/utils';
import { Election, ExternalTally, Tally } from '@votingworks/types';
import {
  electionMultiPartyPrimaryFixtures,
  electionSample2Fixtures,
} from '@votingworks/fixtures';
import { parseCvrsFileContents } from '@votingworks/test-utils';
import { render } from '@testing-library/react';

import { ContestTally } from './contest_tally';

function constructTally(cvrsFileContents: string, election: Election): Tally {
  const castVoteRecords = parseCvrsFileContents(cvrsFileContents);
  const { overallTally } = computeTallyWithPrecomputedCategories(
    election,
    new Set(castVoteRecords),
    []
  );
  return overallTally;
}

let election: Election;
let electionTally: Tally;
let externalTallies: ExternalTally[];

beforeEach(() => {
  election = electionSample2Fixtures.electionDefinition.election;
  electionTally = constructTally(
    electionSample2Fixtures.cvrDataSmall1,
    election
  );
  externalTallies = [];
});

it('Renders', () => {
  const { container } = render(
    <ContestTally
      election={election}
      electionTally={electionTally}
      externalTallies={externalTallies}
    />
  );
  // Because ContestTally returns a React fragment, we need to check container instead of
  // container.firstChild as we typically do, as the latter will miss elements
  expect(container).toMatchSnapshot();
});

describe('When an election has a contest with multiple seats', () => {
  beforeEach(() => {
    election = electionMultiPartyPrimaryFixtures.electionDefinition.election;
    electionTally = constructTally(
      electionMultiPartyPrimaryFixtures.cvrData,
      election
    );
    externalTallies = [];
  });

  it('Renders', () => {
    const { container } = render(
      <ContestTally
        election={election}
        electionTally={electionTally}
        externalTallies={externalTallies}
      />
    );
    // Because ContestTally returns a React fragment, we need to check container instead of
    // container.firstChild as we typically do, as the latter will miss elements
    expect(container).toMatchSnapshot();
  });

  it('Renders seat count for contests with multiple seats', () => {
    const { getByTestId } = render(
      <ContestTally
        election={election}
        electionTally={electionTally}
        externalTallies={externalTallies}
      />
    );
    const singleSeatContestEntry = getByTestId(
      'results-table-governor-contest-liberty'
    );
    const multipleSeatContestEntry = getByTestId(
      'results-table-schoolboard-liberty'
    );
    expect(singleSeatContestEntry).not.toHaveTextContent('seats');
    expect(multipleSeatContestEntry).toHaveTextContent('(2 seats)');
  });
});
