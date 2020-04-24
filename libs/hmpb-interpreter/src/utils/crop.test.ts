import crop from './crop'

test('crop center (gray)', () => {
  const imageData = {
    data: Uint8ClampedArray.of(0, 0, 0, 0, 1, 0, 0, 0, 0),
    width: 3,
    height: 3,
  }

  const { data, ...size } = crop(imageData, { x: 1, y: 1, width: 1, height: 1 })
  expect([...data]).toEqual([1])
  expect(size).toEqual({ width: 1, height: 1 })
})

test('crop center (rgba)', () => {
  const imageData = {
    data: Uint8ClampedArray.of(0, 0, 0, 255, 1, 0, 0, 255),
    width: 2,
    height: 1,
  }

  const { data, width, height } = crop(imageData, {
    x: 1,
    y: 0,
    width: 1,
    height: 1,
  })
  expect([...data]).toEqual([1, 0, 0, 255])
  expect({ width, height }).toEqual({ width: 1, height: 1 })
})
