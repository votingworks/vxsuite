/**
 * Keyboard keybindings for VxSuite apps.
 *
 * These are mapped to features/behaviors in various apps (some triggered via
 * accessible controllers) and are consolidated here to encourage consistency
 * and avoid accidental collisions.
 */
export enum Keybinding {
  FOCUS_NEXT = 'ArrowDown',
  FOCUS_PREVIOUS = 'ArrowUp',
  PAGE_NEXT = 'ArrowRight',
  PAGE_PREVIOUS = 'ArrowLeft',
  PLAYBACK_RATE_DOWN = ',',
  PLAYBACK_RATE_UP = '.',
  SELECT = 'Enter',
  SWITCH_LANGUAGE = 'L',
  TOGGLE_AUDIO = 'M',
  TOGGLE_HELP = 'R',
  TOGGLE_PAUSE = 'P',
  VOLUME_CYCLE = 'F17', // Storm-Interface tactile controller
  VOLUME_DOWN = '-',
  VOLUME_UP = '=',

  PAT_MOVE = '1',
  PAT_SELECT = '2',
}

export const KEYBINDINGS: readonly Keybinding[] = Object.values(
  Keybinding
).filter((k) => typeof k === 'string');

export type KeybindingAction = keyof typeof Keybinding;

/**
 * An app's mapping of keybinding actions to the keys that trigger them. An
 * action mapped to `undefined` is unavailable in that app.
 */
export type AppKeybindings = Readonly<
  Record<KeybindingAction, string | undefined>
>;

const BASE_KEYBINDINGS = {
  FOCUS_NEXT: Keybinding.FOCUS_NEXT,
  FOCUS_PREVIOUS: Keybinding.FOCUS_PREVIOUS,
  PAGE_NEXT: Keybinding.PAGE_NEXT,
  PAGE_PREVIOUS: Keybinding.PAGE_PREVIOUS,
  SELECT: Keybinding.SELECT,
  SWITCH_LANGUAGE: Keybinding.SWITCH_LANGUAGE,
  TOGGLE_AUDIO: Keybinding.TOGGLE_AUDIO,
  VOLUME_CYCLE: Keybinding.VOLUME_CYCLE,
  VOLUME_DOWN: Keybinding.VOLUME_DOWN,
  VOLUME_UP: Keybinding.VOLUME_UP,
  PAT_MOVE: Keybinding.PAT_MOVE,
  PAT_SELECT: Keybinding.PAT_SELECT,
} as const;

export const DEFAULT_KEYBINDINGS = {
  ...BASE_KEYBINDINGS,
  PLAYBACK_RATE_DOWN: Keybinding.PLAYBACK_RATE_DOWN,
  PLAYBACK_RATE_UP: Keybinding.PLAYBACK_RATE_UP,
  TOGGLE_HELP: Keybinding.TOGGLE_HELP,
  TOGGLE_PAUSE: Keybinding.TOGGLE_PAUSE,
} as const satisfies AppKeybindings;

export const MARK_KEYBINDINGS = {
  ...BASE_KEYBINDINGS,
  PLAYBACK_RATE_DOWN: undefined,
  PLAYBACK_RATE_UP: undefined,
  TOGGLE_HELP: '.',
  TOGGLE_PAUSE: ',',
} as const satisfies AppKeybindings;
