import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

// node-quirc (QR decoder) and @votingworks/ballot-encoder don't resolve from
// design-backend, but they do from libs/ballot-interpreter. Resolve them there.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const INTERP_DIR = join(REPO_ROOT, 'libs', 'ballot-interpreter');
/* eslint-disable import/no-dynamic-require, @typescript-eslint/no-require-imports */
const nodeQuirc = require(
  require.resolve('node-quirc', { paths: [INTERP_DIR] })
);
const {
  sliceBallotHashForEncoding,
  BubbleBallotPreludeV4p0,
  decodeBallotHash,
} = require(
  require.resolve('@votingworks/ballot-encoder', { paths: [INTERP_DIR] })
);
/* eslint-enable import/no-dynamic-require, @typescript-eslint/no-require-imports */

const V4_0_PRELUDE: number[] = [...BubbleBallotPreludeV4p0]; // [86, 80, 2] = "V P 2"

const REQUIRED_ENTRIES = [
  'metadata.json',
  'appStrings.json',
  'election.json',
  'systemSettings.json',
  'registeredVoterCounts.json',
  'ballots.jsonl',
];

interface Check {
  ok: boolean;
  msg: string;
}

function unzipList(zip: string): string[] {
  return execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function unzipEntry(zip: string, entry: string): Buffer {
  return execFileSync('unzip', ['-p', zip, entry], {
    maxBuffer: 256 * 1024 * 1024,
  });
}

async function decodeQrsFromPdf(pdf: Buffer): Promise<Uint8Array[]> {
  const dir = mkdtempSync(join(tmpdir(), 'nh-qr-'));
  const pdfPath = join(dir, 'ballot.pdf');
  writeFileSync(pdfPath, pdf);
  execFileSync('pdftoppm', ['-png', '-r', '300', pdfPath, join(dir, 'page')]);
  const pngs = readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .sort();
  const qrs: Uint8Array[] = [];
  for (const png of pngs) {
    const results = await nodeQuirc.decode(readFileSync(join(dir, png)));
    for (const r of results as Array<{ data?: Buffer }>) {
      if (r.data) {
        qrs.push(Buffer.from(r.data.toString('utf8'), 'base64'));
      }
    }
  }
  return qrs;
}

function checkQrBytes(bytes: Uint8Array, expectedSlicedHash: string): Check {
  const prelude = [...bytes.slice(0, 3)];
  const preludeOk = prelude.every((b, i) => b === V4_0_PRELUDE[i]);
  // After the 3-byte prelude, 20 hex chars (4 bits each) => 10 bytes that are
  // exactly the sliced ballot hash rendered as hex.
  const hashHex = Buffer.from(bytes.slice(3, 13)).toString('hex');
  const hashOk = hashHex === expectedSlicedHash;
  // On this (post-merge) codebase the canonical reader only understands the
  // latest V-B-1 prelude, so a genuine v4.0 (V-P-2) payload must NOT decode.
  const notNewFormat = decodeBallotHash(bytes) === undefined;
  return {
    ok: preludeOk && hashOk && notNewFormat,
    msg:
      `prelude=[${prelude}] (v4.0=[${V4_0_PRELUDE}] ${
        preludeOk ? 'OK' : 'BAD'
      }); ` +
      `hash=${hashHex}${hashOk ? ' OK' : ` != ${expectedSlicedHash} BAD`}; ` +
      `rejected-by-latest-reader=${notNewFormat}`,
  };
}

async function smokeTestPackage(zipPath: string): Promise<boolean> {
  const town = basename(zipPath).replace(/ - election-package-.*\.zip$/, '');
  console.log(`\n=== ${town} ===`);
  const checks: Check[] = [];
  function record(ok: boolean, msg: string) {
    checks.push({ ok, msg });
    console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  }

  // 1. Required entries present.
  const entries = unzipList(zipPath);
  const missing = REQUIRED_ENTRIES.filter((e) => !entries.includes(e));
  record(
    missing.length === 0,
    `all ${REQUIRED_ENTRIES.length} required entries present${
      missing.length ? ` (missing: ${missing})` : ''
    }`
  );

  // 2. ballotHash = sha256(election.json) and matches the zip filename.
  const electionJson = unzipEntry(zipPath, 'election.json');
  const ballotHash = createHash('sha256').update(electionJson).digest('hex');
  const filenameHashPrefix = basename(zipPath)
    .replace(/^.* - election-package-/, '')
    .slice(0, 7);
  record(
    ballotHash.startsWith(filenameHashPrefix),
    `ballotHash ${ballotHash.slice(
      0,
      7
    )}… matches filename prefix ${filenameHashPrefix}`
  );

  // 3. election.json is valid JSON in v4.0 shape (county, not jurisdiction).
  const election = JSON.parse(electionJson.toString('utf8'));
  const v4Shape =
    'county' in election &&
    !('jurisdiction' in election) &&
    'gridLayouts' in election;
  record(
    v4Shape,
    `election.json is v4.0-shaped (county+gridLayouts, no jurisdiction): "${election.title}"`
  );

  // 4. ballots.jsonl: every entry is valid and its base64 PDF is a real PDF.
  //    Only machine-scannable ballots are encoded (sample/hand-count/foo/uocava
  //    are excluded), so every entry here must carry a QR.
  const ballotsJsonl = unzipEntry(zipPath, 'ballots.jsonl').toString('utf8');
  const lines = ballotsJsonl.split('\n').filter((l) => l.trim().length > 0);
  const ballotEntries = lines.map((line) => JSON.parse(line));
  const pdfs = ballotEntries.map((e) => Buffer.from(e.encodedBallot, 'base64'));
  const pdfOk =
    pdfs.length > 0 &&
    pdfs.every((pdf) => pdf.subarray(0, 5).toString('latin1') === '%PDF-');
  record(
    pdfOk,
    `ballots.jsonl: ${lines.length} entries, all decode to valid PDFs`
  );

  // 5. Every encoded ballot's QR carries the v4.0 prelude + this election's
  //    ballot hash.
  const expectedSlicedHash = sliceBallotHashForEncoding(ballotHash);
  for (const [i, pdf] of pdfs.entries()) {
    const label = `${ballotEntries[i].ballotType}/${ballotEntries[i].ballotStyleId}/${ballotEntries[i].precinctId}`;
    const qrs = await decodeQrsFromPdf(pdf);
    if (qrs.length === 0) {
      record(false, `QR ${label}: no QR detected on any page`);
      continue;
    }
    const results = qrs.map((bytes) => checkQrBytes(bytes, expectedSlicedHash));
    const ok = results.every((r) => r.ok);
    record(
      ok,
      `QR ${label}: ${qrs.length} QR(s) across pages, all v4.0 — ${results[0].msg}`
    );
  }

  return checks.every((c) => c.ok);
}

async function main(args: readonly string[]): Promise<number> {
  if (args.length < 1) {
    console.error('Usage: smoke_test_nh_package <handoff-dir>');
    return 1;
  }
  const [handoffDir] = args;
  const packagesDir = join(handoffDir, 'election-packages');
  const zipPaths = readdirSync(packagesDir)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => join(packagesDir, f))
    .sort();

  let allOk = true;
  for (const zipPath of zipPaths) {
    allOk = (await smokeTestPackage(zipPath)) && allOk;
  }
  console.log(
    `\n${zipPaths.length} package(s) checked. ${
      allOk ? 'ALL CHECKS PASSED ✓' : 'SOME CHECKS FAILED ✗'
    }`
  );
  return allOk ? 0 : 1;
}

/* istanbul ignore next */
if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
