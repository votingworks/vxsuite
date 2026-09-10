import type { Meta } from '@storybook/react-vite' with {
  'resolution-mode': 'import',
};

import { range } from '@votingworks/basics';
import { ScrollTable as Component } from './scroll_table.js';

const ROW_COUNT = 20;

const meta: Meta<typeof Component> = {
  title: 'libs-ui/ScrollTable',
  component: Component,
  parameters: { showScrollBars: true },
};

export default meta;

export function ScrollTable(): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '24rem' }}>
      <Component style={{ flex: 1 }}>
        <Component.Header>
          <Component.Column width="max-content">Sync</Component.Column>
          <Component.Column width="1fr">Batch</Component.Column>
          <Component.Column width="1fr">Sheets</Component.Column>
          <Component.Column width="20rem">Scanned At</Component.Column>
        </Component.Header>
        <Component.Body>
          {range(1, ROW_COUNT + 1).map((n) => (
            <Component.Row key={n}>
              <Component.Cell>
                {n % 3 === 0 ? 'Not sent' : 'Sent'}
              </Component.Cell>
              <Component.Cell>Batch {n}</Component.Cell>
              <Component.Cell>{((n * 7) % 40) + 1}</Component.Cell>
              <Component.Cell>
                9/10/2026, 10:{String(n).padStart(2, '0')} AM
              </Component.Cell>
            </Component.Row>
          ))}
        </Component.Body>
      </Component>
    </div>
  );
}
