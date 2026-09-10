import type { Meta } from '@storybook/react-vite' with {
  'resolution-mode': 'import',
};

import { range } from '@votingworks/basics';
import { TableCard as Component } from './table_card.js';

const ROW_COUNT = 30;

const meta: Meta<typeof Component> = {
  title: 'libs-ui/TableCard',
  component: Component,
  parameters: { showScrollBars: true },
};

export default meta;

export function TableCard(): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '24rem' }}>
      <Component style={{ flex: 1 }}>
        <thead>
          <tr>
            <th>Batch</th>
            <th>Sheets</th>
            <th>Scanned At</th>
          </tr>
        </thead>
        <tbody>
          {range(1, ROW_COUNT + 1).map((n) => (
            <tr key={n}>
              <td>Batch {n}</td>
              <td>{((n * 7) % 40) + 1}</td>
              <td>9/10/2026, 10:{String(n).padStart(2, '0')} AM</td>
            </tr>
          ))}
        </tbody>
      </Component>
    </div>
  );
}
