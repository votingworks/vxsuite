import { Keybinding } from '../../keybindings.js';

export const behaviorToKeypressMap = {
  Move: Keybinding.PAT_MOVE,
  Select: Keybinding.PAT_SELECT,
} as const;

export const validKeypressValues: string[] = Object.values(
  behaviorToKeypressMap
);
