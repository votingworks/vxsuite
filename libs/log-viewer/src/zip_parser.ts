import { unzipSync, decompressSync } from 'fflate';
import type { LogFile, LogMachine, LogSession, LogZipContents } from './types';

const LOG_FILE_PATTERN = /^(.+?)(?:-(\d{8}))?(?:\.gz)?$/;

function parseLogFileName(fileName: string): {
  baseName: string;
  date?: string;
  isGzipped: boolean;
} {
  const isGzipped = fileName.endsWith('.gz');
  const nameWithoutGz = isGzipped ? fileName.replace(/\.gz$/, '') : fileName;
  const match = LOG_FILE_PATTERN.exec(nameWithoutGz);
  if (!match) {
    return { baseName: fileName, isGzipped };
  }
  return {
    baseName: match[1],
    date: match[2],
    isGzipped,
  };
}

interface ZipFileEntry {
  readonly path: string;
  readonly data: Uint8Array;
}

function extractZipEntries(zipData: ArrayBuffer): ZipFileEntry[] {
  const unzipped = unzipSync(new Uint8Array(zipData));
  return Object.entries(unzipped).map(([path, data]) => ({ path, data }));
}

function groupByMachineAndSession(
  entries: ZipFileEntry[]
): Map<string, Map<string, ZipFileEntry[]>> {
  const machines = new Map<string, Map<string, ZipFileEntry[]>>();

  for (const entry of entries) {
    const parts = entry.path.split('/');
    // Expected: logs/machine_XX-XX-XXX/YYYY-MM-DD_HH-MM-SS/filename
    // or: machine_XX-XX-XXX/YYYY-MM-DD_HH-MM-SS/filename
    const machineIdx = parts.findIndex((p) => p.startsWith('machine_'));
    if (machineIdx < 0 || machineIdx + 2 >= parts.length) continue;

    const machineId = parts[machineIdx];
    const sessionTimestamp = parts[machineIdx + 1];
    const fileName = parts.slice(machineIdx + 2).join('/');
    if (!fileName) continue;

    let sessions = machines.get(machineId);
    if (!sessions) {
      sessions = new Map();
      machines.set(machineId, sessions);
    }
    let sessionFiles = sessions.get(sessionTimestamp);
    if (!sessionFiles) {
      sessionFiles = [];
      sessions.set(sessionTimestamp, sessionFiles);
    }
    sessionFiles.push({ path: entry.path, data: entry.data });
  }

  return machines;
}

export function parseZip(zipData: ArrayBuffer): LogZipContents {
  const entries = extractZipEntries(zipData);
  const grouped = groupByMachineAndSession(entries);

  const machines: LogMachine[] = [];
  for (const [machineId, sessions] of grouped) {
    const sessionList: LogSession[] = [];
    for (const [timestamp, files] of sessions) {
      const logFiles: LogFile[] = files.map((f) => {
        const fileName = f.path.split('/').pop() ?? f.path;
        const parsed = parseLogFileName(fileName);
        return {
          name: fileName,
          baseName: parsed.baseName,
          date: parsed.date,
          isGzipped: parsed.isGzipped,
          path: f.path,
        };
      });

      const logTypes = [...new Set(logFiles.map((f) => f.baseName))].toSorted();

      sessionList.push({
        timestamp,
        files: logFiles,
        logTypes,
      });
    }
    const sortedSessions = sessionList.toSorted((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );
    machines.push({ id: machineId, sessions: sortedSessions });
  }

  const sortedMachines = machines.toSorted((a, b) => a.id.localeCompare(b.id));
  return { machines: sortedMachines };
}

export function readFileContent(
  zipData: ArrayBuffer,
  filePath: string
): string {
  const entries = extractZipEntries(zipData);
  const entry = entries.find((e) => e.path === filePath);
  if (!entry) {
    throw new Error(`File not found in ZIP: ${filePath}`);
  }

  let { data } = entry;
  if (filePath.endsWith('.gz')) {
    data = decompressSync(data);
  }
  return new TextDecoder().decode(data);
}

export function readLogTypeFiles(
  zipData: ArrayBuffer,
  session: LogSession,
  logType: string
): Array<{ fileName: string; date?: string; content: string }> {
  const files = session.files.filter((f) => f.baseName === logType);
  const entries = extractZipEntries(zipData);

  return files.map((file) => {
    const entry = entries.find((e) => e.path === file.path);
    if (!entry) {
      throw new Error(`File not found in ZIP: ${file.path}`);
    }

    let { data } = entry;
    if (file.isGzipped) {
      data = decompressSync(data);
    }

    return {
      fileName: file.name,
      date: file.date,
      content: new TextDecoder().decode(data),
    };
  });
}
