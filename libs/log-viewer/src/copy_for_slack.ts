import type { LogLine } from './types';
import { isVxLogLine } from './types';

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return ts;
  }
}

function padEnd(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

export function formatLinesForSlack(lines: readonly LogLine[]): string {
  if (lines.length === 0) return '';

  const hasVxLogs = lines.some(isVxLogLine);

  if (!hasVxLogs) {
    return lines.map((l) => (isVxLogLine(l) ? l.raw : l.text)).join('\n');
  }

  const rows = lines.map((line) => {
    if (!isVxLogLine(line)) return { time: '', source: '', event: '', message: line.text };
    return {
      time: formatTimestamp(line.timeLogWritten),
      source: line.source,
      event: line.eventId,
      message: line.message,
    };
  });

  const maxSource = Math.max(...rows.map((r) => r.source.length), 6);
  const maxEvent = Math.max(...rows.map((r) => r.event.length), 5);

  const header = `${padEnd('Time', 17)}  ${padEnd(
    'Source',
    maxSource
  )}  ${padEnd('Event', maxEvent)}  Message`;
  const separator = '-'.repeat(header.length);

  const formatted = rows.map(
    (r) =>
      `${padEnd(r.time, 17)}  ${padEnd(r.source, maxSource)}  ${padEnd(
        r.event,
        maxEvent
      )}  ${r.message}`
  );

  return `\`\`\`\n${header}\n${separator}\n${formatted.join('\n')}\n\`\`\``;
}

export function formatLinesAsMarkdownTable(lines: readonly LogLine[]): string {
  if (lines.length === 0) return '';

  const hasVxLogs = lines.some(isVxLogLine);

  if (!hasVxLogs) {
    return lines.map((l) => (isVxLogLine(l) ? l.raw : l.text)).join('\n');
  }

  const header = '| Time | Source | Event | Message |';
  const divider = '|------|--------|-------|---------|';

  const rows = lines.map((line) => {
    if (!isVxLogLine(line)) return `| | | | ${line.text} |`;
    return `| ${formatTimestamp(line.timeLogWritten)} | ${line.source} | ${
      line.eventId
    } | ${line.message} |`;
  });

  return `${header}\n${divider}\n${rows.join('\n')}`;
}
