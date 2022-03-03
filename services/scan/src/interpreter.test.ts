import { metadataFromBytes } from '@votingworks/ballot-interpreter-vx';
import { electionSample } from '@votingworks/fixtures';
import {
  AdjudicationReason,
  BallotIdSchema,
  BlankPage,
  Election,
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
import { election as choctaw2020Election } from '../test/fixtures/2020-choctaw';
import * as general2020Fixtures from '../test/fixtures/2020-general';
import * as choctaw2020SpecialFixtures from '../test/fixtures/choctaw-2020-09-22-f30480cc99';
import { election as stateOfHamiltonElection } from '../test/fixtures/state-of-hamilton';
import {
  getBallotImageData,
  Interpreter,
  sheetRequiresAdjudication,
} from './interpreter';
import { pdfToImages } from './util/pdf_to_images';
import { detectQrcodeInFilePath } from './workers/qrcode';

const sampleBallotImagesPath = join(__dirname, '..', 'sample-ballot-images/');
const stateOfHamiltonFixturesRoot = join(
  __dirname,
  '..',
  'test/fixtures/state-of-hamilton'
);
const choctaw2020FixturesRoot = join(
  __dirname,
  '..',
  'test/fixtures/2020-choctaw'
);

jest.setTimeout(10000);

test('does not find QR codes when there are none to find', async () => {
  const filepath = join(sampleBallotImagesPath, 'not-a-ballot.jpg');
  expect(
    (
      await getBallotImageData(
        await readFile(filepath),
        filepath,
        await detectQrcodeInFilePath(filepath)
      )
    ).unsafeUnwrapErr()
  ).toEqual({ type: 'UnreadablePage', reason: 'No QR code found' });
});

test('extracts votes encoded in a QR code', async () => {
  const ballotImagePath = join(
    sampleBallotImagesPath,
    'sample-batch-1-ballot-1.png'
  );
  expect(
    (
      await new Interpreter({
        election: {
          ...electionSample,
          markThresholds: { definite: 0.2, marginal: 0.17 },
        },
        testMode: true,
        adjudicationReasons:
          electionSample.centralScanAdjudicationReasons ?? [],
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
        "electionHash": "",
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
    election: {
      ...electionSample,
      markThresholds: { definite: 0.2, marginal: 0.17 },
    },
    testMode: false, // this is the test mode
    adjudicationReasons: electionSample.centralScanAdjudicationReasons ?? [],
  }).interpretFile({
    ballotImagePath,
    ballotImageFile: await readFile(ballotImagePath),
    detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
  });

  expect(interpretationResult.interpretation.type).toEqual(
    'InvalidTestModePage'
  );
});

test('can read metadata encoded in a QR code with base64', async () => {
  const fixtures = choctaw2020SpecialFixtures;
  const { election } = fixtures;
  const { qrcode } = (
    await getBallotImageData(
      await readFile(fixtures.blankPage1),
      fixtures.blankPage1,
      await detectQrcodeInFilePath(fixtures.blankPage1)
    )
  ).unsafeUnwrap();

  expect(metadataFromBytes(election, Buffer.from(qrcode.data)))
    .toMatchInlineSnapshot(`
    Object {
      "ballotId": undefined,
      "ballotStyleId": "1",
      "ballotType": 0,
      "electionHash": "02f807b005e006da160b",
      "isTestMode": false,
      "locales": Object {
        "primary": "en-US",
        "secondary": undefined,
      },
      "pageNumber": 1,
      "precinctId": "6538",
    }
  `);
});

test('can read metadata in QR code with skewed / dirty ballot', async () => {
  const fixtures = general2020Fixtures;
  const { qrcode } = (
    await getBallotImageData(
      await readFile(fixtures.skewedQrCodeBallotPage),
      fixtures.skewedQrCodeBallotPage,
      await detectQrcodeInFilePath(fixtures.skewedQrCodeBallotPage)
    )
  ).unsafeUnwrap();

  expect(qrcode.data).toMatchInlineSnapshot(`
    Object {
      "data": Array [
        86,
        80,
        1,
        20,
        111,
        111,
        156,
        219,
        48,
        24,
        169,
        41,
        115,
        168,
        20,
        5,
        17,
        0,
        0,
        6,
        0,
      ],
      "type": "Buffer",
    }
  `);
});

test('interprets marks on a HMPB', async () => {
  const interpreter = new Interpreter({
    election: stateOfHamiltonElection,
    testMode: false,
    adjudicationReasons: electionSample.centralScanAdjudicationReasons ?? [],
  });

  for await (const { page, pageNumber } of pdfToImages(
    await readFile(join(stateOfHamiltonFixturesRoot, 'ballot.pdf')),
    { scale: 2 }
  )) {
    await interpreter.addHmpbTemplate(
      await interpreter.interpretHmpbTemplate(page)
    );

    if (pageNumber === 1) {
      break;
    }
  }

  const ballotImagePath = join(
    stateOfHamiltonFixturesRoot,
    'filled-in-dual-language-p1.jpg'
  );
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
    election: stateOfHamiltonElection,
    testMode: false,
    adjudicationReasons: electionSample.centralScanAdjudicationReasons ?? [],
  });

  for await (const { page, pageNumber } of pdfToImages(
    await readFile(join(stateOfHamiltonFixturesRoot, 'ballot.pdf')),
    { scale: 2 }
  )) {
    await interpreter.addHmpbTemplate(
      await interpreter.interpretHmpbTemplate(page)
    );

    if (pageNumber === 1) {
      break;
    }
  }

  const ballotImagePath = join(
    stateOfHamiltonFixturesRoot,
    'filled-in-dual-language-p1-flipped.jpg'
  );
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
        "electionHash": "",
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

test('interprets marks in PNG ballots', async () => {
  jest.setTimeout(15000);

  const election: Election = {
    markThresholds: { definite: 0.2, marginal: 0.12 },
    ...choctaw2020Election,
  };
  const interpreter = new Interpreter({
    election,
    testMode: false,
    adjudicationReasons: electionSample.centralScanAdjudicationReasons ?? [],
  });

  for await (const { page } of pdfToImages(
    await readFile(join(choctaw2020FixturesRoot, 'ballot.pdf')),
    { scale: 2 }
  )) {
    await interpreter.addHmpbTemplate(
      await interpreter.interpretHmpbTemplate(page)
    );
  }

  {
    const ballotImagePath = join(choctaw2020FixturesRoot, 'filled-in-p1.png');
    expect(
      (
        await interpreter.interpretFile({
          ballotImagePath,
          ballotImageFile: await readFile(ballotImagePath),
          detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
        })
      ).interpretation
    ).toMatchInlineSnapshot(`
      Object {
        "adjudicationInfo": Object {
          "enabledReasonInfos": Array [],
          "enabledReasons": Array [],
          "ignoredReasonInfos": Array [
            Object {
              "contestId": "4",
              "optionId": "__write-in-0",
              "optionIndex": 2,
              "type": "WriteIn",
            },
            Object {
              "contestId": "initiative-65",
              "expected": 1,
              "optionIds": Array [
                "yes",
                "no",
              ],
              "optionIndexes": Array [
                0,
                1,
              ],
              "type": "Overvote",
            },
          ],
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
                "y": 166,
              },
              "contestId": "1",
              "optionId": "1",
              "score": 0.4090909090909091,
              "scoredOffset": Object {
                "x": 1,
                "y": 0,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 451,
                  "y": 166,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 453,
                  "y": 168,
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
                "y": 241,
              },
              "contestId": "1",
              "optionId": "2",
              "score": 0,
              "scoredOffset": Object {
                "x": 0,
                "y": 0,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 451,
                  "y": 241,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 453,
                  "y": 243,
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
                "y": 316,
              },
              "contestId": "1",
              "optionId": "__write-in-0",
              "score": 0,
              "scoredOffset": Object {
                "x": 0,
                "y": 0,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 451,
                  "y": 316,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 453,
                  "y": 318,
                },
              },
              "type": "candidate",
              "writeInTextScore": 0.0001403443113772455,
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 451,
                "y": 525,
              },
              "contestId": "2",
              "optionId": "21",
              "score": 0.008152173913043478,
              "scoredOffset": Object {
                "x": 0,
                "y": -2,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 451,
                  "y": 525,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 453,
                  "y": 527,
                },
              },
              "type": "candidate",
              "writeInTextScore": undefined,
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 451,
                "y": 600,
              },
              "contestId": "2",
              "optionId": "22",
              "score": 0.010869565217391304,
              "scoredOffset": Object {
                "x": 0,
                "y": 0,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 451,
                  "y": 600,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 453,
                  "y": 602,
                },
              },
              "type": "candidate",
              "writeInTextScore": undefined,
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 451,
                "y": 675,
              },
              "contestId": "2",
              "optionId": "23",
              "score": 0.5706521739130435,
              "scoredOffset": Object {
                "x": 0,
                "y": 0,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 451,
                  "y": 675,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 453,
                  "y": 677,
                },
              },
              "type": "candidate",
              "writeInTextScore": undefined,
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 451,
                "y": 750,
              },
              "contestId": "2",
              "optionId": "__write-in-0",
              "score": 0.016304347826086956,
              "scoredOffset": Object {
                "x": 0,
                "y": 1,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 451,
                  "y": 750,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 453,
                  "y": 752,
                },
              },
              "type": "candidate",
              "writeInTextScore": 0.00023761999809904002,
            },
            Object {
              "bounds": Object {
                "height": 22,
                "width": 32,
                "x": 451,
                "y": 1021,
              },
              "contestId": "3",
              "optionId": "31",
              "score": 0.00267379679144385,
              "scoredOffset": Object {
                "x": 0,
                "y": 0,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 451,
                  "y": 1021,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 453,
                  "y": 1023,
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
                "y": 1096,
              },
              "contestId": "3",
              "optionId": "32",
              "score": 0.8529411764705882,
              "scoredOffset": Object {
                "x": 0,
                "y": 0,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 451,
                  "y": 1096,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 453,
                  "y": 1098,
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
                "y": 1171,
              },
              "contestId": "3",
              "optionId": "__write-in-0",
              "score": 0,
              "scoredOffset": Object {
                "x": 1,
                "y": 0,
              },
              "target": Object {
                "bounds": Object {
                  "height": 22,
                  "width": 32,
                  "x": 451,
                  "y": 1171,
                },
                "inner": Object {
                  "height": 18,
                  "width": 28,
                  "x": 453,
                  "y": 1173,
                },
              },
              "type": "candidate",
              "writeInTextScore": 0.0005794861889124976,
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 837,
                "y": 198,
              },
              "contestId": "4",
              "optionId": "41",
              "score": 0.010869565217391304,
              "scoredOffset": Object {
                "x": 0,
                "y": -1,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 837,
                  "y": 198,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 839,
                  "y": 200,
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
                "y": 285,
              },
              "contestId": "4",
              "optionId": "42",
              "score": 0.01358695652173913,
              "scoredOffset": Object {
                "x": 0,
                "y": -1,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 837,
                  "y": 285,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 839,
                  "y": 287,
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
                "y": 360,
              },
              "contestId": "4",
              "optionId": "__write-in-0",
              "score": 0.7445652173913043,
              "scoredOffset": Object {
                "x": 0,
                "y": 0,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 837,
                  "y": 360,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 839,
                  "y": 362,
                },
              },
              "type": "candidate",
              "writeInTextScore": 0.0431383764717098,
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 837,
                "y": 705,
              },
              "contestId": "initiative-65",
              "optionId": "yes",
              "score": 0.6005434782608695,
              "scoredOffset": Object {
                "x": 0,
                "y": 0,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 837,
                  "y": 705,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 839,
                  "y": 707,
                },
              },
              "type": "yesno",
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 837,
                "y": 753,
              },
              "contestId": "initiative-65",
              "optionId": "no",
              "score": 0.41847826086956524,
              "scoredOffset": Object {
                "x": 1,
                "y": -1,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 837,
                  "y": 753,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 839,
                  "y": 755,
                },
              },
              "type": "yesno",
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 837,
                "y": 1080,
              },
              "contestId": "initiative-65-a",
              "optionId": "yes",
              "score": 0.41847826086956524,
              "scoredOffset": Object {
                "x": 0,
                "y": 1,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 837,
                  "y": 1080,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 839,
                  "y": 1082,
                },
              },
              "type": "yesno",
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 837,
                "y": 1128,
              },
              "contestId": "initiative-65-a",
              "optionId": "no",
              "score": 0,
              "scoredOffset": Object {
                "x": 1,
                "y": 0,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 837,
                  "y": 1128,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 839,
                  "y": 1130,
                },
              },
              "type": "yesno",
            },
          ],
        },
        "metadata": Object {
          "ballotStyleId": "1",
          "ballotType": 0,
          "electionHash": "",
          "isTestMode": false,
          "locales": Object {
            "primary": "en-US",
          },
          "pageNumber": 1,
          "precinctId": "6526",
        },
        "type": "InterpretedHmpbPage",
        "votes": Object {
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
          "initiative-65": Array [
            "yes",
            "no",
          ],
          "initiative-65-a": Array [
            "yes",
          ],
        },
      }
    `);
  }

  {
    const ballotImagePath = join(choctaw2020FixturesRoot, 'filled-in-p2.png');
    expect(
      (
        await interpreter.interpretFile({
          ballotImagePath,
          ballotImageFile: await readFile(ballotImagePath),
          detectQrcodeResult: await detectQrcodeInFilePath(ballotImagePath),
        })
      ).interpretation
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
                "height": 21,
                "width": 32,
                "x": 64,
                "y": 501,
              },
              "contestId": "flag-question",
              "optionId": "yes",
              "score": 0.6048387096774194,
              "scoredOffset": Object {
                "x": 0,
                "y": -2,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 64,
                  "y": 501,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 66,
                  "y": 503,
                },
              },
              "type": "yesno",
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 64,
                "y": 549,
              },
              "contestId": "flag-question",
              "optionId": "no",
              "score": 0.01881720430107527,
              "scoredOffset": Object {
                "x": 0,
                "y": -2,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 64,
                  "y": 549,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 66,
                  "y": 551,
                },
              },
              "type": "yesno",
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 451,
                "y": 597,
              },
              "contestId": "runoffs-question",
              "optionId": "yes",
              "score": 0.008064516129032258,
              "scoredOffset": Object {
                "x": 0,
                "y": 0,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 451,
                  "y": 597,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 453,
                  "y": 599,
                },
              },
              "type": "yesno",
            },
            Object {
              "bounds": Object {
                "height": 21,
                "width": 32,
                "x": 451,
                "y": 645,
              },
              "contestId": "runoffs-question",
              "optionId": "no",
              "score": 0.46774193548387094,
              "scoredOffset": Object {
                "x": 0,
                "y": -1,
              },
              "target": Object {
                "bounds": Object {
                  "height": 21,
                  "width": 32,
                  "x": 451,
                  "y": 645,
                },
                "inner": Object {
                  "height": 17,
                  "width": 28,
                  "x": 453,
                  "y": 647,
                },
              },
              "type": "yesno",
            },
          ],
        },
        "metadata": Object {
          "ballotStyleId": "1",
          "ballotType": 0,
          "electionHash": "",
          "isTestMode": false,
          "locales": Object {
            "primary": "en-US",
          },
          "pageNumber": 2,
          "precinctId": "6526",
        },
        "type": "InterpretedHmpbPage",
        "votes": Object {
          "flag-question": Array [
            "yes",
          ],
          "runoffs-question": Array [
            "no",
          ],
        },
      }
    `);
  }
});

test('returns metadata if the QR code is readable but the HMPB ballot is not', async () => {
  const interpreter = new Interpreter({
    election: stateOfHamiltonElection,
    testMode: false,
    adjudicationReasons: electionSample.centralScanAdjudicationReasons ?? [],
  });

  for await (const { page, pageNumber } of pdfToImages(
    await readFile(join(stateOfHamiltonFixturesRoot, 'ballot.pdf')),
    { scale: 2 }
  )) {
    await interpreter.addHmpbTemplate(
      await interpreter.interpretHmpbTemplate(page)
    );

    if (pageNumber === 3) {
      break;
    }
  }

  const ballotImagePath = join(
    stateOfHamiltonFixturesRoot,
    'filled-in-dual-language-p3.jpg'
  );
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
        "electionHash": "",
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
    electionHash: '',
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
