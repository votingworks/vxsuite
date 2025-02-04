import { expect, test } from 'vitest';
import { iter } from '@votingworks/basics';
import { layOutInColumns } from './layout_in_columns';

test('layoutInColumns', async () => {
  const a1 = { id: 'a', height: 1 } as const;
  const b1 = { id: 'b', height: 1 } as const;
  const c2 = { id: 'c', height: 2 } as const;
  const d2 = { id: 'd', height: 2 } as const;

  expect(
    await layOutInColumns({
      elements: iter([]).async(),
      numColumns: 1,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[]],
    height: 0,
  });

  expect(
    await layOutInColumns({
      elements: iter([a1]).async(),
      numColumns: 1,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1]],
    height: 1,
  });

  expect(
    await layOutInColumns({
      elements: iter([a1]).async(),
      numColumns: 2,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], []],
    height: 1,
  });

  expect(
    await layOutInColumns({
      elements: iter([a1, b1]).async(),
      numColumns: 1,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1]],
    height: 1,
  });

  expect(
    await layOutInColumns({
      elements: iter([a1, b1]).async(),
      numColumns: 2,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], [b1]],
    height: 1,
  });

  expect(
    await layOutInColumns({
      elements: iter([a1, b1]).async(),
      numColumns: 1,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1, b1]],
    height: 2,
  });

  expect(
    await layOutInColumns({
      elements: iter([a1, b1]).async(),
      numColumns: 2,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1], [b1]],
    height: 1,
  });

  expect(
    await layOutInColumns({
      elements: iter([a1, b1]).async(),
      numColumns: 3,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], [b1], []],
    height: 1,
  });

  expect(
    await layOutInColumns({
      elements: iter([a1, b1, c2]).async(),
      numColumns: 1,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1]],
    height: 1,
  });

  expect(
    await layOutInColumns({
      elements: iter([a1, b1, c2]).async(),
      numColumns: 1,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1, b1]],
    height: 2,
  });

  expect(
    await layOutInColumns({
      elements: iter([a1, b1, c2]).async(),
      numColumns: 2,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], [b1]],
    height: 1,
  });

  expect(
    await layOutInColumns({
      elements: iter([a1, b1, c2]).async(),
      numColumns: 2,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1, b1], [c2]],
    height: 2,
  });

  expect(
    await layOutInColumns({
      elements: iter([a1, b1, c2]).async(),
      numColumns: 3,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], [b1], []],
    height: 1,
  });

  expect(
    await layOutInColumns({
      elements: iter([a1, b1, c2]).async(),
      numColumns: 3,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1], [b1], [c2]],
    height: 2,
  });

  expect(
    await layOutInColumns({
      elements: iter([c2, a1, b1, d2]).async(),
      maxColumnHeight: 2,
      numColumns: 3,
    })
  ).toEqual({
    columns: [[c2], [a1, b1], [d2]],
    height: 2,
  });
});
