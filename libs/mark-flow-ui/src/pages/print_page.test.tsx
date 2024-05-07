import {
  electionGeneral,
  electionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  PrecinctId,
  PrintOptions,
  getBallotStyle,
  getContests,
  vote,
} from '@votingworks/types';
import { mockOf } from '@votingworks/test-utils';
import {
  BmdPaperBallot,
  BmdPaperBallotProps,
  PrintElement,
  PrintToPdf,
} from '@votingworks/ui';
import { assertDefined } from '@votingworks/basics';
import { render, screen, within } from '../../test/react_testing_library';
import { PrintPage } from './print_page';

const MOCK_PAPER_BALLOT_TEST_ID = 'MockBmdPaperBallot';
const MOCK_PRINT_ELEMENT_TEST_ID = 'MockPrintElement';
const MOCK_PRINT_TO_PDF_TEST_ID = 'MockPrintToPdf';

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => ({
  ...jest.requireActual('@votingworks/ui'),

  BmdPaperBallot: jest.fn(() => (
    <div data-testid={MOCK_PAPER_BALLOT_TEST_ID} />
  )),

  PrintElement: jest.fn((p) => (
    <div data-testid={MOCK_PRINT_ELEMENT_TEST_ID}>{p.children}</div>
  )),

  PrintToPdf: jest.fn((p) => (
    <div data-testid={MOCK_PRINT_TO_PDF_TEST_ID}>{p.children}</div>
  )),
}));

function expectPrintElement(ballotProps: BmdPaperBallotProps) {
  within(screen.getByTestId(MOCK_PRINT_ELEMENT_TEST_ID)).getByTestId(
    MOCK_PAPER_BALLOT_TEST_ID
  );
  expect(
    screen.queryByTestId(MOCK_PRINT_TO_PDF_TEST_ID)
  ).not.toBeInTheDocument();

  expect(mockOf(BmdPaperBallot)).toHaveBeenCalledWith(ballotProps, {});

  const mockPrintElementProps = assertDefined(
    mockOf(PrintElement).mock.lastCall
  )[0];
  expect(mockPrintElementProps.printOptions).toEqual<PrintOptions>({
    sides: 'one-sided',
  });

  return { triggerOnPrintStarted: mockPrintElementProps.onPrintStarted };
}

function expectPrintToPdf(ballotProps: BmdPaperBallotProps) {
  within(screen.getByTestId(MOCK_PRINT_TO_PDF_TEST_ID)).getByTestId(
    MOCK_PAPER_BALLOT_TEST_ID
  );
  expect(
    screen.queryByTestId(MOCK_PRINT_ELEMENT_TEST_ID)
  ).not.toBeInTheDocument();

  expect(mockOf(BmdPaperBallot)).toHaveBeenCalledWith(ballotProps, {});

  const mockPrintToPdfProps = assertDefined(
    mockOf(PrintToPdf).mock.lastCall
  )[0];

  return { triggerOnDataReady: mockPrintToPdfProps.onDataReady };
}

function mockGenerateBallotId() {
  return 'CHhgYxfN5GeqnK8KaVOt1w';
}

const BALLOT_STYLE = electionGeneral.ballotStyles[0];
const PRECINCT_ID: PrecinctId = BALLOT_STYLE.precincts[0];

const MOCK_VOTES = vote(
  getContests({
    ballotStyle: getBallotStyle({
      election: electionGeneral,
      ballotStyleId: BALLOT_STYLE.id,
    })!,
    election: electionGeneral,
  }),
  {
    president: 'barchi-hallaren',
    'question-a': ['question-a-option-no'],
    'question-b': ['question-b-option-yes'],
    'lieutenant-governor': 'norberg',
  }
);

beforeEach(() => {
  jest.clearAllMocks();
});

test('print directly to printer', () => {
  const onPrint = jest.fn();

  render(
    <PrintPage
      electionDefinition={electionGeneralDefinition}
      ballotStyleId={BALLOT_STYLE.id}
      precinctId={PRECINCT_ID}
      generateBallotId={mockGenerateBallotId}
      votes={MOCK_VOTES}
      isLiveMode={false}
      onPrint={onPrint}
      machineType="markScan"
    />
  );
  const { triggerOnPrintStarted } = expectPrintElement({
    ballotStyleId: BALLOT_STYLE.id,
    electionDefinition: electionGeneralDefinition,
    isLiveMode: false,
    machineType: 'markScan',
    precinctId: PRECINCT_ID,
    votes: MOCK_VOTES,
    generateBallotId: mockGenerateBallotId,
  });

  expect(onPrint).not.toHaveBeenCalled();

  triggerOnPrintStarted();
  expect(onPrint).toHaveBeenCalled();
});

test('print to PDF', () => {
  const onPrint = jest.fn();

  render(
    <PrintPage
      electionDefinition={electionGeneralDefinition}
      ballotStyleId={BALLOT_STYLE.id}
      precinctId={PRECINCT_ID}
      generateBallotId={mockGenerateBallotId}
      votes={MOCK_VOTES}
      isLiveMode
      onPrint={onPrint}
      printToPdf
      machineType="mark"
    />
  );

  const { triggerOnDataReady } = expectPrintToPdf({
    ballotStyleId: BALLOT_STYLE.id,
    electionDefinition: electionGeneralDefinition,
    isLiveMode: true,
    machineType: 'mark',
    precinctId: PRECINCT_ID,
    votes: MOCK_VOTES,
    generateBallotId: mockGenerateBallotId,
  });

  expect(onPrint).not.toHaveBeenCalled();

  const mockPdfData = new Uint8Array([2, 1, 1]);
  triggerOnDataReady(new Uint8Array(mockPdfData));
  expect(onPrint).toHaveBeenCalledWith(mockPdfData);
});
