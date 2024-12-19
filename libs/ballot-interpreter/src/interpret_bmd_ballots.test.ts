import { sliceBallotHashForEncoding } from '@votingworks/ballot-encoder';
import {
  DEFAULT_ELECTION_GENERAL_BALLOT_STYLE_ID,
  DEFAULT_ELECTION_GENERAL_PRECINCT_ID,
  DEFAULT_ELECTION_GENERAL_VOTES,
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
  renderBmdBallotFixture,
} from '@votingworks/bmd-ballot-fixtures';
import {
  electionFamousNames2021Fixtures,
  electionPrimaryPrecinctSplitsFixtures,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import { mockOf } from '@votingworks/test-utils';
import {
  AdjudicationReason,
  BallotStyleId,
  DEFAULT_MARK_THRESHOLDS,
  InterpretedBmdPage,
  InvalidBallotHashPage,
  PageInterpretation,
  PrecinctId,
  SheetOf,
  VotesDict,
  asSheet,
  getBallotStyle,
  getContests,
  mapSheet,
  vote,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { ImageData } from 'canvas';
import { assert } from 'node:console';
import { assertDefined } from '@votingworks/basics';
import { pdfToPageImages } from '../test/helpers/interpretation';
import { interpretSheet, interpretSimplexBmdBallot } from './interpret';
import { InterpreterOptions } from './types';
import { normalizeBallotMode } from './validation';

const electionGeneralDefinition = readElectionGeneralDefinition();

jest.mock('./validation');

beforeEach(() => {
  mockOf(normalizeBallotMode).mockImplementation((input) => input);
});

describe('adjudication reporting', () => {
  const electionDefinition = electionGeneralDefinition;
  const ballotStyleId: BallotStyleId = DEFAULT_ELECTION_GENERAL_BALLOT_STYLE_ID;
  const precinctId: PrecinctId = DEFAULT_ELECTION_GENERAL_PRECINCT_ID;

  async function renderBmdSummaryBallotPage(
    votes: VotesDict
  ): Promise<ImageData> {
    const validBmdSheet = asSheet(
      await pdfToPageImages(
        await renderBmdBallotFixture({
          electionDefinition,
          precinctId,
          ballotStyleId,
          votes,
        })
      ).toArray()
    );
    const [bmdSummaryBallotPage] = validBmdSheet;
    return bmdSummaryBallotPage;
  }

  test('correctly reports no adjudication flags', async () => {
    const bmdSummaryBallotPage = await renderBmdSummaryBallotPage(
      DEFAULT_ELECTION_GENERAL_VOTES
    );

    const result = await interpretSimplexBmdBallot(bmdSummaryBallotPage, {
      electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [
        AdjudicationReason.BlankBallot,
        AdjudicationReason.Undervote,
      ],
    });

    assert(result[0].interpretation.type === 'InterpretedBmdPage');
    const frontInterpretation = result[0].interpretation as InterpretedBmdPage;

    expect(frontInterpretation.adjudicationInfo).toEqual({
      requiresAdjudication: false,
      enabledReasonInfos: [],
      enabledReasons: ['BlankBallot', 'Undervote'],
      ignoredReasonInfos: [],
    });
  });

  test('correctly reports blank ballot adjudication flag', async () => {
    const votes: VotesDict = {};
    for (const contest of electionDefinition.election.contests) {
      votes[contest.id] = [];
    }

    const bmdSummaryBallotPage = await renderBmdSummaryBallotPage(votes);

    const result = await interpretSimplexBmdBallot(bmdSummaryBallotPage, {
      electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [
        AdjudicationReason.BlankBallot,
        AdjudicationReason.Undervote,
      ],
    });

    assert(result[0].interpretation.type === 'InterpretedBmdPage');
    const frontInterpretation = result[0].interpretation as InterpretedBmdPage;

    // The result of a blank ballot + all undervoted contests is very verbose so
    // we use a snapshot test but check for 'BlankBallot' for extra confidence.
    expect(frontInterpretation.adjudicationInfo).toMatchSnapshot();
    expect(
      frontInterpretation.adjudicationInfo.enabledReasonInfos.find(
        (info) => info.type === 'BlankBallot'
      )
    ).not.toBeUndefined();
  });

  test('ignores blank ballot adjudication flag when configured to do so', async () => {
    const votes: VotesDict = {};
    for (const contest of electionDefinition.election.contests) {
      votes[contest.id] = [];
    }

    const bmdSummaryBallotPage = await renderBmdSummaryBallotPage(votes);

    const result = await interpretSimplexBmdBallot(bmdSummaryBallotPage, {
      electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [AdjudicationReason.Undervote],
    });

    assert(result[0].interpretation.type === 'InterpretedBmdPage');
    const frontInterpretation = result[0].interpretation as InterpretedBmdPage;

    // The result of a blank ballot + all undervoted contests is very verbose so
    // we use a snapshot test but check for absence of 'BlankBallot' for extra confidence.
    expect(frontInterpretation.adjudicationInfo).toMatchSnapshot();
    expect(
      frontInterpretation.adjudicationInfo.enabledReasonInfos.find(
        (info) => info.type === 'BlankBallot'
      )
    ).toBeUndefined();
    expect(frontInterpretation.adjudicationInfo.ignoredReasonInfos).toEqual([
      { type: AdjudicationReason.BlankBallot },
    ]);
  });

  test('correctly reports undervote adjudication flag for yes-no contest', async () => {
    const contestToUndervote = 'judicial-robert-demergue';
    const votes: VotesDict = { ...DEFAULT_ELECTION_GENERAL_VOTES };
    assertDefined(
      votes[contestToUndervote],
      'Expected fixture contest not defined'
    );
    votes[contestToUndervote] = [];

    const bmdSummaryBallotPage = await renderBmdSummaryBallotPage(votes);

    const result = await interpretSimplexBmdBallot(bmdSummaryBallotPage, {
      electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [
        AdjudicationReason.BlankBallot,
        AdjudicationReason.Undervote,
      ],
    });

    assert(result[0].interpretation.type === 'InterpretedBmdPage');
    const frontInterpretation = result[0].interpretation as InterpretedBmdPage;

    expect(frontInterpretation.adjudicationInfo).toEqual({
      requiresAdjudication: true,
      enabledReasonInfos: [
        {
          contestId: contestToUndervote,
          expected: 1,
          optionIds: [],
          type: 'Undervote',
        },
      ],
      enabledReasons: ['BlankBallot', 'Undervote'],
      ignoredReasonInfos: [],
    });
  });

  test('correctly reports undervote adjudication flag for candidate contest', async () => {
    const candidateContestToUndervote = 'county-commissioners';
    const votes: VotesDict = { ...DEFAULT_ELECTION_GENERAL_VOTES };
    const contestVotes = assertDefined(
      votes[candidateContestToUndervote],
      'Expected fixture contest not defined'
    );
    assert(contestVotes.length > 2, 'Expected > 2 votes in fixture');
    const undervotes = contestVotes.slice(1);
    votes[candidateContestToUndervote] = undervotes;

    const bmdSummaryBallotPage = await renderBmdSummaryBallotPage(votes);

    const result = await interpretSimplexBmdBallot(bmdSummaryBallotPage, {
      electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [
        AdjudicationReason.BlankBallot,
        AdjudicationReason.Undervote,
      ],
    });

    assert(result[0].interpretation.type === 'InterpretedBmdPage');
    const frontInterpretation = result[0].interpretation as InterpretedBmdPage;

    expect(frontInterpretation.adjudicationInfo).toEqual({
      requiresAdjudication: true,
      enabledReasonInfos: [
        {
          contestId: candidateContestToUndervote,
          expected: 4,
          optionIds: ['witherspoonsmithson', 'bainbridge', 'hennessey'],
          type: 'Undervote',
        },
      ],
      enabledReasons: ['BlankBallot', 'Undervote'],
      ignoredReasonInfos: [],
    });
  });

  test('ignores undervote adjudication flag when configured to do so', async () => {
    const votes: VotesDict = {};
    for (const contest of electionDefinition.election.contests) {
      votes[contest.id] = [];
    }

    const bmdSummaryBallotPage = await renderBmdSummaryBallotPage(votes);

    const result = await interpretSimplexBmdBallot(bmdSummaryBallotPage, {
      electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [AdjudicationReason.BlankBallot],
    });

    assert(result[0].interpretation.type === 'InterpretedBmdPage');
    const frontInterpretation = result[0].interpretation as InterpretedBmdPage;

    // Use snapshot testing because ignoredReasonInfos for undervotes
    // on all contests is very verbose
    expect(
      frontInterpretation.adjudicationInfo.ignoredReasonInfos
    ).toMatchSnapshot();

    // Check for absence of Undervote in enabledReasonInfos for added confidence
    expect(
      frontInterpretation.adjudicationInfo.enabledReasonInfos.find(
        (info) => info.type === 'Undervote'
      )
    ).toBeUndefined();
  });

  test('test adjudication for a primary election', async () => {
    const primaryElectionDefinition =
      electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
    const { election } = primaryElectionDefinition;
    const primaryPrecinctId = 'precinct-c1-w1-1';
    const primaryBallotStyleId = '1-Ma_en' as BallotStyleId;
    const ballotStyle = getBallotStyle({
      ballotStyleId: primaryBallotStyleId,
      election,
    })!;
    const votes: VotesDict = vote(getContests({ ballotStyle, election }), {
      'county-leader-mammal': [], // undervote
      'congressional-1-mammal': ['zebra-1'],
      'water-1-fishing': ['water-1-fishing-ban-fishing'],
    });

    const validBmdSheet = asSheet(
      await pdfToPageImages(
        await renderBmdBallotFixture({
          electionDefinition: primaryElectionDefinition,
          precinctId: primaryPrecinctId,
          ballotStyleId: primaryBallotStyleId,
          votes,
        })
      ).toArray()
    );
    const [bmdSummaryBallotPage] = validBmdSheet;

    const result = await interpretSimplexBmdBallot(bmdSummaryBallotPage, {
      electionDefinition: primaryElectionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [
        AdjudicationReason.BlankBallot,
        AdjudicationReason.Undervote,
      ],
    });

    assert(result[0].interpretation.type === 'InterpretedBmdPage');
    const frontInterpretation = result[0].interpretation as InterpretedBmdPage;

    expect(frontInterpretation.adjudicationInfo).toEqual({
      requiresAdjudication: true,
      enabledReasonInfos: [
        {
          contestId: 'county-leader-mammal',
          expected: 1,
          optionIds: [],
          type: 'Undervote',
        },
      ],
      enabledReasons: ['BlankBallot', 'Undervote'],
      ignoredReasonInfos: [],
    });
  });
});

describe('VX BMD interpretation', () => {
  // These tests are specifically intended to test with an election without grid layouts.
  const fixtures = electionFamousNames2021Fixtures.baseElection_DEPRECATED;
  const electionDefinition = fixtures.readElectionDefinition();
  const ballotStyleId: BallotStyleId = DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID;
  const precinctId: PrecinctId = DEFAULT_FAMOUS_NAMES_PRECINCT_ID;

  let bmdSummaryBallotPage: ImageData;
  let bmdBlankPage: ImageData;
  let validBmdSheet: SheetOf<ImageData>;

  beforeAll(async () => {
    validBmdSheet = asSheet(
      await pdfToPageImages(
        await renderBmdBallotFixture({
          electionDefinition,
          precinctId,
          ballotStyleId,
          votes: DEFAULT_FAMOUS_NAMES_VOTES,
        })
      ).toArray()
    );
    [bmdSummaryBallotPage, bmdBlankPage] = validBmdSheet;
  });

  test('extracts votes encoded in a QR code', async () => {
    const result = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      validBmdSheet
    );
    expect(
      mapSheet(result, ({ interpretation }) => interpretation)
    ).toMatchSnapshot();
  });

  test('properly detects test ballot in live mode', async () => {
    const interpretationResult = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: false, // this is the test mode
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      validBmdSheet
    );

    expect(interpretationResult[0].interpretation.type).toEqual(
      'InvalidTestModePage'
    );
  });

  test('properly detects bmd ballot with wrong precinct', async () => {
    const interpretationResult = await interpretSheet(
      {
        electionDefinition,
        testMode: true,
        precinctSelection: singlePrecinctSelectionFor('20'),
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      validBmdSheet
    );

    expect(interpretationResult[0].interpretation.type).toEqual(
      'InvalidPrecinctPage'
    );
  });

  test('properly detects bmd ballot with correct precinct', async () => {
    const interpretationResult = await interpretSheet(
      {
        electionDefinition,
        testMode: true,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      validBmdSheet
    );

    expect(interpretationResult[0].interpretation.type).toEqual(
      'InterpretedBmdPage'
    );
  });

  test('properly detects a ballot with incorrect ballot hash', async () => {
    const interpretationResult = await interpretSheet(
      {
        electionDefinition: {
          ...electionGeneralDefinition,
          ballotHash: 'd34db33f',
        },
        testMode: true,
        precinctSelection: singlePrecinctSelectionFor(precinctId),
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      validBmdSheet
    );

    expect(
      interpretationResult[0].interpretation
    ).toEqual<InvalidBallotHashPage>({
      type: 'InvalidBallotHashPage',
      actualBallotHash: sliceBallotHashForEncoding(
        electionDefinition.ballotHash
      ),
      expectedBallotHash: 'd34db33f',
    });
  });

  test('properly identifies blank sheets', async () => {
    const interpretationResult = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      [bmdBlankPage, bmdBlankPage]
    );

    expect(interpretationResult[0].interpretation.type).toEqual('BlankPage');
    expect(interpretationResult[1].interpretation.type).toEqual('BlankPage');
  });

  test('treats sheets with multiple QR codes as unreadable', async () => {
    const interpretationResult = await interpretSheet(
      {
        electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      },
      [bmdSummaryBallotPage, bmdSummaryBallotPage]
    );

    expect(interpretationResult[0].interpretation.type).toEqual(
      'UnreadablePage'
    );
    expect(interpretationResult[1].interpretation.type).toEqual(
      'UnreadablePage'
    );
  });

  test('interpretSimplexBmdBallot', async () => {
    const result = await interpretSimplexBmdBallot(bmdSummaryBallotPage, {
      electionDefinition,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [],
    });
    expect(
      mapSheet(result, ({ interpretation }) => interpretation)
    ).toMatchSnapshot();
  });

  test('normalizes ballot modes', async () => {
    const options: InterpreterOptions = {
      adjudicationReasons: [],
      allowOfficialBallotsInTestMode: true,
      electionDefinition,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      precinctSelection: singlePrecinctSelectionFor(precinctId),
      testMode: true,
    };

    const blankPageInterpretation: PageInterpretation = { type: 'BlankPage' };
    mockOf(normalizeBallotMode).mockImplementation(
      (_input, interpreterOptions) => {
        expect(interpreterOptions).toEqual(options);

        return blankPageInterpretation;
      }
    );

    const interpretationResult = await interpretSheet(options, validBmdSheet);
    expect(interpretationResult[0].interpretation).toEqual(
      blankPageInterpretation
    );
  });
});
