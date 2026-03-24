export interface LogZipEntry {
  readonly path: string;
  readonly compressedData: Uint8Array;
  readonly isGzipped: boolean;
}

export interface LogFile {
  readonly name: string;
  readonly baseName: string;
  readonly date?: string;
  readonly isGzipped: boolean;
  readonly path: string;
}

export interface LogSession {
  readonly timestamp: string;
  readonly files: readonly LogFile[];
  readonly logTypes: readonly string[];
}

export interface LogMachine {
  readonly id: string;
  readonly sessions: readonly LogSession[];
}

export interface LogZipContents {
  readonly machines: readonly LogMachine[];
}

export interface VxLogLine {
  readonly lineNumber: number;
  readonly timeLogWritten: string;
  readonly host: string;
  readonly source: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly user: string;
  readonly message: string;
  readonly disposition: string;
  readonly raw: string;
  readonly extra: Readonly<Record<string, string>>;
}

export interface RawLogLine {
  readonly lineNumber: number;
  readonly text: string;
}

export type LogLine = VxLogLine | RawLogLine;

export function isVxLogLine(line: LogLine): line is VxLogLine {
  return 'eventId' in line;
}

export interface RotationMarker {
  readonly lineNumber: number;
  readonly date: string;
}

export interface StitchedLogFile {
  readonly logType: string;
  readonly lines: readonly LogLine[];
  readonly rotationMarkers: readonly RotationMarker[];
}

export interface LogSelection {
  readonly machineId: string;
  readonly sessionTimestamp: string;
  readonly logType: string;
}

export interface FilterState {
  readonly eventId: string;
  readonly source: string;
  readonly eventType: string;
  readonly disposition: string;
  readonly searchText: string;
  readonly timeStart: string;
  readonly timeEnd: string;
}

export const EMPTY_FILTER_STATE: FilterState = {
  eventId: '',
  source: '',
  eventType: '',
  disposition: '',
  searchText: '',
  timeStart: '',
  timeEnd: '',
};
