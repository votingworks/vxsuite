import JsZip from 'jszip';
import { safeParseNumber } from '@votingworks/types';
import type { Machine, BallotEntry, FullCvrData, CvrContest, CvrOption, PixelBounds } from './types';

// CVR source abstraction — reads from zip files or directory file lists

interface ZipSource {
  readonly kind: 'zip';
  readonly zip: JsZip;
  readonly rootPrefix: string;
}

interface DirectorySource {
  readonly kind: 'directory';
  readonly files: Map<string, File>;
  readonly rootPrefix: string;
}

export type CvrSource = ZipSource | DirectorySource;

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '');
}

function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter(Boolean).join('/'));
}

// Find the CVR root directory within a set of paths
function findCvrRoot(paths: string[]): string {
  // Look for metadata.json — its grandparent is the CVR root
  for (const p of paths) {
    const segments = p.split('/');
    const fileName = segments[segments.length - 1];
    if (fileName === 'metadata.json') {
      // grandparent of metadata.json is the CVR root
      if (segments.length >= 3) {
        return segments.slice(0, -2).join('/');
      }
      return '';
    }
  }

  // Look for machine_* or TEST__machine_* directories at root level
  for (const p of paths) {
    const segments = p.split('/');
    if (segments.length >= 1) {
      const first = segments[0];
      if (first?.startsWith('machine_') || first?.startsWith('TEST__machine_')) {
        return '';
      }
    }
  }

  // Check for cast-vote-records/ prefix
  for (const p of paths) {
    if (p.startsWith('cast-vote-records/')) {
      return 'cast-vote-records';
    }
  }

  return '';
}

export async function createSourceFromZip(file: File): Promise<CvrSource> {
  const zip = await JsZip.loadAsync(await file.arrayBuffer());
  const paths = Object.keys(zip.files);
  const rootPrefix = findCvrRoot(paths);
  return { kind: 'zip', zip, rootPrefix };
}

export function createSourceFromFiles(files: File[]): CvrSource {
  const fileMap = new Map<string, File>();
  for (const file of files) {
    const path = normalizePath(file.webkitRelativePath || file.name);
    fileMap.set(path, file);
  }

  const paths = Array.from(fileMap.keys());
  const rootPrefix = findCvrRoot(paths);
  return { kind: 'directory', files: fileMap, rootPrefix };
}

function resolvePath(source: CvrSource, rel: string): string {
  return joinPath(source.rootPrefix, rel);
}

async function readBytes(source: CvrSource, rel: string): Promise<ArrayBuffer> {
  const resolved = resolvePath(source, rel);
  if (source.kind === 'zip') {
    const entry = source.zip.file(resolved);
    if (!entry) {
      throw new Error(`File not found in zip: ${resolved}`);
    }
    return entry.async('arraybuffer');
  }
  const file = source.files.get(resolved);
  if (!file) {
    throw new Error(`File not found: ${resolved}`);
  }
  return file.arrayBuffer();
}

async function readString(source: CvrSource, rel: string): Promise<string> {
  const resolved = resolvePath(source, rel);
  if (source.kind === 'zip') {
    const entry = source.zip.file(resolved);
    if (!entry) {
      throw new Error(`File not found in zip: ${resolved}`);
    }
    return entry.async('string');
  }
  const file = source.files.get(resolved);
  if (!file) {
    throw new Error(`File not found: ${resolved}`);
  }
  return file.text();
}

function fileExists(source: CvrSource, rel: string): boolean {
  const resolved = resolvePath(source, rel);
  if (source.kind === 'zip') {
    return source.zip.file(resolved) !== null;
  }
  return source.files.has(resolved);
}

function listDirs(source: CvrSource, rel: string): string[] {
  const resolved = resolvePath(source, rel);
  const prefix = resolved ? `${resolved}/` : '';
  const dirs = new Set<string>();

  if (source.kind === 'zip') {
    for (const path of Object.keys(source.zip.files)) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const firstSegment = rest.split('/')[0];
      if (firstSegment) {
        dirs.add(firstSegment);
      }
    }
  } else {
    for (const path of source.files.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const firstSegment = rest.split('/')[0];
      if (firstSegment) {
        dirs.add(firstSegment);
      }
    }
  }

  return Array.from(dirs).sort();
}

export function loadMachines(source: CvrSource): Machine[] {
  const dirs = listDirs(source, '');
  const dirSet = new Set(dirs);
  const machines: Machine[] = [];

  for (const dirName of dirs) {
    if (dirName.startsWith('.') || dirName.startsWith('__')) continue;
    if (dirName.endsWith('.vxsig')) {
      // Skip signature files whose basename matches another entry
      const basename = dirName.slice(0, -6);
      if (dirSet.has(basename)) continue;
    }
    const id = dirName.startsWith('TEST__') ? dirName.slice(6) : dirName;
    machines.push({ id, path: dirName });
  }

  if (machines.length === 0) {
    machines.push({ id: 'default', path: '' });
  }

  return machines;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function forEachSelection(
  snapshot: any,
  callback: (selectionId: string, score: number, hasIndication: boolean) => void
): void {
  const contests = snapshot?.CVRContest;
  if (!Array.isArray(contests)) return;

  for (const contest of contests) {
    const selections = contest?.CVRContestSelection;
    if (!Array.isArray(selections)) continue;

    for (const sel of selections) {
      const selId = sel?.ContestSelectionId ?? '';
      const positions = sel?.SelectionPosition;
      if (!Array.isArray(positions)) continue;

      for (const pos of positions) {
        const hasInd = pos?.HasIndication === 'yes';
        const markMetric = pos?.MarkMetricValue;
        const parsed = Array.isArray(markMetric)
          ? safeParseNumber(markMetric[0] ?? '0')
          : undefined;
        const score = parsed?.isOk() ? parsed.ok() : 0;
        callback(selId, score, hasInd);
      }
    }
  }
}

function parseBallotSummary(
  id: string,
  path: string,
  cvrJson: any
): BallotEntry {
  const cvrArray = cvrJson?.CVR;
  const ballotStyle = Array.isArray(cvrArray)
    ? cvrArray[0]?.BallotStyleId
    : undefined;

  let maxScore = 0;
  function updateMaxScore(_selId: string, score: number) {
    if (score > maxScore) maxScore = score;
  }
  if (Array.isArray(cvrArray)) {
    for (const cvr of cvrArray) {
      const snapshots = cvr?.CVRSnapshot;
      if (!Array.isArray(snapshots)) continue;
      for (const snapshot of snapshots) {
        if (snapshot?.Type !== 'original') continue;
        forEachSelection(snapshot, updateMaxScore);
      }
    }
  }

  return { id, ballotStyle, maxScore, isRejected: false, path };
}

export async function loadBallotList(
  source: CvrSource,
  machinePath: string
): Promise<BallotEntry[]> {
  const dirs = listDirs(source, machinePath);
  const ballots: BallotEntry[] = [];

  const loadPromises = dirs.map(async (dirName) => {
    const ballotPath = joinPath(machinePath, dirName);
    const isRejected = dirName.startsWith('rejected-');
    const ballotId = isRejected ? dirName.slice(9) : dirName;

    if (isRejected) {
      const entry: BallotEntry = {
        id: ballotId,
        ballotStyle: undefined,
        maxScore: 0,
        isRejected: true,
        path: ballotPath,
      };
      return entry;
    }

    const cvrPath = joinPath(ballotPath, 'cast-vote-record-report.json');
    if (fileExists(source, cvrPath)) {
      try {
        const cvrStr = await readString(source, cvrPath);
        const cvrJson = JSON.parse(cvrStr);
        return parseBallotSummary(ballotId, ballotPath, cvrJson);
      } catch {
        // fall through
      }
    }

    const entry: BallotEntry = {
      id: ballotId,
      ballotStyle: undefined,
      maxScore: 0,
      isRejected: false,
      path: ballotPath,
    };
    return entry;
  });

  const results = await Promise.all(loadPromises);
  ballots.push(...results);
  return ballots;
}

function parseBounds(val: any): PixelBounds | undefined {
  if (!val) return undefined;
  const xResult = safeParseNumber(val.x);
  const yResult = safeParseNumber(val.y);
  const widthResult = safeParseNumber(val.width);
  const heightResult = safeParseNumber(val.height);
  if (!xResult.isOk() || !yResult.isOk() || !widthResult.isOk() || !heightResult.isOk()) {
    return undefined;
  }
  return { x: xResult.ok(), y: yResult.ok(), width: widthResult.ok(), height: heightResult.ok() };
}

function buildFullCvrData(
  cvrJson: any,
  frontLayout?: any,
  backLayout?: any
): FullCvrData {
  const cvrArray = cvrJson?.CVR;
  const ballotStyle = Array.isArray(cvrArray)
    ? (cvrArray[0]?.BallotStyleId ?? 'unknown')
    : 'unknown';

  // Build per-contest score map
  const scores = new Map<string, Map<string, { score: number; hasIndication: boolean }>>();

  if (Array.isArray(cvrArray)) {
    for (const cvr of cvrArray) {
      const snapshots = cvr?.CVRSnapshot;
      if (!Array.isArray(snapshots)) continue;
      for (const snapshot of snapshots) {
        if (snapshot?.Type !== 'original') continue;
        const contests = snapshot?.CVRContest;
        if (!Array.isArray(contests)) continue;
        for (const contest of contests) {
          const contestId = contest?.ContestId ?? '';
          let contestEntry = scores.get(contestId);
          if (!contestEntry) {
            contestEntry = new Map();
            scores.set(contestId, contestEntry);
          }
          const selections = contest?.CVRContestSelection;
          if (!Array.isArray(selections)) continue;
          for (const sel of selections) {
            const selId = sel?.ContestSelectionId ?? '';
            const positions = sel?.SelectionPosition;
            if (!Array.isArray(positions)) continue;
            for (const pos of positions) {
              const hasInd = pos?.HasIndication === 'yes';
              const markMetric = pos?.MarkMetricValue;
              const scoreParsed = Array.isArray(markMetric)
                ? safeParseNumber(markMetric[0] ?? '0')
                : undefined;
              const score = scoreParsed?.isOk() ? scoreParsed.ok() : 0;
              contestEntry.set(selId, { score, hasIndication: hasInd });
            }
          }
        }
      }
    }
  }

  const contests: CvrContest[] = [];
  for (const [page, layout] of [
    [1, frontLayout],
    [2, backLayout],
  ] as const) {
    if (!layout) continue;
    const layoutContests = layout?.contests;
    if (!Array.isArray(layoutContests)) continue;
    for (const contestJson of layoutContests) {
      const contestId = contestJson?.contestId ?? '';
      const contestScores = scores.get(contestId) ?? new Map();
      const options: CvrOption[] = [];
      const opts = contestJson?.options;
      if (Array.isArray(opts)) {
        for (const optJson of opts) {
          const def = optJson?.definition;
          const optId = def?.id ?? '';
          const optName = def?.name ?? optId;
          const isWriteIn = def?.isWriteIn ?? optId.startsWith('write-in');
          const bounds = parseBounds(optJson?.bounds);
          const scoreData = contestScores.get(optId);
          options.push({
            name: optName,
            isWriteIn,
            bounds,
            score: scoreData?.score ?? 0,
            hasIndication: scoreData?.hasIndication ?? false,
          });
        }
      }
      contests.push({ id: contestId, page, options });
    }
  }

  return { ballotStyle, contests };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function loadFullCvr(
  source: CvrSource,
  ballotPath: string,
  ballotId: string
): Promise<FullCvrData> {
  const cvrStr = await readString(
    source,
    joinPath(ballotPath, 'cast-vote-record-report.json')
  );
  const cvrJson = JSON.parse(cvrStr);

  const frontPath = joinPath(ballotPath, `${ballotId}-front.layout.json`);
  const backPath = joinPath(ballotPath, `${ballotId}-back.layout.json`);

  let frontLayout: unknown;
  let backLayout: unknown;

  if (fileExists(source, frontPath)) {
    try {
      frontLayout = JSON.parse(await readString(source, frontPath));
    } catch {
      // ignore
    }
  }
  if (fileExists(source, backPath)) {
    try {
      backLayout = JSON.parse(await readString(source, backPath));
    } catch {
      // ignore
    }
  }

  return buildFullCvrData(cvrJson, frontLayout, backLayout);
}

export async function loadImage(
  source: CvrSource,
  ballotPath: string,
  ballotId: string,
  side: string
): Promise<string> {
  const imgPath = joinPath(ballotPath, `${ballotId}-${side}.png`);
  const bytes = await readBytes(source, imgPath);
  const blob = new Blob([bytes], { type: 'image/png' });
  return URL.createObjectURL(blob);
}
