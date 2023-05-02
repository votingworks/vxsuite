import { typedAs } from '@votingworks/basics';
import { Buffer } from 'buffer';
import {
  electionFamousNames2021Fixtures,
  sampleBallotImages,
} from '@votingworks/fixtures';
import * as general2020Fixtures from '../../test/fixtures/2020-general';
import { detectInFilePath, QrCodePageResult } from './qrcode';

test('does not find QR codes when there are none to find', async () => {
  const detectResult = await detectInFilePath(
    sampleBallotImages.notBallot.asFilePath()
  );
  expect(detectResult).toEqual(
    typedAs<QrCodePageResult>({
      blank: false,
      qrcode: undefined,
    })
  );
});

test('can read metadata encoded in a QR code with base64', async () => {
  const detectResult = await detectInFilePath(
    electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath()
  );
  expect(detectResult).toEqual(
    typedAs<QrCodePageResult>({
      blank: false,
      qrcode: {
        data: expect.any(Buffer),
        position: 'top',
      },
    })
  );
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
