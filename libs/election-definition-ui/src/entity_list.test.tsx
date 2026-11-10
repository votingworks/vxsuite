import { expect, test, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library.js';
import { EntityList } from './entity_list.js';

test('renders a titled list of selectable items', async () => {
  const onSelect = vi.fn();
  render(
    <EntityList.Box>
      <EntityList.Header>Contests</EntityList.Header>
      <EntityList.Items>
        <EntityList.Item id="item-1" onSelect={onSelect} selected>
          <EntityList.Label>Item 1</EntityList.Label>
        </EntityList.Item>
        <EntityList.Item id="item-2" onSelect={onSelect} selected={false}>
          <EntityList.Label>Item 2</EntityList.Label>
          <EntityList.Caption>Caption</EntityList.Caption>
        </EntityList.Item>
      </EntityList.Items>
    </EntityList.Box>
  );

  screen.getByRole('heading', { name: 'Contests' });
  screen.getByRole('option', { name: 'Item 1', selected: true });
  await userEvent.click(
    screen.getByRole('option', { name: 'Item 2 Caption', selected: false })
  );
  expect(onSelect).toHaveBeenCalledWith('item-2');
});
