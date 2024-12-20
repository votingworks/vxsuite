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
  VOLUME_DOWN = '-',
  VOLUME_UP = '=',

  PAT_MOVE = '1',
  PAT_SELECT = '2',
}

export const KEYBINDINGS: readonly Keybinding[] = Object.values(
  Keybinding
).filter((k) => typeof k === 'string');
