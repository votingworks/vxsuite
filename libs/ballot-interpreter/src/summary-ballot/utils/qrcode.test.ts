import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { err, ok } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  sampleBallotImages,
} from '@votingworks/fixtures';
import { renderBmdBallotFixture } from '@votingworks/bmd-ballot-fixtures';
import {
  QrCodePageResult,
  detectInBallot,
  getSearchAreas,
  unwrapVxPayload,
} from './qrcode.js';
import { pdfToPageImages } from '../../../test/helpers/interpretation';

test('does not find QR codes when there are none to find', async () => {
  const detectResult = await detectInBallot(
    await sampleBallotImages.notBallot.asImageData()
  );
  expect(detectResult).toEqual<QrCodePageResult>(err({ type: 'no-qr-code' }));
});

test('can read metadata encoded in a QR code with base64', async () => {
  const ballotPdf = await renderBmdBallotFixture({
    electionDefinition:
      electionFamousNames2021Fixtures.readElectionDefinition(),
  });
  const pageImages = await pdfToPageImages(ballotPdf).toArray();
  const detectResult = await detectInBallot(pageImages[0]!);
  expect(detectResult).toEqual<QrCodePageResult>(
    ok({
      data: expect.any(Buffer),
      position: 'top',
      detector: 'zedbar',
    })
  );
});

test('unwrapVxPayload unwraps base64-wrapped ballot data', () => {
  const raw = Buffer.from([0x56, 0x53, 0x01, 0xab, 0xcd]);
  expect(unwrapVxPayload(Buffer.from(raw.toString('base64')))).toEqual(raw);
});

test('unwrapVxPayload rejects payloads that are not ballot data', () => {
  // `Buffer.from(s, 'base64')` drops unrecognized characters rather than
  // failing, so all of these "decode" successfully into garbage. Checking the
  // prelude is what keeps that garbage from being treated as ballot data.
  for (const payload of [
    'VXBABCDEFGH01234567',
    'VXBABCDEFGH012345678',
    '1234567890123456',
    'VS1 4A2B1C3D4E5F6A7B8C9D 0 0',
    '',
  ]) {
    expect(unwrapVxPayload(Buffer.from(payload))).toBeUndefined();
  }
});

test('unwrapVxPayload rejects unwrapped ballot data', () => {
  // Nothing we print is unwrapped, so this is rejected rather than passed
  // through. Recognizing an unwrapped payload is a change for whenever we move
  // off base64, not a compatibility path for anything in the field.
  const raw = Buffer.from([0x56, 0x53, 0x01, 0xab, 0xcd]);
  expect(unwrapVxPayload(raw)).toBeUndefined();
});

test('getSearchArea', () => {
  expect([...getSearchAreas({ width: 85, height: 110 })]).toHaveLength(
    2 // 1 top, 1 bottom
  );
});

test('getSearchArea, 2x2 placeholder image for simplex BMDB interpretation', () => {
  expect([...getSearchAreas({ width: 2, height: 2 })]).toEqual([
    {
      position: 'bottom',
      bounds: { x: 0, y: 1, width: 2, height: 1 },
    },
    {
      position: 'top',
      bounds: { x: 0, y: 0, width: 2, height: 1 },
    },
  ]);
});

test('getSearchArea, prevent search areas from extending beyond the image', () => {
  expect([...getSearchAreas({ width: 1, height: 3 })]).toEqual([
    {
      position: 'bottom',
      bounds: { x: 0, y: 1, width: 1, height: 1 },
    },
    {
      position: 'top',
      bounds: { x: 0, y: 0, width: 1, height: 1 },
    },
  ]);

  expect([...getSearchAreas({ width: 1, height: 5 })]).toEqual([
    {
      position: 'bottom',
      bounds: { x: 0, y: 2, width: 1, height: 2 },
    },
    {
      position: 'top',
      bounds: { x: 0, y: 0, width: 1, height: 2 },
    },
  ]);
});
