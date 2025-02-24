import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { ElectionDefinition } from '@votingworks/types';
import { ReportsScreen } from './reports_screen';
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

describe('ballot count summary text', () => {
  test('unlocked mode', async () => {
    apiMock.expectGetCastVoteRecordFileMode('unlocked');
    apiMock.expectGetTotalBallotCount(0);

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText(hasTextAcrossElements('Ballot Count: 0'));
  });

  test('"official" mode', async () => {
    apiMock.expectGetCastVoteRecordFileMode('official');
    apiMock.expectGetTotalBallotCount(3000);

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText(hasTextAcrossElements('Ballot Count: 3,000'));
  });

  test('"test" mode', async () => {
    apiMock.expectGetCastVoteRecordFileMode('test');
    apiMock.expectGetTotalBallotCount(3000);

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText(hasTextAcrossElements('Test Ballot Count: 3,000'));
  });
});

describe('showing WIA report link', () => {
  const BUTTON_TEXT = 'Unofficial Write-In Adjudication Report';

  test('shown when election has write-in contests', async () => {
    apiMock.expectGetCastVoteRecordFileMode('test');
    apiMock.expectGetTotalBallotCount(3000);

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findButton(BUTTON_TEXT);
  });

  test('not shown when election does not write-in contests', async () => {
    apiMock.expectGetCastVoteRecordFileMode('test');
    apiMock.expectGetTotalBallotCount(3000);

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
