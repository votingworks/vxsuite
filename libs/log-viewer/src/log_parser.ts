import type {
  LogLine,
  RawLogLine,
  RotationMarker,
  StitchedLogFile,
  VxLogLine,
} from './types';
import type { LogSession } from './types';
import { readLogTypeFiles } from './zip_parser';

const VX_LOG_TYPES = new Set(['vx-logs.log', 'vx-logs.errors.log']);

const KNOWN_FIELDS = new Set([
  'timeLogWritten',
  'host',
  'source',
  'eventId',
  'eventType',
  'user',
  'message',
  'disposition',
]);

function parseVxLogLine(raw: string, lineNumber: number): VxLogLine | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const extra: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!KNOWN_FIELDS.has(key)) {
        extra[key] = value;
      }
    }
    return {
      lineNumber,
      timeLogWritten: parsed['timeLogWritten'] ?? '',
      host: parsed['host'] ?? '',
      source: parsed['source'] ?? '',
      eventId: parsed['eventId'] ?? '',
      eventType: parsed['eventType'] ?? '',
      user: parsed['user'] ?? '',
      message: parsed['message'] ?? '',
      disposition: parsed['disposition'] ?? '',
      raw,
      extra,
    };
  } catch {
    return null;
  }
}

function parseRawLogLine(text: string, lineNumber: number): RawLogLine {
  return { lineNumber, text };
}

function parseFileContent(
  content: string,
  isVxLog: boolean,
  startLineNumber: number
): LogLine[] {
  const rawLines = content.split('\n');
  const lines: LogLine[] = [];
  let lineNumber = startLineNumber;

  for (const rawLine of rawLines) {
    if (!rawLine.trim()) {
      lineNumber += 1;
      continue;
    }
    if (isVxLog) {
      const vxLine = parseVxLogLine(rawLine, lineNumber);
      lines.push(vxLine ?? parseRawLogLine(rawLine, lineNumber));
    } else {
      lines.push(parseRawLogLine(rawLine, lineNumber));
    }
    lineNumber += 1;
  }

  return lines;
}

export function stitchLogFiles(
  zipData: ArrayBuffer,
  session: LogSession,
  logType: string
): StitchedLogFile {
  const isVxLog = VX_LOG_TYPES.has(logType);
  const fileContents = readLogTypeFiles(zipData, session, logType);

  // Sort by date — rotated files first (oldest to newest), current file last
  const sorted = [...fileContents].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  const allLines: LogLine[] = [];
  const rotationMarkers: RotationMarker[] = [];
  let lineNumber = 1;

  for (const file of sorted) {
    if (allLines.length > 0) {
      rotationMarkers.push({
        lineNumber,
        date: file.date ?? 'current',
      });
    }
    const lines = parseFileContent(file.content, isVxLog, lineNumber);
    allLines.push(...lines);
    lineNumber += file.content.split('\n').length;
  }

  return {
    logType,
    lines: allLines,
    rotationMarkers,
  };
}
