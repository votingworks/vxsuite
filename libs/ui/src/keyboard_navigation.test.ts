import { expect, Mock, test, vi } from 'vitest';
import { Keybinding } from './keybindings';
import {
  advanceElementFocus,
  PageNavigationButtonId,
  triggerPageNavigationButton,
} from './accessible_controllers';
import { handleKeyboardEvent } from './keyboard_navigation';

vi.mock('./accessible_controllers');

function createEvent(params: { key: Keybinding; repeat?: boolean }): {
  event: KeyboardEvent;
  mockPreventDefault: Mock<() => void>;
} {
  const mockPreventDefault = vi.fn();
  const event = {
    ...params,
    preventDefault: mockPreventDefault,
  } as unknown as KeyboardEvent;

  return { event, mockPreventDefault };
}

const mockAdvanceFocus = vi.mocked(advanceElementFocus);
const mockTriggerPageNavButton = vi.mocked(triggerPageNavigationButton);

test('focus next', () => {
  const { event, mockPreventDefault } = createEvent({
    key: Keybinding.FOCUS_NEXT,
  });
  handleKeyboardEvent(event);

  expect(mockAdvanceFocus).toHaveBeenCalledTimes(1);
  expect(mockAdvanceFocus).toHaveBeenCalledWith(1);

  expect(mockPreventDefault).toHaveBeenCalledTimes(1);

  expect(mockTriggerPageNavButton).not.toHaveBeenCalled();
});

test('focus previous', () => {
  const { event, mockPreventDefault } = createEvent({
    key: Keybinding.FOCUS_PREVIOUS,
  });
  handleKeyboardEvent(event);

  expect(mockAdvanceFocus).toHaveBeenCalledTimes(1);
  expect(mockAdvanceFocus).toHaveBeenCalledWith(-1);

  expect(mockPreventDefault).toHaveBeenCalledTimes(1);

  expect(mockTriggerPageNavButton).not.toHaveBeenCalled();
});

test('page previous', () => {
  const { event, mockPreventDefault } = createEvent({
    key: Keybinding.PAGE_PREVIOUS,
  });
  handleKeyboardEvent(event);

  expect(mockTriggerPageNavButton).toHaveBeenCalledTimes(1);
  expect(mockTriggerPageNavButton).toHaveBeenCalledWith(
    PageNavigationButtonId.PREVIOUS,
    PageNavigationButtonId.PREVIOUS_AFTER_CONFIRM
  );

  expect(mockAdvanceFocus).not.toHaveBeenCalled();
  expect(mockPreventDefault).not.toHaveBeenCalled();
});

test('page next', () => {
  const { event, mockPreventDefault } = createEvent({
    key: Keybinding.PAGE_NEXT,
  });
  handleKeyboardEvent(event);

  expect(mockTriggerPageNavButton).toHaveBeenCalledTimes(1);
  expect(mockTriggerPageNavButton).toHaveBeenCalledWith(
    PageNavigationButtonId.NEXT,
    PageNavigationButtonId.NEXT_AFTER_CONFIRM
  );

  expect(mockAdvanceFocus).not.toHaveBeenCalled();
  expect(mockPreventDefault).not.toHaveBeenCalled();
});

test('select', () => {
  const { event, mockPreventDefault } = createEvent({ key: Keybinding.SELECT });
  handleKeyboardEvent(event);

  // We rely on default browser handling of the `SELECT` button (`Enter` key).
  expect(mockTriggerPageNavButton).not.toHaveBeenCalled();
  expect(mockAdvanceFocus).not.toHaveBeenCalled();
  expect(mockPreventDefault).not.toHaveBeenCalled();
});

test('miscellaneous ignored key', () => {
  handleKeyboardEvent({ key: 'G' } as unknown as KeyboardEvent);

  expect(mockTriggerPageNavButton).not.toHaveBeenCalled();
  expect(mockAdvanceFocus).not.toHaveBeenCalled();
});

test('ignores repeated keydown events', () => {
  const { event } = createEvent({
    key: Keybinding.FOCUS_NEXT,
    repeat: true,
  });
  handleKeyboardEvent(event);

  expect(mockTriggerPageNavButton).not.toHaveBeenCalled();
  expect(mockAdvanceFocus).not.toHaveBeenCalled();
});
