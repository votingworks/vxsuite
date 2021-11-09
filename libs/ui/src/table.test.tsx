import React from 'react';
import { render } from '@testing-library/react';

import { Table, TD } from './table';

describe('renders Table', () => {
  test('as table tag', () => {
    const { container } = render(<Table />);
    expect(container.firstChild).toMatchSnapshot();
  });

  test('can specify borderTop', () => {
    const { container } = render(
      <Table borderTop>
        <tbody>
          <tr>
            <td>Willow</td>
          </tr>
        </tbody>
      </Table>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  test('can specify condensed', () => {
    const { container } = render(
      <Table condensed>
        <tbody>
          <tr>
            <td>Evermore</td>
          </tr>
        </tbody>
      </Table>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  test('can render TD inside Table', () => {
    const { container } = render(
      <Table condensed>
        <tbody>
          <tr>
            <td>Willow</td>
            <TD>Daylight</TD>
            <TD narrow textAlign="center">
              Renegade
            </TD>
            <TD nowrap>Cardigan</TD>
            <TD narrow nowrap textAlign="right">
              Seven
            </TD>
          </tr>
        </tbody>
      </Table>
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
