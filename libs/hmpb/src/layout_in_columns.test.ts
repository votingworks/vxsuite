import { expect, test, vi } from 'vitest';
import { iter } from '@votingworks/basics';
import {
  layOutInColumns,
  layOutSectionsInColumns,
  layOutSectionsInParallelColumns,
  Section,
  sectionIndexOf,
  sectionDrop,
  zipSections,
  transpose,
} from './layout_in_columns';

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

// Section layout tests
interface TestElement {
  readonly id: string;
  readonly height: number;
}
const h1: TestElement = { id: 'header-1', height: 1 };
const h2: TestElement = { id: 'header-2', height: 1 };
const sh1: TestElement = { id: 'sub-header-1', height: 1 };
const sh2: TestElement = { id: 'sub-header-2', height: 1 };
const e1: TestElement = { id: 'elem-1', height: 2 };
const e2: TestElement = { id: 'elem-2', height: 2 };
const e3: TestElement = { id: 'elem-3', height: 2 };
const e4: TestElement = { id: 'elem-4', height: 2 };

test('layOutSectionsInColumns fits a single section in one column', () => {
  const result = layOutSectionsInColumns({
    sections: [
      {
        header: h1,
        subsections: [{ header: sh1, elements: [e1] }],
      },
    ],
    numColumns: 2,
    maxColumnHeight: 10,
  });

  expect(result.columns).toEqual([[h1, sh1, e1], []]);
  expect(result.leftoverSections).toEqual([]);
});

test('layOutSectionsInColumns splits sections across columns', () => {
  const result = layOutSectionsInColumns({
    sections: [
      {
        header: h1,
        subsections: [{ header: sh1, elements: [e1, e2, e3] }],
      },
    ],
    numColumns: 2,
    maxColumnHeight: 5,
  });

  // Column 1: h1(1) + sh1(1) + e1(2) = 4, e2(2) won't fit
  // Column 2: sh1(1) repeated + e2(2) + e3(2) = 5
  expect(result.columns).toEqual([
    [h1, sh1, e1],
    [sh1, e2, e3],
  ]);
  expect(result.leftoverSections).toEqual([]);
});

test('layOutSectionsInColumns returns leftover elements from a split subsection', () => {
  const result = layOutSectionsInColumns({
    sections: [
      {
        header: h1,
        subsections: [{ header: sh1, elements: [e1, e2] }],
      },
      {
        header: h2,
        subsections: [{ header: sh2, elements: [e3, e4] }],
      },
    ],
    numColumns: 1,
    maxColumnHeight: 5,
  });

  // Only first section's first element fits: h1(1) + sh1(1) + e1(2) = 4
  expect(result.columns[0]).toEqual([h1, sh1, e1]);
  // Leftover includes remaining element from first section + entire second section
  expect(result.leftoverSections).toEqual([
    {
      header: h1,
      subsections: [{ header: sh1, elements: [e2] }],
    },
    {
      header: h2,
      subsections: [{ header: sh2, elements: [e3, e4] }],
    },
  ]);
});

test('layOutSectionsInColumns returns all sections as leftover when nothing fits', () => {
  const result = layOutSectionsInColumns({
    sections: [
      {
        header: h1,
        subsections: [{ header: sh1, elements: [e1] }],
      },
    ],
    numColumns: 1,
    // Too small for header + sub-header + element
    maxColumnHeight: 2,
  });

  expect(result.columns).toEqual([[]]);
  expect(result.leftoverSections).toEqual([
    {
      header: h1,
      subsections: [{ header: sh1, elements: [e1] }],
    },
  ]);
});

test('layOutSectionsInColumns with empty sections', () => {
  const result = layOutSectionsInColumns({
    sections: [],
    numColumns: 2,
    maxColumnHeight: 10,
  });

  expect(result.columns).toEqual([[], []]);
  expect(result.leftoverSections).toEqual([]);
});

test('layOutSectionsInColumns drops completed sections from leftovers', () => {
  const result = layOutSectionsInColumns({
    sections: [
      {
        header: h1,
        subsections: [{ header: sh1, elements: [e1] }],
      },
      {
        header: h2,
        subsections: [{ header: sh2, elements: [e3] }],
      },
    ],
    numColumns: 1,
    // Fits first section: h1(1) + sh1(1) + e1(2) = 4, second doesn't fit
    maxColumnHeight: 4,
  });

  expect(result.columns[0]).toEqual([h1, sh1, e1]);
  expect(result.leftoverSections).toEqual([
    {
      header: h2,
      subsections: [{ header: sh2, elements: [e3] }],
    },
  ]);
});

test('layOutSectionsInColumns avoids dangling subsection headers', () => {
  const tallElement: TestElement = { id: 'tall', height: 4 };
  const result = layOutSectionsInColumns({
    sections: [
      {
        header: h1,
        subsections: [
          { header: sh1, elements: [tallElement] },
          { header: sh2, elements: [e1] },
        ],
      },
    ],
    numColumns: 2,
    maxColumnHeight: 6,
  });

  // Column 1: h1(1) + sh1(1) + tall(4) = 6, sh2 header would dangle
  // Column 2: sh2(1) + e1(2) = 3
  expect(result.columns).toEqual([
    [h1, sh1, tallElement],
    [sh2, e1],
  ]);
});

test('layOutSectionsInColumns does not leave dangling repeated subsection headers', () => {
  const tallElement: TestElement = { id: 'tall', height: 4 };
  const result = layOutSectionsInColumns({
    sections: [
      {
        header: h1,
        subsections: [{ header: sh1, elements: [e1, tallElement] }],
      },
    ],
    // Column 1: h1(1) + sh1(1) + e1(2) = 4. tallElement(4) doesn't fit.
    // Column 2: sh1(1) + tallElement(4) = 5 > 4, doesn't fit either.
    // tallElement becomes leftover, and column 2 should stay empty (no
    // dangling repeated sh1).
    numColumns: 2,
    maxColumnHeight: 4,
  });

  expect(result.columns).toEqual([[h1, sh1, e1], []]);
  expect(result.leftoverSections).toEqual([
    {
      header: h1,
      subsections: [{ header: sh1, elements: [tallElement] }],
    },
  ]);
});

test('layOutSectionsInParallelColumns fills columns in lockstep', () => {
  const result = layOutSectionsInParallelColumns({
    sections: [
      {
        header: h1,
        subsections: [{ header: sh1, elements: [e1, e2] }],
      },
      {
        header: h2,
        subsections: [{ header: sh2, elements: [e3, e4] }],
      },
    ],
    maxColumnHeight: 10,
  });

  // Both columns get header + sub-header + both elements
  expect(result.columns).toEqual([
    [h1, sh1, e1, e2],
    [h2, sh2, e3, e4],
  ]);
  expect(result.leftoverSections).toEqual([]);
});

test('layOutSectionsInParallelColumns stops when any column is full', () => {
  const result = layOutSectionsInParallelColumns({
    sections: [
      {
        header: h1,
        subsections: [{ header: sh1, elements: [e1, e2] }],
      },
      {
        header: h2,
        subsections: [{ header: sh2, elements: [e3, e4] }],
      },
    ],
    maxColumnHeight: 5,
  });

  // h1(1) + sh1(1) + e1(2) = 4, e2(2) would be 6 > 5
  expect(result.columns).toEqual([
    [h1, sh1, e1],
    [h2, sh2, e3],
  ]);
  expect(result.leftoverSections).toEqual([
    {
      header: h1,
      subsections: [{ header: sh1, elements: [e2] }],
    },
    {
      header: h2,
      subsections: [{ header: sh2, elements: [e4] }],
    },
  ]);
});

test('layOutSectionsInParallelColumns stops when new subsection doesnt fit', () => {
  const sh3: TestElement = { id: 'sub-header-3', height: 1 };
  const sh4: TestElement = { id: 'sub-header-4', height: 1 };
  const result = layOutSectionsInParallelColumns({
    sections: [
      {
        header: h1,
        subsections: [
          { header: sh1, elements: [e1] },
          { header: sh3, elements: [e2] },
        ],
      },
      {
        header: h2,
        subsections: [
          { header: sh2, elements: [e3] },
          { header: sh4, elements: [e4] },
        ],
      },
    ],
    // Fits header + first subsection: h(1)+sh(1)+e(2)=4, second sub header+elem = 3 -> 7 > 6
    maxColumnHeight: 6,
  });

  expect(result.columns).toEqual([
    [h1, sh1, e1],
    [h2, sh2, e3],
  ]);
  expect(result.leftoverSections).toEqual([
    {
      header: h1,
      subsections: [{ header: sh3, elements: [e2] }],
    },
    {
      header: h2,
      subsections: [{ header: sh4, elements: [e4] }],
    },
  ]);
});

test('layOutSectionsInParallelColumns with all elements consumed returns empty leftovers', () => {
  const result = layOutSectionsInParallelColumns({
    sections: [
      {
        header: h1,
        subsections: [{ header: sh1, elements: [e1] }],
      },
      {
        header: h2,
        subsections: [{ header: sh2, elements: [e3] }],
      },
    ],
    maxColumnHeight: 10,
  });

  expect(result.columns).toEqual([
    [h1, sh1, e1],
    [h2, sh2, e3],
  ]);
  expect(result.leftoverSections).toEqual([]);
});

test('layOutSectionsInParallelColumns stops mid-subsection without skipping to next', () => {
  const sh3: TestElement = { id: 'sub-header-3', height: 1 };
  const sh4: TestElement = { id: 'sub-header-4', height: 1 };
  const big1: TestElement = { id: 'big-1', height: 3 };
  const big2: TestElement = { id: 'big-2', height: 3 };
  const small1: TestElement = { id: 'small-1', height: 1 };
  const small2: TestElement = { id: 'small-2', height: 1 };
  const result = layOutSectionsInParallelColumns({
    sections: [
      {
        header: h1,
        subsections: [
          // First subsection: header(1) + e1(2) + big1(3) — big1 won't fit
          { header: sh1, elements: [e1, big1] },
          // Second subsection: small enough to fit in remaining space — but shouldn't be placed
          { header: sh3, elements: [small1] },
        ],
      },
      {
        header: h2,
        subsections: [
          { header: sh2, elements: [e3, big2] },
          { header: sh4, elements: [small2] },
        ],
      },
    ],
    // h(1) + sh(1) + e(2) = 4, big(3) would be 7 > 6, but sh3(1)+small(1) = 2 fits
    maxColumnHeight: 6,
  });

  // Should stop after e1/e3, not skip to second subsection
  expect(result.columns).toEqual([
    [h1, sh1, e1],
    [h2, sh2, e3],
  ]);
  // Leftovers should include remaining elements from first subsection AND second subsection
  expect(result.leftoverSections).toEqual([
    {
      header: h1,
      subsections: [
        { header: sh1, elements: [big1] },
        { header: sh3, elements: [small1] },
      ],
    },
    {
      header: h2,
      subsections: [
        { header: sh2, elements: [big2] },
        { header: sh4, elements: [small2] },
      ],
    },
  ]);
});

// Helper unit tests

test('sectionIndexOf finds element in subsections', () => {
  const section: Section<TestElement> = {
    header: h1,
    subsections: [
      { header: sh1, elements: [e1, e2] },
      { header: sh2, elements: [e3] },
    ],
  };

  expect(sectionIndexOf(section, e1)).toEqual({
    subsectionIndex: 0,
    elementIndex: 0,
  });
  expect(sectionIndexOf(section, e2)).toEqual({
    subsectionIndex: 0,
    elementIndex: 1,
  });
  expect(sectionIndexOf(section, e3)).toEqual({
    subsectionIndex: 1,
    elementIndex: 0,
  });
  expect(sectionIndexOf(section, e4)).toBeUndefined();
  // Headers are not found
  expect(sectionIndexOf(section, h1)).toBeUndefined();
});

test('sectionDrop returns remaining elements after index', () => {
  const section: Section<TestElement> = {
    header: h1,
    subsections: [
      { header: sh1, elements: [e1, e2] },
      { header: sh2, elements: [e3] },
    ],
  };

  // Drop after first element — remaining element + next subsection
  expect(sectionDrop(section, { subsectionIndex: 0, elementIndex: 0 })).toEqual(
    {
      header: h1,
      subsections: [
        { header: sh1, elements: [e2] },
        { header: sh2, elements: [e3] },
      ],
    }
  );

  // Drop after last element of first subsection — only next subsection
  expect(sectionDrop(section, { subsectionIndex: 0, elementIndex: 1 })).toEqual(
    {
      header: h1,
      subsections: [{ header: sh2, elements: [e3] }],
    }
  );

  // Drop after last element of last subsection — nothing left
  expect(
    sectionDrop(section, { subsectionIndex: 1, elementIndex: 0 })
  ).toBeUndefined();
});

test('transpose swaps rows and columns', () => {
  expect(
    transpose([
      [1, 2],
      [3, 4],
      [5, 6],
    ])
  ).toEqual([
    [1, 3, 5],
    [2, 4, 6],
  ]);
  expect(transpose([[1], [2]])).toEqual([[1, 2]]);
  expect(transpose([])).toEqual([]);
});

test('zipSections zips parallel sections into a single section of arrays', () => {
  const result = zipSections([
    {
      header: h1,
      subsections: [{ header: sh1, elements: [e1, e2] }],
    },
    {
      header: h2,
      subsections: [{ header: sh2, elements: [e3, e4] }],
    },
  ]);

  expect(result).toEqual({
    header: [h1, h2],
    subsections: [
      {
        header: [sh1, sh2],
        elements: [
          [e1, e3],
          [e2, e4],
        ],
      },
    ],
  });
});
