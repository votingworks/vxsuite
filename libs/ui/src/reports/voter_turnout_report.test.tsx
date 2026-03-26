import { expect, test } from 'vitest';
import {
  electionPrimaryPrecinctSplitsFixtures,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { Tabulation } from '@votingworks/types';
import { screen, within } from '@testing-library/react';
import { render } from '../../test/react_testing_library';
import { VoterTurnoutReport } from './voter_turnout_report';

const electionDefinition = readElectionTwoPartyPrimaryDefinition();

const GENERATED_AT = new Date('2024-01-01T00:00:00.000Z');
const ELECTION_PACKAGE_HASH = 'test-hash';

// shorthand for a precinct-grouped card counts entry
function generateCardCounts(
  precinctId: string,
  bmd: number
): Tabulation.GroupOf<Tabulation.CardCounts> {
  return { precinctId, bmd: [bmd], hmpb: [] };
}

// Returns the three data cells (ballots cast, registered voters, turnout) for a named row.
// Each row in TurnoutGrid is exactly 4 consecutive <span> elements with no wrapper.
function getRow(
  grid: HTMLElement,
  name: string
): {
  ballotsCastCell: HTMLElement;
  rvCell: HTMLElement;
  turnoutCell: HTMLElement;
} {
  const nameCell = within(grid).getByText(name);
  const ballotsCastCell = nameCell.nextElementSibling as HTMLElement;
  const rvCell = ballotsCastCell.nextElementSibling as HTMLElement;
  const turnoutCell = rvCell.nextElementSibling as HTMLElement;
  return { ballotsCastCell, rvCell, turnoutCell };
}

test('renders precinct rows with ballots cast, registered voters, and turnout', () => {
  render(
    <VoterTurnoutReport
      electionDefinition={electionDefinition}
      electionPackageHash={ELECTION_PACKAGE_HASH}
      isOfficial={false}
      isTest={false}
      cardCountsList={[
        generateCardCounts('precinct-1', 200),
        generateCardCounts('precinct-2', 100),
      ]}
      registeredVoterCounts={{ 'precinct-1': 500, 'precinct-2': 400 }}
      generatedAtTime={GENERATED_AT}
    />
  );

  const grid = screen.getByTestId('turnout-grid');

  // Precinct 1: 200 / 500 = 40.0%
  const row1 = getRow(grid, 'Precinct 1');
  expect(row1.ballotsCastCell).toHaveTextContent('200');
  expect(row1.rvCell).toHaveTextContent('500');
  expect(row1.turnoutCell).toHaveTextContent('40.0%');

  // Precinct 2: 100 / 400 = 25.0%
  const row2 = getRow(grid, 'Precinct 2');
  expect(row2.ballotsCastCell).toHaveTextContent('100');
  expect(row2.rvCell).toHaveTextContent('400');
  expect(row2.turnoutCell).toHaveTextContent('25.0%');

  // Total: 300 / 900 = 33.3%
  const totalRow = getRow(grid, 'Total');
  expect(totalRow.ballotsCastCell).toHaveTextContent('300');
  expect(totalRow.rvCell).toHaveTextContent('900');
  expect(totalRow.turnoutCell).toHaveTextContent('33.3%');
});

test('sums split registered voter counts into a single precinct row', () => {
  const splitElectionDef =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();

  render(
    <VoterTurnoutReport
      electionDefinition={splitElectionDef}
      electionPackageHash={ELECTION_PACKAGE_HASH}
      isOfficial={false}
      isTest={false}
      cardCountsList={[generateCardCounts('precinct-c2', 300)]}
      registeredVoterCounts={{
        'precinct-c1-w1-1': 100,
        'precinct-c1-w1-2': 200,
        'precinct-c1-w2': 300,
        'precinct-c2': {
          splits: {
            'precinct-c2-split-1': 200,
            'precinct-c2-split-2': 150,
          },
        },
      }}
      generatedAtTime={GENERATED_AT}
    />
  );

  const grid = screen.getByTestId('turnout-grid');
  // 200 + 150 = 350 registered voters for the split precinct; 300 / 350 = 85.7%
  const precinctRow = getRow(grid, 'Precinct 4');
  expect(precinctRow.ballotsCastCell).toHaveTextContent('300');
  expect(precinctRow.rvCell).toHaveTextContent('350');
  expect(precinctRow.turnoutCell).toHaveTextContent('85.7%');

  // Total: 300 / (100 + 200 + 300 + 350) = 300 / 950 = 31.6%
  const totalRow = getRow(grid, 'Total');
  expect(totalRow.ballotsCastCell).toHaveTextContent('300');
  expect(totalRow.rvCell).toHaveTextContent('950');
  expect(totalRow.turnoutCell).toHaveTextContent('31.6%');
});

test('shows em-dash for turnout when registered voters is 0', () => {
  render(
    <VoterTurnoutReport
      electionDefinition={electionDefinition}
      electionPackageHash={ELECTION_PACKAGE_HASH}
      isOfficial={false}
      isTest={false}
      cardCountsList={[generateCardCounts('precinct-1', 50)]}
      registeredVoterCounts={{ 'precinct-1': 0, 'precinct-2': 400 }}
      generatedAtTime={GENERATED_AT}
    />
  );

  const grid = screen.getByTestId('turnout-grid');
  // precinct-1 has 0 registered voters so its Turnout cell shows em-dash
  // total still has valid registered voters (0+400=400) so total turnout is 12.5%, not em-dash
  const dashes = within(grid).getAllByText('—');
  expect(dashes).toHaveLength(1); // only precinct-1 Turnout
});

test('renders without errors when all registered voter counts are 0', () => {
  render(
    <VoterTurnoutReport
      electionDefinition={electionDefinition}
      electionPackageHash={ELECTION_PACKAGE_HASH}
      isOfficial={false}
      isTest={false}
      cardCountsList={[
        generateCardCounts('precinct-1', 200),
        generateCardCounts('precinct-2', 100),
      ]}
      registeredVoterCounts={{ 'precinct-1': 0, 'precinct-2': 0 }}
      generatedAtTime={GENERATED_AT}
    />
  );

  const grid = screen.getByTestId('turnout-grid');
  // All registered voters values are 0 — every Turnout cell (including the total) shows em-dash
  const row1 = getRow(grid, 'Precinct 1');
  expect(row1.rvCell).toHaveTextContent('0');
  expect(row1.turnoutCell).toHaveTextContent('—');

  const row2 = getRow(grid, 'Precinct 2');
  expect(row2.rvCell).toHaveTextContent('0');
  expect(row2.turnoutCell).toHaveTextContent('—');

  const totalRow = getRow(grid, 'Total');
  expect(totalRow.rvCell).toHaveTextContent('0');
  expect(totalRow.turnoutCell).toHaveTextContent('—');
});

test('prefixes title with Unofficial when isOfficial is false', () => {
  render(
    <VoterTurnoutReport
      electionDefinition={electionDefinition}
      electionPackageHash={ELECTION_PACKAGE_HASH}
      isOfficial={false}
      isTest={false}
      cardCountsList={[]}
      registeredVoterCounts={{ 'precinct-1': 100, 'precinct-2': 200 }}
      generatedAtTime={GENERATED_AT}
    />
  );

  screen.getByText('Unofficial Voter Turnout Report');
});

test('prefixes title with Official when isOfficial is true', () => {
  render(
    <VoterTurnoutReport
      electionDefinition={electionDefinition}
      electionPackageHash={ELECTION_PACKAGE_HASH}
      isOfficial
      isTest={false}
      cardCountsList={[]}
      registeredVoterCounts={{ 'precinct-1': 100, 'precinct-2': 200 }}
      generatedAtTime={GENERATED_AT}
    />
  );

  screen.getByText('Official Voter Turnout Report');
});

test('renders test mode banner when isTest is true', () => {
  render(
    <VoterTurnoutReport
      electionDefinition={electionDefinition}
      electionPackageHash={ELECTION_PACKAGE_HASH}
      isOfficial={false}
      isTest
      cardCountsList={[]}
      registeredVoterCounts={{ 'precinct-1': 100, 'precinct-2': 200 }}
      generatedAtTime={GENERATED_AT}
    />
  );

  screen.getByText('Test Report');
});
