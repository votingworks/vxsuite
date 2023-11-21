import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { ReportsScreen } from './reports_screen';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { screen } from '../../../test/react_testing_library';
import { getMockCardCounts } from '../../../test/helpers/mock_results';

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
    apiMock.expectGetCardCounts({}, [getMockCardCounts(0)]);

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
    apiMock.expectGetCardCounts({}, [getMockCardCounts(3000)]);

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
    apiMock.expectGetCardCounts({}, [getMockCardCounts(3000)]);

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
