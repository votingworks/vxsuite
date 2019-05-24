export default function randomBase64(numBytes: number) {
  // get random values to fill an array of prescribed length, b64 encode it, and strip the '=' at the end.
  return btoa(
    String.fromCharCode.apply(undefined, (window.crypto.getRandomValues(
      new Uint8ClampedArray(numBytes)
    ) as unknown) as number[])
  ).slice(0, -2)
}
