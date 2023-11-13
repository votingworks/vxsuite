import { render, screen } from '../test/react_testing_library';

import { Table, TD, TH } from './table';

test('default table', () => {
  render(
    <Table>
      <tbody>
        <tr>
          <td>default</td>
        </tr>
      </tbody>
    </Table>
  );
  const table = screen.getByText('default').closest('table');
  const dataCell = { modifier: '& td' } as const;
  expect(table).toHaveStyleRule('padding', '0.25rem 0.5rem', dataCell);
});

test('table with borderTop', () => {
  render(
    <Table borderTop>
      <tbody>
        <tr>
          <td>border-top</td>
        </tr>
      </tbody>
    </Table>
  );
  const table = screen.getByText('border-top').closest('table');
  expect(table).toHaveStyleRule('border-top', '0.1rem solid #222222');
});

test('table with expanded', () => {
  render(
    <Table expanded>
      <tbody>
        <tr>
          <td>expanded</td>
        </tr>
      </tbody>
    </Table>
  );
  const table = screen.getByText('expanded').closest('table');
  const dataCell = { modifier: '& td' } as const;
  expect(table).toHaveStyleRule('padding', '0.25rem 1rem', dataCell);
});

test('table with condensed', () => {
  render(
    <Table condensed>
      <tbody>
        <tr>
          <td>condensed</td>
        </tr>
      </tbody>
    </Table>
  );
  const table = screen.getByText('condensed').closest('table');
  const dataCell = { modifier: '& td' } as const;
  expect(table).toHaveStyleRule('padding', '0.125rem 0.25rem', dataCell);
});

test('can render TD with props', () => {
  render(
    <Table condensed>
      <tbody>
        <tr>
          <TD>default</TD>
          <TD textAlign="center">center</TD>
          <TD textAlign="right">right</TD>
          <TD textAlign="left">left</TD>
          <TD nowrap>nowrap</TD>
          <TD narrow>narrow</TD>
        </tr>
      </tbody>
    </Table>
  );
  const td = screen.getByText('default');
  expect(td).not.toHaveStyleRule('width');
  expect(td).not.toHaveStyleRule('text-align');
  expect(td).not.toHaveStyleRule('white-space');
  const center = screen.getByText('center');
  expect(center).toHaveStyleRule('text-align', 'center');
  const right = screen.getByText('right');
  expect(right).toHaveStyleRule('text-align', 'right');
  const left = screen.getByText('left');
  expect(left).toHaveStyleRule('text-align', 'left');
  const nowrap = screen.getByText('nowrap');
  expect(nowrap).toHaveStyleRule('white-space', 'nowrap');
  const narrow = screen.getByText('narrow');
  expect(narrow).toHaveStyleRule('width', '1%');
});

test('can render TH with props', () => {
  render(
    <Table condensed>
      <thead>
        <tr>
          <TH>default</TH>
          <TH textAlign="center">center</TH>
          <TH textAlign="right">right</TH>
          <TH textAlign="left">left</TH>
          <TH nowrap={false}>nowrap</TH>
          <TH narrow>narrow</TH>
        </tr>
      </thead>
    </Table>
  );
  const th = screen.getByText('default');
  expect(th).not.toHaveStyleRule('width');
  expect(th).not.toHaveStyleRule('text-align');
  expect(th).toHaveStyleRule('white-space', 'nowrap');
  const center = screen.getByText('center');
  expect(center).toHaveStyleRule('text-align', 'center');
  const right = screen.getByText('right');
  expect(right).toHaveStyleRule('text-align', 'right');
  const left = screen.getByText('left');
  expect(left).toHaveStyleRule('text-align', 'left');
  const nowrap = screen.getByText('nowrap');
  expect(nowrap).not.toHaveStyleRule('white-space');
  const narrow = screen.getByText('narrow');
  expect(narrow).toHaveStyleRule('width', '1%');
});
