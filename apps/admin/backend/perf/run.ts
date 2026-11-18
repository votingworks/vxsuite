import { execFileSync, spawn } from 'node:child_process';
import {
  createWriteStream,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { cpus, hostname, release, tmpdir, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { getHeapStatistics } from 'node:v8';
import { assertDefined, extractErrorMessage } from '@votingworks/basics';
import { stateDefaultSystemSettings } from '@votingworks/election-definition-backend';
import {
  LocalFileStorageClient,
  renderElectionPackageAndBallots,
} from '@votingworks/election-definition-backend/election-package';
import { createPlaywrightRendererPool } from '@votingworks/hmpb';
import { LATEST_SOFTWARE_VERSION } from '@votingworks/types';
import { generateElection } from './generate_election.ts';
import {
  ELECTION_PRESETS,
  isElectionPresetName,
  scaleSpec,
} from './presets.ts';
import { createPseudoTranslator } from './pseudo_translator.ts';
import {
  LAYOUT_PHASE,
  type PhaseTimes,
  RENDER_PHASE,
  type RunConfig,
  type RunResult,
  summarizeRun,
} from './summary.ts';

const PERF_DIR = import.meta.dirname;
const BALLOT_MODES = ['official', 'test', 'sample'] as const;
const PAGE_COUNT_SAMPLE_SIZE = 20;

function usage(): string {
  return [
    'Usage: node run.ts --election <preset> [options]',
    '',
    `  --election <name>      ${Object.keys(ELECTION_PRESETS).join(' | ')}`,
    '  --precincts <n>        scale the preset to n precincts (e.g. 20 for a smoke test)',
    '  --pool <n>             renderer pool size (default 4, as VxAdmin uses)',
    '  --modes <list>         official,test (default, as VxAdmin DEMO) or official,sample,test',
    '  --out <dir>            results root (default perf/results)',
    '  --label <text>         run label (default <election>-pool<n>-<modes>)',
    '  --scratch <dir>        base directory for scratch and output (default os tmpdir)',
    '  --keep-output          keep the election package and ballot zips',
    '  --interval-ms <n>      sampling interval (default 1000)',
  ].join('\n');
}

function gitCommit(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: PERF_DIR,
    })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

function readTextOrUndefined(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return undefined;
  }
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function countPdfPages(path: string): number {
  const text = readFileSync(path).toString('latin1');
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(/[:.]/g, '-').slice(0, 19);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      election: { type: 'string' },
      precincts: { type: 'string' },
      pool: { type: 'string', default: '4' },
      modes: { type: 'string', default: 'official,test' },
      out: { type: 'string', default: join(PERF_DIR, 'results') },
      label: { type: 'string' },
      scratch: { type: 'string', default: tmpdir() },
      'keep-output': { type: 'boolean', default: false },
      'interval-ms': { type: 'string', default: '1000' },
      help: { type: 'boolean', default: false },
    },
  });
  if (
    values.help ||
    !values.election ||
    !isElectionPresetName(values.election)
  ) {
    console.log(usage());
    process.exit(values.help ? 0 : 1);
  }
  const modes = values.modes.split(',').map((mode) => mode.trim());
  for (const mode of modes) {
    if (!BALLOT_MODES.includes(mode as (typeof BALLOT_MODES)[number])) {
      throw new Error(`Unknown ballot mode: ${mode}`);
    }
  }
  if (!modes.includes('official')) {
    throw new Error(
      'Official ballots are always rendered; include "official".'
    );
  }
  const pool = Number(values.pool);
  const spec = scaleSpec(
    ELECTION_PRESETS[values.election],
    values.precincts ? Number(values.precincts) : undefined
  );
  const label = values.label ?? `${spec.name}-pool${pool}-${modes.join('+')}`;
  const runDir = resolve(values.out, `${timestamp()}-${label}`);
  mkdirSync(runDir, { recursive: true });

  const generateStartMs = Date.now();
  const generated = generateElection(spec);
  const generateMs = Date.now() - generateStartMs;
  const expectedPdfs = generated.stats.pdfsPerBallotMode * modes.length;

  const config: { -readonly [K in keyof RunConfig]: RunConfig[K] } & Record<
    string,
    unknown
  > = {
    label,
    election: spec.name,
    pool,
    modes,
    stats: generated.stats,
    expectedPdfs,
    startedAtMs: 0,
    generateMs,
    git: gitCommit(),
    host: hostname(),
    kernel: release(),
    cpuModel: cpus()[0]?.model,
    cpuCount: cpus().length,
    totalMemMb: Math.round(totalmem() / 2 ** 20),
    productName: readTextOrUndefined('/sys/class/dmi/id/product_name'),
    node: process.version,
    nodeOptions: process.env['NODE_OPTIONS'],
    heapSizeLimitMb: Math.round(getHeapStatistics().heap_size_limit / 2 ** 20),
    pid: process.pid,
  };

  const scratchRoot = await mkdtemp(join(values.scratch, 'vx-perf-'));
  const scratchPath = join(scratchRoot, 'scratch');
  const outputPath = join(scratchRoot, 'output');
  mkdirSync(scratchPath);
  mkdirSync(outputPath);

  const sampler = spawn(
    process.execPath,
    [
      join(PERF_DIR, 'sampler.ts'),
      '--pid',
      String(process.pid),
      '--out',
      runDir,
      '--interval-ms',
      values['interval-ms'],
      '--watch-dir',
      scratchRoot,
      '--fs-path',
      scratchRoot,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  );
  const samplerExited = new Promise<void>((resolveExit) => {
    sampler.on('exit', () => resolveExit());
  });

  const progressCsv = createWriteStream(join(runDir, 'progress.csv'));
  progressCsv.write(
    't_ms,phase,progress,total,heap_used_kb,heap_total_kb,external_kb,array_buffers_kb,rss_kb,event_loop_lag_ms\n'
  );
  let currentPhase = 'setup';
  let currentProgress = 0;
  let currentTotal = 0;
  let lastWriteMs = 0;
  let lastTickMs = Date.now();
  let lagMs = 0;
  function writeProgress(): void {
    const memory = process.memoryUsage();
    const now = Date.now();
    lastWriteMs = now;
    progressCsv.write(
      `${[
        now,
        currentPhase,
        currentProgress,
        currentTotal,
        Math.round(memory.heapUsed / 1024),
        Math.round(memory.heapTotal / 1024),
        Math.round(memory.external / 1024),
        Math.round(memory.arrayBuffers / 1024),
        Math.round(memory.rss / 1024),
        lagMs,
      ].join(',')}\n`
    );
  }
  const heartbeat = setInterval(() => {
    const now = Date.now();
    lagMs = Math.max(0, now - lastTickMs - 1000);
    lastTickMs = now;
    if (now - lastWriteMs >= 900) writeProgress();
  }, 1000);

  const phases: PhaseTimes = { startMs: Date.now() };
  config.startedAtMs = phases.startMs;
  writeFileSync(join(runDir, 'config.json'), JSON.stringify(config, null, 2));
  writeProgress();

  console.log(
    `[perf] ${label}: ${generated.stats.ballotStyles} ballot styles, ${expectedPdfs} PDFs expected, results in ${runDir}`
  );

  let result: RunResult;
  try {
    const output = await renderElectionPackageAndBallots(
      {
        translator: createPseudoTranslator(),
        createRendererPool: () => createPlaywrightRendererPool(pool),
        fileStorageClient: new LocalFileStorageClient(outputPath),
        outputDirectory: generated.election.id,
        scratchDir: { path: scratchPath },
        emitProgress: (phase, progress, total) => {
          const now = Date.now();
          if (phase === LAYOUT_PHASE) phases.layoutStartMs ??= now;
          if (phase === RENDER_PHASE) phases.renderStartMs ??= now;
          const phaseChanged = phase !== currentPhase;
          currentPhase = phase;
          currentProgress = progress;
          currentTotal = total;
          const finished = phase === RENDER_PHASE && progress === total;
          if (phaseChanged || finished || now - lastWriteMs >= 1000) {
            writeProgress();
          }
          if (finished) {
            phases.renderEndMs = now;
            currentPhase = 'package';
            writeProgress();
            console.log(`[perf] rendered ${total} PDFs, building zips`);
          } else if (progress > 0 && progress % 500 === 0) {
            console.log(`[perf] ${phase}: ${progress}/${total}`);
          }
        },
      },
      {
        election: generated.election,
        stateCode: 'DEMO',
        ballotLanguageConfigs: generated.ballotLanguageConfigs,
        ballotTemplateId: 'VxDefaultBallot',
        getCandidateOrderings: (ballotStyle) =>
          assertDefined(generated.candidateOrderings.get(ballotStyle.groupId)),
        compact: false,
        systemSettings: stateDefaultSystemSettings('DEMO'),
        registeredVoterCounts: {},
        softwareVersion: LATEST_SOFTWARE_VERSION,
        electionSerializationFormat: 'vxf',
        shouldExportSampleBallots: modes.includes('sample'),
        shouldExportTestBallots: modes.includes('test'),
      }
    );
    phases.endMs = Date.now();
    currentPhase = 'done';
    writeProgress();

    const pdfs = listFiles(scratchPath).filter((path) => path.endsWith('.pdf'));
    const pageCounts = pdfs
      .filter(
        (_, i) =>
          i % Math.max(1, Math.floor(pdfs.length / PAGE_COUNT_SAMPLE_SIZE)) ===
          0
      )
      .map(countPdfPages);
    const outputFiles = listFiles(outputPath);
    result = {
      status: 'succeeded',
      phases,
      pdfCount: pdfs.length,
      pagesPerPdf: {
        min: Math.min(...pageCounts),
        max: Math.max(...pageCounts),
      },
      outputBytes: outputFiles.reduce(
        (sum, path) => sum + statSync(path).size,
        0
      ),
    };
    writeFileSync(
      join(runDir, 'output.json'),
      JSON.stringify(
        {
          ballotHash: output.electionDefinition.ballotHash,
          files: outputFiles.map((path) => ({
            path,
            bytes: statSync(path).size,
          })),
        },
        null,
        2
      )
    );
  } catch (error) {
    phases.endMs = Date.now();
    result = {
      status: 'failed',
      error: extractErrorMessage(error),
      phases,
      pdfCount: 0,
    };
    console.error(error);
  }

  clearInterval(heartbeat);
  writeFileSync(join(runDir, 'result.json'), JSON.stringify(result, null, 2));
  await new Promise<void>((resolveEnd) => {
    progressCsv.end(resolveEnd);
  });
  sampler.kill('SIGTERM');
  await samplerExited;

  if (values['keep-output']) {
    console.log(`[perf] kept output in ${outputPath}`);
    await rm(scratchPath, { recursive: true, force: true });
  } else {
    await rm(scratchRoot, { recursive: true, force: true });
  }

  const summary = assertDefined(summarizeRun(runDir));
  console.log(JSON.stringify(summary, null, 2));
  process.exit(result.status === 'succeeded' ? 0 : 1);
}

await main();
