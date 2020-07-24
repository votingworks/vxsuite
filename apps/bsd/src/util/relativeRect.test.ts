import relativeRect from './relativeRect'

test('ratio rect', () => {
  const scaleRect = relativeRect(40, 80)

  expect(scaleRect({ x: 0, y: 0, width: 0, height: 0 })).toEqual({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  })

  expect(scaleRect({ x: 2, y: 4, width: 1, height: 2 })).toEqual({
    x: 5,
    y: 5,
    width: 2.5,
    height: 2.5,
  })

  expect(scaleRect({ x: 20, y: 40, width: 10, height: 20 })).toEqual({
    x: 50,
    y: 50,
    width: 25,
    height: 25,
  })
})
