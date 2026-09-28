import type { EnumValues } from '@votingworks/basics';

export const AccessibilityMode = {
  SWITCH_SCANNING: 'switch-scanning',
  ATI_CONTROLLER: 'ati-controller,',
} as const;

export type AccessibilityMode = EnumValues<typeof AccessibilityMode>;
