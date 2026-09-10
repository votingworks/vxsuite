import React from 'react';
import { expect, test } from 'vitest';
import { range } from '@votingworks/basics';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { render, screen, within } from '../test/react_testing_library.js';
import { ScrollTable } from './scroll_table.js';
import { styled } from './styled.js';

test('renders header and rows with table semantics and derives column sizes', () => {
  render(
    <ScrollTable className="grow" style={{ marginTop: '1rem' }}>
      <ScrollTable.Header>
        <ScrollTable.Column width="max-content">Name</ScrollTable.Column>
        <ScrollTable.Column>Count</ScrollTable.Column>
        <ScrollTable.Column width="1fr" />
      </ScrollTable.Header>
      <ScrollTable.Body>
        <ScrollTable.Row>
          <ScrollTable.Cell>Batch 1</ScrollTable.Cell>
          <ScrollTable.Cell>3</ScrollTable.Cell>
          <ScrollTable.Cell />
        </ScrollTable.Row>
        <ScrollTable.Row>
          <ScrollTable.Cell>Batch 2</ScrollTable.Cell>
          <ScrollTable.Cell>5</ScrollTable.Cell>
          <ScrollTable.Cell />
        </ScrollTable.Row>
      </ScrollTable.Body>
    </ScrollTable>
  );

  const table = screen.getByRole('table');
  expect(table).toHaveClass('grow');
  expect(table).toHaveStyle({ marginTop: '1rem' });
  expect(table).toHaveStyleRule(
    'grid-template-columns',
    'max-content auto 1fr 0.45rem'
  );
  screen.getByRole('columnheader', { name: 'Name' });
  screen.getByRole('columnheader', { name: 'Count' });
  expect(screen.getAllByRole('row')).toHaveLength(3);
  screen.getByRole('cell', { name: 'Batch 2' });
  screen.getByRole('cell', { name: '5' });
});

const NumericCell = styled(ScrollTable.Cell)`
  justify-content: end;
`;

const NumericColumn = styled(ScrollTable.Column)`
  text-align: end;
`;

function LabelCell({ children }: { children: React.ReactNode }): JSX.Element {
  return <ScrollTable.Cell>{children}</ScrollTable.Cell>;
}

test('accepts rows from arrays, conditional children, fragments, styled parts, and wrappers', () => {
  render(
    <ScrollTable>
      <ScrollTable.Header>
        <ScrollTable.Column>Name</ScrollTable.Column>
        {false}
        <NumericColumn width="6rem">Count</NumericColumn>
      </ScrollTable.Header>
      <ScrollTable.Body>
        {range(1, 3).map((n) => (
          <ScrollTable.Row key={n}>
            <LabelCell>Batch {n}</LabelCell>
            {null}
            <NumericCell>{n * 10}</NumericCell>
          </ScrollTable.Row>
        ))}
        <React.Fragment>
          {range(3, 6).map((n) => (
            <ScrollTable.Row key={n}>
              <LabelCell>Batch {n}</LabelCell>
              <NumericCell>{n * 10}</NumericCell>
            </ScrollTable.Row>
          ))}
        </React.Fragment>
      </ScrollTable.Body>
    </ScrollTable>
  );

  expect(screen.getByRole('table')).toHaveStyleRule(
    'grid-template-columns',
    'auto 6rem 0.45rem'
  );
  const body = screen.getByRole('rowgroup');
  expect(within(body).getAllByRole('row')).toHaveLength(5);
  expect(within(body).getAllByRole('cell')).toHaveLength(10);
  within(body).getByRole('cell', { name: '50' });
});

test('renders a header without a body', () => {
  render(
    <ScrollTable>
      <ScrollTable.Header>
        <ScrollTable.Column>Name</ScrollTable.Column>
      </ScrollTable.Header>
    </ScrollTable>
  );

  screen.getByRole('columnheader', { name: 'Name' });
  expect(screen.queryByRole('rowgroup')).not.toBeInTheDocument();
});

function expectRenderToThrow(element: JSX.Element, message: string): void {
  function ignoreReportedError(event: ErrorEvent) {
    event.preventDefault();
  }
  window.addEventListener('error', ignoreReportedError);
  try {
    suppressingConsoleOutput(() => {
      expect(() => render(element)).toThrow(message);
    });
  } finally {
    window.removeEventListener('error', ignoreReportedError);
  }
}

const SHAPE_MESSAGE =
  'ScrollTable children must be a ScrollTable.Header followed by an optional ScrollTable.Body';

test('requires a header followed by an optional body', () => {
  expectRenderToThrow(
    <ScrollTable>
      <ScrollTable.Body>
        <ScrollTable.Row>
          <ScrollTable.Cell>Only row</ScrollTable.Cell>
        </ScrollTable.Row>
      </ScrollTable.Body>
    </ScrollTable>,
    SHAPE_MESSAGE
  );
  expectRenderToThrow(
    <ScrollTable>
      <ScrollTable.Header>
        <ScrollTable.Column>A</ScrollTable.Column>
      </ScrollTable.Header>
      <ScrollTable.Header>
        <ScrollTable.Column>B</ScrollTable.Column>
      </ScrollTable.Header>
    </ScrollTable>,
    SHAPE_MESSAGE
  );
  expectRenderToThrow(
    <ScrollTable>
      <ScrollTable.Body />
      <ScrollTable.Header>
        <ScrollTable.Column>A</ScrollTable.Column>
      </ScrollTable.Header>
    </ScrollTable>,
    SHAPE_MESSAGE
  );
  expectRenderToThrow(
    <ScrollTable>
      <ScrollTable.Header>
        <ScrollTable.Column>A</ScrollTable.Column>
      </ScrollTable.Header>
      <ScrollTable.Body />
      <ScrollTable.Body />
    </ScrollTable>,
    SHAPE_MESSAGE
  );
  expectRenderToThrow(
    <ScrollTable>
      <ScrollTable.Header>
        <ScrollTable.Column>A</ScrollTable.Column>
      </ScrollTable.Header>
      <div>stray</div>
    </ScrollTable>,
    SHAPE_MESSAGE
  );
});

test('requires columns, rows, and cells to be elements', () => {
  expectRenderToThrow(
    <ScrollTable>
      <ScrollTable.Header>not a column</ScrollTable.Header>
    </ScrollTable>,
    'ScrollTable.Header children must be column elements'
  );
  expectRenderToThrow(
    <ScrollTable>
      <ScrollTable.Header>
        <ScrollTable.Column>A</ScrollTable.Column>
      </ScrollTable.Header>
      <ScrollTable.Body>not a row</ScrollTable.Body>
    </ScrollTable>,
    'ScrollTable.Body children must be row elements'
  );
  expectRenderToThrow(
    <ScrollTable>
      <ScrollTable.Header>
        <ScrollTable.Column>A</ScrollTable.Column>
      </ScrollTable.Header>
      <ScrollTable.Body>
        <ScrollTable.Row>not a cell</ScrollTable.Row>
      </ScrollTable.Body>
    </ScrollTable>,
    'ScrollTable.Row children must be cell elements'
  );
});

test('requires every row to have one cell per column', () => {
  expectRenderToThrow(
    <ScrollTable>
      <ScrollTable.Header>
        <ScrollTable.Column>A</ScrollTable.Column>
        <ScrollTable.Column>B</ScrollTable.Column>
      </ScrollTable.Header>
      <ScrollTable.Body>
        <ScrollTable.Row>
          <ScrollTable.Cell>only one</ScrollTable.Cell>
        </ScrollTable.Row>
      </ScrollTable.Body>
    </ScrollTable>,
    'ScrollTable.Row has 1 cells but the header has 2 columns'
  );
});
