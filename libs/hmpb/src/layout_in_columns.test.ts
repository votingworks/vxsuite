import { expect, test, vi, describe } from 'vitest';
import { iter } from '@votingworks/basics';
import { layOutInColumns, layOutSectionsInColumns } from './layout_in_columns';

interface Element {
  id: string;
  height: number;
}

const a1: Element = { id: 'a', height: 1 };
const b1: Element = { id: 'b', height: 1 };
const c2: Element = { id: 'c', height: 2 };
const d2: Element = { id: 'd', height: 2 };

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

describe.only('layOutSectionsInColumns', () => {
  const subsection2 = {
    id: 'subsection2',
    header: { id: 'subsection2-header', height: 1 },
    children: [a1],
  } as const;
  const subsection4 = {
    id: 'subsection4',
    header: {
      id: 'subsection4-header',
      height: 1,
    },
    children: [b1, c2],
  } as const;
  const section3 = {
    header: { id: 'section3-header', height: 1 },
    children: [subsection2],
  } as const;
  const section7 = {
    header: { id: 'section7-header', height: 1 },
    children: [subsection2, subsection4],
  } as const;

  test('lays out sections into columns with headers', async () => {
    // Empty case
    expect(
      layOutSectionsInColumns({
        sections: [],
        numColumns: 2,
        maxColumnHeight: 1,
      })
    ).toEqual({
      columns: [[], []],
      leftoverSections: [],
    });

    // No room for any sections
    expect(
      layOutSectionsInColumns({
        sections: [section3],
        numColumns: 3,
        maxColumnHeight: 1,
      })
    ).toEqual({
      columns: [[], [], []],
      leftoverSections: [section3],
    });

    // Room for one section
    expect(
      layOutSectionsInColumns({
        sections: [section3],
        numColumns: 2,
        maxColumnHeight: 3,
      })
    ).toEqual({
      columns: [[section3.header, subsection2.header, a1], []],
      leftoverSections: [],
    });

    // One section, split across columns
    expect(
      layOutSectionsInColumns({
        sections: [section7],
        numColumns: 2,
        maxColumnHeight: 4,
      })
    ).toEqual({
      columns: [
        [section7.header, subsection2.header, a1],
        [subsection4.header, b1, c2],
      ],
      leftoverSections: [],
    });

    // One section, some leftover
    expect(
      layOutSectionsInColumns({
        sections: [section7],
        numColumns: 2,
        maxColumnHeight: 3,
      })
    ).toEqual({
      columns: [
        [section7.header, subsection2.header, a1],
        [subsection4.header, b1],
      ],
      leftoverSections: [
        {
          ...section7,
          children: [
            {
              ...subsection4,
              children: [c2],
            },
          ],
        },
      ],
    });

    // Subsections split across columns, header repeated
    expect(
      layOutSectionsInColumns({
        sections: [section7],
        numColumns: 2,
        maxColumnHeight: 5,
      })
    ).toEqual({
      columns: [
        [section7.header, subsection2.header, a1, subsection4.header, b1],
        [subsection4.header, c2],
      ],
      leftoverSections: [],
    });
  });
});
