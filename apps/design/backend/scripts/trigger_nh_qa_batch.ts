import { assertDefined, sleep } from '@votingworks/basics';
import { safeParseNumber } from '@votingworks/types';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { CircleCiClient } from '../src/circleci_client';
import {
  circleCiGet,
  DEFAULT_PROJECT_SLUG,
  TERMINAL_WORKFLOW_STATUSES,
  uploadPackage,
} from './trigger_nh_qa';
import { ELECTION_PACKAGES_DIR } from './nh_deliverable_layout';

// Pace the trigger API calls so a large batch doesn't trip CircleCI's API rate
// limit, and space out status polls.
const TRIGGER_DELAY_MS = 1500;
const POLL_ROUND_INTERVAL_MS = 20_000;
const POLL_SPACING_MS = 300;

// Artifacts we pull locally for failed towns so results can be triaged offline.
const FAILURE_ARTIFACT_NAMES = new Set(['run.log', 'report.html']);

interface Args {
  outDir: string;
  projectSlug: string;
  triggerDelayMs: number;
  maxInflight: number;
  // Rebuild the summary (adding report links) from an existing qa-results.json
  // without re-triggering any pipelines.
  refresh: boolean;
}

function parseArgs(argv: readonly string[]): Args | undefined {
  const positionals: string[] = [];
  let projectSlug = DEFAULT_PROJECT_SLUG;
  let triggerDelayMs = TRIGGER_DELAY_MS;
  let maxInflight = Number.POSITIVE_INFINITY;
  let refresh = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--refresh') {
      refresh = true;
    } else if (arg === '--slug') {
      i += 1;
      projectSlug = argv[i];
    } else if (arg === '--trigger-delay-ms') {
      i += 1;
      const parsed = safeParseNumber(argv[i]);
      if (parsed.isErr()) {
        console.error(`Invalid --trigger-delay-ms: ${argv[i]}`);
        return undefined;
      }
      triggerDelayMs = parsed.ok();
    } else if (arg === '--max-inflight') {
      i += 1;
      const parsed = safeParseNumber(argv[i]);
      if (parsed.isErr() || parsed.ok() < 1) {
        console.error(`Invalid --max-inflight (must be >= 1): ${argv[i]}`);
        return undefined;
      }
      maxInflight = parsed.ok();
    } else if (arg.startsWith('--')) {
      console.error(`Unknown flag: ${arg}`);
      return undefined;
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 1) {
    return undefined;
  }
  return {
    outDir: positionals[0],
    projectSlug,
    triggerDelayMs,
    maxInflight,
    refresh,
  };
}

interface TownPackage {
  town: string;
  zipPath: string;
}

// render_nh_election_package writes
// <outDir>/election-packages/<Town> - election-package-<hash>.zip.
function discoverPackages(outDir: string): TownPackage[] {
  const packagesDir = join(outDir, ELECTION_PACKAGES_DIR);
  if (!existsSync(packagesDir)) return [];
  const packages: TownPackage[] = [];
  for (const file of readdirSync(packagesDir).sort()) {
    if (!file.endsWith('.zip')) continue;
    const match = file.match(/^(.*) - election-package-.*\.zip$/);
    const town = match ? match[1] : file.replace(/\.zip$/, '');
    packages.push({ town, zipPath: join(packagesDir, file) });
  }
  return packages;
}

interface Enqueued extends TownPackage {
  pipelineId: string;
  pipelineUrl: string;
}

interface WorkflowState {
  status: string;
  workflowId: string;
}

async function pollWorkflow(
  pipelineId: string,
  token: string
): Promise<WorkflowState | undefined> {
  const workflows = ((
    await circleCiGet(`/pipeline/${pipelineId}/workflow`, token)
  )['items'] ?? []) as Array<{ id: string; status: string }>;
  const workflow = workflows[0];
  return workflow
    ? { status: workflow.status, workflowId: workflow.id }
    : undefined;
}

interface JobInfo {
  name: string;
  jobNumber?: number;
  url: string;
}

async function fetchJobs(
  workflowId: string,
  projectSlug: string,
  token: string
): Promise<JobInfo[]> {
  const jobs = ((await circleCiGet(`/workflow/${workflowId}/job`, token))[
    'items'
  ] ?? []) as Array<{ job_number?: number; name: string }>;
  return jobs.map((job) => ({
    name: job.name,
    jobNumber: job.job_number,
    url: job.job_number
      ? `https://app.circleci.com/pipelines/${projectSlug}/jobs/${job.job_number}`
      : '(not started)',
  }));
}

interface Artifact {
  path: string;
  url: string;
}

// All artifacts across a workflow's jobs.
async function fetchArtifacts(
  jobNumbers: readonly number[],
  projectSlug: string,
  token: string
): Promise<Artifact[]> {
  const all: Artifact[] = [];
  for (const jobNumber of jobNumbers) {
    try {
      const items = ((
        await circleCiGet(
          `/project/${projectSlug}/${jobNumber}/artifacts`,
          token
        )
      )['items'] ?? []) as Artifact[];
      all.push(...items);
    } catch {
      // Best effort -- a missing artifact list just means no report link.
    }
  }
  return all;
}

function reportUrlOf(artifacts: readonly Artifact[]): string | undefined {
  return artifacts.find((a) => basename(a.path) === 'report.html')?.url;
}

// Best-effort: pull run.log/report.html for a failed town into destDir so the
// failure can be read locally instead of via expiring artifact URLs.
async function downloadArtifacts(
  artifacts: readonly Artifact[],
  names: ReadonlySet<string>,
  token: string,
  destDir: string
): Promise<void> {
  await mkdir(destDir, { recursive: true });
  for (const artifact of artifacts) {
    if (!names.has(basename(artifact.path))) continue;
    try {
      const response = await fetch(artifact.url, {
        headers: { 'Circle-Token': token },
      });
      if (response.ok) {
        await writeFile(
          join(destDir, basename(artifact.path)),
          Buffer.from(await response.arrayBuffer())
        );
      }
    } catch {
      // Best effort -- the pipeline URL in the summary is the fallback.
    }
  }
}

function jobNumbersOf(jobs: readonly JobInfo[]): number[] {
  return jobs
    .map((job) => job.jobNumber)
    .filter((n): n is number => n !== undefined);
}

interface TownResult {
  town: string;
  status: string;
  passed: boolean;
  pipelineUrl: string;
  jobs: string[];
  // CircleCI artifact URL of the QA report.html (viewable in a browser session
  // authenticated to CircleCI). Absent if the job produced no report.
  reportUrl?: string;
}

interface BatchResult {
  results: TownResult[];
  failedTowns: string[];
}

/**
 * Runs QA for every package, keeping at most `maxInflight` pipelines running at
 * once (Infinity = enqueue all up front and let CircleCI's queue do the
 * limiting). As running pipelines reach a terminal state, new ones are
 * triggered to keep the window full.
 */
async function runBatch(
  packages: readonly TownPackage[],
  token: string,
  projectSlug: string,
  triggerDelayMs: number,
  maxInflight: number
): Promise<BatchResult> {
  const circleCi = new CircleCiClient(token, projectSlug);
  const queue = [...packages];
  const inflight = new Map<string, Enqueued>();
  const results: TownResult[] = [];
  const failedTowns: string[] = [];
  const total = packages.length;
  let triggered = 0;

  while (queue.length > 0 || inflight.size > 0) {
    // Fill the concurrency window.
    while (queue.length > 0 && inflight.size < maxInflight) {
      const pkg = assertDefined(queue.shift());
      triggered += 1;
      try {
        const exportPackageUrl = await uploadPackage(pkg.zipPath);
        const result = await circleCi.triggerPipeline({
          exportPackageUrl,
          // Results are read from the CircleCI pipeline below, not a webhook.
          webhookUrl: '',
          qaRunId: randomUUID(),
          electionId: pkg.town,
        });
        const pipelineUrl = `https://app.circleci.com/pipelines/${projectSlug}/${result.pipelineNumber}`;
        inflight.set(result.pipelineId, {
          ...pkg,
          pipelineId: result.pipelineId,
          pipelineUrl,
        });
        console.log(
          `[${triggered}/${total}] queued ${pkg.town} ` +
            `(${inflight.size} running, ${queue.length} waiting): ${pipelineUrl}`
        );
      } catch (error) {
        failedTowns.push(pkg.town);
        console.error(
          `[${triggered}/${total}] FAILED to enqueue ${pkg.town}: ${error}`
        );
      }
      // Pace the trigger API calls.
      await sleep(triggerDelayMs);
    }

    // Poll in-flight pipelines; collect any that have finished.
    for (const [pipelineId, e] of [...inflight]) {
      // A transient CircleCI API error shouldn't crash the loop -- leave the
      // pipeline in-flight and retry it next round.
      try {
        const state = await pollWorkflow(pipelineId, token);
        if (state && TERMINAL_WORKFLOW_STATUSES.has(state.status)) {
          const passed = state.status === 'success';
          const jobs = await fetchJobs(state.workflowId, projectSlug, token);
          const artifacts = await fetchArtifacts(
            jobNumbersOf(jobs),
            projectSlug,
            token
          );
          if (!passed) {
            await downloadArtifacts(
              artifacts,
              FAILURE_ARTIFACT_NAMES,
              token,
              join(dirname(e.zipPath), 'qa-report', e.town)
            );
          }
          results.push({
            town: e.town,
            status: state.status,
            passed,
            pipelineUrl: e.pipelineUrl,
            jobs: jobs.map((job) => `${job.name}: ${job.url}`),
            reportUrl: reportUrlOf(artifacts),
          });
          inflight.delete(pipelineId);
          console.log(
            `  ${passed ? '✓' : '✗'} ${e.town}: ${state.status} ` +
              `(${results.length}/${total} done, ${inflight.size} running, ` +
              `${queue.length} waiting)`
          );
        }
      } catch (error) {
        console.error(`  ? poll error for ${e.town} (will retry): ${error}`);
      }
      await sleep(POLL_SPACING_MS);
    }

    // If we can't trigger more right now (window full, or queue drained but
    // pipelines still running), wait before polling again.
    if (
      inflight.size > 0 &&
      (queue.length === 0 || inflight.size >= maxInflight)
    ) {
      await sleep(POLL_ROUND_INTERVAL_MS);
    }
  }

  return { results, failedTowns };
}

function formatSummary(results: readonly TownResult[]): string {
  const sorted = [...results].sort((a, b) => a.town.localeCompare(b.town));
  const lines = sorted.flatMap((r) => {
    const status = `${r.passed ? 'PASS' : 'FAIL'}  ${r.town.padEnd(28)}`;
    const line = `${status} ${r.pipelineUrl}`;
    // Indent the report link under the pipeline line so the columns stay clean.
    return r.reportUrl
      ? [line, `${' '.repeat(status.length)} report: ${r.reportUrl}`]
      : [line];
  });
  const failed = sorted.filter((r) => !r.passed);
  if (failed.length > 0) {
    lines.push(
      '',
      'Failed job links (reports saved to election-packages/qa-report/<town>/):'
    );
    for (const r of failed) {
      lines.push(`  ${r.town}`);
      for (const job of r.jobs) {
        lines.push(`    ${job}`);
      }
    }
  }
  const passCount = sorted.length - failed.length;
  lines.push(
    '',
    `${passCount}/${sorted.length} passed, ${failed.length} failed`
  );
  return lines.join('\n');
}

async function writeSummary(
  outDir: string,
  results: readonly TownResult[]
): Promise<void> {
  const summary = formatSummary(results);
  console.log(`\n${summary}`);
  await writeFile(join(outDir, 'qa-summary.txt'), `${summary}\n`);
  await writeFile(
    join(outDir, 'qa-results.json'),
    `${JSON.stringify(results, null, 2)}\n`
  );
}

// Rebuild the summary + results for a completed run, adding each town's
// report.html link, without re-triggering any pipelines. Reads the job numbers
// recorded in qa-results.json and fetches their artifacts.
async function refreshSummary(
  outDir: string,
  projectSlug: string,
  token: string
): Promise<number> {
  const resultsPath = join(outDir, 'qa-results.json');
  if (!existsSync(resultsPath)) {
    console.error(`No qa-results.json found in ${outDir}`);
    return 1;
  }
  const results = JSON.parse(readFileSync(resultsPath, 'utf8')) as TownResult[];
  console.log(`Refreshing report links for ${results.length} town(s)...`);
  for (const result of results) {
    const jobNumbers = result.jobs
      .map((job) => job.match(/\/jobs\/(\d+)/)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number);
    const artifacts = await fetchArtifacts(jobNumbers, projectSlug, token);
    result.reportUrl = reportUrlOf(artifacts);
    console.log(
      `  ${result.reportUrl ? '✓' : '·'} ${result.town}${
        result.reportUrl ? '' : ' (no report artifact)'
      }`
    );
    await sleep(POLL_SPACING_MS);
  }
  await writeSummary(outDir, results);
  return 0;
}

const USAGE = `Usage: trigger_nh_qa_batch <out-dir> [--refresh] [--slug <gh/org/repo>] [--max-inflight <n>] [--trigger-delay-ms <ms>]

Triggers the vx-qa pipeline for every town package under <out-dir> (the output
of render_nh_election_package: <out-dir>/election-packages/<Town> - election-package-*.zip),
polling to completion. Writes <out-dir>/qa-summary.txt and qa-results.json, and
saves failing towns' run.log/report.html to
<out-dir>/election-packages/qa-report/<Town>/.

  --refresh            Don't trigger anything: rebuild qa-summary.txt /
                       qa-results.json from the existing qa-results.json,
                       adding each town's report.html link.
  --max-inflight <n>   Cap the number of pipelines running at once (default:
                       unbounded -- enqueue all and let CircleCI's queue limit
                       concurrency). Use this to avoid saturating shared CI.
  --trigger-delay-ms   Delay between trigger API calls (default ${TRIGGER_DELAY_MS}).

Env: AWS_S3_BUCKET_NAME, AWS_S3_REGION, AWS credentials, CIRCLECI_API_TOKEN.`;

export async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (!args) {
    console.error(USAGE);
    return 1;
  }

  const token = process.env.CIRCLECI_API_TOKEN;
  if (!token) {
    console.error('CIRCLECI_API_TOKEN must be set (VxQA Admin API token).');
    return 1;
  }

  if (args.refresh) {
    return refreshSummary(args.outDir, args.projectSlug, token);
  }

  const packages = discoverPackages(args.outDir);
  if (packages.length === 0) {
    console.error(`No election packages found under ${args.outDir}`);
    return 1;
  }
  const cap = Number.isFinite(args.maxInflight)
    ? `${args.maxInflight} at a time`
    : 'all at once';
  console.log(`QA-ing ${packages.length} town package(s) (${cap})...\n`);

  const { results: polled, failedTowns } = await runBatch(
    packages,
    token,
    args.projectSlug,
    args.triggerDelayMs,
    args.maxInflight
  );

  const results: TownResult[] = [
    ...polled,
    ...failedTowns.map((town) => ({
      town,
      status: 'enqueue-failed',
      passed: false,
      pipelineUrl: '(not triggered)',
      jobs: [],
    })),
  ];

  await writeSummary(args.outDir, results);

  return results.every((r) => r.passed) ? 0 : 1;
}

/* istanbul ignore next */
if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
