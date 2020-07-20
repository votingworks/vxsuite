import { scaler } from './scale'

test('identity scaler', () => {
  const scale = scaler(1)

  expect(scale(0)).toEqual(0)
  expect(scale(1)).toEqual(1)
  expect(scale(2)).toEqual(2)
  expect(scale(-1)).toEqual(-1)
  expect(scale(123.456)).toEqual(123.456)
})

test('scale bigger', () => {
  const scale = scaler(2)

  expect(scale(0)).toEqual(0)
  expect(scale(1)).toEqual(2)
  expect(scale(2)).toEqual(4)
  expect(scale(-1)).toEqual(-2)
})

test('scale smaller', () => {
  const scale = scaler(0.5)

  expect(scale(0)).toEqual(0)
  expect(scale(2)).toEqual(1)
  expect(scale(4)).toEqual(2)
  expect(scale(-2)).toEqual(-1)
})

test('scale rect', () => {
  const scale = scaler(0.75)

  expect(scale.rect({ x: 0, y: 0, width: 0, height: 0 })).toEqual({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  })
  expect(scale.rect({ x: 100, y: 40, width: 20, height: 36 })).toEqual({
    x: 75,
    y: 30,
    width: 15,
    height: 27,
  })
})
