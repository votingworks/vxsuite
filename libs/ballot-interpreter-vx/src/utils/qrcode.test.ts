import { loadImageData } from '@votingworks/image-utils';
import { hardQrCodePage1 } from '../../test/fixtures';
import { detect as detectQrCode, getSearchAreas } from './qrcode';

test('decodes QR codes with qrdetect (zbar) by default', async () => {
  const imageData = await loadImageData(hardQrCodePage1);
  expect(await detectQrCode(imageData)).toMatchInlineSnapshot(`
    Object {
      "data": Object {
        "data": Array [
          104,
          116,
          116,
          112,
          115,
          58,
          47,
          47,
          98,
          97,
          108,
          108,
          111,
          116,
          46,
          112,
          97,
          103,
          101,
          47,
          63,
          116,
          61,
          95,
          38,
          112,
          114,
          61,
          54,
          53,
          50,
          50,
          38,
          98,
          115,
          61,
          49,
          38,
          108,
          49,
          61,
          101,
          110,
          45,
          85,
          83,
          38,
          108,
          50,
          61,
          38,
          112,
          61,
          49,
          45,
          50,
        ],
        "type": "Buffer",
      },
      "detector": "qrdetect",
      "position": "top",
    }
  `);
});

test('getSearchArea for letter-size image', () => {
  expect([...getSearchAreas({ width: 85, height: 110 })]).toHaveLength(
    4 // 2 top, 2 bottom
  );
});

test('getSearchArea for legal-size image', () => {
  expect([...getSearchAreas({ width: 85, height: 140 })]).toHaveLength(
    8 // 4 top, 4 bottom
  );
});

test('getSearchArea for 8.5x17" image', () => {
  expect([...getSearchAreas({ width: 85, height: 170 })]).toHaveLength(
    8 // 4 top, 4 bottom
  );
});
