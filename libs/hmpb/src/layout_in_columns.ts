/* eslint-disable no-labels */
import { iter, assertDefined, range, assert } from '@votingworks/basics';

function findLastIndex<T>(arr: T[], keyFn: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    if (keyFn(arr[i])) {
      return i;
    }
  }
  return -1;
}

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

  function columnHeight(column: Column<Element>): number {
    return (
      iter(column)
        .map((e) => e.height)
        .sum() +
      Math.max(column.length - 1, 0) * elementGap
    );
  }

  function isColumnOverflowing(column: Column<Element>): boolean {
    return columnHeight(column) > maxColumnHeight;
  }

  function heightOfTallestColumn(columns: Array<Column<Element>>): number {
    return Math.max(...columns.map(columnHeight));
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
    const lastNonEmptyColumnIndex = findLastIndex(
      columnsSoFar,
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
        (columns) => spread(columns.map(columnHeight)),
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
  header?: Element;
  elements: readonly Element[];
}

/**
 * Lay out sections of fixed-height elements in columns. Each section has a header and may contain
 * subsections with optional headers. Layout constraints:
 * - No more than `numColumns` columns
 * - Each column must be no taller than `maxColumnHeight`
 * - Element order must be preserved when filling columns
 * - Sections and subsections may be split across columns
 * - If a subsection is split across columns, its header should be repeated at the top of the new column
 */
export function layOutSectionsInColumns<Element extends ElementWithHeight>({
  sections,
  numColumns,
  maxColumnHeight,
  elementGap = 0,
}: {
  sections: Array<Section<Element>>;
  numColumns: number;
  maxColumnHeight: number;
  // Spacing between elements within a column
  elementGap?: number;
}): {
  columns: Array<Column<Element>>;
  leftoverSections: Array<Section<Element>>;
} {
  function columnHeight(column: Column<Element>): number {
    return (
      iter(column)
        .map((e) => e.height)
        .sum() +
      Math.max(column.length - 1, 0) * elementGap
    );
  }

  const columns: Array<Column<Element>> = range(0, numColumns).map(() => []);

  let columnIndex = 0;

  function fitsInCurrentColumn(elementsToAdd: Element[]): boolean {
    return (
      columnHeight(columns[columnIndex].concat(elementsToAdd)) <=
      maxColumnHeight
    );
  }

  sectionLoop: for (const section of sections) {
    while (
      !fitsInCurrentColumn([
        section.header,
        ...(section.subsections[0].header
          ? [section.subsections[0].header]
          : []),
        section.subsections[0].elements[0],
      ])
    ) {
      columnIndex += 1;
      if (columnIndex >= numColumns) break sectionLoop;
    }
    columns[columnIndex].push(section.header);

    for (const subsection of section.subsections) {
      if (subsection.header) {
        columns[columnIndex].push(subsection.header);
      }
      for (const element of subsection.elements) {
        while (!fitsInCurrentColumn([element])) {
          if (
            columns[columnIndex][columns[columnIndex].length - 1] ===
            subsection.header
          ) {
            // If we're about to break after adding a subsection header but before adding any
            // elements, remove the subsection header to avoid dangling headers at the bottom
            // of columns.
            columns[columnIndex].pop();
          }
          columnIndex += 1;
          if (columnIndex >= numColumns) break sectionLoop;
          // Repeat subsection header at top of new column
          if (subsection.header) {
            columns[columnIndex].push(subsection.header);
          }
        }
        columns[columnIndex].push(element);
      }
    }
  }

  const leftoverSections = [];
  const lastUsedElement = iter(
    columns.findLast((column) => column.length > 0)
  ).last();
  if (lastUsedElement) {
    lastUsedElementSearch: for (const [
      sectionIndex,
      section,
    ] of sections.entries()) {
      for (const [
        subsectionIndex,
        subsection,
      ] of section.subsections.entries()) {
        for (const [elementIndex, element] of subsection.elements.entries()) {
          if (element === lastUsedElement) {
            const leftoverElements = subsection.elements.slice(
              elementIndex + 1
            );
            const leftoverSection: Section<Element> = {
              ...section,
              subsections: [
                ...(leftoverElements.length > 0
                  ? [{ ...subsection, elements: leftoverElements }]
                  : []),
                ...section.subsections.slice(subsectionIndex + 1),
              ],
            };
            if (leftoverSection.subsections.length > 0) {
              leftoverSections.push(leftoverSection);
            }
            leftoverSections.push(...sections.slice(sectionIndex + 1));
            break lastUsedElementSearch;
          }
        }
      }
    }
  } else {
    leftoverSections.push(...sections);
  }

  return {
    columns,
    leftoverSections,
  };
}

/**
 * Lay out sections of fixed-height elements in columns. Each section has a header and may contain
 * subsections with optional headers. Layout constraints:
 * - No more than `numColumns` columns
 * - Each column must be no taller than `maxColumnHeight`
 * - Element order must be preserved when filling columns
 * - Each section is kept in a single column
 * - Each column will be capped at the same number of elements (based on whichever column maxes out first)
 */
export function layoutSectionsInParallelColumns<
  Element extends ElementWithHeight,
>({
  sections,
  maxColumnHeight,
  elementGap = 0,
}: {
  sections: Array<Section<Element>>;
  maxColumnHeight: number;
  // Spacing between elements within a column
  elementGap?: number;
}): {
  columns: Array<Column<Element>>;
  leftoverSections: Array<Section<Element>>;
} {
  function columnHeight(column: Column<Element>): number {
    return (
      iter(column)
        .map((e) => e.height)
        .sum() +
      Math.max(column.length - 1, 0) * elementGap
    );
  }

  function fitsInColumn(
    column: Column<Element>,
    elementsToAdd: Element[]
  ): boolean {
    return columnHeight(column.concat(elementsToAdd)) <= maxColumnHeight;
  }

  const columns: Array<Column<Element>> = sections.map(() => []);

  const zippedSection = zipSections(sections);

  // Add section headers
  for (const [i, sectionHeader] of zippedSection.header.entries()) {
    assert(fitsInColumn(columns[i], [sectionHeader]));
    columns[i].push(sectionHeader);
  }

  for (const subsection of zippedSection.subsections) {
    // If we can't fit the header and first element of the subsection in all columns, we're done.
    if (
      !columns.every((column, i) =>
        fitsInColumn(column, [
          assertDefined(subsection.header)[i],
          subsection.elements[0][i],
        ])
      )
    ) {
      break;
    }
    // Add subsection headers
    for (const [i, subsectionHeader] of assertDefined(
      subsection.header
    ).entries()) {
      columns[i].push(subsectionHeader);
    }
    for (const elementRow of subsection.elements) {
      // If we can't fit the next element in all columns, we're done.
      if (
        !columns.every((column, i) => fitsInColumn(column, [elementRow[i]]))
      ) {
        break;
      }
      // Add elements
      for (const [i, subsectionElement] of elementRow.entries()) {
        columns[i].push(subsectionElement);
      }
    }
  }

  const lastUsedElementInFirstColumn = iter(columns[0]).last();
  if (!lastUsedElementInFirstColumn) {
    return {
      columns,
      leftoverSections: [],
    };
  }

  const lastUsedElementIndex = assertDefined(
    sectionIndexOf(sections[0], lastUsedElementInFirstColumn)
  );
  const leftoverSections = sections
    .map((section) => sectionDrop(section, lastUsedElementIndex))
    .filter((section) => section !== undefined);

  return {
    columns,
    leftoverSections,
  };
}

function zipSections<Element>(
  sections: Array<Section<Element>>
): Section<readonly Element[]> {
  assert(
    sections.every(
      (s) => s.subsections.length === sections[0].subsections.length
    )
  );
  return {
    header: sections.map((s) => s.header),
    subsections: sections[0].subsections.map((_, subsectionIndex) => ({
      header: sections.map((s) =>
        assertDefined(s.subsections[subsectionIndex].header)
      ),
      elements: transpose(
        sections.map((s) => s.subsections[subsectionIndex].elements)
      ),
    })),
  };
}

interface SectionIndex {
  subsectionIndex: number;
  elementIndex: number;
}

function sectionIndexOf<E>(
  section: Section<E>,
  element: E
): SectionIndex | undefined {
  for (const [subsectionIndex, subsection] of section.subsections.entries()) {
    for (const [
      elementIndex,
      subsectionElement,
    ] of subsection.elements.entries()) {
      if (subsectionElement === element) {
        return { subsectionIndex, elementIndex };
      }
    }
  }
  return undefined;
}

function sectionDrop<E>(
  section: Section<E>,
  index: SectionIndex
): Section<E> | undefined {
  const { subsectionIndex, elementIndex } = index;
  const slicedElements = section.subsections[subsectionIndex].elements.slice(
    elementIndex + 1
  );
  const slicedSubsections = [
    ...(slicedElements.length > 0
      ? [
          {
            ...section.subsections[subsectionIndex],
            elements: slicedElements,
          },
        ]
      : []),
    ...section.subsections.slice(subsectionIndex + 1),
  ];
  if (slicedSubsections.length === 0) {
    return undefined;
  }
  return {
    header: section.header,
    subsections: slicedSubsections,
  };
}

function transpose<E>(arrays: Array<readonly E[]>): Array<E[]> {
  if (arrays.length === 0) {
    return [];
  }
  const { length } = arrays[0];
  assert(arrays.every((arr) => arr.length === length));
  const result: Array<E[]> = [];
  for (let i = 0; i < length; i += 1) {
    result.push(arrays.map((arr) => arr[i]));
  }
  return result;
}
