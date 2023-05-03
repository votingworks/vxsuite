import { Buffer } from 'buffer';
import { err, ok, typedAs } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  sampleBallotImages,
} from '@votingworks/fixtures';
import { QrCodePageResult, detectInBallot, getSearchAreas } from './qrcode';

test('does not find QR codes when there are none to find', async () => {
  const detectResult = await detectInBallot(
    await sampleBallotImages.notBallot.asImageData()
  );
  expect(detectResult).toEqual(
    typedAs<QrCodePageResult>(err({ type: 'no-qr-code' }))
  );
});

test('can read metadata encoded in a QR code with base64', async () => {
  const detectResult = await detectInBallot(
    await electionFamousNames2021Fixtures.machineMarkedBallotPage1.asImageData()
  );
  expect(detectResult).toEqual(
    typedAs<QrCodePageResult>(
      ok({
        data: expect.any(Buffer),
        position: 'top',
        detector: 'qrdetect',
      })
    )
  );
});

test('getSearchArea for letter-size image', () => {
  expect([...getSearchAreas({ width: 85, height: 110 })]).toHaveLength(
    2 // 1 top, 1 bottom
  );
});

test('getSearchArea for legal-size image', () => {
  expect([...getSearchAreas({ width: 85, height: 140 })]).toHaveLength(
    6 // 3 top, 3 bottom
  );
});

test('getSearchArea for 8.5x17" image', () => {
  expect([...getSearchAreas({ width: 85, height: 170 })]).toHaveLength(
    6 // 3 top, 3 bottom
  );
});
