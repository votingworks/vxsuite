import { typedAs } from '@votingworks/utils';
import { Buffer } from 'buffer';
import { join } from 'path';
import * as general2020Fixtures from '../../test/fixtures/2020-general';
import * as choctaw2020SpecialFixtures from '../../test/fixtures/choctaw-2020-09-22-f30480cc99';
import { fromBytes } from '../metadata';
import {
  BallotPageQrcode,
  detectInFilePath,
  NonBlankPageResult,
  QrCodePageResult,
} from './qrcode';

const fixturesPath = join(__dirname, '../../test/fixtures');

test('does not find QR codes when there are none to find', async () => {
  const filepath = join(fixturesPath, 'not-a-ballot.jpg');
  const detectResult = await detectInFilePath(filepath);
  expect(detectResult).toEqual(
    typedAs<QrCodePageResult>({
      blank: false,
      qrcode: undefined,
    })
  );
});

test('can read metadata encoded in a QR code with base64', async () => {
  const fixtures = choctaw2020SpecialFixtures;
  const { electionDefinition } = fixtures;
  const detectResult = await detectInFilePath(fixtures.blankPage1.filePath());
  expect(detectResult).toEqual(
    typedAs<QrCodePageResult>({
      blank: false,
      qrcode: {
        data: expect.any(Buffer),
        position: 'bottom',
      },
    })
  );
  const qrcode = (detectResult as NonBlankPageResult)
    .qrcode as BallotPageQrcode;

  expect(fromBytes(electionDefinition, Buffer.from(qrcode.data)))
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
  const detectResult = await detectInFilePath(fixtures.skewedQrCodeBallotPage);
  expect(detectResult).toEqual(
    typedAs<QrCodePageResult>({
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
