/* istanbul ignore file - @preserve */
export * from './api';
export * as audio from './get_audio_info';
export type { LogsResultType } from './export_logs_to_usb';
export { getBatteryInfo } from './get_battery_info';
export type { BatteryInfo } from './get_battery_info';
export {
  type SetAudioVolumeErr,
  type SetAudioVolumeResult,
  setAudioVolume,
} from './set_audio_volume';
export {
  type SetDefaultAudioErr,
  type SetDefaultAudioResult,
  setDefaultAudio,
} from './set_default_audio';
export { reboot } from './reboot';
