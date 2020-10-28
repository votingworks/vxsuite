import otsu from './otsu'

test('otsu finds a threshold separating foreground and background', () => {
  expect(otsu(Uint8Array.of(1, 2, 35, 98, 244, 255, 255, 255))).toEqual(243)
})
