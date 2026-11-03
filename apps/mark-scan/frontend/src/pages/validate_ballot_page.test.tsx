import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import {
  MARK_FLOW_UI_VOTER_SCREEN_TEST_ID,
  Review,
} from '@votingworks/mark-flow-ui';
import { assertDefined } from '@votingworks/basics';
import type { OptionalCandidateOrderings } from '@votingworks/types';
import { render as renderWithBallotContext } from '../../test/test_utils.js';
import {
  createApiMock,
  type ApiMock,
} from '../../test/helpers/mock_api_client.js';
import { screen } from '../../test/react_testing_library.js';
import { ValidateBallotPage } from './validate_ballot_page.js';
import { getMockInterpretation } from '../../test/helpers/interpretation.js';

vi.mock(import('@votingworks/mark-flow-ui'), async (importActual) => {
  const actual = await importActual();
  return { ...actual, Review: vi.fn(actual.Review) };
});

const electionGeneralDefinition = readElectionGeneralDefinition();

let apiMock: ApiMock;
beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('calls invalidateBallot if voter indicates their ballot is incorrect', async () => {
  const electionDefinition = electionGeneralDefinition;
  const mockInterpretation = getMockInterpretation(electionDefinition);
  apiMock.expectGetInterpretation(mockInterpretation);
  apiMock.expectInvalidateBallot();
  renderWithBallotContext(<ValidateBallotPage />, {
    electionDefinition,
    precinctId: electionDefinition.election.precincts[0]!.id,
    ballotStyleId: electionDefinition.election.ballotStyles[0]!.id,
    apiMock,
  });

  await screen.findByText('Review Your Votes');
  apiMock.expectGetInterpretation(mockInterpretation);
  await userEvent.click(screen.getByText('My Ballot is Incorrect'));
  await vi.waitFor(() => {
    apiMock.mockApiClient.assertComplete();
  });
});

test('renders as voter screen', async () => {
  const electionDefinition = electionGeneralDefinition;

  const mockInterpretation = getMockInterpretation(electionDefinition);
  apiMock.expectGetInterpretation(mockInterpretation);

  renderWithBallotContext(<ValidateBallotPage />, {
    electionDefinition,
    precinctId: electionDefinition.election.precincts[0]!.id,
    ballotStyleId: electionDefinition.election.ballotStyles[0]!.id,
    apiMock,
  });

  await screen.findByTestId(MARK_FLOW_UI_VOTER_SCREEN_TEST_ID);
});

describe('propagates candidate orderings', () => {
  test('explicit orderings', () =>
    testOrderings({ contest1: [{ id: 'c2' }, { id: 'c1' }] }));

  test('null orderings', () => testOrderings(null));

  async function testOrderings(orderings: OptionalCandidateOrderings) {
    const electionDef = electionGeneralDefinition;
    const ballotStyle = assertDefined(electionDef.election.ballotStyles[0]);

    apiMock.expectGetInterpretation(getMockInterpretation(electionDef));

    vi.mocked(Review).mockImplementation((props) => {
      expect(props.candidateOrderings).toEqual(orderings);
      return <div data-testid="MockReview" />;
    });

    renderWithBallotContext(<ValidateBallotPage />, {
      apiMock,
      ballotStyleId: ballotStyle.id,
      candidateOrderings: orderings,
      electionDefinition: electionGeneralDefinition,
      precinctId: ballotStyle.precincts[0],
    });

    await screen.findByTestId(MARK_FLOW_UI_VOTER_SCREEN_TEST_ID);
    screen.getByTestId('MockReview');
  }
});
