export const IDLE_TIMEOUT_SECONDS = 5 * 60 // 5 minute
export const IDLE_RESET_TIMEOUT_SECONDS = 1 * 60 // 1 minute
export const RECENT_PRINT_EXPIRATION_SECONDS = 1 * 60 // 1 minute
export const CARD_EXPIRATION_SECONDS = 60 * 60 // 1 hour
export const CARD_POLLING_INTERVAL = 200
export const CARD_LONG_VALUE_WRITE_DELAY = 1000
export const HARDWARE_POLLING_INTERVAL = 3000
export const REPORT_PRINTING_TIMEOUT_SECONDS = 4
export const CHECK_ICON = '✓'
export const FONT_SIZES = [22, 28, 36, 48]
export const DEFAULT_FONT_SIZE = 1
export const LARGE_DISPLAY_FONT_SIZE = 3
export const TEXT_SIZE = 1
export enum YES_NO_VOTES {
  no = 'No',
  yes = 'Yes',
}
export const WRITE_IN_CANDIDATE_MAX_LENGTH = 40
export const LOW_BATTERY_THRESHOLD = 0.25
export const QUIT_KIOSK_IDLE_SECONDS = 5 * 60 // 5 minutes
export const AMERICA_TIMEZONES = [
  { label: 'Hawaii-Aleutian Time', IANAZone: 'America/Honolulu' },
  { label: 'Alaska Time', IANAZone: 'America/Anchorage' },
  { label: 'Pacific Time', IANAZone: 'America/Los_Angeles' },
  { label: 'Mountain Time (Phoenix)', IANAZone: 'America/Phoenix' },
  { label: 'Mountain Time (Denver)', IANAZone: 'America/Denver' },
  { label: 'Central Time', IANAZone: 'America/Chicago' },
  { label: 'Eastern Time', IANAZone: 'America/New_York' },
]
