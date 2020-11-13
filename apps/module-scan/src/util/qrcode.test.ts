import { join } from 'path'
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
