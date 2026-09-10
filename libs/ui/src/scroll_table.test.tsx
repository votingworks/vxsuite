import { expect, test } from 'vitest';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { render, screen } from '../test/react_testing_library.js';
import { ScrollTable } from './scroll_table.js';
import { makeTheme } from './themes/make_theme.js';

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
    </ScrollTable>,
    { vxTheme: makeTheme({ colorMode: 'desktop', sizeMode: 'desktop' }) }
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

function expectRenderToThrow(element: JSX.Element, message: string): void {
  suppressingConsoleOutput(() => {
    expect(() => render(element)).toThrow(message);
  });
}

test('requires exactly one header row', () => {
  expectRenderToThrow(
    <ScrollTable>
      <ScrollTable.Body>
        <ScrollTable.Row>
          <ScrollTable.Cell>Only row</ScrollTable.Cell>
        </ScrollTable.Row>
      </ScrollTable.Body>
    </ScrollTable>,
    'exactly one ScrollTable.Header'
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
    'exactly one ScrollTable.Header'
  );
});

test('rejects children that are not part of the table structure', () => {
  expectRenderToThrow(
    <ScrollTable>
      <ScrollTable.Header>
        <ScrollTable.Column>A</ScrollTable.Column>
      </ScrollTable.Header>
      <div>stray</div>
    </ScrollTable>,
    'ScrollTable children must be ScrollTable.Header or ScrollTable.Body'
  );
  expectRenderToThrow(
    <ScrollTable>
      <ScrollTable.Header>
        <div>A</div>
      </ScrollTable.Header>
    </ScrollTable>,
    'ScrollTable.Header children must be ScrollTable.Column'
  );
  expectRenderToThrow(
    <ScrollTable>
      <ScrollTable.Header>
        <ScrollTable.Column>A</ScrollTable.Column>
      </ScrollTable.Header>
      <ScrollTable.Body>
        <div>not a row</div>
      </ScrollTable.Body>
    </ScrollTable>,
    'ScrollTable.Body children must be ScrollTable.Row'
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
    'ScrollTable.Row children must be ScrollTable.Cell'
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
