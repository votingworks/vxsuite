import {
  detectQrcodeInFilePath,
  interpretMultiPagePdfTemplate,
} from '@votingworks/ballot-interpreter-vx';
import { throwIllegalValue } from '@votingworks/basics';
import {
  electionSampleDefinition,
  sampleBallotImages,
} from '@votingworks/fixtures';
import {
  AdjudicationReason,
  BallotIdSchema,
  BallotMetadataSchema,
  BallotType,
  BlankPage,
  ElectionDefinition,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  PageInterpretation,
  UnreadablePage,
  safeParseJson,
  unsafeParse,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { emptyDirSync, readFile } from 'fs-extra';
import { join } from 'path';
import * as choctaw2020Fixtures from '../test/fixtures/2020-choctaw';
import * as msDemoFixtures from '../test/fixtures/election-b0260b4e-mississippi-demo';
import * as stateOfHamiltonFixtures from '../test/fixtures/state-of-hamilton';
import { createInterpreter } from './interpret';
import { Interpreter, sheetRequiresAdjudication } from './vx_interpreter';

const interpreterOutputPath = join(__dirname, '..', 'test-output-dir/');
emptyDirSync(interpreterOutputPath);

jest.mock('@votingworks/ballot-encoder', () => {
  return {
    ...jest.requireActual('@votingworks/ballot-encoder'),
    // to allow changing election definitions without changing the image fixtures
    // TODO: generate image fixtures from election definitions more easily
    // this election hash is for the MS demo fixture images
    sliceElectionHash: () => 'b0260b4e9d492dab3813',
  };
});

test('extracts votes encoded in a QR code', async () => {
  const ballotImagePath = sampleBallotImages.sampleBatch1Ballot1.asFilePath();
  expect(
    (
      await new Interpreter({
        electionDefinition: {
          ...electionSampleDefinition,
          election: {
            ...electionSampleDefinition.election,
            markThresholds: { definite: 0.2, marginal: 0.17 },
          },
        },
        precinctSelection: ALL_PRECINCTS_SELECTION,
        testMode: true,
        // TODO: remove this once the QR code is fixed (https://github.com/votingworks/vxsuite/issues/1524)
        skipElectionHashCheck: true,
        adjudicationReasons:
          electionSampleDefinition.election.centralScanAdjudicationReasons ??
          [],
      }).interpretFile({
        ballotImagePath,
        detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
      })
    ).interpretation
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

test('properly scans a BMD ballot with a phantom QR code on back', async () => {
  const { electionDefinition, page1, page2 } = msDemoFixtures;
  const interpreter = createInterpreter();
  interpreter.configure({
    electionDefinition,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    testMode: true,
    layouts: [],
    ballotImagesPath: interpreterOutputPath,
  });

  const interpretation = (
    await interpreter.interpret('ballot-42', [page1, page2])
  ).ok();
  expect(interpretation?.pages.length).toEqual(2);
  expect(interpretation?.pages[0].interpretation.type).toEqual(
    'InterpretedBmdPage'
  );
  expect(interpretation?.pages[1].interpretation.type).toEqual('BlankPage');
});

test('properly detects test ballot in live mode', async () => {
  const ballotImagePath = sampleBallotImages.sampleBatch1Ballot1.asFilePath();
  const interpretationResult = await new Interpreter({
    electionDefinition: {
      ...electionSampleDefinition,
      election: {
        ...electionSampleDefinition.election,
        markThresholds: { definite: 0.2, marginal: 0.17 },
      },
    },
    precinctSelection: ALL_PRECINCTS_SELECTION,
    testMode: false, // this is the test mode
    // TODO: remove this once the QR code is fixed (https://github.com/votingworks/vxsuite/issues/1524)
    skipElectionHashCheck: true,
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
  const interpretationResult = await new Interpreter({
    electionDefinition: {
      ...electionSampleDefinition,
      election: {
        ...electionSampleDefinition.election,
        markThresholds: { definite: 0.2, marginal: 0.17 },
      },
    },
    testMode: true,
    // TODO: remove this once the QR code is fixed (https://github.com/votingworks/vxsuite/issues/1524)
    skipElectionHashCheck: true,
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
  const interpretationResult = await new Interpreter({
    electionDefinition: {
      ...electionSampleDefinition,
      election: {
        ...electionSampleDefinition.election,
        markThresholds: { definite: 0.2, marginal: 0.17 },
      },
    },
    testMode: true,
    // TODO: remove this once the QR code is fixed (https://github.com/votingworks/vxsuite/issues/1524)
    skipElectionHashCheck: true,
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

test('detects a blank page', async () => {
  const ballotImagePath = sampleBallotImages.blankPage.asFilePath();
  const interpretationResult = await new Interpreter({
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

test('interprets marks on a HMPB', async () => {
  const interpreter = new Interpreter({
    electionDefinition: stateOfHamiltonFixtures.electionDefinition,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    testMode: false,
    adjudicationReasons:
      electionSampleDefinition.election.centralScanAdjudicationReasons ?? [],
    // TODO: remove this once the QR code is fixed (https://github.com/votingworks/vxsuite/issues/1524)
    skipElectionHashCheck: true,
  });

  const layouts = interpretMultiPagePdfTemplate({
    electionDefinition: stateOfHamiltonFixtures.electionDefinition,
    ballotPdfData: await readFile(stateOfHamiltonFixtures.ballotPdf),
    metadata: safeParseJson(
      await readFile(stateOfHamiltonFixtures.filledInPage1Metadata, 'utf8'),
      BallotMetadataSchema
    ).unsafeUnwrap(),
  });
  for await (const layout of layouts) {
    interpreter.addHmpbTemplate(layout);

    if (layout.ballotPageLayout.metadata.pageNumber === 1) {
      break;
    }
  }

  const ballotImagePath = stateOfHamiltonFixtures.filledInPage1;
  const { votes } = (
    await interpreter.interpretFile({
      ballotImagePath,
      detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
    })
  ).interpretation as InterpretedHmpbPage;

  expect(votes).toMatchInlineSnapshot(`
    Object {
      "president": Array [
        Object {
          "id": "barchi-hallaren",
          "name": "Joseph Barchi and Joseph Hallaren",
          "partyIds": Array [
            "0",
          ],
        },
      ],
      "representative-district-6": Array [
        Object {
          "id": "schott",
          "name": "Brad Schott",
          "partyIds": Array [
            "2",
          ],
        },
      ],
      "senator": Array [
        Object {
          "id": "brown",
          "name": "David Brown",
          "partyIds": Array [
            "6",
          ],
        },
      ],
    }
  `);
});

test('interprets marks on an upside-down HMPB', async () => {
  const interpreter = new Interpreter({
    electionDefinition: stateOfHamiltonFixtures.electionDefinition,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    testMode: false,
    adjudicationReasons:
      electionSampleDefinition.election.centralScanAdjudicationReasons ?? [],
  });

  const layouts = interpretMultiPagePdfTemplate({
    electionDefinition: stateOfHamiltonFixtures.electionDefinition,
    ballotPdfData: await readFile(stateOfHamiltonFixtures.ballotPdf),
    metadata: safeParseJson(
      await readFile(stateOfHamiltonFixtures.filledInPage1Metadata, 'utf8'),
      BallotMetadataSchema
    ).unsafeUnwrap(),
  });
  for await (const layout of layouts) {
    interpreter.addHmpbTemplate(layout);

    if (layout.ballotPageLayout.metadata.pageNumber === 1) {
      break;
    }
  }

  const ballotImagePath = stateOfHamiltonFixtures.filledInPage1Flipped;
  expect(
    (
      await interpreter.interpretFile({
        ballotImagePath,
        detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
      })
    ).interpretation as InterpretedHmpbPage
  ).toMatchObject({
    actualElectionHash: '602c9b551d08a348c3e1',
    expectedElectionHash: expect.anything(),
    type: 'InvalidElectionHashPage',
  });
});

test('interprets marks in ballots', async () => {
  jest.setTimeout(15000);

  const electionDefinition: ElectionDefinition = {
    ...choctaw2020Fixtures.electionDefinition,
    election: {
      markThresholds: { definite: 0.2, marginal: 0.12 },
      ...choctaw2020Fixtures.election,
    },
  };
  const interpreter = new Interpreter({
    electionDefinition,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    testMode: false,
    adjudicationReasons:
      electionSampleDefinition.election.centralScanAdjudicationReasons ?? [],
    // TODO: remove this once the QR code is fixed (https://github.com/votingworks/vxsuite/issues/1524)
    skipElectionHashCheck: true,
  });

  const layouts = interpretMultiPagePdfTemplate({
    electionDefinition: choctaw2020Fixtures.electionDefinition,
    ballotPdfData: await readFile(choctaw2020Fixtures.ballotPdf),
    metadata: {
      ballotStyleId: '1',
      precinctId: '6526',
      ballotType: BallotType.Standard,
      locales: { primary: 'en-US' },
      electionHash: 'a537900d7a',
      isTestMode: false,
    },
  });
  for await (const layout of layouts) {
    interpreter.addHmpbTemplate(layout);
  }

  {
    const ballotImagePath = choctaw2020Fixtures.filledInPage1;
    expect(
      (
        (
          await interpreter.interpretFile({
            ballotImagePath,
            detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
          })
        ).interpretation as InterpretedHmpbPage
      ).votes
    ).toMatchInlineSnapshot(`
      Object {
        "1": Array [
          Object {
            "id": "1",
            "name": "Joe Biden",
            "partyIds": Array [
              "2",
            ],
          },
        ],
        "2": Array [
          Object {
            "id": "23",
            "name": "Jimmy Edwards",
            "partyIds": Array [
              "4",
            ],
          },
        ],
        "3": Array [
          Object {
            "id": "32",
            "name": "Trent Kelly",
            "partyIds": Array [
              "3",
            ],
          },
        ],
        "4": Array [
          Object {
            "id": "write-in-0",
            "isWriteIn": true,
            "name": "Write-In #1",
          },
        ],
      }
    `);
  }

  {
    const ballotImagePath = choctaw2020Fixtures.filledInPage2;
    expect(
      (
        (
          await interpreter.interpretFile({
            ballotImagePath,
            detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
          })
        ).interpretation as InterpretedHmpbPage
      ).votes
    ).toMatchInlineSnapshot(`
      Object {
        "flag-question": Array [
          "yes",
        ],
        "initiative-65": Array [
          "yes",
          "no",
        ],
        "initiative-65-a": Array [
          "yes",
        ],
        "runoffs-question": Array [
          "no",
        ],
      }
    `);
  }
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
      enabledReasons: [
        AdjudicationReason.BlankBallot,
        AdjudicationReason.UninterpretableBallot,
      ],
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
