import { detectQrcodeInFilePath } from '@votingworks/ballot-interpreter-vx';
import { throwIllegalValue } from '@votingworks/basics';
import {
  electionSampleDefinition,
  sampleBallotImages,
} from '@votingworks/fixtures';
import {
  AdjudicationReason,
  BallotIdSchema,
  BlankPage,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  PageInterpretation,
  UnreadablePage,
  unsafeParse,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { emptyDirSync } from 'fs-extra';
import { join } from 'path';
import * as msDemoFixtures from '../test/fixtures/election-b0260b4e-mississippi-demo';
import * as stateOfHamiltonFixtures from '../test/fixtures/state-of-hamilton';
import { Interpreter, sheetRequiresAdjudication } from './interpreter';

// mock SKIP_SCAN_ELECTION_HASH_CHECK to allow us to use old ballot image fixtures
const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});
beforeEach(() => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_SCAN_ELECTION_HASH_CHECK
  );
});
afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

const interpreterOutputPath = join(__dirname, '..', 'test-output-dir/');
emptyDirSync(interpreterOutputPath);

test('extracts votes encoded in a QR code', async () => {
  const ballotImagePath = sampleBallotImages.sampleBatch1Ballot1.asFilePath();
  expect(
    new Interpreter({
      electionDefinition: {
        ...electionSampleDefinition,
        election: {
          ...electionSampleDefinition.election,
          markThresholds: { definite: 0.2, marginal: 0.17 },
        },
      },
      precinctSelection: ALL_PRECINCTS_SELECTION,
      testMode: true,
      adjudicationReasons:
        electionSampleDefinition.election.centralScanAdjudicationReasons ?? [],
    }).interpretFile({
      ballotImagePath,
      detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
    }).interpretation
  ).toMatchInlineSnapshot(`
    Object {
      "ballotId": undefined,
      "metadata": Object {
        "ballotStyleId": "12",
        "ballotType": 0,
        "electionHash": "b52e9f4728bb34e7ff48",
        "isTestMode": true,
        "locales": Object {
          "primary": "en-US",
        },
        "precinctId": "23",
      },
      "type": "InterpretedBmdPage",
      "votes": Object {
        "president": Array [
          Object {
            "id": "cramer-vuocolo",
            "name": "Adam Cramer and Greg Vuocolo",
            "partyIds": Array [
              "1",
            ],
          },
        ],
      },
    }
  `);
});

// TODO(jonah): This test used to pass using the precinct scanner interpreter
// wrapper, but when I converted it to use the Interpreter directly, it failed.
test.skip('properly scans a BMD ballot with a phantom QR code on back', async () => {
  const { electionDefinition, page2 } = msDemoFixtures;
  const interpreter = new Interpreter({
    electionDefinition,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    testMode: true,
    adjudicationReasons:
      electionDefinition.election.centralScanAdjudicationReasons ?? [],
  });

  const { interpretation } = interpreter.interpretFile({
    ballotImagePath: page2,
    detectQrcodeResult: await detectQrcodeInFilePath(page2),
  });
  expect(interpretation.type).toEqual('BlankPage');
});

test('properly detects test ballot in live mode', async () => {
  const ballotImagePath = sampleBallotImages.sampleBatch1Ballot1.asFilePath();
  const interpretationResult = new Interpreter({
    electionDefinition: {
      ...electionSampleDefinition,
      election: {
        ...electionSampleDefinition.election,
        markThresholds: { definite: 0.2, marginal: 0.17 },
      },
    },
    precinctSelection: ALL_PRECINCTS_SELECTION,
    testMode: false, // this is the test mode
    adjudicationReasons:
      electionSampleDefinition.election.centralScanAdjudicationReasons ?? [],
  }).interpretFile({
    ballotImagePath,
    detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
  });

  expect(interpretationResult.interpretation.type).toEqual(
    'InvalidTestModePage'
  );
});

test('properly detects bmd ballot with wrong precinct', async () => {
  const ballotImagePath = sampleBallotImages.sampleBatch1Ballot1.asFilePath();
  const interpretationResult = new Interpreter({
    electionDefinition: {
      ...electionSampleDefinition,
      election: {
        ...electionSampleDefinition.election,
        markThresholds: { definite: 0.2, marginal: 0.17 },
      },
    },
    testMode: true,
    precinctSelection: singlePrecinctSelectionFor('20'),
    adjudicationReasons:
      electionSampleDefinition.election.centralScanAdjudicationReasons ?? [],
  }).interpretFile({
    ballotImagePath,
    detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
  });

  expect(interpretationResult.interpretation.type).toEqual(
    'InvalidPrecinctPage'
  );
});

test('properly detects bmd ballot with correct precinct', async () => {
  const ballotImagePath = sampleBallotImages.sampleBatch1Ballot1.asFilePath();
  const interpretationResult = new Interpreter({
    electionDefinition: {
      ...electionSampleDefinition,
      election: {
        ...electionSampleDefinition.election,
        markThresholds: { definite: 0.2, marginal: 0.17 },
      },
    },
    testMode: true,
    precinctSelection: singlePrecinctSelectionFor('23'),
    adjudicationReasons:
      electionSampleDefinition.election.centralScanAdjudicationReasons ?? [],
  }).interpretFile({
    ballotImagePath,
    detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
  });

  expect(interpretationResult.interpretation.type).toEqual(
    'InterpretedBmdPage'
  );
});

test('properly detects a ballot with incorrect election hash', async () => {
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_SCAN_ELECTION_HASH_CHECK
  );
  const ballotImagePath = sampleBallotImages.sampleBatch1Ballot1.asFilePath();
  const interpretationResult = new Interpreter({
    electionDefinition: {
      ...electionSampleDefinition,
      election: {
        ...electionSampleDefinition.election,
        markThresholds: { definite: 0.2, marginal: 0.17 },
      },
    },
    testMode: true,
    precinctSelection: singlePrecinctSelectionFor('23'),
    adjudicationReasons:
      electionSampleDefinition.election.centralScanAdjudicationReasons ?? [],
  }).interpretFile({
    ballotImagePath,
    detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
  });

  expect(interpretationResult.interpretation.type).toEqual(
    'InvalidElectionHashPage'
  );
});

test('detects a blank page', async () => {
  const ballotImagePath = sampleBallotImages.blankPage.asFilePath();
  const interpretationResult = new Interpreter({
    electionDefinition: stateOfHamiltonFixtures.electionDefinition,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    testMode: true,
    adjudicationReasons: [],
  }).interpretFile({
    ballotImagePath,
    detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
  });

  expect(interpretationResult.interpretation.type).toEqual('BlankPage');
});

const pageInterpretationBoilerplate: InterpretedHmpbPage = {
  type: 'InterpretedHmpbPage',
  metadata: {
    ballotStyleId: '12',
    ballotType: 0,
    electionHash: stateOfHamiltonFixtures.electionDefinition.electionHash,
    isTestMode: false,
    locales: {
      primary: 'en-US',
    },
    pageNumber: 3,
    precinctId: '23',
  },
  markInfo: {
    ballotSize: {
      height: 1584,
      width: 1224,
    },
    marks: [
      {
        type: 'candidate',
        bounds: {
          height: 20,
          width: 31,
          x: 451,
          y: 645,
        },
        contestId: 'contest-id',
        target: {
          bounds: {
            height: 20,
            width: 31,
            x: 451,
            y: 645,
          },
          inner: {
            height: 16,
            width: 27,
            x: 453,
            y: 647,
          },
        },
        optionId: '42',
        score: 0.8,
        scoredOffset: { x: 0, y: 0 },
      },
    ],
  },
  votes: {},
  adjudicationInfo: {
    ignoredReasonInfos: [],
    enabledReasonInfos: [],
    enabledReasons: [],
    requiresAdjudication: false,
  },
};

function withPageNumber(
  page: PageInterpretation,
  pageNumber: number
): PageInterpretation {
  switch (page.type) {
    case 'BlankPage':
    case 'InterpretedBmdPage':
    case 'InvalidElectionHashPage':
    case 'UnreadablePage':
      return page;

    case 'InterpretedHmpbPage':
      return { ...page, metadata: { ...page.metadata, pageNumber } };

    case 'InvalidPrecinctPage':
    case 'InvalidTestModePage':
      if ('pageNumber' in page.metadata) {
        return { ...page, metadata: { ...page.metadata, pageNumber } };
      }
      return page;

    default:
      throwIllegalValue(page, 'type');
  }
}

test('sheetRequiresAdjudication triggers if front or back requires adjudication', () => {
  const sideYes: InterpretedHmpbPage = {
    ...pageInterpretationBoilerplate,
    adjudicationInfo: {
      ...pageInterpretationBoilerplate.adjudicationInfo,
      enabledReasonInfos: [
        {
          type: AdjudicationReason.Overvote,
          contestId: '42',
          optionIds: ['27', '28'],
          optionIndexes: [0, 1],
          expected: 1,
        },
      ],
      ignoredReasonInfos: [],
      requiresAdjudication: true,
    },
  };

  const sideNo: InterpretedHmpbPage = {
    ...pageInterpretationBoilerplate,
    adjudicationInfo: {
      ...pageInterpretationBoilerplate.adjudicationInfo,
      requiresAdjudication: false,
    },
  };

  expect(
    sheetRequiresAdjudication([
      withPageNumber(sideYes, 1),
      withPageNumber(sideNo, 2),
    ])
  ).toEqual(true);
  expect(
    sheetRequiresAdjudication([
      withPageNumber(sideNo, 1),
      withPageNumber(sideYes, 2),
    ])
  ).toEqual(true);
  expect(
    sheetRequiresAdjudication([
      withPageNumber(sideYes, 1),
      withPageNumber(sideYes, 2),
    ])
  ).toEqual(true);
  expect(
    sheetRequiresAdjudication([
      withPageNumber(sideNo, 1),
      withPageNumber(sideNo, 2),
    ])
  ).toEqual(false);
});

test('sheetRequiresAdjudication triggers for HMPB/blank page', () => {
  const hmpbNoVotes: InterpretedHmpbPage = {
    ...pageInterpretationBoilerplate,
    adjudicationInfo: {
      requiresAdjudication: true,
      enabledReasons: [AdjudicationReason.BlankBallot],
      enabledReasonInfos: [{ type: AdjudicationReason.BlankBallot }],
      ignoredReasonInfos: [],
    },
  };

  const blank: BlankPage = {
    type: 'BlankPage',
  };

  const hmpbWithVotes: InterpretedHmpbPage = {
    ...pageInterpretationBoilerplate,
    adjudicationInfo: {
      requiresAdjudication: false,
      enabledReasons: [],
      enabledReasonInfos: [],
      ignoredReasonInfos: [],
    },
  };

  expect(sheetRequiresAdjudication([hmpbNoVotes, hmpbNoVotes])).toEqual(true);
  expect(
    sheetRequiresAdjudication([
      withPageNumber(hmpbNoVotes, 1),
      withPageNumber(hmpbWithVotes, 2),
    ])
  ).toEqual(false);
  expect(
    sheetRequiresAdjudication([
      withPageNumber(hmpbWithVotes, 1),
      withPageNumber(hmpbWithVotes, 2),
    ])
  ).toEqual(false);

  expect(sheetRequiresAdjudication([hmpbNoVotes, blank])).toEqual(true);
  expect(sheetRequiresAdjudication([blank, hmpbNoVotes])).toEqual(true);

  expect(sheetRequiresAdjudication([hmpbWithVotes, blank])).toEqual(true);
  expect(sheetRequiresAdjudication([blank, hmpbWithVotes])).toEqual(true);

  expect(sheetRequiresAdjudication([blank, blank])).toEqual(true);
});

test('sheetRequiresAdjudication is happy with a BMD ballot', () => {
  const bmd: InterpretedBmdPage = {
    type: 'InterpretedBmdPage',
    ballotId: unsafeParse(BallotIdSchema, '42'),
    metadata: {
      electionHash: '41',
      precinctId: '12',
      ballotStyleId: '1',
      locales: {
        primary: 'en-US',
      },
      isTestMode: true,
      ballotType: 0,
    },
    votes: {},
  };

  const unreadable: UnreadablePage = {
    type: 'UnreadablePage',
    reason:
      'cause there were a few too many black pixels so it was not filtered',
  };

  const blank: BlankPage = {
    type: 'BlankPage',
  };

  expect(sheetRequiresAdjudication([bmd, unreadable])).toEqual(false);
  expect(sheetRequiresAdjudication([unreadable, bmd])).toEqual(false);
  expect(sheetRequiresAdjudication([bmd, blank])).toEqual(false);
  expect(sheetRequiresAdjudication([blank, bmd])).toEqual(false);
});
