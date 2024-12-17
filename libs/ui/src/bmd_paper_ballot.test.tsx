import {
  BallotStyleId,
  BallotType,
  Candidate,
  CandidateContest,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  PrecinctId,
  vote,
} from '@votingworks/types';
import {
  readElectionGeneralDefinition,
  readElectionTwoPartyPrimaryDefinition,
  readElectionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';

import { encodeBallot } from '@votingworks/ballot-encoder';
import { hasTextAcrossElements, mockOf } from '@votingworks/test-utils';
import { fromByteArray } from 'base64-js';
import { assertDefined, find } from '@votingworks/basics';
import { render, screen } from '../test/react_testing_library';
import {
  ORDERED_BMD_BALLOT_LAYOUTS,
  MachineType,
  BmdPaperBallot,
  MAX_MARK_SCAN_TOP_MARGIN,
  BmdBallotSheetSize,
  Layout,
  getLayout,
  NoLayoutOptionError,
} from './bmd_paper_ballot';
import * as QrCodeModule from './qrcode';

const electionGeneralDefinition = readElectionGeneralDefinition();
const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();
const electionWithMsEitherNeitherDefinition =
  readElectionWithMsEitherNeitherDefinition();

jest.mock('@votingworks/ballot-encoder', () => ({
  ...jest.requireActual('@votingworks/ballot-encoder'),
  // mock encoded ballot so BMD ballot QR code does not change with every change to election definition
  encodeBallot: jest.fn(),
}));

const encodeBallotMock = mockOf(encodeBallot);
const mockEncodedBallotData = new Uint8Array([0, 1, 2, 3]);

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  const original =
    jest.requireActual<typeof import('@votingworks/utils')>(
      '@votingworks/utils'
    );
  // Mock random string generation so that snapshots match, while leaving the rest of the module
  // intact
  return {
    ...original,
    randomBallotId: () => 'CHhgYxfN5GeqnK8KaVOt1w',
  };
});

beforeEach(() => {
  encodeBallotMock.mockReset();
  encodeBallotMock.mockReturnValue(mockEncodedBallotData);
});

function renderBmdPaperBallot({
  electionDefinition,
  ballotStyleId,
  precinctId,
  votes,
  isLiveMode = false,
  onRendered,
  machineType = 'mark',
  sheetSize,
  layout,
}: {
  electionDefinition: ElectionDefinition;
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  votes: { [key: string]: string | string[] | Candidate };
  isLiveMode?: boolean;
  onRendered?: () => void;
  machineType?: MachineType;
  sheetSize?: BmdBallotSheetSize;
  layout?: Layout;
}) {
  return render(
    <BmdPaperBallot
      ballotStyleId={ballotStyleId}
      electionDefinition={electionDefinition}
      isLiveMode={isLiveMode}
      precinctId={precinctId}
      votes={vote(
        getContests({
          ballotStyle: getBallotStyle({
            ballotStyleId,
            election: electionDefinition.election,
          })!,
          election: electionDefinition.election,
        }),
        votes
      )}
      onRendered={onRendered}
      machineType={machineType}
      sheetSize={sheetSize}
      layout={layout}
    />
  );
}

test('BmdPaperBallot renders votes for candidate contests and yes-no contests', () => {
  renderBmdPaperBallot({
    electionDefinition: electionGeneralDefinition,
    ballotStyleId: '5' as BallotStyleId,
    precinctId: '21',
    votes: {
      president: 'barchi-hallaren',
      'lieutenant-governor': 'norberg',
      'question-a': ['question-a-option-yes'],
      'question-b': ['question-b-option-no'],
    },
  });

  screen.getByText('Joseph Barchi and Joseph Hallaren');
  screen.getByText('Chris Norberg');
  screen.getByText(
    hasTextAcrossElements(/Question A: Recovery of Property Damages.?Yes/)
  );
  screen.getByText(
    hasTextAcrossElements(/Question B: Separation of Powers.?No/)
  );
});

test('BmdPaperBallot uses yes/no option labels if present', () => {
  renderBmdPaperBallot({
    electionDefinition: electionTwoPartyPrimaryDefinition,
    ballotStyleId: '1M' as BallotStyleId,
    precinctId: 'precinct-1',
    votes: {
      'new-zoo-either': ['new-zoo-either-approved'],
      'new-zoo-pick': ['new-zoo-traditional'],
    },
  });

  screen.getByText(
    hasTextAcrossElements(
      /Ballot Measure 1.?FOR APPROVAL OF EITHER Initiative No. 12 OR Alternative Initiative No. 12 A/
    )
  );
  screen.getByText(
    hasTextAcrossElements(/Ballot Measure 1.?FOR Alternative Measure No. 12 A/)
  );
});

test('BmdPaperBallot renders when no votes', () => {
  renderBmdPaperBallot({
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1' as BallotStyleId,
    precinctId: '6525',
    votes: {},
  });

  expect(screen.getAllByText(/no selection/i)).toHaveLength(9);
});

test('BmdPaperBallot accepts a layout override', () => {
  const ballot = renderBmdPaperBallot({
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1' as BallotStyleId,
    precinctId: '6525',
    votes: {},
    layout: ORDERED_BMD_BALLOT_LAYOUTS.markScan[3],
  });

  expect(ballot).toMatchSnapshot();
});

test('BmdPaperBallot treats missing entries in the votes dict as undervotes', () => {
  render(
    <BmdPaperBallot
      electionDefinition={electionWithMsEitherNeitherDefinition}
      ballotStyleId={'1' as BallotStyleId}
      precinctId="6525"
      isLiveMode
      votes={{}}
      machineType="markScan"
    />
  );

  expect(screen.getAllByText(/no selection/i)).toHaveLength(9);
});

test('BmdPaperBallot renders when not in live mode', () => {
  renderBmdPaperBallot({
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1' as BallotStyleId,
    precinctId: '6525',
    votes: {},
    isLiveMode: false,
  });

  screen.getByText('Unofficial Test Ballot');
  expect(screen.queryByText('Official Ballot')).not.toBeInTheDocument();
});

test('BmdPaperBallot renders when in live mode', () => {
  renderBmdPaperBallot({
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1' as BallotStyleId,
    precinctId: '6525',
    votes: {},
    isLiveMode: true,
  });

  screen.getByText('Official Ballot');
  expect(screen.queryByText('Unofficial Test Ballot')).not.toBeInTheDocument();
});

test('BmdPaperBallot renders votes for write-in candidates', () => {
  renderBmdPaperBallot({
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1' as BallotStyleId,
    precinctId: '6525',
    votes: {
      '775020876': {
        id: 'write-in-0',
        isWriteIn: true,
        name: 'HOT DOG',
      },
    },
  });

  screen.getByText('HOT DOG');
  screen.getByText('(write-in)');
});

test('BmdPaperBallot renders remaining choices for multi-seat contests', () => {
  renderBmdPaperBallot({
    electionDefinition: electionGeneralDefinition,
    ballotStyleId: '12' as BallotStyleId,
    precinctId: '23',
    votes: {
      'city-council': ['eagle', 'smith'],
    },
  });

  screen.getByText(hasTextAcrossElements(/unused votes: 1/i));
});

test('BmdPaperBallot renders seal', () => {
  renderBmdPaperBallot({
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1' as BallotStyleId,
    precinctId: '6525',
    votes: {},
  });

  screen.getByTestId('seal');
});

test('BmdPaperBallot passes expected data to encodeBallot for use in QR code', () => {
  const QrCodeSpy = jest.spyOn(QrCodeModule, 'QrCode');

  renderBmdPaperBallot({
    electionDefinition: electionGeneralDefinition,
    ballotStyleId: '5' as BallotStyleId,
    precinctId: '21',
    votes: {
      president: 'barchi-hallaren',
      'lieutenant-governor': 'norberg',
      'question-a': ['question-a-option-yes'],
      'question-b': ['question-b-option-no'],
    },
  });

  expect(encodeBallot).toBeCalledWith(
    electionGeneralDefinition.election,
    expect.objectContaining({
      ballotStyleId: '5' as BallotStyleId,
      precinctId: '21',
      ballotType: BallotType.Precinct,
      ballotHash: electionGeneralDefinition.ballotHash,
      isTestMode: true,
      votes: expect.objectContaining({
        president: [expect.objectContaining({ id: 'barchi-hallaren' })],
        'lieutenant-governor': [expect.objectContaining({ id: 'norberg' })],
        'question-a': ['question-a-option-yes'],
        'question-b': ['question-b-option-no'],
      }),
    })
  );

  expect(QrCodeSpy).toBeCalledWith(
    expect.objectContaining({
      value: fromByteArray(mockEncodedBallotData),
    }),
    expect.anything()
  );
});

test('BmdPaperBallot renders a large top margin for VxMarkScan prints', () => {
  renderBmdPaperBallot({
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1' as BallotStyleId,
    precinctId: '6525',
    votes: {},
    machineType: 'markScan',
  });

  const header = screen.getByTestId('header');
  expect(header).toHaveStyle(`margin-top: ${MAX_MARK_SCAN_TOP_MARGIN}`);
});

test('BmdPaperBallot does not render a large top margin for VxMark prints', () => {
  renderBmdPaperBallot({
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1' as BallotStyleId,
    precinctId: '6525',
    votes: {},
  });

  const header = screen.getByTestId('header');
  expect(header).not.toHaveStyle(`margin-top: 1.75in`);
});

test('BMD_BALLOT_LAYOUTS is properly defined', () => {
  // Expect no repeated contest thresholds:
  expect([
    ...new Set(ORDERED_BMD_BALLOT_LAYOUTS.markScan.map((l) => l.minContests)),
  ]).toHaveLength(ORDERED_BMD_BALLOT_LAYOUTS.markScan.length);
  expect([
    ...new Set(ORDERED_BMD_BALLOT_LAYOUTS.mark.map((l) => l.minContests)),
  ]).toHaveLength(ORDERED_BMD_BALLOT_LAYOUTS.mark.length);

  // Should be defined in order of increasing contest thresholds:
  expect(ORDERED_BMD_BALLOT_LAYOUTS.markScan).toEqual(
    [...ORDERED_BMD_BALLOT_LAYOUTS.markScan].sort(
      (a, b) => a.minContests - b.minContests
    )
  );
  expect(ORDERED_BMD_BALLOT_LAYOUTS.mark).toEqual(
    [...ORDERED_BMD_BALLOT_LAYOUTS.mark].sort(
      (a, b) => a.minContests - b.minContests
    )
  );

  // Should an entry with a threshold of 0 contests for each print type:
  expect(ORDERED_BMD_BALLOT_LAYOUTS.markScan[0].minContests).toEqual(0);
  expect(ORDERED_BMD_BALLOT_LAYOUTS.mark[0].minContests).toEqual(0);

  // Expect top margins only for MarkScan prints:
  expect(
    ORDERED_BMD_BALLOT_LAYOUTS.markScan.every((l) => l.topMargin !== undefined)
  ).toEqual(true);
  expect(
    ORDERED_BMD_BALLOT_LAYOUTS.mark.every((l) => l.topMargin === undefined)
  ).toEqual(true);
});

describe('candidate party names', () => {
  const { election } = electionGeneralDefinition;
  const baseTestContest = find(
    election.contests,
    (c): c is CandidateContest => c.type === 'candidate'
  );

  function renderWithGeneratedContests(params: { numContests: number }) {
    const { numContests } = params;

    const contests = Array.from<CandidateContest>({ length: numContests }).map(
      (_unused, index) => ({ ...baseTestContest, id: `contest-${index}` })
    );

    const chosenCandidate = assertDefined(contests[0].candidates[0]);
    const chosenCandidatePartyName = find(
      election.parties,
      (p) => p.id === chosenCandidate.partyIds![0]
    ).name;

    const result = renderBmdPaperBallot({
      electionDefinition: {
        ...electionGeneralDefinition,
        election: { ...election, contests },
      },
      ballotStyleId: '5' as BallotStyleId,
      precinctId: '21',
      votes: { [contests[0].id]: [chosenCandidate.id] },
    });

    return { result, chosenCandidatePartyName };
  }

  test('renders party names in low-density layouts', () => {
    const { chosenCandidatePartyName } = renderWithGeneratedContests({
      numContests: 10,
    });

    screen.getByText(chosenCandidatePartyName);
  });

  test('omits party names in high-density layouts', () => {
    const { chosenCandidatePartyName } = renderWithGeneratedContests({
      numContests: 30,
    });

    expect(
      screen.queryByText(chosenCandidatePartyName)
    ).not.toBeInTheDocument();
  });
});

interface GetLayoutTestSpec {
  description: string;
  electionDef: ElectionDefinition;
  ballotStyleId: BallotStyleId;
  machineType: MachineType;
  offset?: number;
  expectation: Layout | NoLayoutOptionError;
}
describe('getLayout', () => {
  function isLayout(value: unknown): value is Layout {
    return Object.hasOwn(value as object, 'minContests');
  }

  const testSpecs: GetLayoutTestSpec[] = [
    {
      description: 'no offset',
      electionDef: electionGeneralDefinition,
      ballotStyleId: electionGeneralDefinition.election.ballotStyles[0].id,
      machineType: 'markScan',
      offset: 0,
      expectation: {
        minContests: 0,
        maxRows: 7,
        hideParties: false,
        topMargin: '1.75in',
      },
    },
    {
      description: 'valid offset',
      electionDef: electionGeneralDefinition,
      ballotStyleId: electionGeneralDefinition.election.ballotStyles[0].id,
      machineType: 'markScan',
      offset: 1,
      expectation: {
        minContests: 25,
        maxRows: 8,
        hideParties: true,
        topMargin: '0.5625in',
      },
    },
    {
      description: 'offset out of bounds',
      electionDef: electionGeneralDefinition,
      ballotStyleId: electionGeneralDefinition.election.ballotStyles[0].id,
      machineType: 'markScan',
      offset: 21,
      expectation: new NoLayoutOptionError(20, 21, 'markScan'),
    },
  ];

  test.each(testSpecs)(
    '$machineType: $description',
    ({ electionDef, ballotStyleId, machineType, offset, expectation }) => {
      const layoutResult = getLayout(
        machineType,
        ballotStyleId,
        electionDef,
        offset
      );

      if (isLayout(expectation)) {
        expect(layoutResult.unsafeUnwrap()).toEqual(expectation);
      } else {
        expect(layoutResult.err()).toEqual(expectation);
      }
    }
  );
});
