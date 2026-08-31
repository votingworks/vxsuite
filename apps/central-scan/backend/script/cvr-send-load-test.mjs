// Load generator for the VxCentralScan -> VxAdmin CVR transfer protocol.
// Simulates N scanners each sending M batches of K cast vote records to a
// VxAdmin host's peer API using the real wire protocol (startCvrTransfer,
// one zip POST per CVR, finishCvrTransfer). See README.md for usage.

import { Buffer } from 'node:buffer';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import * as grout from '@votingworks/grout';
import {
  clearTemporaryRootDir,
  electionTwoPartyPrimaryFixtures,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { getCvrTransferUploadPath } from '@votingworks/networking';
import { createZip } from '@votingworks/utils';

function usage() {
  console.error(
    'usage: node cvr-send-load-test.mjs --host http://ADDR:PEER_PORT ' +
      '[--scanners N=1] [--batches M=1] [--cvrs K=all] ' +
      '[--concurrency C=scanners] [--pipeline P=1] [--code-version V=dev] ' +
      '[--official]'
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    scanners: 1,
    batches: 1,
    cvrs: undefined,
    concurrency: undefined,
    pipeline: 1,
    codeVersion: 'dev',
    isTestMode: true,
    host: undefined,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--official') {
      args.isTestMode = false;
      continue;
    }
    const value = argv[(i += 1)];
    if (value === undefined) usage();
    switch (flag) {
      case '--host':
        args.host = value.replace(/\/$/, '');
        break;
      case '--scanners':
        args.scanners = Number(value);
        break;
      case '--batches':
        args.batches = Number(value);
        break;
      case '--cvrs':
        args.cvrs = Number(value);
        break;
      case '--concurrency':
        args.concurrency = Number(value);
        break;
      case '--pipeline':
        args.pipeline = Number(value);
        break;
      case '--code-version':
        args.codeVersion = value;
        break;
      default:
        usage();
    }
  }
  if (!args.host) usage();
  args.concurrency = args.concurrency ?? args.scanners;
  return args;
}

/**
 * Loads every cast vote record in the fixture export as a template:
 * { files: {name: Buffer}, report: parsed report JSON }. The report's
 * UniqueId/BatchId are rewritten per simulated ballot; image and layout
 * files are content-hashed by the report per file, so they are reused
 * unchanged.
 */
async function loadTemplates() {
  const exportDirectoryPath =
    electionTwoPartyPrimaryFixtures.castVoteRecordExport.asDirectoryPath();
  const templates = [];
  const entries = await fs.readdir(exportDirectoryPath, {
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(exportDirectoryPath, entry.name);
    const files = {};
    for (const fileName of await fs.readdir(dir)) {
      files[fileName] = await fs.readFile(path.join(dir, fileName));
    }
    const report = JSON.parse(
      files['cast-vote-record-report.json'].toString('utf-8')
    );
    templates.push({ files, report });
  }
  return templates;
}

/** Builds one upload-ready zip with a rewritten ballot id and batch id. */
async function buildCvrZip(template, ballotId, batchId) {
  const report = structuredClone(template.report);
  report.CVR[0].UniqueId = ballotId;
  report.CVR[0].BatchId = batchId;
  const files = {
    ...template.files,
    'cast-vote-record-report.json': Buffer.from(JSON.stringify(report)),
  };
  return await createZip(files);
}

function formatMs(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

async function sendBatch({
  args,
  apiClient,
  machineId,
  batchId,
  ballotHash,
  pollingPlaceId,
  templates,
  cvrCount,
}) {
  const result = {
    machineId,
    batchId,
    cvrCount,
    bytes: 0,
    startMs: 0,
    uploadMs: 0,
    finishMs: 0,
    errors: [],
  };

  // Build all zips up front so measured time is protocol + wire, not zipping
  const uploads = [];
  for (let i = 0; i < cvrCount; i += 1) {
    const template = templates[i % templates.length];
    const ballotId = `${batchId}-cvr-${String(i).padStart(4, '0')}`;
    const zip = await buildCvrZip(template, ballotId, batchId);
    uploads.push({ ballotId, zip });
    result.bytes += zip.byteLength;
  }

  let t = Date.now();
  const startResult = await apiClient.startCvrTransfer({
    machineId,
    codeVersion: args.codeVersion,
    ballotHash,
    batchId,
    label: batchId,
    pollingPlaceId,
    sheetCount: cvrCount,
    startedAt: new Date().toISOString(),
    isTestMode: args.isTestMode,
  });
  result.startMs = Date.now() - t;
  if (startResult.isErr()) {
    result.errors.push(`start: ${JSON.stringify(startResult.err())}`);
    return result;
  }
  if (startResult.ok().alreadyComplete) {
    result.errors.push('start: alreadyComplete (batch id reused?)');
    return result;
  }

  t = Date.now();
  let next = 0;
  let failed = false;
  async function uploadWorker() {
    while (next < uploads.length && !failed) {
      const index = next;
      next += 1;
      const { ballotId, zip } = uploads[index];
      const response = await fetch(
        args.host + getCvrTransferUploadPath(machineId, batchId, ballotId),
        {
          method: 'POST',
          headers: { 'content-type': 'application/zip' },
          body: new Uint8Array(zip),
        }
      );
      if (response.status !== 200) {
        failed = true;
        result.errors.push(
          `upload ${ballotId}: ${response.status} ${await response.text()}`
        );
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, args.pipeline) }, uploadWorker)
  );
  result.uploadMs = Date.now() - t;
  if (failed) return result;

  t = Date.now();
  const finishResult = await apiClient.finishCvrTransfer({
    machineId,
    batchId,
  });
  result.finishMs = Date.now() - t;
  if (finishResult.isErr()) {
    result.errors.push(`finish: ${JSON.stringify(finishResult.err())}`);
  } else if (finishResult.ok().cvrCount !== cvrCount) {
    result.errors.push(
      `finish: cvrCount ${finishResult.ok().cvrCount} != sent ${cvrCount}`
    );
  }
  return result;
}

async function runScanner({ args, scannerIndex, run, templates, election }) {
  const machineId = `LOAD-${String(scannerIndex + 1).padStart(2, '0')}`;
  const apiClient = grout.createClient({
    baseUrl: `${args.host}/api`,
    timeout: 10 * 60 * 1000,
  });
  const pollingPlaceId = election.pollingPlaces[0].id;

  const register = await apiClient.registerScanner({
    machineId,
    codeVersion: args.codeVersion,
    ballotHash: election.ballotHash,
    pollingPlaceId,
  });
  if (register.isErr()) {
    console.error(
      `${machineId}: registerScanner rejected: ${JSON.stringify(
        register.err()
      )}`
    );
  }

  const results = [];
  for (let b = 0; b < args.batches; b += 1) {
    const batchId = `${run}-${machineId}-batch-${b + 1}`;
    const result = await sendBatch({
      args,
      apiClient,
      machineId,
      batchId,
      ballotHash: election.ballotHash,
      pollingPlaceId,
      templates,
      cvrCount: args.cvrs ?? templates.length,
    });
    const total = result.startMs + result.uploadMs + result.finishMs;
    console.log(
      `${machineId} ${batchId}: ${result.cvrCount} CVRs ` +
        `start=${formatMs(result.startMs)} upload=${formatMs(
          result.uploadMs
        )} finish=${formatMs(result.finishMs)} total=${formatMs(total)} ` +
        `(${(result.cvrCount / (total / 1000)).toFixed(1)} CVRs/s, ` +
        `${(result.bytes / 1024 / 1024 / (result.uploadMs / 1000)).toFixed(
          1
        )} MB/s upload)` +
        (result.errors.length ? ` ERRORS: ${result.errors.join('; ')}` : '')
    );
    results.push(result);
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  setupTemporaryRootDir();
  process.on('exit', () => clearTemporaryRootDir());
  const templates = await loadTemplates();
  console.log(
    `Loaded ${templates.length} template CVRs from the two-party-primary fixture`
  );

  const probe = grout.createClient({ baseUrl: `${args.host}/api` });
  const metadata = await probe.getCurrentElectionMetadata();
  if (!metadata) {
    console.error('Host is not configured with an election; aborting.');
    process.exit(1);
  }
  const election = {
    ...metadata.electionDefinition.election,
    ballotHash: metadata.electionDefinition.ballotHash,
  };
  console.log(
    `Host election: ${election.title} (ballot hash ${election.ballotHash.slice(
      0,
      10
    )}…)`
  );

  // Unique per run so batch ids never collide with an earlier run
  const run = `load-${Date.now().toString(36)}`;
  const overallStart = Date.now();
  const allResults = [];
  let nextScanner = 0;
  async function scannerWorker() {
    while (nextScanner < args.scanners) {
      const scannerIndex = nextScanner;
      nextScanner += 1;
      allResults.push(
        ...(await runScanner({ args, scannerIndex, run, templates, election }))
      );
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, args.concurrency) }, scannerWorker)
  );
  const overallMs = Date.now() - overallStart;

  const ok = allResults.filter((r) => r.errors.length === 0);
  const failed = allResults.filter((r) => r.errors.length > 0);
  const totalCvrs = ok.reduce((sum, r) => sum + r.cvrCount, 0);
  const totalBytes = ok.reduce((sum, r) => sum + r.bytes, 0);
  const sum = (key) => ok.reduce((total, r) => total + r[key], 0);
  console.log('\n=== Summary ===');
  console.log(
    `${args.scanners} scanners x ${args.batches} batches, concurrency=${args.concurrency}, pipeline=${args.pipeline}`
  );
  console.log(
    `batches ok=${ok.length} failed=${failed.length}; ${totalCvrs} CVRs, ` +
      `${(totalBytes / 1024 / 1024).toFixed(1)} MB in ${formatMs(overallMs)}`
  );
  console.log(
    `aggregate: ${(totalCvrs / (overallMs / 1000)).toFixed(1)} CVRs/s, ` +
      `${(totalBytes / 1024 / 1024 / (overallMs / 1000)).toFixed(1)} MB/s`
  );
  console.log(
    `per-phase totals: start=${formatMs(sum('startMs'))} upload=${formatMs(
      sum('uploadMs')
    )} finish=${formatMs(sum('finishMs'))}`
  );
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
