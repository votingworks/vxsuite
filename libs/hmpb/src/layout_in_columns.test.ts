import { describe, expect, test, vi } from 'vitest';
import * as fc from 'fast-check';
import { iter } from '@votingworks/basics';
import {
  layOutInColumns,
  layOutSectionsInColumns,
  Section,
} from './layout_in_columns';

interface TestElement {
  readonly id: string;
  readonly height: number;
}

describe('layOutInColumns', () => {
  const a1: TestElement = { id: 'a', height: 1 };
  const b1: TestElement = { id: 'b', height: 1 };
  const c2: TestElement = { id: 'c', height: 2 };
  const d2: TestElement = { id: 'd', height: 2 };

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
});

describe('layOutSectionsInColumns', () => {
  const hA1: TestElement = { id: 'header-a', height: 1 };
  const hB1: TestElement = { id: 'header-b', height: 1 };
  const shA1: TestElement = { id: 'sub-header-a', height: 1 };
  const shB1: TestElement = { id: 'sub-header-b', height: 1 };
  const eA2: TestElement = { id: 'elem-a', height: 2 };
  const eB2: TestElement = { id: 'elem-b', height: 2 };
  const eC2: TestElement = { id: 'elem-c', height: 2 };
  const eD2: TestElement = { id: 'elem-d', height: 2 };

  test('fits a single section in one column', () => {
    const result = layOutSectionsInColumns({
      sections: [
        {
          header: hA1,
          subsections: [{ header: shA1, elements: [eA2] }],
        },
      ],
      numColumns: 2,
      maxColumnHeight: 10,
    });

    expect(result.columns).toEqual([[hA1, shA1, eA2], []]);
    expect(result.leftoverSections).toEqual([]);
  });

  test('splits sections across columns', () => {
    const result = layOutSectionsInColumns({
      sections: [
        {
          header: hA1,
          subsections: [{ header: shA1, elements: [eA2, eB2, eC2] }],
        },
      ],
      numColumns: 2,
      maxColumnHeight: 5,
    });

    // Column 1: hA1 + shA1 + eA2 = 4, eB2 won't fit
    // Column 2: shA1 repeated + eB2 + eC2 = 5
    expect(result.columns).toEqual([
      [hA1, shA1, eA2],
      [shA1, eB2, eC2],
    ]);
    expect(result.leftoverSections).toEqual([]);
  });

  test('returns leftover elements from a split subsection', () => {
    const result = layOutSectionsInColumns({
      sections: [
        {
          header: hA1,
          subsections: [{ header: shA1, elements: [eA2, eB2] }],
        },
        {
          header: hB1,
          subsections: [{ header: shB1, elements: [eC2, eD2] }],
        },
      ],
      numColumns: 1,
      maxColumnHeight: 5,
    });

    // Only first section's first element fits: hA1 + shA1 + eA2 = 4
    expect(result.columns[0]).toEqual([hA1, shA1, eA2]);
    // Leftover includes remaining element from first section + entire second section
    expect(result.leftoverSections).toEqual([
      {
        header: hA1,
        subsections: [{ header: shA1, elements: [eB2] }],
      },
      {
        header: hB1,
        subsections: [{ header: shB1, elements: [eC2, eD2] }],
      },
    ]);
  });

  test('returns all sections as leftover when nothing fits', () => {
    const result = layOutSectionsInColumns({
      sections: [
        {
          header: hA1,
          subsections: [{ header: shA1, elements: [eA2] }],
        },
      ],
      numColumns: 1,
      // Too small for header + sub-header + element
      maxColumnHeight: 2,
    });

    expect(result.columns).toEqual([[]]);
    expect(result.leftoverSections).toEqual([
      {
        header: hA1,
        subsections: [{ header: shA1, elements: [eA2] }],
      },
    ]);
  });

  test('with empty sections', () => {
    const result = layOutSectionsInColumns({
      sections: [],
      numColumns: 2,
      maxColumnHeight: 10,
    });

    expect(result.columns).toEqual([[], []]);
    expect(result.leftoverSections).toEqual([]);
  });

  test('drops completed sections from leftovers', () => {
    const result = layOutSectionsInColumns({
      sections: [
        {
          header: hA1,
          subsections: [{ header: shA1, elements: [eA2] }],
        },
        {
          header: hB1,
          subsections: [{ header: shB1, elements: [eC2] }],
        },
      ],
      numColumns: 1,
      // Fits first section: hA1 + shA1 + eA2 = 4, second doesn't fit
      maxColumnHeight: 4,
    });

    expect(result.columns[0]).toEqual([hA1, shA1, eA2]);
    expect(result.leftoverSections).toEqual([
      {
        header: hB1,
        subsections: [{ header: shB1, elements: [eC2] }],
      },
    ]);
  });

  test('avoids dangling subsection headers', () => {
    const eT4: TestElement = { id: 'tall', height: 4 };
    const result = layOutSectionsInColumns({
      sections: [
        {
          header: hA1,
          subsections: [
            { header: shA1, elements: [eT4] },
            { header: shB1, elements: [eA2] },
          ],
        },
      ],
      numColumns: 2,
      maxColumnHeight: 6,
    });

    // Column 1: hA1 + shA1 + eT4 = 6, shB1 header would dangle
    // Column 2: shB1 + eA2 = 3
    expect(result.columns).toEqual([
      [hA1, shA1, eT4],
      [shB1, eA2],
    ]);
  });

  test('does not leave dangling repeated subsection headers', () => {
    const eT4: TestElement = { id: 'tall', height: 4 };
    const result = layOutSectionsInColumns({
      sections: [
        {
          header: hA1,
          subsections: [{ header: shA1, elements: [eA2, eT4] }],
        },
      ],
      // Column 1: hA1 + shA1 + eA2 = 4. eT4 doesn't fit.
      // Column 2: shA1 + eT4 = 5 > 4, doesn't fit either.
      // eT4 becomes leftover, and column 2 should stay empty (no
      // dangling repeated shA1).
      numColumns: 2,
      maxColumnHeight: 4,
    });

    expect(result.columns).toEqual([[hA1, shA1, eA2], []]);
    expect(result.leftoverSections).toEqual([
      {
        header: hA1,
        subsections: [{ header: shA1, elements: [eT4] }],
      },
    ]);
  });

  test('multiple subsections in one section both fit', () => {
    const result = layOutSectionsInColumns({
      sections: [
        {
          header: hA1,
          subsections: [
            { header: shA1, elements: [eA2] },
            { header: shB1, elements: [eB2] },
          ],
        },
      ],
      numColumns: 1,
      maxColumnHeight: 10,
    });

    expect(result.columns).toEqual([[hA1, shA1, eA2, shB1, eB2]]);
    expect(result.leftoverSections).toEqual([]);
  });

  test('section header advances to next column when current is too full', () => {
    const eE2: TestElement = { id: 'elem-e', height: 2 };
    const result = layOutSectionsInColumns({
      sections: [
        {
          header: hA1,
          subsections: [{ header: shA1, elements: [eA2] }],
        },
        {
          header: hB1,
          // hB1 + shB1 + eE2 = 5, won't fit in column 1 after hA1+shA1+eA2=4
          subsections: [{ header: shB1, elements: [eE2] }],
        },
      ],
      numColumns: 2,
      maxColumnHeight: 5,
    });

    expect(result.columns).toEqual([
      [hA1, shA1, eA2],
      [hB1, shB1, eE2],
    ]);
    expect(result.leftoverSections).toEqual([]);
  });

  test('column break on non-first element of subsection', () => {
    const result = layOutSectionsInColumns({
      sections: [
        {
          header: hA1,
          subsections: [{ header: shA1, elements: [eA2, eB2, eC2] }],
        },
      ],
      numColumns: 2,
      // hA1 + shA1 + eA2 + eB2 = 6, eC2 won't fit
      maxColumnHeight: 6,
    });

    // eC2 overflows to column 2 with repeated shA1
    expect(result.columns).toEqual([
      [hA1, shA1, eA2, eB2],
      [shA1, eC2],
    ]);
    expect(result.leftoverSections).toEqual([]);
  });
});

describe('layOutSectionsInColumns invariants', () => {
  function flatElements<E>(sections: Array<Section<E>>): E[] {
    return sections.flatMap((section) =>
      section.subsections.flatMap((subsection) => [...subsection.elements])
    );
  }

  function sumHeights(column: TestElement[]): number {
    return iter(column)
      .map((e) => e.height)
      .sum();
  }

  test('generative: placed + leftover = original elements, columns respect max height', () => {
    fc.assert(
      fc.property(
        // Generate 1-4 sections, each with 1-3 subsections, each with 1-5 elements
        fc.array(
          fc.record({
            headerHeight: fc.integer({ min: 1, max: 2 }),
            subsections: fc.array(
              fc.record({
                headerHeight: fc.integer({ min: 1, max: 2 }),
                elementHeights: fc.array(fc.integer({ min: 1, max: 5 }), {
                  minLength: 1,
                  maxLength: 5,
                }),
              }),
              { minLength: 1, maxLength: 3 }
            ),
          }),
          { minLength: 1, maxLength: 4 }
        ),
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 3, max: 20 }),
        (sectionSpecs, numColumns, maxColumnHeight) => {
          let nextId = 0;
          function makeElement(height: number): TestElement {
            nextId += 1;
            return { id: `e${nextId}`, height };
          }

          const sections: Array<Section<TestElement>> = sectionSpecs.map(
            (spec) => ({
              header: makeElement(spec.headerHeight),
              subsections: spec.subsections.map((subSpec) => ({
                header: makeElement(subSpec.headerHeight),
                elements: subSpec.elementHeights.map(makeElement),
              })),
            })
          );

          const originalElements = flatElements(sections);

          const result = layOutSectionsInColumns({
            sections,
            numColumns,
            maxColumnHeight,
          });

          // Placed elements + leftover elements = original elements (in order)
          const placedElements = result.columns.flatMap((col) =>
            col.filter((item) => originalElements.includes(item))
          );
          const leftoverElements = flatElements(result.leftoverSections);
          expect([...placedElements, ...leftoverElements]).toEqual(
            originalElements
          );

          // No column exceeds max height
          for (const column of result.columns) {
            expect(sumHeights(column)).toBeLessThanOrEqual(maxColumnHeight);
          }

          // Correct number of columns
          expect(result.columns).toHaveLength(numColumns);

          // Leftover sections are well-formed
          for (const section of result.leftoverSections) {
            expect(section.subsections.length).toBeGreaterThan(0);
            for (const subsection of section.subsections) {
              expect(subsection.elements.length).toBeGreaterThan(0);
            }
          }

          // Leftover headers come from the input
          const originalSectionHeaders = sections.map((s) => s.header);
          const originalSubsectionHeaders = sections.flatMap((s) =>
            s.subsections.map((sub) => sub.header)
          );
          for (const section of result.leftoverSections) {
            expect(originalSectionHeaders).toContain(section.header);
            for (const subsection of section.subsections) {
              expect(originalSubsectionHeaders).toContain(subsection.header);
            }
          }

          // Build lookups for column structure checks
          const sectionHeaderSet = new Set(sections.map((s) => s.header));
          const subsectionToSection = new Map<TestElement, TestElement>();
          const elementToSubsection = new Map<TestElement, TestElement>();
          for (const section of sections) {
            for (const subsection of section.subsections) {
              subsectionToSection.set(subsection.header, section.header);
              for (const element of subsection.elements) {
                elementToSubsection.set(element, subsection.header);
              }
            }
          }

          const subsectionHeaderSet = new Set(subsectionToSection.keys());
          const sectionHeadersSeen = new Set<TestElement>();
          for (const column of result.columns) {
            const subsectionHeadersInColumn = new Set<TestElement>();
            for (const item of column) {
              if (sectionHeaderSet.has(item)) {
                // Each section header appears at most once across all columns
                expect(sectionHeadersSeen).not.toContain(item);
                sectionHeadersSeen.add(item);
              } else if (subsectionHeaderSet.has(item)) {
                // Each subsection header appears at most once per column
                expect(subsectionHeadersInColumn).not.toContain(item);
                // Subsection header's section header has already appeared
                const sectionHeader = subsectionToSection.get(item)!;
                expect(sectionHeadersSeen).toContain(sectionHeader);
                subsectionHeadersInColumn.add(item);
              } else {
                // Element is preceded by its subsection header in this column
                const subsectionHeader = elementToSubsection.get(item)!;
                expect(subsectionHeadersInColumn).toContain(subsectionHeader);
              }
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
