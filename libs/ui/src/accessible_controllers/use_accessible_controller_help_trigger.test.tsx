import { expect, test } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAccessibleControllerHelpTrigger } from './index.js';
import { simulateKeyPress } from '../test_utils.js';
import { KEYBINDINGS, Keybinding } from '../keybindings.js';

test('toggles "off" to "on" for single keypress', async () => {
  const { result } = renderHook(useAccessibleControllerHelpTrigger);

  expect(result.current.shouldShowControllerSandbox).toEqual(false);

  for (const keybinding of KEYBINDINGS) {
    if (keybinding !== Keybinding.TOGGLE_HELP) {
      await simulateKeyPress(keybinding);
      expect(result.current.shouldShowControllerSandbox).toEqual(false);
    }
  }

  await simulateKeyPress(Keybinding.TOGGLE_HELP);
  expect(result.current.shouldShowControllerSandbox).toEqual(true);
});

test('toggles "on" to "off" for two consecutive keypresses', async () => {
  const { result } = renderHook(useAccessibleControllerHelpTrigger);

  await simulateKeyPress(Keybinding.TOGGLE_HELP);
  expect(result.current.shouldShowControllerSandbox).toEqual(true);

  await simulateKeyPress(Keybinding.TOGGLE_HELP);
  await simulateKeyPress('Shift'); // Should be ignored.
  await simulateKeyPress(Keybinding.TOGGLE_HELP);
  expect(result.current.shouldShowControllerSandbox).toEqual(false);
});

test('is no-op for non-consecutive keypresses while "on"', async () => {
  const { result } = renderHook(useAccessibleControllerHelpTrigger);

  await simulateKeyPress(Keybinding.TOGGLE_HELP);
  expect(result.current.shouldShowControllerSandbox).toEqual(true);

  await simulateKeyPress(Keybinding.TOGGLE_HELP);
  await simulateKeyPress(Keybinding.SELECT);
  await simulateKeyPress(Keybinding.TOGGLE_HELP);
  expect(result.current.shouldShowControllerSandbox).toEqual(true);
});
