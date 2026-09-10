import { expect, test } from 'vitest';
import { render, screen } from '../test/react_testing_library.js';
import { TableCard } from './table_card.js';
import { makeTheme } from './themes/make_theme.js';

test('renders a table with the given header and rows', () => {
  render(
    <TableCard>
      <thead>
        <tr>
          <th>Name</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Batch 1</td>
          <td>3</td>
        </tr>
        <tr>
          <td>Batch 2</td>
          <td>5</td>
        </tr>
      </tbody>
    </TableCard>,
    { vxTheme: makeTheme({ colorMode: 'desktop', sizeMode: 'desktop' }) }
  );

  screen.getByRole('table');
  screen.getByRole('columnheader', { name: 'Name' });
  screen.getByRole('columnheader', { name: 'Count' });
  expect(screen.getAllByRole('row')).toHaveLength(3);
  screen.getByRole('cell', { name: 'Batch 2' });
  screen.getByRole('cell', { name: '5' });
});

test('passes className and style through to the card container', () => {
  render(
    <TableCard className="grow" style={{ marginTop: '1rem' }}>
      <tbody>
        <tr>
          <td>Only row</td>
        </tr>
      </tbody>
    </TableCard>
  );

  const card = screen.getByRole('table').closest('.grow');
  expect(card).not.toBeNull();
  expect(card).toHaveStyle({ marginTop: '1rem' });
});
