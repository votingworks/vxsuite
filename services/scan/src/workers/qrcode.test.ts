import { metadataFromBytes } from '@votingworks/ballot-interpreter-vx';
import { typedAs } from '@votingworks/utils';
import { Buffer } from 'buffer';
import { join } from 'path';
import * as general2020Fixtures from '../../test/fixtures/2020-general';
import * as choctaw2020SpecialFixtures from '../../test/fixtures/choctaw-2020-09-22-f30480cc99';
import { BallotPageQrcode } from '../types';
import { detectQrcodeInFilePath, NonBlankPageOutput, Output } from './qrcode';

const sampleBallotImagesPath = join(__dirname, '../../sample-ballot-images');

test('does not find QR codes when there are none to find', async () => {
  const filepath = join(sampleBallotImagesPath, 'not-a-ballot.jpg');
  const detectResult = await detectQrcodeInFilePath(filepath);
  expect(detectResult).toEqual(
    typedAs<Output>({
      blank: false,
      qrcode: undefined,
    })
  );
});

test('can read metadata encoded in a QR code with base64', async () => {
  const fixtures = choctaw2020SpecialFixtures;
  const { electionDefinition } = fixtures;
  const detectResult = await detectQrcodeInFilePath(fixtures.blankPage1);
  expect(detectResult).toEqual(
    typedAs<Output>({
      blank: false,
      qrcode: {
        data: expect.any(Buffer),
        position: 'bottom',
      },
    })
  );
  const qrcode = (detectResult as NonBlankPageOutput)
    .qrcode as BallotPageQrcode;

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
  const detectResult = await detectQrcodeInFilePath(
    fixtures.skewedQrCodeBallotPage
  );
  expect(detectResult).toEqual(
    typedAs<Output>({
      blank: false,
      qrcode: {
        data: Buffer.of(
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
          0
        ),
        position: 'top',
      },
    })
  );
});
