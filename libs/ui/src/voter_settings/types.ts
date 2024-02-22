/* istanbul ignore next */
export const PANE_IDS = [
  'voterSettingsColor',
  'voterSettingsSize',
  'voterSettingsAudioVideoOnly',
] as const;
export type SettingsPaneId = (typeof PANE_IDS)[number];
