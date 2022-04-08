import React from 'react';
import {
  CastVoteRecord,
  Election,
  ExternalTally,
  Tally,
} from '@votingworks/types';
import { computeTallyWithPrecomputedCategories } from '@votingworks/utils';
import {
  electionMultiPartyPrimaryWithDataFiles,
  electionSample2WithDataFiles,
} from '@votingworks/fixtures';
import { render } from '@testing-library/react';

import { ContestTally } from './contest_tally';

function parseCvrsFileContents(cvrsFileContents: string): CastVoteRecord[] {
  const lines = cvrsFileContents.split('\n');
  return lines
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as CastVoteRecord);
}

function constructTally(cvrsFileContents: string, election: Election): Tally {
  const castVoteRecords = parseCvrsFileContents(cvrsFileContents);
  const { overallTally } = computeTallyWithPrecomputedCategories(
    election,
    new Set(castVoteRecords),
    []
  );
  return overallTally;
}

describe('ContestTally', () => {
  let election: Election;
  let electionTally: Tally;
  let externalTallies: ExternalTally[];

  beforeEach(() => {
    election = electionSample2WithDataFiles.electionDefinition.election;
    electionTally = constructTally(
      electionSample2WithDataFiles.cvrDataSmall1,
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
      election =
        electionMultiPartyPrimaryWithDataFiles.electionDefinition.election;
      electionTally = constructTally(
        electionMultiPartyPrimaryWithDataFiles.cvrData,
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
});
