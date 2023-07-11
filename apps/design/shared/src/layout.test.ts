import { layoutInColumns } from './layout';

test('layoutInColumns', () => {
  const a1 = { id: 'a', height: 1 } as const;
  const b1 = { id: 'b', height: 1 } as const;
  const c2 = { id: 'c', height: 2 } as const;

  expect(
    layoutInColumns({
      elements: [],
      numColumns: 1,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[]],
    leftoverElements: [],
  });

  expect(
    layoutInColumns({
      elements: [a1],
      numColumns: 1,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1]],
    leftoverElements: [],
  });

  expect(
    layoutInColumns({
      elements: [a1],
      numColumns: 2,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], []],
    leftoverElements: [],
  });

  expect(
    layoutInColumns({
      elements: [a1, b1],
      numColumns: 1,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1]],
    leftoverElements: [b1],
  });

  expect(
    layoutInColumns({
      elements: [a1, b1],
      numColumns: 2,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], [b1]],
    leftoverElements: [],
  });

  expect(
    layoutInColumns({
      elements: [a1, b1],
      numColumns: 1,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1, b1]],
    leftoverElements: [],
  });

  expect(
    layoutInColumns({
      elements: [a1, b1],
      numColumns: 2,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1], [b1]],
    leftoverElements: [],
  });

  expect(
    layoutInColumns({
      elements: [a1, b1, c2],
      numColumns: 1,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1]],
    leftoverElements: [b1, c2],
  });

  expect(
    layoutInColumns({
      elements: [a1, b1, c2],
      numColumns: 1,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1, b1]],
    leftoverElements: [c2],
  });

  expect(
    layoutInColumns({
      elements: [a1, b1, c2],
      numColumns: 2,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], [b1]],
    leftoverElements: [c2],
  });

  expect(
    layoutInColumns({
      elements: [a1, b1, c2],
      numColumns: 2,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1, b1], [c2]],
    leftoverElements: [],
  });

  expect(
    layoutInColumns({
      elements: [a1, b1, c2],
      numColumns: 3,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], [b1], []],
    leftoverElements: [c2],
  });

  expect(
    layoutInColumns({
      elements: [a1, b1, c2],
      numColumns: 3,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1], [b1], [c2]],
    leftoverElements: [],
  });
});
