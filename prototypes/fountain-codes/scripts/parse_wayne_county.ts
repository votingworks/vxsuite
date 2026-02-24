/**
 * Parse Wayne County election results PDFs (already extracted to text via pdftotext -raw)
 * and compute compressed tally sizes per precinct using VxSuite's format.
 *
 * Usage: npx tsx scripts/parse_wayne_county.ts
 */

import * as fs from 'fs';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PrecinctContestTally {
  contestName: string;
  undervotes: number;
  overvotes: number;
  ballotsCast: number;
  candidateVotes: number[];
  writeIns: number;
}

// ─── Compressed tally size calculation ───────────────────────────────────────
// Per contest: undervotes(1) + overvotes(1) + ballotsCast(1) + one per option
// Plus 1 uint16 version header for the whole precinct

function compressedTallyUint16Count(tallies: PrecinctContestTally[]): number {
  let count = 1; // version header
  for (const t of tallies) {
    // undervotes + overvotes + ballotsCast + candidates + (write-in if present)
    const options = Math.max(t.candidateVotes.length, 1) + (t.writeIns > 0 ? 1 : 0);
    count += 3 + options;
  }
  return count;
}

// Matches both "Precinct 123" and "CB 45" location identifiers
const LOCATION_ID = /(?:Precinct \d+[A-Z]?|CB \d+)/;

// ─── PDF text parsing ────────────────────────────────────────────────────────

function isPageHeader(line: string): boolean {
  return line.startsWith('Printed:') ||
    line.startsWith('Data Refreshed:') ||
    line.startsWith('Wayne County, Michigan') ||
    line.startsWith('20241105') ||
    line.startsWith('Precinct Canvass') ||
    line.startsWith('November 5, 2024');
}

function isContestHeader(line: string): boolean {
  return /^\d+ [A-Z]/.test(line);
}

function preprocessLines(text: string): string[] {
  const rawLines = text.split('\n');
  const result: string[] = [];

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i].trim();

    if (
      line &&
      new RegExp(`${LOCATION_ID.source}$`).test(line) &&
      i + 1 < rawLines.length
    ) {
      const nextLine = rawLines[i + 1]?.trim() || '';
      if (/^(Total|Early Voting|Election Day|Absentee|Pre-Process)\s/.test(nextLine) ||
          nextLine === 'Pre-Process') {
        let prefix = '';
        if (result.length > 0) {
          const prevLine = result[result.length - 1];
          if (/^(Charter Township of|City of [^,]+,|Village of [^,]+,)$/.test(prevLine) ||
              prevLine.endsWith(' of') || prevLine.endsWith(',')) {
            prefix = result.pop()! + ' ';
          }
        }
        if (nextLine === 'Pre-Process' && i + 2 < rawLines.length) {
          const afterNext = rawLines[i + 2]?.trim() || '';
          if (afterNext === 'Absentee' && i + 3 < rawLines.length) {
            const dataLine = rawLines[i + 3]?.trim() || '';
            result.push(prefix + line + ' Pre-Process Absentee ' + dataLine);
            i += 4;
            continue;
          }
        }
        result.push(prefix + line + ' ' + nextLine);
        i += 2;
        continue;
      }
    }

    result.push(line);
    i++;
  }

  return result;
}

function parseFile(text: string): {
  precinctMap: Map<string, PrecinctContestTally[]>;
  maxValue: number;
} {
  const lines = preprocessLines(text);
  const precinctMap = new Map<string, PrecinctContestTally[]>();

  let currentContestName = '';
  let currentHasWriteIns = false;
  let inHeader = false;
  let maxValue = 0;

  for (const line of lines) {
    if (!line) continue;
    if (isPageHeader(line)) continue;

    // Detect contest header
    if (isContestHeader(line) && !LOCATION_ID.test(line)) {
      currentContestName = line;
      inHeader = true;
      currentHasWriteIns = false;
      continue;
    }

    if (inHeader) {
      if (/^[12] [12]/.test(line) && line.split(' ').every(x => x === '1' || x === '2')) {
        continue;
      }
      if (new RegExp(`${LOCATION_ID.source}\\s+(Total|Early)`).test(line)) {
        inHeader = false;
      } else {
        if (line === 'Write-ins') currentHasWriteIns = true;
        continue;
      }
    }

    // Look for Total lines
    const totalMatch = line.match(new RegExp(`^(.+${LOCATION_ID.source})\\s+Total\\s+([\\d,.%\\s]+)$`));
    if (!totalMatch) continue;

    const precinctName = totalMatch[1].trim().replace(/,\s*$/, '');
    const dataStr = totalMatch[2].trim();

    const parts = dataStr.split(/\s+/);
    const numericValues: number[] = [];
    for (const part of parts) {
      const cleaned = part.replace(/,/g, '').replace(/%$/, '');
      const num = Number(cleaned);
      if (!isNaN(num)) {
        numericValues.push(num);
      }
    }

    if (numericValues.length < 3) continue;

    const votersCast = numericValues[1];
    const voteTallies = numericValues.slice(3);

    // Track max value (ballotsCast and all vote tallies)
    // Skip continuation rows (<=2 tally values) which can have bogus concatenated numbers
    if (voteTallies.length > 2) {
      for (const v of [votersCast, ...voteTallies]) {
        if (v > maxValue) maxValue = v;
      }
    }

    let undervotes = 0;
    let overvotes = 0;
    let writeIns = 0;
    let candidateVotes: number[] = [];

    if (voteTallies.length >= 2) {
      undervotes = voteTallies[voteTallies.length - 1];
      overvotes = voteTallies[voteTallies.length - 2];

      if (currentHasWriteIns && voteTallies.length >= 3) {
        writeIns = voteTallies[voteTallies.length - 3];
        candidateVotes = voteTallies.slice(0, -3);
      } else {
        candidateVotes = voteTallies.slice(0, -2);
      }
    }

    const tally: PrecinctContestTally = {
      contestName: currentContestName,
      undervotes,
      overvotes,
      ballotsCast: votersCast,
      candidateVotes,
      writeIns,
    };

    if (!precinctMap.has(precinctName)) {
      precinctMap.set(precinctName, []);
    }
    precinctMap.get(precinctName)!.push(tally);
  }

  return { precinctMap, maxValue };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const dataDir = new URL('../data/', import.meta.url).pathname;
  const partisanText = fs.readFileSync(`${dataDir}partisan_raw.txt`, 'utf-8');
  const judicialText = fs.readFileSync(`${dataDir}judicial_raw.txt`, 'utf-8');

  console.log('Parsing partisan offices...');
  const partisan = parseFile(partisanText);
  console.log(`  Found ${partisan.precinctMap.size} precincts (max value: ${partisan.maxValue.toLocaleString()})`);

  console.log('Parsing judicial/city/school races and proposals...');
  const judicial = parseFile(judicialText);
  console.log(`  Found ${judicial.precinctMap.size} precincts (max value: ${judicial.maxValue.toLocaleString()})`);

  const globalMaxValue = Math.max(partisan.maxValue, judicial.maxValue);

  // Merge per-precinct data
  const allPrecincts = new Map<string, PrecinctContestTally[]>();
  for (const [precinct, tallies] of partisan.precinctMap) {
    allPrecincts.set(precinct, [...tallies]);
  }
  for (const [precinct, tallies] of judicial.precinctMap) {
    const existing = allPrecincts.get(precinct) || [];
    allPrecincts.set(precinct, [...existing, ...tallies]);
  }

  console.log(`\nTotal precincts with data: ${allPrecincts.size}`);

  // Compute compressed tally sizes
  interface PrecinctSize {
    name: string;
    numContests: number;
    totalUint16s: number;
    bytes: number;
    base64Length: number;
    totalOptions: number;
  }

  const precinctSizes: PrecinctSize[] = [];

  for (const [precinctName, tallies] of allPrecincts) {
    const uint16Count = compressedTallyUint16Count(tallies);
    const bytes = uint16Count * 2;
    const base64Length = Math.ceil(bytes / 3) * 4;

    let totalOptions = 0;
    for (const t of tallies) {
      totalOptions += Math.max(t.candidateVotes.length, 1) + (t.writeIns > 0 ? 1 : 0);
    }

    precinctSizes.push({
      name: precinctName,
      numContests: tallies.length,
      totalUint16s: uint16Count,
      bytes,
      base64Length,
      totalOptions,
    });
  }

  precinctSizes.sort((a, b) => a.bytes - b.bytes);

  const validPrecincts = precinctSizes.filter((p) => p.numContests >= 5);
  const allForTotal = precinctSizes;

  const totalBytes = allForTotal.reduce((sum, p) => sum + p.bytes, 0);
  const totalBase64 = allForTotal.reduce((sum, p) => sum + p.base64Length, 0);
  const avgBytes = validPrecincts.reduce((s, p) => s + p.bytes, 0) / validPrecincts.length;
  const medianBytes = validPrecincts[Math.floor(validPrecincts.length / 2)].bytes;
  const minBytes = validPrecincts[0].bytes;
  const maxBytes = validPrecincts[validPrecincts.length - 1].bytes;
  const totalContests = allForTotal.reduce((sum, p) => sum + p.numContests, 0);
  const avgContests = totalContests / allForTotal.length;
  const avgUint16s = allForTotal.reduce((s, p) => s + p.totalUint16s, 0) / allForTotal.length;

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  COMPRESSED TALLY SIZE ANALYSIS - Wayne County, MI');
  console.log('  November 2024 General Election (per precinct)');
  console.log('  Size = 1 (version) + per contest: 3 (under/over/ballots) + N (options)');
  console.log('  All values stored as uint16 (2 bytes each)');
  console.log('════════════════════════════════════════════════════════════\n');

  console.log(`Precincts parsed: ${allForTotal.length} (${validPrecincts.length} with 5+ contests)`);
  console.log(`Avg contests per precinct: ${avgContests.toFixed(1)}`);
  console.log(`Avg uint16 values per precinct: ${avgUint16s.toFixed(0)}`);
  console.log('');

  console.log('── Value Encoding ──');
  console.log(`  Largest single value: ${globalMaxValue.toLocaleString()}`);
  console.log(`  uint16 max:           65,535`);
  console.log(`  Fits in uint16:       ${globalMaxValue <= 65535 ? 'YES' : 'NO — needs uint32'}`);
  console.log(`  Bits needed:          ${Math.ceil(Math.log2(globalMaxValue + 1))}`);
  console.log('');

  console.log('── Per-Precinct Compressed Tally (raw bytes, 5+ contests only) ──');
  console.log(`  Min:     ${minBytes} bytes (${validPrecincts[0].name})`);
  console.log(`  Median:  ${medianBytes} bytes`);
  console.log(`  Average: ${avgBytes.toFixed(0)} bytes`);
  console.log(`  Max:     ${maxBytes} bytes (${validPrecincts[validPrecincts.length - 1].name})`);
  console.log('');

  console.log('── Totals (sum of ALL precincts) ──');
  console.log(`  Total raw bytes:    ${totalBytes.toLocaleString()} bytes (${(totalBytes / 1024).toFixed(1)} KB)`);
  console.log(`  Total base64 chars: ${totalBase64.toLocaleString()} chars (${(totalBase64 / 1024).toFixed(1)} KB)`);

  // Size distribution histogram
  console.log('\n── Size Distribution (raw bytes, all precincts) ──');
  const buckets = [0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 1000, Infinity];
  for (let b = 0; b < buckets.length - 1; b++) {
    const lo = buckets[b];
    const hi = buckets[b + 1];
    const count = allForTotal.filter((p) => p.bytes >= lo && p.bytes < hi).length;
    const bar = '#'.repeat(Math.round(count / 2));
    const label = hi === Infinity ? `${lo}+` : `${lo}-${hi - 1}`;
    if (count > 0) {
      console.log(`  ${label.padEnd(10)} ${String(count).padStart(4)} ${bar}`);
    }
  }

  console.log('\n── 5 Smallest Precincts (5+ contests) ──');
  for (const p of validPrecincts.slice(0, 5)) {
    console.log(`  ${p.name}: ${p.numContests} contests, ${p.totalUint16s} uint16s, ${p.bytes}B`);
  }
  console.log('\n── 5 Largest Precincts ──');
  for (const p of validPrecincts.slice(-5)) {
    console.log(`  ${p.name}: ${p.numContests} contests, ${p.totalUint16s} uint16s, ${p.bytes}B`);
  }

  // QR code feasibility
  console.log('\n── QR Code Feasibility (base64 encoded, all precincts) ──');
  const qrLevels = [
    { name: 'Version 10, Level M', capacity: 311 },
    { name: 'Version 15, Level M', capacity: 701 },
    { name: 'Version 20, Level M', capacity: 1171 },
    { name: 'Version 25, Level L', capacity: 1853 },
    { name: 'Version 25, Level M', capacity: 1455 },
    { name: 'Version 30, Level L', capacity: 2520 },
    { name: 'Version 30, Level M', capacity: 1994 },
    { name: 'Version 40, Level L', capacity: 2953 },
    { name: 'Version 40, Level M', capacity: 2331 },
  ];

  for (const qr of qrLevels) {
    const fitsInOne = allForTotal.filter((p) => p.base64Length <= qr.capacity).length;
    const pct = ((fitsInOne / allForTotal.length) * 100).toFixed(1);
    console.log(`  ${qr.name.padEnd(25)} (${String(qr.capacity).padStart(4)}B): ${String(fitsInOne).padStart(3)}/${allForTotal.length} fit in 1 QR (${pct}%)`);
  }

  // ─── Write CSV ──────────────────────────────────────────────────────────────
  const csvPath = `${dataDir}wayne_county_precincts.csv`;
  const csvRows = [
    'precinct_name,precinct_group,num_contests,total_options,total_uint16s,estimated_size_bytes,estimated_size_kb',
  ];

  for (const p of [...precinctSizes].sort((a, b) => a.name.localeCompare(b.name))) {
    const groupMatch = p.name.match(/^(.+),\s*(?:Precinct|CB)/);
    const group = groupMatch ? groupMatch[1].trim() : p.name;
    const escapeCsv = (s: string) =>
      s.includes(',') ? `"${s.replace(/"/g, '""')}"` : s;
    csvRows.push(
      `${escapeCsv(p.name)},${escapeCsv(group)},${p.numContests},${p.totalOptions},${p.totalUint16s},${p.bytes},${(p.bytes / 1024).toFixed(2)}`
    );
  }

  fs.writeFileSync(csvPath, csvRows.join('\n') + '\n');
  console.log(`\nCSV written to ${csvPath} (${csvRows.length - 1} precincts)`);

  // ─── Write tallies JSON ────────────────────────────────────────────────────
  const talliesJson: Record<string, number[]> = {};
  const sortedPrecincts = [...allPrecincts.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  );
  for (const [precinctName, precinctTallies] of sortedPrecincts) {
    const values: number[] = [1]; // version header
    for (const t of precinctTallies) {
      values.push(t.undervotes, t.overvotes, t.ballotsCast);
      for (const v of t.candidateVotes) {
        values.push(v);
      }
      if (t.writeIns > 0) {
        values.push(t.writeIns);
      }
    }
    talliesJson[precinctName] = values;
  }

  const talliesPath = `${dataDir}wayne_county_tallies.json`;
  fs.writeFileSync(talliesPath, JSON.stringify(talliesJson));
  console.log(`Tallies JSON written to ${talliesPath} (${sortedPrecincts.length} precincts)`);
}

main();
