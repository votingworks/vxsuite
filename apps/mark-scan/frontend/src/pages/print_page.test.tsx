import { randomBallotId } from '@votingworks/utils';
import { Buffer } from 'buffer';
import {
  CandidateContest,
  YesNoContest,
  getBallotStyle,
  getContests,
  vote,
} from '@votingworks/types';
import { mockOf } from '@votingworks/test-utils';

import { electionGeneralDefinition } from '@votingworks/fixtures';
import { assertDefined, find } from '@votingworks/basics';
import {
  PrintPage as MarkFlowPage,
  PrintPageProps as MarkFlowPageProps,
} from '@votingworks/mark-flow-ui';
import { screen } from '../../test/react_testing_library';
import { PrintPage } from './print_page';

import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { render } from '../../test/test_utils';

jest.mock(
  '@votingworks/mark-flow-ui',
  (): typeof import('@votingworks/mark-flow-ui') => ({
    ...jest.requireActual('@votingworks/mark-flow-ui'),
    PrintPage: jest.fn(),
  })
);

const mockMarkFlowPage = mockOf(MarkFlowPage);

const MOCK_MARK_FLOW_PAGE_TEST_ID = 'MockMarkFlowPrintPage';
const MOCK_PDF_DATA = new Uint8Array([2, 2, 1]);

let apiMock: ApiMock;
const electionDefinition = electionGeneralDefinition;
const { election } = electionDefinition;

const BALLOT_STYLE = election.ballotStyles[0];
const BALLOT_STYLE_ID = BALLOT_STYLE.id;
const PRECINCT_ID = BALLOT_STYLE.precincts[0];

const candidateContest = find(
  electionDefinition.election.contests,
  (c): c is CandidateContest => c.type === 'candidate'
);

const yesNoContest = find(
  electionDefinition.election.contests,
  (c): c is YesNoContest => c.type === 'yesno'
);

beforeEach(() => {
  apiMock = createApiMock();

  mockMarkFlowPage.mockImplementation(() => (
    <div data-testid={MOCK_MARK_FLOW_PAGE_TEST_ID} />
  ));
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('Renders MarkFlowUI PrintPage', () => {
  const votes = vote(
    getContests({
      ballotStyle: getBallotStyle({
        election,
        ballotStyleId: BALLOT_STYLE_ID,
      })!,
      election,
    }),
    {
      [candidateContest.id]: [candidateContest.candidates[0].id],
      [yesNoContest.id]: [yesNoContest.yesOption.id],
    }
  );

  render(<PrintPage />, {
    apiMock,
    ballotStyleId: BALLOT_STYLE_ID,
    precinctId: PRECINCT_ID,
    route: '/print',
    electionDefinition,
    votes,
  });

  screen.getByTestId(MOCK_MARK_FLOW_PAGE_TEST_ID);

  const markFlowPageProps = assertDefined(mockMarkFlowPage.mock.lastCall)[0];
  expect(markFlowPageProps).toEqual<MarkFlowPageProps>({
    ballotStyleId: BALLOT_STYLE_ID,
    electionDefinition,
    generateBallotId: randomBallotId,
    isLiveMode: false,
    machineType: 'markScan',
    onPrint: expect.any(Function),
    precinctId: PRECINCT_ID,
    printToPdf: true,
    votes,
  });

  apiMock.expectPrintBallot(Buffer.from(MOCK_PDF_DATA));
  markFlowPageProps.onPrint(MOCK_PDF_DATA);
});
