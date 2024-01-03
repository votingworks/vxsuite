import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { ElectionDefinition } from '@votingworks/types';
import { buildMockCardCounts } from '@votingworks/utils';
import { ReportsScreen } from './reports_screen';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { screen } from '../../../test/react_testing_library';

let apiMock: ApiMock;

jest.useFakeTimers();

beforeEach(() => {
  jest.setSystemTime(new Date('2020-11-03T22:22:00'));
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const electionDefinition = electionTwoPartyPrimaryDefinition;

describe('ballot count summary text', () => {
  test('unlocked mode', async () => {
    apiMock.expectGetCastVoteRecordFileMode('unlocked');
    apiMock.expectGetCardCounts({}, [buildMockCardCounts(0)]);

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText(
      hasTextAcrossElements(
        '0 ballots have been counted for Example Primary Election.'
      )
    );
  });

  test('official mode', async () => {
    apiMock.expectGetCastVoteRecordFileMode('official');
    apiMock.expectGetCardCounts({}, [buildMockCardCounts(3000)]);

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText(
      hasTextAcrossElements(
        '3,000 official ballots have been counted for Example Primary Election.'
      )
    );
  });

  test('test mode', async () => {
    apiMock.expectGetCastVoteRecordFileMode('test');
    apiMock.expectGetCardCounts({}, [buildMockCardCounts(3000)]);

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText(
      hasTextAcrossElements(
        '3,000 test ballots have been counted for Example Primary Election.'
      )
    );
  });
});

describe('showing WIA report link', () => {
  const BUTTON_TEXT = 'Unofficial Write-In Adjudication Report';

  test('shown when election has write-in contests', async () => {
    apiMock.expectGetCastVoteRecordFileMode('test');
    apiMock.expectGetCardCounts({}, [buildMockCardCounts(3000)]);

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findButton(BUTTON_TEXT);
  });

  test('not shown when election does not write-in contests', async () => {
    apiMock.expectGetCastVoteRecordFileMode('test');
    apiMock.expectGetCardCounts({}, [buildMockCardCounts(3000)]);

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
