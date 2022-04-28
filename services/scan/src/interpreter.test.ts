import { electionSampleDefinition } from '@votingworks/fixtures';
import {
  AdjudicationReason,
  BallotIdSchema,
  BlankPage,
  ElectionDefinition,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  PageInterpretation,
  UninterpretedHmpbPage,
  UnreadablePage,
  unsafeParse,
} from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/utils';
import { readFile } from 'fs-extra';
import { join } from 'path';
import * as choctaw2020Fixtures from '../test/fixtures/2020-choctaw';
import * as stateOfHamiltonFixtures from '../test/fixtures/state-of-hamilton';
import { Interpreter, sheetRequiresAdjudication } from './interpreter';
import { pdfToImages } from './util/pdf_to_images';
import { detectQrcodeInFilePath } from './workers/qrcode';

const sampleBallotImagesPath = join(__dirname, '..', 'sample-ballot-images/');

jest.setTimeout(10000);

test('extracts votes encoded in a QR code', async () => {
  const ballotImagePath = join(
    sampleBallotImagesPath,
    'sample-batch-1-ballot-1.png'
  );
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
        testMode: true,
        // TODO: remove this once the QR code is fixed (https://github.com/votingworks/vxsuite/issues/1524)
        skipElectionHashCheck: true,
        adjudicationReasons:
          electionSampleDefinition.election.centralScanAdjudicationReasons ??
          [],
      }).interpretFile({
        ballotImagePath,
        ballotImageFile: await readFile(ballotImagePath),
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
            "partyId": "1",
          },
        ],
      },
    }
  `);
});

test('properly detects test ballot in live mode', async () => {
  const ballotImagePath = join(
    sampleBallotImagesPath,
    'sample-batch-1-ballot-1.png'
  );
  const interpretationResult = await new Interpreter({
    electionDefinition: {
      ...electionSampleDefinition,
      election: {
        ...electionSampleDefinition.election,
        markThresholds: { definite: 0.2, marginal: 0.17 },
      },
    },
    testMode: false, // this is the test mode
    // TODO: remove this once the QR code is fixed (https://github.com/votingworks/vxsuite/issues/1524)
    skipElectionHashCheck: true,
    adjudicationReasons:
      electionSampleDefinition.election.centralScanAdjudicationReasons ?? [],
  }).interpretFile({
    ballotImagePath,
    ballotImageFile: await readFile(ballotImagePath),
    detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
  });

  expect(interpretationResult.interpretation.type).toEqual(
    'InvalidTestModePage'
  );
});

test('interprets marks on a HMPB', async () => {
  const interpreter = new Interpreter({
    electionDefinition: stateOfHamiltonFixtures.electionDefinition,
    testMode: false,
    adjudicationReasons:
      electionSampleDefinition.election.centralScanAdjudicationReasons ?? [],
    // TODO: remove this once the QR code is fixed (https://github.com/votingworks/vxsuite/issues/1524)
    skipElectionHashCheck: true,
  });

  for await (const { page, pageNumber } of pdfToImages(
    await readFile(stateOfHamiltonFixtures.ballotPdf),
    { scale: 2 }
  )) {
    await interpreter.addHmpbTemplate(
      await interpreter.interpretHmpbTemplate(page)
    );

    if (pageNumber === 1) {
      break;
    }
  }

  const ballotImagePath = stateOfHamiltonFixtures.filledInPage1;
  const { votes } = (
    await interpreter.interpretFile({
      ballotImagePath,
      ballotImageFile: await readFile(ballotImagePath),
      detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
    })
  ).interpretation as InterpretedHmpbPage;

  expect(votes).toMatchInlineSnapshot(`
    Object {
      "president": Array [
        Object {
          "id": "barchi-hallaren",
          "name": "Joseph Barchi and Joseph Hallaren",
          "partyId": "0",
        },
      ],
      "representative-district-6": Array [
        Object {
          "id": "schott",
          "name": "Brad Schott",
          "partyId": "2",
        },
      ],
      "senator": Array [
        Object {
          "id": "brown",
          "name": "David Brown",
          "partyId": "6",
        },
      ],
    }
  `);
});

test('interprets marks on an upside-down HMPB', async () => {
  const interpreter = new Interpreter({
    electionDefinition: stateOfHamiltonFixtures.electionDefinition,
    testMode: false,
    adjudicationReasons:
      electionSampleDefinition.election.centralScanAdjudicationReasons ?? [],
    // TODO: remove this once the QR code is fixed (https://github.com/votingworks/vxsuite/issues/1524)
    skipElectionHashCheck: true,
  });

  for await (const { page, pageNumber } of pdfToImages(
    await readFile(stateOfHamiltonFixtures.ballotPdf),
    { scale: 2 }
  )) {
    await interpreter.addHmpbTemplate(
      await interpreter.interpretHmpbTemplate(page)
    );

    if (pageNumber === 1) {
      break;
    }
  }

  const ballotImagePath = stateOfHamiltonFixtures.filledInPage1Flipped;
  expect(
    (
      await interpreter.interpretFile({
        ballotImagePath,
        ballotImageFile: await readFile(ballotImagePath),
        detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
      })
    ).interpretation as InterpretedHmpbPage
  ).toMatchInlineSnapshot(`
    Object {
      "adjudicationInfo": Object {
        "enabledReasonInfos": Array [],
        "enabledReasons": Array [],
        "ignoredReasonInfos": Array [],
        "requiresAdjudication": false,
      },
      "markInfo": Object {
        "ballotSize": Object {
          "height": 1584,
          "width": 1224,
        },
        "marks": Array [
          Object {
            "bounds": Object {
              "height": 22,
              "width": 32,
              "x": 451,
              "y": 232,
            },
            "contestId": "president",
            "optionId": "barchi-hallaren",
            "score": 0.6550802139037433,
            "scoredOffset": Object {
              "x": 0,
              "y": -1,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 32,
                "x": 451,
                "y": 232,
              },
              "inner": Object {
                "height": 18,
                "width": 28,
                "x": 453,
                "y": 234,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 22,
              "width": 32,
              "x": 451,
              "y": 334,
            },
            "contestId": "president",
            "optionId": "cramer-vuocolo",
            "score": 0,
            "scoredOffset": Object {
              "x": 0,
              "y": -1,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 32,
                "x": 451,
                "y": 334,
              },
              "inner": Object {
                "height": 18,
                "width": 28,
                "x": 453,
                "y": 336,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 22,
              "width": 32,
              "x": 451,
              "y": 436,
            },
            "contestId": "president",
            "optionId": "court-blumhardt",
            "score": 0,
            "scoredOffset": Object {
              "x": 0,
              "y": -2,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 32,
                "x": 451,
                "y": 436,
              },
              "inner": Object {
                "height": 18,
                "width": 28,
                "x": 453,
                "y": 438,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 22,
              "width": 32,
              "x": 451,
              "y": 538,
            },
            "contestId": "president",
            "optionId": "boone-lian",
            "score": 0,
            "scoredOffset": Object {
              "x": 0,
              "y": -2,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 32,
                "x": 451,
                "y": 538,
              },
              "inner": Object {
                "height": 18,
                "width": 28,
                "x": 453,
                "y": 540,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 22,
              "width": 32,
              "x": 451,
              "y": 613,
            },
            "contestId": "president",
            "optionId": "hildebrand-garritty",
            "score": 0.00267379679144385,
            "scoredOffset": Object {
              "x": 1,
              "y": -1,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 32,
                "x": 451,
                "y": 613,
              },
              "inner": Object {
                "height": 18,
                "width": 28,
                "x": 453,
                "y": 615,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 22,
              "width": 32,
              "x": 451,
              "y": 742,
            },
            "contestId": "president",
            "optionId": "patterson-lariviere",
            "score": 0,
            "scoredOffset": Object {
              "x": 0,
              "y": -1,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 32,
                "x": 451,
                "y": 742,
              },
              "inner": Object {
                "height": 18,
                "width": 28,
                "x": 453,
                "y": 744,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 32,
              "x": 837,
              "y": 168,
            },
            "contestId": "senator",
            "optionId": "weiford",
            "score": 0.01358695652173913,
            "scoredOffset": Object {
              "x": 0,
              "y": 1,
            },
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 837,
                "y": 168,
              },
              "inner": Object {
                "height": 17,
                "width": 28,
                "x": 839,
                "y": 170,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 32,
              "x": 837,
              "y": 243,
            },
            "contestId": "senator",
            "optionId": "garriss",
            "score": 0.008152173913043478,
            "scoredOffset": Object {
              "x": 0,
              "y": 0,
            },
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 837,
                "y": 243,
              },
              "inner": Object {
                "height": 17,
                "width": 28,
                "x": 839,
                "y": 245,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 32,
              "x": 837,
              "y": 318,
            },
            "contestId": "senator",
            "optionId": "wentworthfarthington",
            "score": 0.01358695652173913,
            "scoredOffset": Object {
              "x": 0,
              "y": 0,
            },
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 837,
                "y": 318,
              },
              "inner": Object {
                "height": 17,
                "width": 28,
                "x": 839,
                "y": 320,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 32,
              "x": 837,
              "y": 420,
            },
            "contestId": "senator",
            "optionId": "hewetson",
            "score": 0,
            "scoredOffset": Object {
              "x": 0,
              "y": -1,
            },
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 837,
                "y": 420,
              },
              "inner": Object {
                "height": 17,
                "width": 28,
                "x": 839,
                "y": 422,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 32,
              "x": 837,
              "y": 495,
            },
            "contestId": "senator",
            "optionId": "martinez",
            "score": 0.021739130434782608,
            "scoredOffset": Object {
              "x": 0,
              "y": -1,
            },
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 837,
                "y": 495,
              },
              "inner": Object {
                "height": 17,
                "width": 28,
                "x": 839,
                "y": 497,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 32,
              "x": 837,
              "y": 570,
            },
            "contestId": "senator",
            "optionId": "brown",
            "score": 0.5869565217391305,
            "scoredOffset": Object {
              "x": -1,
              "y": -1,
            },
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 837,
                "y": 570,
              },
              "inner": Object {
                "height": 17,
                "width": 28,
                "x": 839,
                "y": 572,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 21,
              "width": 32,
              "x": 837,
              "y": 663,
            },
            "contestId": "senator",
            "optionId": "pound",
            "score": 0.016304347826086956,
            "scoredOffset": Object {
              "x": 0,
              "y": 0,
            },
            "target": Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 837,
                "y": 663,
              },
              "inner": Object {
                "height": 17,
                "width": 28,
                "x": 839,
                "y": 665,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 22,
              "width": 32,
              "x": 837,
              "y": 913,
            },
            "contestId": "representative-district-6",
            "optionId": "plunkard",
            "score": 0,
            "scoredOffset": Object {
              "x": 1,
              "y": 0,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 32,
                "x": 837,
                "y": 913,
              },
              "inner": Object {
                "height": 18,
                "width": 28,
                "x": 839,
                "y": 915,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 22,
              "width": 32,
              "x": 837,
              "y": 988,
            },
            "contestId": "representative-district-6",
            "optionId": "reeder",
            "score": 0,
            "scoredOffset": Object {
              "x": 1,
              "y": 0,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 32,
                "x": 837,
                "y": 988,
              },
              "inner": Object {
                "height": 18,
                "width": 28,
                "x": 839,
                "y": 990,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 22,
              "width": 32,
              "x": 837,
              "y": 1063,
            },
            "contestId": "representative-district-6",
            "optionId": "schott",
            "score": 0.8850267379679144,
            "scoredOffset": Object {
              "x": 1,
              "y": 0,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 32,
                "x": 837,
                "y": 1063,
              },
              "inner": Object {
                "height": 18,
                "width": 28,
                "x": 839,
                "y": 1065,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 22,
              "width": 32,
              "x": 837,
              "y": 1138,
            },
            "contestId": "representative-district-6",
            "optionId": "tawney",
            "score": 0,
            "scoredOffset": Object {
              "x": 1,
              "y": 0,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 32,
                "x": 837,
                "y": 1138,
              },
              "inner": Object {
                "height": 18,
                "width": 28,
                "x": 839,
                "y": 1140,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
          Object {
            "bounds": Object {
              "height": 22,
              "width": 32,
              "x": 837,
              "y": 1213,
            },
            "contestId": "representative-district-6",
            "optionId": "forrest",
            "score": 0.00267379679144385,
            "scoredOffset": Object {
              "x": 1,
              "y": 1,
            },
            "target": Object {
              "bounds": Object {
                "height": 22,
                "width": 32,
                "x": 837,
                "y": 1213,
              },
              "inner": Object {
                "height": 18,
                "width": 28,
                "x": 839,
                "y": 1215,
              },
            },
            "type": "candidate",
            "writeInTextScore": undefined,
          },
        ],
      },
      "metadata": Object {
        "ballotStyleId": "12",
        "ballotType": 0,
        "electionHash": "965aa0b918b9bab9a2a445ede07b23b65f84dfbdf6012621eb5b6b7e984442cb",
        "isTestMode": false,
        "locales": Object {
          "primary": "en-US",
          "secondary": "es-US",
        },
        "pageNumber": 1,
        "precinctId": "23",
      },
      "type": "InterpretedHmpbPage",
      "votes": Object {
        "president": Array [
          Object {
            "id": "barchi-hallaren",
            "name": "Joseph Barchi and Joseph Hallaren",
            "partyId": "0",
          },
        ],
        "representative-district-6": Array [
          Object {
            "id": "schott",
            "name": "Brad Schott",
            "partyId": "2",
          },
        ],
        "senator": Array [
          Object {
            "id": "brown",
            "name": "David Brown",
            "partyId": "6",
          },
        ],
      },
    }
  `);
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
    testMode: false,
    adjudicationReasons:
      electionSampleDefinition.election.centralScanAdjudicationReasons ?? [],
    // TODO: remove this once the QR code is fixed (https://github.com/votingworks/vxsuite/issues/1524)
    skipElectionHashCheck: true,
  });

  for await (const { page } of pdfToImages(
    await readFile(choctaw2020Fixtures.ballotPdf),
    { scale: 2 }
  )) {
    await interpreter.addHmpbTemplate(
      await interpreter.interpretHmpbTemplate(page)
    );
  }

  {
    const ballotImagePath = choctaw2020Fixtures.filledInPage1;
    expect(
      (
        (
          await interpreter.interpretFile({
            ballotImagePath,
            ballotImageFile: await readFile(ballotImagePath),
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
            "partyId": "2",
          },
        ],
        "2": Array [
          Object {
            "id": "23",
            "name": "Jimmy Edwards",
            "partyId": "4",
          },
        ],
        "3": Array [
          Object {
            "id": "32",
            "name": "Trent Kelly",
            "partyId": "3",
          },
        ],
        "4": Array [
          Object {
            "id": "__write-in-0",
            "isWriteIn": true,
            "name": "Write-In",
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
            ballotImageFile: await readFile(ballotImagePath),
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

test('returns metadata if the QR code is readable but the HMPB ballot is not', async () => {
  const interpreter = new Interpreter({
    electionDefinition: stateOfHamiltonFixtures.electionDefinition,
    testMode: false,
    adjudicationReasons:
      electionSampleDefinition.election.centralScanAdjudicationReasons ?? [],
    // TODO: remove this once the QR code is fixed (https://github.com/votingworks/vxsuite/issues/1524)
    skipElectionHashCheck: true,
  });

  for await (const { page, pageNumber } of pdfToImages(
    await readFile(stateOfHamiltonFixtures.ballotPdf),
    { scale: 2 }
  )) {
    await interpreter.addHmpbTemplate(
      await interpreter.interpretHmpbTemplate(page)
    );

    if (pageNumber === 3) {
      break;
    }
  }

  const ballotImagePath = stateOfHamiltonFixtures.filledInPage3;
  expect(
    (
      await interpreter.interpretFile({
        ballotImagePath,
        ballotImageFile: await readFile(ballotImagePath),
        detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
      })
    ).interpretation as UninterpretedHmpbPage
  ).toMatchInlineSnapshot(`
    Object {
      "metadata": Object {
        "ballotStyleId": "12",
        "ballotType": 0,
        "electionHash": "965aa0b918b9bab9a2a445ede07b23b65f84dfbdf6012621eb5b6b7e984442cb",
        "isTestMode": false,
        "locales": Object {
          "primary": "en-US",
          "secondary": "es-US",
        },
        "pageNumber": 3,
        "precinctId": "23",
      },
      "type": "UninterpretedHmpbPage",
    }
  `);
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
    case 'UninterpretedHmpbPage':
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

test('sheetRequiresAdjudication triggers if front or back requires adjudication', async () => {
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
  ).toBe(true);
  expect(
    sheetRequiresAdjudication([
      withPageNumber(sideNo, 1),
      withPageNumber(sideYes, 2),
    ])
  ).toBe(true);
  expect(
    sheetRequiresAdjudication([
      withPageNumber(sideYes, 1),
      withPageNumber(sideYes, 2),
    ])
  ).toBe(true);
  expect(
    sheetRequiresAdjudication([
      withPageNumber(sideNo, 1),
      withPageNumber(sideNo, 2),
    ])
  ).toBe(false);
});

test('sheetRequiresAdjudication triggers for HMPB/blank page', async () => {
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

  expect(sheetRequiresAdjudication([hmpbNoVotes, hmpbNoVotes])).toBe(true);
  expect(
    sheetRequiresAdjudication([
      withPageNumber(hmpbNoVotes, 1),
      withPageNumber(hmpbWithVotes, 2),
    ])
  ).toBe(false);
  expect(
    sheetRequiresAdjudication([
      withPageNumber(hmpbWithVotes, 1),
      withPageNumber(hmpbWithVotes, 2),
    ])
  ).toBe(false);

  expect(sheetRequiresAdjudication([hmpbNoVotes, blank])).toBe(true);
  expect(sheetRequiresAdjudication([blank, hmpbNoVotes])).toBe(true);

  expect(sheetRequiresAdjudication([hmpbWithVotes, blank])).toBe(true);
  expect(sheetRequiresAdjudication([blank, hmpbWithVotes])).toBe(true);

  expect(sheetRequiresAdjudication([blank, blank])).toBe(true);
});

test('sheetRequiresAdjudication is happy with a BMD ballot', async () => {
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

  expect(sheetRequiresAdjudication([bmd, unreadable])).toBe(false);
  expect(sheetRequiresAdjudication([unreadable, bmd])).toBe(false);
  expect(sheetRequiresAdjudication([bmd, blank])).toBe(false);
  expect(sheetRequiresAdjudication([blank, bmd])).toBe(false);
});
