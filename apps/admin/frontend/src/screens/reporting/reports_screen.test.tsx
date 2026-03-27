import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionPrimaryPrecinctSplitsFixtures,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { ElectionDefinition } from '@votingworks/types';
import { isVoterTurnoutReportEnabled, ReportsScreen } from './reports_screen';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { screen } from '../../../test/react_testing_library';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date('2020-11-03T22:22:00'),
  });

  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const electionDefinition = readElectionTwoPartyPrimaryDefinition();

describe('isVoterTurnoutReportEnabled', () => {
  const { election } = readElectionTwoPartyPrimaryDefinition();
  const { election: splitElection } =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();

  test('returns false when counts are null', () => {
    expect(isVoterTurnoutReportEnabled(election, null)).toEqual(false);
  });

  test('returns false when counts are undefined', () => {
    expect(isVoterTurnoutReportEnabled(election, undefined)).toEqual(false);
  });

  test('returns false when a precinct is missing counts', () => {
    expect(
      isVoterTurnoutReportEnabled(election, { 'precinct-1': 100 })
    ).toEqual(false);
  });

  test('returns true when all non-split precincts have counts', () => {
    expect(
      isVoterTurnoutReportEnabled(election, {
        'precinct-1': 100,
        'precinct-2': 200,
      })
    ).toEqual(true);
  });

  test('returns false when a split precinct has a number instead of splits object', () => {
    expect(
      isVoterTurnoutReportEnabled(splitElection, {
        'precinct-c1-w1-1': 100,
        'precinct-c1-w1-2': 200,
        'precinct-c1-w2': 300,
        'precinct-c2': 400,
      })
    ).toEqual(false);
  });

  test('returns false when a split precinct is missing some splits', () => {
    expect(
      isVoterTurnoutReportEnabled(splitElection, {
        'precinct-c1-w1-1': 100,
        'precinct-c1-w1-2': 200,
        'precinct-c1-w2': 300,
        'precinct-c2': { splits: { 'precinct-c2-split-1': 150 } },
      })
    ).toEqual(false);
  });

  test('returns true when all precincts and splits have counts', () => {
    expect(
      isVoterTurnoutReportEnabled(splitElection, {
        'precinct-c1-w1-1': 100,
        'precinct-c1-w1-2': 200,
        'precinct-c1-w2': 300,
        'precinct-c2': {
          splits: {
            'precinct-c2-split-1': 150,
            'precinct-c2-split-2': 250,
          },
        },
      })
    ).toEqual(true);
  });
});

describe('ballot count summary text', () => {
  test('unlocked mode', async () => {
    apiMock.expectGetCastVoteRecordFileMode('unlocked');
    apiMock.expectGetManualResultsMetadata([]);
    apiMock.expectGetTotalBallotCount(0);
    apiMock.expectGetRegisteredVoterCounts(null);

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText(hasTextAcrossElements('Ballot Count: 0'));
  });

  test('"official" mode', async () => {
    apiMock.expectGetCastVoteRecordFileMode('official');
    apiMock.expectGetManualResultsMetadata([]);
    apiMock.expectGetTotalBallotCount(3000);
    apiMock.expectGetRegisteredVoterCounts(null);

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText(hasTextAcrossElements('Ballot Count: 3,000'));
  });

  test('"test" mode', async () => {
    apiMock.expectGetCastVoteRecordFileMode('test');
    apiMock.expectGetManualResultsMetadata([]);
    apiMock.expectGetTotalBallotCount(3000);
    apiMock.expectGetRegisteredVoterCounts(null);

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText(hasTextAcrossElements('Test Ballot Count: 3,000'));
  });
});

describe('voter turnout report link', () => {
  test('shown when election package has registered voter counts', async () => {
    apiMock.expectGetCastVoteRecordFileMode('test');
    apiMock.expectGetManualResultsMetadata([]);
    apiMock.expectGetTotalBallotCount(3000);
    apiMock.expectGetRegisteredVoterCounts({
      'precinct-1': 100,
      'precinct-2': 200,
    });

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findButton('Unofficial Voter Turnout Report');
  });

  test('uses official prefix when results are official', async () => {
    apiMock.expectGetCastVoteRecordFileMode('official');
    apiMock.expectGetManualResultsMetadata([]);
    apiMock.expectGetTotalBallotCount(3000);
    apiMock.expectGetRegisteredVoterCounts({
      'precinct-1': 100,
      'precinct-2': 200,
    });

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
      isOfficialResults: true,
    });

    await screen.findButton('Official Voter Turnout Report');
  });

  test('not shown when election package has no registered voter counts', async () => {
    apiMock.expectGetCastVoteRecordFileMode('test');
    apiMock.expectGetManualResultsMetadata([]);
    apiMock.expectGetTotalBallotCount(3000);
    apiMock.expectGetRegisteredVoterCounts(null);

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findButton('Full Election Tally Report');
    expect(
      screen.queryByText('Unofficial Voter Turnout Report')
    ).not.toBeInTheDocument();
  });

  test('not shown for NH elections even when registered voter counts exist', async () => {
    const nhElectionDefinition =
      electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
    apiMock.expectGetCastVoteRecordFileMode('test');
    apiMock.expectGetManualResultsMetadata([]);
    apiMock.expectGetTotalBallotCount(3000);
    apiMock.expectGetRegisteredVoterCounts({
      'town-id-00701-precinct-id-default': 500,
    });

    renderInAppContext(<ReportsScreen />, {
      electionDefinition: nhElectionDefinition,
      apiMock,
    });

    await screen.findButton('Full Election Tally Report');
    expect(
      screen.queryByText('Unofficial Voter Turnout Report')
    ).not.toBeInTheDocument();
  });
});

describe('showing WIA report link', () => {
  const BUTTON_TEXT = 'Unofficial Write-In Adjudication Report';

  test('shown when election has write-in contests', async () => {
    apiMock.expectGetCastVoteRecordFileMode('test');
    apiMock.expectGetManualResultsMetadata([]);
    apiMock.expectGetTotalBallotCount(3000);
    apiMock.expectGetRegisteredVoterCounts(null);

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findButton(BUTTON_TEXT);
  });

  test('not shown when election does not have write-in contests', async () => {
    apiMock.expectGetCastVoteRecordFileMode('test');
    apiMock.expectGetManualResultsMetadata([]);
    apiMock.expectGetTotalBallotCount(3000);
    apiMock.expectGetRegisteredVoterCounts(null);

    const electionDefinitionWithoutWriteIns: ElectionDefinition = {
      ...electionDefinition,
      election: {
        ...electionDefinition.election,
        contests: electionDefinition.election.contests.map((contest) => {
          if (contest.type === 'candidate') {
            return {
              ...contest,
              allowWriteIns: false,
            };
          }

          return contest;
        }),
      },
    };

    renderInAppContext(<ReportsScreen />, {
      electionDefinition: electionDefinitionWithoutWriteIns,
      apiMock,
    });

    await screen.findButton('Full Election Tally Report');
    expect(screen.queryByText(BUTTON_TEXT)).not.toBeInTheDocument();
  });
});
