import { angle, approximatelyEqual, distance } from './geometry'

test('distance', () => {
  expect(distance(0, 0, 0, 0)).toEqual(0)
  expect(distance(0, 0, 1, 0)).toEqual(1)
  expect(distance(1, 0, 0, 0)).toEqual(1)
  expect(distance(0, 1, 0, 0)).toEqual(1)
  expect(distance(0, 0, 0, 1)).toEqual(1)
  expect(distance(0, 0, 1, 1)).toEqual(Math.sqrt(2))
  expect(distance(1, 1, 1, 1)).toEqual(0)
})

test('angle', () => {
  expect(angle(0, 0, 0, 0)).toEqual(0)
  expect(angle(0, 0, 1, 0)).toEqual(0)
  expect(angle(1, 0, 0, 0)).toEqual(Math.PI)
  expect(angle(0, 1, 0, 0)).toEqual(-0.5 * Math.PI)
  expect(angle(0, 0, 0, 1)).toEqual(0.5 * Math.PI)
  expect(angle(0, 0, 1, 1)).toEqual(0.25 * Math.PI)
  expect(angle(1, 1, 1, 1)).toEqual(0)
})

test('approximatelyEqual', () => {
  const deg45 = Math.PI / 4
  expect(Math.sin(deg45)).not.toEqual(Math.cos(deg45))
  expect(approximatelyEqual(Math.sin(deg45), Math.cos(deg45))).toBe(true)

  expect(0.1 + 0.2).not.toEqual(0.3)
  expect(approximatelyEqual(0.1 + 0.2, 0.3)).toBe(true)
})
