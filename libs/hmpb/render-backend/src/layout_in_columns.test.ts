import { layOutInColumns } from './layout_in_columns';

test('layoutInColumns', () => {
  const a1 = { id: 'a', height: 1 } as const;
  const b1 = { id: 'b', height: 1 } as const;
  const c2 = { id: 'c', height: 2 } as const;
  const d2 = { id: 'd', height: 2 } as const;

  expect(
    layOutInColumns({
      elements: [],
      numColumns: 1,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[]],
    height: 0,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [a1],
      numColumns: 1,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1]],
    height: 1,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [a1],
      numColumns: 2,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], []],
    height: 1,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1],
      numColumns: 1,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1]],
    height: 1,
    leftoverElements: [b1],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1],
      numColumns: 2,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], [b1]],
    height: 1,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1],
      numColumns: 1,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1, b1]],
    height: 2,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1],
      numColumns: 2,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1], [b1]],
    height: 1,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1],
      numColumns: 3,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], [b1], []],
    height: 1,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1, c2],
      numColumns: 1,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1]],
    height: 1,
    leftoverElements: [b1, c2],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1, c2],
      numColumns: 1,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1, b1]],
    height: 2,
    leftoverElements: [c2],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1, c2],
      numColumns: 2,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], [b1]],
    height: 1,
    leftoverElements: [c2],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1, c2],
      numColumns: 2,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1, b1], [c2]],
    height: 2,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1, c2],
      numColumns: 3,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], [b1], []],
    height: 1,
    leftoverElements: [c2],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1, c2],
      numColumns: 3,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1], [b1], [c2]],
    height: 2,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [c2, a1, b1, d2],
      maxColumnHeight: 2,
      numColumns: 3,
    })
  ).toEqual({
    columns: [[c2], [a1, b1], [d2]],
    height: 2,
    leftoverElements: [],
  });
});
