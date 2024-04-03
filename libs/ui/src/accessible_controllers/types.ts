import { Keybinding } from '../keybindings';

export const MARK_SCAN_CONTROLLER_KEYBINDINGS = [
  Keybinding.PLAYBACK_RATE_DOWN,
  Keybinding.VOLUME_DOWN,
  Keybinding.FOCUS_NEXT,
  Keybinding.FOCUS_PREVIOUS,
  Keybinding.PLAYBACK_RATE_UP,
  Keybinding.VOLUME_UP,
  Keybinding.PAGE_NEXT,
  Keybinding.PAGE_PREVIOUS,
  Keybinding.SELECT,
  Keybinding.TOGGLE_HELP,
  Keybinding.TOGGLE_PAUSE,
] satisfies Keybinding[];

export type MarkScanControllerButton =
  (typeof MARK_SCAN_CONTROLLER_KEYBINDINGS)[number];

export const MARK_CONTROLLER_KEYBINDINGS = [
  Keybinding.FOCUS_NEXT,
  Keybinding.FOCUS_PREVIOUS,
  Keybinding.PAGE_NEXT,
  Keybinding.PAGE_PREVIOUS,
  Keybinding.SELECT,
] satisfies Keybinding[];

export type MarkControllerButton = (typeof MARK_CONTROLLER_KEYBINDINGS)[number];
