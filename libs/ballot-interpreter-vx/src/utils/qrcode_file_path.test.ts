import { typedAs } from '@votingworks/basics';
import { sampleBallotImages } from '@votingworks/fixtures';
import { Buffer } from 'buffer';
import { detectInFilePath, QrCodePageResult } from './qrcode';
import { skewedQrCodeBallotPage } from '../../test/fixtures';

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

test('can read metadata in QR code with skewed / dirty ballot', async () => {
  const detectResult = await detectInFilePath(skewedQrCodeBallotPage);
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
