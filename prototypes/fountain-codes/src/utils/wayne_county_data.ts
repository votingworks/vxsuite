import tallies from '../../data/wayne_county_tallies.json';

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

const DETROIT_AVCB_COUNT = 65;

function createDetroitAvcbPreset(): DataPreset {
  const allDetroit = filterPrecincts(tallies as TallyData, 'City of Detroit');
  const entries = allDetroit.slice(0, DETROIT_AVCB_COUNT);
  const precinctCount = entries.length;
  const tallyBytes = tallyByteCount(entries);
  const totalBytes = tallyBytes + SIGNING_OVERHEAD_BYTES;

  return {
    id: 'detroit-avcbs',
    label: 'Detroit AVCBs (proxy)',
    description: `Detroit AVCBs (proxy) — ${precinctCount} precincts, ${formatSize(totalBytes)}`,
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

export const WAYNE_COUNTY_PRESETS: DataPreset[] = [
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
