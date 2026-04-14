/* eslint-disable no-labels */
import { iter, assertDefined, assert, range } from '@votingworks/basics';

/**
 * Builds a comparator that compares two items by multiple scoring functions.
 * If the first scoring function returns a tie, uses the second scoring function
 * as a tiebreaker, and so on.
 */
function compareByScores<T>(scoringFns: Array<(item: T) => number>) {
  return (a: T, b: T): number => {
    for (const scoringFn of scoringFns) {
      const diff = scoringFn(a) - scoringFn(b);
      if (diff !== 0) {
        return diff;
      }
    }
    return 0;
  };
}

interface ElementWithHeight {
  height: number;
}

type Column<Element extends ElementWithHeight> = Element[];

function columnHeight<Element extends ElementWithHeight>(
  column: Column<Element>,
  elementGap: number
): number {
  return (
    iter(column)
      .map((e) => e.height)
      .sum() +
    Math.max(column.length - 1, 0) * elementGap
  );
}

/**
 * Lay out elements with fixed heights in columns, with the following constraints:
 * - No more than `numColumns` columns
 * - Each column must be no taller than `maxColumnHeight`
 * - Element order must be preserved when filling columns
 * - If not all of the elements fit, fit as many as possible and then return the
 * leftover elements
 * - If all of the elements fit, try to shorten the columns as much as possible
 * - If there are multiple ways to shorten the columns, choose the one that
 * looks the most balanced
 */
export async function layOutInColumns<Element extends ElementWithHeight>({
  elements,
  numColumns,
  maxColumnHeight,
  elementGap = 0,
}: {
  elements: AsyncIterable<Element>;
  numColumns: number;
  maxColumnHeight: number;
  // Spacing between elements within a column
  elementGap?: number;
}): Promise<{
  columns: Array<Column<Element>>;
  height: number;
}> {
  function emptyColumns(): Array<Column<Element>> {
    return range(0, numColumns).map(() => []);
  }

  function isColumnOverflowing(column: Column<Element>): boolean {
    return columnHeight(column, elementGap) > maxColumnHeight;
  }

  function heightOfTallestColumn(columns: Array<Column<Element>>): number {
    return Math.max(...columns.map((c) => columnHeight(c, elementGap)));
  }

  // First, try a greedy approach of filling columns to the max height
  const greedyColumns = emptyColumns();
  let currentColumnIndex = 0;
  const elementIterator = elements[Symbol.asyncIterator]();
  let element = await elementIterator.next();
  while (!element.done && currentColumnIndex < numColumns) {
    if (
      isColumnOverflowing(
        greedyColumns[currentColumnIndex].concat([element.value])
      )
    ) {
      currentColumnIndex += 1;
    } else {
      greedyColumns[currentColumnIndex].push(element.value);
      element = await elementIterator.next();
    }
  }

  // If the greedy approach didn't use up all the elements, then we won't be
  // able to shorten the columns, so we're done.
  if (!element.done) {
    return {
      columns: greedyColumns,
      height: heightOfTallestColumn(greedyColumns),
    };
  }

  // Otherwise, let's try to shorten the columns as much as possible while still
  // fitting all the elements.
  const allElements = greedyColumns.flat();

  // Recursively generates all possible ways to fill the columns with the given elements
  function* possibleColumns(
    columnsSoFar: Array<Column<Element>>,
    elementsLeft: Element[]
  ): Iterable<Array<Column<Element>>> {
    if (elementsLeft.length === 0) {
      yield columnsSoFar;
      return;
    }

    const [nextElement, ...restElements] = elementsLeft;

    // If there's a current column being filled, try adding the next element to it
    const lastNonEmptyColumnIndex = columnsSoFar.findLastIndex(
      (column) => column.length > 0
    );
    if (lastNonEmptyColumnIndex !== -1) {
      const newColumns = [...columnsSoFar];
      newColumns[lastNonEmptyColumnIndex] = [
        ...newColumns[lastNonEmptyColumnIndex],
        nextElement,
      ];
      if (!isColumnOverflowing(newColumns[lastNonEmptyColumnIndex])) {
        yield* possibleColumns(newColumns, restElements);
      }
    }

    // Also try adding the next element to a new column
    const firstEmptyColumnIndex = columnsSoFar.findIndex(
      (column) => column.length === 0
    );
    if (firstEmptyColumnIndex !== -1) {
      const newColumns = [...columnsSoFar];
      newColumns[firstEmptyColumnIndex] = [nextElement];
      if (!isColumnOverflowing(newColumns[firstEmptyColumnIndex])) {
        yield* possibleColumns(newColumns, restElements);
      }
    }
  }

  const allPossibleColumns = possibleColumns(emptyColumns(), allElements);

  function spread(numbers: number[]): number {
    return Math.max(...numbers) - Math.min(...numbers);
  }
  const bestColumns = assertDefined(
    iter(allPossibleColumns).min(
      compareByScores([
        // Shortest overall height
        (columns) => heightOfTallestColumn(columns),
        // Least difference in height among columns
        (columns) =>
          spread(columns.map((column) => columnHeight(column, elementGap))),
        // Least gaps (empty columns in the middle)
        (columns) => columns.findIndex((column) => column.length === 0),
      ])
    )
  );
  return {
    columns: bestColumns,
    height: heightOfTallestColumn(bestColumns),
  };
}

export interface Section<Element> {
  header: Element;
  subsections: ReadonlyArray<Subsection<Element>>;
}

export interface Subsection<Element> {
  header: Element;
  elements: readonly Element[];
}

function assertSectionsNonEmpty<Element>(
  sections: Array<Section<Element>>
): void {
  for (const section of sections) {
    assert(section.subsections.length > 0, 'Section must have subsections');
    for (const subsection of section.subsections) {
      assert(subsection.elements.length > 0, 'Subsection must have elements');
    }
  }
}

/**
 * Lay out sections of fixed-height elements in columns. Each section has a
 * header and may contain subsections with headers. Layout constraints:
 * - No more than `numColumns` columns
 * - Each column must be no taller than `maxColumnHeight`
 * - Element order must be preserved when filling columns
 * - Sections and subsections may be split across columns
 * - If a subsection is split across columns, its header is repeated at the top
 *   of the new column
 */
export function layOutSectionsInColumns<Element extends ElementWithHeight>({
  sections,
  numColumns,
  maxColumnHeight,
}: {
  sections: Array<Section<Element>>;
  numColumns: number;
  maxColumnHeight: number;
}): {
  columns: Array<Column<Element>>;
  leftoverSections: Array<Section<Element>>;
} {
  assertSectionsNonEmpty(sections);

  const columns: Array<Column<Element>> = range(0, numColumns).map(() => []);

  let columnIndex = 0;

  function fitsInCurrentColumn(elementsToAdd: Element[]): boolean {
    return (
      columnHeight(columns[columnIndex].concat(elementsToAdd), 0) <=
      maxColumnHeight
    );
  }

  // As we lay out the sections and their elements, we'll consume them from this
  // queue, making it easy to return the leftovers (just return whatever is left
  // in the queue).
  const sectionQueue = sections.map((section) => ({
    ...section,
    subsections: section.subsections.map((subsection) => ({
      ...subsection,
      elements: [...subsection.elements],
    })),
  }));

  sectionLoop: while (sectionQueue.length > 0) {
    const section = sectionQueue[0];
    while (
      !fitsInCurrentColumn([
        section.header,
        section.subsections[0].header,
        section.subsections[0].elements[0],
      ])
    ) {
      columnIndex += 1;
      if (columnIndex >= numColumns) break sectionLoop;
    }
    columns[columnIndex].push(section.header);

    while (section.subsections.length > 0) {
      const subsection = section.subsections[0];

      let elementIndex = 0;
      while (subsection.elements.length > 0) {
        const element = subsection.elements[0];

        let elementsToAdd =
          elementIndex === 0 ? [subsection.header, element] : [element];
        while (!fitsInCurrentColumn(elementsToAdd)) {
          columnIndex += 1;
          // If we split a subsection across columns, repeat the header at the
          // top of the new column
          elementsToAdd = [subsection.header, element];
          if (columnIndex >= numColumns) break sectionLoop;
        }
        columns[columnIndex].push(...elementsToAdd);

        subsection.elements.shift();
        elementIndex += 1;
      }

      section.subsections.shift();
    }

    sectionQueue.shift();
  }

  return { columns, leftoverSections: sectionQueue };
}
