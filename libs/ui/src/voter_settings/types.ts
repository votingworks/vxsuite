/* istanbul ignore next - @preserve */
export const PANE_IDS = [
  'voterSettingsColor',
  'voterSettingsSize',
  'voterSettingsAudio',
] as const;
export type SettingsPaneId = (typeof PANE_IDS)[number];
