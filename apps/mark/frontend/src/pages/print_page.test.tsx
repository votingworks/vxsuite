import {
  PrintPage as MarkFlowPage,
  PrintPageProps as MarkFlowPageProps,
} from '@votingworks/mark-flow-ui';

import { electionWithMsEitherNeitherDefinition } from '@votingworks/fixtures';
import { assert, assertDefined, find } from '@votingworks/basics';
import { advanceTimers, mockOf } from '@votingworks/test-utils';
import { CandidateContest, YesNoContest, vote } from '@votingworks/types';
import { screen } from '../../test/react_testing_library';
import { PrintPage } from './print_page';
import { render } from '../../test/test_utils';
import { BALLOT_PRINTING_TIMEOUT_SECONDS } from '../config/globals';

const MOCK_MARK_FLOW_PAGE_TEST_ID = 'MockMarkFlowPrintPage';

jest.mock(
  '@votingworks/mark-flow-ui',
  (): typeof import('@votingworks/mark-flow-ui') => ({
    ...jest.requireActual('@votingworks/mark-flow-ui'),
    PrintPage: jest.fn(),
  })
);

const mockMarkFlowPage = mockOf(MarkFlowPage);

const electionDefinition = electionWithMsEitherNeitherDefinition;
const { election } = electionDefinition;
const BALLOT_STYLE = election.ballotStyles[0];
const PRECINCT_ID = BALLOT_STYLE.precincts[0];

const candidateContest = find(
  electionDefinition.election.contests,
  (c): c is CandidateContest => c.type === 'candidate'
);

const yesNoContest = find(
  electionDefinition.election.contests,
  (c): c is YesNoContest => c.type === 'yesno'
);

const MOCK_VOTES = vote(election.contests, {
  [candidateContest.id]: [candidateContest.candidates[0].id],
  [yesNoContest.id]: [yesNoContest.yesOption.id],
});

function mockGenerateBallotId() {
  return 'abc123';
}

const mockUnexpectedFunction = jest.fn(() => {
  throw new Error(`unexpected function call: ${name}`);
});

beforeEach(() => {
  jest.useFakeTimers();

  mockMarkFlowPage.mockImplementation(() => (
    <div data-testid={MOCK_MARK_FLOW_PAGE_TEST_ID} />
  ));
});

test('renders MarkFlowUi PrintPage', () => {
  const mockUpdateTally = jest.fn();
  const mockResetBallot = jest.fn();

  render(<PrintPage />, {
    ballotStyleId: BALLOT_STYLE.id,
    contests: election.contests,
    electionDefinition,
    endVoterSession: mockUnexpectedFunction,
    generateBallotId: mockGenerateBallotId,
    isLiveMode: true,
    precinctId: PRECINCT_ID,
    resetBallot: mockResetBallot,
    setUserSettings: mockUnexpectedFunction,
    updateTally: mockUpdateTally,
    updateVote: mockUnexpectedFunction,
    votes: MOCK_VOTES,
  });

  screen.getByTestId(MOCK_MARK_FLOW_PAGE_TEST_ID);

  const markFlowPageProps = assertDefined(mockMarkFlowPage.mock.lastCall)[0];
  expect(markFlowPageProps).toEqual<MarkFlowPageProps>({
    ballotStyleId: BALLOT_STYLE.id,
    electionDefinition,
    generateBallotId: mockGenerateBallotId,
    isLiveMode: true,
    machineType: 'mark',
    onPrint: expect.any(Function),
    precinctId: PRECINCT_ID,
    votes: MOCK_VOTES,
  });
  expect(mockUpdateTally).not.toHaveBeenCalled();

  assert(!markFlowPageProps.printToPdf); // Hint compiler that onPrint requires no args
  markFlowPageProps.onPrint();
  expect(mockUpdateTally).toHaveBeenCalled();
  expect(mockResetBallot).not.toHaveBeenCalled();

  advanceTimers(BALLOT_PRINTING_TIMEOUT_SECONDS);
  expect(mockResetBallot).toHaveBeenCalledWith(true);
});
