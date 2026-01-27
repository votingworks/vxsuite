import { beforeEach, describe, expect, test, vi } from 'vitest';
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
  electionPrimaryPrecinctSplitsFixtures,
  electionFamousNames2021Fixtures,
} from '@votingworks/fixtures';

import { encodeBallot } from '@votingworks/ballot-encoder';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { fromByteArray } from 'base64-js';
import { assertDefined, find } from '@votingworks/basics';
import { render, screen, within } from '../test/react_testing_library';
import {
  ORDERED_BMD_BALLOT_LAYOUTS,
  MachineType,
  BmdPaperBallot,
  MAX_MARK_SCAN_TOP_MARGIN,
  BmdBallotSheetSize,
  Layout,
  getLayout,
  NoLayoutOptionError,
  MAX_WRITE_IN_CHARS_FOR_HIGH_DENSITY_QR,
  splitContestsForPages,
  needsMultiplePages,
  filterVotesForContests,
  MAX_CONTESTS_PER_MULTI_PAGE_BALLOT_PAGE,
} from './bmd_paper_ballot';
import * as QrCodeModule from './qrcode';

const electionGeneralDefinition = readElectionGeneralDefinition();
const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();
const electionPrimaryPrecinctSplitsDefinition =
  electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
const electionWithMsEitherNeitherDefinition =
  readElectionWithMsEitherNeitherDefinition();
const electionFamousNamesDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

vi.mock(import('@votingworks/ballot-encoder'), async (importActual) => ({
  ...(await importActual()),
  // mock encoded ballot so BMD ballot QR code does not change with every change to election definition
  encodeBallot: vi.fn(),
}));

const encodeBallotMock = vi.mocked(encodeBallot);
const mockEncodedBallotData = new Uint8Array([0, 1, 2, 3]);

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

test('BmdPaperBallot includes ballot style and language metadata - general election', () => {
  renderBmdPaperBallot({
    electionDefinition: electionGeneralDefinition,
    ballotStyleId: '5' as BallotStyleId,
    precinctId: '21',
    votes: {},
  });
  within(
    screen.getByText('Ballot Style').parentElement!.parentElement!
  ).getByText('North Springfield - Split 1');
  within(screen.getByText('Language').parentElement!.parentElement!).getByText(
    'English'
  );
});

test('BmdPaperBallot includes ballot style and language metadata - primary election', () => {
  renderBmdPaperBallot({
    electionDefinition: electionPrimaryPrecinctSplitsDefinition,
    ballotStyleId: '1-Ma_es-US' as BallotStyleId,
    precinctId: 'precinct-c1-w1-1',
    votes: {},
  });
  within(
    screen.getByText('Ballot Style').parentElement!.parentElement!
  ).getByText(hasTextAcrossElements('Precinct 1 - Mammal'));
  within(screen.getByText('Language').parentElement!.parentElement!).getByText(
    'Spanish (US)'
  );
});

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
      /Ballot Measure 1 - Part 1.?FOR APPROVAL OF EITHER Initiative No. 12 OR Alternative Initiative No. 12 A/
    )
  );
  screen.getByText(
    hasTextAcrossElements(
      /Ballot Measure 1 - Part 2.?FOR Alternative Measure No. 12 A/
    )
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

test('BmdPaperBallot renders choices for multi-seat contests in rotated ballot style order', () => {
  renderBmdPaperBallot({
    electionDefinition: electionFamousNamesDefinition,
    ballotStyleId: '1-1' as BallotStyleId,
    precinctId: '20',
    votes: {
      'board-of-alderman': [
        'wolfgang-amadeus-mozart',
        'nikola-tesla',
        'pablo-picasso',
      ],
    },
  });
  const candidateElements = screen.getAllByText(
    /Wolfgang Amadeus Mozart|Nikola Tesla|Pablo Picasso/
  );

  // Verify the candidates appear in the rotated ballot style order
  expect(candidateElements[0]).toHaveTextContent('Nikola Tesla');
  expect(candidateElements[1]).toHaveTextContent('Pablo Picasso');
  expect(candidateElements[2]).toHaveTextContent('Wolfgang Amadeus Mozart');
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
  const QrCodeSpy = vi.spyOn(QrCodeModule, 'QrCode');

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
    expect.objectContaining<QrCodeModule.QrCodeProps>({
      level: 'H',
      value: fromByteArray(mockEncodedBallotData),
    }),
    expect.anything()
  );
});

test('reduces QR code error correction for lots of write-ins', () => {
  const QrCodeSpy = vi.spyOn(QrCodeModule, 'QrCode');
  const minCombinedChars = MAX_WRITE_IN_CHARS_FOR_HIGH_DENSITY_QR;

  const { contests } = electionGeneralDefinition.election;
  const votes: { [key: string]: Candidate } = {};

  let totalWriteInChars = 0;
  for (const contest of contests) {
    if (contest.type !== 'candidate' || !contest.allowWriteIns) continue;

    votes[contest.id] = {
      name: 'A'.repeat(40),
      id: `${contest.id}-writein`,
      isWriteIn: true,
    };

    totalWriteInChars += 40;
    if (totalWriteInChars > minCombinedChars) break;
  }

  expect(totalWriteInChars).toBeGreaterThan(minCombinedChars);

  renderBmdPaperBallot({
    electionDefinition: electionGeneralDefinition,
    ballotStyleId: '12' as BallotStyleId,
    precinctId: '21',
    votes,
  });

  expect(QrCodeSpy).toBeCalledWith(
    expect.objectContaining<QrCodeModule.QrCodeProps>({
      level: 'M',
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

describe('splitContestsForPages', () => {
  const { election } = electionGeneralDefinition;
  const allContests = election.contests;

  test('returns single page for empty contests', () => {
    const pages = splitContestsForPages([] as unknown as typeof allContests);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(0);
  });

  test('returns single page when contests fit within limit', () => {
    const fewContests = allContests.slice(0, 5) as typeof allContests;
    const pages = splitContestsForPages(fewContests);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toEqual(fewContests);
  });

  test('returns single page when contests exactly equal custom limit', () => {
    const exactContests = allContests.slice(0, 10) as typeof allContests;
    const pages = splitContestsForPages(exactContests, 10);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(10);
  });

  test('splits contests into multiple pages when exceeding limit', () => {
    // Use a small limit for testing
    const contests = allContests.slice(0, 10) as typeof allContests;
    const pages = splitContestsForPages(contests, 3);
    expect(pages).toHaveLength(4); // 10 contests / 3 per page = 4 pages
    expect(pages[0]).toHaveLength(3);
    expect(pages[1]).toHaveLength(3);
    expect(pages[2]).toHaveLength(3);
    expect(pages[3]).toHaveLength(1);
  });

  test('preserves contest order across pages', () => {
    const contests = allContests.slice(0, 6) as typeof allContests;
    const pages = splitContestsForPages(contests, 2);
    expect(pages[0][0].id).toEqual(contests[0].id);
    expect(pages[0][1].id).toEqual(contests[1].id);
    expect(pages[1][0].id).toEqual(contests[2].id);
    expect(pages[1][1].id).toEqual(contests[3].id);
    expect(pages[2][0].id).toEqual(contests[4].id);
    expect(pages[2][1].id).toEqual(contests[5].id);
  });
});

describe('needsMultiplePages', () => {
  const { election } = electionGeneralDefinition;
  const allContests = election.contests;

  test('returns false for empty contests', () => {
    expect(needsMultiplePages([] as unknown as typeof allContests)).toEqual(
      false
    );
  });

  test('returns false when contests fit within limit', () => {
    const fewContests = allContests.slice(0, 5) as typeof allContests;
    expect(needsMultiplePages(fewContests)).toEqual(false);
  });

  test('returns false when contests exactly equal custom limit', () => {
    const exactContests = allContests.slice(0, 10) as typeof allContests;
    expect(needsMultiplePages(exactContests, 10)).toEqual(false);
  });

  test('returns true when contests exceed limit', () => {
    // Use a small limit for testing
    const contests = allContests.slice(0, 10) as typeof allContests;
    expect(needsMultiplePages(contests, 5)).toEqual(true);
  });

  test('returns true when contests exceed default limit', () => {
    // Create more contests than the default limit
    const manyContests = Array.from(
      { length: MAX_CONTESTS_PER_MULTI_PAGE_BALLOT_PAGE + 1 },
      (_, i) => ({ ...allContests[0], id: `contest-${i}` })
    ) as typeof allContests;
    expect(needsMultiplePages(manyContests)).toEqual(true);
  });
});

describe('filterVotesForContests', () => {
  const { election } = electionGeneralDefinition;
  const allContests = election.contests;

  test('returns empty object for empty votes', () => {
    const filtered = filterVotesForContests({}, allContests);
    expect(filtered).toEqual({});
  });

  test('returns empty object when no contests match', () => {
    const votes = { 'non-existent-contest': ['option-1'] } as const;
    const filtered = filterVotesForContests(
      votes,
      allContests.slice(0, 2) as typeof allContests
    );
    expect(filtered).toEqual({});
  });

  test('filters votes to only include matching contests', () => {
    const contestSubset = allContests.slice(0, 2) as typeof allContests;
    const votes = {
      [contestSubset[0].id]: ['option-1'],
      [contestSubset[1].id]: ['option-2'],
      [allContests[3].id]: ['option-3'], // This should be filtered out
    } as const;
    const filtered = filterVotesForContests(votes, contestSubset);
    expect(Object.keys(filtered)).toHaveLength(2);
    expect(filtered[contestSubset[0].id]).toEqual(['option-1']);
    expect(filtered[contestSubset[1].id]).toEqual(['option-2']);
    expect(filtered[allContests[3].id]).toBeUndefined();
  });

  test('preserves vote values when filtering', () => {
    const contest = allContests[0];
    const votes = {
      [contest.id]: [
        { id: 'candidate-1', name: 'Candidate One' },
        { id: 'candidate-2', name: 'Candidate Two' },
      ],
    } as const;
    const filtered = filterVotesForContests(votes, [
      contest,
    ] as typeof allContests);
    expect(filtered[contest.id]).toEqual(votes[contest.id]);
  });

  test('handles empty contests array', () => {
    const votes = { [allContests[0].id]: ['option-1'] } as const;
    const filtered = filterVotesForContests(
      votes,
      [] as unknown as typeof allContests
    );
    expect(filtered).toEqual({});
  });
});
