/* istanbul ignore next */
export const PANE_IDS = [
  'displaySettingsColor',
  'displaySettingsSize',
] as const;
export type SettingsPaneId = typeof PANE_IDS[number];
