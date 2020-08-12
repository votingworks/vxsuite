import offsets from './offsets'

function take<T>(count: number, iterable: Iterable<T>): Array<T> {
  const result: T[] = []

  if (count > 0) {
    for (const value of iterable) {
      result.push(value)
      if (count === result.length) {
        break
      }
    }
  }

  return result
}

test('yields the null offset first', () => {
  expect(take(1, offsets())).toEqual([{ x: 0, y: 0 }])
})

test('yields points in a spiral', () => {
  expect(take(25, offsets())).toMatchInlineSnapshot(`
    Array [
      Object {
        "x": 0,
        "y": 0,
      },
      Object {
        "x": 0,
        "y": 1,
      },
      Object {
        "x": -1,
        "y": 1,
      },
      Object {
        "x": -1,
        "y": 0,
      },
      Object {
        "x": -1,
        "y": -1,
      },
      Object {
        "x": 0,
        "y": -1,
      },
      Object {
        "x": 1,
        "y": -1,
      },
      Object {
        "x": 1,
        "y": 0,
      },
      Object {
        "x": 1,
        "y": 1,
      },
      Object {
        "x": 1,
        "y": 2,
      },
      Object {
        "x": 0,
        "y": 2,
      },
      Object {
        "x": -1,
        "y": 2,
      },
      Object {
        "x": -2,
        "y": 2,
      },
      Object {
        "x": -2,
        "y": 1,
      },
      Object {
        "x": -2,
        "y": 0,
      },
      Object {
        "x": -2,
        "y": -1,
      },
      Object {
        "x": -2,
        "y": -2,
      },
      Object {
        "x": -1,
        "y": -2,
      },
      Object {
        "x": 0,
        "y": -2,
      },
      Object {
        "x": 1,
        "y": -2,
      },
      Object {
        "x": 2,
        "y": -2,
      },
      Object {
        "x": 2,
        "y": -1,
      },
      Object {
        "x": 2,
        "y": 0,
      },
      Object {
        "x": 2,
        "y": 1,
      },
      Object {
        "x": 2,
        "y": 2,
      },
    ]
  `)
})
