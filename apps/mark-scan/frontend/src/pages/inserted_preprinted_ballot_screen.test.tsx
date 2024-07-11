import {
  BallotMetadata,
  InterpretedBmdPage,
  VotesDict,
} from '@votingworks/types';
import { QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { deferred, typedAs } from '@votingworks/basics';

import { advancePromises } from '@votingworks/test-utils';
import { render, screen } from '../../test/react_testing_library';
import * as api from '../api';
import { InsertedPreprintedBallotScreen } from './inserted_preprinted_ballot_screen';

const mockApiClient = typedAs<Partial<api.ApiClient>>({
  getInterpretation: jest.fn(),
  returnPreprintedBallot: jest.fn(),
  startSessionWithPreprintedBallot: jest.fn(),
}) as unknown as jest.Mocked<api.ApiClient>;

const ballotStyleId = '2_en';
const precinctId = 'abc123';
const votes: VotesDict = { contest1: ['yes'], contest2: ['no'] };
const metadata: Partial<BallotMetadata> = { ballotStyleId, precinctId };

const mockInterpretation = typedAs<Partial<InterpretedBmdPage>>({
  metadata: metadata as unknown as BallotMetadata,
  type: 'InterpretedBmdPage',
  votes,
}) as unknown as InterpretedBmdPage;

function renderScreen() {
  const mockActivateCardlessVoter = jest.fn();
  const mockSetVotes = jest.fn();

  return {
    mockActivateCardlessVoter,
    mockSetVotes,
    renderResult: render(
      <api.ApiClientContext.Provider value={mockApiClient}>
        <QueryClientProvider client={api.createQueryClient()}>
          <InsertedPreprintedBallotScreen
            activateCardlessVoterSession={mockActivateCardlessVoter}
            setVotes={mockSetVotes}
          />
        </QueryClientProvider>
      </api.ApiClientContext.Provider>
    ),
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('with valid interpretation loaded', () => {
  test('start a new session with interpreted votes', async () => {
    mockApiClient.getInterpretation.mockResolvedValue(mockInterpretation);

    const { mockActivateCardlessVoter, mockSetVotes } = renderScreen();
    await advancePromises();

    screen.getByText(/ballot detected/i);
    expect(mockSetVotes).not.toHaveBeenCalled();
    expect(mockActivateCardlessVoter).not.toHaveBeenCalled();

    userEvent.click(screen.getButton(/yes/i));
    await advancePromises();

    expect(mockApiClient.returnPreprintedBallot).not.toHaveBeenCalled();
    expect(mockApiClient.startSessionWithPreprintedBallot).toHaveBeenCalled();
    expect(mockSetVotes).toHaveBeenCalledWith(mockInterpretation.votes);
    expect(mockActivateCardlessVoter).toHaveBeenCalledWith(
      precinctId,
      ballotStyleId
    );
  });

  test('return ballot', async () => {
    mockApiClient.getInterpretation.mockResolvedValue(mockInterpretation);

    const { mockActivateCardlessVoter, mockSetVotes } = renderScreen();
    await advancePromises();

    screen.getByText(/ballot detected/i);
    expect(mockSetVotes).not.toHaveBeenCalled();
    expect(mockActivateCardlessVoter).not.toHaveBeenCalled();

    userEvent.click(screen.getButton(/no/i));
    await advancePromises();

    expect(
      mockApiClient.startSessionWithPreprintedBallot
    ).not.toHaveBeenCalled();
    expect(mockApiClient.returnPreprintedBallot).toHaveBeenCalled();
    expect(mockSetVotes).not.toHaveBeenCalled();
    expect(mockActivateCardlessVoter).not.toHaveBeenCalled();
  });
});

test('no contents while query is pending', () => {
  const deferredInterpretation = deferred<InterpretedBmdPage>();
  mockApiClient.getInterpretation.mockReturnValue(
    deferredInterpretation.promise
  );

  const { renderResult } = renderScreen();

  expect(renderResult.container).toHaveTextContent('');
  deferredInterpretation.resolve(mockInterpretation);
});
