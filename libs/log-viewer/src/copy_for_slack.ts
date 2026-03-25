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

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function serializeExtra(extra: Readonly<Record<string, string>>): string {
  const entries = Object.entries(extra);
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}=${v}`).join(' ');
}

function hasMultipleSources(lines: readonly LogLine[]): boolean {
  const sources = new Set<string>();
  for (const line of lines) {
    if (isVxLogLine(line)) {
      sources.add(line.source);
      if (sources.size > 1) return true;
    }
  }
  return false;
}

export function formatLinesAsHtmlTable(lines: readonly LogLine[]): string {
  if (lines.length === 0) return '';

  const hasVxLogs = lines.some(isVxLogLine);
  if (!hasVxLogs) {
    return `<pre>${lines
      .map((l) => escapeHtml(isVxLogLine(l) ? l.raw : l.text))
      .join('\n')}</pre>`;
  }

  const showSource = hasMultipleSources(lines);

  const headers = ['Time', 'Event', 'Message', 'Details'];
  if (showSource) headers.splice(1, 0, 'Source');

  const headerRow = headers.map((h) => `<th>${h}</th>`).join('');

  const bodyRows = lines.map((line) => {
    if (!isVxLogLine(line)) {
      const colspan = headers.length;
      return `<tr><td colspan="${colspan}">${escapeHtml(line.text)}</td></tr>`;
    }
    const cells = [
      formatTimestamp(line.timeLogWritten),
      ...(showSource ? [line.source] : []),
      line.eventId,
      line.message,
      serializeExtra(line.extra),
    ];
    return `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`;
  });

  return `<table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows.join(
    ''
  )}</tbody></table>`;
}

function padEnd(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

export function formatLinesAsPlainText(lines: readonly LogLine[]): string {
  if (lines.length === 0) return '';

  const hasVxLogs = lines.some(isVxLogLine);
  if (!hasVxLogs) {
    return lines.map((l) => (isVxLogLine(l) ? l.raw : l.text)).join('\n');
  }

  const showSource = hasMultipleSources(lines);

  const rows = lines.map((line) => {
    if (!isVxLogLine(line)) {
      return {
        time: '',
        source: '',
        event: '',
        message: line.text,
        details: '',
      };
    }
    return {
      time: formatTimestamp(line.timeLogWritten),
      source: line.source,
      event: line.eventId,
      message: line.message,
      details: serializeExtra(line.extra),
    };
  });

  const colWidths: Record<string, number> = {
    time: Math.max(...rows.map((r) => r.time.length), 4),
    source: showSource ? Math.max(...rows.map((r) => r.source.length), 6) : 0,
    event: Math.max(...rows.map((r) => r.event.length), 5),
    message: Math.max(...rows.map((r) => r.message.length), 7),
  };

  const headerParts = [padEnd('Time', colWidths.time)];
  if (showSource) headerParts.push(padEnd('Source', colWidths.source));
  headerParts.push(padEnd('Event', colWidths.event), 'Message');
  const header = headerParts.join(' | ');
  const separator = '-'.repeat(header.length);

  const formatted = rows.map((r) => {
    const parts = [padEnd(r.time, colWidths.time)];
    if (showSource) parts.push(padEnd(r.source, colWidths.source));
    parts.push(padEnd(r.event, colWidths.event));
    const msg = r.details ? `${r.message}  ${r.details}` : r.message;
    parts.push(msg);
    return parts.join(' | ');
  });

  return `${header}\n${separator}\n${formatted.join('\n')}`;
}

function formatLinesAsTsv(lines: readonly LogLine[]): string {
  if (lines.length === 0) return '';

  const hasVxLogs = lines.some(isVxLogLine);
  if (!hasVxLogs) {
    return lines.map((l) => (isVxLogLine(l) ? l.raw : l.text)).join('\n');
  }

  const showSource = hasMultipleSources(lines);
  const headers = [
    'Time',
    ...(showSource ? ['Source'] : []),
    'Event',
    'Message',
    'Details',
  ];

  const rows = lines.map((line) => {
    if (!isVxLogLine(line)) return line.text;
    const cells = [
      formatTimestamp(line.timeLogWritten),
      ...(showSource ? [line.source] : []),
      line.eventId,
      line.message,
      serializeExtra(line.extra),
    ];
    return cells.join('\t');
  });

  return `${headers.join('\t')}\n${rows.join('\n')}`;
}

export async function copyAsRichText(lines: readonly LogLine[]): Promise<void> {
  const html = formatLinesAsHtmlTable(lines);
  const tsv = formatLinesAsTsv(lines);

  const htmlBlob = new Blob([html], { type: 'text/html' });
  const textBlob = new Blob([tsv], { type: 'text/plain' });

  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': htmlBlob,
      'text/plain': textBlob,
    }),
  ]);
}

export async function copyAsPlainText(
  lines: readonly LogLine[]
): Promise<void> {
  const text = formatLinesAsPlainText(lines);
  await navigator.clipboard.writeText(text);
}
