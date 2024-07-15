import { sliceElectionHash } from '@votingworks/ballot-encoder';
import {
  electionFamousNames2021Fixtures,
  electionGeneralDefinition,
} from '@votingworks/fixtures';
import { mockOf } from '@votingworks/test-utils';
import {
  BallotStyleId,
  DEFAULT_MARK_THRESHOLDS,
  InvalidBallotHashPage,
  PageInterpretation,
  PrecinctId,
  SheetOf,
  asSheet,
  mapSheet,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import {
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
  renderBmdBallotFixture,
} from '@votingworks/bmd-ballot-fixtures';
import { pdfToPageImagePaths } from '../test/helpers/interpretation';
import {
  interpretSheet,
  interpretSimplexBmdBallotFromFilepath,
} from './interpret';
import { InterpreterOptions } from './types';
import { normalizeBallotMode } from './validation';

jest.mock('./validation');

beforeEach(() => {
  mockOf(normalizeBallotMode).mockImplementation((input) => input);
});

describe('VX BMD interpretation', () => {
  const fixtures = electionFamousNames2021Fixtures;
  const { electionDefinition } = fixtures;
  const ballotStyleId: BallotStyleId = DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID;
  const precinctId: PrecinctId = DEFAULT_FAMOUS_NAMES_PRECINCT_ID;

  let bmdSummaryBallotPage: string;
  let bmdBlankPage: string;
  let validBmdSheet: SheetOf<string>;

  beforeAll(async () => {
    validBmdSheet = asSheet(
      await pdfToPageImagePaths(
        await renderBmdBallotFixture({
          electionDefinition:
            electionFamousNames2021Fixtures.electionDefinition,
          precinctId,
          ballotStyleId,
          votes: DEFAULT_FAMOUS_NAMES_VOTES,
        })
      )
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

  test('properly detects a ballot with incorrect election hash', async () => {
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
      actualBallotHash: sliceElectionHash(electionDefinition.ballotHash),
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

  test('interpretSimplexBmdBallotFromFilepath', async () => {
    const result = await interpretSimplexBmdBallotFromFilepath(
      bmdSummaryBallotPage,
      {
        electionDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: true,
        markThresholds: DEFAULT_MARK_THRESHOLDS,
        adjudicationReasons: [],
      }
    );
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
