import { flipRectVH } from './geometry'

test('flipRectVH anchored top-left', () => {
  expect(
    flipRectVH(
      { x: 0, y: 0, width: 10, height: 15 },
      { x: 0, y: 0, width: 2, height: 3 }
    )
  ).toEqual({
    x: 8,
    y: 12,
    width: 2,
    height: 3,
  })
})

test('flipRectVH identity', () => {
  const outer = { x: 5, y: 10, width: 15, height: 20 }
  const inner = { x: 8, y: 13, width: 2, height: 3 }

  expect(flipRectVH(outer, flipRectVH(outer, inner))).toEqual(inner)
})
