import { renderHook } from '@testing-library/react';
import { simulateKeyPress, useAccessibleControllerHelpTrigger } from '.';
import { KEYBINDINGS, Keybinding } from '../keybindings';

test('toggles "off" to "on" for single keypress', () => {
  const { result } = renderHook(useAccessibleControllerHelpTrigger);

  expect(result.current.shouldShowControllerSandbox).toEqual(false);

  for (const keybinding of KEYBINDINGS) {
    if (keybinding !== Keybinding.TOGGLE_HELP) {
      simulateKeyPress(keybinding);
      expect(result.current.shouldShowControllerSandbox).toEqual(false);
    }
  }

  simulateKeyPress(Keybinding.TOGGLE_HELP);
  expect(result.current.shouldShowControllerSandbox).toEqual(true);
});

test('toggles "on" to "off" for two consecutive keypresses', () => {
  const { result } = renderHook(useAccessibleControllerHelpTrigger);

  simulateKeyPress(Keybinding.TOGGLE_HELP);
  expect(result.current.shouldShowControllerSandbox).toEqual(true);

  simulateKeyPress(Keybinding.TOGGLE_HELP);
  simulateKeyPress('Shift'); // Should be ignored.
  simulateKeyPress(Keybinding.TOGGLE_HELP);
  expect(result.current.shouldShowControllerSandbox).toEqual(false);
});

test('is no-op for non-consecutive keypresses while "on"', () => {
  const { result } = renderHook(useAccessibleControllerHelpTrigger);

  simulateKeyPress(Keybinding.TOGGLE_HELP);
  expect(result.current.shouldShowControllerSandbox).toEqual(true);

  simulateKeyPress(Keybinding.TOGGLE_HELP);
  simulateKeyPress(Keybinding.SELECT);
  simulateKeyPress(Keybinding.TOGGLE_HELP);
  expect(result.current.shouldShowControllerSandbox).toEqual(true);
});
