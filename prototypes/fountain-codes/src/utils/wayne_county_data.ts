import tallies from '../../data/wayne_county_tallies.json';
import electionJson from '../../data/electionWayneCountyGeneral2024/electionBase.json';
import livingstonElection from '../../data/livingstonCountyRFPElection.json';

/**
 * Overhead from the current signed quick results reporting URL format:
 * - Machine certificate (DER→base64url): ~528 bytes
 * - ECDSA P-256 signature (DER→base64url): ~95 bytes
 * - Message metadata (ballot hash, machine ID, timestamp, etc.): ~80 bytes
 * - URL structure and encoding: ~30 bytes
 * Total measured from dev certs: ~741 bytes. Using 800 to account for
 * longer production machine IDs and precinct selections.
 */
export const SIGNING_OVERHEAD_BYTES = 800;

export interface DataPreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly precinctCount: number;
  readonly tallyBytes: number;
  buildData(): Uint8Array;
}

type TallyData = Record<string, number[]>;

function filterPrecincts(
  data: TallyData,
  cityName: string
): [string, number[]][] {
  const prefix = `${cityName}, `;
  return Object.entries(data)
    .filter(([name]) => name.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b));
}

function tallyByteCount(entries: [string, number[]][]): number {
  let totalValues = 0;
  for (const [, values] of entries) {
    totalValues += values.length;
  }
  return totalValues * 2;
}

function buildUint8Array(entries: [string, number[]][]): Uint8Array {
  const tallySize = tallyByteCount(entries);
  const buffer = new Uint8Array(tallySize + SIGNING_OVERHEAD_BYTES);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  for (const [, values] of entries) {
    for (const v of values) {
      view.setUint16(offset, v, true); // little-endian
      offset += 2;
    }
  }

  // Remaining SIGNING_OVERHEAD_BYTES are left as zeros — placeholder for
  // the ECDSA signature, machine certificate, and message metadata that
  // would be included in a real signed payload.

  return buffer;
}

function formatSize(bytes: number): string {
  return bytes >= 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${bytes} B`;
}

function createCityPreset(
  id: string,
  label: string,
  cityPrefix: string
): DataPreset {
  const entries = filterPrecincts(tallies as TallyData, cityPrefix);
  const precinctCount = entries.length;
  const tallyBytes = tallyByteCount(entries);
  const totalBytes = tallyBytes + SIGNING_OVERHEAD_BYTES;

  return {
    id,
    label,
    description: `${label} — ${precinctCount} precincts, ${formatSize(totalBytes)}`,
    precinctCount,
    tallyBytes,
    buildData() {
      return buildUint8Array(entries);
    },
  };
}

function filterCountingBoards(
  data: TallyData,
  cityName: string
): [string, number[]][] {
  const prefix = `${cityName}, CB `;
  return Object.entries(data)
    .filter(([name]) => name.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b));
}

function createDetroitAvcbPreset(): DataPreset {
  const entries = filterCountingBoards(tallies as TallyData, 'City of Detroit');
  const precinctCount = entries.length;
  const tallyBytes = tallyByteCount(entries);
  const totalBytes = tallyBytes + SIGNING_OVERHEAD_BYTES;

  return {
    id: 'detroit-avcbs',
    label: 'Detroit AVCBs',
    description: `Detroit AVCBs — ${precinctCount} CBs, ${formatSize(totalBytes)}`,
    precinctCount,
    tallyBytes,
    buildData() {
      return buildUint8Array(entries);
    },
  };
}

function createAllPresetsPreset(): DataPreset {
  const entries = Object.entries(tallies as TallyData).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const precinctCount = entries.length;
  const tallyBytes = tallyByteCount(entries);
  const totalBytes = tallyBytes + SIGNING_OVERHEAD_BYTES;

  return {
    id: 'wayne-county-all',
    label: 'Wayne County (all)',
    description: `Wayne County (all) — ${precinctCount} precincts, ${formatSize(totalBytes)}`,
    precinctCount,
    tallyBytes,
    buildData() {
      return buildUint8Array(entries);
    },
  };
}

function createElectionJsonPreset(): DataPreset {
  const jsonString = JSON.stringify(electionJson);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(jsonString);

  return {
    id: 'election-json',
    label: 'Election Definition (JSON)',
    description: `Election Definition (JSON) — ${formatSize(bytes.length)}`,
    precinctCount: 0,
    tallyBytes: bytes.length,
    buildData() {
      return bytes;
    },
  };
}

interface ElectionContest {
  readonly type: string;
  readonly districtId: string;
  readonly candidates?: readonly { readonly id: string }[];
  readonly allowWriteIns?: boolean;
}

interface ElectionBallotStyle {
  readonly precincts: readonly string[];
  readonly districts: readonly string[];
}

interface ElectionDefinition {
  readonly precincts: readonly { readonly id: string; readonly name: string }[];
  readonly contests: readonly ElectionContest[];
  readonly ballotStyles: readonly ElectionBallotStyle[];
}

function computePerPrecinctTallySize(election: ElectionDefinition): {
  precinctSizes: { name: string; uint16Count: number }[];
  totalBytes: number;
} {
  const precinctDistricts = new Map<string, readonly string[]>();
  for (const bs of election.ballotStyles) {
    for (const pid of bs.precincts) {
      precinctDistricts.set(pid, bs.districts);
    }
  }

  const contestsByDistrict = new Map<string, ElectionContest[]>();
  for (const c of election.contests) {
    const existing = contestsByDistrict.get(c.districtId) ?? [];
    existing.push(c);
    contestsByDistrict.set(c.districtId, existing);
  }

  const precinctSizes: { name: string; uint16Count: number }[] = [];
  let totalBytes = 0;

  for (const precinct of election.precincts) {
    const districts = precinctDistricts.get(precinct.id) ?? [];
    let count = 1; // version header
    for (const d of districts) {
      for (const c of contestsByDistrict.get(d) ?? []) {
        let options: number;
        if (c.type === 'candidate') {
          options =
            (c.candidates?.length ?? 0) + (c.allowWriteIns ? 1 : 0);
        } else {
          options = 2; // yes/no
        }
        count += 3 + options; // undervotes + overvotes + ballotsCast + options
      }
    }
    precinctSizes.push({ name: precinct.name, uint16Count: count });
    totalBytes += count * 2;
  }

  return { precinctSizes, totalBytes };
}

function createLivingstonPreset(): DataPreset {
  const election = livingstonElection as unknown as ElectionDefinition;
  const { precinctSizes, totalBytes } = computePerPrecinctTallySize(election);
  const precinctCount = precinctSizes.length;
  const tallyBytes = totalBytes;
  const payloadBytes = tallyBytes + SIGNING_OVERHEAD_BYTES;

  return {
    id: 'livingston-per-precinct',
    label: 'Livingston County (per precinct)',
    description: `Livingston County (per precinct) — ${precinctCount} precincts, ${formatSize(payloadBytes)}`,
    precinctCount,
    tallyBytes,
    buildData() {
      // Build a buffer with simulated per-precinct tally data at the correct
      // size derived from the election definition, plus signing overhead.
      const buffer = new Uint8Array(payloadBytes);
      const view = new DataView(buffer.buffer);
      let offset = 0;

      for (const { uint16Count } of precinctSizes) {
        for (let i = 0; i < uint16Count; i++) {
          // Fill with small nonzero values so it looks like plausible tally data
          view.setUint16(offset, i === 0 ? 1 : (i * 7) % 500, true);
          offset += 2;
        }
      }
      // Remaining SIGNING_OVERHEAD_BYTES are left as zeros
      return buffer;
    },
  };
}

export const LIVINGSTON_PRESETS: DataPreset[] = [createLivingstonPreset()];

export const WAYNE_COUNTY_PRESETS: DataPreset[] = [
  createElectionJsonPreset(),
  createCityPreset(
    'grosse-pointe-farms',
    'Grosse Pointe Farms',
    'City of Grosse Pointe Farms'
  ),
  createCityPreset('allen-park', 'Allen Park', 'City of Allen Park'),
  createDetroitAvcbPreset(),
  createCityPreset('dearborn', 'Dearborn', 'City of Dearborn'),
  createCityPreset('detroit-all', 'Detroit (all)', 'City of Detroit'),
  createAllPresetsPreset(),
];
