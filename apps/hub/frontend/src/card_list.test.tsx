import { expect, test, vi } from 'vitest';
import { createPortal } from 'react-dom';
import userEvent from '@testing-library/user-event';
import { assertDefined } from '@votingworks/basics';
import { fireEvent, render, screen } from '../test/react_testing_library.js';
import { CardList, CardListItem } from './card_list.js';

function renderCardListItem() {
  const onPress = vi.fn();
  render(
    <CardList>
      <CardListItem
        onPress={onPress}
        leadingSlot={<div>leading</div>}
        contentSlot={<div>content</div>}
        trailingSlot={<button type="button">action</button>}
      />
    </CardList>
  );
  return onPress;
}

function getItem(): HTMLElement {
  return assertDefined(
    screen.getByText('content').closest<HTMLElement>('[role="button"]')
  );
}

test('renders all three slots', () => {
  renderCardListItem();
  screen.getByText('leading');
  screen.getByText('content');
  screen.getButton('action');
});

test('pressed on click', () => {
  const onPress = renderCardListItem();
  userEvent.click(screen.getByText('content'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('not pressed on clicks in children rendered in portals', () => {
  const onPress = vi.fn();
  render(
    <CardList>
      <CardListItem
        onPress={onPress}
        contentSlot={createPortal(
          <button type="button">portal action</button>,
          document.body
        )}
      />
    </CardList>
  );
  userEvent.click(screen.getButton('portal action'));
  expect(onPress).not.toHaveBeenCalled();
});

test('pressed with Enter or Space, but not other keys', () => {
  const onPress = renderCardListItem();
  getItem().focus();

  userEvent.keyboard('{Enter}');
  expect(onPress).toHaveBeenCalledTimes(1);

  userEvent.keyboard(' ');
  expect(onPress).toHaveBeenCalledTimes(2);

  userEvent.keyboard('a');
  expect(onPress).toHaveBeenCalledTimes(2);
});

test('not pressed on key presses bubbling up from children', () => {
  const onPress = renderCardListItem();
  fireEvent.keyDown(screen.getButton('action'), { key: 'Enter' });
  expect(onPress).not.toHaveBeenCalled();
});
