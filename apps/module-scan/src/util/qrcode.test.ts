import { join } from 'path'
import { hardQRCodePage1 } from '../../test/fixtures/choctaw-2020-09-22-f30480cc99'
import { loadImageData } from './images'
import { detectQRCode } from './qrcode'

test('falls back to jsQR if the other QR code readers cannot read them', async () => {
  const imageData = await loadImageData(
    join(__dirname, '../../test/fixtures/jsqr-only-qrcode.png')
  )
  expect(await detectQRCode(imageData)).toMatchInlineSnapshot(`
    Object {
      "data": Object {
        "data": Array [
          86,
          80,
          1,
          20,
          208,
          242,
          52,
          90,
          77,
          32,
          189,
          215,
          7,
          196,
          24,
          5,
          13,
          36,
          0,
          8,
          32,
        ],
        "type": "Buffer",
      },
      "detector": "jsQR",
      "position": "top",
    }
  `)
})

test('decodes QR codes with qrdetect (zbar) by default', async () => {
  const imageData = await loadImageData(hardQRCodePage1)
  expect(await detectQRCode(imageData)).toMatchInlineSnapshot(`
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
  `)
})
