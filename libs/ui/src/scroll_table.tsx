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

function flattenChildren(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap((child) =>
    React.isValidElement<{ children?: React.ReactNode }>(child) &&
    child.type === React.Fragment
      ? flattenChildren(child.props.children)
      : [child]
  );
}

function elementChildren(
  children: React.ReactNode,
  message: string
): ElementWithChildren[] {
  return flattenChildren(children).map((child) => {
    assert(
      React.isValidElement<{ children?: React.ReactNode }>(child),
      message
    );
    return child;
  });
}

function columnTemplateFromHeader(children: React.ReactNode): string {
  const [header, body, ...rest] = flattenChildren(children);
  assert(
    React.isValidElement<{ children?: React.ReactNode }>(header) &&
      header.type === Header &&
      (body === undefined ||
        (React.isValidElement<{ children?: React.ReactNode }>(body) &&
          body.type === Body)) &&
      rest.length === 0,
    'ScrollTable children must be a ScrollTable.Header followed by an optional ScrollTable.Body'
  );
  const columns = elementChildren(
    header.props.children,
    'ScrollTable.Header children must be column elements'
  ) as Array<React.ReactElement<ColumnProps>>;

  if (body !== undefined) {
    const rows = elementChildren(
      body.props.children,
      'ScrollTable.Body children must be row elements'
    );
    for (const row of rows) {
      const cells = elementChildren(
        row.props.children,
        'ScrollTable.Row children must be cell elements'
      );
      assert(
        cells.length === columns.length,
        `ScrollTable.Row has ${cells.length} cells but the header has ${columns.length} columns`
      );
    }
  }

  return columns.map((column) => column.props.width ?? 'auto').join(' ');
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
