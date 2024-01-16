import { Result } from '@votingworks/basics';

/** type of return value from exporting logs */
export type LogsResultType = Result<
  void,
  'no-logs-directory' | 'no-usb-drive' | 'copy-failed'
>;

export interface SystemCallApi {
  exportLogsToUsb(): Promise<LogsResultType>;
}
