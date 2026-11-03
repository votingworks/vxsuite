import { describe, expect, test, vi } from 'vitest';
import { Route } from 'react-router-dom';
import { readElectionGeneral } from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import {
  MARK_FLOW_UI_VOTER_SCREEN_TEST_ID,
  ReviewPage,
} from '@votingworks/mark-flow-ui';
import { assertDefined } from '@votingworks/basics';
import type { OptionalCandidateOrderings } from '@votingworks/types';
import { screen } from '../../test/react_testing_library.js';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config.js';
import { render as renderWithBallotContext } from '../../test/test_utils.js';
import { ReviewScreen } from './review_screen.js';
import { createApiMock } from '../../test/helpers/mock_api_client.js';

vi.mock(import('@votingworks/mark-flow-ui'), async (importActual) => {
  const actual = await importActual();
  return { ...actual, ReviewPage: vi.fn(actual.ReviewPage) };
});

const electionGeneral = readElectionGeneral();

test('Renders ReviewScreen', () => {
  renderWithBallotContext(<Route path="/review" component={ReviewScreen} />, {
    route: '/review',
    precinctId: electionGeneral.precincts[0]!.id,
    ballotStyleId: electionGeneral.ballotStyles[0]!.id,
  });
  screen.getByText('Review Your Votes');
  screen.getByText('Settings');
});

test('Renders ReviewScreen in Landscape orientation', () => {
  renderWithBallotContext(<Route path="/review" component={ReviewScreen} />, {
    route: '/review',
    precinctId: electionGeneral.precincts[0]!.id,
    ballotStyleId: electionGeneral.ballotStyles[0]!.id,
    machineConfig: mockMachineConfig({ screenOrientation: 'landscape' }),
  });
  screen.getByText('Review Your Votes');
});

test('renders as voter screen', () => {
  const history = createMemoryHistory({ initialEntries: ['/review'] });

  renderWithBallotContext(<Route path="/review" component={ReviewScreen} />, {
    ballotStyleId: electionGeneral.ballotStyles[0]!.id,
    history,
    precinctId: electionGeneral.precincts[0]!.id,
    route: '/review',
  });

  screen.getByTestId(MARK_FLOW_UI_VOTER_SCREEN_TEST_ID);
});

describe('propagates candidate orderings', () => {
  test('explicit', () =>
    testOrderings({ contest1: [{ id: 'c2' }, { id: 'c1' }] }));

  test('null', () => testOrderings(null));

  function testOrderings(orderings: OptionalCandidateOrderings) {
    const apiMock = createApiMock();
    apiMock.expectGetSystemSettings();

    vi.mocked(ReviewPage).mockImplementation((props) => {
      expect(props.candidateOrderings).toEqual(orderings);
      return <div data-testid="MockReviewPage" />;
    });

    const ballotStyle = assertDefined(electionGeneral.ballotStyles[0]);
    renderWithBallotContext(<ReviewScreen />, {
      apiMock,
      ballotStyleId: ballotStyle.id,
      candidateOrderings: orderings,
      electionDefinition: {
        ballotHash: 'unused',
        election: electionGeneral,
        electionData: 'unused',
      },
      precinctId: ballotStyle.precincts[0],
    });

    screen.getByTestId('MockReviewPage');
  }
});
