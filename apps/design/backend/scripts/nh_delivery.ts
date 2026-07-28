import { safeParseNumber } from '@votingworks/types';
import { readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { readNhBallotStyleFile } from './nh_xml';

export type Variant = 'VotingWorks' | 'HandCount';
export type Party = 'DEM' | 'REP';

export interface BallotStyleFile {
  path: string;
  /** 5-digit ballot-style code: first 3 digits are the town, last 2 the ward. */
  code: string;
  townCode: string;
  party: Party;
  /** Highest V-number in the filename (0 if none), for supersession. */
  version: number;
  /** Variant when derivable from the folder (DEM folders); else undefined. */
  variantHint?: Variant;
}

export interface TownGroup {
  townCode: string;
  townName: string;
  variant: Variant;
  files: BallotStyleFile[];
}

// NH exports ballot styles as JSON or as the equivalent AVSInterface XML.
const BALLOT_STYLE_FILENAME = /^(\d{5}) (DEM|REP) (.*)\.(json|xml)$/;

function variantFromPath(path: string): Variant | undefined {
  // NH drops have used a few folder namings for the two sets: "VotingWorks
  // Eric Forcier"/"Hand Count Eric Forcier", the hyphenated "voting-works"/
  // "hand-count", and the plain "VotingWorks"/"Hand Count" (possibly with a
  // date suffix like "Hand Count 7-6"). Match any of them.
  if (path.includes('voting-works') || path.includes('VotingWorks')) {
    return 'VotingWorks';
  }
  if (path.includes('hand-count') || path.includes('Hand Count')) {
    return 'HandCount';
  }
  return undefined;
}

function walkBallotStyleFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    // Skip archives and hidden files; recurse into directories.
    if (entry.startsWith('.') || entry.endsWith('.7z')) continue;
    if (statSync(path).isDirectory()) {
      results.push(...walkBallotStyleFiles(path));
    } else if (entry.endsWith('.json') || entry.endsWith('.xml')) {
      results.push(path);
    }
  }
  return results;
}

export function discoverBallotStyleFiles(root: string): BallotStyleFile[] {
  const files: BallotStyleFile[] = [];
  for (const path of walkBallotStyleFiles(root)) {
    const match = basename(path).match(BALLOT_STYLE_FILENAME);
    if (!match) continue;
    const [, code, party, rest] = match;
    const versions = [...rest.matchAll(/\bV(\d+)\b/g)].map((m) =>
      safeParseNumber(m[1]).unsafeUnwrap()
    );
    files.push({
      path,
      code,
      townCode: code.slice(0, 3),
      party: party as Party,
      version: versions.length > 0 ? Math.max(...versions) : 0,
      variantHint: variantFromPath(path),
    });
  }
  return files;
}

export interface ResolvedFiles {
  resolved: BallotStyleFile[];
  superseded: BallotStyleFile[];
}

/** Keep the highest-version file per (code, party); report the rest. */
export function resolveLatestVersions(files: BallotStyleFile[]): ResolvedFiles {
  const bestByKey = new Map<string, BallotStyleFile>();
  const superseded: BallotStyleFile[] = [];
  for (const file of files) {
    const key = `${file.code}-${file.party}`;
    const existing = bestByKey.get(key);
    if (!existing) {
      bestByKey.set(key, file);
    } else if (file.version > existing.version) {
      bestByKey.set(key, file);
      superseded.push(existing);
    } else {
      superseded.push(file);
    }
  }
  return { resolved: [...bestByKey.values()], superseded };
}

function buildVariantMapByTown(files: BallotStyleFile[]): Map<string, Variant> {
  const map = new Map<string, Variant>();
  for (const file of files) {
    if (file.variantHint) {
      map.set(file.townCode, file.variantHint);
    }
  }
  return map;
}

function readTownName(path: string): string {
  const data = readNhBallotStyleFile(path) as {
    // eslint-disable-next-line vx/gts-identifiers
    AVSInterface: { HeaderInfo: { TownName: string } };
  };
  return data.AVSInterface.HeaderInfo.TownName;
}

export function groupByTown(files: BallotStyleFile[]): TownGroup[] {
  const variantMap = buildVariantMapByTown(files);
  const byTown = new Map<string, BallotStyleFile[]>();
  for (const file of files) {
    const group = byTown.get(file.townCode) ?? [];
    group.push(file);
    byTown.set(file.townCode, group);
  }
  return [...byTown.entries()]
    .map(([townCode, townFiles]) => ({
      townCode,
      townName: readTownName(townFiles[0].path),
      variant:
        variantMap.get(townCode) ??
        townFiles.find((f) => f.variantHint)?.variantHint ??
        'VotingWorks',
      files: [...townFiles].sort((a, b) => a.code.localeCompare(b.code)),
    }))
    .sort((a, b) => a.townName.localeCompare(b.townName));
}

export function printInventory(root: string): void {
  const all = discoverBallotStyleFiles(root);
  const { resolved, superseded } = resolveLatestVersions(all);
  const towns = groupByTown(resolved);

  function count(predicate: (f: BallotStyleFile) => boolean): number {
    return resolved.filter(predicate).length;
  }
  function byTownVariant(variant: Variant): TownGroup[] {
    return towns.filter((t) => t.variant === variant);
  }

  console.log(`NH delivery inventory: ${root}\n`);
  console.log(`Ballot-style files (latest versions): ${resolved.length}`);
  console.log(`  DEM: ${count((f) => f.party === 'DEM')}`);
  console.log(`  REP: ${count((f) => f.party === 'REP')}`);
  console.log(`Superseded by a newer version: ${superseded.length}`);
  for (const file of superseded) {
    console.log(`  - ${basename(file.path)} (v${file.version})`);
  }
  console.log(`\nTowns: ${towns.length}`);
  for (const variant of ['VotingWorks', 'HandCount'] as const) {
    const townsForVariant = byTownVariant(variant);
    const demStyles = resolved.filter(
      (f) =>
        f.party === 'DEM' &&
        towns.some((t) => t.townCode === f.townCode && t.variant === variant)
    ).length;
    const repStyles = resolved.filter(
      (f) =>
        f.party === 'REP' &&
        towns.some((t) => t.townCode === f.townCode && t.variant === variant)
    ).length;
    console.log(
      `  ${variant}: ${townsForVariant.length} towns, ${demStyles} DEM + ${repStyles} REP ballot styles`
    );
  }

  // Coverage gaps: towns missing a party.
  const gaps = towns.filter(
    (t) =>
      !t.files.some((f) => f.party === 'DEM') ||
      !t.files.some((f) => f.party === 'REP')
  );
  console.log(`\nTowns missing a party (incomplete coverage): ${gaps.length}`);
  const missingRep = gaps.filter(
    (t) => !t.files.some((f) => f.party === 'REP')
  );
  const missingDem = gaps.filter(
    (t) => !t.files.some((f) => f.party === 'DEM')
  );
  console.log(`  missing REP: ${missingRep.length}`);
  console.log(`  missing DEM: ${missingDem.length}`);
}

/* istanbul ignore next */
if (require.main === module) {
  const root = process.argv[2];
  if (!root) {
    console.error('Usage: nh_delivery <delivery-dir>');
    process.exit(1);
  }
  printInventory(root);
}
