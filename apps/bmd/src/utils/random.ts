/**
 * Random Base64 string.
 * Get random values to fill an array of prescribed length,
 * b64 encode it, and strip the '=' at the end.
 *
 * @param {number} [numBytes=16] Number of bytes
 *
 * @return string
 *
 */

export function randomBase64(numBytes: number = 16) {
  return window
    .btoa(
      String.fromCharCode(
        ...window.crypto.getRandomValues(new Uint8ClampedArray(numBytes))
      )
    )
    .replace(/=+$/, '')
}

export default { randomBase64 }
