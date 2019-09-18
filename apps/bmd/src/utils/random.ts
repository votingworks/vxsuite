export function randomBase64(numBytes: number) {
  // get random values to fill an array of prescribed length, b64 encode it, and strip the '=' at the end.
  return window
    .btoa(
      String.fromCharCode(
        ...window.crypto.getRandomValues(new Uint8ClampedArray(numBytes))
      )
    )
    .replace(/=+$/, '')
}

export default { randomBase64 }
