import { expect, test, vi } from 'vitest';
import { iter } from '@votingworks/basics';
import { layOutInColumns } from './layout_in_columns';

const a1 = { id: 'a', height: 1 } as const;
const b1 = { id: 'b', height: 1 } as const;
const c2 = { id: 'c', height: 2 } as const;
const d2 = { id: 'd', height: 2 } as const;

test('lays out as many elements as possible, minimizing column height', async () => {
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

test('doesnt access elements until needed', async () => {
  const a1Fn = vi.fn().mockResolvedValueOnce(a1);
  const b1Fn = vi.fn().mockResolvedValueOnce(b1);
  const c2Fn = vi.fn().mockResolvedValueOnce(c2);
  const d2Fn = vi.fn().mockResolvedValueOnce(d2);
  const elements = iter([a1Fn, b1Fn, c2Fn, d2Fn])
    .map((fn) => fn())
    .async();

  expect(
    await layOutInColumns({
      elements,
      numColumns: 2,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], [b1]],
    height: 1,
  });

  expect(a1Fn).toHaveBeenCalledTimes(1);
  expect(b1Fn).toHaveBeenCalledTimes(1);
  // Needs to check c2 to know it can't fit
  expect(c2Fn).toHaveBeenCalledTimes(1);
  expect(d2Fn).not.toHaveBeenCalled();
});
