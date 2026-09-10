import React from 'react';
import { assert } from '@votingworks/basics';
import { cssThemedScrollbars, SCROLLBAR_THICKNESS_REM } from './scrollbars.js';
import { styled } from './styled.js';

const Grid = styled.div.attrs({ role: 'table' })<{ columnTemplate: string }>`
  display: grid;

  /* Add an extra column for the scrollbar gutter */
  grid-template-columns: ${(p) => p.columnTemplate} ${SCROLLBAR_THICKNESS_REM}rem;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: min-content;
  border: ${(p) =>
    `${p.theme.sizes.bordersRem.thin}rem solid ${p.theme.colors.outline}`};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  overflow: hidden;
`;

const Header = styled.div.attrs({ role: 'row' })`
  display: grid;

  /* Inherit the column template from Grid */
  grid-template-columns: subgrid;

  /* Span all columns */
  grid-column: 1 / -1;
  background-color: ${(p) => p.theme.colors.container};
  border-bottom: ${(p) =>
    `${p.theme.sizes.bordersRem.thin}rem solid ${p.theme.colors.outline}`};
`;

interface ColumnProps {
  /**
   * The grid width for the column (e.g. "1fr", "max-content").
   * Defaults to "auto".
   */
  width?: string;
}

const Column = styled.div
  .withConfig<ColumnProps>({
    shouldForwardProp: (prop, defaultValidatorFn) =>
      prop !== 'width' && defaultValidatorFn(prop),
  })
  .attrs({ role: 'columnheader' })`
  padding: 0.5rem 1rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
`;

const Body = styled.div.attrs({ role: 'rowgroup' })`
  display: grid;

  /* Inherit the column template from Grid */
  grid-template-columns: subgrid;

  /* Span all columns */
  grid-column: 1 / -1;

  /* Fill the remaining vertical space */
  grid-auto-rows: max-content;
  align-content: start;
  overflow: hidden auto;

  ${cssThemedScrollbars}
`;

const Row = styled.div.attrs({ role: 'row' })`
  display: grid;

  /* Inherit the column template from Body */
  grid-template-columns: subgrid;

  /* Span all columns */
  grid-column: 1 / -1;

  &:nth-child(even) {
    background-color: ${(p) => p.theme.colors.containerLow};
  }
  &:last-child {
    border-bottom: ${(p) =>
      `${p.theme.sizes.bordersRem.hairline}rem solid ${p.theme.colors.outline}`};
  }
`;

const Cell = styled.div.attrs({ role: 'cell' })`
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
`;

type ElementWithChildren = React.ReactElement<{ children?: React.ReactNode }>;

function childElements(
  children: React.ReactNode,
  allowedTypes: readonly React.ElementType[],
  message: string
): ElementWithChildren[] {
  return React.Children.toArray(children).map((child) => {
    assert(
      React.isValidElement<{ children?: React.ReactNode }>(child) &&
        allowedTypes.includes(child.type as React.ElementType),
      message
    );
    return child;
  });
}

function columnTemplateFromHeader(children: React.ReactNode): string {
  const parts = childElements(
    children,
    [Header, Body],
    'ScrollTable children must be ScrollTable.Header or ScrollTable.Body'
  );
  const headerRows = parts.filter((part) => part.type === Header);
  assert(
    headerRows.length === 1,
    'ScrollTable requires exactly one ScrollTable.Header'
  );
  const headerCells = childElements(
    headerRows[0].props.children,
    [Column],
    'ScrollTable.Header children must be ScrollTable.Column'
  ) as Array<React.ReactElement<ColumnProps>>;

  for (const body of parts.filter((part) => part.type === Body)) {
    const rows = childElements(
      body.props.children,
      [Row],
      'ScrollTable.Body children must be ScrollTable.Row'
    );
    for (const row of rows) {
      const cells = childElements(
        row.props.children,
        [Cell],
        'ScrollTable.Row children must be ScrollTable.Cell'
      );
      assert(
        cells.length === headerCells.length,
        `ScrollTable.Row has ${cells.length} cells but the header has ${headerCells.length} columns`
      );
    }
  }

  return headerCells.map((cell) => cell.props.width ?? 'auto').join(' ');
}

export interface ScrollTableProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A table component with a sticky header and scrollable body. Implemented using
 * a grid layout under the hood rather than a table element. You can specify
 * column widths using the `width` prop on `ScrollTable.Column` elements -
 * it takes grid layout CSS size specifiers.
 *
 * Usage example:
 *
 * ```tsx
 * <ScrollTable>
 *   <ScrollTable.Header>
 *     <ScrollTable.Column width="1fr">
 *       Header 1
 *     </ScrollTable.Column>
 *     <ScrollTable.Column width="min-content">
 *       Header 2
 *     </ScrollTable.Column>
 *   </ScrollTable.Header>
 *   <ScrollTable.Body>
 *     <ScrollTable.Row>
 *       <ScrollTable.Cell>Data 1</ScrollTable.Cell>
 *       <ScrollTable.Cell>Data 2</ScrollTable.Cell>
 *     </ScrollTable.Row>
 *   </ScrollTable.Body>
 * </ScrollTable>
 * ```
 *
 */
export function ScrollTable({
  children,
  className,
  style,
}: ScrollTableProps): JSX.Element {
  return (
    <Grid
      className={className}
      style={style}
      columnTemplate={columnTemplateFromHeader(children)}
    >
      {children}
    </Grid>
  );
}

ScrollTable.Header = Header;
ScrollTable.Column = Column;
ScrollTable.Body = Body;
ScrollTable.Row = Row;
ScrollTable.Cell = Cell;
