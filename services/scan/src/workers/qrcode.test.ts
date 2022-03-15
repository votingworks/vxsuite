import { metadataFromBytes } from '@votingworks/ballot-interpreter-vx';
import { readFile } from 'fs-extra';
import { join } from 'path';
import * as general2020Fixtures from '../../test/fixtures/2020-general';
import * as choctaw2020SpecialFixtures from '../../test/fixtures/choctaw-2020-09-22-f30480cc99';
import { getBallotImageData } from '../interpreter';
import { detectQrcodeInFilePath } from './qrcode';

const sampleBallotImagesPath = join(__dirname, '../../sample-ballot-images');

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

test('can read metadata encoded in a QR code with base64', async () => {
  const fixtures = choctaw2020SpecialFixtures;
  const { electionDefinition } = fixtures;
  const { qrcode } = (
    await getBallotImageData(
      await readFile(fixtures.blankPage1),
      fixtures.blankPage1,
      await detectQrcodeInFilePath(fixtures.blankPage1)
    )
  ).unsafeUnwrap();

  expect(metadataFromBytes(electionDefinition, Buffer.from(qrcode.data)))
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
